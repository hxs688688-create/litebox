/* LiteBox v5 · ui/sheet.js — 底部弹层控制器（Step 5E 按标准模板重写：
 * 1) 事件委托绑定到 document 捕获阶段，动态生成的关闭按钮也能响应
 * 2) 关闭选择器兼容 [data-close] / .sheet-close / .lb414-sheet-close / .x
 * 3) ESC 关闭（仅在有打开弹层时）
 * 4) open 强制互斥（先关所有已打开层）+ requestAnimationFrame 保证动画类在显示后添加
 * Step 22 · 五：新增 isOpen(id)（给导航条做 toggle 判断），
 *   并在 open/close 里同步导航条按钮的 .on 高亮（弹层开着 → 对应 tab 亮；关掉 → 恢复首页）。
 *   ★ 注意：本文件捕获阶段拦截的是 [data-close] 等全站弹层关闭标记；
 *     阅读器面板用的是 [data-reader-close]，不走这里（Step 21 的根因修复）。 */
(function() {
  window.LB = window.LB || {};
  window.LB.ui = window.LB.ui || {};

  /* 弹层 id → 导航条按钮，用于高亮同步 */
  var SHEET_TAB = { catSheet: 'cat', meSheet: 'me' };

  function setTabOn(tab) {
    document.querySelectorAll('.tabbar button').forEach(function(b) {
      b.classList.toggle('on', !!tab && b.dataset.tab === tab);
    });
  }

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
      /* Step 21 · 三 修复 1：这里原来还挂过 body.sheet-open（配合 layout.css
         body.sheet-open .tabbar{display:none} 把导航条藏掉），任务书要求撤销：
         导航条保持可见、浮在遮罩之上（.tabbar z-index:220 > .sheet-mask 200）。 */
      /* Step 22 · 五：弹层打开 → 对应导航条按钮高亮 */
      if (SHEET_TAB[id]) setTabOn(SHEET_TAB[id]);
    },

    close: function() {
      document.querySelectorAll('.sheet-mask').forEach(function(m) {
        m.classList.remove('lb-open');
        setTimeout(function() {
          /* Step 22 · 五：这 320ms 里可能已经打开了另一个弹层
             （双击「我的」收起后马上点「分类」就会撞上），
             只隐藏仍然没打开的那些，否则新弹层会被这次延时的收尾动作藏掉。 */
          if (!m.classList.contains('lb-open')) m.hidden = true;
        }, 320);
      });
      document.body.classList.remove('scroll-lock');
      /* Step 22 · 五：弹层关闭 → 恢复导航条高亮。
         只在确实停在首页时点亮「首页」：工具页上按 ESC 也会走到这里，
         那时不该把首页按钮点亮（tabbar.js 的高亮同步按 hash 判定）。 */
      setTabOn((location.hash || '#home') === '#home' ? 'home' : null);
    },

    /* Step 22 · 五：导航条 toggle 需要知道某个弹层当前是否开着 */
    isOpen: function(id) {
      var mask = document.getElementById(id);
      return !!mask && !mask.hidden && mask.classList.contains('lb-open');
    }
  };
})();
