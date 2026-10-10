/* LiteBox v5 · ui/lock.js — 防误触（Step 10 新增）
 *
 * LB.lock(btn, ms)   —— 点击后短时间内锁定按钮，防连点（默认 500ms）。
 *                       计算/查询/生成类主按钮在动作前调用，重复点击直接忽略。
 * LB.confirm(btn, fn, ms) —— 危险操作二次确认：第一次点击只把按钮变成红色
 *                       「再点一次确认」，窗口期（默认 3s）内再点才真正执行。
 *                       opts.iconOnly: true 时用于 24px 图标小按钮 —— 不换文字，
 *                       只靠 .lb-confirming 红色态提示，再点执行。
 */
(function() {
  window.LB = window.LB || {};

  /**
   * 点击后短时间内锁定按钮，防连点
   * @param btn 按钮元素
   * @param ms  锁定毫秒（默认 500）
   */
  LB.lock = function(btn, ms) {
    if (!btn || btn.disabled) return false;
    btn.disabled = true;
    const old = btn.textContent;
    setTimeout(() => {
      btn.disabled = false;
      /* 如果期间文案被改（如"处理中…"），恢复原文案 */
      if (btn.textContent !== old) btn.textContent = old;
    }, ms || 500);
    return true;
  };

  /**
   * 二次确认（点一次变"确认？"，再点才执行）
   * @param btn 按钮元素
   * @param fn  确认后执行
   * @param ms  确认窗口毫秒（默认 3000）
   * @param opts { iconOnly } 图标小按钮不换文字，只用红色态
   */
  LB.confirm = function(btn, fn, ms, opts) {
    if (!btn) return;
    opts = opts || {};
    if (btn.dataset.lbConfirming === '1') {
      delete btn.dataset.lbConfirming;
      btn.classList.remove('lb-confirming');
      if (!opts.iconOnly && btn.dataset.lbOldText) btn.textContent = btn.dataset.lbOldText;
      delete btn.dataset.lbOldText;
      clearTimeout(btn._lbConfirmTimer);
      fn();
      return;
    }
    btn.dataset.lbOldText = btn.textContent;
    btn.dataset.lbConfirming = '1';
    if (!opts.iconOnly) btn.textContent = '再点一次确认';
    btn.classList.add('lb-confirming');
    btn._lbConfirmTimer = setTimeout(() => {
      if (btn.dataset.lbConfirming === '1') {
        delete btn.dataset.lbConfirming;
        btn.classList.remove('lb-confirming');
        if (!opts.iconOnly && btn.dataset.lbOldText) btn.textContent = btn.dataset.lbOldText;
        delete btn.dataset.lbOldText;
      }
    }, ms || 3000);
  };
})();
