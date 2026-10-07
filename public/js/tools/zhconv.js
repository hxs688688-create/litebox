/* LiteBox v5 · tools/zhconv.js — 简繁转换（繁→简 / 简→繁 / 换向，按需加载字典） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let s2t = null, t2s = null;

  /* dir: 's2t' | 't2s'，逐字符查表，命中替换并计数 */
  function run(dir) {
    const table = dir === 's2t' ? s2t : t2s;
    const s = $('#zcIn', rootEl).value;
    if (!table) { LB.toast('字典加载中…', 'info'); return; }
    if (!s.trim()) { LB.toast('请先输入文本', 'info'); return; }
    let out = '', n = 0;
    for (const ch of s) {
      const v = table[ch];
      if (v && v !== ch) { out += v; n++; }
      else out += ch;
    }
    $('#zcOut', rootEl).value = out;
    $('#zcStat', rootEl).textContent = '✓ 已转换 ' + n + ' 个字';
    $('#zcStat', rootEl).className = 'jst ok';
  }

  /* 换向：输出内容回到输入框，清空输出 */
  function swap() {
    const out = $('#zcOut', rootEl).value;
    if (!out) { LB.toast('暂无输出可换向', 'info'); return; }
    $('#zcIn', rootEl).value = out;
    $('#zcOut', rootEl).value = '';
    $('#zcStat', rootEl).textContent = '已换向，点击目标方向继续转换';
    $('#zcStat', rootEl).className = 'jst';
  }

  function ensureDict(runFn) {
    if (s2t) { runFn(); return; }
    $('#zcStat', rootEl).textContent = '字典加载中…';
    Promise.all([LB.dict.load('zhS2T'), LB.dict.load('zhT2S')]).then(([a, b]) => {
      s2t = a; t2s = b;
      runFn();
    }).catch(() => {
      $('#zcStat', rootEl).textContent = '⚠️ 字典加载失败，请刷新重试';
      $('#zcStat', rootEl).className = 'jst err';
    });
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>简繁转换</h1><p>简体 ⇄ 繁体一键互转，逐字精准映射</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入文本</span>' +
      '<textarea class="inp" id="zcIn" rows="6" placeholder="输入简体或繁体文本…" spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="zcT2S" type="button">繁 → 简</button>' +
      '<button class="btn btn-main" id="zcS2T" type="button">简 → 繁</button>' +
      '<button class="btn btn-ghost" id="zcSwap" type="button">⇅ 换向</button>' +
      '<button class="btn btn-ghost" id="zcCopy" type="button">📋 复制</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">转换结果</span>' +
      '<textarea class="inp" id="zcOut" rows="6" readonly placeholder="转换结果…"></textarea>' +
      '<div class="jst" id="zcStat">选择方向开始转换</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#zcT2S', root).addEventListener('click', () => ensureDict(() => run('t2s')));
    $('#zcS2T', root).addEventListener('click', () => ensureDict(() => run('s2t')));
    $('#zcSwap', root).addEventListener('click', swap);
    $('#zcCopy', root).addEventListener('click', () => {
      const t = $('#zcOut', root).value;
      if (!t) { LB.toast('结果为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; s2t = null; t2s = null; }

  LB.router.register('zhconv', { mount, unmount });
})();
