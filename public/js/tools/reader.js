/* LiteBox v5 · tools/reader.js — 小说阅读器（本地版）
   Step 16 · B1 初版；Step 19 · 三 重构；Step 21 · 一 面板 / 翻页 / 工具栏修复；
   Step 22 · 一 沉浸模式（★ 彻底放弃 Fullscreen API）+ 书架 / 弹窗；
   Step 23 · 一/二 翻页精简为 2 种 + 上下工具栏同步显隐：
   ① 翻页只剩 scroll 滚动 / tap 点击翻页。删掉「上下滑动」（和滚动重复）与
      「仿真翻页」（3D 覆盖层效果不好）。旧存储值 'page' / 'slide-up' / 'curve'
      一律迁移为 'tap'。
   ② 上下工具栏只有一个状态源 barsHidden：点屏幕中间（tap 模式中间 1/3，
      滚动模式整块区域）或「⛶ 沉浸」按钮 → 上下栏同时显示 / 同时隐藏。
      旧 bug 根因：滚动方向驱动的临时收起只加在 topbar（.rd-hide），
      与沉浸态的 .auto-hide 是两套类，恢复时顶栏仍带着 .rd-hide → 只见底栏。
      现在 .rd-hide 整体删除，滚动方向与沉浸按钮都写同一个 .auto-hide。
   ③ 页内沉浸不变：#rdRead = .reader-fullscreen-container（fixed 占满视口），
      顶部 padding 用 env(safe-area-inset-top) 给状态栏留位 → 顶栏不被刘海压住。
   ④ 面板控制器 PanelManager（Step 21）：开一个必先关另一个，关闭态 pointer-events:none；
      关闭按钮用 [data-reader-close] —— [data-close] 会被 ui/sheet.js 捕获阶段吃掉。
   ⑤ 书架：封面固定 100×140 一行一本；操作弹窗改成居中卡片 + 独立遮罩，按钮不再重叠。
   ★ 诚实说明：不支持在线抓取网络小说（版权 + 反爬），只做本地文件阅读。
   存储：litebox_reader_books = [{ id, name, chapters:[{title,content}], addedAt, lastReadAt,
          readSec, progress:{chapter, scroll, page, percent}, settings:{...} }]（每本书独立设置）；
          旧版 litebox_reader 的书目自动迁移。超大文件写不下时降级为「仅本次会话」。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  const KEY_BOOKS = 'litebox_reader_books';
  const KEY_LEGACY = 'litebox_reader';
  const KEY_SETTINGS = 'litebox_reader_settings';
  const MAX_BOOKS = 5;          /* 书架最多留 5 本，避免 localStorage 撑爆 */
  const MAX_CHARS = 900000;     /* 单本超过约 90 万字就放弃持久化（只留内存） */

  const FONTS = [
    { v: 'song', n: '宋', css: '"Songti SC","SimSun",serif' },
    { v: 'hei', n: '黑', css: '"PingFang SC","Microsoft YaHei","Heiti SC",sans-serif' },
    { v: 'kai', n: '楷', css: '"Kaiti SC","KaiTi","STKaiti",serif' },
    { v: 'sys', n: '系统', css: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' }
  ];
  const THEMES = [
    { v: 'paper', n: '纸白', bg: '--rd-paper', ink: '--rd-ink' },
    { v: 'sepia', n: '米黄', bg: '--rd-sepia', ink: '--rd-ink' },
    { v: 'green', n: '护眼绿', bg: '--rd-green', ink: '--rd-ink' },
    { v: 'night', n: '夜间黑', bg: '--rd-night', ink: '--rd-ink-night' }
  ];
  const LINES = [1.4, 1.6, 1.8, 2.2];

  const DEF_SETTINGS = { font: 'song', size: 18, line: 1.8, theme: 'paper', mode: 'scroll', bright: 100 };

  /* Step 23 · 一：翻页只剩 2 种；旧存储值统一迁移，tap 是唯一分页模式 */
  const MODES = { scroll: '滚动', tap: '点击翻页' };
  const MODE_ORDER = ['scroll', 'tap'];
  const MIGRATE_MODE = { page: 'tap', 'slide-up': 'tap', curve: 'tap' };

  function normalizeMode(m) {
    if (MODES[m]) return m;
    return MIGRATE_MODE[m] || 'scroll';
  }

  /* 书架封面：从分类渐变里按书名取色（与全站卡片同一套渐变） */
  const COVERS = Object.keys((LB.categories && LB.categories.gradient) || {}).map(k => LB.categories.gradient[k]);

  let rootEl = null;
  let alive = false;
  let books = [];
  let globalSettings = Object.assign({}, DEF_SETTINGS);
  let cur = null;               /* 当前打开的书 */
  let chIdx = 0;
  let settings = Object.assign({}, DEF_SETTINGS);   /* 当前生效设置（打开书时合并该书独立设置） */
  let persistable = true;       /* 当前书能否写进 localStorage */
  let readSecAcc = 0;           /* 本次会话为当前书累计的阅读秒数（随进度一起落盘） */

  const debounceSave = LB.dom.debounce(() => saveAll(), 500);

  /* ================= 存储 ================= */

  function readBooks() {
    try {
      const arr = LB.storage.get(KEY_BOOKS, null);
      if (Array.isArray(arr)) return arr.filter(b => b && Array.isArray(b.chapters));
    } catch (_) {}
    /* 旧版迁移：litebox_reader = { books:[...] } → litebox_reader_books = [...] */
    try {
      const old = LB.storage.get(KEY_LEGACY, null);
      if (old && typeof old === 'object' && Array.isArray(old.books)) {
        const migrated = old.books
          .filter(b => b && Array.isArray(b.chapters))
          .map(b => Object.assign({}, b, {
            progress: Object.assign({ chapter: 0, scroll: 0, percent: 0 }, b.progress || {}),
            settings: null,
            readSec: 0,
            lastReadAt: b.addedAt || Date.now()
          }));
        if (migrated.length) LB.storage.set(KEY_BOOKS, migrated);
        return migrated;
      }
    } catch (_) {}
    return [];
  }

  function readGlobalSettings() {
    try {
      const s = LB.storage.get(KEY_SETTINGS, null);
      if (s && typeof s === 'object') {
        /* 旧字号/行距值吸附到新档位 */
        if (s.line && LINES.indexOf(s.line) === -1) {
          s.line = LINES.reduce((a, b) => Math.abs(b - s.line) < Math.abs(a - s.line) ? b : a, LINES[0]);
        }
        if (s.font === 'ping') s.font = 'sys';
        /* Step 23 · 一：page / slide-up / curve 全部迁移到剩下的两种模式 */
        s.mode = normalizeMode(s.mode);
        return s;
      }
    } catch (_) {}
    return {};
  }

  function saveAll() {
    if (!persistable || !books.length) {
      /* 空书架也要能清掉持久化数据 */
      if (persistable && cur === null) { try { LB.storage.set(KEY_BOOKS, books); } catch (_) {} }
      return;
    }
    try {
      LB.storage.set(KEY_BOOKS, books);
      LB.storage.set(KEY_SETTINGS, globalSettings);
    } catch (e) {
      persistable = false;
      LB.toast('本地存储空间不足，本书只保留在本次会话中（刷新后需重新上传）', 'warn');
    }
  }

  /* ================= 解析 ================= */

  /* TXT 章节切分：先按「第X章 / 序章 / 楔子 / 番外…」这类独占一行的标题切；
     切不出（少于 2 个标记）就按固定字数分节，保证任何 TXT 都能读。 */
  const CH_RE = /^[ \t　]*(?:第[0-9一二三四五六七八九十百千万零两]{1,8}[章回节卷篇]|序章|楔子|引子|前言|序言|后记|尾声|番外)[^\n]{0,40}$/gm;

  function splitTxt(text) {
    const src = String(text).replace(/\r\n?/g, '\n');
    const marks = [];
    CH_RE.lastIndex = 0;
    let m;
    while ((m = CH_RE.exec(src))) marks.push({ idx: m.index, title: m[0].trim() });
    if (marks.length < 2) return chunkByLength(src);
    const out = [];
    const head = src.slice(0, marks[0].idx).trim();
    if (head) out.push({ title: '前言', content: head });
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].idx : src.length;
      out.push({ title: marks[i].title, content: src.slice(marks[i].idx, end).trim() });
    }
    return out;
  }

  function chunkByLength(text, size) {
    const step = size || 8000;
    const out = [];
    for (let i = 0; i < text.length; i += step) {
      out.push({ title: '第 ' + (out.length + 1) + ' 节', content: text.slice(i, i + step) });
    }
    return out.length ? out : [{ title: '正文', content: text }];
  }

  function htmlToText(html) {
    const withBreaks = String(html)
      .replace(/<\s*(script|style|svg)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote|tr|section|article)\s*>/gi, '\n');
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return String(doc.body.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve();
    if (!window.__lbJSZipP) {
      window.__lbJSZipP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/jszip.min.js';
        s.onload = resolve;
        s.onerror = () => { window.__lbJSZipP = null; reject(new Error('EPUB 解析组件加载失败')); };
        document.head.appendChild(s);
      });
    }
    return window.__lbJSZipP;
  }

  /* EPUB：读 container.xml → .opf → 按 spine 顺序把每个文档转成一章 */
  async function parseEpub(file) {
    await loadJSZip();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const cf = zip.file('META-INF/container.xml');
    if (!cf) throw new Error('不是有效的 EPUB（缺少 container.xml）');
    const cDoc = new DOMParser().parseFromString(await cf.async('string'), 'application/xml');
    const rootfile = cDoc.querySelector('rootfile') && cDoc.querySelector('rootfile').getAttribute('full-path');
    if (!rootfile) throw new Error('无法读取 EPUB 目录');

    const opfFile = zip.file(rootfile);
    if (!opfFile) throw new Error('无法读取 EPUB 内容清单');
    const oDoc = new DOMParser().parseFromString(await opfFile.async('string'), 'application/xml');

    const manifest = {};
    oDoc.querySelectorAll('manifest item').forEach(it => {
      manifest[it.getAttribute('id')] = it.getAttribute('href');
    });
    const basePath = rootfile.slice(0, rootfile.lastIndexOf('/') + 1);
    const fix = p => {
      const parts = (basePath + decodeURIComponent(p)).split('/');
      const out = [];
      for (const x of parts) {
        if (!x || x === '.') continue;
        if (x === '..') out.pop(); else out.push(x);
      }
      return out.join('/');
    };

    const refs = Array.from(oDoc.querySelectorAll('spine itemref'))
      .map(r => manifest[r.getAttribute('idref')])
      .filter(Boolean);
    const list = refs.length ? refs : Object.keys(manifest).map(k => manifest[k]);

    const chapters = [];
    for (const href of list) {
      const f = zip.file(fix(href));
      if (!f) continue;
      const raw = await f.async('string');
      if (!/\.(x?html?|xhtml)$/i.test(href) && !/<(p|div|h[1-6]|body)[\s>]/i.test(raw)) continue;
      const text = htmlToText(raw);
      if (!text) continue;
      /* 标题：优先取文档里的第一个 h1~h3，取不到就用第一行短文本，再兜底「第 N 章」 */
      let title = '';
      const h = raw.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      if (h) title = htmlToText(h[1]).slice(0, 40);
      if (!title) {
        const first = text.split('\n')[0] || '';
        if (first.length <= 40) title = first;
      }
      if (!title) title = '第 ' + (chapters.length + 1) + ' 章';
      chapters.push({ title: title, content: text });
    }
    if (!chapters.length) throw new Error('EPUB 里没有可读的正文');
    return chapters;
  }

  /* ================= 书架 / 上传 ================= */

  function fmtRead(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    if (sec < 60) return '不到 1 分钟';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  }

  function renderShelf() {
    const box = $('#rdShelf', rootEl);
    if (!box) return;
    const empty = $('#rdShelfEmpty', rootEl);
    if (!books.length) {
      box.innerHTML = '';
      box.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    box.hidden = false;
    box.innerHTML = books.map((b, i) => {
      const grad = COVERS.length ? COVERS[(b.name || ' ').charCodeAt(0) % COVERS.length] : 'var(--brand-grad)';
      const firstChar = esc((b.name || '书').trim().charAt(0) || '书');
      const pct = (b.progress && b.progress.percent) || 0;
      /* Step 22 · 修复 5：封面从「占满一格的大色块」改成固定 100×140 的小封面 + 右侧信息，
         一行一本书（任务书给的 .book-item 就是横向 flex），375px 下不再一本书吃满半屏。 */
      return '<div class="book-item" data-id="' + esc(b.id) + '">' +
        '<button class="book-open" data-open="' + esc(b.id) + '" type="button">' +
        '<span class="book-cover" style="background:' + grad + '">' + firstChar + '</span>' +
        '<span class="book-info">' +
        '<b class="book-title">' + esc(b.name) + '</b>' +
        '<small class="book-sub">' + b.chapters.length + ' 章 · ' + (b.chars || 0).toLocaleString('zh-CN') + ' 字</small>' +
        '<span class="book-meta">📖 ' + pct + '% · ⏱ ' + fmtRead(b.readSec) + '</span>' +
        '</span>' +
        '</button>' +
        '</div>';
    }).join('');
  }

  /* 书架操作：继续阅读 / 重命名 / 删除 */
  function openBookActions(id) {
    const b = books.find(x => x.id === id);
    if (!b) return;
    const list = $('#rdActList', rootEl);
    const rename = $('#rdActRename', rootEl);
    list.textContent = '《' + b.name + '》';
    $('#rdActInput', rootEl).value = b.name;
    rename.hidden = true;
    PanelManager.open('actions');
    const opener = $('#rdActOpen', rootEl);
    opener.onclick = () => { closeSheets(); openBook(b.id); };
    const renamer = $('#rdActRenameBtn', rootEl);
    renamer.onclick = () => { rename.hidden = !rename.hidden; };
    const sure = $('#rdActRenameOk', rootEl);
    sure.onclick = () => {
      const v = $('#rdActInput', rootEl).value.trim();
      if (!v) { LB.toast('书名不能为空', 'err'); return; }
      b.name = v;
      if (cur && cur.id === b.id) $('#rdTitle', rootEl).textContent = v;
      saveAll();
      renderShelf();
      closeSheets();
      LB.toast('已重命名', 'ok');
    };
    const del = $('#rdActDel', rootEl);
    del.onclick = () => {
      closeSheets();
      LB.confirm(del, () => {
        books = books.filter(x => x.id !== b.id);
        if (cur && cur.id === b.id) { cur = null; backToShelf(); }
        saveAll();
        renderShelf();
        LB.toast('已移出书架', 'ok');
      }, 3000, { iconOnly: true });
    };
  }

  async function openFile(file) {
    if (!alive || !file) return;
    const stat = $('#rdStat', rootEl);
    const name = (file.name || '未命名').replace(/\.(txt|epub)$/i, '');
    const isEpub = /\.epub$/i.test(file.name || '') || /epub/i.test(file.type || '');
    try {
      stat.textContent = isEpub ? '⏳ 正在解析 EPUB…' : '⏳ 正在读取文本…';
      let chapters;
      if (isEpub) {
        chapters = await parseEpub(file);
      } else {
        const text = await file.text();
        if (!text.trim()) throw new Error('文件是空的');
        chapters = splitTxt(text);
      }
      if (!alive) return;
      const chars = chapters.reduce((n, c) => n + c.content.length, 0);
      const book = {
        id: 'b' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36),
        name: name || '未命名',
        chapters: chapters,
        chars: chars,
        progress: { chapter: 0, scroll: 0, percent: 0 },
        settings: null,          /* 每本书独立设置：首次打开时继承全局默认 */
        readSec: 0,
        addedAt: Date.now(),
        lastReadAt: 0
      };
      /* 书架上同名书替换掉旧的，避免重复堆叠 */
      books = books.filter(b => b.name !== book.name);
      books.unshift(book);
      if (books.length > MAX_BOOKS) books = books.slice(0, MAX_BOOKS);
      persistable = chars <= MAX_CHARS;
      if (!persistable) LB.toast('本书较大（' + chars.toLocaleString('zh-CN') + ' 字），只保留在本次会话，刷新后需重新上传', 'warn');
      stat.textContent = '';
      renderShelf();
      openBook(book.id);
      saveAll();
    } catch (e) {
      stat.textContent = '';
      LB.toast('解析失败：' + ((e && e.message) || '未知错误'), 'err');
    }
  }

  /* ================= 上下工具栏同步显隐（Step 23 · 二） =================
     单一状态源 barsHidden：顶栏与底栏永远一起加 / 一起去掉 .auto-hide。
     旧 bug 根因：滚动方向驱动的临时收起只往 topbar 上加 .rd-hide，与沉浸态的
     .auto-hide 两套类互不知情 —— 点中间"恢复"时只清了 .auto-hide，顶栏还带着
     .rd-hide，于是只有底部工具栏弹出。修法：.rd-hide 整条删掉，滚动方向也改写
     .auto-hide，并只在"下滑"时收起、上滑或点中间时同时恢复两栏。
     顶栏高度含 env(safe-area-inset-top)（见 tools.css .reader-topbar），
     刘海 / 挖孔不会压住它。 */

  let barsHidden = false;       /* true = 上下工具栏都已收起（沉浸阅读中） */

  function updateBarsUI() {
    if (!rootEl) return;
    const top = $('.reader-topbar', rootEl);
    const bottom = $('.reader-bottombar', rootEl);
    if (top) top.classList.toggle('auto-hide', barsHidden);
    if (bottom) bottom.classList.toggle('auto-hide', barsHidden);
    const btn = $('#rdImmersiveBtn', rootEl);
    if (btn) {
      btn.textContent = barsHidden ? '⛶ 退出沉浸' : '⛶ 沉浸';
      btn.classList.toggle('on', barsHidden);
    }
  }

  function setBarsHidden(on) {
    barsHidden = !!on;
    updateBarsUI();
  }

  /* 点屏幕中间：上下栏同时显示 / 同时隐藏 */
  function toggleReaderBars() { setBarsHidden(!barsHidden); }

  /* ================= 阅读 ================= */

  function openBook(id) {
    const b = books.find(x => x.id === id);
    if (!b) return;
    cur = b;
    readSecAcc = 0;
    chIdx = Math.min(b.progress && b.progress.chapter || 0, b.chapters.length - 1);
    /* 每本书独立设置：书内设置 → 全局默认 → 出厂默认 */
    settings = Object.assign({}, DEF_SETTINGS, globalSettings, b.settings || {});
    if (settings.line && LINES.indexOf(settings.line) === -1) {
      settings.line = LINES.reduce((a, x) => Math.abs(x - settings.line) < Math.abs(a - settings.line) ? x : a, LINES[0]);
    }
    if (settings.font === 'ping') settings.font = 'sys';
    /* Step 23 · 一：旧 mode 值（page / slide-up / curve）迁移到剩下的两种 */
    settings.mode = normalizeMode(settings.mode);
    syncModeClass();                   /* 类名跟着设置走，不能停在默认的 scroll-mode */
    syncModeClass();                   /* 存储里的模式要刷到类名上，不能停在 HTML 默认的 scroll-mode */
    $('#rdUpload', rootEl).hidden = true;
    $('#rdRead', rootEl).hidden = false;
    $('#rdTitle', rootEl).textContent = b.name;
    setBarsHidden(false);                /* 进书先露出工具栏，再点中间收起 */
    renderChapter();
    renderSettings();
    renderToc();
    /* 恢复上次位置：滚动看 scrollTop，点击翻页看页码 */
    const pr = b.progress || {};
    setTimeout(() => {
      const v = $('.reader-content', rootEl);
      if (!v || !cur) return;
      if (isPaged()) {
        showPage(Math.min(pr.page || 0, Math.max(0, pageCount() - 1)));
      } else if ((pr.scroll || 0) > 0) {
        v.scrollTop = pr.scroll;
      }
      syncProgress();
    }, 60);
    if (!b._hinted) {
      b._hinted = true;
      LB.toast('点屏幕中间可收起 / 唤回工具栏', 'info');
    }
  }

  function backToShelf() {
    saveProgress();
    saveAll();
    cur = null;
    setBarsHidden(false);
    const rd = $('#rdRead', rootEl);
    if (rd) rd.hidden = true;
    closeSheets();
    $('#rdUpload', rootEl).hidden = false;
    renderShelf();
  }

  function renderChapter() {
    if (!cur) return;
    const ch = cur.chapters[chIdx];
    const view = $('.reader-content', rootEl);
    /* 按空行切段，渲染成 <p>；全部转义，不解析正文里的 HTML */
    const paras = String(ch.content || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    view.innerHTML = '<h2 class="rd-ch">' + esc(ch.title) + '</h2>' +
      paras.map(p => '<p>' + esc(p) + '</p>').join('');
    view.scrollTop = 0;
    pageIdx = 0;
    $('#rdChName', rootEl).textContent = ch.title;
    $('#rdChIdx', rootEl).textContent = (chIdx + 1) + ' / ' + cur.chapters.length;
    applySettings();
    paginateContent();
    if (pendingPageEnd) {
      /* 从上一章往回翻：停在末页 */
      pendingPageEnd = false;
      showPage(pageCount() - 1);
    }
    syncProgress();
  }

  function applySettings() {
    if (!rootEl) return;
    const view = $('.reader-content', rootEl);
    if (!view) return;
    const f = FONTS.find(x => x.v === settings.font) || FONTS[0];
    const t = THEMES.find(x => x.v === settings.theme) || THEMES[0];
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue(t.bg).trim() || '#ffffff';
    const ink = cs.getPropertyValue(t.ink).trim() || '#22262e';
    /* 主题色是运行时数据（四套底色变量），只把它作为 CSS 变量传给样式表 */
    view.style.setProperty('--rd-page-bg', bg);
    view.style.setProperty('--rd-ink-live', ink);
    view.style.fontFamily = f.css;
    view.style.fontSize = settings.size + 'px';
    view.style.lineHeight = String(settings.line);
    /* 亮度：内容上叠一层半透明暗色（tokens 变量），比 filter 更省且不影响模糊层 */
    const ov = $('#rdDim', rootEl);
    if (ov) ov.style.opacity = settings.bright >= 100 ? '0' : String((100 - settings.bright) / 130);
    /* 夜间模式下工具栏也换成暗色，避免一片白刺眼 */
    const read = $('#rdRead', rootEl);
    if (read) read.classList.toggle('rd-night', settings.theme === 'night');
    /* 字体 / 字号 / 行距变了，每页能装的段落就变了 → 重新切页 */
    if (isPaged()) paginateContent();
  }

  function syncProgress() {
    if (!rootEl || !cur) return;
    const view = $('.reader-content', rootEl);
    const pagedTap = isPaged();
    let p;
    if (pagedTap) {
      const n = pageCount();
      p = n > 1 ? Math.min(100, Math.max(0, pageIdx / (n - 1) * 100)) : 100;
    } else {
      const max = view.scrollHeight - view.clientHeight;
      p = max > 6 ? Math.min(100, Math.max(0, view.scrollTop / max * 100)) : 100;
    }
    const bar = $('#rdProg', rootEl);
    if (bar) bar.value = String(Math.round(p));
    const pct = $('#rdPct', rootEl);
    if (pct) pct.textContent = Math.round(p) + '%';
    const n = pageCount();
    cur.progress = {
      chapter: chIdx,
      scroll: pagedTap ? Math.min(pageTops[pageIdx] || 0, Math.max(0, view.scrollHeight - view.clientHeight)) : view.scrollTop,
      page: pagedTap ? pageIdx : Math.min(n - 1, Math.max(0, pageIndexFromScroll())),
      percent: Math.round(p)
    };
  }

  function saveProgress() {
    if (!cur) return;
    syncProgress();
    const ch = cur.chapters[chIdx];
    cur.lastReadAt = Date.now();
    if (readSecAcc > 0) { cur.readSec = (cur.readSec || 0) + readSecAcc; readSecAcc = 0; }
    debounceSave();
  }

  function gotoChapter(i) {
    if (!cur) return;
    chIdx = Math.max(0, Math.min(cur.chapters.length - 1, i));
    renderChapter();
    saveProgress();
    renderToc();
  }

  function nextChapter() { if (cur && chIdx < cur.chapters.length - 1) gotoChapter(chIdx + 1); else LB.toast('已经是最后一章了', 'info'); }
  function prevChapter() { if (cur && chIdx > 0) gotoChapter(chIdx - 1); else LB.toast('已经是第一章了', 'info'); }

  /* ================= 目录 / 设置 ================= */

  function renderToc() {
    const box = $('#rdTocList', rootEl);
    if (!box || !cur) return;
    box.innerHTML = cur.chapters.map((c, i) =>
      '<button class="rd-toc-item' + (i === chIdx ? ' on' : '') + '" data-ch="' + i + '" type="button">' +
      '<span>' + esc(c.title) + '</span><small>' + (c.content.length).toLocaleString('zh-CN') + ' 字</small></button>'
    ).join('');
    /* 当前章节滚动到抽屉可视区 */
    const on = box.querySelector('.rd-toc-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function renderSettings() {
    if (!rootEl) return;
    const f = $('#rdFonts', rootEl);
    if (!f) return;
    f.innerHTML = FONTS.map(x => '<button class="chip' + (settings.font === x.v ? ' on' : '') + '" data-font="' + x.v + '" type="button">' + x.n + '</button>').join('');
    $('#rdLines', rootEl).innerHTML = LINES.map(n =>
      '<button class="chip' + (settings.line === n ? ' on' : '') + '" data-line="' + n + '" type="button">' + n + '</button>').join('');
    $('#rdThemes', rootEl).innerHTML = THEMES.map(x =>
      '<button class="chip' + (settings.theme === x.v ? ' on' : '') + '" data-theme="' + x.v + '" type="button">' + x.n + '</button>').join('');
    $('#rdModes', rootEl).innerHTML = MODE_ORDER.map(v =>
      '<button class="chip' + (settings.mode === v ? ' is-active' : '') + '" data-reader-page-mode="' + v + '" type="button">' + MODES[v] + '</button>').join('');
    $('#rdBright', rootEl).value = String(settings.bright);
    $('#rdBrightV', rootEl).textContent = settings.bright + '%';
    const size = $('#rdSize', rootEl);
    size.value = String(settings.size);
    $('#rdSizeV', rootEl).textContent = settings.size + 'px';
  }

  /* ============ 面板控制器（Step 21 · 修复 1） ============
     一个中央控制器管所有阅读器面板：开 A 必先关 B，遮罩与面板用 is-open 类切换，
     关闭态由 CSS 的 pointer-events:none 兜底，不再出现"面板挡住整屏点不动"。
     ★ 关闭按钮一律用 [data-reader-close]，不能用 [data-close]：
       ui/sheet.js 在 document 捕获阶段拦截 [data-close] 并 stopPropagation()，
       事件根本到不了阅读器的面板上 —— 这正是"点设置后关不掉"的根因。 */
  const PANELS = { settings: '#rdSetSheet', toc: '#rdTocSheet', actions: '#rdActSheet' };
  /* 阅读态两个面板共用 #reader-mask；书架操作弹窗有自己的 .book-action-mask（Step 22 · 修复 5） */
  const PANEL_MASK = { settings: '#reader-mask', toc: '#reader-mask', actions: '#rdActMask' };

  const PanelManager = {
    current: null,   /* null | 'settings' | 'toc' | 'actions' */

    panelEl(name) { return $(PANELS[name], rootEl); },

    maskEl(name) { return $(PANEL_MASK[name], rootEl); },

    open(name) {
      if (!PANELS[name]) return;
      const panel = PanelManager.panelEl(name);
      if (!panel) return;
      PanelManager.close();
      PanelManager.current = name;
      panel.classList.add('is-open');
      const mask = PanelManager.maskEl(name);
      if (mask) mask.classList.add('is-open');
      document.body.classList.add('reader-panel-open');
    },

    close() {
      if (PanelManager.current) {
        const panel = PanelManager.panelEl(PanelManager.current);
        if (panel) panel.classList.remove('is-open');
      }
      PanelManager.current = null;
      if (rootEl) $$('.reader-mask', rootEl).forEach(m => m.classList.remove('is-open'));
      document.body.classList.remove('reader-panel-open');
    }
  };

  /* 兼容旧调用点 */
  function closeSheets() { PanelManager.close(); }

  /* ============ 翻页模式（Step 23 · 一：4 种精简为 2 种） ============
     scroll  连续滚动（默认）
     tap     点击翻页：按容器可视高度切页，点内容区左 / 右 1/3 整页翻，中间 1/3 切工具栏
     ★ 「上下滑动」（与滚动重复）与「仿真翻页」（3D 覆盖层效果不好）已整体删除。
     ★ 分页只记录"每页起点的内容坐标"（pageTops），不把 DOM 拆成一页页盒子：
       超长段落还能按整页高度补切滚动点，翻页不会跳过它的内容。
     MODES / MODE_ORDER / MIGRATE_MODE 定义在文件顶部（读设置时就要用到）。 */

  let pageTops = [];      /* 每页起始的内容坐标 */
  let pageIdx = 0;
  let pendingPageEnd = false;   /* 上一章后停在最后一页 */

  function isPaged() { return settings.mode === 'tap'; }
  function pageCount() { return pageTops.length; }

  /* 模式类名与 settings.mode 对齐。applyPageMode 与 openBook 共用：
     打开书时若只读设置不刷类名，界面会停在 HTML 默认的 scroll-mode 上
     （分页逻辑已经按 tap 走，但 .tap-mode 类缺失 → 光标/样式不一致）。 */
  function syncModeClass() {
    const content = $('.reader-content', rootEl);
    if (!content) return;
    content.classList.toggle('scroll-mode', settings.mode === 'scroll');
    content.classList.toggle('tap-mode', settings.mode === 'tap');
  }

  function applyPageMode(mode) {
    const content = $('.reader-content', rootEl);
    if (!content) return;
    settings.mode = normalizeMode(mode);
    syncModeClass();
    const keepY = pageTops[pageIdx] || 0;      /* 切模式前停在第几页，尽量保持 */
    pageTops = [];
    paginateContent();
    if (isPaged()) showPage(0);
    else content.scrollTop = Math.min(keepY, Math.max(0, content.scrollHeight - content.clientHeight));
  }

  function setPageMode(mode) {
    applyPageMode(mode);
    if (cur) cur.settings = Object.assign({}, settings);
    globalSettings.mode = settings.mode;
    renderSettings();
    saveAll();
    LB.toast('翻页方式：' + MODES[settings.mode], 'info');
  }

  /* 跳到第 i 页（tap 用）。刻意不加 scroll-behavior:smooth ——
     动画途中的 scrollTop 会把"当前页码"读错，连点就乱（Step 21 实测踩过）。 */
  function showPage(i) {
    const view = $('.reader-content', rootEl);
    if (!view || !pageTops.length) return;
    pageIdx = Math.max(0, Math.min(pageTops.length - 1, i));
    view.scrollTop = Math.min(pageTops[pageIdx], Math.max(0, view.scrollHeight - view.clientHeight));
    syncProgress();
  }

  /* 按容器可视高度切页 */
  function paginateContent() {
    pageTops = [];
    if (!rootEl) return;
    const view = $('.reader-content', rootEl);
    if (!view) return;
    if (!isPaged() || !cur) return;
    const cs = getComputedStyle(view);
    const avail = Math.max(120, view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    const base = view.getBoundingClientRect().top - view.scrollTop;   /* 内容坐标 0 点 */
    const blocks = [];
    Array.prototype.forEach.call(view.children, el => {
      if (el.nodeType !== 1) return;
      const r = el.getBoundingClientRect();
      const top = r.top - base;
      blocks.push({ el: el, top: top, bottom: top + r.height + parseFloat(getComputedStyle(el).marginBottom || 0) });
    });
    pageTops = [0];
    let start = 0;
    blocks.forEach(b => {
      if (b.top > start && b.bottom - start > avail) { pageTops.push(b.top); start = b.top; }
      while (b.bottom - start > avail) { start += avail; pageTops.push(start); }
    });
    pageIdx = Math.min(pageIdx, pageTops.length - 1);
  }

  /* 当前页码以实际滚动位置为准（用户也可能用滚轮 / 进度条跳） */
  function pageIndexFromScroll() {
    const view = $('.reader-content', rootEl);
    const y = (view ? view.scrollTop : 0) + 8;
    let i = 0;
    for (let k = 0; k < pageTops.length; k++) if (pageTops[k] <= y) i = k;
    return i;
  }

  /* 点击翻页：dir=-1 上一页 / +1 下一页；越界则换章。返回 true 表示本次点击已被翻页消化 */
  function turnPage(dir) {
    if (!pageTops.length) return false;
    const base = pageIndexFromScroll();
    const next = base + dir;
    if (next < 0) {
      if (cur && chIdx > 0) { pendingPageEnd = true; prevChapter(); }
      else LB.toast('已经是第一章了', 'info');
      return true;
    }
    if (next >= pageTops.length) {
      if (cur && chIdx < cur.chapters.length - 1) nextChapter();
      else LB.toast('已经是最后一页了', 'info');
      return true;
    }
    showPage(next);
    saveProgress();
    return true;
  }

  function setSetting(k, v) {
    settings[k] = v;
    if (cur) { cur.settings = Object.assign({}, settings); }
    globalSettings = Object.assign({}, globalSettings);
    globalSettings[k] = v;
    renderSettings();
    applySettings();
    saveAll();
  }

  /* ================= 视图 ================= */

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>小说阅读器</h1><p>上传 TXT / EPUB 本地阅读，字体背景翻页可调，进度自动记忆</p></div>' +
      '</div>' +
      '<div class="tool-body">' +

      /* —— 书架态 —— */
      '<div id="rdUpload">' +
      '<div class="card">' +
      '<div class="dropzone rd-drop" id="rdDrop">' +
      '<div class="rd-dz-ic">📖</div>' +
      '<div>点击、拖入或 Ctrl+V 粘贴 TXT / EPUB 文件</div>' +
      '<small>TXT 自动按「第 X 章」切分章节目录；文件只在本机解析，不上传</small>' +
      '<input type="file" id="rdFile" accept=".txt,.epub,text/plain,application/epub+zip" hidden />' +
      '</div>' +
      '<div class="ac-status" id="rdStat"></div>' +
      '</div>' +
      '<div class="card tool-sec set-card" id="rdShelfWrap">' +
      '<span class="tool-lab">书架</span>' +
      '<div class="rd-shelf-grid" id="rdShelf"></div>' +
      '<div class="empty-state" id="rdShelfEmpty" hidden>' +
      '<div class="es-icon" aria-hidden="true">📚</div>' +
      '<p class="es-title">书架空空如也</p>' +
      '<button class="btn" id="rdEmptyUpload" type="button">上传第一本书</button>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* —— 阅读态（Step 22 · 修复 1/2 页内沉浸容器；Step 23 · 二 上下栏同步显隐） ——
         .reader-fullscreen-container = position:fixed 占满视口（z-index 300），
         顶部用 env(safe-area-inset-top) 给系统状态栏留出空间 → 摄像头不压正文；
         上下工具栏共用 .auto-hide（barsHidden 单一状态源），点屏幕中间一起切。
         设置面板与目录抽屉仍挂在容器内，共用一层 #reader-mask。 */
      '<div class="reader-fullscreen-container" id="rdRead" hidden>' +
      '<div class="reader-topbar" id="rdTop">' +
      '<div class="tb-group-left">' +
      '<button class="rd-ibtn" id="rdClose" type="button">← 书架</button>' +
      '<button class="rd-ibtn" id="reader-toc-btn" type="button">目录</button>' +
      '</div>' +
      '<div class="tb-title" id="rdTitle"></div>' +
      '<div class="tb-group-right">' +
      '<button class="rd-ibtn" id="rdImmersiveBtn" type="button">⛶ 沉浸</button>' +
      '<button class="rd-ibtn" id="reader-settings-btn" type="button">设置</button>' +
      '</div>' +
      '</div>' +
      '<div class="reader-content scroll-mode" id="rdView"></div>' +
      '<div class="rd-dim" id="rdDim" aria-hidden="true"></div>' +
      '<div class="reader-bottombar" id="rdBottom">' +
      '<div class="rd-meta">' +
      '<span id="rdChName"></span>' +
      '<span id="rdChIdx"></span>' +
      '</div>' +
      '<div class="rd-bar">' +
      '<button class="rd-ibtn" id="rdPrev" type="button">上一章</button>' +
      '<input class="rd-range" id="rdProg" type="range" min="0" max="100" value="0" aria-label="阅读进度" />' +
      '<span class="rd-pct" id="rdPct">0%</span>' +
      '<button class="rd-ibtn" id="rdNext" type="button">下一章</button>' +
      '</div>' +
      '</div>' +

      /* —— 共享遮罩：点任意处关闭当前面板 —— */
      '<div class="reader-mask" id="reader-mask"></div>' +

      /* —— 目录抽屉（左侧滑出） —— */
      '<aside class="reader-panel reader-panel-toc" id="rdTocSheet" aria-label="目录">' +
      '<div class="rd-sheet-hd"><b>目录</b><button class="rd-ibtn" data-reader-close type="button">×</button></div>' +
      '<div class="rd-toc" id="rdTocList"></div>' +
      '</aside>' +

      /* —— 设置面板（底部抽屉，右上角 × 关闭） —— */
      '<aside class="reader-panel reader-panel-settings" id="rdSetSheet" aria-label="阅读设置">' +
      '<div class="rd-sheet-hd"><b>阅读设置</b><button class="rd-ibtn" data-reader-close type="button">×</button></div>' +
      '<div class="rd-set">' +
      '<div class="rd-set-row"><span>字体</span><div class="hl-chips" id="rdFonts"></div></div>' +
      '<div class="rd-set-row"><span>字号</span>' +
      '<input class="rd-range" id="rdSize" type="range" min="14" max="26" step="1" value="18" aria-label="字号" />' +
      '<small id="rdSizeV">18px</small></div>' +
      '<div class="rd-set-row"><span>行距</span><div class="hl-chips" id="rdLines"></div></div>' +
      '<div class="rd-set-row"><span>背景</span><div class="hl-chips" id="rdThemes"></div></div>' +
      '<div class="rd-set-row"><span>翻页</span>' +
      '<div class="reader-page-mode-group hl-chips" id="rdModes"></div></div>' +
      '<div class="rd-set-row"><span>亮度</span>' +
      '<input class="rd-range" id="rdBright" type="range" min="50" max="100" step="5" value="100" aria-label="亮度" />' +
      '<small id="rdBrightV">100%</small></div>' +
      '</div>' +
      '</aside>' +

      '</div>' +   /* /#rdRead（沉浸容器到此为止） */

      /* —— 书架操作弹窗（Step 22 · 修复 5：居中卡片 + 独立遮罩，按钮不再重叠） —— */
      '<div class="book-action-mask reader-mask" id="rdActMask"></div>' +
      '<div class="book-action-sheet" id="rdActSheet" role="dialog" aria-modal="true" aria-label="书架操作">' +
      '<div class="book-action-hd"><b id="rdActList"></b>' +
      '<button class="rd-ibtn" data-reader-close type="button">×</button></div>' +
      '<button class="book-action-item" id="rdActOpen" type="button">▶ 继续阅读</button>' +
      '<button class="book-action-item" id="rdActRenameBtn" type="button">✏️ 重命名</button>' +
      '<div class="book-action-rename" id="rdActRename" hidden>' +
      '<input class="inp" id="rdActInput" type="text" maxlength="60" aria-label="书名" />' +
      '<button class="btn btn-sm" id="rdActRenameOk" type="button">确定</button>' +
      '</div>' +
      '<button class="book-action-item danger" id="rdActDel" type="button">🗑 删除</button>' +
      '</div>' +

      '<p class="cd-note">TXT 按「第 X 章 / 回 / 节 / 卷」这类独占一行的标题切分章节；没有章节标记的文件会按每 8000 字自动分节。' +
      'EPUB 按 spine 顺序逐章读取。阅读进度、字体、背景等设置保存在本机。</p>' +
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span>' +
      '<span class="disc-text">本工具为本地阅读器，需自行上传 TXT / EPUB 文件。不支持在线抓取网络小说（涉及版权）。</span></div>' +
      '</div>'
    );
  }

  function bindDrop() {
    const zone = $('#rdDrop', rootEl);
    const input = $('#rdFile', rootEl);
    zone.addEventListener('click', () => input.click());
    $('#rdEmptyUpload', rootEl).addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) openFile(f);
    });
    const onOver = e => { e.preventDefault(); zone.classList.add('drag'); };
    zone.addEventListener('dragover', onOver);
    zone.addEventListener('dragenter', onOver);
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });
  }

  /* Step 23 · 二：这里不再有"下滑只收顶栏"的 .rd-hide 逻辑 —— 那条路径正是
     "点中间只有底栏弹出"的根因（两套类各管一头）。工具栏显隐统一交给
     toggleReaderBars()：点屏幕中间 / 「⛶ 沉浸」按钮，上下栏一起切。 */
  function onViewScroll() {
    const view = $('.reader-content', rootEl);
    if (!view) return;
    /* 分页模式下页码以滚动位置为准（滚轮 / 进度条跳转也能对上页） */
    if (isPaged()) pageIdx = pageIndexFromScroll();
    syncProgress();
    saveProgress();
  }

  /* Step 23 · 一/二：内容区点击。
     tap 模式：左 1/3 → 上一页，右 1/3 → 下一页，中间 1/3 → 上下工具栏一起切；
     scroll 模式：整块区域点击都用来切工具栏。
     ★ 点中间用 toggleReaderBars()（单一状态源），不再有只作用于顶栏的分支。 */
  function onViewClick(e) {
    const view = $('.reader-content', rootEl);
    if (!view) return;
    /* 选中文字时不吃点击：用户可能在复制段落 */
    if (window.getSelection && String(window.getSelection())) return;
    if (isPaged()) {
      const r = view.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 1 / 3) { turnPage(-1); return; }
      if (x > 2 / 3) { turnPage(1); return; }
    }
    toggleReaderBars();
  }

  /* 阅读时长统计：每秒累计，随进度落盘 */
  let readTimer = null;

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    books = readBooks();
    globalSettings = Object.assign({}, DEF_SETTINGS, readGlobalSettings());
    settings = Object.assign({}, globalSettings);

    bindDrop();
    renderShelf();
    renderSettings();

    /* —— 书架：点击 / 长按出操作 —— */
    const shelf = $('#rdShelf', root);
    let pressTimer = null;
    shelf.addEventListener('click', e => {
      const book = e.target.closest('.book-item');
      if (!book) return;
      openBookActions(book.getAttribute('data-id'));
    });
    shelf.addEventListener('pointerdown', e => {
      const book = e.target.closest('.book-item');
      if (!book) return;
      pressTimer = setTimeout(() => { pressTimer = null; openBookActions(book.getAttribute('data-id')); }, 500);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      shelf.addEventListener(ev, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } })
    );

    /* —— 阅读工具栏 —— */
    $('#rdClose', root).addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); PanelManager.close(); backToShelf(); });
    $('#reader-toc-btn', root).addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      renderToc(); PanelManager.open('toc');
    });
    $('#reader-settings-btn', root).addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      renderSettings(); PanelManager.open('settings');
    });
    /* Step 21 · 修复 1：遮罩点击 + 所有 [data-reader-close] 按钮 → 关闭当前面板。
       用 data-reader-close 而不是 data-close，避开 ui/sheet.js 的捕获阶段拦截。
       #reader-mask（阅读态共享遮罩）与书架操作面板自带的 .reader-mask 同一套规则。 */
    $$('.reader-mask', root).forEach(m => m.addEventListener('click', () => PanelManager.close()));
    $$('[data-reader-close]', root).forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        PanelManager.close();
      });
    });
    /* 翻页模式按钮（chip 会被 renderSettings 重建，用面板上的委托绑定） */
    $('#rdSetSheet', root).addEventListener('click', e => {
      const btn = e.target.closest('[data-reader-page-mode]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      setPageMode(btn.getAttribute('data-reader-page-mode'));
    });
    /* 「⛶ 沉浸」与点屏幕中间走同一条路：上下工具栏一起切 */
    $('#rdImmersiveBtn', root).addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      toggleReaderBars();
    });
    $('#rdPrev', root).addEventListener('click', prevChapter);
    $('#rdNext', root).addEventListener('click', nextChapter);
    const view = $('.reader-content', root);
    view.addEventListener('click', onViewClick);
    view.addEventListener('scroll', onViewScroll, { passive: true });
    $('#rdProg', root).addEventListener('input', e => {
      const v = $('.reader-content', root);
      const pct = +e.target.value / 100;
      if (isPaged()) {
        showPage(Math.round(pct * Math.max(0, pageCount() - 1)));
      } else {
        v.scrollTop = (v.scrollHeight - v.clientHeight) * pct;
        if (isPaged()) pageIdx = pageIndexFromScroll();
        syncProgress();
      }
    });
    $('#rdProg', root).addEventListener('change', saveProgress);

    /* —— 目录点击 —— */
    $('#rdTocList', root).addEventListener('click', e => {
      const b = e.target.closest('[data-ch]');
      if (!b) return;
      closeSheets();
      gotoChapter(+b.getAttribute('data-ch'));
    });

    /* —— 设置 —— */
    $('#rdSetSheet', root).addEventListener('click', e => {
      /* attr 是 data-* 属性名，key 是 settings 里的字段名（两者不同名，别混用） */
      const pick = (attr, key, cast) => {
        const b = e.target.closest('[' + attr + ']');
        if (!b) return false;
        const v = b.getAttribute(attr);
        setSetting(key, cast ? cast(v) : v);
        return true;
      };
      if (pick('data-font', 'font')) return;
      if (pick('data-line', 'line', Number)) return;
      if (pick('data-theme', 'theme')) return;
    });
    $('#rdSize', root).addEventListener('input', e => {
      settings.size = +e.target.value;
      $('#rdSizeV', root).textContent = settings.size + 'px';
      if (cur) cur.settings = Object.assign({}, settings);
      applySettings();
      debounceSave();
    });
    $('#rdBright', root).addEventListener('input', e => {
      settings.bright = +e.target.value;
      $('#rdBrightV', root).textContent = settings.bright + '%';
      if (cur) cur.settings = Object.assign({}, settings);
      applySettings();
      debounceSave();
    });

    /* —— 阅读时长 —— */
    readTimer = setInterval(() => { if (cur && alive && !document.hidden) readSecAcc++; }, 1000);

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    window.addEventListener('resize', onResize);
    /* 转屏 / 键盘弹出都会改变容器可视高度 → 页边界要重算（resize 在部分 WebView 里不发） */
    window.addEventListener('orientationchange', onResize);
  }

  const onResize = LB.dom.debounce(() => { if (cur) rePaginate(); }, 200);

  /* 容器高度变了（转屏 / 窗口缩放）→ 重新切页并把页码对回原位置 */
  function rePaginate() {
    if (!cur || !isPaged()) return;
    const keep = pageIndexFromScroll();
    paginateContent();
    showPage(Math.min(keep, Math.max(0, pageCount() - 1)));
    syncProgress();
  }

  function unmount() {
    alive = false;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    PanelManager.close();
    if (readTimer) { clearInterval(readTimer); readTimer = null; }
    if (cur) {
      const view = rootEl && $('.reader-content', rootEl);
      cur.progress = {
        chapter: chIdx,
        scroll: view ? view.scrollTop : 0,
        page: (cur.progress && cur.progress.page) || 0,
        percent: (cur.progress && cur.progress.percent) || 0
      };
      cur.lastReadAt = Date.now();
      if (readSecAcc > 0) { cur.readSec = (cur.readSec || 0) + readSecAcc; readSecAcc = 0; }
    }
    setBarsHidden(false);
    saveAll();
    books = [];
    cur = null;
    pageTops = [];
    pageIdx = 0;
    rootEl = null;
  }

  LB.router.register('reader', { mount, unmount });
})();
