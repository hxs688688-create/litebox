/* LiteBox v5 · core/theme.js — 深浅主题（持久化 + 系统跟随） */
(() => {
  window.LB = window.LB || {};
  const KEY = 'lb_theme';
  const state = { cur: 'light' };

  const ICONS = {
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/></svg>',
    dark:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13.6A8.4 8.4 0 0 1 10.4 4 8.4 8.4 0 1 0 20 13.6z"/></svg>'
  };

  /* 主题色 meta 同步：色值一律从 tokens.css 变量读取，禁止在 JS 硬编码。
     仅同步无 media 属性的 theme-color（带 media 的双色方案由浏览器按系统偏好自动选择，Step 5B） */
  const syncMeta = () => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (!bg) return;
    LB.dom.$$('meta[name="theme-color"]:not([media])').forEach(m => m.setAttribute('content', bg));
  };

  const apply = (v) => {
    state.cur = v;
    document.documentElement.dataset.theme = v;
    const btn = LB.dom.$('#themeBtn');
    if (btn) { btn.innerHTML = ICONS[v]; btn.title = v === 'dark' ? '切换到浅色' : '切换到深色'; }
    syncMeta();
  };

  LB.theme = {
    init() {
      const saved = LB.storage.get(KEY);
      const sys = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      apply(saved === 'dark' || saved === 'light' ? saved : sys);
      const btn = LB.dom.$('#themeBtn');
      btn && btn.addEventListener('click', () => LB.theme.toggle());
      /* 未手动选择过主题时，跟随系统变化 */
      try {
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
          if (!LB.storage.get(KEY)) apply(e.matches ? 'dark' : 'light');
        });
      } catch (_) { /* 旧浏览器忽略 */ }
    },
    toggle() {
      const v = state.cur === 'dark' ? 'light' : 'dark';
      LB.storage.set(KEY, v);
      apply(v);
    },
    current() { return state.cur; }
  };
})();
