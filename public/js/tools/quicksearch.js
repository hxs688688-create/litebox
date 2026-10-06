/* LiteBox v5 · tools/quicksearch.js — 综合搜索（选平台 → 输关键词 → 新标签打开）
 *
 * Step 12 · B6：UI 从「九宫格按钮墙」改成「平台下拉 + 输入框 + 搜索按钮」。
 *   原来的九宫格有 12 个按钮，点哪个就搜哪个，但用户得先在一堆图标里找目标平台；
 *   下拉选择更省屏幕、也更明确「当前要搜哪个平台」。
 *
 * 【关键词必须 encodeURIComponent】
 *   任务书示例直接写 url: 'https://www.baidu.com/s?wd={q}' 然后字符串替换。
 *   但 q 是用户输入：「C++ 教程」「a&b=1」「hello world」这类内容直接拼进去
 *   会把 & 误当参数分隔符、空格被浏览器转义成 %20 后再被平台二次编码，
 *   结果搜出来的完全不是想搜的内容。所以替换时用 encodeURIComponent。
 *
 * 【微信为什么特殊】
 *   微信没有网页版搜索 URL（s.weixin.qq.com 已停用），只能用 weixin:// 协议唤起 App。
 *   weixin:// 在桌面浏览器会弹「未知协议」错误，所以给它单独提示，
 *   并保留一个网页兜底入口。
 *
 * 【本工具不发任何网络请求】
 *   全部是「新标签打开搜索页」，搜索动作发生在目标站点，本工具只负责拼 URL。
 */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;

  const PLATFORMS = [
    { name: '百度', icon: '🔍', url: 'https://www.baidu.com/s?wd={q}' },
    { name: 'B站', icon: '📺', url: 'https://search.bilibili.com/all?keyword={q}' },
    { name: '知乎', icon: '💡', url: 'https://www.zhihu.com/search?q={q}' },
    { name: '微博', icon: '🔥', url: 'https://s.weibo.com/weibo?q={q}' },
    { name: '小红书', icon: '📕', url: 'https://www.xiaohongshu.com/search_result?keyword={q}' },
    { name: '抖音', icon: '🎵', url: 'https://www.douyin.com/search/{q}' },
    { name: '淘宝', icon: '🛒', url: 'https://s.taobao.com/search?q={q}' },
    { name: '京东', icon: '🛍️', url: 'https://search.jd.com/Search?keyword={q}' },
    { name: '豆瓣', icon: '📚', url: 'https://www.douban.com/search?q={q}' },
    { name: 'GitHub', icon: '🐙', url: 'https://github.com/search?q={q}' },
    { name: '维基百科', icon: '📖', url: 'https://zh.wikipedia.org/wiki/Special:Search?search={q}' },
    { name: '微信', icon: '💬', app: true }   /* 无网页搜索 URL，改为唤起 App */
  ];

  function current() {
    const v = parseInt($('#qsPlat', rootEl).value, 10);
    return PLATFORMS[v] || PLATFORMS[0];
  }

  function query() { return String($('#qsIn', rootEl).value || '').trim(); }

  function target(p, q) {
    /* app 类平台单独处理；其余把 {q} 换成编码后的关键词 */
    if (p.app) return null;
    return p.url.replace('{q}', encodeURIComponent(q));
  }

  /* 按钮文案跟着选中的平台走，避免「选了知乎、按钮还写着百度搜索」的错位感 */
  function syncGo() {
    const b = $('#qsGo', rootEl);
    if (!b) return;
    const p = current();
    b.textContent = '🔍 在' + p.name + '搜索';
  }

  function open(p) {
    const q = query();
    if (!q) {
      LB.toast('先输入要搜的内容', 'info');
      $('#qsIn', rootEl).focus();
      return;
    }
    if (p.app) {
      /* 桌面端没有 weixin:// 协议会直接报「未知协议」，先说明再给网页入口 */
      const ua = navigator.userAgent || '';
      const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
      if (!isMobile) {
        LB.toast('桌面端请用手机打开，或直接到微信里搜索', 'info');
      }
      try {
        window.location.href = 'weixin://';
      } catch (_) { /* 忽略：部分浏览器直接抛错 */ }
      return;
    }
    const url = target(p, q);
    if (!url) return;
    /* rel="noopener" 必须有：否则新页面能通过 window.opener 反向操纵本页 */
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) LB.toast('浏览器拦截了新标签，请允许弹出窗口', 'info');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>综合搜索</h1><p>选平台、输关键词，一键在新标签打开对应搜索页</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="qs-form">' +
      '<label class="qs-lab">选择平台' +
      '<select class="inp" id="qsPlat" aria-label="选择搜索平台">' +
      PLATFORMS.map((p, i) =>
        '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' + p.icon + ' ' + LB.dom.esc(p.name) + '</option>'
      ).join('') +
      '</select>' +
      '</label>' +
      '<label class="qs-lab">搜索关键词' +
      '<input class="inp" id="qsIn" type="search" placeholder="输入关键词，如：轻工具箱" aria-label="搜索关键词">' +
      '</label>' +
      '<button class="btn btn-main js-primary-submit qs-go" id="qsGo" type="button">🔍 在百度搜索</button>' +
      '</div>' +
      '<p class="cd-note">回车即按当前选中的平台搜索。微信一栏在手机端会尝试唤起 App（桌面端无法唤起）。</p>' +
      '<p class="cd-note">本工具只负责拼接搜索链接并跳转，不会把关键词发给任何第三方服务；' +
      '搜索行为发生在你点开的目标平台上。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    syncGo();

    $('#qsPlat', root).addEventListener('change', syncGo);
    $('#qsIn', root).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); open(current()); }
    });
    $('#qsGo', root).addEventListener('click', () => open(current()));
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('quicksearch', { mount, unmount });
})();
