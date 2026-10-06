/* LiteBox v5 · ui/search.js — 顶栏全局搜索（Step 23 · 五）
   搜索框已从首页 hero 下方搬进 header，任何页面都可见，因此它的 input / 清空
   逻辑不再属于 ui/home.js，统一收口在这里。
   行为：在工具页输入关键词 → 先跳回首页再出结果（首页才有结果网格）；
   快捷键聚焦（/ 与 Cmd/Ctrl+K）仍在 core/shortcuts.js，它按 #homeSearch 取元素，
   元素 id 未变，所以那边不用改。 */
(() => {
  window.LB = window.LB || {};
  window.LB.ui = window.LB.ui || {};

  LB.ui.search = {
    init() {
      const input = LB.dom.$('#homeSearch');
      const clear = LB.dom.$('#swClear');
      if (!input) return;

      const run = (q) => {
        const onHome = !location.hash || location.hash === '#home';
        if (q && !onHome) {
          /* 不在首页：先回首页（路由同步切页），再在同一轮里出结果 */
          LB.hash.go('home');
          LB.ui.home.search(q);
          return;
        }
        LB.ui.home.search(q);
      };

      input.addEventListener('input', LB.dom.debounce(() => {
        const v = input.value;
        if (clear) clear.hidden = !v;
        run(v.trim() ? v : '');
      }, 180));

      clear && clear.addEventListener('click', () => {
        input.value = '';
        clear.hidden = true;
        LB.ui.home.search('');
        input.focus();
      });
    }
  };
})();
