/* LiteBox v5 · tools/daily-60s.js — 每天60秒读懂世界（Step 30 · 二 2.1）
 *
 * 数据：同源 /api/60s?type=60s（LB.api.getJSON；上游域名只在后端）
 * 展示：头部 日期 + 星期 + 农历；中部 15 条新闻；底部 每日微语（引用样式）
 * 交互：点击新闻复制标题（LB.copyNow 同步栈）；页面顶部下拉刷新；加载态骨架屏
 * 错误态：「数据获取失败，请稍后重试」
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const TTL = 5 * 60 * 1000;   /* 与后端 5 分钟缓存同量级；下拉刷新会清掉 */

  let rootEl = null;
  let seq = 0;

  /* 字段映射（任务给定）：date / day_of_week / lunar_date / news / tip */
  function pick(d) {
    const x = (d && d.data) ? d.data : d;
    if (!x || typeof x !== 'object') return null;
    const raw = Array.isArray(x.news) ? x.news : [];
    const news = raw.map(n => (typeof n === 'string' ? n : (n && (n.title || n.content)) || '')).filter(Boolean).slice(0, 15);
    if (!news.length) return null;
    return {
      date: String(x.date || ''),
      week: String(x.day_of_week || ''),
      lunar: String(x.lunar_date || ''),
      news: news,
      tip: String(x.tip || '')
    };
  }

  async function fetchData() {
    if (!HAS_API) throw new Error('数据获取失败，请稍后重试');
    const d = await LB.api.getJSON('/api/60s?type=60s', { timeout: 10000 });
    const p = pick(d);
    if (!p) throw new Error('数据获取失败，请稍后重试');
    return p;
  }

  function load(force) {
    if (force) LB.cache.clear('60s:daily-60s');
    return LB.cache('60s:daily-60s', TTL, fetchData);
  }

  function render(p) {
    if (!rootEl) return;
    const box = $('#d6Body', rootEl);
    const head = [p.date, p.week, p.lunar].filter(Boolean).map(s => '<span class="d6-hi">' + esc(s) + '</span>').join('');
    let h = '<div class="d6-head">' + head + '</div>';
    h += '<ol class="d6-news">';
    for (let i = 0; i < p.news.length; i++) {
      h += '<li class="d6-item" data-t="' + esc(p.news[i]) + '" role="button" tabindex="0">' +
        '<span class="d6-t">' + esc(p.news[i]) + '</span></li>';
    }
    h += '</ol>';
    if (p.tip) h += '<blockquote class="d6-tip">' + esc(p.tip) + '</blockquote>';
    box.innerHTML = h;
    box.hidden = false;
  }

  function showLoading() {
    const box = $('#d6Body', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 8, 'list');
  }

  function showErr() {
    if (!rootEl) return;
    const box = $('#d6Body', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '⚠️',
      title: '数据获取失败，请稍后重试',
      sub: '内容暂时拉不到，可下拉刷新或稍后再来',
      ctaText: '重新获取',
      onCta: () => run(true)
    });
  }

  async function run(force) {
    const my = ++seq;
    showLoading();
    try {
      const p = await load(force);
      if (my !== seq) return;
      render(p);
    } catch (e) {
      if (my !== seq) return;
      showErr();
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>每天60秒读懂世界</h1><p>日期 / 星期 / 农历 + 15 条要闻 + 每日微语</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card d6-card">' +
      '<div class="ptr-tip" aria-hidden="true"><span class="ptr-ic">↓</span><span class="ptr-txt">下拉刷新</span></div>' +
      '<div id="d6Body" class="ptr-scroll" hidden></div>' +
      '</div>' +
      '<p class="cd-note">在页面顶部下拉可拉取当天最新内容；点击任意一条复制标题。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#d6Body', root).addEventListener('click', e => {
      const it = e.target.closest('.d6-item');
      if (!it) return;
      LB.copyNow(it.getAttribute('data-t') || '', '已复制标题');
    });
    $('#d6Body', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const it = e.target.closest('.d6-item');
      if (!it) return;
      e.preventDefault();
      LB.copyNow(it.getAttribute('data-t') || '', '已复制标题');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.ui.pull(root, () => run(true));
    run(false);
  }

  function unmount() {
    seq++;
    if (rootEl) LB.ui.pullUnhook(rootEl);
    rootEl = null;
  }

  LB.router.register('daily-60s', { mount, unmount });
})();
