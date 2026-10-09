/* LiteBox v5 · app.js — 启动组装（唯一入口，Step 2 启动链） */

/* Step 28 修正 · 一：全站版本号。index.html 的静态引用与 router.loadScript 的动态引用
   都拼 ?v=LB_VERSION，版本升级即强制刷新缓存。 */
window.LB_VERSION = '5.11.0';

/* 版本变化 → 清 Cache Storage 并自动刷新一次（sessionStorage 防刷新循环）。
   放在 IIFE 最前：先对齐版本，再走启动链。 */
(function checkVersion() {
  const stored = localStorage.getItem('lb_version');
  const current = window.LB_VERSION || '5.11.0';
  if (stored && stored !== current) {
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(n => caches.delete(n)));
    }
    localStorage.setItem('lb_version', current);
    if (!sessionStorage.getItem('lb_version_reloaded')) {
      sessionStorage.setItem('lb_version_reloaded', '1');
      location.reload();
      return;
    }
  } else {
    localStorage.setItem('lb_version', current);
  }
})();

(() => {
  window.LB = window.LB || {};

  LB.dom.ready(() => {
    /* Step 5E：旧代码若用了裸 toast() 短名，统一映射到 LB.toast（ready 时各 core 模块已就绪） */
    window.toast = window.toast || LB.toast;
    /* 1. LB.storage 已就绪（core/storage.js 自动初始化） */
    LB.theme.init();                              /* 2. 主题 */
    LB.errors.init();                             /* 3. 全局错误记录（越早越好） */
    LB.shortcuts.init();                          /* 4. 统一快捷键 */
    LB.online.init();                             /* 5. 在线/离线提示条 */
    LB.ui.home.mount(LB.dom.$('#page-home'));     /* 6. 首页渲染 */
    LB.ui.search.init();                          /* 7. 搜索（快捷键已收口至 shortcuts，保留空壳） */
    LB.ui.tabbar.init();                          /* 8. 底部导航 + 宫格预渲染 */
    LB.ui.sheet.bind();                           /* 9. 弹层全局交互 */
    LB.router.init();                             /* 10. 路由注册 */
    LB.router.go(LB.hash.parse());                /* 11. 首次路由（支持刷新直达 #工具id） */
    LB.hash.onChange(id => LB.router.go(id));     /* 12. 后续路由 */
  });
})();

/* ================================================================
 * 复制能力全局验证（Step 5I · spec 步骤 3）
 * 在 window 上挂一个只读快照，供真机 DevTools /自动化测试核对：
 *   __lbCopySupported          本设备是否具备可用的复制能力
 *   __lbCopy.domestic         是否被判定为国产壳浏览器（决定走 execCommand）
 *   __lbCopy.execCommand      document.execCommand 是否存在
 *   __lbCopy.clipboardAPI     navigator.clipboard.writeText 是否存在
 *   __lbCopy.secureContext    是否安全上下文（file:// 与 127.0.0.1 均为 true）
 *   __lbCopy.api              当前推荐的 API 名称（copyNow / copySync）
 *   __lbCopy.toastSingleton   toast 是否为单例（防叠加）
 *
 * ★ 不做任何实际复制动作——只是读取能力标志，绝不消耗用户手势，
 *   也绝不会在页面上弹出任何元素（Step 5G/5H 的临时诊断框已全部移除）。
 * ================================================================ */
window.__lbCopySupported = (function () {
  const isSecure = typeof window.isSecureContext === 'boolean'
    ? window.isSecureContext
    : (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  const hasExec = typeof document.execCommand === 'function';
  const hasClip = !!(navigator.clipboard && navigator.clipboard.writeText);
  const domestic = (typeof LB._isDomesticBrowser === 'function') ? !!LB._isDomesticBrowser() : false;

  return {
    supported: hasExec || hasClip,
    domestic: domestic,
    execCommand: hasExec,
    clipboardAPI: hasClip,
    secureContext: isSecure,
    /* 国产壳浏览器一律走同步 execCommand（clipboard API 会假成功） */
    api: hasExec ? (domestic ? 'copySync(execCommand)' : 'copyNow') : (hasClip ? 'copyNow(clipboard)' : 'none'),
    toastSingleton: !!(window.LB && typeof LB.toast === 'function'),
    /* 只读提示：真正使用时务必在 onclick 同步栈内调用 LB.copyNow(text, msg) */
    usage: 'LB.copyNow(text, msg) —— 必须在 onclick 顶层同步栈调用'
  };
})();
