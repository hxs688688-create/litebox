/* LiteBox v5 · ui/tabbar.js — 底部导航 + 分类宫格 + 我的面板 */
(() => {
  window.LB = window.LB || {};
  window.LB.ui = window.LB.ui || {};

  const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const IC_THEME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3.2c.6 2.9-.4 4.6-1.9 6.1C8.6 10.8 7 12.4 7 15a5 5 0 0 0 10 0c0-1.9-.7-3.3-1.6-4.6-.9 1-1.7 1.5-2.6 1.7.9-2.9.3-6-0.8-8.9z"/></svg>';
  const IC_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3 1.8"/></svg>';
  const IC_STATS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>';
  const IC_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.5h15"/><path d="M9 6.2V4.6h6v1.6"/><path d="M6.2 6.5 7 20h10l.8-13.5"/><path d="M10 10.4v6M14 10.4v6"/></svg>';

  LB.ui.tabbar = {
    init() {
      const bar = LB.dom.$('#tabbar');
      if (!bar) return;
      const btns = LB.dom.$$('button', bar);

      btns.forEach(b => b.addEventListener('click', () => {
        const t = b.dataset.tab;
        /* Step 21 · 三：导航条现在浮在弹层遮罩之上，点首页 / 搜索 / 收藏时得主动
           把弹层沉下去（Step 13 时期弹层一开导航条就被隐藏，点不到，不需要这行）。 */
        if (t !== 'cat' && t !== 'me') LB.ui.sheet.close();
        if (t === 'home') {
          LB.hash.go('home');
        } else if (t === 'cat') {
          this.renderCatGrid();
          /* Step 22 · 五：再点一次「分类」= 收起弹层（toggle） */
          if (LB.ui.sheet.isOpen('catSheet')) LB.ui.sheet.close();
          else LB.ui.sheet.open('catSheet');
        } else if (t === 'search') {
          LB.hash.go('home');
          setTimeout(() => {
            const s = LB.dom.$('#homeSearch');
            if (s) { s.focus(); s.select(); }
          }, 60);
        } else if (t === 'fav') {
          LB.hash.go('home');
          setTimeout(() => LB.ui.home.goFav(), 80);
        } else if (t === 'me') {
          this.renderMePanel();
          /* Step 22 · 五：再点一次「我的」= 收起弹层（toggle） */
          if (LB.ui.sheet.isOpen('meSheet')) LB.ui.sheet.close();
          else LB.ui.sheet.open('meSheet');
        }
      }));

      /* 高亮同步：仅在首页时 home 亮起，其余情形全部熄灭 */
      LB.hash.onChange(id => {
        const on = id === 'home' ? 'home' : null;
        btns.forEach(b => b.classList.toggle('on', b.dataset.tab === on));
      });
      btns.forEach(b => b.classList.toggle('on', b.dataset.tab === 'home' && LB.hash.parse() === 'home'));

      this.renderCatGrid();
    },

    /* —— 分类弹层宫格：全部 + 收藏 + 10 分类 —— */
    renderCatGrid() {
      const grid = LB.dom.$('#catGrid');
      if (!grid) return;
      const favN = LB.storage.get('litebox_fav', []).length;
      const count = cat => LB.tools.reduce((n, t) => n + (t.cat === cat ? 1 : 0), 0);

      const cell = (v, ic, name, n, grad) =>
        '<button class="cat-cell" data-v="' + LB.dom.esc(v) + '" type="button">' +
        '<span class="cc-ic" style="background:' + grad + '">' + ic + '</span>' +
        '<span class="cc-tx">' + LB.dom.esc(name) + '</span>' +
        '<b>' + n + ' 个</b></button>';

      let html = cell('', '✨', '全部', LB.tools.length, 'var(--brand-grad)');
      html += cell('fav', '⭐', '收藏', favN, 'linear-gradient(135deg,var(--fav-gold),var(--warn))');
      LB.categories.list.forEach(c => {
        html += cell(c, LB.dom.esc(LB.categories.icon[c] || ''), c, count(c), LB.categories.gradient[c] || 'var(--brand-grad)');
      });
      grid.innerHTML = '<div class="cat-grid">' + html + '</div>';

      /* 宫格点击：先关弹层，再按目标回首页对应视图（覆盖式绑定，重建安全） */
      grid.onclick = e => {
        const cellEl = e.target.closest('.cat-cell');
        if (!cellEl) return;
        const v = cellEl.dataset.v;
        LB.ui.sheet.close();
        setTimeout(() => {
          if (v === '') LB.ui.home.goAll();
          else if (v === 'fav') LB.ui.home.goFav();
          else LB.ui.home.scrollToCat(v);
        }, 140);
      };
    },

    /* —— 「我的」面板：主题 / 最近 / 统计 / 清空 —— */
    renderMePanel() {
      const sheet = LB.dom.$('#meSheet .sheet');
      if (!sheet) return;
      const rec = LB.storage.get('litebox_rec', []);
      const usage = LB.storage.get('litebox_usage', {});
      const totalUse = Object.keys(usage).reduce((n, k) => n + (usage[k] || 0), 0);
      const usedKinds = Object.keys(usage).length;
      const dark = LB.theme.current() === 'dark';

      const chips = rec.map(id => {
        const t = LB.tools.find(x => x.id === id);
        return t ? '<button class="rchip" data-go="' + t.id + '" type="button">' + LB.dom.esc(t.name) + '</button>' : '';
      }).join('');

      sheet.innerHTML =
        '<header class="sheet-hd"><div><h2>我的</h2><p>主题、使用与本地数据</p></div>' +
        '<button class="sheet-x" data-close type="button" aria-label="关闭">' + X_SVG + '</button></header>' +

        '<div class="sheet-row"><span class="row-ic">' + IC_THEME + '</span>' +
        '<div class="row-tx"><b>主题外观</b><small>深浅色跟随系统，也可手动切换</small></div>' +
        '<button id="meThemeBtn" class="btn btn-ghost btn-sm" type="button">' + (dark ? '切换亮色' : '切换深色') + '</button></div>' +

        '<div class="sheet-row"><span class="row-ic">' + IC_CLOCK + '</span>' +
        '<div class="row-tx"><b>最近使用</b><small>最多保留 12 条记录</small></div>' +
        (rec.length ? '' : '<small class="row-side">暂无记录</small>') + '</div>' +
        (rec.length ? '<div class="recent-chips">' + chips + '</div>' : '') +

        '<div class="sheet-row"><span class="row-ic">' + IC_STATS + '</span>' +
        '<div class="row-tx"><b>使用统计</b><small>累计使用 ' + totalUse + ' 次 · 用过 ' + usedKinds + ' 个工具</small></div></div>' +

        '<div class="sheet-row"><span class="row-ic">' + IC_TRASH + '</span>' +
        '<div class="row-tx"><b>清空本地数据</b><small>收藏、最近使用、统计等一并清除</small></div>' +
        '<button id="meClear" class="btn btn-sm btn-err" type="button">清空</button></div>';

      /* 行为绑定（面板每次打开重建，绑定随之重建） */
      const themeBtn = LB.dom.$('#meThemeBtn', sheet);
      themeBtn && themeBtn.addEventListener('click', () => {
        LB.theme.toggle();
        themeBtn.textContent = LB.theme.current() === 'dark' ? '切换亮色' : '切换深色';
      });

      const chipsBox = LB.dom.$('.recent-chips', sheet);
      chipsBox && chipsBox.addEventListener('click', e => {
        const chip = e.target.closest('.rchip');
        if (!chip) return;
        LB.ui.sheet.close();
        LB.hash.go(chip.dataset.go);
      });

      const clearBtn = LB.dom.$('#meClear', sheet);
      clearBtn && clearBtn.addEventListener('click', () => {
        if (!confirm('确定清空所有本地数据？此操作不可恢复。')) return;
        LB.storage.keys().filter(k => k.indexOf('litebox_') === 0).forEach(k => LB.storage.remove(k));
        location.reload();
      });
    }
  };
})();
