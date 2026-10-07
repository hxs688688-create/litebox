/* LiteBox v5 · tools/wzrank.js — 王者荣耀战力查询（Step 26 · 一）
 *
 * 只请求同源 /api/wzrank；界面上不出现任何第三方域名或来源标注。
 *
 * 【与任务书的两处实现取舍】
 *   1) 按钮绑定用一次事件委托（挂在 chips 容器上），不用内联 onclick —— 全站红线禁内联。
 *   2) 自己写 apiGet 读 body.error.message：LB.api 在非 2xx 时只给「请求失败：HTTP 404」，
 *      会把后端「未找到该英雄的战力数据」丢掉（与 wzry.js 同一处理）。
 *
 * 类名沿用任务书给定的 .wz-card / .wz-head / .wz-avatar / .wz-highlight /
 * .wz-hl-item / .wz-hl-value / .wz-marks / .wz-mark-row / .wz-mark-power / .wz-foot，
 * 已确认与 Step 25 的 wzry 工具（.wz-search / .wz-skill / .wz-rune …）不重名。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  /* 热门英雄（任务书给定 12 个） */
  const HOT = ['廉颇', '李白', '韩信', '妲己', '鲁班七号', '貂蝉', '后羿', '王昭君', '诸葛亮', '孙悟空', '铠', '蒙犽'];

  /* 区服：任务书 UI 未要求切换控件，按后端默认区查询即可 */
  const TYPE = '安卓-扣扣区';

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
      throw new Error(e && e.name === 'AbortError' ? '查询超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '战力查询服务暂时不可用');
    return d;
  }

  /* 10114 → 10,114（任务书要求的千分位） */
  function num(v) {
    const n = Number(v);
    if (!isFinite(n) || n === 0) return '—';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function markRow(label, place, power) {
    return '<div class="wz-mark-row">' +
      '<span class="wz-mark-name">' + esc(label) + '</span>' +
      '<span class="wz-mark-place">' + (place ? esc(place) : '暂无数据') + '</span>' +
      '<b class="wz-mark-power">' + num(power) + '</b>' +
      '</div>';
  }

  function render(d) {
    const box = $('#wrResult', rootEl);
    const head =
      (d.avatar
        ? '<img class="wz-avatar" src="' + esc(d.avatar) + '" alt="" loading="lazy" data-fallback>'
        : '<span class="wz-avatar wz-avatar-none">⚔️</span>') +
      '<div class="wz-head-txt">' +
      '<b class="wz-head-name">' + esc(d.hero || '') + '</b>' +
      (d.title ? '<i class="wz-head-title">「' + esc(d.title) + '」</i>' : '') +
      (d.platform ? '<span class="wz-badge">' + esc(d.platform) + '</span>' : '') +
      '</div>';

    const hl =
      '<div class="wz-highlight">' +
      '<div class="wz-hl-item wz-hl-first"><small>国服第一</small><b class="wz-hl-value">' + num(d.top1) + '</b></div>' +
      '<div class="wz-hl-item"><small>国服前十最低</small><b class="wz-hl-value">' + num(d.top10) + '</b></div>' +
      '</div>';

    const p = d.province || {}, c = d.city || {}, g = d.district || {};
    const marks =
      '<div class="wz-marks">' +
      markRow('省标', p.name, p.power) +
      markRow('市标', c.name, c.power) +
      markRow('区标', g.name, g.power) +
      '</div>';

    box.innerHTML =
      '<div class="card tool-sec wz-card">' +
      '<div class="wz-head">' + head + '</div>' +
      hl + marks +
      '<div class="wz-foot">' +
      '<small>' + esc(TYPE + (d.updated ? ' · 数据更新 ' + d.updated : '')) + '</small>' +
      '</div>' +
      '</div>';

    /* 无内联样式：头像加载失败只加类名，表现交给 tools.css */
    const av = $('.wz-avatar[data-fallback]', box);
    if (av) av.addEventListener('error', () => av.classList.add('wz-avatar-fail'), { once: true });
  }

  function showErr(msg) {
    const box = $('#wrResult', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '🛡️',
      title: msg || '未找到该英雄的战力数据',
      sub: '可以换个英雄名试试，或点下方热门英雄快捷查询',
      ctaText: '查询热门英雄',
      onCta: () => { $('#wrName', rootEl).value = HOT[0]; run(); }
    });
  }

  async function run(nameArg) {
    if (!HAS_API) {
      const box = $('#wrResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const name = String(nameArg || $('#wrName', rootEl).value || '').trim();
    if (!name) { LB.toast('请输入英雄名称', 'info'); return; }
    $('#wrName', rootEl).value = name;
    const my = ++seq;
    /* chip 高亮同步（任务书：点热门 chip 直接查询） */
    rootEl.querySelectorAll('#wrChips .chip').forEach(ch =>
      ch.classList.toggle('on', ch.getAttribute('data-n') === name));
    const btn = $('#wrGo', rootEl);
    btn.disabled = true;
    const box = $('#wrResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await apiGet('/api/wzrank?name=' + encodeURIComponent(name) +
        '&type=' + encodeURIComponent(TYPE), 12000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '查询失败';
      showErr(msg);
      LB.fail('战力查询', msg, '换个英雄名或稍后重试');
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>王者荣耀战力查询</h1><p>查任意英雄的省标 / 市标 / 区标与国服战力</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec wz-search">' +
      '<input class="inp" id="wrName" maxlength="20" placeholder="输入英雄名，如：廉颇、李白、韩信" aria-label="英雄名称" />' +
      '<button class="btn btn-main" id="wrGo" type="button">🔍 查询</button>' +
      '</div>' +
      '<div class="hl-chips" id="wrChips">' +
      HOT.map(n => '<button class="chip" data-n="' + esc(n) + '" type="button">' + esc(n) + '</button>').join('') +
      '</div>' +
      '<div id="wrResult" hidden></div>' +
      '<p class="cd-note">战力门槛为该区服当前上榜最低要求，随时变动，仅供参考。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#wrGo', root).addEventListener('click', () => run());
    LB.enterSubmit($('#wrName', root), () => run());
    /* 事件委托：chips 与区服切换都绑一次，渲染结果后不需要重新绑 */
    $('#wrChips', root).addEventListener('click', e => {
      const c = e.target.closest('[data-n]');
      if (c) run(c.getAttribute('data-n'));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('wzrank', { mount, unmount });
})();
