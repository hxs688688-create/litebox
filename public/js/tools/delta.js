/* LiteBox v5 · tools/delta.js — 三角洲每日密码（Step 36 · 二）
 *
 * 只请求同源 /api/delta；位置截图已由后端转成同源代理地址，
 * 浏览器不会直连任何第三方域名。
 *
 * 交互：密码大字展示 + 一键复制；截图点开 lightbox 放大看位置
 * （沿用全站 lightbox 思路：纯 class 控制显隐，不写内联样式）。
 */
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
      throw new Error(e && e.name === 'AbortError' ? '加载超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '密码服务暂时不可用');
    return d;
  }

  function itemHtml(x) {
    return '<div class="card tool-sec dt-item">' +
      '<div class="dt-top">' +
      '<b class="dt-name">' + esc(x.name) + '</b>' +
      '<button class="btn btn-ghost dt-copy" data-copy="' + esc(x.password) + '" type="button">📋 复制密码</button>' +
      '</div>' +
      '<div class="dt-pwd" data-pwd="' + esc(x.password) + '">' + esc(x.password) + '</div>' +
      (x.location ? '<p class="dt-loc">' + esc(x.location) + '</p>' : '') +
      ((x.images && x.images.length)
        ? '<div class="dt-imgs">' + x.images.map((u, j) =>
          '<img class="dt-shot" src="' + esc(u) + '" alt="' + esc(x.name) + ' 位置图 ' + (j + 1) + '"' +
          ' loading="lazy" data-fallback data-zoom>').join('') + '</div>'
        : '') +
      '</div>';
  }

  function render(d) {
    const list = Array.isArray(d.items) ? d.items : [];
    const sum = $('#dtSum', rootEl);
    sum.textContent = (d.updateDate ? d.updateDate + ' 更新 · ' : '') + '共 ' + (d.count || list.length) + ' 个密码门';
    sum.hidden = false;
    const box = $('#dtList', rootEl);
    box.hidden = false;
    box.innerHTML = list.map(itemHtml).join('');
    /* 无内联样式：截图加载失败只加类名，占位表现交给 tools.css */
    box.querySelectorAll('.dt-shot[data-fallback]').forEach(img =>
      img.addEventListener('error', () => img.classList.add('dt-img-fail'), { once: true }));
  }

  async function load() {
    if (!HAS_API) {
      const box = $('#dtList', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const my = ++seq;
    const box = $('#dtList', rootEl);
    $('#dtErr', rootEl).hidden = true;
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await apiGet('/api/delta', 15000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      box.hidden = true;
      $('#dtErr', rootEl).hidden = false;
      $('#dtErrTxt', rootEl).textContent = (e && e.message) || '今日密码暂时无法获取';
      LB.fail('三角洲每日密码', (e && e.message) || '暂时无法获取', '检查网络后点击重试');
    }
  }

  /* ---------- lightbox（与全站一致：class 控制显隐） ---------- */
  function openLightbox(src) {
    const lb = $('#dtLightbox', rootEl);
    $('#dtLbImg', rootEl).src = src;
    lb.hidden = false;
  }
  function closeLightbox() {
    const lb = $('#dtLightbox', rootEl);
    if (!lb) return;
    lb.hidden = true;
    $('#dtLbImg', rootEl).removeAttribute('src');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>三角洲每日密码</h1><p>密码门今日密码汇总，附位置图解，一键复制</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<p class="dt-sum" id="dtSum" hidden></p>' +
      '<div class="dt-list" id="dtList" hidden></div>' +
      '<div id="dtErr" hidden><div class="card tool-sec"><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">暂时无法获取今日密码</p>' +
      '<p class="es-sub" id="dtErrTxt"></p>' +
      '<button class="btn btn-main es-cta" id="dtRetry" type="button">重新获取</button>' +
      '</div></div></div>' +
      '<p class="cd-note">密码每日更新，以游戏内实际可用的密码为准。</p>' +
      '</div>' +
      '<div class="dt-lightbox" id="dtLightbox" hidden>' +
      '<button class="dt-lb-close" id="dtLbClose" type="button" aria-label="关闭">✕</button>' +
      '<img id="dtLbImg" alt="位置图放大查看" />' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    /* 列表区整棵子树动态生成：一次事件委托收口（复制 / 放大） */
    $('#dtList', root).addEventListener('click', e => {
      const zoom = e.target.closest('[data-zoom]');
      if (zoom) { openLightbox(zoom.getAttribute('src')); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) LB.copyNow(cp.getAttribute('data-copy') || '', '密码已复制');
    });
    $('#dtRetry', root).addEventListener('click', load);
    $('#dtLightbox', root).addEventListener('click', e => {
      if (e.target.closest('#dtLbClose') || e.target === $('#dtLightbox', rootEl)) closeLightbox();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load();
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('delta', { mount, unmount });
})();
