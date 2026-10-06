/* LiteBox v5 · ui/home.js — 首页：hero / 分类 dock / 收藏 / 卡片区 */
(() => {
  window.LB = window.LB || {};
  window.LB.ui = window.LB.ui || {};

  /* 首页区块顺序（Step 13 · A1；Step 19 · 二 重排；Step 23 精简）：
     header（含全局搜索框，见 index.html + layout.css）
     → hero（大标题 + 副标题）→ 分类 chips（横向滚动、吸顶）→ 工具网格。
     Step 23 删除：hero 徽章行（.hero-badge）、首页内搜索框（.search-wrap 及其吸顶 /
     is-stuck 检测 / --search-h 实测）、最近使用区块（#recentSec / renderRecent）。
     litebox_rec 存储仍由 router 写入 ——「我的」弹层还要用，只是首页不再展示。
     搜索框的事件绑定移到 ui/search.js：它现在是全局顶栏元素，不再属于首页。 */
  const HERO_HTML = [
    '<header class="hero">',
    '  <h1>轻工具箱 LiteBox</h1>',
    '  <p>为学习与效率而生的小工具集。所有处理均在你自己的浏览器内完成。</p>',
    '</header>',
    '<nav class="home-cat-nav" id="homeCatNav"><div class="chip-bar" id="chipBar"></div></nav>',
    '<div id="favSec" hidden>',
    '  <h2 class="cat-title"><span class="ct-ic">★</span>我的收藏<b class="ct-n" id="favN"></b><i class="ct-line"></i></h2>',
    '  <div class="tool-grid" id="favGrid"></div>',
    /* A9：收藏为空时的引导卡（类名与 ui/empty.js 的标准空状态一致） */
    '  <div class="empty-state" id="favEmpty" hidden>',
    '    <div class="es-icon" aria-hidden="true">⭐</div>',
    '    <p class="es-title">还没有收藏</p>',
    '    <p class="es-sub">点击工具卡片右上角的 ☆ 即可收藏</p>',
    '  </div>',
    '</div>',
    '<div id="catWrap"></div>',
    '<div class="empty-state" id="emptyTip" hidden>',
    '  <div class="es-icon" aria-hidden="true">🔍</div>',
    '  <p class="es-title">没有找到匹配的工具</p>',
    '  <p class="es-sub">换个关键词试试，或点击上方分类浏览全部工具</p>',
    '</div>'
  ].join('');

  LB.ui.home = {
    _view: 'all',     /* 'all' | 'fav' | 'search' */
    _searched: false,

    mount(root) {
      root = root || LB.dom.$('#page-home');
      if (!root || root.dataset.mounted) return;
      root.dataset.mounted = '1';
      root.innerHTML = HERO_HTML;
      /* Step 23 · 四：副标题改成「N 个常用工具，打开即用…」，数量取 registry 实时值 */
      const sub = LB.dom.$('.hero p', root);
      if (sub) sub.textContent = LB.tools.length + ' 个常用工具，打开即用。不上传、不收集、不打扰。';
      this.renderChips();
      this.renderCards();
      this.renderFav();
      this.bindEvents();
      this.setupScrollSync();  /* Step 5E：下滑联动 chip 高亮 */
    },

    /* ============ 搜索框（Step 23 · 五）：由 ui/search.js 统一绑定 ============
       本模块不再直接操作顶栏搜索框，只把「清空输入框」抽成 resetSearchInput()，
       供 goFav / 清空搜索 等入口复用。 */
    resetSearchInput() {
      const input = LB.dom.$('#homeSearch');
      input && (input.value = '');
      const clear = LB.dom.$('#swClear');
      clear && (clear.hidden = true);
    },

    /* —— 卡片模板（渐变底色由 JS 注入分类渐变） —— */
    _favSet() { return new Set(LB.storage.get('litebox_fav', [])); },
    /* A6：首页卡片 desc 截断到 12 字 + 省略号。
       只在这里截断，registry/tools.js 与工具页内仍保留完整 desc。 */
    _shortDesc(desc) {
      const s = String(desc || '');
      return s.length > 12 ? s.slice(0, 12) + '…' : s;
    },
    _cardHTML(t, favSet) {
      const grad = LB.categories.gradient[t.cat] || 'var(--brand-grad)';
      const fav = favSet.has(t.id);
      return '<button class="tool-card" data-id="' + t.id + '" type="button">' +
        '<span class="fav-btn' + (fav ? ' on' : '') + '" data-fav="' + t.id + '">' + (fav ? '★' : '☆') + '</span>' +
        '<span class="ic" style="background:' + grad + '">' + LB.dom.esc(t.ic) + '</span>' +
        '<h3>' + LB.dom.esc(t.name) + '<span class="go">→</span></h3>' +
        '<p>' + LB.dom.esc(this._shortDesc(t.desc)) + '</p>' +
        '</button>';
    },

    renderChips() {
      const bar = LB.dom.$('#chipBar');
      if (!bar) return;
      const count = cat => LB.tools.reduce((n, t) => n + (t.cat === cat ? 1 : 0), 0);
      let html = '<button class="chip on" data-v="" type="button"><span class="ch-ic">✨</span>全部<b class="ch-n">' + LB.tools.length + '</b></button>';
      html += '<button class="chip" data-v="fav" type="button"><span class="ch-ic">★</span>收藏<b class="ch-n" id="chipFavN">0</b></button>';
      LB.categories.list.forEach(c => {
        html += '<button class="chip" data-v="' + LB.dom.esc(c) + '" type="button"><span class="ch-ic">' + LB.dom.esc(LB.categories.icon[c] || '') + '</span>' + LB.dom.esc(c) + '<b class="ch-n">' + count(c) + '</b></button>';
      });
      bar.innerHTML = html;
    },

    renderCards() {
      const wrap = LB.dom.$('#catWrap');
      if (!wrap) return;
      const favSet = this._favSet();
      wrap.innerHTML = LB.categories.list.map(cat => {
        /* Step 15 · A4：分类内按实用度排序（weight 越大越靠前；未标 weight 的按 0 排最后）。
           filter 返回的是新数组，sort 不会改动 LB.tools 本身。 */
        const list = LB.tools
          .filter(t => t.cat === cat)
          .sort((a, b) => (b.weight || 0) - (a.weight || 0));
        if (!list.length) return '';
        return '<div class="cat-sec" data-cat="' + LB.dom.esc(cat) + '">' +
          '<h2 class="cat-title"><span class="ct-ic">' + LB.dom.esc(LB.categories.icon[cat] || '') + '</span>' + LB.dom.esc(cat) +
          '<b class="ct-n">' + list.length + '</b><i class="ct-line"></i></h2>' +
          '<div class="tool-grid">' + list.map(t => this._cardHTML(t, favSet)).join('') + '</div>' +
          '</div>';
      }).join('');
      this._searched = false;
    },

    renderFav() {
      const ids = LB.storage.get('litebox_fav', []);
      const tools = ids.map(id => LB.tools.find(t => t.id === id)).filter(Boolean);
      const favSet = this._favSet();
      const grid = LB.dom.$('#favGrid'), empty = LB.dom.$('#favEmpty'), sec = LB.dom.$('#favSec');
      if (!grid) return;
      grid.innerHTML = tools.map(t => this._cardHTML(t, favSet)).join('');
      empty.hidden = !!tools.length;
      /* 有收藏，或当前正处于收藏视图（展示空态引导）时显示区块 */
      sec.hidden = !tools.length && this._view !== 'fav';
      const n = LB.dom.$('#favN'); n && (n.textContent = tools.length);
      const cf = LB.dom.$('#chipFavN'); cf && (cf.textContent = tools.length);
    },

    /* Step 5F · 问题 G：高亮 chip 同时横向滚动到可视区中央。
     * 所有入口（下滑联动 / 点击 chip / 收藏 / 全部）都收敛到这一个方法，
     * 保证"高亮切换"与"横向滚动"永远一致，不会出现高亮变了但看不到的情况。
     * 只滚动 chipBar 自身的 scrollLeft，不触发祖先滚动，避免与竖向 scroll 监听互相干扰。 */
    _syncChip(v) {
      const bar = LB.dom.$('#chipBar');
      if (!bar) return;
      const chips = LB.dom.$$('#chipBar .chip');
      chips.forEach(c => c.classList.toggle('on', c.dataset.v === v));

      const active = chips.find(c => c.dataset.v === v);
      if (!active) return;

      const chipLeft = active.offsetLeft;
      const chipWidth = active.offsetWidth;
      const barWidth = bar.clientWidth;
      if (!barWidth) return;

      /* 目标：让 chip 中心对齐 bar 中心；不能小于 0 */
      const target = Math.max(0, Math.round(chipLeft - (barWidth - chipWidth) / 2));
      /* 已在可视范围内则不滚动，避免每次联动都触发一次平滑动画造成卡顿 */
      if (Math.abs(bar.scrollLeft - target) < 2) return;
      bar.scrollTo({ left: target, behavior: 'smooth' });
    },

    /* Step 5F · 问题 G：首页下滑时按可视区自动切换 chip 高亮 + 横向滚动到中央。
     * rAF 节流；仅首页 + 全部视图 + 无搜索时生效。
     * 高亮与横向滚动统一交给 _syncChip，避免两者不同步。 */
    _scrollChip: '',
    _scrollBound: false,
    setupScrollSync() {
      if (this._scrollBound) return;
      this._scrollBound = true;
      let raf = 0;
      const handler = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;

          /* 只在首页 + 无搜索 + 全部视图时生效 */
          const id = LB.hash.parse();
          if (id !== 'home' && id !== '') return;
          if (this._view !== 'all') return;
          const searchInput = document.getElementById('homeSearch');
          if (searchInput && searchInput.value.trim()) return;

          /* 计算当前应该高亮的分类：探测线 = 视口顶 + 吸顶堆叠（header + 分类条）+ 余量。
             Step 23 · 五：搜索框搬进 header 后不再有独立的吸顶条，探测线只算顶栏 + 分类条。
             探测只遍历 #catWrap 下的 .cat-sec。 */
          const header = document.querySelector('header');
          const headH = header ? header.getBoundingClientRect().height : 60;
          const nav = document.getElementById('homeCatNav');
          const navH = nav ? nav.getBoundingClientRect().height : 52;
          const probe = window.scrollY + headH + navH + 24;

          let current = '';
          document.querySelectorAll('#catWrap .cat-sec:not([hidden])').forEach(sec => {
            const top = sec.getBoundingClientRect().top + window.scrollY;
            if (top <= probe) current = sec.dataset.cat;
          });

          /* 只有变化时才更新，避免频繁触发 */
          if (current !== this._scrollChip) {
            this._scrollChip = current;
            this._syncChip(current);   /* 内部同时更新高亮 + 横向滚动居中 */
          }
        });
      };

      window.addEventListener('scroll', handler, { passive: true });
    },

    scrollToCat(cat) {
      this._view = 'all';
      LB.dom.$('#favSec').hidden = true;
      LB.dom.$('#emptyTip').hidden = true;
      const wrap = LB.dom.$('#catWrap');
      wrap.hidden = false;
      if (this._searched) this.renderCards();
      const sec = LB.dom.$('.cat-sec[data-cat="' + CSS.escape(cat) + '"]', wrap);
      if (!sec) return;
      const head = document.querySelector('header');
      const nav = LB.dom.$('#homeCatNav');
      /* A3/A8：滚到分类顶部时，吸顶堆叠（header + 分类条）会遮住一截，
         减去它们的高度才能让分类标题正好落在可视区顶端。 */
      const y = sec.offsetTop - (head ? head.offsetHeight : 0) -
        (nav ? nav.offsetHeight : 0) - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      this._scrollChip = cat;
      this._syncChip(cat);
    },

    goFav() {
      this._view = 'fav';
      this._searched = false;
      LB.dom.$('#emptyTip').hidden = true;
      LB.dom.$('#catWrap').hidden = true;
      this.resetSearchInput();
      this.renderFav();
      this._scrollChip = 'fav';
      this._syncChip('fav');
    },

    goAll() {
      this._view = 'all';
      this._searched = false;
      LB.dom.$('#favSec').hidden = true;
      LB.dom.$('#emptyTip').hidden = true;
      const wrap = LB.dom.$('#catWrap');
      wrap.hidden = false;
      this.renderCards();
      this._scrollChip = '';
      this._syncChip('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    toggleFav(id) {
      const fav = LB.storage.get('litebox_fav', []);
      const i = fav.indexOf(id);
      const on = i === -1;
      if (on) fav.unshift(id); else fav.splice(i, 1);
      LB.storage.set('litebox_fav', fav);
      /* 同步全文档所有同 id 星标 */
      LB.dom.$$('[data-fav="' + CSS.escape(id) + '"]').forEach(el => {
        el.classList.toggle('on', on);
        el.textContent = on ? '★' : '☆';
      });
      const cf = LB.dom.$('#chipFavN');
      cf && (cf.textContent = fav.length);
      if (this._view === 'fav') this.renderFav();
      LB.toast(on ? '已加入收藏' : '已取消收藏', on ? 'ok' : 'info');
    },

    /* —— 搜索（名称 > 关键词 > id > 描述） —— */
    _score(tool, q) {
      const n = tool.name.toLowerCase(), k = (tool.kw || '').toLowerCase(), d = (tool.desc || '').toLowerCase(), id = tool.id.toLowerCase();
      if (n === q) return 1000;
      if (n.startsWith(q)) return 900;
      if (n.includes(q)) return 800;
      const tokens = k.split(/[\s/、,，]+/).filter(Boolean);
      if (tokens.some(w => w.startsWith(q))) return 600;
      if (k.includes(q)) return 500;
      if (id.includes(q)) return 400;
      if (d.includes(q)) return 200;
      return 0;
    },

    search(q) {
      q = String(q || '').trim().toLowerCase();
      const wrap = LB.dom.$('#catWrap');
      const emptyTip = LB.dom.$('#emptyTip');
      if (!wrap) return;
      if (!q) {
        emptyTip.hidden = true;
        wrap.hidden = false;
        /* 恢复当前视图 */
        if (this._view === 'fav') this.goFav(); else this.goAll();
        return;
      }
      this._view = 'search';
      this._searched = true;
      LB.dom.$('#favSec').hidden = true;
      const hits = LB.tools
        .map(t => ({ t, s: this._score(t, q) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.t);
      if (!hits.length) {
        wrap.innerHTML = '';
        emptyTip.hidden = false;
        return;
      }
      emptyTip.hidden = true;
      wrap.hidden = false;
      const favSet = this._favSet();
      wrap.innerHTML =
        '<div class="cat-sec" data-cat="__search__">' +
        '<h2 class="cat-title"><span class="ct-ic">🔍</span>搜索结果<b class="ct-n">' + hits.length + '</b><i class="ct-line"></i></h2>' +
        '<div class="tool-grid">' + hits.map(t => this._cardHTML(t, favSet)).join('') + '</div>' +
        '</div>';
    },

    bindEvents() {
      /* Step 23 · 五：搜索框已搬进顶栏，input / 清空 的绑定由 ui/search.js 负责，
         这里只保留首页自身的 chip / 卡片交互。 */
      const bar = LB.dom.$('#chipBar');
      bar && bar.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const v = chip.dataset.v;
        if (v === '') this.goAll();
        else if (v === 'fav') this.goFav();
        else this.scrollToCat(v);
      });

      const wrap = LB.dom.$('#catWrap');
      wrap && wrap.addEventListener('click', e => {
        const favBtn = e.target.closest('.fav-btn');
        if (favBtn) { e.stopPropagation(); this.toggleFav(favBtn.dataset.fav); return; }
        const card = e.target.closest('.tool-card');
        if (card) LB.hash.go(card.dataset.id);
      });

      const favGrid = LB.dom.$('#favGrid');
      favGrid && favGrid.addEventListener('click', e => {
        const favBtn = e.target.closest('.fav-btn');
        if (favBtn) { e.stopPropagation(); this.toggleFav(favBtn.dataset.fav); return; }
        const card = e.target.closest('.tool-card');
        if (card) LB.hash.go(card.dataset.id);
      });
    }
  };
})();
