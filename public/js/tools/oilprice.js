/* LiteBox v5 · tools/oilprice.js — 全国油价（Step 27 · 二）
 *
 * 只请求同源 /api/oilprice；界面上不出现任何第三方域名或来源标注。
 *
 * 【与任务书的一处实现取舍】
 *   按钮 / 下拉绑定用 addEventListener，不用内联 onchange / onclick —— 全站红线禁内联。
 *   apiGet 自己读 body.error.message（与 express.js 同一处理）。
 *
 * 涨跌颜色按任务书走 tokens：涨 var(--err)、跌 var(--ok)（.oil-change.up / .down）。
 * 类名沿用任务书给定的 .oil-grid / .oil-card / .oil-label / .oil-price /
 * .oil-change.up / .oil-change.down / .oil-updated。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  /* 34 个省级行政区 + 全国（不传 dq） */
  const PROVINCES = [
    '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
    '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
    '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
    '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
    '香港', '澳门', '台湾'
  ];
  const GAS_KEYS = ['89号', '92号', '95号', '98号'];
  const DIESEL_KEYS = ['0号', '10号', '20号', '35号'];

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
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '油价查询服务暂时不可用');
    return d;
  }

  /* 上游标号写法不固定（"92号" / "92" / "92#"），归一后再查表 */
  function normKey(k) {
    const m = String(k).match(/\d+/);
    return m ? m[0] + '号' : String(k);
  }

  function pick(obj, key) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj[key]) return obj[key];
    for (const k in obj) { if (normKey(k) === key) return obj[k]; }
    return null;
  }

  function cardHtml(label, item) {
    if (!item || !isFinite(Number(item.price)) || Number(item.price) <= 0) {
      return '<div class="oil-card oil-card-none">' +
        '<span class="oil-label">' + esc(label) + '</span>' +
        '<b class="oil-price">—</b>' +
        '<small class="oil-change">暂无数据</small>' +
        '</div>';
    }
    const ch = Number(item.change) || 0;
    const cls = ch > 0 ? ' up' : (ch < 0 ? ' down' : '');
    const arrow = ch > 0 ? '↑' + ch.toFixed(2) : (ch < 0 ? '↓' + Math.abs(ch).toFixed(2) : '持平');
    return '<div class="oil-card">' +
      '<span class="oil-label">' + esc(label) + '</span>' +
      '<b class="oil-price">' + Number(item.price).toFixed(2) + '<i> 元/升</i></b>' +
      '<small class="oil-change' + cls + '">' + arrow + '</small>' +
      '</div>';
  }

  function render(d) {
    const box = $('#opResult', rootEl);
    const gas = d.gasoline || {}, die = d.diesel || {};
    box.innerHTML =
      '<div class="card tool-sec op-card">' +
      '<div class="op-sec-h"><b>汽油</b><small>单位：元 / 升</small></div>' +
      '<div class="oil-grid">' + GAS_KEYS.map(k => cardHtml(k, pick(gas, k))).join('') + '</div>' +
      '<div class="op-sec-h"><b>柴油</b><small>单位：元 / 升</small></div>' +
      '<div class="oil-grid">' + DIESEL_KEYS.map(k => cardHtml(k, pick(die, k))).join('') + '</div>' +
      (d.updated ? '<p class="oil-updated">更新时间 ' + esc(String(d.updated).split('.')[0]) + '</p>' : '') +
      '</div>';
  }

  async function load() {
    if (!HAS_API) {
      const box = $('#opResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const dq = $('#opProv', rootEl).value;
    const my = ++seq;
    const box = $('#opResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await apiGet('/api/oilprice' + (dq ? '?dq=' + encodeURIComponent(dq) : ''), 12000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '油价数据暂时无法获取';
      LB.ui.empty(box, {
        icon: '⛽',
        title: msg,
        sub: '可以换个省份试试，或稍后重新获取',
        ctaText: '重新获取',
        onCta: load
      });
      LB.fail('全国油价', msg, '检查网络后点击重试');
    }
  }

  function html() {
    const opts = '<option value="">全国</option>' +
      PROVINCES.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>全国油价</h1><p>各省汽油柴油零售价与涨跌，实时查询</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec op-search">' +
      '<label class="op-lab" for="opProv">选择省份</label>' +
      '<select class="inp" id="opProv" aria-label="省份选择">' + opts + '</select>' +
      '</div>' +
      '<div id="opResult" hidden></div>' +
      '<p class="cd-note">油价为发改部门调价后的零售指导价，加油站实际售价略有浮动，仅供参考。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#opProv', root).value = '北京'; /* 任务书：默认北京 */
    $('#opProv', root).addEventListener('change', load);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load();
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('oilprice', { mount, unmount });
})();
