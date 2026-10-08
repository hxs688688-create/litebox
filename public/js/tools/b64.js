/* LiteBox v5 · tools/b64.js — Base64 / URL 编解码（UTF-8 安全，纯本地） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;

  function showStat(msg, cls) {
    const el = $('#b64Stat', rootEl);
    el.textContent = msg;
    el.className = 'jst' + (cls ? ' ' + cls : '');
  }

  /* UTF-8 安全的 Base64 编码：TextEncoder → 逐字节拼 bin → btoa */
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  /* Base64 解码：atob → 字节数组 → TextDecoder 按 UTF-8 还原 */
  function b64decode(str) {
    const bin = atob(str.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function run(dir) {
    const mode = $('#b64Mode .seg-btn.on', rootEl).dataset.m;
    const input = $('#b64In', rootEl).value;
    if (!input) { LB.toast('请先输入内容', 'info'); return; }
    const name = mode === 'b64' ? 'Base64' : 'URL';
    let out;
    try {
      if (dir === 'enc') {
        out = mode === 'b64' ? b64encode(input) : encodeURIComponent(input);
      } else {
        /* URL 解码：+ 替换成空格（表单编码兼容） */
        out = mode === 'b64' ? b64decode(input) : decodeURIComponent(input.replace(/\+/g, ' '));
      }
    } catch (e) {
      out = '';
      showStat('⚠️ 输入内容不是有效的 ' + name + ' 格式', 'err');
      $('#b64Out', rootEl).value = '';
      return;
    }
    $('#b64Out', rootEl).value = out;
    showStat('✓ ' + (dir === 'enc' ? '编码' : '解码') + '完成 · 输出 ' + out.length + ' 字符', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>Base64 / URL 编解码</h1><p>中文安全无乱码，URL 模式兼容表单编码 · 纯本地</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="b64Mode">' +
      '<button class="seg-btn on" data-m="b64" type="button">Base64</button>' +
      '<button class="seg-btn" data-m="url" type="button">URL</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输入</span>' +
      '<textarea class="inp" id="b64In" rows="8" placeholder="粘贴要编码 / 解码的内容…" spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="b64Enc" type="button">编码 →</button>' +
      '<button class="btn btn-ghost" id="b64Dec" type="button">← 解码</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输出</span>' +
      '<textarea class="inp mono" id="b64Out" rows="8" readonly placeholder="结果…"></textarea>' +
      '<div class="set-btns"><button class="btn btn-main" id="b64Copy" type="button">复制结果</button></div>' +
      '</div>' +
      '<div class="jst" id="b64Stat">输入内容后选择编码或解码</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#b64Mode', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#b64Mode .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#b64Enc', root).addEventListener('click', () => run('enc'));
    $('#b64Dec', root).addEventListener('click', () => run('dec'));
    $('#b64Copy', root).addEventListener('click', () => {
      const t = $('#b64Out', root).value;
      if (!t) { LB.toast('输出为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('b64', { mount, unmount });
})();
