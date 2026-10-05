/* LiteBox v5 · tools/cpu_ladder.js — 手机 SoC 性能天梯（静态数据，点击跳搜索）
 *
 * 【为什么不做实时跑分接口】
 *   跑分数据没有稳定公开 API，第三方接口失修严重（任务书已说明），
 *   且天梯图的价值在于「相对位置」而非绝对分数，静态表反而更可靠、离线可用。
 *
 * 【分数条按 TOP1 归一化】
 *   score 是相对值（TOP1 = 10000）。条形宽度 = score / max * 100%，
 *   于是第一名永远满格，其余按比例显示，视觉上即可看出代差。
 *
 * 【筛选 chips 从数据里现取品牌】
 *   任务书列了 4 个品牌，但字典里还有 Samsung / Google / Unisoc。
 *   写死 4 个会让这些机型永远筛不出来，所以用「全部 + 数据里出现的品牌」动态生成。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  let rootEl = null;
  let data = [];
  let loaded = false;
  let brand = '全部';

  function brands() {
    const set = [];
    data.forEach(s => { if (set.indexOf(s.brand) < 0) set.push(s.brand); });
    return ['全部'].concat(set);
  }

  function renderChips() {
    $('#cpuChips', rootEl).innerHTML = brands().map(b =>
      '<button class="chip' + (b === brand ? ' on' : '') + '" data-b="' + esc(b) + '" type="button">' + esc(b) + '</button>'
    ).join('');
  }

  function render() {
    if (!rootEl) return;
    const box = $('#cpuList', rootEl);
    const tip = $('#cpuTip', rootEl);
    if (!loaded) { box.innerHTML = '<p class="cd-note">正在加载天梯数据…</p>'; tip.textContent = ''; return; }

    const all = data.slice().sort((a, b) => b.score - a.score);
    const max = all.length ? all[0].score : 1;
    const list = brand === '全部' ? all : all.filter(s => s.brand === brand);
    /* 排名始终按全量算，避免筛选后名次错乱（Apple 的 A18 Pro 永远是第 1 名） */
    const rankOf = new Map();
    all.forEach((s, i) => rankOf.set(s, i + 1));

    tip.textContent = '共 ' + data.length + ' 款 SoC · 当前显示 ' + list.length + ' 款';
    if (!list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '📊',
        title: '该品牌暂无数据',
        sub: '换个品牌看看，或选择「全部」'
      });
      return;
    }

    box.innerHTML = list.map(s => {
      const rank = rankOf.get(s);
      const w = Math.max(2, s.score / max * 100);
      const noCls = rank <= 3 ? ' hl-no' + rank : '';
      return '<button class="cpu-row" type="button" data-n="' + esc(s.n) + '">' +
        '<span class="hl-no' + noCls + ' cpu-rank">' + rank + '</span>' +
        '<span class="cpu-body">' +
        '<span class="cpu-head"><b class="cpu-name">' + esc(s.n) + '</b>' +
        '<small class="cpu-year">' + s.year + '</small>' +
        '<small class="cpu-brand">' + esc(s.brand) + '</small>' +
        '<small class="cpu-score">' + s.score + '</small></span>' +
        '<span class="cpu-track"><span class="cpu-fill" data-w="' + w + '"></span></span>' +
        '</span></button>';
    }).join('');

    /* 条形宽度用 DOM style 逐个设置（避免把百分比写进内联字符串时被转义） */
    box.querySelectorAll('.cpu-fill').forEach(el => { el.style.width = el.dataset.w + '%'; });
  }

  function openSearch(name) {
    window.open('https://www.bing.com/search?q=' + encodeURIComponent(name + ' 跑分'), '_blank', 'noopener');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>硬件天梯</h1><p>手机 SoC 性能天梯排行，静态数据，本地展示</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="hl-chips" id="cpuChips"></div>' +
      '<p class="cd-note" id="cpuTip"></p>' +
      '<div class="cpu-list" id="cpuList"></div>' +
      '<p class="cd-note">📌 数据为相对性能分数，仅供参考。点击条目可搜索详细评测。<br>数据更新于 2026-10。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    brand = '全部';
    render();

    $('#cpuChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-b]');
      if (!b) return;
      brand = b.dataset.b;
      renderChips();
      render();
    });
    $('#cpuList', root).addEventListener('click', e => {
      const r = e.target.closest('[data-n]');
      if (r) openSearch(r.dataset.n);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    if (!loaded) {
      LB.dict.load('socLadder')
        .then(d => {
          if (!rootEl) return;
          data = Array.isArray(d) ? d : [];
          loaded = true;
          renderChips();
          render();
        })
        .catch(() => {
          if (!rootEl) return;
          loaded = true;
          render();
          LB.toast('天梯数据加载失败', 'err');
        });
    } else {
      renderChips();
      render();
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('cpu_ladder', { mount, unmount });
})();
