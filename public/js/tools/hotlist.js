/* LiteBox v5 · tools/hotlist.js — 热榜聚合（Step 30 · 一：全部数据改走自建后端 /api/60s）
 *
 * Step 30 · 一：
 *   - 保持既有 UI 结构：顶部 Tab 切换 + 列表 + 行内操作
 *   - 数据源全部切换为同源 /api/60s?type=xxx（不再走旧的热榜代理接口，
 *     前端也不持有任何上游路径 —— 站外域名只存在于 functions/api/60s.js）
 *   - 8 个来源：微博 / 知乎 / 抖音 / 头条 / B站 / 百度 / 小红书 / 豆瓣
 *   - 请求走 LB.api.getJSON
 *   - 点击条目：复制「标题 + 链接」，走 LB.copyNow（同步栈，用户手势内）
 *   - 下拉刷新（LB.ui.pull，页面顶部下拉手势 + 桌面端 pullPulse）
 *   - 加载态骨架屏（LB.ui.skeleton）
 *   - 错误态文案：「数据获取失败，请稍后重试」
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  /* 前端只留一次会话内的内存复用（LB.cache），与后端 5 分钟缓存同量级；
     下拉刷新会清掉对应 key，保证能真正再请求一次。 */
  const TTL = 5 * 60 * 1000;

  /* Step 30 · 一：保留六源并新增小红书 / 豆瓣。type 即后端 /api/60s?type= 的取值。 */
  const BOARDS = [
    { key: 'weibo', name: '微博', ic: '🔥' },
    { key: 'zhihu', name: '知乎', ic: '🤔' },
    { key: 'douyin', name: '抖音', ic: '🎵' },
    { key: 'toutiao', name: '头条', ic: '📰' },
    { key: 'bili', name: 'B站', ic: '📺' },
    { key: 'baidu', name: '百度', ic: '🔍' },
    { key: 'rednote', name: '小红书', ic: '📕' },
    { key: 'douban', name: '豆瓣', ic: '🎬' }
  ];

  /* Step 6E 的聚合搜索外链（用户主动点击才跳转，非数据路径，保留）
     ★ target=_blank 必须配 rel=noopener noreferrer。 */
  const ENGINES = [
    { k: 'baidu', ic: '🔍', t: '百度搜索', u: q => 'https://www.baidu.com/s?wd=' + encodeURIComponent(q) },
    { k: 'bili', ic: '📺', t: 'B站搜索', u: q => 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q) },
    { k: 'zhihu', ic: '🤔', t: '知乎搜索', u: q => 'https://www.zhihu.com/search?q=' + encodeURIComponent(q) }
  ];

  let rootEl = null;
  let seq = 0;
  let cur = 'weibo';

  function searchLinks(title) {
    return '<span class="hl-search-links">' + ENGINES.map(e =>
      '<a href="' + esc(e.u(title)) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="' + esc(title + ' · ' + e.t) + '" aria-label="' + esc(e.t + '：' + title) + '" ' +
      'data-eng="' + e.k + '">' + e.ic + '</a>'
    ).join('') + '</span>';
  }

  /* 响应容错解析：各榜字段不统一（title/name/keyword/word/show_name、
     link/url/murl/mobile_url、hot_value/score/rating/num…） */
  function parseHot(d) {
    const list = Array.isArray(d) ? d
      : (d && Array.isArray(d.data)) ? d.data
      : (d && Array.isArray(d.list)) ? d.list
      : [];
    return list.map(x => ({
      t: x.title || x.name || x.keyword || x.word || x.show_name || '',
      u: x.link || x.url || x.murl || x.mobile_url || '',
      h: x.hot_value || x.hot || x.heat || x.score || x.num || x.rating || ''
    })).filter(x => x.t).slice(0, 50);
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
        h += '<div class="hl-row" data-t="' + esc(x.t) + '" data-u="' + esc(x.u || '') + '" role="button" tabindex="0">' +
          '<span class="' + cls + '">' + no + '</span>' +
          '<span class="hl-t">' + esc(x.t) + '</span>' +
          (x.h !== '' && x.h !== undefined && x.h !== null ? '<small class="hl-h">' + esc(String(x.h)) + '</small>' : '') +
          searchLinks(x.t) +
          '</div>';
      }
      listEl.innerHTML = h;
    }
    $('#hlEmpty', rootEl).hidden = true;
    $('#hlErr', rootEl).hidden = true;
    listEl.hidden = false;
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

  async function load(board) {
    cur = board;
    document.querySelectorAll('#hlChips .chip').forEach(ch => ch.classList.toggle('on', ch.getAttribute('data-b') === board));
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
      '<div><h1>热榜聚合</h1><p>微博 / 知乎 / 抖音 / 头条 / B站 / 百度 / 小红书 / 豆瓣，八源热搜一页看全</p></div>' +
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
      '<p class="cd-note">在页面顶部下拉可刷新当前榜单；点击条目复制「标题 + 链接」，条目右侧图标跳转搜索。</p>' +
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
    $('#hlRetry', root).addEventListener('click', () => refresh());
    /* Step 30 · 一：整行点击 → 复制「标题 + 链接」（LB.copyNow 同步栈）
       ★ 先拦住 .hl-search-links 里的 <a>，否则一次点击同时复制又开新标签。 */
    $('#hlList', root).addEventListener('click', e => {
      const link = e.target.closest('.hl-search-links a');
      if (link) { e.stopPropagation(); return; }   /* 让浏览器按 href 正常打开新标签 */
      const row = e.target.closest('.hl-row');
      if (!row) return;
      const t = row.getAttribute('data-t') || '';
      const u = row.getAttribute('data-u') || '';
      LB.copyNow(u ? t + '\n' + u : t, '已复制标题' + (u ? '与链接' : ''));
    });
    /* 键盘可达：Enter / 空格与点击同一路径 */
    $('#hlList', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.hl-row');
      if (!row) return;
      e.preventDefault();
      const t = row.getAttribute('data-t') || '';
      const u = row.getAttribute('data-u') || '';
      LB.copyNow(u ? t + '\n' + u : t, '已复制标题' + (u ? '与链接' : ''));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.ui.pull(root, refresh);
    load('weibo'); /* 打开默认加载微博 */
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    if (rootEl) LB.ui.pullUnhook(rootEl);
    rootEl = null;
  }

  LB.router.register('hotlist', { mount, unmount });
})();
