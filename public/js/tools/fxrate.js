/* LiteBox v5 · tools/fxrate.js — 汇率换算（同源 /api/fxrate，30 分钟缓存，30 币种） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY_CACHE = 'litebox_fx_cache';
  const TTL = 30 * 60 * 1000;

  /* 30 个币种（代码 中文名） */
  const COINS = [
    ['CNY', '人民币'], ['USD', '美元'], ['EUR', '欧元'], ['JPY', '日元'], ['GBP', '英镑'],
    ['HKD', '港币'], ['TWD', '新台币'], ['KRW', '韩元'], ['SGD', '新加坡元'], ['AUD', '澳元'],
    ['CAD', '加元'], ['CHF', '瑞郎'], ['THB', '泰铢'], ['MYR', '林吉特'], ['VND', '越南盾'],
    ['PHP', '菲律宾比索'], ['IDR', '印尼盾'], ['INR', '印度卢比'], ['RUB', '卢布'], ['NZD', '纽元'],
    ['SEK', '瑞典克朗'], ['NOK', '挪威克朗'], ['DKK', '丹麦克朗'], ['MXN', '墨西哥比索'], ['BRL', '巴西雷亚尔'],
    ['ZAR', '南非兰特'], ['TRY', '里拉'], ['AED', '迪拉姆'], ['SAR', '沙特里亚尔'], ['PLN', '兹罗提']
  ];

  let rootEl = null;
  let data = null; /* { base, rates, time } */

  function fillSelect(sel, def) {
    sel.innerHTML = COINS.map(c => '<option value="' + c[0] + '"' + (c[0] === def ? ' selected' : '') + '>' + c[0] + ' ' + c[1] + '</option>').join('');
  }

  /* 取汇率数据：30 分钟缓存内直接用，否则请求同源 API */
  async function ensureData() {
    const cached = LB.storage.get(KEY_CACHE, null);
    if (cached && cached.data && Date.now() - cached.ts < TTL) {
      data = cached.data;
      return true;
    }
    const r = await LB.api.get('/api/fxrate?base=CNY');
    if (!r.ok || !r.data || !r.data.rates) return false;
    data = r.data;
    LB.storage.set(KEY_CACHE, { ts: Date.now(), data });
    return true;
  }

  function fmtMoney(n) {
    const digits = n >= 100 ? 2 : 4;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: digits });
  }

  /* Step 8：结果区标准结构（骨架屏 / 错误卡会整体替换 out.innerHTML，成功后用它重建） */
  function resultHtml() {
    return '<div class="fx-out" id="fxOut"></div>' +
      '<div class="fx-sub" id="fxRate"></div>' +
      '<div class="fx-time" id="fxTime"></div>';
  }

  /* Step 8：失败时结果区显示标准错误卡片 + 重试按钮 */
  function showErr(sub) {
    const out = $('#fxResult', rootEl);
    out.hidden = false;
    out.innerHTML =
      '<div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">获取失败</p>' +
      '<p class="es-sub">' + esc(sub) + '</p>' +
      '<button class="btn btn-main es-cta" id="fxRetry" type="button">重新获取</button>' +
      '</div>';
    $('#fxRetry', rootEl).addEventListener('click', run);
  }

  async function run() {
    const amount = parseFloat($('#fxAmt', rootEl).value);
    if (!(amount > 0)) { LB.toast('请输入有效金额', 'info'); return; }
    const from = $('#fxFrom', rootEl).value;
    const to = $('#fxTo', rootEl).value;
    const out = $('#fxResult', rootEl);

    out.hidden = false;
    /* Step 8：请求期间显示骨架屏 */
    LB.ui.skeleton(out, 3, 'card');

    const ok = await ensureData();
    if (!ok) {
      LB.fail('汇率', '接口暂时不可用', '稍后重试，或手动输入今日汇率');
      showErr('接口暂时不可用，请稍后重试');
      return;
    }
    if (!data.rates[from] || !data.rates[to]) {
      LB.fail('汇率', '暂不支持该币种组合', '换个币种试试');
      showErr('暂不支持该币种组合，请换个币种');
      return;
    }

    out.innerHTML = resultHtml();
    /* Step 10：结果卡片淡入上移 + 数字回弹 */
    LB.replay(out, 'lb-scale-in');
    const result = amount / data.rates[from] * data.rates[to];
    const unit = data.rates[to] / data.rates[from];
    $('#fxOut', rootEl).textContent = fmtMoney(result) + ' ' + to;
    LB.replay($('#fxOut', rootEl), 'lb-pop');
    $('#fxRate', rootEl).textContent = '汇率：1 ' + from + ' = ' + unit.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) + ' ' + to;
    $('#fxTime', rootEl).textContent = data.time ? '数据更新时间：' + data.time.replace('T', ' ').replace(/:\d{2}Z?$/, '') : '';
  }

  function swap() {
    const f = $('#fxFrom', rootEl);
    const t = $('#fxTo', rootEl);
    const tmp = f.value;
    f.value = t.value;
    t.value = tmp;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>汇率换算</h1><p>30+ 币种实时汇率双向换算，汇率每日自动更新</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<label class="pz-lab">金额<input class="inp" id="fxAmt" type="number" min="0" value="100" /></label>' +
      '<div class="fx-grid">' +
      '<label class="pz-lab">从<select class="inp" id="fxFrom"></select></label>' +
      '<button class="btn btn-ghost btn-sm" id="fxSwap" type="button" aria-label="交换币种">⇄</button>' +
      '<label class="pz-lab">到<select class="inp" id="fxTo"></select></label>' +
      '</div>' +
      '<button class="btn btn-main js-primary-submit" id="fxGo" type="button">💱 换算</button>' +
      '</div>' +
      '<div class="card tool-sec set-card" id="fxResult" hidden>' +
      '<div class="fx-out" id="fxOut"></div>' +
      '<div class="fx-sub" id="fxRate"></div>' +
      '<div class="fx-time" id="fxTime"></div>' +
      '</div>' +
      '<p class="cd-note">汇率数据缓存 30 分钟，避免重复请求；换算结果仅供参考，实际以银行牌价为准。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    fillSelect($('#fxFrom', root), 'CNY');
    fillSelect($('#fxTo', root), 'USD');
    $('#fxGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#fxSwap', root).addEventListener('click', swap);
    LB.enterSubmit($('#fxAmt', root), run);   /* Step 10：金额输入框回车即换算 */
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('fxrate', { mount, unmount });
})();
