/* LiteBox v5 · core/online.js — 在线/离线状态提示条（顶部胶囊，offline 常驻 · online 2.2s 后收起） */
(() => {
  window.LB = window.LB || {};

  LB.online = {
    init() {
      // 创建顶部状态条
      const bar = document.createElement('div');
      bar.id = 'lbOnlineBar';
      bar.style.cssText = [
        'position:fixed',
        'left:50%',
        'transform:translateX(-50%) translateY(-100%)',
        'top:calc(var(--head-h) + 8px)',
        'z-index:200',
        'background:var(--fg)',
        'color:var(--bg)',
        'padding:8px 18px',
        'border-radius:999px',
        'font-size:12.5px',
        'font-weight:700',
        'box-shadow:var(--shadow)',
        'transition:transform .35s cubic-bezier(.34,1.3,.36,1), opacity .25s',
        'opacity:0',
        'pointer-events:none',
        'white-space:nowrap'
      ].join(';');
      bar.textContent = '📡 已离线 · 本地工具仍可使用';
      document.body.appendChild(bar);

      const show = () => {
        bar.style.transform = 'translateX(-50%) translateY(0)';
        bar.style.opacity = '1';
      };
      const hide = () => {
        bar.style.transform = 'translateX(-50%) translateY(-100%)';
        bar.style.opacity = '0';
      };

      // 初始状态
      if (!navigator.onLine) show();

      window.addEventListener('online', () => {
        bar.textContent = '✅ 已恢复网络连接';
        show();
        setTimeout(hide, 2200);
      });

      window.addEventListener('offline', () => {
        bar.textContent = '📡 已离线 · 本地工具仍可使用';
        show();
      });
    }
  };
})();
