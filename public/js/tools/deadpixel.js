/* LiteBox v5 · tools/deadpixel.js — 屏幕坏点检测
   全屏 overlay 逐色显示红/绿/蓝/白/黑/灰，点击切换；最后一个颜色后再点退出。
   优先 requestFullscreen()，iOS Safari 不支持时降级为「仅铺满视口」；
   ESC 与 fullscreenchange 都会触发 stop()，确保 overlay 一定被移除。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  /* 颜色序列：红 → 绿 → 蓝 → 白 → 黑 → 灰 */
  const COLORS = [
    { hex: '#ff0000', name: '红色', hint: '检查红点（红像素不亮）' },
    { hex: '#00ff00', name: '绿色', hint: '检查绿点' },
    { hex: '#0000ff', name: '蓝色', hint: '检查蓝点' },
    { hex: '#ffffff', name: '白色', hint: '检查亮点（白点常为坏点）' },
    { hex: '#000000', name: '黑色', hint: '检查暗点（常为亮点）' },
    { hex: '#808080', name: '灰色', hint: '检查色彩不均、坏线' }
  ];

  let rootEl = null;
  let overlay = null;
  let idx = -1;
  let onKey = null;
  let onFsChange = null;
  let onResize = null;

  function build() {
    const ov = document.createElement('div');
    ov.id = 'dpOverlay';
    /* ★ 样式全部走 cssText 内联，不写进CSS 文件，也不用强制覆盖语法 */
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:pointer;' +
      'background:#ff0000;display:flex;align-items:center;justify-content:center;' +
      'font-family:system-ui,sans-serif;';
    ov.setAttribute('role', 'button');
    ov.setAttribute('tabindex', '0');
    ov.setAttribute('aria-label', '坏点检测全屏层，点击切换颜色');
    ov.innerHTML = '<div id="dpInfo" style="text-align:center;color:rgba(255,255,255,.9);' +
      'font-size:15px;line-height:1.8;padding:20px;text-shadow:0 1px 4px rgba(0,0,0,.45);' +
      'transition:opacity .2s;pointer-events:none;"></div>';
    return ov;
  }

  function showInfo() {
    if (!overlay) return;
    const el = overlay.querySelector('#dpInfo');
    if (!el) return;
    const c = COLORS[idx];
    if (!c) return;
    /* 深色背景用亮字，浅色背景用暗字 */
    const light = c.hex === '#ffffff' || c.hex === '#808080';
    el.style.color = light ? 'rgba(0,0,0,.68)' : 'rgba(255,255,255,.92)';
    el.style.textShadow = light ? '0 1px 3px rgba(255,255,255,.5)' : '0 1px 4px rgba(0,0,0,.45)';
    el.innerHTML = '<div style="font-size:20px;font-weight:800">' + esc(c.name) + ' ' +
      (idx + 1) + '/' + COLORS.length + '</div>' +
      '<div>' + esc(c.hint) + '</div>' +
      '<div style="opacity:.72;font-size:13px;margin-top:6px">点击切换颜色 · 全部看完后再点一次退出 · 按 Esc 退出</div>';
  }

  function next() {
    if (!overlay) return;
    idx++;
    if (idx >= COLORS.length) { stop(); return; }  /* 最后一个颜色后再点 → 退出 */
    overlay.style.background = COLORS[idx].hex;
    showInfo();
  }

  function stop() {
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (onFsChange) { document.removeEventListener('fullscreenchange', onFsChange); onFsChange = null; }
    if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    if (document.fullscreenElement && document.exitFullscreen) {
      /* 退全屏本身可能 reject（用户已退出），静默吞掉 */
      try { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
    idx = -1;
    LB.toast('坏点检测已结束', 'info');
  }

  function start() {
    if (overlay) return;
    overlay = build();
    idx = 0;
    overlay.style.background = COLORS[0].hex;
    document.body.appendChild(overlay);
    showInfo();
    overlay.addEventListener('click', next);
    /* iOS Safari 无 requestFullscreen，静默降级为「仅铺满视口」 */
    try {
      if (document.documentElement.requestFullscreen) {
        const p = document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) { /* 忽略：overlay 已覆盖视口，检测仍可进行 */ }
    onKey = e => { if (e.key === 'Escape') { e.preventDefault(); stop(); } };
    onFsChange = () => { if (!document.fullscreenElement && overlay) stop(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    /* 移动端地址栏收起/展开会改变视口高度，重新铺满 */
    onResize = () => { if (overlay) overlay.style.cssText += ';min-height:100vh;min-height:100dvh;'; };
    window.addEventListener('resize', onResize);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>屏幕坏点检测</h1><p>全屏纯色逐色排查坏点，六色循环，点击切换</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card dp-card">' +
      '<div class="dp-ic">📱</div>' +
      '<p class="dp-tip">点击下方按钮进入全屏纯色检测。屏幕会依次显示 <b>红 → 绿 → 蓝 → 白 → 黑 → 灰</b> 六种纯色，每种颜色下仔细观察屏幕是否有不亮的亮点或常亮的暗点。</p>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="dpGo" type="button">▶ 开始检测</button>' +
      '</div>' +
      '<ul class="dp-list">' +
      COLORS.map((c, i) => '<li><span class="dp-dot" style="background:' + c.hex + (c.hex === '#ffffff' ? ';border:1px solid var(--line)' : '') + '"></span>' +
        '<b>' + (i + 1) + '. ' + c.name + '</b><span>' + c.hint + '</span></li>').join('') +
      '</ul>' +
      '<p class="cd-note">检测过程中按 <b>Esc</b> 或点击屏幕可随时退出；最后一种颜色后再点一次也会自动退出。' +
      '「白点/亮点」（白色下不黑）多为坏点，「暗点/绿点」（黑下不黑）多为亮点，建议在暗环境下逐色检查。</p>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#dpGo', root).addEventListener('click', start);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (overlay) stop();   /* 切走时必须清理，否则 overlay 会永久遮挡全站 */
    rootEl = null;
  }

  LB.router.register('deadpixel', { mount, unmount });
})();
