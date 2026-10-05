/* LiteBox v5 · ui/home.js — 首页：hero / 搜索 / 分类 dock / 收藏 / 最近 / 卡片区 */
(() => {
  window.LB = window.LB || {};
  window.LB.ui = window.LB.ui || {};

  const SEARCH_HTML = [
    '<header class="hero">',
    '  <div class="hero-badge"><span class="dot"></span><b id="heroN">0</b> 个工具 · 本地优先 · <b id="heroWebN">0</b> 个 ⚡在线增强</div>',
    '  <h1>轻工具箱 LiteBox</h1>',
    '  <p>为学习与效率而生的小工具集。所有处理均在你自己的浏览器内完成。</p>',
    '</header>',
    /* Step 6E：今日诗词 + 热搜滚动条（夹在 hero 与搜索框之间） */
    '<div class="home-daily">',
    '  <div class="home-daily-poem" id="homeDailyPoem">',
    '    <span class="dp-label">📖 今日诗词</span>',
    '    <span class="dp-body">加载中…</span>',
    '  </div>',
    '  <div class="home-daily-hot" id="homeDailyHot" hidden>',
    '    <span class="dh-label">🔥 热搜</span>',
    '    <div class="dh-track" id="dhTrack"></div>',
    '  </div>',
    '</div>',
    '<div class="search-wrap">',
    '  <svg class="search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20.5 20.5-4.8-4.8"/></svg>',
    '  <input id="homeSearch" placeholder="搜索工具：证件照、GPA、进制…" autocomplete="off">',
    '  <button class="sw-clear" id="swClear" hidden type="button" aria-label="清空搜索">×</button>',
    '</div>',
    '<nav class="home-cat-nav" id="homeCatNav"><div class="chip-bar" id="chipBar"></div></nav>',
    '<div id="favSec" hidden>',
    '  <h2 class="cat-title"><span class="ct-ic">★</span>我的收藏<b class="ct-n" id="favN"></b><i class="ct-line"></i></h2>',
    '  <div class="tool-grid" id="favGrid"></div>',
    '  <div class="empty-state" id="favEmpty" hidden>',
    '    <div class="es-ic">☆</div><p class="es-t">还没有收藏</p><p class="es-d">点击工具卡片右上角的 ☆ 就会出现在这里</p>',
    '  </div>',
    '</div>',
    '<div id="recentSec" hidden>',
    '  <h2 class="cat-title"><span class="ct-ic">🕘</span>最近使用<b class="ct-n" id="recN"></b><i class="ct-line"></i></h2>',
    '  <div class="tool-grid" id="recentGrid"></div>',
    '</div>',
    '<div id="catWrap"></div>',
    '<div class="empty-state" id="emptyTip" hidden>',
    '  <div class="es-ic">🔍</div><p class="es-t">没有找到匹配的工具</p><p class="es-d">换个关键词试试，或点击上方分类浏览全部工具</p>',
    '</div>'
  ].join('');

  LB.ui.home = {
    _view: 'all',     /* 'all' | 'fav' */
    _searched: false,

    mount(root) {
      root = root || LB.dom.$('#page-home');
      if (!root || root.dataset.mounted) return;
      root.dataset.mounted = '1';
      root.innerHTML = SEARCH_HTML;
      const hn = LB.dom.$('#heroN');
      hn && (hn.textContent = LB.tools.length);
      /* 在线增强计数：registry 中 web:true 的工具数（动态，不硬编码） */
      const hw = LB.dom.$('#heroWebN');
      hw && (hw.textContent = LB.tools.filter(t => t.web).length);
      this.renderChips();
      this.renderCards();
      this.renderFav();
      this.renderRecent();
      this.renderDailyPoem();  /* Step 6E：今日诗词（异步，不阻塞首屏） */
      this.renderDailyHot();   /* Step 6E：热搜滚动条（失败静默隐藏） */
      this.bindEvents();
      this.setupScrollSync(); /* Step 5E：下滑联动 chip 高亮 */
    },

    /* ============ Step 6E：今日诗词 ============
       用「日期字符串的hash」对库长度取模选诗，而不是 Math.random()：
       验收要求「刷新页面 → 还是同一首」，随机实现做不到。
       注意 LB.dict.poems 的字段：t=题目 a=作者 b=正文（\n 分句）n=简注。
       正文 b 是多行的，这里只取首句，保持卡片单行不撑高。 */
    renderDailyPoem() {
      const box = LB.dom.$('#homeDailyPoem');
      if (!box) return;
      this._poemDay = new Date().toDateString();  /* 记录渲染日，供 onChange 判断跨天 */
      LB.dict.load('poems')
        .then(list => {
          const poems = (list && list.length) ? list : (LB.dict.poems || []);
          if (!poems.length) { box.hidden = true; return; }
          /* 本地日期而非 toISOString（后者按 UTC 计算，中国用户会差一天） */
          const now = new Date();
          const today = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
          let hash = 0;
          for (let i = 0; i < today.length; i++) hash = (hash * 31 + today.charCodeAt(i)) | 0;
          const p = poems[Math.abs(hash) % poems.length];
          const first = String(p.b || '').split('\n')[0];
          box.innerHTML =
            '<span class="dp-label">📖 今日诗词</span>' +
            '<span class="dp-body">' + LB.dom.esc(first) + '</span>' +
            '<span class="dp-author">— ' + LB.dom.esc(p.a) + '《' + LB.dom.esc(p.t) + '》</span>';
        })
        .catch(() => { box.hidden = true; });  /* 字典加载失败就整块隐藏，不留空壳 */
    },

    /* ============ Step 6E：热搜滚动条 ============
       复用 hotlist 工具的接口，但只取前 10 条，且失败即隐藏整块。
       滚动用 CSS animation（.dh-track），内容渲染两遍实现无缝循环：
       只放一份的话 translateX(-50%) 会滚到一半露出空白。

       【为什么先读hotlist 的缓存，而不是每次都发请求】
       hotlist.js 维护了 10 分钟的持久化缓存（lb_hot_cache_weibo，结构 {ts,list}）。
       同一份榜单没必要在首页再取一次：既省一次网络往返，也避免和工具页
       各存一份、TTL 还对不齐。这里只读不写，写入仍由 hotlist 工具自己负责。
       附带好处 —— 用户刚在热榜工具页看过数据，回首页立刻就有内容，
       而且此时一个请求都不发。缓存没有才去问后端要。 */
    renderDailyHot() {
      const box = LB.dom.$('#homeDailyHot');
      const track = LB.dom.$('#dhTrack');
      if (!box || !track) return;

      const paint = list => {
        const items = (list || [])
          .map(x => ({ t: x.title || x.name || x.keyword || x.t || '', u: x.link || x.url || x.murl || x.u || '' }))
          .filter(x => x.t)
          .slice(0, 10);
        if (!items.length) { box.hidden = true; return; }
        const one = items.map(x =>
          '<span class="dh-it"><a href="' + LB.dom.esc(x.u || '#') + '" target="_blank" rel="noopener noreferrer">' +
          LB.dom.esc(x.t) + '</a></span>'
        ).join('');
        track.innerHTML = one + one;  /* 复制一份，无缝衔接 */
        box.hidden = false;
      };

      /* 1) 先吃 hotlist 工具留下的缓存（10 分钟内有效），命中就不发请求 */
      const cached = this._readHotCache('weibo');
      if (cached && cached.length) { paint(cached); return; }

      /* 2) 缓存没有才请求后端；file:// 下无 API，直接隐藏 */
      if (location.protocol !== 'http:' && location.protocol !== 'https:') { box.hidden = true; return; }

      LB.api.getJSON('/api/hotlist?board=weibo', { timeout: 6000 })
        .then(d => {
          const arr = Array.isArray(d) ? d : (d && Array.isArray(d.data) ? d.data : []);
          paint(arr.map(x => ({ t: x.title || x.name || x.keyword || '', u: x.link || x.url || x.murl || '' })));
        })
        .catch(() => { box.hidden = true; });  /* 失败静默隐藏整块，不留空壳、不打断首屏 */
    },

    /* 读 hotlist.js 的持久化缓存。结构与它的 writeCache 对齐：{ ts, list }。
       TTL 与 hotlist.js 的 CACHE_TTL 同为 10 分钟，这里重复声明而不是引用它的常量：
       hotlist.js 是懒加载脚本，首屏时可能还没加载，读不到它的内部变量。 */
    _readHotCache(board) {
      const TTL = 10 * 60 * 1000;
      try {
        const box = LB.storage.get('lb_hot_cache_' + board, null);
        if (box && Array.isArray(box.list) && box.list.length && Date.now() - box.ts < TTL) return box.list;
      } catch (_) { /* 读失败就当没有 */ }
      return null;
    },

    /* —— 卡片模板（渐变底色由 JS 注入分类渐变） —— */
    _favSet() { return new Set(LB.storage.get('litebox_fav', [])); },
    _cardHTML(t, favSet) {
      const grad = LB.categories.gradient[t.cat] || 'var(--brand-grad)';
      const fav = favSet.has(t.id);
      return '<button class="tool-card" data-id="' + t.id + '" type="button">' +
        '<span class="fav-btn' + (fav ? ' on' : '') + '" data-fav="' + t.id + '">' + (fav ? '★' : '☆') + '</span>' +
        '<span class="ic" style="background:' + grad + '">' + LB.dom.esc(t.ic) + '</span>' +
        '<h3>' + LB.dom.esc(t.name) + '<span class="go">→</span></h3>' +
        '<p>' + LB.dom.esc(t.desc) + '</p>' +
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
        const list = LB.tools.filter(t => t.cat === cat);
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

    renderRecent() {
      const ids = LB.storage.get('litebox_rec', []);
      const tools = ids.map(id => LB.tools.find(t => t.id === id)).filter(Boolean);
      const sec = LB.dom.$('#recentSec'), grid = LB.dom.$('#recentGrid');
      if (!sec) return;
      const favSet = this._favSet();
      sec.hidden = !tools.length;
      grid.innerHTML = tools.map(t => this._cardHTML(t, favSet)).join('');
      const n = LB.dom.$('#recN'); n && (n.textContent = tools.length);
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

          /* 计算当前应该高亮的分类：探测线 = 视口顶 + header + catNav + 余量 */
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
      const y = sec.offsetTop - (head ? head.offsetHeight : 0) - (nav ? nav.offsetHeight : 0) - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      this._scrollChip = cat;
      this._syncChip(cat);
    },

    goFav() {
      this._view = 'fav';
      this._searched = false;
      LB.dom.$('#emptyTip').hidden = true;
      LB.dom.$('#catWrap').hidden = true;
      const si = LB.dom.$('#homeSearch');
      if (si) { si.value = ''; }
      const sc = LB.dom.$('#swClear');
      sc && (sc.hidden = true);
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
      LB.dom.$('#recentSec').hidden = true;
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
      const input = LB.dom.$('#homeSearch');
      const clear = LB.dom.$('#swClear');

      input && input.addEventListener('input', LB.dom.debounce(() => {
        const v = input.value;
        clear.hidden = !v;
        this.search(v);
      }, 180));

      clear && clear.addEventListener('click', () => {
        input.value = '';
        clear.hidden = true;
        this.search('');
        input.focus();
      });

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

      const recentGrid = LB.dom.$('#recentGrid');
      recentGrid && recentGrid.addEventListener('click', e => {
        const card = e.target.closest('.tool-card');
        if (card) LB.hash.go(card.dataset.id);
      });

      /* 回到首页时刷新最近使用
         ★ Step 6E：mount 开头有 dataset.mounted 幂等锁，首页一辈子只 mount 一次，
           所以跨天时诗词不会自动变。这里记录首屏渲染时的日期，
           回到首页时若日期已变则重渲染诗词（热搜条复用其 10 分钟缓存，无需每次重拉）。 */
      LB.hash.onChange(id => {
        if (id !== 'home') return;
        this.renderRecent();
        const today = new Date().toDateString();
        if (this._poemDay !== today) {
          this._poemDay = today;
          this.renderDailyPoem();
        }
      });
    }
  };
})();
