/* LiteBox v5 · tools/gamefree.js — 每日限免游戏（Step 26 · 五）
 *
 * 只请求同源 /api/gamefree；封面已由后端转成同源代理地址，
 * 浏览器不会直连任何第三方域名。
 *
 * 任务书给了两种展示方式（顶部 chips 切板块 / 全部展示），这里做 chips 筛选 +
 * 默认「全部」，两种诉求都覆盖；分组按上游「所属板块」原样聚合，不猜平台名。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;
  let items = [];
  let cur = '';  /* '' = 全部 */

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
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
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '限免服务暂时不可用');
    return d;
  }

  function sections() {
    const seen = [];
    items.forEach(x => { if (x.section && seen.indexOf(x.section) < 0) seen.push(x.section); });
    return seen;
  }

  function chipsHtml() {
    const list = sections();
    return '<button class="chip' + (cur === '' ? ' on' : '') + '" data-s="" type="button">全部</button>' +
      list.map(s => '<button class="chip' + (cur === s ? ' on' : '') + '" data-s="' + esc(s) + '" type="button">' + esc(s) + '</button>').join('');
  }

  function itemHtml(x) {
    return '<div class="gf-item">' +
      (x.cover
        ? '<img class="gf-cover" src="' + esc(x.cover) + '" alt="" loading="lazy" data-fallback>'
        : '<span class="gf-cover gf-cover-none">🎮</span>') +
      '<div class="gf-body">' +
      '<b class="gf-name">' + esc(x.name || '') + '</b>' +
      (x.status ? '<span class="gf-status">' + esc(x.status) + '</span>' : '') +
      (x.timeInfo ? '<small class="gf-meta">' + esc(x.timeInfo) + '</small>' : '') +
      (x.priceInfo ? '<small class="gf-meta">' + esc(x.priceInfo) + '</small>' : '') +
      (x.desc ? '<details class="gf-desc"><summary>游戏简介</summary><p>' + esc(x.desc) + '</p></details>' : '') +
      '</div>' +
      '</div>';
  }

  function renderList() {
    const box = $('#gfList', rootEl);
    const shown = cur ? items.filter(x => x.section === cur) : items;
    if (!shown.length) {
      LB.ui.empty(box, { icon: '🎮', title: '该板块当前没有限免', sub: '换个板块或明天再看' });
      return;
    }
    /* 按板块分组渲染（任务书：EPIC 正在免费 / Steam 限免精选 / PlayStation 会员福利 …） */
    const groups = [];
    shown.forEach(x => {
      const key = x.section || '其它';
      let g = groups.find(y => y.key === key);
      if (!g) { g = { key: key, rows: [] }; groups.push(g); }
      g.rows.push(x);
    });
    box.innerHTML = groups.map(g =>
      '<div class="gf-section">' +
      '<h2 class="gf-h">' + esc(g.key) + '<small>' + g.rows.length + ' 款</small></h2>' +
      g.rows.map(itemHtml).join('') +
      '</div>'
    ).join('');
    /* 无内联样式：封面失败只加类名，占位表现交给 tools.css */
    box.querySelectorAll('.gf-cover[data-fallback]').forEach(img =>
      img.addEventListener('error', () => img.classList.add('gf-cover-fail'), { once: true }));
  }

  function render(d) {
    items = Array.isArray(d.list) ? d.list : [];
    const top = $('#gfSum', rootEl);
    top.textContent = '共 ' + (d.total || items.length) + ' 款 · 免费 ' + (d.free || 0) + ' 款';
    top.hidden = false;
    $('#gfChips', rootEl).innerHTML = chipsHtml();
    renderList();
  }

  async function load() {
    if (!HAS_API) {
      const box = $('#gfList', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const my = ++seq;
    const box = $('#gfList', rootEl);
    $('#gfErr', rootEl).hidden = true;
    box.hidden = false;
    LB.ui.skeleton(box, 4, 'card');
    try {
      const d = await apiGet('/api/gamefree', 15000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      box.hidden = true;
      $('#gfErr', rootEl).hidden = false;
      $('#gfErrTxt', rootEl).textContent = (e && e.message) || '限免信息暂时无法获取';
      LB.fail('限免游戏', (e && e.message) || '暂时无法获取', '检查网络后点击重试');
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>每日限免游戏</h1><p>各平台限免与会员福利实时汇总，一个页面看全</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<p class="gf-sum" id="gfSum" hidden></p>' +
      '<div class="hl-chips" id="gfChips"></div>' +
      '<div class="gf-list" id="gfList" hidden></div>' +
      '<div id="gfErr" hidden><div class="card tool-sec"><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">暂时无法获取限免信息</p>' +
      '<p class="es-sub" id="gfErrTxt"></p>' +
      '<button class="btn btn-main es-cta" id="gfRetry" type="button">重新获取</button>' +
      '</div></div></div>' +
      '<p class="cd-note">限免活动随时开始或结束，以各商店页面实际显示为准。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#gfChips', root).addEventListener('click', e => {
      const c = e.target.closest('[data-s]');
      if (!c) return;
      cur = c.getAttribute('data-s');
      root.querySelectorAll('#gfChips .chip').forEach(x =>
        x.classList.toggle('on', x.getAttribute('data-s') === cur));
      renderList();
    });
    $('#gfRetry', root).addEventListener('click', load);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load();
  }

  function unmount() {
    seq++;
    items = [];
    cur = '';
    rootEl = null;
  }

  LB.router.register('gamefree', { mount, unmount });
})();
