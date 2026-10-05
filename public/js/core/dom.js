/* LiteBox v5 · core/dom.js — DOM 工具集 */
(() => {
  window.LB = window.LB || {};
  LB.dom = {
    $:  (sel, root=document) => root.querySelector(sel),
    $$: (sel, root=document) => Array.from(root.querySelectorAll(sel)),
    esc: s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),
    clamp: (v,a,b) => Math.min(b, Math.max(a, v)),
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    fmtSize: b => b<1024 ? b+' B' : b<1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB',
    ready: fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn()
  };

  /* Step 8：句柄化事件绑定 —— 返回取消函数，工具在 unmount 里调用即可。
     与 router 克隆换节点方案双保险：绑到 document/window 上的监听器
     克隆兜不住，必须靠句柄收口。 */
  LB.on = function(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    return function() { el.removeEventListener(type, fn, opts); };
  };

  /* Step 10：给输入框绑定 Enter 提交（Shift/Ctrl/Alt+Enter 不拦截，
     多行输入框的换行不受影响） */
  LB.enterSubmit = function(inputEl, fn) {
    if (!inputEl) return;
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        fn();
      }
    });
  };

  /* Step 10：重新触发一次动画类（结果出现 / 数字刷新的微动效用） */
  LB.replay = function(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;   /* 强制回流，让同类动画能重新播放 */
    el.classList.add(cls);
  };
})();
