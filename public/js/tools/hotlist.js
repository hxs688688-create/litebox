/* LiteBox v5 · tools/hotlist.js — 热榜聚合（同源 /api/hotlist + 10 分钟持久化缓存 + 聚合搜索）
 *
 * Step 26 · 前置安全策略：本文件不再直连任何第三方镜像。
 * 原 Step 6 的「同源失败 → 依次试 5 个 60s 镜像」降级链已删除 ——
 * 多镜像并发容错早就在 functions/api/hotlist.js 里用 Promise.any 做好了，
 * 前端再留一份直连，等于绕开自己的后端：Network 面板会出现站外域名，
 * 而且浏览器直连还容易被 CORS / 混合内容拦掉。现在只保留同源一条数据路径。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const TTL = 10 * 60 * 1000;
  const KEY_PREFIX = 'lb_hot_cache_';

  /* 热榜源配置（任务给定）。
     Step 26 · 四：影视 / 实时票房 / 豆瓣高分三个 tab 已移除，
     票房改由独立工具「实时票房」承载，热榜只保留综合资讯类榜单。
     board → 站外路径的映射只在后端，前端不再持有。 */
  const BOARDS = [
    { key: 'weibo', name: '微博', ic: '🔥' },
    { key: 'zhihu', name: '知乎', ic: '🤔' },
    { key: 'douyin', name: '抖音', ic: '🎵' },
    { key: 'toutiao', name: '头条', ic: '📰' },
    { key: 'bili', name: 'B站', ic: '📺' },
    { key: 'baidu', name: '百度', ic: '🔍' }
  ];

  /* Step 26：第三方镜像列表已删除，热榜只走同源 /api/hotlist（多镜像容错在后端） */

  let rootEl = null;
  let seq = 0;
  let cur = 'weibo';
  const cache = new Map(); /* key: board → { ts, list } 内存缓存（本次会话内更快命中，省一次 JSON.parse） */

  /* Step 6E：把某条热搜词送到 3 个搜索站点（点开新标签页）
     —— 用 title 而非文字做图标，悬停有 title 提示，且不破坏 .hl-t 的排版。
     ★ target=_blank 必须配 rel=noopener noreferrer，否则新页可通过 window.opener 反向操纵本页。 */
  const ENGINES = [
    { k: 'baidu', ic: '🔍', t: '百度搜索', u: q => 'https://www.baidu.com/s?wd=' + encodeURIComponent(q) },
    { k: 'bili', ic: '📺', t: 'B站搜索', u: q => 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q) },
    { k: 'zhihu', ic: '🤔', t: '知乎搜索', u: q => 'https://www.zhihu.com/search?q=' + encodeURIComponent(q) }
  ];

  function searchLinks(title) {
    return '<span class="hl-search-links">' + ENGINES.map(e =>
      '<a href="' + esc(e.u(title)) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="' + esc(title + ' · ' + e.t) + '" aria-label="' + esc(e.t + '：' + title) + '" ' +
      'data-eng="' + e.k + '">' + e.ic + '</a>'
    ).join('') + '</span>';
  }

  /* Step 26：directJSON（直连第三方镜像）已删除，数据只走同源 */

  /* 响应容错解析（任务给定；Step 6K 增加豆瓣评分兜底） */
  function parseHot(d) {
    const list = Array.isArray(d) ? d
      : (d && Array.isArray(d.data)) ? d.data
      : (d && Array.isArray(d.list)) ? d.list
      : [];
    return list.map(x => ({
      t: x.title || x.name || x.keyword || x.word || x.show_name || '',
      u: x.link || x.url || x.murl || x.mobile_url || '',
      h: x.hot_value || x.hot || x.heat || x.score || x.num || ''
    })).filter(x => x.t).slice(0, 50);
  }

  /* Step 6E：持久化缓存（10 分钟）
     —— 原实现只有内存 Map，切走再回来（同一次会话内）能命中，但刷新页面就丢，
     会重新触发 6 个镜像的串行请求（最坏 3.5s × 5）。
     改为「内存 Map + localStorage」双层，结构沿用 fxrate.js 的 { ts, data } 范式。
     写入用 try/catch 包住：localStorage 在隐私模式或配额满时会抛，
     不能因为缓存写失败就让整个热榜挂掉。 */
  function cacheKey(board) { return KEY_PREFIX + board; }

  function readCache(board) {
    const hit = cache.get(board);
    if (hit && Date.now() - hit.ts < TTL) return { list: hit.list, note: hit.note || '' };
    try {
      const box = LB.storage.get(cacheKey(board), null);
      if (box && Array.isArray(box.list) && box.list.length && Date.now() - box.ts < TTL) {
        cache.set(board, { ts: box.ts, list: box.list, note: box.note || '' });
        return { list: box.list, note: box.note || '' };
      }
    } catch (_) { /* 读缓存失败就当没有，走网络 */ }
    return null;
  }

  function writeCache(board, list, note) {
    cache.set(board, { ts: Date.now(), list: list, note: note || '' });
    try { LB.storage.set(cacheKey(board), { ts: Date.now(), list: list, note: note || '' }); }
    catch (_) { /* 配额满等，仅保留内存缓存 */ }
  }

  /* 取热榜：内存/localStorage 缓存 → 同源 /api/hotlist?board=
     —— Step 26：原来的「同源失败再直连 5 个站外镜像」分支已删；
        多镜像并发容错由 functions/api/hotlist.js 用 Promise.any 完成，
        前端只认同源，超时给到 8s（后端内部每个源 3.5s）。 */
  async function fetchBoard(board) {
    const cached = readCache(board);
    if (cached) return cached;
    if (!BOARDS.find(b => b.key === board)) throw new Error('bad-board');
    if (!HAS_API) throw new Error('no-api');

    const d = await LB.api.getJSON('/api/hotlist?board=' + encodeURIComponent(board), { timeout: 8000 });
    const list = parseHot(d);
    if (!list.length) throw new Error('empty');
    writeCache(board, list, '');
    return { list: list, note: '' };
  }

  function render(list, note) {
    if (!rootEl) return;
    const listEl = $('#hlList', rootEl);
    if (!list.length) {
      /* Step 8：标准空状态（防御分支：fetchBoard 空列表会抛错，正常不会走到） */
      LB.ui.empty(listEl, {
        icon: '🔥',
        title: '该榜单暂时没有内容',
        sub: '稍后再试，或换个榜单看看'
      });
    } else {
      let h = '';
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        const no = i + 1;
        const cls = no <= 3 ? ' hl-no hl-no' + no : ' hl-no';
        h += '<div class="hl-row' + (x.u ? '' : ' hl-nourl') + '" data-u="' + esc(x.u || '') + '">' +
          '<span class="' + cls + '">' + no + '</span>' +
          '<span class="hl-t">' + esc(x.t) + '</span>' +
          (x.h !== '' && x.h !== undefined && x.h !== null ? '<small class="hl-h">' + esc(String(x.h)) + '</small>' : '') +
          searchLinks(x.t) +
          '</div>';
      }
      listEl.innerHTML = h;
    }
    /* 兜底来源提示（当前六个榜单都不产生提示，保留通道） */
    const noteEl = $('#hlNote', rootEl);
    if (noteEl) {
      noteEl.textContent = note || '';
      noteEl.hidden = !note;
    }
    $('#hlEmpty', rootEl).hidden = true;
    $('#hlErr', rootEl).hidden = true;
    listEl.hidden = false;
  }

  function showLoading() {
    /* Step 8：加载态从「正在加载…」文案换成骨架屏 */
    $('#hlErr', rootEl).hidden = true;
    const noteEl = $('#hlNote', rootEl);
    if (noteEl) noteEl.hidden = true;
    const listEl = $('#hlList', rootEl);
    listEl.hidden = false;
    LB.ui.skeleton(listEl, 6, 'list');
  }

  function showErr() {
    if (!rootEl) return;
    $('#hlList', rootEl).hidden = true;
    $('#hlEmpty', rootEl).hidden = true;
    const noteEl = $('#hlNote', rootEl);
    if (noteEl) noteEl.hidden = true;
    $('#hlErr', rootEl).hidden = false;
    /* Step 8：统一三段式错误提示 */
    LB.fail('热榜', '所有数据源都暂时不可用', '检查网络后点击重试');
  }

  async function load(board) {
    cur = board;
    document.querySelectorAll('#hlChips .chip').forEach(ch => ch.classList.toggle('on', ch.getAttribute('data-b') === board));
    const my = ++seq;
    showLoading();
    try {
      const r = await fetchBoard(board);
      if (my !== seq) return;
      render(r.list, r.note);
    } catch (e) {
      if (my !== seq) return;
      showErr();
    }
  }

  function chipsHtml() {
    return BOARDS.map(b => '<button class="chip" data-b="' + b.key + '" type="button">' + b.ic + ' ' + b.name + '</button>').join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>热榜聚合</h1><p>微博 / 知乎 / 抖音 / 头条 / B站 / 百度，六源热搜一页看全</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="hl-chips" id="hlChips">' + chipsHtml() + '</div>' +
      '<p class="cd-note hl-note" id="hlNote" hidden></p>' +
      '<div class="card hl-card">' +
      '<div id="hlList" hidden></div>' +
      '<p class="hl-empty" id="hlEmpty" hidden></p>' +
      /* Step 8：错误态换成标准空状态卡片（含重试 CTA） */
      '<div id="hlErr" hidden><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">暂时无法获取热榜数据</p>' +
      '<p class="es-sub">所有数据源都暂时不可用，请检查网络后重试</p>' +
      '<button class="btn btn-main es-cta" id="hlRetry" type="button">重新获取</button>' +
      '</div></div>' +
      '</div>' +
      '<p class="cd-note">热榜数据 10 分钟内缓存复用；悬停条目可跳转百度 / B站 / 知乎搜索，点击条目在新标签页打开原文。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#hlChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-b]');
      if (b && b.getAttribute('data-b') !== cur) load(b.getAttribute('data-b'));
    });
    $('#hlRetry', root).addEventListener('click', () => load(cur));
    /* 整行点击 → 新标签页打开链接（无链接禁用）
       ★ Step 6E：必须先拦住 .hl-search-links 里的 <a>。
         它们位于 .hl-row 内部，若不阻止冒泡，点击搜索图标会同时
         打开「原文链接」和「搜索结果」两个标签页。
         用 stopPropagation 而非 preventDefault：a 自带的 target=_blank 照常生效。 */
    $('#hlList', root).addEventListener('click', e => {
      const link = e.target.closest('.hl-search-links a');
      if (link) { e.stopPropagation(); return; }   /* 让浏览器按 href 正常打开新标签 */
      const row = e.target.closest('.hl-row');
      if (!row) return;
      const u = row.getAttribute('data-u');
      if (u) window.open(u, '_blank', 'noopener');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load('weibo'); /* 打开默认加载微博 */
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    rootEl = null;
  }

  LB.router.register('hotlist', { mount, unmount });
})();
