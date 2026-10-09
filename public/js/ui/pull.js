/* LiteBox v5 · ui/pull.js — 下拉刷新（Step 30 新增；热榜聚合 / 每天60秒 / AI资讯 / IT资讯共用）
 *
 * 用法：LB.ui.pull(hostEl, async () => reload())
 *   - hostEl 内静态放一个 .ptr-tip 提示条（各工具 html() 里写好）
 *   - 仅当页面滚动在顶部（window.scrollY<=0，且 .ptr-scroll 容器 scrollTop<=0）时接管手势
 *   - 位移做阻尼换算、封顶；释放超过阈值触发 onRefresh，进行中不重复触发
 *   - LB.ui.pullPulse(hostEl)：程序化触发一次刷新，给桌面端（无触摸）与自动化验收用
 *   - LB.ui.pullUnhook(hostEl)：unmount 时清理，避免常驻节点上留旧钩子
 *
 * 样式见 tools.css 的 .ptr-tip（class: ptr-open / ptr-ready / ptr-loading）。
 * 位移与角度通过 CSS 自定义属性 + transform 下发，不写内联 style 属性（红线：无内联样式）。
 */
(function () {
  'use strict';
  window.LB = window.LB || {};
  LB.ui = LB.ui || {};

  const THRESHOLD = 60;   /* 释放触发阈值（视觉位移 px） */
  const MAX = 88;         /* 提示条最大位移（px） */
  const DAMP = 0.5;       /* 阻尼：手指位移 × DAMP = 视觉位移 */
  const SLOP = 16;        /* 横向容差：明显横拖视为横向滚动意图，放弃手势 */

  let seq = 0;
  const hooks = new Map(); /* hostId → { host, onRefresh, busy } */
  let attached = false;

  const docTop = () => (window.scrollY || document.documentElement.scrollTop || 0);

  function setPtr(host, y, state, text) {
    const tip = host.querySelector('.ptr-tip');
    if (!tip) return;
    tip.style.setProperty('--ptr-y', Math.round(y) + 'px');
    tip.style.setProperty('--ptr-rot', Math.min(360, Math.round(y * 4)) + 'deg');
    tip.classList.toggle('ptr-open', y > 4);
    tip.classList.remove('ptr-ready', 'ptr-loading');
    if (state === 'ready') tip.classList.add('ptr-ready');
    if (state === 'loading') tip.classList.add('ptr-loading');
    if (text !== undefined) {
      const t = tip.querySelector('.ptr-txt');
      if (t) t.textContent = text;
    }
  }

  function attach() {
    let g = null; /* 当前手势 { host, x0, dy, moved, claimed } */

    document.addEventListener('touchstart', e => {
      if (!hooks.size || e.touches.length !== 1) return;
      const el = e.target;
      /* 表单控件、弹层、横向 chips 条上不打断原生交互 */
      if (el && el.closest && el.closest('input,textarea,select,.sheet-mask,.hl-chips,button')) return;
      let host = null;
      hooks.forEach(rec => { if (!host && rec.host.contains(el)) host = rec.host; });
      if (!host) return;
      if (docTop() > 0) return;
      const zone = host.querySelector('.ptr-scroll');
      if (zone && zone.scrollTop > 0) return;
      g = { host: host, x0: e.touches[0].clientX, y0: e.touches[0].clientY, dy: 0, moved: false, claimed: false };
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const y = t.clientY - g.y0;
      if (!g.moved) {
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(y)) { g = null; return; }
        if (y <= 8) return;                    /* 先确认确实向下，才接管 */
        if (docTop() > 0) { g = null; return; }
        g.moved = true;
      }
      g.dy = y;
      const visual = Math.min(MAX, y * DAMP);
      g.claimed = true;
      setPtr(g.host, visual, visual >= THRESHOLD ? 'ready' : 'idle',
        visual >= THRESHOLD ? '松开刷新' : '下拉刷新');
      /* 只有确认进入下拉状态才阻止默认滚动，正常浏览不受影响 */
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    function finish() {
      if (!g) return;
      const host = g.host;
      const hit = g.moved && g.dy * DAMP >= THRESHOLD;
      g = null;
      if (!hit) { setPtr(host, 0, 'idle', '下拉刷新'); return; }
      runRefresh(host);
    }
    document.addEventListener('touchend', finish, { passive: true });
    document.addEventListener('touchcancel', () => {
      if (g) { setPtr(g.host, 0, 'idle', '下拉刷新'); g = null; }
    }, { passive: true });
  }

  function restoreText(host) {
    const tip = host.querySelector('.ptr-tip');
    if (tip) {
      const t = tip.querySelector('.ptr-txt');
      if (t) t.textContent = '下拉刷新';
    }
  }

  function runRefresh(host) {
    const rec = hooks.get(host.id);
    if (!rec || rec.busy) { setPtr(host, 0, 'idle', '下拉刷新'); return Promise.resolve(false); }
    rec.busy = true;
    setPtr(host, 40, 'loading', '正在刷新…');
    return Promise.resolve()
      .then(() => rec.onRefresh())
      .then(() => setPtr(host, 0, 'idle', '已更新'), () => setPtr(host, 0, 'idle', '刷新失败'))
      .then(() => {
        rec.busy = false;
        setTimeout(() => {
          const tip = host.querySelector('.ptr-tip');
          /* 期间用户已开始新的下拉（ptr-open）就不要抢回文案 */
          if (tip && !tip.classList.contains('ptr-open')) restoreText(host);
        }, 1200);
        return true;
      });
  }

  LB.ui.pull = function (host, onRefresh) {
    if (!host || typeof onRefresh !== 'function') return;
    if (!host.id) host.id = 'lb-pull-' + (++seq);
    hooks.set(host.id, { host: host, onRefresh: onRefresh, busy: false });
    if (!attached) { attached = true; attach(); }
  };

  LB.ui.pullUnhook = function (host) {
    if (host && host.id) hooks.delete(host.id);
  };

  /* 程序化一次「下拉 → 刷新」：桌面端与自动化验收的唯一入口 */
  LB.ui.pullPulse = function (host) {
    if (!host || !host.id || !hooks.has(host.id)) return Promise.resolve(false);
    setPtr(host, THRESHOLD + 20, 'ready', '松开刷新');
    return new Promise(res => {
      setTimeout(() => { runRefresh(host).then(ok => { if (!ok) restoreText(host); res(ok); }); }, 150);
    });
  };
})();
