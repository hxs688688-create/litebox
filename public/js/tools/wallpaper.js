/* LiteBox v5 · tools/wallpaper.js — 壁纸精选
 *  Step 11 · B1：后端主源换为 wp.upx8.com（降级链 upx8 → Wallhaven → Picsum）；
 *                前端在拿到 JSON 后先预加载前 4 张，加载完成再渲染网格。
 *  后端 /api/wallpaper 返回同源代理地址 → /api/wallpaper-image 真实取图；
 *  loremflickr 早已全站 401 失效，前端降级路径同步改为代理，避免后端挂掉时直连死源。
 *  Step 6B-4：新增「今日精选」大图卡片（当日固定，localStorage 记住当日选中图）
 *              与浏览历史（litebox_wall_seen，最多 200 条，已看过的加载时过滤） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const TTL = 5 * 60 * 1000;
  const SEEN_KEY = 'litebox_wall_seen';
  const SEEN_MAX = 200;
  const PICK_KEY = 'litebox_wall_pick';

  /* Step 5D-2 修改 1 · 分类列表（15 类，key 与后端 CAT_KEYWORDS 对齐） */
  const CATS = [
    { key: 'featured',  label: '✨ 精选' },
    { key: 'beauty',    label: '👩 美女' },
    { key: 'anime',     label: '🎨 动漫' },
    { key: 'landscape', label: '🏞️ 风景' },
    { key: 'game',      label: '🎮 游戏' },
    { key: 'text',      label: '✍️ 文字' },
    { key: 'abstract',  label: '🪩 视觉' },
    { key: 'chinese',   label: '🏮 国风' },
    { key: 'minimal',   label: '◻️ 简约' },
    { key: 'space',     label: '🌌 星空' },
    { key: 'animal',    label: '🐾 动物' },
    { key: 'city',      label: '🏙️ 城市' },
    { key: 'car',       label: '🚗 汽车' },
    { key: 'tech',      label: '💻 科技' },
    { key: 'mobile',    label: '📱 手机' }
  ];

  /* 分类中文名 → key（搜索框匹配用） */
  const CAT_CN = { '精选': 'featured', '美女': 'beauty', '动漫': 'anime', '风景': 'landscape', '游戏': 'game',
    '文字': 'text', '视觉': 'abstract', '国风': 'chinese', '简约': 'minimal', '星空': 'space',
    '动物': 'animal', '城市': 'city', '汽车': 'car', '科技': 'tech', '手机': 'mobile' };

  /* Step 5H 修改 · 无后端降级：构造**同源代理地址**。
     Step 5G 起不再直连任何外站（原实现直连已全站 401 失效的 loremflickr，
     降级路径等于无效 —— 后端一挂前端就是灰黑占位图）。
     page 从 1 开始（与 Wallhaven 分页语义一致），lock 相应改为 (p-1)*12+i+1。 */
  function fallbackImages(catKey, p, sz, q) {
    const W = sz === 'mobile' ? 1080 : 1920;
    const H = sz === 'mobile' ? 1920 : 1080;
    const items = [];
    for (let i = 0; i < 12; i++) {
      const lock = (p - 1) * 12 + i + 1;
      const qs = 'cat=' + encodeURIComponent(catKey) +
        (q ? '&kw=' + encodeURIComponent(q) : '') +
        '&lock=' + lock;
      items.push({
        id: 'lb-' + catKey + '-' + lock,
        url: '/api/wallpaper-image?' + qs + '&w=' + W + '&h=' + H,
        thumb: '/api/wallpaper-image?' + qs + '&w=' + Math.round(W / 2) + '&h=' + Math.round(H / 2),
        w: W, h: H,
        title: (CATS.find(c => c.key === catKey)?.label || '壁纸').replace(/^\S+\s/, '') + ' · ' + lock
      });
    }
    return { items: items };
  }

  let rootEl = null;
  let seq = 0;
  let cat = 'featured';
  let size = 'pc'; /* pc | mobile */
  let page = 1;
  let ended = false;
  let searchQ = ''; /* 搜索词（未命中分类时作为后端 q 参数，后端据此拼Wallhaven 搜索词） */
  let autoRetries = 0; /* 过滤后可用图不足 6 张时自动补页次数（最多 3 次） */
  const seen = new Set(); /* 本次会话已加载图片完整 url 去重（代理地址靠 src 参数区分，split('?')[0] 会整页坍缩成一个 key，故必须用全 URL） */
  /* Step 9：请求缓存改用 core 层 LB.cache 单例 —— 原工具内 Map 在 mount() 时被
     cache.clear() 清空，导致「切走再切回」把 ~29 个图片请求全部重发一遍 */
  const seenIds = new Set(); /* 跨会话浏览历史（litebox_wall_seen，最多 200 条） */

  function today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* 稳定 hash：同一个日期串永远得到同一个索引（多端/多标签页一致） */
  function dayHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /* 统一用完整 url 作为浏览历史主键：网格卡片、精选卡片、灯箱三处拿到的都是
     data-url，键不一致会导致「看过但仍重复出现」。 */
  function imgId(x) { return String(x.url || x.id || ''); }

  /* ---------- 浏览历史 ---------- */

  function loadSeen() {
    const v = LB.storage.get(SEEN_KEY, []);
    if (Array.isArray(v)) v.forEach(id => seenIds.add(String(id)));
    /* 外部写入的历史可能超上限（如旧版本或手工改），截断后必须回写，否则 localStorage 一直超标 */
    if (seenIds.size > SEEN_MAX) {
      while (seenIds.size > SEEN_MAX) seenIds.delete(seenIds.values().next().value);
      saveSeen();
    }
  }

  function saveSeen() {
    const arr = [...seenIds];
    LB.storage.set(SEEN_KEY, arr.slice(-SEEN_MAX));
  }

  function markSeen(x) {
    const id = imgId(x);
    if (!id) return;
    seenIds.add(id);
    if (seenIds.size > SEEN_MAX) seenIds.delete(seenIds.values().next().value);
    saveSeen();
  }

  function clearSeen() {
    seenIds.clear();
    LB.storage.remove(SEEN_KEY);
    LB.toast('浏览记录已清除，接下来会重新展示这些图', 'ok');
    load(true);
  }

  /* Step 11 · B1：缩略图预加载。
     拿到 JSON 后先把前 4 张拉进浏览器缓存，再渲染网格 ——
     否则会出现「先铺 10 个空框、图一张张跳出来」的闪烁。
     任何一张失败或超时都立即放行：绝不让一张图卡住整个网格。 */
  const PRELOAD_N = 4;
  function preloadThumbs(items) {
    const list = (items || [])
      .map(x => String(x.thumb || x.url || ''))
      .filter(Boolean)
      .slice(0, PRELOAD_N);
    if (!list.length) return Promise.resolve();
    return Promise.all(list.map(url => new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const img = new Image();
      img.onload = finish;
      img.onerror = finish;
      img.src = url;
      setTimeout(finish, 4000);   /* 超时兜底：慢网也不至于一直等 */
    })));
  }

  async function loadImages(c, p, sz, q) {
    /* Step 9：整包（API + 兜底）放进 LB.cache（5 分钟），切走再切回不重发；
       失败自动失效，下次重试 */
    return LB.cache('wallpaper:' + c + ':' + p + ':' + sz + ':' + (q || ''), 5 * 60 * 1000, async function () {
      let data;
      if (HAS_API) {
        try {
          data = await LB.api.getJSON('/api/wallpaper?cat=' + encodeURIComponent(c) +
            (q ? '&q=' + encodeURIComponent(q) : '') +
            '&page=' + p + '&size=' + (sz === 'mobile' ? 'mobile' : 'pc'), { timeout: 5000 });
        } catch (_) { data = null; }
      }
      if (!data || !Array.isArray(data.items) || !data.items.length) data = fallbackImages(c, p, sz, q);
      return data;
    });
  }

  /* 搜索词命中分类则切分类，否则返回 null（由调用方走 q 关键词路径） */
  function matchCat(kw) {
    const k = kw.trim().toLowerCase();
    if (!k) return null;
    if (CAT_CN[kw.trim()]) return CAT_CN[kw.trim()];
    const hit = CATS.find(x => x.key.indexOf(k) > -1 || x.label.toLowerCase().indexOf(k) > -1);
    return hit ? hit.key : null;
  }

  function cardHtml(x) {
    return (
      '<div class="wp-card" data-url="' + esc(x.url || '') + '" data-title="' + esc(x.title || '') + '"' +
      (x.detail ? ' data-detail="' + esc(x.detail) + '"' : '') + '>' +
      '<img loading="lazy" decoding="async" alt="' + esc(x.title || '壁纸') + '" src="' + esc(x.thumb || x.url || '') + '" />' +
      '<span class="wp-cap">' + esc(x.title || '') + '</span>' +
      '</div>'
    );
  }

  /* Step 5D-2 修改 3 · 图片加载失败自动过滤：移除整卡；剩余 <6 自动补下一页 */
  function bindImgFallback(scope) {
    scope.querySelectorAll('.wp-card img').forEach(img => {
      img.addEventListener('error', function h() {
        img.removeEventListener('error', h);
        const card = img.closest('.wp-card');
        if (card) card.remove();
        maybeAutoLoad();
      });
    });
  }

  function maybeAutoLoad() {
    if (!rootEl || ended) return;
    const grid = $('#wpGrid', rootEl);
    if (grid.children.length < 6 && autoRetries < 3) {
      autoRetries++;
      page++;
      load(false);
    }
  }

  function updateBanner(items) {
    const x = items && items[0];
    if (!x) return;
    const b = $('#wpBanner', rootEl);
    b.hidden = false;
    b.style.backgroundImage = 'url("' + (x.thumb || x.url).replace(/"/g, '') + '")';
    $('#wpBannerTitle', rootEl).textContent = x.title || '每日精选';
  }

  /* ---------- 今日精选（当日固定） ----------
     Step 5I 已证伪：/api/wallpaper 的 q 参数不保证同一天返回同一张图（上游是随机接口），
     故「同一天固定不变」改由前端实现：把当日选中的图整体存进 localStorage。 */
  function showPick(x) {
    const box = $('#wpPick', rootEl);
    if (!box || !x) return;
    box.hidden = false;
    box.style.backgroundImage = 'url("' + (x.thumb || x.url).replace(/"/g, '') + '")';
    box.setAttribute('data-url', x.url || '');
    box.setAttribute('data-title', x.title || '');
    /* Step 36 · 三：详情页地址随精选一并保存，点开时才能换 4K 大图 */
    box.setAttribute('data-detail', x.detail || '');
    $('#wpPickDay', rootEl).textContent = today();
    $('#wpPickTitle', rootEl).textContent = x.title || '';
  }

  async function initPick() {
    const day = today();
    const saved = LB.storage.get(PICK_KEY, null);
    if (saved && saved.day === day && saved.url) { showPick(saved); return; }
    try {
      const data = await loadImages('featured', 1, size, '');
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return;
      const pick = items[dayHash(day) % items.length];
      LB.storage.set(PICK_KEY, { day, url: pick.url, thumb: pick.thumb, title: pick.title, detail: pick.detail || '' });
      showPick(pick);
    } catch (_) { /* 精选失败不影响主网格 */ }
  }

  function renderMore(items) {
    /* Step 6B-4：两级去重 —— ① 本次会话全 URL（保证翻页不重复）
       ② 跨会话浏览历史 litebox_wall_seen（**用户点开看过**的才记入，加载时过滤）
       过滤后新图不足 6 张时自动补下一页（最多 3 次），避免用户看到半空网格 */
    const fresh = items.filter(x => {
      const k = String(x.url || '');
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return !seenIds.has(imgId(x));
    });
    const grid = $('#wpGrid', rootEl);
    grid.insertAdjacentHTML('beforeend', fresh.map(cardHtml).join(''));
    bindImgFallback(grid);
    if (page === 1) updateBanner(items);
    if (fresh.length || grid.children.length) grid.hidden = false;

    /* 本页无新图，或新图不足 6 张 → 补下一页 */
    if (fresh.length < 6 && autoRetries < 3) {
      autoRetries++;
      page++;
      load(false);
      return;
    }
    if (fresh.length) {
      $('#wpMore', rootEl).hidden = false;
      $('#wpEnd', rootEl).hidden = true;
    } else if (grid.children.length) {
      ended = true;
      $('#wpMore', rootEl).hidden = true;
      const endTip = $('#wpEnd', rootEl);
      endTip.hidden = false;
      endTip.textContent = seenIds.size
        ? '这一类的图都看过了 · 点下方「清除浏览记录」可再看'
        : '已经到底啦 · 已自动去重';
    }
    if (!grid.children.length) {
      grid.hidden = true;
      showWpEmpty('这一类暂时没有可用图片', '换个关键词试试，或清除浏览记录再看', false);
      $('#wpBanner', rootEl).hidden = true;
    } else {
      $('#wpEmpty', rootEl).hidden = true;
    }
  }

  function busy(on) {
    const b = $('#wpMore', rootEl);
    if (!b.hidden) b.disabled = on;
    $('#wpRefresh', rootEl).disabled = on;
  }

  /* Step 8：加载态统一骨架屏 */
  function showWpLoading() {
    const box = $('#wpLoad', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 4, 'card');
  }

  /* Step 8：标准空状态（区分"没有图片"与"获取失败可重试"） */
  function showWpEmpty(title, sub, retryable) {
    const box = $('#wpEmpty', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: retryable ? '⚠️' : '🖼️',
      title: title,
      sub: sub,
      ctaText: retryable ? '换一批' : null,
      onCta: retryable ? () => load(true) : null
    });
  }

  async function load(reset) {
    const my = ++seq;
    if (reset) {
      page = 1;
      ended = false;
      autoRetries = 0;
      seen.clear(); /* 清空去重集：同分类重新加载应完整展示 */
      $('#wpGrid', rootEl).innerHTML = '';
      $('#wpGrid', rootEl).hidden = false;
      $('#wpEnd', rootEl).hidden = true;
      $('#wpMore', rootEl).hidden = false;
      $('#wpEmpty', rootEl).hidden = true;
    }
    showWpLoading();
    busy(true);
    try {
      const data = await loadImages(cat, page, size, searchQ);
      if (my !== seq) return;
      const items = Array.isArray(data.items) ? data.items : [];
      /* B1：先预加载前 4 张，加载完成（或超时）再渲染网格 */
      await preloadThumbs(items);
      if (my !== seq) return;
      renderMore(items);
    } catch (e) {
      if (my !== seq) return;
      $('#wpEnd', rootEl).hidden = true;
      LB.fail('壁纸', '图片服务暂时不可用', '检查网络后点击换一批重试');
      showWpEmpty('获取失败', '图片服务暂时不可用，请检查网络后重试', true);
    } finally {
      if (my === seq) {
        busy(false);
        $('#wpLoad', rootEl).hidden = true;
      }
    }
  }

  /* Step 5D-2 修改 4 · 切换分类：清空网格 + 去重集 + 搜索词，完全刷新 */
  async function switchCat(newCat) {
    /* Step 9：按分类前缀清掉旧分类的请求缓存，避免缓存无限增长 */
    LB.cache.clear('wallpaper:' + cat + ':');
    cat = newCat;
    searchQ = '';
    $('#wpQ', rootEl).value = '';
    await load(true); /* load(reset) 内部会置 page=1（Step 5I：三源统一 1-based）并清空网格与 seen */
  }

  /* Step 36 · 三：openLightbox 支持第三个参数 detail（4KDesk 详情页地址）——
     列表接口只有缩略图，灯箱先显示缩略图，同时按需调后端 detail 模式换 4K 原图；
     换图失败静默保留缩略图，同一张只换一次（lbSeq 防止快速开关灯箱串图） */
  let lbSeq = 0;
  async function openLightbox(url, title, detail) {
    const seqNo = ++lbSeq;
    $('#wpLbImg', rootEl).src = url;
    $('#wpLbOpen', rootEl).href = url;
    $('#wpLbTitle', rootEl).textContent = title || '';
    $('#wpLightbox', rootEl).hidden = false;
    if (!detail || !HAS_API) return;
    try {
      const d = await LB.api.getJSON('/api/wallpaper?detail=' + encodeURIComponent(detail), { timeout: 8000 });
      if (seqNo !== lbSeq) return; /* 灯箱已关闭或换了别的图，丢弃 */
      const big = d && Array.isArray(d.items) && d.items[0] && d.items[0].url;
      if (!big || big === url) return;
      $('#wpLbImg', rootEl).src = big;
      $('#wpLbOpen', rootEl).href = big;
    } catch (_) { /* 大图换不成就用列表给的地址，不打断浏览 */ }
  }

  function closeLightbox() {
    const lb = $('#wpLightbox', rootEl);
    if (lb) { lb.hidden = true; $('#wpLbImg', rootEl).src = ''; }
  }

  function chipsHtml() {
    return CATS.map(c => '<button class="chip" data-c="' + c.key + '" type="button">' + c.label + '</button>').join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>壁纸精选</h1><p>多分类高清壁纸，支持电脑 / 手机两种尺寸</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="wp-pick" id="wpPick" role="button" tabindex="0" hidden>' +
      '<span class="wp-pick-cap"><b>今日精选</b><span id="wpPickDay"></span><i id="wpPickTitle"></i></span>' +
      '</div>' +
      '<div class="wp-toprow">' +
      '<div class="seg" data-size-seg>' +
      '<button data-s="pc" class="on" type="button">🖥️ 电脑</button>' +
      '<button data-s="mobile" type="button">📱 手机</button>' +
      '</div>' +
      '</div>' +
      '<div class="hl-chips" id="wpChips">' + chipsHtml() + '</div>' +
      '<div class="wp-searchrow">' +
      '<input class="inp" id="wpQ" maxlength="30" placeholder="搜索壁纸关键词，如：星空 / 雪山 / 樱花" />' +
      '<button class="btn btn-main btn-sm" id="wpRefresh" type="button">🔄 换一批</button>' +
      '</div>' +
      '<div class="wp-banner" id="wpBanner" hidden><span class="wp-banner-cap" id="wpBannerTitle"></span></div>' +
      '<div id="wpLoad" hidden></div>' +
      '<div class="wp-grid" id="wpGrid"></div>' +
      /* Step 8：空态 / 错误态容器（内容由 LB.ui.empty 注入） */
      '<div id="wpEmpty" hidden></div>' +
      '<p class="hl-empty" id="wpEnd" hidden></p>' +
      '<button class="btn btn-ghost wp-more" id="wpMore" type="button">加载更多</button>' +
      '<button class="btn btn-ghost wp-clear" id="wpClearSeen" type="button">🗑 清除浏览记录</button>' +
      '<p class="cd-note">支持精选、美女、动漫、风景、游戏、文字、视觉、国风、简约、星空、动物、城市、汽车、科技、手机等分类。浏览记录只保存在本机浏览器（最多 200 条），用于避免重复推送看过的图。</p>' +
      '</div>' +
      '<div class="wp-lightbox" id="wpLightbox" hidden>' +
      '<button class="wp-lb-close" id="wpLbClose" type="button" aria-label="关闭">✕</button>' +
      '<img id="wpLbImg" alt="壁纸预览" />' +
      '<div class="wp-lb-bar"><span id="wpLbTitle"></span>' +
      '<a class="btn btn-main btn-sm" id="wpLbOpen" href="#" target="_blank" rel="noopener">打开原图</a></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    cat = 'featured'; size = 'pc'; page = 1; ended = false; searchQ = ''; autoRetries = 0;
    seen.clear(); /* 请求缓存 LB.cache 保留 —— 切走再切回不重发图片请求 */
    loadSeen();

    $('#wpChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b || b.getAttribute('data-c') === cat && !searchQ) { if (b) { document.querySelectorAll('#wpChips .chip').forEach(ch => ch.classList.toggle('on', ch === b)); } return; }
      document.querySelectorAll('#wpChips .chip').forEach(ch => ch.classList.toggle('on', ch === b));
      switchCat(b.getAttribute('data-c'));
    });
    /* 「换一批」= 重置后重新加载：清空网格与本次会话去重集，
       否则旧图仍留在页面里（历史过滤只拦新到的，翻页不重置会出现「换一批没反应」） */
    $('#wpRefresh', root).addEventListener('click', () => { if (!ended) load(true); });
    $('#wpMore', root).addEventListener('click', () => { if (!ended) { page++; load(false); } });
    $('#wpClearSeen', root).addEventListener('click', clearSeen);
    /* 今日精选：点击开大图（首屏已把该图记入历史，此处仅确保一定记录） */
    $('#wpPick', root).addEventListener('click', e => {
      const box = e.currentTarget;
      if (box.hidden) return;
      openLightbox(box.getAttribute('data-url'), box.getAttribute('data-title'), box.getAttribute('data-detail'));
      markSeen({ url: box.getAttribute('data-url') });
    });
    $('#wpQ', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const kw = $('#wpQ', root).value.trim();
      if (!kw) { searchQ = ''; load(true); return; }
      const hit = matchCat(kw);
      if (hit) {
        searchQ = '';
        cat = hit;
        document.querySelectorAll('#wpChips .chip').forEach(ch => ch.classList.toggle('on', ch.getAttribute('data-c') === hit));
      } else {
        /* 未命中分类：搜索词直接作为后端 q 参数（后端优先用 q 做 Wallhaven 搜索） */
        searchQ = kw;
      }
      load(true);
    });
    root.querySelector('[data-size-seg]').addEventListener('click', e => {
      const b = e.target.closest('[data-s]');
      if (!b || b.getAttribute('data-s') === size) return;
      size = b.getAttribute('data-s');
      root.querySelectorAll('[data-size-seg] > button').forEach(x => x.classList.toggle('on', x === b));
      load(true); /* 切换后清空网格重加载（竖版/横版） */
    });
    /* 点图放大 + 记入浏览历史 */
    $('#wpGrid', root).addEventListener('click', e => {
      const card = e.target.closest('.wp-card');
      if (!card) return;
      openLightbox(card.getAttribute('data-url'), card.getAttribute('data-title'), card.getAttribute('data-detail'));
      markSeen({ url: card.getAttribute('data-url') });
    });
    $('#wpLbClose', root).addEventListener('click', closeLightbox);
    $('#wpLightbox', root).addEventListener('click', e => { if (e.target.id === 'wpLightbox') closeLightbox(); });
    document.addEventListener('keydown', escHandler);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    initPick();
    load(true);
  }

  function escHandler(e) { if (e.key === 'Escape' && rootEl && !$('#wpLightbox', rootEl).hidden) closeLightbox(); }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    document.removeEventListener('keydown', escHandler);
    rootEl = null;
  }

  LB.router.register('wallpaper', { mount, unmount });
})();
