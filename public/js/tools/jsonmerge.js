/* LiteBox v5 · tools/jsonmerge.js — JSON 合并（空行分段，数组 flat / 对象 assign，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  function showStat(msg, cls) {
    const el = $('#jmStat', rootEl);
    el.textContent = msg;
    el.className = 'jst' + (cls ? ' ' + cls : '');
  }

  function merge() {
    const input = $('#jmIn', rootEl).value;
    if (!input.trim()) { LB.toast('请先粘贴 JSON 内容', 'info'); return; }
    /* 按空行（连续换行）切分 → 每段 trim 后 parse */
    const parts = input.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) { LB.toast('没有可解析的内容', 'info'); return; }
    let vals;
    try {
      vals = parts.map((p, i) => {
        try { return JSON.parse(p); }
        catch (e) { throw new Error('第 ' + (i + 1) + ' 段不是合法 JSON：' + e.message); }
      });
    } catch (e) {
      $('#jmOut', rootEl).value = '';
      showStat('⚠️ ' + e.message, 'err');
      return;
    }
    const allArr = vals.every(v => Array.isArray(v));
    const allObj = vals.every(v => v !== null && typeof v === 'object' && !Array.isArray(v));
    let result;
    if (allArr) {
      result = [].concat(...vals); /* 数组 flat 合并 */
    } else if (allObj) {
      result = Object.assign({}, ...vals); /* 对象展开合并（后者覆盖同键） */
    } else {
      $('#jmOut', rootEl).value = '';
      showStat('⚠️ 多段类型不一致，无法合并（需全部为数组或全部为对象）', 'err');
      return;
    }
    $('#jmOut', rootEl).value = JSON.stringify(result, null, 2);
    showStat('✓ 合并 ' + parts.length + ' 段 · ' + (allArr ? '数组' : '对象') + ' · 输出 ' + $('#jmOut', rootEl).value.length + ' 字符', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>JSON 合并</h1><p>多个 JSON 用空行分隔，数组拼接 / 对象展开 · 纯本地</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入（多个 JSON，用空行分隔）</span>' +
      '<textarea class="inp mono" id="jmIn" rows="14" placeholder=\'{"a":1}\n\n{"b":2}\' spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="jmGo" type="button">🧩 合并</button>' +
      '<button class="btn btn-ghost" id="jmCopy" type="button">📋 复制</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输出</span>' +
      '<textarea class="inp mono" id="jmOut" rows="12" readonly placeholder="合并结果…"></textarea>' +
      '<div class="jst" id="jmStat">粘贴多个 JSON（空行分隔）后点击「合并」</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#jmGo', root).addEventListener('click', merge);
    $('#jmCopy', root).addEventListener('click', () => {
      const t = $('#jmOut', root).value;
      if (!t) { LB.toast('输出为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('jsonmerge', { mount, unmount });
})();
