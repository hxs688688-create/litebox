/* LiteBox v5 · core/errors.js — 全局错误处理（只记录不弹窗，供"我的"面板展示） */
(() => {
  window.LB = window.LB || {};

  LB.errors = {
    init() {
      window.addEventListener('error', e => {
        // 只记录，不弹窗打扰用户
        console.error('[LiteBox] 未捕获错误:', e.message, e.filename, e.lineno);
        this.push({ type: 'error', message: e.message, at: Date.now() });
      });

      window.addEventListener('unhandledrejection', e => {
        console.error('[LiteBox] 未处理的 Promise 拒绝:', e.reason);
        this.push({ type: 'rejection', message: String(e.reason?.message || e.reason), at: Date.now() });
      });
    },

    push(entry) {
      try {
        const list = LB.storage.get('litebox_errors', []);
        list.unshift(entry);
        LB.storage.set('litebox_errors', list.slice(0, 20));
      } catch (_) {}
    },

    // 供"我的"面板展示
    recent() {
      return LB.storage.get('litebox_errors', []);
    },

    clear() {
      LB.storage.remove('litebox_errors');
    }
  };
})();
