/* LiteBox v5 · core/fail.js — 统一错误提示（Step 8 新增）
 *
 * 三段式口令：做了什么 + 为什么失败 + 怎么办。
 * 全站联网/异步工具失败时统一走这里，杜绝各工具自由发挥的报错文案。
 *
 * 用法：
 *   LB.fail('汇率', '接口暂时不可用', '稍后重试');
 *   → toast 显示「汇率失败：接口暂时不可用 · 稍后重试」
 * 返回拼好的完整消息，便于调用方在结果区同步展示。
 */
(function() {
  window.LB = window.LB || {};

  /**
   * 统一错误提示（三段式：原因 + 建议）
   * @param what  要做什么（如"汇率"）
   * @param why   为什么失败（如"接口超时"）
   * @param how   怎么办（如"稍后重试"）
   */
  LB.fail = function(what, why, how) {
    const msg = what + '失败：' + why + ' · ' + how;
    LB.toast(msg, 'err');
    return msg;
  };
})();
