/* LiteBox v5 · tools/radix.js — 进制转换（BigInt 任意大数） */
(function () {
  const { $, $$, esc } = LB.dom;

  const BASES = [2, 8, 10, 16];
  const DIGITS = { 2: '01', 8: '01234567', 10: '0123456789', 16: '0123456789abcdef' };
  const NAMES = { 2: '二进制', 8: '八进制', 10: '十进制', 16: '十六进制' };
  let state = { base: 10 };
  let rootEl = null;

  function html() {
    const segs = BASES.map(b =>
      '<button class="seg-btn" data-b="' + b + '"' + (b === state.base ? ' on' : '') + ' type="button" aria-label="选' + NAMES[b] + '">' + b + '</button>'
    ).join('');
    const cards = BASES.map(b =>
      '<div class="res-card">' +
      '<span class="copy-mini" data-cb="' + b + '" title="复制">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>' +
      '</span>' +
      '<div class="rc-lab">' + NAMES[b] + '</div>' +
      '<div class="rc-val mono" data-out="' + b + '">—</div>' +
      '</div>'
    ).join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>进制转换</h1><p>2 / 8 / 10 / 16 进制互转，BigInt 支持任意大数</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入数值</span>' +
      '<input class="inp mono" id="rxIn" placeholder="输入 ' + state.base + ' 进制数值，如 255" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">源进制</span><div class="seg" id="rxSeg">' + segs + '</div></div>' +
      '<div class="tool-sec"><span class="tool-lab">转换结果</span><div class="res-grid">' + cards + '</div></div>' +
      '<p class="tip-err" id="rxErr" hidden></p>' +
      '</div>'
    );
  }

  /* 解析任意大数：校验字符 → BigInt 累积；失败返回 null */
  function parseBig(raw, base) {
    let s = String(raw || '').trim().toLowerCase().replace(/^0+(?!$)/, '');
    if (!s) return { empty: true };
    const chars = DIGITS[base];
    let v = 0n;
    const bigBase = BigInt(base);
    for (const ch of s) {
      const d = chars.indexOf(ch);
      if (d === -1) return { bad: true };
      v = v * bigBase + BigInt(d);
    }
    return { value: v };
  }

  function render() {
    const raw = $('#rxIn', rootEl) ? $('#rxIn', rootEl).value : '';
    const r = parseBig(raw, state.base);
    const err = $('#rxErr', rootEl);
    BASES.forEach(b => {
      const out = $('[data-out="' + b + '"]', rootEl);
      if (r.empty) out.textContent = '—';
      else if (r.bad) out.textContent = '—';
      else out.textContent = b === state.base ? r.value.toString() : r.value.toString(b).toUpperCase();
    });
    if (r.bad) {
      err.textContent = '输入含 ' + state.base + ' 进制中不存在的字符';
      err.hidden = false;
    } else {
      err.hidden = true;
    }
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const input = $('#rxIn', root);
    input.addEventListener('input', render);
    $('#rxSeg', root).addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.base = parseInt(btn.dataset.b, 10);
      $$('.seg-btn', root).forEach(x => x.classList.toggle('on', x === btn));
      input.placeholder = '输入 ' + state.base + ' 进制数值，如 255';
      render();
    });
    root.addEventListener('click', e => {
      const cp = e.target.closest('[data-cb]');
      if (cp) {
        const b = cp.dataset.cb;
        const val = $('[data-out="' + b + '"]', root).textContent;
        LB.copyWithToast(val);
        return;
      }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
    input.focus();
  }

  function unmount() { rootEl = null; }

  LB.router.register('radix', { mount, unmount });
})();
