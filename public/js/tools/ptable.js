/* LiteBox v5 · tools/ptable.js — 元素周期表（118 元素网格 + 分类配色 + 搜索高亮，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  const CAT_CN = {
    alkali: '碱金属', alkaline: '碱土金属', transition: '过渡金属',
    'post-transition': '后过渡金属', metalloid: '类金属', nonmetal: '非金属',
    halogen: '卤素', noble: '稀有气体', lanthanide: '镧系', actinide: '锕系', unknown: '待确认'
  };

  let rootEl = null;
  let db = null;
  let cellMap = {}; /* n → { cell, el } */

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>元素周期表</h1><p>118 个元素，按名称 / 符号 / 序数搜索</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec">' +
      '<input class="inp" id="ptQ" maxlength="20" placeholder="搜索中文名 / 符号 / 原子序数，如：氧、O、8" />' +
      '<div class="pt-scroll"><div class="pt-grid" id="ptGrid"></div></div>' +
      '<div class="pt-legend" id="ptLegend"></div>' +
      '</div>' +
      '<div class="card tool-sec pt-detail" id="ptDetail" hidden></div>' +
      '</div>'
    );
  }

  /* 元素格定位：主表 7 行 18 列；镧系 57-71 → 第 9 行 3-17 列，锕系 89-103 → 第 10 行 */
  function posOf(e) {
    if (e.n >= 57 && e.n <= 71) return { r: 9, c: e.n - 57 + 3 };
    if (e.n >= 89 && e.n <= 103) return { r: 10, c: e.n - 89 + 3 };
    return { r: e.period, c: e.group };
  }

  function buildGrid() {
    const grid = $('#ptGrid', rootEl);
    grid.innerHTML = '';
    cellMap = {};

    /* 6/7 周期 3 族的镧系 / 锕系占位格 */
    [['57-71', '镧系', 6, 'lanthanide'], ['89-103', '锕系', 7, 'actinide']].forEach(ph => {
      const d = document.createElement('div');
      d.className = 'pt-cell pt-ph pc-' + ph[3];
      d.style.gridRow = ph[2];
      d.style.gridColumn = 3;
      d.setAttribute('aria-hidden', 'true');
      d.innerHTML = '<small class="pt-ns">' + ph[0] + '</small><b class="pt-sym">＊</b><small class="pt-cn">' + ph[1] + '</small>';
      grid.appendChild(d);
    });

    db.forEach(e => {
      const p = posOf(e);
      const btn = document.createElement('button');
      btn.className = 'pt-cell pc-' + e.cat;
      btn.type = 'button';
      btn.dataset.n = e.n;
      btn.setAttribute('aria-label', e.name + '（' + e.sym + '）');
      btn.style.gridRow = p.r;
      btn.style.gridColumn = p.c;
      btn.innerHTML =
        '<small class="pt-ns">' + e.n + '</small>' +
        '<b class="pt-sym">' + e.sym + '</b>' +
        '<small class="pt-cn">' + e.name + '</small>';
      btn.addEventListener('click', () => showDetail(e.n));
      grid.appendChild(btn);
      cellMap[e.n] = { cell: btn, el: e };
    });

    /* 图例 */
    const seen = [];
    db.forEach(e => { if (!seen.some(s => s.cat === e.cat)) seen.push({ cat: e.cat, name: CAT_CN[e.cat] }); });
    $('#ptLegend', rootEl).innerHTML = seen.map(s =>
      '<span class="pt-lg"><i class="pc-' + s.cat + '"></i>' + s.name + '</span>'
    ).join('');
  }

  function showDetail(n) {
    const e = cellMap[n] && cellMap[n].el;
    if (!e) return;
    $('#ptDetail', rootEl).innerHTML =
      '<div class="pt-d-top"><span class="pt-d-badge pc-' + e.cat + '">' + e.sym + '</span>' +
      '<div><div class="pt-d-name">' + e.name + '</div><small class="pt-d-sub">原子序数 ' + e.n + ' · ' + CAT_CN[e.cat] + '</small></div></div>' +
      '<div class="pt-d-rows">' +
      '<div class="cl-row"><span>符号</span><b>' + e.sym + '</b></div>' +
      '<div class="cl-row"><span>相对原子质量</span><b>' + e.mass + '</b></div>' +
      '<div class="cl-row"><span>分类</span><b>' + CAT_CN[e.cat] + '</b></div>' +
      '<div class="cl-row"><span>周期</span><b>第 ' + e.period + ' 周期</b></div>' +
      '<div class="cl-row"><span>族</span><b>第 ' + e.group + ' 族</b></div>' +
      '</div>';
    $('#ptDetail', rootEl).hidden = false;
  }

  /* 搜索：序数相等 / 中文名包含 / 符号前缀（小写），只高亮不隐藏 */
  function applySearch() {
    const kw = $('#ptQ', rootEl).value.trim().toLowerCase();
    Object.keys(cellMap).forEach(n => {
      const { cell, el } = cellMap[n];
      let hit = false;
      if (kw) {
        hit = String(el.n) === kw || el.name.indexOf(kw) > -1 || el.sym.toLowerCase().indexOf(kw) === 0;
      }
      cell.classList.toggle('pt-hit', hit);
    });
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#ptQ', root).addEventListener('input', applySearch);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.dict.load('ptable')
      .then(d => { db = d; buildGrid(); })
      .catch(() => LB.toast('元素数据加载失败', 'err'));
  }

  function unmount() { rootEl = null; }

  LB.router.register('ptable', { mount, unmount });
})();
