/* LiteBox v5 · tools/tax.js — 个税五险一金计算器（Step 17 深度重构）
   月薪 + 年终奖全流程：城市社保上下限预设、比例可调五险一金、
   专项附加扣除（折叠区）、年度累计预扣、年终奖单独/合并计税对比、逐月明细。
   红线：复制走 LB.copyNow；无 !important；无内联样式；颜色一律变量。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  /* ================= 城市预设表（Step 17 A1.1，写死在 tax.js） ================= */
  const CITIES = {
    beijing:   { name: '北京',   socialMin: 6821, socialMax: 35283, fundMax: 35283, fundDefault: 12 },
    shanghai:  { name: '上海',   socialMin: 7384, socialMax: 36921, fundMax: 36921, fundDefault: 7 },
    shenzhen:  { name: '深圳',   socialMin: 2360, socialMax: 27927, fundMax: 27927, fundDefault: 5 },
    guangzhou: { name: '广州',   socialMin: 2300, socialMax: 27234, fundMax: 27234, fundDefault: 5 },
    hangzhou:  { name: '杭州',   socialMin: 4462, socialMax: 24675, fundMax: 24675, fundDefault: 12 },
    chengdu:   { name: '成都',   socialMin: 4246, socialMax: 22278, fundMax: 22278, fundDefault: 6 },
    xian:      { name: '西安',   socialMin: 4112, socialMax: 21564, fundMax: 21564, fundDefault: 5 },
    other:     { name: '其他',   socialMin: 0,    socialMax: 0,     fundMax: 0,     fundDefault: 12 }
  };

  /* 综合所得税率表（年度累计预扣用） */
  const BRACKETS = [
    { cap: 36000,    rate: 0.03, deduct: 0 },
    { cap: 144000,   rate: 0.10, deduct: 2520 },
    { cap: 300000,   rate: 0.20, deduct: 16920 },
    { cap: 420000,   rate: 0.25, deduct: 31920 },
    { cap: 660000,   rate: 0.30, deduct: 52920 },
    { cap: 960000,   rate: 0.35, deduct: 85920 },
    { cap: Infinity, rate: 0.45, deduct: 181920 }
  ];

  /* 年终奖单独计税：按（年终奖 ÷ 12）找税率，用月度税率表
     —— 划分点与速算扣除数都与年度表不同，不能混用 */
  const BONUS_BRACKETS = [
    { cap: 3000,     rate: 0.03, deduct: 0 },
    { cap: 12000,    rate: 0.10, deduct: 210 },
    { cap: 25000,    rate: 0.20, deduct: 1410 },
    { cap: 35000,    rate: 0.25, deduct: 2660 },
    { cap: 55000,    rate: 0.30, deduct: 4410 },
    { cap: 80000,    rate: 0.35, deduct: 7160 },
    { cap: Infinity, rate: 0.45, deduct: 15160 }
  ];

  const fmtMoney = n => (n < 0 ? '-' : '') + '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMoney0 = n => (n < 0 ? '-' : '') + '¥' + Math.abs(Math.round(n)).toLocaleString('zh-CN');
  const fmtPct = n => (n * 100).toFixed(2) + '%';

  function findBracket(list, v) {
    for (const b of list) { if (v <= b.cap) return b; }
    return list[list.length - 1];
  }

  function calcTaxByBracket(taxable) {
    if (!(taxable > 0)) return 0;
    const b = findBracket(BRACKETS, taxable);
    return taxable * b.rate - b.deduct;
  }

  /* 年终奖单独计税：应缴 = 年终奖 × 税率 − 速算扣除数（月度表） */
  function calcBonusSeparate(bonus) {
    if (!(bonus > 0)) return { tax: 0, rate: 0 };
    const b = findBracket(BONUS_BRACKETS, bonus / 12);
    return { tax: bonus * b.rate - b.deduct, rate: b.rate };
  }

  /* 单月：五险一金 + 当月应纳税所得额 */
  function calcMonthly(salary, socialBase, fundBase, rates, extraDeduct) {
    const social = socialBase * (rates.pension + rates.medical + rates.unemployment) / 100;
    const fund = fundBase * rates.fund / 100;
    const taxable = Math.max(0, salary - social - fund - 5000 - extraDeduct);
    return { social, fund, taxable };
  }

  /* 年度累计预扣法（工资部分）：逐月累计应纳税所得额 → 累计应纳税额 → 当月 = 累计差值 */
  function calcAnnual(salary, socialBase, fundBase, rates, extraDeduct) {
    let cumTaxable = 0, cumTax = 0;
    const rows = [];
    for (let m = 1; m <= 12; m++) {
      const { social, fund, taxable } = calcMonthly(salary, socialBase, fundBase, rates, extraDeduct);
      cumTaxable += taxable;
      const cumTaxDue = calcTaxByBracket(cumTaxable);
      const monthlyTax = Math.max(0, cumTaxDue - cumTax);
      cumTax += monthlyTax;
      rows.push({
        month: m, salary, social: social + fund, taxable,
        cumTaxable, monthlyTax, cumTax,
        netIncome: salary - social - fund - monthlyTax
      });
    }
    return { rows, totalTax: cumTax, annualTaxable: cumTaxable };
  }

  /* ================= 状态 ================= */
  let rootEl = null;
  let dirtyBase = { social: false, fund: false }; /* 基数被手动改过就不再自动跟随月薪 */
  let last = null;                                /* 最近一次计算结果（复制摘要 / 打印用） */

  /* 城市切换/月薪联动：基数默认 = min(max(月薪, socialMin), socialMax)（上限 0 = 不设限） */
  function clampBase(salary, city, isFund) {
    const max = isFund ? city.fundMax : city.socialMax;
    if (!max) return salary;
    return Math.min(Math.max(salary, city.socialMin), max);
  }

  function autofillBase(force) {
    const salary = parseFloat($('#txSalary', rootEl).value) || 0;
    const city = CITIES[$('#txCity', rootEl).value] || CITIES.other;
    if (force || !dirtyBase.social) $('#txSocialBase', rootEl).value = Math.round(clampBase(salary, city, false));
    if (force || !dirtyBase.fund) $('#txFundBase', rootEl).value = Math.round(clampBase(salary, city, true));
  }

  function onCityChange() {
    const city = CITIES[$('#txCity', rootEl).value] || CITIES.other;
    autofillBase(true);
    $('#txFundRate', rootEl).value = city.fundDefault; /* 公积金比例自动填默认值，用户可改 */
  }

  /* 专项附加扣除（月）：大病医疗为年度累计输入，自动按月均摊 */
  const EXTRA_FIELDS = [
    ['txExtChild', '子女教育', '每孩每月 2000'],
    ['txExtInfant', '婴幼儿照护', '每孩每月 2000'],
    ['txExtEdu', '继续教育', '学历 400 / 职业资格 300'],
    ['txExtHouseLoan', '住房贷款利息', '首套最多 1000'],
    ['txExtRent', '住房租金', '1500 / 1100 / 800'],
    ['txExtElder', '赡养老人', '独生 3000 / 分摊 ≤1500'],
    ['txExtMedical', '大病医疗（年度累计）', '年度自付累计']
  ];

  function readExtra() {
    const v = id => parseFloat($('#' + id, rootEl).value) || 0;
    const medicalYear = v('txExtMedical');
    return {
      list: EXTRA_FIELDS.map(f => ({ name: f[1], value: f[0] === 'txExtMedical' ? medicalYear : v(f[0]), perMonth: f[0] === 'txExtMedical' ? medicalYear / 12 : v(f[0]) })),
      total: EXTRA_FIELDS.reduce((s, f) => s + (f[0] === 'txExtMedical' ? medicalYear / 12 : v(f[0])), 0),
      medicalYear
    };
  }

  function refreshExtraSum() {
    const extra = readExtra();
    const el = $('#txExtraSum', rootEl);
    if (el) el.textContent = fmtMoney(extra.total);
  }

  function readInputs() {
    return {
      salary: parseFloat($('#txSalary', rootEl).value) || 0,
      bonus: parseFloat($('#txBonus', rootEl).value) || 0,
      cityKey: $('#txCity', rootEl).value,
      city: CITIES[$('#txCity', rootEl).value] || CITIES.other,
      socialBase: parseFloat($('#txSocialBase', rootEl).value) || 0,
      fundBase: parseFloat($('#txFundBase', rootEl).value) || 0,
      rates: {
        pension: parseFloat($('#txPension', rootEl).value) || 0,
        medical: parseFloat($('#txMedical', rootEl).value) || 0,
        unemployment: parseFloat($('#txUnemployment', rootEl).value) || 0,
        fund: parseFloat($('#txFundRate', rootEl).value) || 0
      },
      extra: readExtra()
    };
  }

  /* ================= 计算 + 渲染 ================= */
  function run() {
    const inp = readInputs();
    if (!(inp.salary > 0)) { LB.toast('请填写有效的月税前工资', 'info'); return; }

    const m = calcMonthly(inp.salary, inp.socialBase, inp.fundBase, inp.rates, inp.extra.total);
    const annual = calcAnnual(inp.salary, inp.socialBase, inp.fundBase, inp.rates, inp.extra.total);

    /* 年终奖两种计税方式对比 */
    const bonusSep = calcBonusSeparate(inp.bonus);
    const taxSeparate = annual.totalTax + bonusSep.tax;
    const mergedTaxable = annual.annualTaxable + inp.bonus;
    const taxMerged = calcTaxByBracket(mergedTaxable);
    const mergedRate = mergedTaxable > 0 ? findBracket(BRACKETS, mergedTaxable).rate : 0;
    const useSeparate = taxSeparate <= taxMerged;
    const diff = Math.abs(taxSeparate - taxMerged);

    const yearIns = (m.social + m.fund) * 12;
    const totalIncome = inp.salary * 12 + inp.bonus;
    const bestTax = useSeparate ? taxSeparate : taxMerged;
    const net = totalIncome - yearIns - bestTax;

    last = { inp, m, annual, bonusSep, taxSeparate, taxMerged, mergedTaxable, mergedRate, useSeparate, diff, yearIns, totalIncome, bestTax, net, burden: totalIncome > 0 ? bestTax / totalIncome : 0 };
    render(last);
  }

  function resCard(lab, val) {
    return '<div class="res-card"><div class="rc-lab">' + lab + '</div><div class="rc-val">' + val + '</div></div>';
  }

  function render(r) {
    /* —— 年度汇总 4 卡 —— */
    $('#txCards', rootEl).innerHTML =
      resCard('全年税前总收入', fmtMoney(r.totalIncome)) +
      resCard('全年到手', fmtMoney(r.net)) +
      resCard('全年个税（按推荐方案）', fmtMoney(r.bestTax)) +
      resCard('综合税负率', fmtPct(r.burden));

    /* —— 年终奖计税对比 —— */
    const box = $('#txBonusBox', rootEl);
    if (r.inp.bonus > 0) {
      const sepBest = r.useSeparate;
      const plan = (name, best, badge, main, desc) =>
        '<div class="tx-plan' + (best ? ' is-best' : '') + '">' +
        '<div class="tx-plan-h"><b>' + name + '</b>' +
        (badge ? '<span class="tx-badge' + (best ? '' : ' bad') + '">' + badge + '</span>' : '') +
        '</div>' +
        '<div class="tx-plan-val">' + main + '</div>' +
        '<div class="tx-plan-d">' + desc + '</div>' +
        '</div>';
      box.innerHTML =
        '<span class="tool-lab">年终奖计税对比</span>' +
        '<div class="tx-vs">' +
        plan('单独计税', sepBest, sepBest ? '推荐' : '不推荐', fmtMoney(r.taxSeparate),
          '工资个税 ' + fmtMoney(r.annual.totalTax) + ' + 年终奖 ' + fmtMoney(r.bonusSep.tax) +
          '（税率 ' + fmtPct(r.bonusSep.rate) + '）') +
        plan('合并计税', !sepBest, !sepBest ? '推荐' : '不推荐', fmtMoney(r.taxMerged),
          '年终奖并入综合所得，全年应纳税所得额 ' + fmtMoney(r.mergedTaxable) +
          '（适用税率 ' + fmtPct(r.mergedRate) + '）') +
        '</div>' +
        (r.diff > 0.005
          ? '<div class="tx-vs-diff">💡 两种方式相差 <b>' + fmtMoney(r.diff) + '</b>，推荐「<b>' + (sepBest ? '单独计税' : '合并计税') + '</b>」，全年可少缴 <b>' + fmtMoney(r.diff) + '</b>。</div>'
          : '<div class="tx-vs-diff">两种计税方式全年个税相同，任选其一即可。</div>');
      box.hidden = false;
    } else {
      box.hidden = true;
      box.innerHTML = '';
    }

    /* —— 月度累计预扣明细（12 行） —— */
    $('#txBody', rootEl).innerHTML = r.annual.rows.map(w =>
      '<tr><td>' + w.month + ' 月</td><td>' + fmtMoney(w.salary) + '</td><td>' + fmtMoney(w.social) +
      '</td><td>' + fmtMoney(w.cumTaxable) + '</td><td>' + fmtMoney(w.monthlyTax) +
      '</td><td>' + fmtMoney(w.cumTax) + '</td><td>' + fmtMoney(w.netIncome) + '</td></tr>'
    ).join('');

    $('#txResult', rootEl).hidden = false;
    LB.replay($('#txResult', rootEl), 'lb-scale-in');
  }

  /* ================= 复制摘要（LB.copyNow） ================= */
  function buildSummary() {
    const r = last;
    if (!r) return '';
    const i = r.inp;
    const L = [];
    L.push('【个税五险一金 · 计算摘要】');
    L.push('—— 输入 ——');
    L.push('月税前工资：' + fmtMoney0(i.salary));
    L.push('年终奖：' + fmtMoney0(i.bonus));
    L.push('城市：' + i.city.name + '（社保基数 ' + (i.city.socialMax ? i.city.socialMin.toLocaleString() + ' ~ ' + i.city.socialMax.toLocaleString() : '不设上限') + '）');
    L.push('社保基数：' + fmtMoney0(i.socialBase) + ' · 公积金基数：' + fmtMoney0(i.fundBase));
    L.push('个人比例：养老 ' + i.rates.pension + '% · 医疗 ' + i.rates.medical + '% · 失业 ' + i.rates.unemployment + '% · 公积金 ' + i.rates.fund + '%');
    L.push('专项附加扣除：合计 ' + fmtMoney(i.extra.total) + '/月' + (i.extra.medicalYear > 0 ? '（含大病医疗年度 ' + fmtMoney0(i.extra.medicalYear) + ' 月均摊）' : ''));
    L.push('—— 年度汇总 ——');
    L.push('全年税前总收入：' + fmtMoney(r.totalIncome));
    L.push('全年五险一金（个人）：' + fmtMoney(r.yearIns));
    L.push('全年到手：' + fmtMoney(r.net));
    L.push('全年个税（按推荐方案）：' + fmtMoney(r.bestTax));
    L.push('综合税负率：' + fmtPct(r.burden));
    if (i.bonus > 0) {
      L.push('—— 年终奖计税对比 ——');
      L.push('单独计税：全年个税 ' + fmtMoney(r.taxSeparate) + '（年终奖部分 ' + fmtMoney(r.bonusSep.tax) + '，税率 ' + fmtPct(r.bonusSep.rate) + '）');
      L.push('合并计税：全年个税 ' + fmtMoney(r.taxMerged));
      if (r.diff > 0.005) L.push('差异：' + fmtMoney(r.diff) + ' → 推荐' + (r.useSeparate ? '单独计税' : '合并计税'));
      else L.push('两种方式税额相同');
    }
    L.push('—— 月度累计预扣（工资部分） ——');
    r.annual.rows.forEach(w => {
      L.push(w.month + '月：税前 ' + fmtMoney(w.salary) + ' · 五险一金 ' + fmtMoney(w.social) + ' · 累计应纳税所得额 ' + fmtMoney(w.cumTaxable) + ' · 当月个税 ' + fmtMoney(w.monthlyTax) + ' · 累计个税 ' + fmtMoney(w.cumTax) + ' · 当月到手 ' + fmtMoney(w.netIncome));
    });
    L.push('计算结果仅供参考，实际以当地社保局与税务局核定为准。');
    return L.join('\n');
  }

  function copySummary() {
    if (!last) { LB.toast('请先点击「计算」生成结果', 'info'); return; }
    LB.copyNow(buildSummary(), '摘要已复制到剪贴板');
  }

  /* ================= 打印 ================= */
  function beforePrint() {
    const d = $('#txDetailBox', rootEl);
    if (d) d.open = true; /* 收起状态打印不出表格，打印前自动展开 */
  }

  function printResult() {
    if (!last) { LB.toast('请先点击「计算」生成结果', 'info'); return; }
    beforePrint();
    window.print();
  }

  /* ================= HTML ================= */
  function html() {
    const cityOpts = Object.keys(CITIES).map(k =>
      '<option value="' + k + '"' + (k === 'beijing' ? ' selected' : '') + '>' + CITIES[k].name + '</option>'
    ).join('');
    const rateRow = (name, id, val) =>
      '<div class="tx-rate-row"><span class="tx-rate-name">' + name + '</span>' +
      '<input class="inp" id="' + id + '" type="number" min="0" max="30" step="0.1" value="' + val + '" />' +
      '<span class="tx-unit">%</span></div>';
    const extraRow = f =>
      '<div class="tx-extra-row"><span class="tx-extra-name">' + f[1] + '</span>' +
      '<input class="inp" id="' + f[0] + '" type="number" min="0" placeholder="' + f[2] + '" /></div>';

    /* Step 17：包一层 #page-tax 供 @media print 精确选择打印区域（同 resume 的做法） */
    return '<div id="page-tax">' +
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>个税五险一金</h1><p>月薪年终奖全流程，累计预扣与年终奖两种计税对比</p></div>' +
      '</div>' +
      '<div class="tool-body">' +

      /* 区块 1 · 基本信息 */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">基本信息</span>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">月税前工资（元）<input class="inp" id="txSalary" type="number" min="0" value="20000" /></label>' +
      '<label class="pz-lab">年终奖（元）<input class="inp" id="txBonus" type="number" min="0" value="30000" /></label>' +
      '<label class="pz-lab">城市<select class="inp" id="txCity">' + cityOpts + '</select></label>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">社保基数（元）<input class="inp" id="txSocialBase" type="number" min="0" value="20000" /></label>' +
      '<label class="pz-lab">公积金基数（元）<input class="inp" id="txFundBase" type="number" min="0" value="20000" /></label>' +
      '</div>' +
      '<div class="tip-dim">基数默认随城市上下限自动带出，可手动修改。</div>' +
      '</div>' +

      /* 区块 2 · 五险一金（个人比例） */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">五险一金（个人比例，可改）</span>' +
      '<div class="tx-rates">' +
      rateRow('养老保险', 'txPension', 8) +
      rateRow('医疗保险', 'txMedical', 2) +
      rateRow('失业保险', 'txUnemployment', 0.5) +
      rateRow('住房公积金', 'txFundRate', 12) +
      '</div>' +
      '</div>' +

      /* 区块 3 · 专项附加扣除（月，默认收起） */
      '<details class="card tool-sec set-card set-details" id="txExtraBox">' +
      '<summary>专项附加扣除（月）</summary>' +
      '<div class="tx-extra">' + EXTRA_FIELDS.map(extraRow).join('') + '</div>' +
      '<div class="tx-extra-sum"><span>合计 <b id="txExtraSum">¥0.00</b> 元/月</span>' +
      '<span class="tx-extra-tip">大病医疗按年度累计输入，自动按月均摊</span></div>' +
      '</details>' +

      '<button class="btn btn-main js-primary-submit" id="txGo" type="button">🧾 计算</button>' +

      /* 结果区 */
      '<div id="txResult" hidden>' +
      '<span class="tool-lab">年度汇总</span>' +
      '<div class="res-grid" id="txCards"></div>' +
      '<div id="txBonusBox" hidden></div>' +
      '<details class="card tool-sec set-card set-details" id="txDetailBox">' +
      '<summary>月度累计预扣明细（12 个月）</summary>' +
      '<div class="ln-wrap"><table class="ln-tbl"><thead><tr>' +
      '<th>月份</th><th>税前收入</th><th>五险一金</th><th>累计应纳税所得额</th><th>当月个税</th><th>累计个税</th><th>当月到手</th>' +
      '</tr></thead><tbody id="txBody"></tbody></table></div>' +
      '</details>' +
      '</div>' +

      /* 底部按钮 */
      '<div class="tx-actions">' +
      '<button class="btn btn-ghost" id="txCopy" type="button">📋 复制摘要</button>' +
      '<button class="btn btn-ghost" id="txPrint" type="button">🖨️ 打印</button>' +
      '</div>' +

      '<p class="cd-note">个税按年度累计预扣法估算（起征点 5000/月）；年终奖单独计税按月度税率表，也可并入综合所得。各地社保上下限与比例每年调整，以当地公布为准。</p>' +
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">计算结果仅供参考，实际以当地社保局与税务局核定为准。</span></div>' +
      '</div>' +
      '</div>';
  }

  /* ================= 生命周期 ================= */
  function mount(root) {
    rootEl = root;
    dirtyBase = { social: false, fund: false };
    last = null;
    root.innerHTML = html();

    $('#txGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#txCity', root).addEventListener('change', onCityChange);
    $('#txSalary', root).addEventListener('input', () => autofillBase(false));
    ['#txSocialBase', '#txFundBase'].forEach((sel, idx) => {
      $(sel, root).addEventListener('input', () => { dirtyBase[idx === 0 ? 'social' : 'fund'] = true; });
    });
    EXTRA_FIELDS.forEach(f => $('#' + f[0], root).addEventListener('input', refreshExtraSum));
    $('#txCopy', root).addEventListener('click', copySummary);
    $('#txPrint', root).addEventListener('click', printResult);
    ['txSalary', 'txBonus'].forEach(id => {
      const el = $('#' + id, root);
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    window.addEventListener('beforeprint', beforePrint);
  }

  function unmount() {
    window.removeEventListener('beforeprint', beforePrint);
    rootEl = null;
    last = null;
  }

  LB.router.register('tax', { mount, unmount });
})();
