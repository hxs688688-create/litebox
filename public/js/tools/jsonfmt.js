/* LiteBox v5 · tools/jsonfmt.js — JSON 格式化 / 压缩（错误行号定位，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  function showStat(msg, cls) {
    const el = $('#jfStat', rootEl);
    el.textContent = msg;
    el.className = 'jst' + (cls ? ' ' + cls : '');
  }

  /* 顶层键数：对象取键数，数组取长度，其他算 1 */
  function topCount(v) {
    if (v && typeof v === 'object') return Array.isArray(v) ? v.length : Object.keys(v).length;
    return 1;
  }

  function run(space) {
    const input = $('#jfIn', rootEl).value;
    if (!input.trim()) { LB.toast('请先粘贴 JSON 内容', 'info'); return; }
    try {
      const val = JSON.parse(input);
      $('#jfOut', rootEl).value = JSON.stringify(val, null, space);
      showStat('✓ 解析成功 · ' + topCount(val) + ' 个顶层键', 'ok');
    } catch (e) {
      let msg = e.message;
      /* 从错误消息抓 position，换算行号 */
      const m = /position (\d+)/.exec(msg);
      if (m) {
        const line = input.slice(0, +m[1]).split('\n').length;
        msg += '（第 ' + line + ' 行附近）';
      }
      $('#jfOut', rootEl).value = '';
      showStat('✖ ' + msg, 'err');
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>JSON 格式化</h1><p>格式化 / 压缩 JSON，语法错误精确到行 · 纯本地解析</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入 JSON</span>' +
      '<textarea class="inp mono" id="jfIn" rows="8" placeholder=\'{"a":1,"b":[2,3]}\' spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="jfFmt" type="button">✨ 格式化</button>' +
      '<button class="btn btn-ghost" id="jfMin" type="button">压缩</button>' +
      '<button class="btn btn-ghost" id="jfClear" type="button">清空</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输出</span>' +
      '<textarea class="inp mono" id="jfOut" rows="12" readonly placeholder="结果…"></textarea>' +
      '<div class="set-btns"><button class="btn btn-main" id="jfCopy" type="button">复制结果</button></div>' +
      '</div>' +
      '<div class="jst" id="jfStat">粘贴 JSON 后点击「格式化」或「压缩」</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#jfFmt', root).addEventListener('click', () => run(2));
    $('#jfMin', root).addEventListener('click', () => run());
    $('#jfClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => {
      $('#jfIn', root).value = '';
      $('#jfOut', root).value = '';
      showStat('粘贴 JSON 后点击「格式化」或「压缩」');
    }));
    $('#jfCopy', root).addEventListener('click', () => {
      const t = $('#jfOut', root).value;
      if (!t) { LB.toast('输出为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('jsonfmt', { mount, unmount });
})();
