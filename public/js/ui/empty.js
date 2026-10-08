/* LiteBox v5 · ui/empty.js — 标准空状态（Step 8 新增）
 *
 * 全站统一的空状态组件：图标 + 标题 + 副标题 + 可选 CTA 按钮。
 * 供各工具的列表 / 记录 / 搜索结果为空时使用，
 * 样式见 components.css 的 .empty-state（es-icon / es-title / es-sub / es-cta）。
 *
 * 用法：
 *   LB.ui.empty(list, { icon:'📝', title:'还没有待办',
 *     sub:'点击下方按钮添加第一条', ctaText:'添加一条', onCta: () => focusInput() });
 */
(function() {
  window.LB = window.LB || {};
  LB.ui = LB.ui || {};

  /**
   * 在 host 里注入标准空状态
   * @param host  DOM 元素
   * @param opts  {icon, title, sub, ctaText, onCta}
   */
  LB.ui.empty = function(host, opts) {
    if (!host) return;
    opts = opts || {};
    const icon = opts.icon || '📭';
    const title = opts.title || '暂无数据';
    const sub = opts.sub || '';
    const cta = (opts.ctaText && opts.onCta) ? opts.ctaText : null;

    host.innerHTML =
      '<div class="empty-state">' +
        '<div class="es-icon" aria-hidden="true">' + icon + '</div>' +
        '<p class="es-title">' + LB.dom.esc(title) + '</p>' +
        (sub ? '<p class="es-sub">' + LB.dom.esc(sub) + '</p>' : '') +
        (cta ? '<button class="btn btn-main es-cta" type="button">' + LB.dom.esc(cta) + '</button>' : '') +
      '</div>';

    if (cta) {
      host.querySelector('.es-cta').addEventListener('click', opts.onCta);
    }
  };
})();
