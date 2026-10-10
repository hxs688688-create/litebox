/* LiteBox v5 · tools/wzzl.js — 王者荣耀战力查询（Step 35 · 一：换千寻 API wzzlpro）
 *
 * 与旧版（Step 26 战力工具）的差别：
 *   1) 接口换成同源 /api/wzzl?name=&lei=，lei 必带且只有四个值。Step 35 起上游换成
 *      千寻公益接口（免密钥），文档大区取值是 aqq / awx / iqq / iwx，界面标签仍是
 *      中文，但提交的 value 换成文档规定的短码；后端同时兼容旧短码 qq/wx/pqq/pwx，
 *      手机上还缓存着旧 JS 的用户不会失败。
 *   2) 网络请求走 LB.api.getJSON（红线）：非 2xx 时 client 会透传后端
 *      error.message / msg，「战力服务上游暂不可用」这类文案能原样到达界面。
 *   3) 展示字段：英雄名、平台、上榜门槛四格（国标=全国最低上榜 / 省级 /
 *      市级 / 区县最低上榜，每格带门槛所在地区小字，Step 38 语义修正）、
 *      更新时间 + tiers（区县 / 市级 / 省级门槛所在）+ extra，缺了不白屏。
 *      称号位显示英雄职业（如「法师」）。
 *   4) 英雄图片 pic：game.gtimg.cn 允许前端直接加载（Step 32 明示例外——图片不是
 *      API 请求）；其它来源后端已转成同源代理地址，前端照常写 src 即可。
 * 类名沿用 Step 26 的 .wz-card / .wz-head / .wz-avatar / .wz-highlight /
 * .wz-hl-item / .wz-hl-value / .wz-marks / .wz-mark-row / .wz-mark-power / .wz-foot /
 * .wz-plat，全部已在 tools.css 定义（配色走变量，无新增样式需求）。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  /* 热门英雄（沿用 12 个快捷查询） */
  const HOT = ['吕布', '李白', '韩信', '妲己', '鲁班七号', '貂蝉', '后羿', '王昭君', '诸葛亮', '孙悟空', '铠', '蒙犽'];

  /* spec：lei 四选一。Step 35 · 一：千寻 wzzlpro 文档的大区取值是 aqq / awx / iqq / iwx，
   * 界面标签仍是中文，但提交的 value 换成文档规定的短码（旧短码 qq/wx/pqq/pwx
   * 由后端兼容映射，缓存里的旧 JS 不受影响）。 */
  const LEIS = [
    ['aqq', '安卓QQ'],
    ['awx', '安卓微信'],
    ['iqq', '苹果QQ'],
    ['iwx', '苹果微信']
  ];

  let rootEl = null;
  let seq = 0;

  /* 10114 → 10,114（千分位）；0 / 非数字视为无数据 */
  function num(v) {
    const n = Number(v);
    if (!isFinite(n) || n === 0) return '—';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function powerCell(label, val, area, first) {
    return '<div class="wz-hl-item' + (first ? ' wz-hl-first' : '') + '">' +
      '<small>' + esc(label) + '</small>' +
      '<b class="wz-hl-value">' + num(val) + '</b>' +
      (area ? '<i class="wz-hl-area">' + esc(area) + '</i>' : '') +
      '</div>';
  }

  function infoRow(label, value) {
    return '<div class="wz-mark-row">' +
      '<span class="wz-mark-name">' + esc(label) + '</span>' +
      '<span class="wz-mark-place">' + esc(value) + '</span>' +
      '</div>';
  }

  function render(d, leiLabel) {
    const box = $('#wzResult', rootEl);
    const p = (d && d.power) || {};

    const head =
      (d.pic
        ? '<img class="wz-avatar" src="' + esc(d.pic) + '" alt="" loading="lazy" data-fallback>'
        : '<span class="wz-avatar wz-avatar-none">⚔️</span>') +
      '<div class="wz-head-txt">' +
      '<b class="wz-head-name">' + esc(d.hero || '') + '</b>' +
      (d.title ? '<i class="wz-head-title">「' + esc(d.title) + '」</i>' : '') +
      (d.platform ? '<span class="wz-badge">' + esc(d.platform) + '</span>' : '') +
      '</div>';

    /* Step 38 · 二：四格改行业通用口径 —— 国标=全国最低上榜，往下依次是
       省级 / 市级 / 区县最低上榜；每格下方小字是门槛所在地区（后端 areas） */
    const a = (d && d.areas) || {};
    const grid =
      '<div class="wz-highlight">' +
      powerCell('国标·全国最低上榜', p.national, '全国', true) +
      powerCell('省级最低上榜', p.max, a.max, false) +
      powerCell('市级最低上榜', p.mid, a.mid, false) +
      powerCell('区县最低上榜', p.min, a.min, false) +
      '</div>';

    const rows = [];
    if (d.area) rows.push(infoRow('地区', d.area));
    if (d.updated) rows.push(infoRow('更新时间', d.updated));
    /* Step 33 · 四：三档门槛分别在哪个区服（后端 tiers：最低/中等/最高门槛所在）。
     * 文档里 lowestname / mediumname / highestname 各不相同，只看「地区」会丢信息。 */
    (Array.isArray(d.tiers) ? d.tiers : []).forEach(r => {
      if (r && r.k && r.v) rows.push(infoRow(r.k, r.v));
    });
    (Array.isArray(d.extra) ? d.extra : []).forEach(r => {
      if (r && r.k && r.v) rows.push(infoRow(r.k, r.v));
    });
    const marks = rows.length ? '<div class="wz-marks">' + rows.join('') + '</div>' : '';

    box.innerHTML =
      '<div class="card tool-sec wz-card">' +
      '<div class="wz-head">' + head + '</div>' +
      grid + marks +
      '<div class="wz-foot"><small>' + esc(leiLabel || '') + '</small></div>' +
      '</div>';

    /* 无内联样式：图片加载失败只加类名，表现交给 tools.css */
    const av = $('.wz-avatar[data-fallback]', box);
    if (av) av.addEventListener('error', () => av.classList.add('wz-avatar-fail'), { once: true });
  }

  function showErr(msg) {
    const box = $('#wzResult', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '🛡️',
      title: msg || '未找到该英雄的战力数据',
      sub: '可以换个英雄名试试，或点下方热门英雄快捷查询',
      ctaText: '查询热门英雄',
      onCta: () => { $('#wzName', rootEl).value = HOT[0]; run(); }
    });
  }

  async function run(nameArg) {
    if (!HAS_API) {
      const box = $('#wzResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const name = String(nameArg || $('#wzName', rootEl).value || '').trim();
    if (!name) { LB.toast('请输入英雄名称', 'info'); return; }
    $('#wzName', rootEl).value = name;
    const lei = $('#wzLei', rootEl).value;
    const leiLabel = (LEIS.find(x => x[0] === lei) || ['', lei])[1];
    const my = ++seq;
    /* chip 高亮同步 */
    rootEl.querySelectorAll('#wzChips .chip').forEach(ch =>
      ch.classList.toggle('on', ch.getAttribute('data-n') === name));
    const btn = $('#wzGo', rootEl);
    btn.disabled = true;
    const box = $('#wzResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      /* spec：走 LB.api.getJSON；上游 10s，前端留 12s 余量 */
      const d = await LB.api.getJSON(
        '/api/wzzl?name=' + encodeURIComponent(name) + '&lei=' + encodeURIComponent(lei),
        { timeout: 12000 });
      if (my !== seq) return;
      render(d, leiLabel);
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
      '<div><h1>王者荣耀战力查询</h1><p>查任意英雄的国标 / 省级 / 市级 / 区县最低上榜战力</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec wz-search">' +
      '<input class="inp" id="wzName" maxlength="20" placeholder="输入英雄名，如：吕布、李白、韩信" aria-label="英雄名称" />' +
      '<button class="btn btn-main" id="wzGo" type="button">🔍 查询</button>' +
      '</div>' +
      '<label class="wz-plat"><span>大区</span>' +
      '<select class="inp" id="wzLei" aria-label="查询大区">' +
      LEIS.map(x => '<option value="' + esc(x[0]) + '"' + (x[0] === 'aqq' ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') +
      '</select></label>' +
      '<div class="hl-chips" id="wzChips">' +
      HOT.map(n => '<button class="chip" data-n="' + esc(n) + '" type="button">' + esc(n) + '</button>').join('') +
      '</div>' +
      '<div id="wzResult" hidden></div>' +
      '<p class="cd-note">战力门槛为该区服当前上榜最低要求，随时变动，仅供参考。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#wzGo', root).addEventListener('click', () => run());
    LB.enterSubmit($('#wzName', root), () => run());
    /* 换大区后若已输入英雄名，直接重查（验收：下拉选不同平台 → 结果有变化） */
    $('#wzLei', root).addEventListener('change', () => {
      if ($('#wzName', root).value.trim()) run();
    });
    /* 事件委托：chips 一次绑定，渲染结果后不需要重绑 */
    $('#wzChips', root).addEventListener('click', e => {
      const c = e.target.closest('[data-n]');
      if (c) run(c.getAttribute('data-n'));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('wzzl', { mount, unmount });
})();
