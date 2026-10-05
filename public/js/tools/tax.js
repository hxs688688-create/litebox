/* LiteBox v5 · tools/tax.js — 个税五险一金估算（固定比例五险 + 年度累进税率表月均反推） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  /* 年度综合所得累进税率表：taxable ≤ 上限 → [税率, 速算扣除数] */
  const BRACKETS = [
    [36000, 0.03, 0],
    [144000, 0.10, 2520],
    [300000, 0.20, 16920],
    [420000, 0.25, 31920],
    [660000, 0.30, 52920],
    [960000, 0.35, 85920],
    [Infinity, 0.45, 181920]
  ];
  /* 个人 / 单位缴纳比例 */
  const SELF = [['养老保险（8%）', 0.08], ['医疗保险（2%）', 0.02], ['失业保险（0.5%）', 0.005], ['住房公积金（12%）', 0.12]];
  const COMPANY_RATE = 0.16 + 0.08 + 0.005 + 0.005 + 0.12;

  const fmtMoney = n => (n < 0 ? '-' : '') + '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function calc(salary, base, extra) {
    const items = SELF.map(([lab, r]) => [lab, base * r]);
    const insurance = items.reduce((s, it) => s + it[1], 0);

    /* 月度应纳税所得额 → 年化查累进表 → 月均 */
    const monthly = salary - insurance - 5000 - extra;
    let tax = 0;
    if (monthly > 0) {
      const annual = monthly * 12;
      const bk = BRACKETS.find(b => annual <= b[0]);
      tax = (annual * bk[1] - bk[2]) / 12;
    }

    return { items, insurance, tax, net: salary - insurance - tax, company: base * COMPANY_RATE };
  }

  function run() {
    const salary = parseFloat($('#txSalary', rootEl).value);
    const extra = parseFloat($('#txExtra', rootEl).value) || 0;
    const baseVal = $('#txBase', rootEl).value.trim();
    if (!(salary > 0)) { LB.toast('请填写有效的税前月薪', 'info'); return; }
    const base = baseVal === '' ? salary : (parseFloat(baseVal) || 0);

    const r = calc(salary, base, extra);
    const row = (lab, val, cls) => '<div class="tax-row' + (cls ? ' ' + cls : '') + '"><span>' + lab + '</span><b>' + val + '</b></div>';

    $('#txRows', rootEl).innerHTML =
      row('税前月薪', fmtMoney(salary)) +
      r.items.map(it => row(it[0], fmtMoney(-it[1]))).join('') +
      row('个人所得税', fmtMoney(-r.tax)) +
      row('到手工资', fmtMoney(r.net), 'main') +
      row('社保公积金合计', fmtMoney(r.insurance)) +
      row('单位承担五险一金', fmtMoney(r.company)) +
      '';
    $('#txRows', rootEl).hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>个税五险一金</h1><p>税前税后换算，五险一金明细与到手工资估算</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<label class="pz-lab">税前月薪（元）<input class="inp" id="txSalary" type="number" min="0" value="10000" /></label>' +
      '<label class="pz-lab">社保公积金基数（元，留空按工资）<input class="inp" id="txBase" type="number" min="0" placeholder="默认等于月薪" /></label>' +
      '<label class="pz-lab">专项附加扣除（元/月）<input class="inp" id="txExtra" type="number" min="0" value="0" /></label>' +
      '<button class="btn btn-main js-primary-submit" id="txGo" type="button">🧾 计算到手工资</button>' +
      '</div>' +
      '<div class="card tax-rows" id="txRows" hidden></div>' +
      '<p class="cd-note">按常见比例估算（个人养老 8% / 医疗 2% / 失业 0.5% / 公积金 12%，个税按年度累进税率表月均反推），各地政策与公积金比例略有差异，实际以当地社保局为准。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">计算结果仅供参考，实际以当地社保局与税务局为准。</span></div>' +
      '</div>'
    );
  }

  let rootEl = null;

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#txGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('tax', { mount, unmount });
})();
