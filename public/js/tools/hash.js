/* LiteBox v5 · tools/hash.js — SHA-256 哈希（WebCrypto，输入 200ms 防抖自动计算） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let debounceTimer = null;

  function subtleOK() {
    return typeof crypto !== 'undefined' && crypto && !!crypto.subtle && typeof crypto.subtle.digest === 'function';
  }

  async function calc(text) {
    if (!rootEl) return;
    if (!subtleOK()) {
      showStat('⚠️ 当前环境不支持 WebCrypto，需要 HTTPS（或 localhost / file://）', 'err');
      $('#hsOut', rootEl).value = '';
      return;
    }
    if (!text) {
      $('#hsOut', rootEl).value = '';
      showStat('输入文本后自动计算');
      return;
    }
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      $('#hsOut', rootEl).value = hex;
      showStat('✓ SHA-256 · ' + text.length + ' 字符输入 · 64 位十六进制摘要', 'ok');
    } catch (e) {
      showStat('✖ 计算失败：' + (e.message || '未知错误'), 'err');
    }
  }

  function showStat(msg, cls) {
    const el = $('#hsStat', rootEl);
    el.textContent = msg;
    el.className = 'jst' + (cls ? ' ' + cls : '');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>SHA-256 哈希</h1><p>输入即算，文本指纹校验 · WebCrypto 本地运算</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入文本</span>' +
      '<textarea class="inp" id="hsIn" rows="8" placeholder="粘贴或输入任意文本…" spellcheck="false"></textarea></div>' +
      '<div class="tool-sec"><span class="tool-lab">SHA-256 摘要</span>' +
      '<textarea class="inp mono" id="hsOut" rows="4" readonly placeholder="64 位十六进制摘要…"></textarea>' +
      '<div class="set-btns"><button class="btn btn-main" id="hsCopy" type="button">复制摘要</button></div>' +
      '</div>' +
      '<div class="jst" id="hsStat">输入文本后自动计算</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#hsIn', root).addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => calc($('#hsIn', root).value), 200);
    });
    if (!subtleOK()) showStat('⚠️ 当前环境不支持 WebCrypto，需要 HTTPS（或 localhost / file://）', 'err');
    $('#hsCopy', root).addEventListener('click', () => {
      const t = $('#hsOut', root).value;
      if (!t) { LB.toast('还没有计算结果', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    rootEl = null;
  }

  LB.router.register('hash', { mount, unmount });
})();
