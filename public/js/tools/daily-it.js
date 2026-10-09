/* LiteBox v5 · tools/daily-it.js — 实时 IT 资讯（Step 30 · 二 2.3）
 *
 * 数据：同源 /api/60s?type=it-news（LB.api.getJSON；上游域名只在后端）
 * 展示：列表（标题 + 摘要 + 链接），点击复制「标题 + 链接」（LB.copyNow 同步栈）
 * 支持下拉刷新；加载态骨架屏；错误态「数据获取失败，请稍后重试」
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  /* Step 32：后端缓存缩到 1 分钟，前端 TTL 同量级；刷新走 force 通道 */
  const TTL = 60 * 1000;

  let rootEl = null;
  let seq = 0;

  /* 上游字段：data[] { title, description, link, created_at } */
  function pick(d) {
    const x = (d && d.data) ? d.data : d;
    const raw = Array.isArray(x) ? x : (Array.isArray(x && x.news) ? x.news : []);
    const items = raw.map(n => ({
      t: String(n.title || ''),
      s: String(n.description || n.detail || n.summary || ''),
      u: String(n.link || n.url || ''),
      m: String(n.created_at || n.date || '')
    })).filter(n => n.t).slice(0, 30);
    if (!items.length) return null;
    return { items: items };
  }

  async function fetchData() {
    if (!HAS_API) throw new Error('数据获取失败，请稍后重试');
    const d = await LB.api.getJSON('/api/60s?type=it-news' + '&_t=' + Date.now(), { timeout: 10000 });
    const p = pick(d);
    if (!p) throw new Error('数据获取失败，请稍后重试');
    return p;
  }

  /* Step 32：force（下拉刷新）= 清 key 后直接请求，不复用进行中的 Promise */
  function load(force) {
    if (force) {
      LB.cache.clear('60s:daily-it');
      return fetchData();
    }
    return LB.cache('60s:daily-it', TTL, fetchData);
  }

  function render(p) {
    if (!rootEl) return;
    const box = $('#diBody', rootEl);
    let h = '<div class="da-list">';
    for (const x of p.items) {
      h += '<div class="da-item" data-t="' + esc(x.t) + '" data-u="' + esc(x.u) + '" role="button" tabindex="0">' +
        '<p class="da-t">' + esc(x.t) + '</p>' +
        (x.s ? '<p class="da-s">' + esc(x.s) + '</p>' : '') +
        (x.u ? '<p class="da-u">' + esc(x.u) + '</p>' : '') +
        (x.m ? '<p class="da-m">' + esc(x.m) + '</p>' : '') +
        '</div>';
    }
    h += '</div>';
    box.innerHTML = h;
    box.hidden = false;
  }

  function showLoading() {
    const box = $('#diBody', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 6, 'list');
  }

  function showErr() {
    if (!rootEl) return;
    const box = $('#diBody', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '⚠️',
      title: '数据获取失败，请稍后重试',
      sub: '资讯暂时拉不到，可下拉刷新或稍后再来',
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

  function copyRow(row) {
    const t = row.getAttribute('data-t') || '';
    const u = row.getAttribute('data-u') || '';
    LB.copyNow(u ? t + '\n' + u : t, '已复制标题' + (u ? '与链接' : ''));
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>实时 IT 资讯</h1><p>数码与科技快讯：标题 + 摘要 + 原文链接</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card da-card">' +
      '<div class="ptr-tip" aria-hidden="true"><span class="ptr-ic">↓</span><span class="ptr-txt">下拉刷新</span></div>' +
      '<div id="diBody" class="ptr-scroll" hidden></div>' +
      '</div>' +
      '<p class="cd-note">在页面顶部下拉可刷新；点击条目复制「标题 + 链接」。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#diBody', root).addEventListener('click', e => {
      const row = e.target.closest('.da-item');
      if (row) copyRow(row);
    });
    $('#diBody', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.da-item');
      if (!row) return;
      e.preventDefault();
      copyRow(row);
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

  LB.router.register('daily-it', { mount, unmount });
})();
