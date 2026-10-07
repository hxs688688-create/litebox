/* LiteBox v5 · tools/express.js — 快递查询（Step 27 · 一）
 *
 * 只请求同源 /api/express；界面上不出现任何第三方域名或来源标注。
 *
 * 【隐私（任务书两条注意）】
 *   1) 手机后四位只拼进同源请求，不渲染到页面任何位置（结果卡只回显快递公司 + 单号）；
 *   2) 查询历史不存储 —— 不用 LB.cache / LB.store，每次查询都是即时请求。
 *
 * 【与任务书的一处实现取舍】
 *   按钮绑定用 addEventListener，不用内联 onclick —— 全站红线禁内联。
 *   apiGet 自己读 body.error.message：LB.api 在非 2xx 时只给「请求失败：HTTP nnn」，
 *   会把后端「未查询到物流信息…」丢掉（与 wzrank.js 同一处理）。
 *
 * 类名沿用任务书给定的 .ex-head / .ex-timeline / .ex-item / .ex-item.latest /
 * .ex-time / .ex-context / .ex-location。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
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
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '快递查询服务暂时不可用');
    return d;
  }

  function itemHtml(x, latest) {
    return '<div class="ex-item' + (latest ? ' latest' : '') + '">' +
      '<span class="ex-dot" aria-hidden="true"></span>' +
      '<div class="ex-body">' +
      '<div class="ex-time">' + esc(x.time || '—') + '</div>' +
      '<div class="ex-context">' + esc(x.context || '') + '</div>' +
      (x.location ? '<div class="ex-location">📍 ' + esc(x.location) + '</div>' : '') +
      '</div>' +
      '</div>';
  }

  function render(d) {
    const box = $('#exResult', rootEl);
    const list = Array.isArray(d.list) ? d.list : [];
    const no = d.no || $('#exNo', rootEl).value.trim();
    const head =
      '<div class="ex-head">' +
      '<div class="ex-head-txt">' +
      (d.company ? '<b class="ex-com">' + esc(d.company) + '</b>' : '') +
      '<span class="ex-no">' + esc(no) + '</span>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" id="exCopy" type="button">复制</button>' +
      '</div>';

    const timeline = list.length
      ? '<div class="ex-timeline">' +
        list.map((x, i) => itemHtml(x, i === 0)).join('') +
        '</div>'
      : '<p class="ex-empty">该单号暂无物流轨迹，可能刚揽收，稍后再查。</p>';

    box.innerHTML = '<div class="card tool-sec ex-card">' + head + timeline + '</div>';

    $('#exCopy', box).addEventListener('click', () =>
      LB.copyNow(no, '单号已复制'));
  }

  function showErr(msg) {
    const box = $('#exResult', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '📦',
      title: msg || '未查询到物流信息',
      sub: '检查单号与手机后四位后重试；顺丰等部分快递需收件人手机后四位验证',
      ctaText: '重新查询',
      onCta: () => run()
    });
  }

  async function run() {
    if (!HAS_API) {
      const box = $('#exResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const number = $('#exNo', rootEl).value.trim();
    const mobile = $('#exMobile', rootEl).value.trim();
    if (!number) { LB.toast('请输入快递单号', 'info'); return; }
    if (!/^\d{4}$/.test(mobile)) { LB.toast('手机后四位必须是 4 位数字', 'info'); return; }
    const my = ++seq;
    const btn = $('#exGo', rootEl);
    btn.disabled = true;
    const box = $('#exResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 4, 'card');
    try {
      const d = await apiGet('/api/express?number=' + encodeURIComponent(number) +
        '&mobile=' + encodeURIComponent(mobile), 15000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '查询失败';
      showErr(msg);
      LB.fail('快递查询', msg, '检查单号与手机后四位后重试');
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>快递查询</h1><p>输入快递单号与手机后四位，查询物流轨迹</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec ex-search">' +
      '<input class="inp" id="exNo" maxlength="40" placeholder="输入快递单号，如：SF1234567890" aria-label="快递单号" />' +
      '<div class="ex-row">' +
      '<input class="inp ex-mobile" id="exMobile" maxlength="4" inputmode="numeric" autocomplete="off" placeholder="手机后四位" aria-label="收件人手机后四位" />' +
      '<button class="btn btn-main" id="exGo" type="button">🔍 查询</button>' +
      '</div>' +
      '</div>' +
      '<div id="exResult" hidden></div>' +
      '<p class="cd-note">部分快递需收件人手机号验证；查询内容仅用于本次请求，不做任何存储。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#exGo', root).addEventListener('click', run);
    LB.enterSubmit($('#exNo', root), run);
    LB.enterSubmit($('#exMobile', root), run);
    /* 后四位只留数字 */
    $('#exMobile', root).addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('express', { mount, unmount });
})();
