/* LiteBox v5 · tools/diff.js — 文本对比（逐行 LCS diff，行数过多走简化路径） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  /* 比较预处理：应用「忽略大小写 / 忽略首尾空白」选项 */
  function norm(line, ignoreCase, ignoreTrim) {
    let s = line;
    if (ignoreTrim) s = s.trim();
    if (ignoreCase) s = s.toLowerCase();
    return s;
  }

  /* 标准 LCS DP（Uint32 压扁表）→ 回溯出 eq/del/add 序列 */
  function lcsDiff(a, b) {
    const n = a.length, m = b.length;
    const dp = new Uint32Array((n + 1) * (m + 1));
    const W = m + 1;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * W + j] = a[i] === b[j]
          ? dp[(i + 1) * W + j + 1] + 1
          : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: 'eq', i: i++, j: j++ }); }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { ops.push({ t: 'del', i: i++ }); }
      else { ops.push({ t: 'add', j: j++ }); }
    }
    while (i < n) ops.push({ t: 'del', i: i++ });
    while (j < m) ops.push({ t: 'add', j: j++ });
    return ops;
  }

  /* 简化路径（行数乘积过大）：只判断每行是否存在于对方，不追求最小编辑距离 */
  function simpleDiff(a, b) {
    const bCount = new Map();
    b.forEach(l => bCount.set(l, (bCount.get(l) || 0) + 1));
    const ops = [];
    a.forEach(l => {
      const c = bCount.get(l) || 0;
      if (c > 0) { bCount.set(l, c - 1); ops.push({ t: 'eq', l }); }
      else ops.push({ t: 'del', l });
    });
    bCount.forEach((c, l) => { for (let k = 0; k < c; k++) ops.push({ t: 'add', l }); });
    return ops;
  }

  function run() {
    const ignoreCase = $('#dfCase', rootEl).checked;
    const ignoreTrim = $('#dfTrim', rootEl).checked;
    const aRaw = $('#dfA', rootEl).value.replace(/\r\n?/g, '\n');
    const bRaw = $('#dfB', rootEl).value.replace(/\r\n?/g, '\n');
    if (!aRaw && !bRaw) { LB.toast('请先输入要对比的文本', 'info'); return; }
    const aLines = aRaw === '' ? [] : aRaw.split('\n');
    const bLines = bRaw === '' ? [] : bRaw.split('\n');
    const a = aLines.map(l => norm(l, ignoreCase, ignoreTrim));
    const b = bLines.map(l => norm(l, ignoreCase, ignoreTrim));

    /* 行数乘积 > 640000（如 800×800）→ 简化路径 */
    const ops = a.length * b.length > 640000
      ? simpleDiff(a, b)
      : lcsDiff(a, b);

    render(ops, aLines, bLines, ignoreCase || ignoreTrim);
  }

  function render(ops, aLines, bLines, normed) {
    const tbody = document.createElement('tbody');
    let ai = 0, bi = 0;
    let nAdd = 0, nDel = 0, nEq = 0;
    const mkRow = (cls, aNo, bNo) => {
      const tr = document.createElement('tr');
      if (cls) tr.className = cls;
      const cells = [
        { c: 'no', v: aNo === null ? '' : String(aNo) },
        { c: '', v: aNo === null ? '' : aLines[aNo - 1] },
        { c: 'no', v: bNo === null ? '' : String(bNo) },
        { c: '', v: bNo === null ? '' : bLines[bNo - 1] }
      ];
      cells.forEach(({ c, v }) => {
        const td = document.createElement('td');
        if (c) td.className = c;
        td.textContent = v;
        tr.appendChild(td);
      });
      return tr;
    };
    ops.forEach(op => {
      if (op.t === 'eq') { nEq++; tbody.appendChild(mkRow('', ++ai, ++bi)); }
      else if (op.t === 'del') { nDel++; tbody.appendChild(mkRow('del', ++ai, null)); }
      else { nAdd++; tbody.appendChild(mkRow('add', null, ++bi)); }
    });

    const tbl = document.createElement('table');
    tbl.className = 'diff-tbl';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['A', '原文本 (A)', 'B', '新文本 (B)'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);
    tbl.appendChild(tbody);

    const wrap = $('#dfOut', rootEl);
    wrap.innerHTML = '';
    wrap.hidden = false;
    wrap.appendChild(tbl);
    $('#dfStat', rootEl).textContent =
      (normed ? '已按忽略选项归一化比较 · ' : '') +
      '相同 ' + nEq + ' 行 · 新增 ' + nAdd + ' 行 · 删除 ' + nDel + ' 行';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本对比</h1><p>两段文本逐行 LCS 差异高亮，新增 / 删除一目了然 · 纯本地</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tc-cols">' +
      '<div class="tool-sec"><span class="tool-lab">原文本 A</span>' +
      '<textarea class="inp" id="dfA" rows="10" placeholder="原文本…" spellcheck="false"></textarea></div>' +
      '<div class="tool-sec"><span class="tool-lab">新文本 B</span>' +
      '<textarea class="inp" id="dfB" rows="10" placeholder="新文本…" spellcheck="false"></textarea></div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<label class="chk-row"><input type="checkbox" id="dfCase"><span>忽略大小写</span></label>' +
      '<label class="chk-row"><input type="checkbox" id="dfTrim"><span>忽略首尾空白</span></label>' +
      '<button class="btn btn-main" id="dfGo" type="button">🔍 开始对比</button>' +
      '</div>' +
      '<div class="jst" id="dfStat">输入两段文本后点击「开始对比」</div>' +
      '<div class="diff-wrap" id="dfOut" hidden></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#dfGo', root).addEventListener('click', run);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('diff', { mount, unmount });
})();
