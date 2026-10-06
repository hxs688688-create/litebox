/* LiteBox v5 · tools/cpu_ladder.js — 手机 SoC 性能天梯
 *
 * Step 12 · B2：数据从「打包在本地字典里的静态表」改为「每天从 GitHub 拉取」。
 *   · 页面加载时调 /api/soc-ladder（后端边缘缓存 24h，24 小时内不重复打上游）
 *   · 页面显示「更新于 YYYY-MM-DD」
 *   · 接口失败 / 离线时用 localStorage 里上一次成功的结果兜底
 *   · 连本机缓存都没有时，退回打包的静态字典（vendor/dict/soc-ladder.js）保证页面不空
 *
 * Step 13 · B7：更新频率改为「后端缓存 7 天」—— 芯片不是每天发布，日更无意义。
 *   · 页面显示「数据更新于 YYYY-MM-DD」
 *   · 每次访问仍调 /api/soc-ladder，但后端有 7 天缓存，普通访问不会回源
 *   · 新增「检查更新」按钮 → 调 /api/soc-ladder?fresh=1（后端跳过缓存强制回源）
 *
 * 【分数条按 TOP1 归一化】
 *   score 是相对值（TOP1 = 10000）。条形宽度 = score / max * 100%，
 *   于是第一名永远满格，其余按比例显示，视觉上即可看出代差。
 *
 * 【筛选 chips 从数据里现取品牌】
 *   远端数据里的品牌不止 4 家（还有三星 / 苹果 / Google / Intel 等）。
 *   写死会让这些机型永远筛不出来，所以用「全部 + 数据里出现的品牌」动态生成。
 *
 * 【year 可能为空】
 *   远端数据只有「档位」没有发布年份，所以 year 为空时整列不渲染，
 *   不能留一个空白的 <small> 占位。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const CACHE_KEY = 'litebox_soc_ladder';
  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let data = [];
  let loaded = false;
  let brand = '全部';
  let updated = '';      /* ISO 时间串 */
  let offline = false;   /* 用的是本机缓存而不是新拉到的数据 */
  let fromDict = false;  /* 用的是打包字典（连缓存都没有） */
  let upstreamFallback = false; /* 后端也没拉到远端数据，返回的是内置榜单 */

  function brands() {
    const set = [];
    data.forEach(s => { if (set.indexOf(s.brand) < 0) set.push(s.brand); });
    return ['全部'].concat(set);
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function renderChips() {
    $('#cpuChips', rootEl).innerHTML = brands().map(b =>
      '<button class="chip' + (b === brand ? ' on' : '') + '" data-b="' + esc(b) + '" type="button">' + esc(b) + '</button>'
    ).join('');
  }

  /* 底部说明：「数据更新于 YYYY-MM-DD」+ 数据状态 */
  function renderUpdated() {
    const el = $('#cpuUpdated', rootEl);
    if (!el) return;
    const day = fmtDate(updated);
    const parts = [];
    if (day) parts.push('数据更新于 ' + day);
    if (fromDict) parts.push('（本机离线数据）');
    else if (offline) parts.push('（本机缓存）');
    else if (upstreamFallback) parts.push('（上游暂不可达，当前为内置榜单）');
    el.textContent = parts.join(' ');
  }

  function render() {
    if (!rootEl) return;
    const box = $('#cpuList', rootEl);
    const tip = $('#cpuTip', rootEl);
    if (!loaded) { box.innerHTML = '<p class="cd-note">正在加载天梯数据…</p>'; tip.textContent = ''; return; }

    const all = data.slice().sort((a, b) => b.score - a.score);
    const max = all.length ? all[0].score : 1;
    const list = brand === '全部' ? all : all.filter(s => s.brand === brand);
    /* 排名始终按全量算，避免筛选后名次错乱（最快的永远是第 1 名） */
    const rankOf = new Map();
    all.forEach((s, i) => rankOf.set(s, i + 1));

    tip.textContent = '共 ' + data.length + ' 款 SoC · 当前显示 ' + list.length + ' 款';
    renderUpdated();

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
      /* year 为空（远端数据没有年份）时整列不渲染 */
      const yearHtml = s.year ? '<small class="cpu-year">' + esc(s.year) + '</small>' : '';
      return '<button class="cpu-row" type="button" data-n="' + esc(s.n) + '">' +
        '<span class="hl-no' + noCls + ' cpu-rank">' + rank + '</span>' +
        '<span class="cpu-body">' +
        '<span class="cpu-head"><b class="cpu-name">' + esc(s.n) + '</b>' +
        yearHtml +
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

  /* ---------- 数据加载：接口 → 本机缓存 → 打包字典 ---------- */
  function readCache() {
    const c = LB.storage.get(CACHE_KEY, null);
    if (c && Array.isArray(c.list) && c.list.length) return c;
    return null;
  }

  /* Step 13 · B7：fresh=true 时调 ?fresh=1 让后端跳过 7 天缓存强制回源（「检查更新」按钮） */
  async function fetchLadder(fresh) {
    const cached = readCache();
    if (!HAS_API) {
      if (cached) return { list: cached.list, updated: cached.updated, offline: true, source: cached.source };
      throw new Error('离线环境且没有本机缓存');
    }
    try {
      const d = await LB.api.getJSON('/api/soc-ladder' + (fresh ? '?fresh=1' : ''), { timeout: fresh ? 30000 : 20000 });
      const list = (d && Array.isArray(d.list)) ? d.list.filter(x => x && x.n) : [];
      if (!list.length) throw new Error('接口未返回数据');
      LB.storage.set(CACHE_KEY, { list: list, updated: d.updated, source: d.source });
      return { list: list, updated: d.updated, offline: false, source: d.source };
    } catch (e) {
      if (cached) return { list: cached.list, updated: cached.updated, offline: true, source: cached.source };
      throw e;
    }
  }

  /* 最后的兜底：打包在 vendor/dict 里的静态表（字段同名） */
  async function fetchFromDict() {
    const d = await LB.dict.load('socLadder');
    return Array.isArray(d) ? d : [];
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>硬件天梯</h1><p>手机 SoC 性能天梯排行，每 7 天自动更新</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="hl-chips" id="cpuChips"></div>' +
      '<p class="cd-note" id="cpuTip"></p>' +
      /* 「数据更新于」放在列表**上方**：298 款的列表很长，放底部要滚到底才看得到 */
      '<div class="cpu-upd-row">' +
      '<p class="cd-note" id="cpuUpdated"></p>' +
      '<button class="btn btn-ghost btn-sm" id="cpuRefresh" type="button">🔄 检查更新</button>' +
      '</div>' +
      '<div class="cpu-list" id="cpuList"></div>' +
      '<p class="cd-note">分数为同一梯队内的相对值，仅供参考。点击条目可搜索详细评测。</p>' +
      '</div>'
    );
  }

  /* Step 13 · B7：加载结果落到视图。fresh=true 时失败要给用户明确反馈，
     普通访问失败则照旧静默兜底。 */
  function applyResult(res) {
    if (!rootEl) return;
    data = res.list;
    updated = res.updated || '';
    offline = !!res.offline;
    upstreamFallback = res.source === 'fallback';
    fromDict = false;
    loaded = true;
    renderChips();
    render();
  }

  /* 「检查更新」按钮收尾：文案/禁用态一律复位（成功失败都要能再点） */
  function resetRefreshBtn() {
    const btn = rootEl && $('#cpuRefresh', rootEl);
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = '🔄 检查更新';
  }

  function load(fresh) {
    fetchLadder(fresh)
      .then(res => {
        applyResult(res);
        if (fresh) {
          resetRefreshBtn();
          LB.toast(res.offline ? '暂时检查不到新数据，已显示本机缓存' : '已获取最新榜单', res.offline ? 'info' : 'ok');
        }
      })
      .catch(() => {
        /* 接口与本机缓存都不可用 → 退回打包字典 */
        return fetchFromDict()
          .then(list => {
            if (!rootEl) return;
            data = list;
            updated = '';
            fromDict = true;
            upstreamFallback = false;
            loaded = true;
            renderChips();
            render();
            LB.toast('在线数据不可用，已切换到本机内置天梯', 'info');
          })
          .catch(() => {
            if (!rootEl) return;
            loaded = true;
            render();
            LB.toast('天梯数据加载失败', 'err');
          })
          .then(resetRefreshBtn);
      });
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    brand = '全部';
    loaded = false;
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
    /* Step 13 · B7：手动「检查更新」→ 后端跳过 7 天缓存强制回源。
       按钮的禁用态与文案复位都在 load(true) 的收尾里做，这里只管发起。 */
    $('#cpuRefresh', root).addEventListener('click', e => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '检查中…';
      load(true);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    load(false);
  }

  function unmount() { rootEl = null; }

  LB.router.register('cpu_ladder', { mount, unmount });
})();
