/* LiteBox v5 · ui/skeleton.js — 骨架屏（Step 8 新增）
 *
 * 在容器内注入骨架条，路由切换瞬间与联网工具请求期间统一使用，
 * 取代「工具加载中…」等 spinner 文案。
 * 样式见 tools.css 的 .skel / .skel-bar / @keyframes skelShimmer。
 */
(function() {
  window.LB = window.LB || {};
  LB.ui = LB.ui || {};

  /**
   * 在 host 内注入骨架屏
   * @param host  DOM 元素
   * @param rows  骨架条数
   * @param style 'card' | 'list' | 'text'
   */
  LB.ui.skeleton = function(host, rows, style) {
    if (!host) return;
    rows = rows || 3;
    style = style || 'card';
    let html = '<div class="skel skel-' + style + '" aria-hidden="true">';
    for (let i = 0; i < rows; i++) {
      html += '<div class="skel-row"><div class="skel-bar"></div></div>';
    }
    html += '</div>';
    host.innerHTML = html;
  };
})();
