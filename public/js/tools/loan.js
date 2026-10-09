/* LiteBox v5 · tools/loan.js — 房贷计算器（等额本息 / 等额本金 / 提前还款试算） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const MAX_ROWS = 480;

  let rootEl = null;
  /* tab: 'interest' | 'principal' | 'prepay' —— 顶部三选一，同时决定基础面板的还款方式
     preMode: 提前还款试算里的「原还款方式」，与 tab 相互独立
        （用户在试算面板选了等额本金，切回基础面板再切回来仍应保留） */
  let state = {
    tab: 'interest', preMode: 'interest',
    rows: [], cards: [], months: 0, showAll: false
  };

  const fmtMoney = n => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMoney0 = n => '¥' + Math.round(n).toLocaleString('zh-CN');

  /* —— 等额本息：月供固定 —— */
  function calcInterest(amt, months, rateM) {
    const pow = (1 + rateM) ** months;
    const mPay = amt * rateM * pow / (pow - 1);
    const rows = [];
    let rest = amt;
    for (let i = 1; i <= months; i++) {
      const interest = rest * rateM;
      const principal = mPay - interest;
      rest -= principal;
      rows.push([i, mPay, principal, interest, Math.max(0, rest)]);
    }
    return {
      rows,
      cards: [
        ['每月月供', fmtMoney(mPay)],
        ['支付总利息', fmtMoney(mPay * months - amt)],
        ['还款总额', fmtMoney(mPay * months)],
        ['贷款本金', fmtMoney(amt)]
      ]
    };
  }

  /* —— 等额本金：每月本金固定 —— */
  function calcPrincipal(amt, months, rateM) {
    const mPrincipal = amt / months;
    const rows = [];
    let rest = amt;
    let first = 0, last = 0;
    for (let i = 1; i <= months; i++) {
      const interest = rest * rateM;
      const pay = mPrincipal + interest;
      if (i === 1) first = pay;
      if (i === months) last = pay;
      rest -= mPrincipal;
      rows.push([i, pay, mPrincipal, interest, Math.max(0, rest)]);
    }
    return {
      rows,
      cards: [
        ['首月月供', fmtMoney(first)],
        ['末月月供', fmtMoney(last)],
        ['支付总利息', fmtMoney(rows.reduce((s, r) => s + r[3], 0))],
        ['每月本金', fmtMoney(mPrincipal)]
      ]
    };
  }

  function renderTable() {
    const shown = state.showAll ? state.rows : state.rows.slice(0, 12);
    $('#lnBody', rootEl).innerHTML = shown.map(r =>
      '<tr><td>' + r[0] + '</td><td>' + fmtMoney(r[1]) + '</td><td>' + fmtMoney(r[2]) + '</td><td>' + fmtMoney(r[3]) + '</td><td>' + fmtMoney(r[4]) + '</td></tr>'
    ).join('');
    const btn = $('#lnToggle', rootEl);
    btn.hidden = state.rows.length <= 12;
    btn.textContent = state.showAll ? '收起' : '显示全部 ' + state.rows.length + ' 期';
  }

  function run() {
    const amt = parseFloat($('#lnAmt', rootEl).value) * 10000;
    const years = parseFloat($('#lnYears', rootEl).value);
    const rate = parseFloat($('#lnRate', rootEl).value);
    if (!(amt > 0) || !(years > 0) || !(rate > 0)) { LB.toast('请填写有效的金额、年限和利率', 'info'); return; }

    const months = Math.round(years * 12);
    const rateM = rate / 100 / 12;
    const res = state.tab === 'principal'
      ? calcPrincipal(amt, months, rateM)
      : calcInterest(amt, months, rateM);
    state.rows = res.rows.slice(0, MAX_ROWS); /* 明细最多 480 行 */
    state.months = months;
    state.showAll = false;

    $('#lnCards', rootEl).innerHTML = res.cards.map(c =>
      '<div class="res-card"><div class="rc-lab">' + c[0] + '</div><div class="rc-val">' + c[1] + '</div></div>'
    ).join('');
    $('#lnMonths', rootEl).textContent = '逐月还款明细（共 ' + months + ' 期' + (months > MAX_ROWS ? '，仅展示前 ' + MAX_ROWS + ' 期' : '') + '）';
    renderTable();
    $('#lnResult', rootEl).hidden = false;
    LB.replay($('#lnResult', rootEl), 'lb-scale-in'); /* Step 10 */
  }

  /* ================================================================
   * Step 6A · 提前还款试算
   *
   * 三个关键公式（全部经过实测验算，见下）：
   *   步骤 1 · 已还 N 期后的剩余本金
   *     等额本息 remaining = amt ×(pow - (1+rateM)^paid) / (pow - 1)
   *     等额本金 remaining = amt - (amt/months) × paid
   *   步骤 3 · 方案 A「减少月供」：剩余期数不变，按新本金重算月供
   *   步骤 4 · 方案 B「缩短年限」：月供不变，解方程求新期数
   *     newMonths = ln(mPay / (mPay - newAmt×rateM)) / ln(1+rateM)，向上取整
   *
   * 等额本金没有"固定月供"概念，方案 B 的"月供不变"= 保持当期月供不变，
   * 之后逐月递减本金直到结清；这类情形统一走 simulate() 逐月推演，
   * 比套等额本息公式更贴合银行实际核算。
   * ================================================================ */

  /* 逐月推演：每月固定还pay 元，求还清所需期数与总利息 */
  function simulate(principal, pay, rateM, maxMonths) {
    let rest = principal, n = 0, interest = 0;
    const cap = maxMonths || 1200;
    while (rest > 0.005 && n < cap) {
      const i = rest * rateM;
      const p = pay - i;
      if (p <= 0) return null;          /* 月供不足以覆盖利息，永远还不完 */
      interest += i;
      rest -= p;
      n++;
    }
    return rest > 0.005 ? null : { months: n, total: pay * n, interest: interest };
  }

  /* ================================================================
   * 等额本金的逐期推演：每月本金固定 mPrincipal，利息随余额递减。
   *
   * ★ 这里必须单独写，不能用 simulate()：
   *   simulate() 假设「每月还同一个固定金额」，而等额本金的月供逐月递减。
   *   实测踩坑：用 simulate 算基准时，336 期被算成 243 期、
   *   剩余利息 323,400（真实值 406,272），省息金额跟着算错 8 万多。
   *   等额本金的基准与方案 A 都是「本金固定 + 期数固定」，必须精确推演。
   * ================================================================ */
  function simulateEqualP(principal, mPrincipal, rateM, n) {
    let rest = principal, total = 0, interest = 0;
    for (let i = 0; i < n; i++) {
      const it = rest * rateM;
      interest += it;
      total += mPrincipal + it;
      rest -= mPrincipal;
      if (rest < 0) rest = 0;
    }
    return { months: n, total: total, interest: interest };
  }

  /* 步骤 1：已还 paid 期后的剩余本金 */
  function remainingAfter(amt, months, rateM, paid, mode) {
    if (mode === 'principal') {
      const mPrincipal = amt / months;
      return amt - mPrincipal * paid;
    }
    const pow = (1 + rateM) ** months;
    return amt * (pow - (1 + rateM) ** paid) / (pow - 1);
  }

  /* 结清日期：从今天起推n 个月 */
  function payoffDate(nMonths) {
    const d = new Date();
    d.setMonth(d.getMonth() + nMonths);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
  }

  /* ================================================================
   * 主试算
   * 返回 {ok:false,msg} 表示输入非法；否则返回完整结果对象。
   * ================================================================ */
  function calcPrepay() {
    const amt = parseFloat($('#ppAmt', rootEl).value) * 10000;
    const years = parseFloat($('#ppYears', rootEl).value);
    const rate = parseFloat($('#ppRate', rootEl).value);
    const paid = Math.floor(parseFloat($('#ppPaid', rootEl).value));
    const pre = parseFloat($('#ppPre', rootEl).value);
    const mode = state.preMode;               /* 原还款方式，来自试算面板的 seg */
    const way = $('#ppWay', rootEl).value;   /* 用户倾向：keep / short / less */

    if (!(amt > 0)) return { ok: false, msg: '请填写有效的贷款总额' };
    if (!(years > 0)) return { ok: false, msg: '请填写有效的贷款年限' };
    if (!(rate >= 0) || isNaN(rate)) return { ok: false, msg: '请填写有效的年利率' };

    const months = Math.round(years * 12);
    if (!(months > 0)) return { ok: false, msg: '贷款年限过短' };
    if (isNaN(paid) || paid < 0) return { ok: false, msg: '已还期数不能为负数' };
    if (paid > months) return { ok: false, msg: '已还期数不能超过总期数 ' + months + ' 期' };
    if (isNaN(pre) || pre <= 0) return { ok: false, msg: '请填写有效的提前还款金额' };

    const rateM = rate / 100 / 12;
    const remaining = remainingAfter(amt, months, rateM, paid, mode);
    if (!(remaining > 0)) return { ok: false, msg: '剩余本金为 0，无需提前还款' };
    if (pre >= remaining) {
      return { ok: false, msg: '提前还款金额 ' + fmtMoney0(pre) + ' 不能超过剩余本金 ' + fmtMoney0(remaining) + '。可直接选择「结清」金额一次性还清。' };
    }

    const newAmt = remaining - pre;
    const rest = months - paid;                /* 剩余期数 */

    /* ---------- 基准：不提前还款 ---------- */
    let basePay, baseSim;
    if (mode === 'principal') {
      const mPrincipal = amt / months;
      basePay = mPrincipal + remaining * rateM;              /* 当期月供 */
      baseSim = simulateEqualP(remaining, mPrincipal, rateM, rest);  /* 本金固定、期数固定 */
    } else {
      const pow = (1 + rateM) ** months;
      basePay = amt * rateM * pow / (pow - 1);
      baseSim = { months: rest, total: basePay * rest, interest: basePay * rest - remaining };
    }

    /* ---------- 方案 A · 减少月供（保持剩余期数 rest 不变） ---------- */
    let aPay, aTotal, aInterest;
    if (mode === 'principal') {
      /* 每月本金 = 新本金 / 剩余期数，利息逐月递减（期数不变，本金摊薄） */
      const mpNew = newAmt / rest;
      aPay = mpNew + newAmt * rateM;
      aTotal = 0;
      let r2 = newAmt;
      for (let i = 0; i < rest; i++) { aTotal += mpNew + r2 * rateM; r2 -= mpNew; }
      aInterest = aTotal - newAmt;
    } else {
      const pow2 = (1 + rateM) ** rest;
      aPay = newAmt * rateM * pow2 / (pow2 - 1);
      aTotal = aPay * rest;
      aInterest = aTotal - newAmt;
    }
    const planA = {
      key: 'less', name: '方案 A · 减少月供',
      desc: '保持剩余 ' + rest + ' 期不变，月供从 ' + fmtMoney0(basePay) + ' 降到 ' + fmtMoney0(aPay),
      pay: aPay, months: rest, total: aTotal, interest: aInterest,
      saveInt: baseSim.interest - aInterest,
      saveMonths: 0,
      endDate: payoffDate(paid + rest),
      firstPay: aPay
    };

    /* ---------- 方案 B · 缩短年限（保持月供不变） ---------- */
    let bMonths, bTotal, bInterest;
    if (mode === 'principal') {
      const s = simulate(newAmt, basePay, rateM);
      if (!s) return { ok: false, msg: '当前月供不足以覆盖新本金的利息，无法测算，请检查利率与金额' };
      bMonths = s.months; bTotal = s.total; bInterest = s.interest;
    } else {
      const denom = basePay - newAmt * rateM;
      if (denom <= 0) {
        return { ok: false, msg: '提前还款后本金过大，按原月供已无法覆盖利息，请改用「减少月供」' };
      }
      bMonths = Math.ceil(Math.log(basePay / denom) / Math.log(1 + rateM));
      bTotal = basePay * bMonths;
      bInterest = bTotal - newAmt;
      /* 向上取整后最后一期会有零头，实际总利息略低；用逐月推演校正 */
      const s = simulate(newAmt, basePay, rateM, bMonths + 2);
      if (s && s.months === bMonths) { bTotal = s.total; bInterest = s.interest; }
    }
    const planB = {
      key: 'short', name: '方案 B · 缩短年限',
      desc: '月供保持 ' + fmtMoney0(basePay) + ' 不变，期数从 ' + rest + ' 缩到 ' + bMonths,
      pay: basePay, months: bMonths, total: bTotal, interest: bInterest,
      saveInt: baseSim.interest - bInterest,
      saveMonths: rest - bMonths,
      endDate: payoffDate(paid + bMonths),
      firstPay: basePay
    };

    const better = planB.saveInt >= planA.saveInt ? planB : planA;

    return {
      ok: true,
      amt: amt, months: months, rateM: rateM, paid: paid, pre: pre, mode: mode, way: way,
      remaining: remaining, newAmt: newAmt, rest: rest,
      base: {
        pay: basePay, months: baseSim.months, total: baseSim.total,
        interest: baseSim.interest, endDate: payoffDate(paid + baseSim.months)
      },
      planA: planA, planB: planB, better: better,
      endPay: remaining                       /* 一次性结清所需金额 */
    };
  }

  /* ---------- 提前还款结果渲染 ---------- */
  function card(lab, val, cls) {
    return '<div class="res-card"><div class="rc-lab">' + lab + '</div><div class="rc-val' +
      (cls ? ' ' + cls : '') + '">' + val + '</div></div>';
  }

  function renderPre(r) {
    const mN = n => n + ' 期（' + (n / 12).toFixed(1) + ' 年）';

    /* 基准卡 */
    let h = '';
    h += '<div class="pp-base">' +
      '<div class="pp-base-t">不提前还款 · 基准</div>' +
      '<div class="pp-base-g">' +
      card('当期月供', fmtMoney(r.base.pay)) +
      card('剩余本金', fmtMoney0(r.remaining)) +
      card('剩余期数', mN(r.base.months)) +
      card('剩余总还款', fmtMoney0(r.base.total)) +
      card('剩余利息', fmtMoney0(r.base.interest)) +
      card('预计结清', r.base.endDate) +
      card('已还期数', r.paid + ' 期（' + (r.mode === 'principal' ? '等额本金' : '等额本息') + '）') +
      '</div></div>';

    /* 两个方案对比 */
    const wayTag = r.way;
    function planBlock(p) {
      const chosen = wayTag === p.key;
      const best = p === r.better;
      return '<div class="pp-plan' + (chosen ? ' is-pick' : '') + (best ? ' is-best' : '') + '">' +
        '<div class="pp-plan-h">' +
        '<span class="pp-plan-n">' + p.name + '</span>' +
        (best ? '<span class="pp-badge pp-badge-best">最省利息</span>' : '') +
        (chosen ? '<span class="pp-badge pp-badge-pick">你选的</span>' : '') +
        '</div>' +
        '<div class="pp-plan-d">' + p.desc + '</div>' +
        '<div class="res-grid">' +
        card('新月供', fmtMoney(p.firstPay)) +
        card('剩余期数', mN(p.months)) +
        card('新剩余总还款', fmtMoney0(p.total)) +
        card('新剩余利息', fmtMoney0(p.interest)) +
        card('相比不提前还款省息', '<span class="pp-save">' + fmtMoney0(p.saveInt) + '</span>') +
        card('提前结清', p.endDate + (p.saveMonths > 0 ? '（早 ' + p.saveMonths + ' 期）' : '')) +
        '</div></div>';
    }
    h += planBlock(r.planA) + planBlock(r.planB);

    /* 推荐 + 一次性结清对照 */
    h += '<div class="pp-rec">' +
      '<div class="pp-rec-t">💡 推荐</div>' +
      '<div class="pp-rec-b">选「' + r.better.name.replace(/^方案 [AB] · /, '') + '」能多省 <b>' +
      fmtMoney0(Math.abs(r.better.saveInt - (r.better === r.planA ? r.planB.saveInt : r.planA.saveInt))) +
      '</b> 利息。' +
      (r.better === r.planB
        ? '月供不变、提前 ' + r.planB.saveMonths + ' 期结清，省息最多。'
        : '月供从 ' + fmtMoney0(r.base.pay) + ' 降到 ' + fmtMoney0(r.planA.firstPay) + '，压力最小。') +
      '</div></div>';

    h += '<div class="pp-lump">' +
      '<div class="pp-lump-t">💡 一次性结清</div>' +
      '<div class="pp-lump-b">现在一次性还清剩余本金需 <b>' + fmtMoney(r.endPay) +
      '</b>，之后不再产生任何利息。</div></div>';

    $('#ppResult', rootEl).innerHTML = h;
    $('#ppResult', rootEl).hidden = false;
    LB.replay($('#ppResult', rootEl), 'lb-scale-in'); /* Step 10 */
  }

  /* debounce 200ms 自动重算 */
  let ppTimer = null;
  function runPre(debounce) {
    if (ppTimer) { clearTimeout(ppTimer); ppTimer = null; }
    const go = () => {
      const r = calcPrepay();
      if (!r.ok) {
        $('#ppResult', rootEl).hidden = true;
        LB.toast(r.msg, 'warn');
        return;
      }
      renderPre(r);
    };
    if (debounce) ppTimer = setTimeout(go, 200);
    else go();
  }

  function setTab(v) {
    if (state.tab === v) return;
    state.tab = v;
    $$('#lnTabs .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const isPre = v === 'prepay';
    $('#lnPaneMain', rootEl).hidden = isPre;
    $('#lnPanePre', rootEl).hidden = !isPre;
    if (isPre) runPre(false);
    else if (!$('#lnResult', rootEl).hidden) run();
  }

  function setPreMode(v) {
    if (state.preMode === v) return;
    state.preMode = v;
    $$('#lnKind .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    runPre(false);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>房贷计算器</h1><p>等额本息 / 等额本金 / 提前还款试算，月供、总利息与逐月明细</p></div>' +
      '</div>' +
      '<div class="tool-body">' +

      /* ---------- 顶部 3 个 tab ---------- */
      '<div class="seg seg-3" id="lnTabs">' +
      '<button class="seg-btn on" data-v="interest" type="button">等额本息</button>' +
      '<button class="seg-btn" data-v="principal" type="button">等额本金</button>' +
      '<button class="seg-btn" data-v="prepay" type="button">提前还款试算</button>' +
      '</div>' +

      /* ---------- 面板 1/2：基础还款计划 ---------- */
      '<div id="lnPaneMain">' +
      '<div class="card tool-sec set-card">' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">贷款总额（万元）<input class="inp" id="lnAmt" type="number" min="0" step="1" value="100" /></label>' +
      '<label class="pz-lab">贷款年限（年）<input class="inp" id="lnYears" type="number" min="0" step="1" value="30" /></label>' +
      '<label class="pz-lab">年利率（%）<input class="inp" id="lnRate" type="number" min="0" step="0.01" value="3.1" /></label>' +
      '</div>' +
      '<button class="btn btn-main js-primary-submit" id="lnGo" type="button">🧮 计算</button>' +
      '</div>' +
      '<div id="lnResult" hidden>' +
      '<div class="res-grid" id="lnCards"></div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab" id="lnMonths">逐月还款明细</span>' +
      '<div class="ln-wrap"><table class="ln-tbl"><thead><tr><th>期数</th><th>月供</th><th>本金</th><th>利息</th><th>剩余本金</th></tr></thead><tbody id="lnBody"></tbody></table></div>' +
      '<button class="btn btn-ghost btn-sm" id="lnToggle" type="button"></button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">等额本息每月还款固定、前期利息占比高；等额本金月供逐月递减、总利息更少。结果仅供参考，以银行核算为准。</p>' +
      '</div>' +

      /* ---------- 面板 3：提前还款试算 ---------- */
      '<div id="lnPanePre" hidden>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">原还款方式</span>' +
      '<div class="seg seg-2" id="lnKind">' +
      '<button class="seg-btn on" data-v="interest" type="button">等额本息</button>' +
      '<button class="seg-btn" data-v="principal" type="button">等额本金</button>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">贷款总额（万元）<input class="inp" id="ppAmt" type="number" min="0" step="1" value="100" /></label>' +
      '<label class="pz-lab">贷款年限（年）<input class="inp" id="ppYears" type="number" min="0" step="1" value="30" /></label>' +
      '<label class="pz-lab">年利率（%）<input class="inp" id="ppRate" type="number" min="0" step="0.01" value="3.1" /></label>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">已还期数（月）<input class="inp" id="ppPaid" type="number" min="0" step="1" value="24" /></label>' +
      '<label class="pz-lab">提前还款金额（元）<input class="inp" id="ppPre" type="number" min="0" step="1000" value="200000" /></label>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab pp-way">提前还款后方式' +
      '<select class="inp" id="ppWay">' +
      '<option value="short">缩短年限（省息多）</option>' +
      '<option value="less">减少月供（压力小）</option>' +
      '<option value="keep">保持不变（仅对比）</option>' +
      '</select></label>' +
      '</div>' +
      '<button class="btn btn-main js-primary-submit" id="ppGo" type="button">🧮 开始试算</button>' +
      '<div class="tip-dim">改动任一输入项会在 0.2 秒后自动重算。</div>' +
      '</div>' +
      '<div id="ppResult" hidden></div>' +
      '<p class="cd-note">提前还款违约金、最低还款额、是否需要银行审批因贷款类型与银行而异；部分银行要求放款满一年才允许提前还款，且每年仅能操作一次。结果仅供参考，以银行实际核算为准。</p>' +
      '</div>' +

      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">计算结果仅供参考，实际以银行核算为准。</span></div>' +

      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    state.tab = 'interest';
    state.preMode = 'interest';
    state.rows = []; state.cards = []; state.months = 0; state.showAll = false;
    root.innerHTML = html();
    $('#lnGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#lnToggle', root).addEventListener('click', () => { state.showAll = !state.showAll; renderTable(); });
    $('#lnTabs', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTab(b.dataset.v);
    });
    $('#lnKind', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setPreMode(b.dataset.v);
    });
    /* 提前还款试算：按钮 + 全字段 debounce 200ms 自动重算 */
    $('#ppGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; runPre(false); });
    ['#ppAmt', '#ppYears', '#ppRate', '#ppPaid', '#ppPre', '#ppWay'].forEach(sel => {
      const el = $(sel, root);
      if (!el) return;
      el.addEventListener('input', () => runPre(true));
      if (el.tagName !== 'SELECT') el.addEventListener('change', () => runPre(true));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (ppTimer) { clearTimeout(ppTimer); ppTimer = null; }
    rootEl = null;
  }

  LB.router.register('loan', { mount, unmount });
})();
