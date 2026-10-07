/* LiteBox v5 · core/toast.js — 轻提示（Step 5I：单例复用，彻底消除叠加）
 *
 *【Step 5I 问题 B：toast 叠加成 N 个】
 *
 * 旧实现的问题：
 *   每次LB.toast() 都 document.createElement('div') 再 appendChild 到 #toasts。
 *   用户在"复制"按钮上连点 5 次 → 5 个 .toast 同时挂在页面上，
 *   提示文字互相压盖，看起来像"卡了/出bug"。
 *
 * 本版策略：**全站只有1 个 toast 元素**
 *   - 首次调用时才创建，id = 'lb-toast-singleton'
 *   - 后续调用一律**复用同一个元素**，只改className / textContent
 *   - 每次调用都 clearTimeout + setTimeout，**重置消失计时**
 *     → 连点 5 次只会有1 个提示，且会等最后一次点击后 2.2s 才消失
 *   - 不依赖 #toasts 容器：直接 appendChild 到 body，
 *     自己带 position:fixed 样式（父容器样式变动也不会失效）
 *   - 消失动画结束后**只把元素隐藏（display:none）而不是移除**，
 *     下次调用直接复用同一个 DOM 节点，避免反复创建/销毁
 *
 * 对外API 完全不变：LB.toast(msg, type)
 */
(() => {
  window.LB = window.LB || {};

  const SINGLETON_ID = 'lb-toast-singleton';
  const DURATION = 2200;      /* 停留2.2 秒 */
  const EXIT_MS = 420;        /* 淡出动画时长（与 components.css 的 transition 对齐） */

  let el = null;              /* 全局唯一的 toast 元素 */
  let hideTimer = null;       /* 消失计时器 */
  let exitTimer = null;       /* 移除类名计时器 */
  let ensureTimer = null;

  function ensure() {
    if (el && el.isConnected) return el;

    /* 先复用页面里可能已存在的（极端情况下用户刷新但 DOM 残留） */
    el = document.getElementById(SINGLETON_ID);
    if (el) return el;

    if (!document.body) return null;
    el = document.createElement('div');
    el.id = SINGLETON_ID;
    el.className = 'toast';
    /* 自己带定位，不依赖 #toasts 容器（容器样式变动也不会失效） */
    el.style.cssText =
      'position:fixed;left:50%;top:calc(var(--head-h, 56px) + 12px);' +
      'transform:translateX(-50%) translateY(-8px);' +
      'z-index:600;display:none;pointer-events:none;' +
      'width:max-content;max-width:calc(100vw - 32px);';
    document.body.appendChild(el);
    return el;
  }

  /* 复位隐藏状态（准备下次显示） */
  function rearm(node) {
    node.classList.remove('out');
    node.style.display = '';
  }

  LB.toast = (msg, type) => {
    const node = ensure();
    if (!node) return;

    const text = String(msg == null ? '' : msg);
    const kind = (type && type !== 'info') ? type : '';

    /* 重置所有计时器 —— 连点时靠这个保证"只有最后一条生效且重新计时" */
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = null; }
    if (ensureTimer) { clearTimeout(ensureTimer); ensureTimer = null; }

    /* 复用同一个元素：只改内容与类型，绝不新建 */
    node.className = 'toast' + (kind ? ' toast-' + kind : '');
    if (node.textContent !== text) node.textContent = text;

    /* 若元素正在淡出，立刻拉回显示态 */
    if (node.style.display === 'none' || node.classList.contains('out')) {
      rearm(node);
      /* 双 rAF：确保初始态已提交再进入显示态，保证过渡动画生效 */
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('lb-in')));
    } else if (!node.classList.contains('lb-in')) {
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('lb-in')));
    } else {
      /* 已在显示态：强制重启动画，让用户感知"这是一次新的提示" */
      node.classList.remove('lb-in');
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('lb-in')));
    }

    /* DURATION 后开始淡出 */
    hideTimer = setTimeout(() => {
      node.classList.remove('lb-in');
      node.classList.add('out');
      /* 动画结束后不 remove()，只 display:none —— 保留节点供下次复用 */
      exitTimer = setTimeout(() => {
        node.classList.remove('out');
        node.style.display = 'none';
        exitTimer = null;
      }, EXIT_MS);
      hideTimer = null;
    }, DURATION);
  };

  /* 供测试/诊断读取当前是否只有一个 toast */
  LB._toastSingleton = function () {
    return {
      id: SINGLETON_ID,
      exists: !!document.getElementById(SINGLETON_ID),
      totalToasts: document.querySelectorAll('.toast').length
    };
  };
})();