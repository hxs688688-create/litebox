/* LiteBox v5 · core/shortcuts.js — 统一快捷键（Ctrl/⌘+K · / · ESC · Ctrl/⌘+Enter） */
(() => {
  window.LB = window.LB || {};

  LB.shortcuts = {
    init() {
      document.addEventListener('keydown', e => {
        // 1. Ctrl/⌘ + K → 回首页 + 聚焦搜索
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          this.focusSearch();
          return;
        }

        // 2. / → 不在输入框内时聚焦搜索
        const tag = document.activeElement.tagName;
        const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable;
        if (e.key === '/' && !isEditing) {
          e.preventDefault();
          this.focusSearch();
          return;
        }

        // 3. ESC → 关弹层 / 关全屏 / 回首页
        if (e.key === 'Escape') {
          // 先关所有打开的 sheet
          const sheets = document.querySelectorAll('.sheet-mask.lb-open');
          if (sheets.length) {
            e.preventDefault();
            LB.ui.sheet.close();
            return;
          }
          // 再关工具自绘的全屏层（记分牌 / 提词器 / 弹幕）。
          // ★ 必须在「回首页」之前拦：ESC 同时命中两个处理器时，若继续往下走，
          //   用户按 ESC 想退出全屏，结果连工具页也被跳回首页 ——
          //   演讲 / 直播现场切走页面等于事故。
          //   只 preventDefault + return，不用 stopImmediatePropagation：
          //   本仓库快捷键在 document 上先注册，阻断传播会把工具侧的 ESC 监听一起拦掉，
          //   真正关闭全屏的动作仍由各工具自己的 handler 完成。
          const fsLayer = document.querySelector('.sb-fs, .tp-fs');
          if (fsLayer) {
            e.preventDefault();
            return;
          }
          // 最后退工具页
          const h = (location.hash || '#home').slice(1);
          if (h !== 'home') {
            e.preventDefault();
            location.hash = '#home';
            return;
          }
        }

        // 4. Ctrl/⌘ + Enter → 触发当前页面 .js-primary-submit 按钮
        //    （.page.active = 首页等静态页；#tool-host.active = 工具页共用容器）
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          const btn = document.querySelector('.page.active .js-primary-submit, #tool-host.active .js-primary-submit');
          if (btn && !btn.disabled) {
            e.preventDefault();
            btn.click();
          }
        }
      });
    },

    focusSearch() {
      // 若不在首页，先回首页
      if (location.hash && location.hash !== '#home') {
        location.hash = '#home';
      }
      setTimeout(() => {
        const inp = document.getElementById('homeSearch');
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, 80);
    }
  };
})();
