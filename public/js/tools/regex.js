/* LiteBox v5 · tools/regex.js — 正则测试（实时高亮 <mark>，200ms 防抖，纯本地） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  let rootEl = null;
  let debounceTimer = null;
  const MAX_MATCH = 500; /* 匹配数上限，防止零宽匹配无限循环 */

  /* 高亮：先转义 HTML，再对匹配片段包 <mark> */
  function highlight(text, re) {
    let html = '', last = 0, m, count = 0;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (count >= MAX_MATCH) break;
      html += esc(text.slice(last, m.index));
      html += '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
      count++;
      if (m[0] === '') re.lastIndex++; /* 零宽匹配手动推进 */
    }
    html += esc(text.slice(last));
    return { html, count };
  }

  function run() {
    const ta = $('#rgText', rootEl);
    const text = ta.value;
    const pattern = $('#rgPat', rootEl).value;
    const hl = $('#rgHl', rootEl);
    const stat = $('#rgStat', rootEl);
    if (!pattern) {
      hl.textContent = text;
      stat.textContent = '输入正则后实时匹配';
      stat.className = 'jst';
      return;
    }
    /* flags 只允许 dgimsuvy；无 g 时自动加 g 以便高亮全部匹配 */
    let flags = ($('#rgFlags', rootEl).value || '').split('').filter(c => 'dgimsuvy'.includes(c)).join('');
    const autoG = !flags.includes('g');
    if (autoG) flags += 'g';
    let re;
    try { re = new RegExp(pattern, flags); }
    catch (e) {
      hl.textContent = text; /* 非法：显示原文不崩 */
      stat.textContent = '⚠️ 正则有误：' + e.message;
      stat.className = 'jst err';
      return;
    }
    const { html, count } = highlight(text, re);
    hl.innerHTML = html || '<span></span>';
    let note = '（' + count + ' 处匹配）';
    if (count >= MAX_MATCH) note = '（匹配数达到上限 ' + MAX_MATCH + '，已截断）';
    if (autoG && count > 0) note += ' · 原正则无 g 标志，高亮时已自动加上';
    stat.textContent = note;
    stat.className = 'jst';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>正则测试</h1><p>实时匹配高亮，非法正则即时提示 · 纯本地</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">正则表达式</span>' +
      '<div class="btn-row">' +
      '<span class="rg-slash">/</span>' +
      '<input class="inp" id="rgPat" type="text" placeholder="\\d{3}-\\d{4}" spellcheck="false" autocomplete="off">' +
      '<span class="rg-slash">/</span>' +
      '<input class="inp rg-flags" id="rgFlags" type="text" value="g" spellcheck="false" autocomplete="off" aria-label="flags">' +
      '</div></div>' +
      '<div class="tool-sec"><span class="tool-lab">测试文本</span>' +
      '<textarea class="inp" id="rgText" rows="6" placeholder="粘贴要匹配的文本…" spellcheck="false"></textarea></div>' +
      '<div class="tool-sec"><span class="tool-lab">匹配结果</span>' +
      '<div class="rg-hl" id="rgHl"></div></div>' +
      '<div class="jst" id="rgStat">输入正则后实时匹配</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const rerun = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(run, 200); };
    $('#rgPat', root).addEventListener('input', rerun);
    $('#rgFlags', root).addEventListener('input', rerun);
    $('#rgText', root).addEventListener('input', rerun);
    run();
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { clearTimeout(debounceTimer); debounceTimer = null; rootEl = null; }

  LB.router.register('regex', { mount, unmount });
})();
