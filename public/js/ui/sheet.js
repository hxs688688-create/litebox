/* LiteBox v5 · ui/sheet.js — 底部弹层控制器（Step 5E 按标准模板重写：
 * 1) 事件委托绑定到 document 捕获阶段，动态生成的关闭按钮也能响应
 * 2) 关闭选择器兼容 [data-close] / .sheet-close / .lb414-sheet-close / .x
 * 3) ESC 关闭（仅在有打开弹层时）
 * 4) open 强制互斥（先关所有已打开层）+ requestAnimationFrame 保证动画类在显示后添加 */
(function() {
  window.LB = window.LB || {};
  window.LB.ui = window.LB.ui || {};

  LB.ui.sheet = {
    bind: function() {
      /* 事件委托：绑定到 document，处理所有未来的 .sheet-mask 里的点击 */
      document.addEventListener('click', function(e) {
        /* 1. 点击 mask 空白区 */
        var mask = e.target.closest('.sheet-mask');
        if (mask && e.target === mask) {
          LB.ui.sheet.close();
          return;
        }

        /* 2. 点击关闭按钮（多种可能的选择器） */
        var closeBtn = e.target.closest('[data-close], .sheet-close, .lb414-sheet-close, .x');
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          LB.ui.sheet.close();
          return;
        }
      }, true); /* 捕获阶段 */

      /* ESC 关闭 */
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          var anyOpen = document.querySelector('.sheet-mask.lb-open, .sheet-mask:not([hidden])');
          if (anyOpen) {
            e.preventDefault();
            LB.ui.sheet.close();
          }
        }
      });
    },

    open: function(id) {
      /* 先关闭所有已打开的 */
      document.querySelectorAll('.sheet-mask').forEach(function(m) {
        m.hidden = true;
        m.classList.remove('lb-open');
      });

      var mask = document.getElementById(id);
      if (!mask) {
        console.warn('[LiteBox] sheet not found:', id);
        return;
      }
      mask.hidden = false;
      /* 强制重排后再加动画类 */
      void mask.offsetHeight;
      requestAnimationFrame(function() {
        mask.classList.add('lb-open');
      });
      document.body.classList.add('scroll-lock');
    },

    close: function() {
      document.querySelectorAll('.sheet-mask').forEach(function(m) {
        m.classList.remove('lb-open');
        setTimeout(function() {
          m.hidden = true;
        }, 320);
      });
      document.body.classList.remove('scroll-lock');
    }
  };
})();
