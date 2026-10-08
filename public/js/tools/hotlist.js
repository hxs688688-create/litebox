/* LiteBox v5 · tools/hotlist.js — 热榜聚合（Step 30 · 一 / Step 31 · 热榜扩展）
 *
 * Step 31 变化（用户明确要求，推翻 Step 30「点击行=复制」的设定）：
 *   1) 榜单全部搬进来：BOARDS 从 8 源扩到 24 源（微博/知乎/抖音/头条/B站/百度/
 *      百度实时/贴吧/剧集/夸克/小红书/豆瓣影视综/HN/IT之家热榜/网易云六榜…），
 *      type 与后端 /api/60s?type= 一一对应，前端仍然不持有任何上游路径或域名。
 *   2) 行点击 = 跳转对应平台搜索该热搜（<a> 新标签页，rel=noopener noreferrer）。
 *      复制降级为行内独立按钮，仍走 LB.copyNow（同步栈，用户手势内）。
 *   3) 预加载：当前榜单渲染完成后，空闲时按顺序把其余榜单喂进 LB.cache
 *      （后端有 5 分钟缓存、前端有会话内缓存，预取成本极低，切 Tab 秒开）。
 *   4) 榜单多到一行放不下 → chips 横向滚动已有，加「自动把选中项滚进视野」。
 *
 * 保留：下拉刷新（LB.ui.pull）、骨架屏、错误态统一文案、seq 竞态守卫。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  /* 前端只留一次会话内的内存复用（LB.cache），与后端 5 分钟缓存同量级；
     下拉刷新会清掉对应 key，保证能真正再请求一次。 */
  const TTL = 5 * 60 * 1000;

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

  /* Step 31：行点击跳转「该热搜在其来源平台内的搜索」。
     与行右侧三个小图标同源（那些是跨平台聚合搜索，保留）；
     这里的 map 按榜单 host 决定跳哪个平台。 */
  const PLATFORM = {
    weibo: q => 'https://s.weibo.com/weibo?q=' + encodeURIComponent(q),
    zhihu: q => 'https://www.zhihu.com/search?type=content&q=' + encodeURIComponent(q),
    douyin: q => 'https://www.douyin.com/search/' + encodeURIComponent(q),
    toutiao: q => 'https://so.toutiao.com/search?keyword=' + encodeURIComponent(q),
    bili: q => 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q),
    baidu: q => 'https://www.baidu.com/s?wd=' + encodeURIComponent(q),
    tieba: q => 'https://tieba.baidu.com/f/search/res?ie=utf-8&qw=' + encodeURIComponent(q),
    quark: q => 'https://quark.cn/' ,   /* 夸克无公开 web 搜索直达页 → 行点击走原链接 */
    rednote: q => 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(q),
    douban: q => 'https://www.douban.com/search?q=' + encodeURIComponent(q),
    hn: q => 'https://hn.algolia.com/?query=' + encodeURIComponent(q),
    ithome: q => 'https://m.ithome.com/html/search/index.html?keyword=' + encodeURIComponent(q),
    ncm: q => 'https://music.163.com/#/search/m/?s=' + encodeURIComponent(q)
  };

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

  /* Step 31：行内独立「复制」按钮（原行点击复制降级为按钮） */
  function copyBtn() {
    return '<button class="hl-copy" type="button" aria-label="复制标题与链接" title="复制标题与链接">📋</button>';
  }

  /* 行跳转地址：优先上游给的原链接（就是该平台上这条热搜的页面），
     没有链接时退到「来源平台的站内搜索该标题」。
     夸克这类没有公开搜索直达页的，只在有原链接时可跳转。 */
  function rowHref(board, title, url) {
    if (url) return url;
    const b = BOARDS.find(x => x.key === board);
    const p = b && PLATFORM[b.host];
    if (!p || b.host === 'quark') return '';
    return p(title);
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

  /* 取热榜：同源 /api/60s?type=（LB.api.getJSON，超时 10s，与后端上游超时对齐） */
  async function fetchBoard(board) {
    if (!BOARDS.find(b => b.key === board)) throw new Error('数据获取失败，请稍后重试');
    if (!HAS_API) throw new Error('数据获取失败，请稍后重试');
    const d = await LB.api.getJSON('/api/60s?type=' + encodeURIComponent(board), { timeout: 10000 });
    const list = parseHot(d);
    if (!list.length) throw new Error('数据获取失败，请稍后重试');
    return list;
  }

  function loadBoard(board) {
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
        const href = rowHref(cur, x.t, x.u);
        h += '<div class="hl-row' + (href ? '' : ' hl-nourl') + '" data-t="' + esc(x.t) + '" data-u="' + esc(x.u || '') + '"' +
          (href ? ' data-h="' + esc(href) + '"' : '') + ' role="button" tabindex="0">' +
          '<span class="' + cls + '">' + no + '</span>' +
          '<span class="hl-t">' + esc(x.t) + (x.s ? '<small class="hl-sub">' + esc(x.s) + '</small>' : '') + '</span>' +
          (x.h !== '' && x.h !== undefined && x.h !== null ? '<small class="hl-h">' + esc(String(x.h)) + '</small>' : '') +
          copyBtn() +
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
     成本极低（后端已有 5 分钟缓存，预取就是把那批请求提前打一次），
     收益直接（切 Tab 秒开）。实现上注意三点：
       1) 空闲再跑：requestIdleCallback（无则 setTimeout 兜底），不与当前渲染抢帧；
       2) 串行、一次一个：并发打满 24 个 type 会把后端 isolate 的预算耗光；
       3) 失败静默：预加载只是优化，任何失败都不影响 UI，也不重试轰炸
          （下一个周期继续，后端 5 分钟缓存会自然收敛）。 */
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

  async function load(board) {
    cur = board;
    document.querySelectorAll('#hlChips .chip').forEach(ch => ch.classList.toggle('on', ch.getAttribute('data-b') === board));
    keepChipVisible(board);
    const my = ++seq;
    showLoading();
    try {
      const list = await loadBoard(board);
      if (my !== seq) return;
      render(list);
    } catch (e) {
      if (my !== seq) return;
      showErr();
    }
  }

  /* 下拉刷新：绕过前端缓存真正再请求一次（后端 5 分钟缓存在服务端生效） */
  function refresh() {
    LB.cache.clear('60s:hot:' + cur);
    return load(cur);
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
      '<p class="cd-note">在页面顶部下拉可刷新当前榜单；点击条目跳转对应平台搜索该热搜，条目右侧 📋 复制「标题 + 链接」，其余图标跳转其他平台搜索。</p>' +
      '</div>'
    );
  }

  /* 跳转（Step 31 的行点击行为）：新标签页打开来源平台
     ★ window.open 与 <a> 一样要在用户手势同步栈里调用 */
  function jump(row) {
    const href = row.getAttribute('data-h') || '';
    if (!href) { LB.toast('这条热搜没有可跳转的链接', 'info'); return; }
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#hlChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-b]');
      if (b && b.getAttribute('data-b') !== cur) load(b.getAttribute('data-b'));
    });
    $('#hlRetry', root).addEventListener('click', () => refresh());
    /* Step 31：行点击 → 跳转对应平台搜索；行内 📋 → 复制（LB.copyNow 同步栈）
       ★ 先拦住按钮与聚合搜索外链，避免一次点击同时触发跳转和复制。 */
    $('#hlList', root).addEventListener('click', e => {
      const link = e.target.closest('.hl-search-links a');
      if (link) return;                       /* 交给浏览器按 href 正常打开新标签 */
      const cp = e.target.closest('.hl-copy');
      if (cp) {
        e.stopPropagation();
        const row = cp.closest('.hl-row');
        if (!row) return;
        const t = row.getAttribute('data-t') || '';
        const u = row.getAttribute('data-u') || '';
        LB.copyNow(u ? t + '\n' + u : t, '已复制标题' + (u ? '与链接' : ''));
        return;
      }
      const row = e.target.closest('.hl-row');
      if (!row) return;
      jump(row);
    });
    /* 键盘可达：Enter / 空格与点击同一路径 */
    $('#hlList', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.hl-row');
      if (!row) return;
      e.preventDefault();
      jump(row);
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
