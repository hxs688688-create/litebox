/* LiteBox v5 · tools/uuid.js — UUID / 短 ID / 时间戳 ID / NanoID 生成 */
(function () {
  const { $, $$ } = LB.dom;
  let rootEl = null;
  let state = { type: 'v4', upper: false, count: 5 };
  let lastResult = [];

  const NANO_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

  function randBytes(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  /* crypto.getRandomValues 拒绝采样，取 [0, max) 无偏随机 */
  function randBelow(max) {
    if (max <= 0) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % max;
  }

  function uuidv4() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = randBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; /* version 4 */
    b[8] = (b[8] & 0x3f) | 0x80; /* variant 10xx */
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function shortId() {
    let s = '';
    for (let i = 0; i < 8; i++) s += B36[randBelow(36)];
    return s;
  }

  function tsId() {
    let s = '';
    for (let i = 0; i < 4; i++) s += B36[randBelow(36)];
    return Date.now().toString(36) + s;
  }

  function nanoId() {
    let s = '';
    for (let i = 0; i < 21; i++) s += NANO_ALPHABET[randBelow(64)];
    return s;
  }

  function generate() {
    const fns = { v4: uuidv4, short: shortId, ts: tsId, nano: nanoId };
    const list = [];
    for (let i = 0; i < state.count; i++) list.push(fns[state.type]());
    if (state.upper && state.type !== 'ts') list.forEach((v, i) => { list[i] = v.toUpperCase(); });
    lastResult = list;
    const box = $('#ugOut', rootEl);
    box.innerHTML = list.map(v =>
      '<div class="out-row"><span class="out-txt">' + v + '</span>' +
      '<button class="copy-mini" data-cp="' + v + '" title="复制">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>' +
      '</button></div>'
    ).join('');
  }

  function html() {
    const types = [['v4', 'UUID v4'], ['short', '短 ID'], ['ts', '时间戳 ID'], ['nano', 'NanoID']];
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>UUID 生成</h1><p>UUID v4 / 短 ID / 时间戳 ID / NanoID，批量生成一键复制</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">类型</span><div class="seg" id="ugType">' +
      types.map(t => '<button class="seg-btn' + (t[0] === state.type ? ' on' : '') + '" data-t="' + t[0] + '" type="button">' + t[1] + '</button>').join('') +
      '</div></div>' +
      '<div class="tool-sec"><span class="tool-lab">数量</span><div class="range-row">' +
      '<input type="range" id="ugN" min="1" max="100" step="1" value="' + state.count + '">' +
      '<output id="ugNv">' + state.count + '</output></div></div>' +
      '<div class="tool-sec"><span class="tool-lab">大小写</span><div class="seg" id="ugCase">' +
      '<button class="seg-btn' + (!state.upper ? ' on' : '') + '" data-u="0" type="button">小写</button>' +
      '<button class="seg-btn' + (state.upper ? ' on' : '') + '" data-u="1" type="button">大写</button>' +
      '</div></div>' +
      '<button class="btn btn-main" id="ugGo" type="button">生成</button>' +
      '<div class="tool-sec"><span class="tool-lab">结果</span><div class="out-list" id="ugOut"></div></div>' +
      '<button class="btn btn-ghost" id="ugCopyAll" type="button">复制全部</button>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    $('#ugType', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      state.type = b.dataset.t;
      $$('#ugType .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#ugCase', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      state.upper = b.dataset.u === '1';
      $$('#ugCase .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#ugN', root).addEventListener('input', e => {
      state.count = LB.dom.clamp(parseInt(e.target.value, 10) || 1, 1, 100);
      $('#ugNv', root).textContent = state.count;
    });
    $('#ugGo', root).addEventListener('click', generate);
    $('#ugCopyAll', root).addEventListener('click', () => {
      if (!lastResult.length) { LB.toast('请先生成', 'info'); return; }
      LB.copyWithToast(lastResult.join('\n'));
    });
    root.addEventListener('click', e => {
      const cp = e.target.closest('[data-cp]');
      if (cp) { LB.copyWithToast(cp.dataset.cp); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
    generate(); /* 初始默认生成一版 */
  }

  function unmount() { rootEl = null; lastResult = []; }

  LB.router.register('uuid', { mount, unmount });
})();
