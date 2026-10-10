/* LiteBox v5 · tools/textscan.js — 文本提取器（网址/邮箱/IPv4/手机号/数字，Set 去重） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;

  /* 固定正则表（g 标志 + lookbehind 防止截断） */
  const TYPES = [
    { v: 'url', n: '网址', re: /https?:\/\/[^\s<>'"）)]+/gi },
    { v: 'email', n: '邮箱', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { v: 'ip', n: 'IPv4', re: /(?:\d{1,3}\.){3}\d{1,3}/g },
    { v: 'phone', n: '手机号', re: /(?<!\d)1\d{10}(?!\d)/g },
    { v: 'num', n: '数字', re: /(?<!\w)\d+(?:\.\d+)?(?!\w)/g }
  ];

  function extract() {
    const type = TYPES.find(t => t.v === $('#tsTypes .seg-btn.on', rootEl).dataset.v) || TYPES[0];
    const text = $('#tsIn', rootEl).value;
    if (!text.trim()) { LB.toast('请先粘贴文本', 'info'); return; }
    const found = text.match(type.re) || [];
    const uniq = [...new Set(found)]; /* Set 去重，保留首次出现顺序 */
    $('#tsOut', rootEl).value = uniq.join('\n');
    $('#tsStat', rootEl).textContent = found.length
      ? '✓ 提取 ' + found.length + ' 条 · 去重后 ' + uniq.length + ' 条'
      : '⚠️ 未找到' + type.n;
    $('#tsStat', rootEl).className = 'jst' + (found.length ? ' ok' : ' err');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本提取器</h1><p>网址 / 邮箱 / IPv4 / 手机号 / 数字一键提取，自动去重</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入文本</span>' +
      '<textarea class="inp" id="tsIn" rows="12" placeholder="粘贴任意文本，一键提取目标内容…" spellcheck="false"></textarea></div>' +
      '<div class="seg" id="tsTypes">' +
      TYPES.map((t, i) => '<button class="seg-btn' + (i === 0 ? ' on' : '') + '" data-v="' + t.v + '" type="button">' + t.n + '</button>').join('') +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="tsGo" type="button">🔍 提取</button>' +
      '<button class="btn btn-ghost" id="tsCopy" type="button">📋 复制</button>' +
      '<button class="btn btn-ghost" id="sxToTable" type="button">📊 转入表格工具</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">提取结果</span>' +
      '<textarea class="inp" id="tsOut" rows="9" readonly placeholder="结果每行一条…" spellcheck="false"></textarea>' +
      '<div class="jst" id="tsStat">选择类型后点击「提取」</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#tsTypes', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#tsTypes .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#tsGo', root).addEventListener('click', extract);
    $('#tsCopy', root).addEventListener('click', () => {
      const t = $('#tsOut', root).value;
      if (!t) { LB.toast('结果为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    /* Step 6B-6：把提取结果按「每行一个」写成单列 CSV，交给 CSV 表格预览渲染 */
    $('#sxToTable', root).addEventListener('click', () => {
      const lines = $('#tsOut', root).value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!lines.length) { LB.toast('还没有提取结果，请先点「提取」', 'info'); return; }
      const csv = '提取结果\n' + lines.join('\n');
      LB.storage.set('litebox_csv_seed', csv);
      LB.hash.go('csvtab');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('textscan', { mount, unmount });
})();
