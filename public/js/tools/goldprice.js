/* LiteBox v5 · tools/goldprice.js — 实时金价（Step 28 · 一）
 *
 * 只请求同源 /api/goldprice；界面上不出现任何第三方域名或来源标注。
 * 任务书：不做 K 线图（charts 后端已丢弃），只展示金店零售价 + 现货/期货换算价。
 *
 * 【实现取舍】
 *   按钮绑定用 addEventListener，不用内联 onclick —— 全站红线禁内联；
 *   apiGet 自己读 body.error.message（与 wzrank.js 同一处理）。
 *
 * 类名沿用任务书给定的 .gp-section / .gp-shops / .gp-shop / .gp-shop-name /
 * .gp-shop-retail / .gp-shop-retail-value / .gp-shop-exchange / .gp-futures /
 * .gp-future / .gp-future-name / .gp-future-original / .gp-future-convert。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    let r = null, text = '';
    try {
      r = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '加载超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '金价服务暂时不可用');
    return d;
  }

  function shopHtml(x) {
    return '<div class="gp-shop">' +
      '<b class="gp-shop-name">' + esc(x.name || '—') + '</b>' +
      '<span class="gp-shop-retail"><i class="gp-shop-retail-value">' + esc(x.retail || '—') + '</i> 元/克</span>' +
      '<small class="gp-shop-exchange">换金价 ' + esc(x.exchange || '—') + '</small>' +
      '</div>';
  }

  function futureHtml(x) {
    return '<div class="gp-future">' +
      '<div class="gp-future-txt">' +
      '<b class="gp-future-name">' + esc(x.name || '—') + '</b>' +
      '<small class="gp-future-original">' + esc(x.tradePrice || '—') + ' ' + esc(x.tradeUnit || '') + '</small>' +
      '</div>' +
      '<span class="gp-future-convert">' + esc(x.convertPrice || '—') + '<i> 元/克</i></span>' +
      '</div>';
  }

  function render(d) {
    const box = $('#gpBody', rootEl);
    const shops = Array.isArray(d.shops) ? d.shops : [];
    const futures = Array.isArray(d.futures) ? d.futures : [];
    box.innerHTML =
      (d.updateTime ? '<p class="gp-top">数据更新于 ' + esc(d.updateTime) + '</p>' : '') +
      '<div class="gp-section">' +
      '<h2 class="gp-h">金店零售价</h2>' +
      '<div class="gp-shops">' + (shops.length ? shops.map(shopHtml).join('') : '<p class="gp-none">暂无金店报价</p>') + '</div>' +
      '</div>' +
      '<div class="gp-section">' +
      '<h2 class="gp-h">现货 / 期货</h2>' +
      '<div class="gp-futures">' + (futures.length ? futures.map(futureHtml).join('') : '<p class="gp-none">暂无行情数据</p>') + '</div>' +
      '</div>' +
      '<div class="gp-acts"><button class="btn btn-ghost btn-sm" id="gpRefresh" type="button">🔄 刷新</button></div>' +
      '<p class="cd-note">⚠️ 数据仅供参考，实际以门店挂牌价为准。</p>';

    $('#gpRefresh', box).addEventListener('click', load);
  }

  async function load() {
    if (!HAS_API) {
      const box = $('#gpBody', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const my = ++seq;
    const box = $('#gpBody', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 4, 'card');
    try {
      const d = await apiGet('/api/goldprice', 12000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '金价数据暂时无法获取';
      LB.ui.empty(box, {
        icon: '🥇',
        title: msg,
        sub: '行情接口偶尔抽风，稍后重新获取',
        ctaText: '重新获取',
        onCta: load
      });
      LB.fail('实时金价', msg, '检查网络后点击重试');
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>实时金价</h1><p>金店零售价与国际/上海金银现货行情一览</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="gpBody" hidden></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load(); /* 任务书：进入时自动请求 */
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('goldprice', { mount, unmount });
})();
