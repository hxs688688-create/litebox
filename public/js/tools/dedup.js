/* LiteBox v5 · tools/dedup.js — 文本去重排序（Set 保序去重 + 多种排序，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  const lines = t => t.replace(/\r\n?/g, '\n').split('\n');
  const numKey = s => { const v = parseFloat(s); return isNaN(v) ? Infinity : v; };

  /* 每个操作：输入行数组 → 输出行数组 */
  const OPS = [
    { n: '去重', f: ls => {
      const seen = new Set();
      return ls.filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
    } },
    { n: '排序 A→Z', f: ls => [...ls].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')) },
    { n: '排序 Z→A', f: ls => [...ls].sort((a, b) => b.localeCompare(a, 'zh-Hans-CN')) },
    { n: '按数字排序', f: ls => [...ls].sort((a, b) => numKey(a) - numKey(b)) },
    { n: '按长度排序', f: ls => [...ls].sort((a, b) => a.length - b.length) },
    { n: '反转顺序', f: ls => [...ls].reverse() },
    { n: '去空行', f: ls => ls.filter(l => l.trim() !== '') },
    { n: '去首尾空格', f: ls => ls.map(l => l.replace(/^[ \t\u3000\u00a0]+|[ \t\u3000\u00a0]+$/g, '')) }
  ];

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本去重排序</h1><p>一键去重 / 排序 / 反转 / 去空行 · 中文按拼音排序</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">原始文本</span>' +
      '<textarea class="inp" id="ddIn" rows="11" placeholder="每行一条，粘贴到此处…" spellcheck="false"></textarea>' +
      '<div class="jst" id="ddStat">0 行 · 0 字</div>' +
      '</div>' +
      '<div class="btn-row" id="ddOps">' +
      OPS.map((o, i) => '<button class="btn btn-ghost" data-op="' + i + '" type="button">' + o.n + '</button>').join('') +
      '<button class="btn btn-main" id="ddCopy" type="button">📋 复制结果</button>' +
      '<button class="btn btn-ghost" id="ddDl" type="button">⬇️ 下载 TXT</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">结果</span>' +
      '<textarea class="inp" id="ddOut" rows="11" readonly placeholder="处理结果…" spellcheck="false"></textarea>' +
      '</div>' +
      '</div>'
    );
  }

  function renderStat() {
    const t = $('#ddIn', rootEl).value;
    const n = t === '' ? 0 : lines(t).length;
    $('#ddStat', rootEl).textContent = n + ' 行 · ' + t.length + ' 字';
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const inp = $('#ddIn', root);
    inp.addEventListener('input', renderStat);

    $('#ddOps', root).addEventListener('click', e => {
      const b = e.target.closest('[data-op]');
      if (!b) return;
      const op = OPS[+b.dataset.op];
      $('#ddOut', root).value = op.f(lines(inp.value)).join('\n');
    });
    $('#ddCopy', root).addEventListener('click', () => {
      const t = $('#ddOut', root).value;
      if (!t) { LB.toast('结果为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    $('#ddDl', root).addEventListener('click', () => {
      const t = $('#ddOut', root).value;
      if (!t) { LB.toast('结果为空，先执行一个操作', 'info'); return; }
      LB.img.download(new Blob([t], { type: 'text/plain;charset=utf-8' }), 'dedup.txt');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    renderStat();
  }

  function unmount() { rootEl = null; }

  LB.router.register('dedup', { mount, unmount });
})();
