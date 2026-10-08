/* LiteBox v5 · tools/hotlist.js — 热榜聚合（Step 30 · 一 / Step 31 · 热榜扩展 / Step 32 · 缓存与排版）
 *
 * Step 32 变化（用户实测：手机端下拉刷新拿到的还是旧内容）：
 *   1) 所有 /api/60s 请求带 &_t=<时间戳>，绕开 WebKit/CF 边缘可能存在的响应缓存；
 *   2) 下拉刷新走 force 通道：先清前端缓存再请求，绝不复用进行中的 Promise；
 *   3) 前端会话缓存 TTL 与后端对齐（后端已从 5 分钟缩到 1 分钟）；
 *   4) 排版：撤掉行内独立复制按钮（📋），恢复「点击整行 = 复制标题 + 链接」，
 *      行内边距放宽，375px 无横向滚动。跳转能力仍在行右侧三个搜索图标里。
 *
 * Step 31 变化（保留 24 榜与预加载；行点击方式已被 Step 32 推翻）：
 *   1) 榜单全部搬进来：BOARDS 从 8 源扩到 24 源（微博/知乎/抖音/头条/B站/百度/
 *      百度实时/贴吧/剧集/夸克/小红书/豆瓣影视综/HN/IT之家热榜/网易云六榜…），
 *      type 与后端 /api/60s?type= 一一对应，前端仍然不持有任何上游路径或域名。
 *   2) 预加载：当前榜单渲染完成后，空闲时按顺序把其余榜单喂进 LB.cache
 *      （后端有 1 分钟缓存、前端有会话内缓存，预取成本极低，切 Tab 秒开）。
 *   3) 榜单多到一行放不下 → chips 横向滚动已有，加「自动把选中项滚进视野」。
 *
 * 保留：下拉刷新（LB.ui.pull）、骨架屏、错误态统一文案、seq 竞态守卫。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  /* Step 32：后端缓存已缩到 1 分钟，前端会话缓存同量级，避免两端新鲜度差异过大；
     下拉刷新走 force 通道（清 key + 绕开进行中的 Promise），保证真正再请求一次。 */
  const TTL = 60 * 1000;

  /* Step 31：60s API 实际可用榜单全部列出（key 即后端 /api/60s?type= 的取值）。
     个别 type 上游间歇失败（rednote 镜像偶发 code 500），回退链与冷却在后端处理。 */
  const BOARDS = [
    { key: 'weibo', name: '微博', ic: '🔥', host: 'weibo' },
    { key: 'zhihu', name: '知乎', ic: '🤔', host: 'zhihu' },
    { key: 'douyin', name: '抖音', ic: '🎵', host: 'douyin' },
    { key: 'toutiao', name: '头条', ic: '📰', host: 'toutiao' },
    { key: 'bili', name: 'B站', ic: '📺', host: 'bili' },
    { key: 'baidu', name: '百度', ic: '🔍', host: 'baidu' },
    { key: 'baidu-realtime', name: '百度实时', ic: '⚡', host: 'baidu' },
    { key: 'tieba', name: '贴吧', ic: '💬', host: 'tieba' },
    { key: 'teleplay', name: '剧集', ic: '📼', host: 'baidu' },
    { key: 'quark', name: '夸克', ic: '🧲', host: 'quark' },
    { key: 'rednote', name: '小红书', ic: '📕', host: 'rednote' },
    { key: 'douban', name: '豆瓣电影', ic: '🎬', host: 'douban' },
    { key: 'douban-tv', name: '豆瓣剧集', ic: '🎞️', host: 'douban' },
    { key: 'douban-tv-global', name: '豆瓣美剧', ic: '🌍', host: 'douban' },
    { key: 'douban-show', name: '豆瓣综艺', ic: '🎤', host: 'douban' },
    { key: 'douban-show-global', name: '豆瓣海外综艺', ic: '🛰️', host: 'douban' },
    { key: 'hackernews', name: 'HN热榜', ic: '🟠', host: 'hn' },
    { key: 'hackernews-best', name: 'HN最佳', ic: '🏆', host: 'hn' },
    { key: 'ithome-rank', name: 'IT之家', ic: '💻', host: 'ithome' },
    { key: 'ncm-heat', name: '云村热歌', ic: '🎧', host: 'ncm' },
    { key: 'ncm-rise', name: '云村飙升', ic: '📈', host: 'ncm' },
    { key: 'ncm-new', name: '云村新歌', ic: '🎼', host: 'ncm' },
    { key: 'ncm-original', name: '云村原创', ic: '🎻', host: 'ncm' },
    { key: 'ncm-acg', name: '云村ACG', ic: '🌸', host: 'ncm' }
  ];

  /* Step 6E 的聚合搜索外链（用户主动点击才跳转，非数据路径，保留）
     ★ target=_blank 必须配 rel=noopener noreferrer。 */
  const ENGINES = [
    { k: 'baidu', ic: '🔍', t: '百度搜索', u: q => 'https://www.baidu.com/s?wd=' + encodeURIComponent(q) },
    { k: 'bili', ic: '📺', t: 'B站搜索', u: q => 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q) },
    { k: 'zhihu', ic: '🤔', t: '知乎搜索', u: q => 'https://www.zhihu.com/search?type=content&q=' + encodeURIComponent(q) }
  ];

  let rootEl = null;
  let seq = 0;
  let cur = 'weibo';
  let preloadTimer = null;   /* Step 31：空闲预加载调度句柄 */
  let preloaded = false;     /* Step 31：每次进入工具只排一轮预加载 */

  function searchLinks(title) {
    return '<span class="hl-search-links">' + ENGINES.map(e =>
      '<a href="' + esc(e.u(title)) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="' + esc(title + ' · ' + e.t) + '" aria-label="' + esc(e.t + '：' + title) + '" ' +
      'data-eng="' + e.k + '">' + e.ic + '</a>'
    ).join('') + '</span>';
  }

  /* 响应容错解析：各榜字段不统一（title/name/keyword/word/show_name、
     link/url/murl/mobile_url、hot_value/score/rating/num…；
     ncm 的歌曲榜用 artist 数组 + popularity） */
  function parseHot(d) {
    const list = Array.isArray(d) ? d
      : (d && Array.isArray(d.data)) ? d.data
      : (d && Array.isArray(d.list)) ? d.list
      : [];
    return list.map(x => {
      const artist = Array.isArray(x.artist) ? x.artist.map(a => a && a.name).filter(Boolean).join(' / ') : '';
      return {
        t: x.title || x.name || x.keyword || x.word || x.show_name || '',
        u: x.link || x.url || x.murl || x.mobile_url || '',
        h: x.hot_value_desc || x.hot_value || x.score_desc || x.score || x.popularity || x.rating || x.num || x.heat || '',
        s: artist
      };
    }).filter(x => x.t).slice(0, 50);
  }

  /* 取热榜：同源 /api/60s?type=（LB.api.getJSON，超时 10s，与后端上游超时对齐）。
     Step 32：URL 带 &_t=<时间戳> —— 手机端 / CF 边缘可能按 URL 缓存响应，
     不带防缓存参数时下拉刷新会命中旧内容（用户实测问题）。 */
  async function fetchBoard(board) {
    if (!BOARDS.find(b => b.key === board)) throw new Error('数据获取失败，请稍后重试');
    if (!HAS_API) throw new Error('数据获取失败，请稍后重试');
    const d = await LB.api.getJSON('/api/60s?type=' + encodeURIComponent(board) +
      '&_t=' + Date.now(), { timeout: 10000 });
    const list = parseHot(d);
    if (!list.length) throw new Error('数据获取失败，请稍后重试');
    return list;
  }

  /* force = 下拉刷新：先清 key，再直接发请求，绝不复用缓存里那个进行中的 Promise */
  function loadBoard(board, force) {
    if (force) {
      LB.cache.clear('60s:hot:' + board);
      return fetchBoard(board);
    }
    return LB.cache('60s:hot:' + board, TTL, () => fetchBoard(board));
  }

  function render(list) {
    if (!rootEl) return;
    const listEl = $('#hlList', rootEl);
    if (!list.length) {
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
        h += '<div class="hl-row" data-t="' + esc(x.t) + '" data-u="' + esc(x.u || '') + '" role="button" tabindex="0">' +
          '<span class="' + cls + '">' + no + '</span>' +
          '<span class="hl-t">' + esc(x.t) + (x.s ? '<small class="hl-sub">' + esc(x.s) + '</small>' : '') + '</span>' +
          (x.h !== '' && x.h !== undefined && x.h !== null ? '<small class="hl-h">' + esc(String(x.h)) + '</small>' : '') +
          searchLinks(x.t) +
          '</div>';
      }
      listEl.innerHTML = h;
    }
    $('#hlEmpty', rootEl).hidden = true;
    $('#hlErr', rootEl).hidden = true;
    listEl.hidden = false;
    /* Step 31：当前榜单到手，开始空闲预加载其余榜单 */
    schedulePreload();
  }

  function showLoading() {
    $('#hlErr', rootEl).hidden = true;
    const listEl = $('#hlList', rootEl);
    listEl.hidden = false;
    LB.ui.skeleton(listEl, 6, 'list');
  }

  function showErr() {
    if (!rootEl) return;
    $('#hlList', rootEl).hidden = true;
    $('#hlEmpty', rootEl).hidden = true;
    $('#hlErr', rootEl).hidden = false;
    /* Step 30 · 一：错误态统一文案「数据获取失败，请稍后重试」 */
    LB.fail('热榜', '数据获取失败', '请稍后重试');
  }

  /* ============ Step 31 · 预加载 ============
     用户既然问了「你觉得呢」，这里正面表态：值得做。
     成本极低（后端已有 1 分钟缓存，预取就是把那批请求提前打一次），
     收益直接（切 Tab 秒开）。实现上注意三点：
       1) 空闲再跑：requestIdleCallback（无则 setTimeout 兜底），不与当前渲染抢帧；
       2) 串行、一次一个：并发打满 24 个 type 会把后端 isolate 的预算耗光；
       3) 失败静默：预加载只是优化，任何失败都不影响 UI，也不重试轰炸
          （下一个周期继续，后端 1 分钟缓存会自然收敛）。 */
  function schedulePreload() {
    if (!HAS_API || !rootEl) return;
    if (preloaded) return;                       /* 每次进入工具只排一轮，切榜不重跑 */
    preloaded = true;
    cancelPreload();
    const queue = BOARDS.map(b => b.key).filter(k => k !== cur);
    let i = 0;
    const step = () => {
      preloadTimer = null;
      if (!rootEl || i >= queue.length) return;      /* 已切走或队列跑完 */
      const key = queue[i++];
      loadBoard(key).catch(() => { /* 预加载失败静默 */ }).then(() => {
        if (!rootEl || i >= queue.length) return;
        preloadTimer = idleFn(step, { timeout: 1200 });
      });
    };
    preloadTimer = idleFn(step, { timeout: 1500 });
  }

  /* requestIdleCallback 在 Safari 上不存在，统一退化成延时；句柄共用一个变量 */
  const idleFn = window.requestIdleCallback ? (fn, opt) => window.requestIdleCallback(fn, opt)
    : (fn, opt) => setTimeout(fn, opt && opt.timeout ? opt.timeout : 200);
  function cancelPreload() {
    if (!preloadTimer) return;
    if (window.cancelIdleCallback) cancelIdleCallback(preloadTimer);
    else clearTimeout(preloadTimer);
    preloadTimer = null;
  }

  /* 把选中 chip 滚进视野（榜单一多，选中的可能在屏幕外）。
     只在它真的不全在可视区里时才滚 —— 榜单已经点开了还每次平滑挪一下，
     既晃眼又会和紧随其后的点击手势打架。 */
  function keepChipVisible(board) {
    const chip = $('#hlChips .chip[data-b="' + board + '"]', rootEl);
    const wrap = $('#hlChips', rootEl);
    if (!chip || !wrap) return;
    const cr = chip.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    if (cr.left >= wr.left && cr.right <= wr.right) return;   /* 已完全可见 */
    const left = chip.offsetLeft - wrap.offsetLeft;
    const target = Math.max(0, left - wrap.clientWidth / 2 + chip.offsetWidth / 2);
    wrap.scrollTo({ left: target, behavior: 'smooth' });
  }

  async function load(board, force) {
    cur = board;
    document.querySelectorAll('#hlChips .chip').forEach(ch => ch.classList.toggle('on', ch.getAttribute('data-b') === board));
    keepChipVisible(board);
    const my = ++seq;
    showLoading();
    try {
      const list = await loadBoard(board, force);
      if (my !== seq) return;
      render(list);
    } catch (e) {
      if (my !== seq) return;
      showErr();
    }
  }

  /* 下拉刷新：force 通道绕过前端缓存真正再请求一次（后端 1 分钟缓存在服务端生效） */
  function refresh() {
    return load(cur, true);
  }

  function chipsHtml() {
    return BOARDS.map(b => '<button class="chip" data-b="' + b.key + '" type="button">' + b.ic + ' ' + b.name + '</button>').join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>热榜聚合</h1><p>微博 / 知乎 / 抖音 / 头条 / B站 / 百度 / 小红书 / 豆瓣 / HN / IT之家 / 网易云，' + BOARDS.length + ' 个榜单一页看全</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="hl-chips" id="hlChips">' + chipsHtml() + '</div>' +
      '<div class="card hl-card">' +
      '<div class="ptr-tip" aria-hidden="true"><span class="ptr-ic">↓</span><span class="ptr-txt">下拉刷新</span></div>' +
      '<div id="hlList" class="ptr-scroll" hidden></div>' +
      '<p class="hl-empty" id="hlEmpty" hidden></p>' +
      '<div id="hlErr" hidden><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">数据获取失败，请稍后重试</p>' +
      '<p class="es-sub">榜单接口暂时不可用，可稍后重试或换个榜单</p>' +
      '<button class="btn btn-main es-cta" id="hlRetry" type="button">重新获取</button>' +
      '</div></div>' +
      '</div>' +
      '<p class="cd-note">在页面顶部下拉可刷新当前榜单；点击条目复制「标题 + 链接」，条目右侧图标跳转对应平台搜索该热搜。</p>' +
      '</div>'
    );
  }

  /* Step 32：点击整行 = 复制「标题 + 链接」（LB.copyNow 同步栈，用户手势内）。
     跳转能力保留在行右侧三个搜索图标（<a target=_blank>，浏览器原生打开）。 */
  function copyRow(row) {
    const t = row.getAttribute('data-t') || '';
    const u = row.getAttribute('data-u') || '';
    LB.copyNow(u ? t + '\n' + u : t, '已复制标题' + (u ? '与链接' : ''));
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#hlChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-b]');
      if (b && b.getAttribute('data-b') !== cur) load(b.getAttribute('data-b'));
    });
    $('#hlRetry', root).addEventListener('click', () => refresh());
    /* Step 32：行点击 → 复制；行右侧搜索外链交给浏览器按 href 正常打开新标签 */
    $('#hlList', root).addEventListener('click', e => {
      if (e.target.closest('.hl-search-links a')) return;
      const row = e.target.closest('.hl-row');
      if (!row) return;
      copyRow(row);
    });
    /* 键盘可达：Enter / 空格与点击同一路径 */
    $('#hlList', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.hl-row');
      if (!row) return;
      e.preventDefault();
      copyRow(row);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.ui.pull(root, refresh);
    load('weibo'); /* 打开默认加载微博 */
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    cancelPreload();  /* 切走就停止预加载，别在后台白耗流量 */
    if (rootEl) LB.ui.pullUnhook(rootEl);
    rootEl = null;
  }

  LB.router.register('hotlist', { mount, unmount });
})();
