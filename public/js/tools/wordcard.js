/* LiteBox v5 · tools/wordcard.js — 背单词（翻牌卡片 + 生词本 + 进度本机保存 + 导出 CSV）
 *
 * 【翻牌为什么用 CSS 3D 而不是两张 div 切换】
 *   任务书给的是 perspective + rotateY 的标准 3D 翻牌。
 *   关键点：背面必须加 backface-visibility:hidden，
 *   否则翻到 180° 时背面和正面会同时可见（正面是反的、背面是正的，叠在一起糊成一片）。
 *
 * 【进度存储的坑：已知词要「按日期分桶」】
 *   任务书的存储结构是 known / unknown / lastIndex / date。
 *   但如果known 是一个只增不减的数组，学完一轮后第二轮就没有新词可背了。
 *   所以这里把 known 存成 { '2026-10-04': ['abandon', ...] }按天分桶：
 *   今天认识的词今天不再出现，明天再复习。lastIndex 也按天存。
 *
 * 【Step 12 · B5：多词库】
 *   新增 六级 / 考研 / 雅思 三个词库，**每个词库的进度独立保存** ——
 *   存储键从固定的 litebox_wordcard 改为 litebox_wordcard_<libKey>，
 *   切换词库就是换一个键，互不干扰。
 *   旧的 litebox_wordcard（只有四级）在首次进入时自动迁移到四级那一份。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const KEY_BASE = 'litebox_wordcard_';   /* 实际键 = KEY_BASE + libKey */
  const KEY_OLD = 'litebox_wordcard';     /* Step 12 之前的单库键，用于一次性迁移 */
  const SEED_CSV = 'litebox_csv_seed';

  let rootEl = null;
  let list = [];            /* 当前词库数组 [{w,p,m,e,s}] */
  let libKey = 'wordsCET4';
  let flipped = false;
  let cursor = 0;           /* 当前词在「今日队列」里的下标 */
  let queue = [];           /* 今日待背的词对象数组 */

  /* 词库清单：k 是 LB.dict 的挂载名（core/dict.js 的 FILE 表负责映射到文件名） */
  const LIBS = [
    { k: 'wordsCET4', name: '四级 CET-4' },
    { k: 'wordsCET6', name: '六级 CET-6' },
    { k: 'wordsKY', name: '考研核心' },
    { k: 'wordsIELTS', name: '雅思 IELTS' }
  ];

  function stateKey() { return KEY_BASE + libKey; }

  /* 一次性迁移：老版本只有四级，把老键搬到四级那一份里 */
  function migrateOldState() {
    const old = LB.storage.get(KEY_OLD, null);
    if (old && typeof old === 'object' && old.known && !LB.storage.get(KEY_BASE + 'wordsCET4', null)) {
      LB.storage.set(KEY_BASE + 'wordsCET4', old);
    }
    if (old) LB.storage.remove(KEY_OLD);
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function loadState() {
    const s = LB.storage.get(stateKey(), null);
    if (s && typeof s === 'object' && s.known) return s;
    return { known: {}, unknown: [], idx: {}, done: {} };
  }
  function saveState(s) { LB.storage.set(stateKey(), s); }

  /* 今日认识的词（当天不再出现） */
  function knownToday(s) { return s.known[today()] || []; }

  /* 生词本 = 明确标记「不认识」的词，按首次加入时间倒序（新的在前） */
  function unknownList(s) { return Array.isArray(s.unknown) ? s.unknown : []; }

  function buildQueue() {
    const s = loadState();
    const known = knownToday(s);
    const idx = s.idx && typeof s.idx[today()] === 'number' ? s.idx[today()] : 0;
    /* 未背过的词优先；已背过的（昨天及以前）排在后面做复习 */
    const fresh = [], review = [];
    for (let i = 0; i < list.length; i++) {
      if (known.indexOf(list[i].w) >= 0) review.push(i);
      else fresh.push(i);
    }
    /* 起始位置取今天已背到第几个（刷新后从断点继续） */
    const ordered = fresh.concat(review);
    const start = idx > 0 && idx < ordered.length ? idx : 0;
    queue = ordered.map(i => list[i]);
    cursor = start < queue.length ? start : 0;
  }

  function doneCount() {
    const s = loadState();
    return (s.done && typeof s.done[today()] === 'number') ? s.done[today()] : 0;
  }

  function renderProgress() {
    const total = list.length;
    const done = doneCount();
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    $('#wcFill', rootEl).style.width = pct + '%';
    $('#wcProgTxt', rootEl).textContent = '今日已背 ' + done + ' / ' + total + ' 词 · ' + pct + '%';
  }

  function renderCard() {
    if (!queue.length) {
      $('#wcEmpty', rootEl).hidden = false;
      $('#wcCard', rootEl).hidden = true;
      $('#wcBtns', rootEl).hidden = true;
      return;
    }
    $('#wcEmpty', rootEl).hidden = true;
    $('#wcCard', rootEl).hidden = false;
    $('#wcBtns', rootEl).hidden = false;

    const it = queue[cursor];
    if (!it) return;
    const n = cursor + 1;
    $('#wcNum', rootEl).textContent = n + ' / ' + queue.length;
    $('#wcWord', rootEl).textContent = it.w;
    $('#wcPhon', rootEl).textContent = it.p || '';
    $('#wcMeaning', rootEl).textContent = it.m || '';
    /* 例句是可选的：缺例句时留空并整行隐藏，不能把 undefined 渲染到页面上 */
    const ex = $('#wcExample', rootEl);
    ex.textContent = it.e || '';
    ex.hidden = !it.e;
    setFlipped(false);
  }

  function setFlipped(v) {
    flipped = v;
    $('#wcFlip', rootEl).classList.toggle('flipped', v);
    $('#wcHint', rootEl).textContent = v ? '点击卡片翻回正面' : '点击卡片看释义';
  }

  function nextCard() {
    cursor++;
    if (cursor >= queue.length) cursor = 0;   /* 背完一轮回到第一个，进入复习循环 */
    const s = loadState();
    s.idx = s.idx || {};
    s.idx[today()] = cursor;
    saveState(s);
    renderCard();
  }

  function markUnknown() {
    if (!queue[cursor]) return;
    const w = queue[cursor].w;
    const s = loadState();
    if (unknownList(s).indexOf(w) < 0) { s.unknown.push(w); LB.toast('已加入生词本：' + w, 'info'); }
    else LB.toast(w + ' 已在生词本中', 'info');
    saveState(s);
    renderWordbook();
    nextCard();
  }

  function markKnown() {
    if (!queue[cursor]) return;
    const w = queue[cursor].w;
    const s = loadState();
    s.known = s.known || {};
    const k = knownToday(s);
    if (k.indexOf(w) < 0) k.push(w);
    s.known[today()] = k;
    /* 认识了就从生词本移出（不再算未掌握） */
    s.unknown = unknownList(s).filter(x => x !== w);
    s.done = s.done || {};
    s.done[today()] = doneCount() + 1;
    saveState(s);
    renderProgress();
    renderWordbook();
    nextCard();
  }

  function skip() { nextCard(); }

  /* 生词本渲染：把单词反查回词库拿释义，查不到就只显示单词 */
  function renderWordbook() {
    const s = loadState();
    const box = $('#wcBook', rootEl);
    const items = unknownList(s);
    if (!items.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '🃏',
        title: '生词本还是空的',
        sub: '背卡片时点「不认识」，生词自动收进来'
      });
      $('#wcExport', rootEl).disabled = true;
      return;
    }
    const map = {};
    list.forEach(x => { map[x.w] = x; });
    box.innerHTML = items.map(w => {
      const it = map[w];
      return '<div class="wc-item"><b>' + LB.dom.esc(w) + '</b>' +
        (it ? '<span>' + LB.dom.esc(it.m) + '</span>' : '') +
        '<button class="wc-rm" type="button" data-w="' + LB.dom.esc(w) + '" aria-label="从生词本移除">×</button></div>';
    }).join('');
    $('#wcExport', rootEl).disabled = false;
  }

  function removeUnknown(w) {
    const s = loadState();
    s.unknown = unknownList(s).filter(x => x !== w);
    saveState(s);
    renderWordbook();
  }

  /* 导出 CSV → 用链路种子送给 csvtab（与 links.js 的种子协议同构：
     写种子 → 跳转 → csvtab 读出回填并清种子）。
     必须同步写，不能 await —— 用户手势会过期。 */
  function exportCsv() {
    const s = loadState();
    const items = unknownList(s);
    if (!items.length) { LB.toast('生词本是空的，没什么可导出', 'info'); return; }
    const map = {};
    list.forEach(x => { map[x.w] = x; });
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = ['单词,音标,释义,例句'];
    items.forEach(w => {
      const it = map[w] || { w: w, p: '', m: '', e: '' };
      rows.push([it.w, it.p, it.m, it.e].map(q).join(','));
    });
    LB.storage.set(SEED_CSV, rows.join('\n'));
    LB.hash.go('csvtab');
  }

  /* Step 12 · B5：切换词库 = 换一套独立进度 + 重新加载字典。
     加载期间先清空当前卡片，避免旧词库的卡片和新词库的进度对不上。 */
  function loadLib(k) {
    if (!LIBS.some(x => x.k === k)) return;
    libKey = k;
    cursor = 0; flipped = false; queue = []; list = [];

    const empty = $('#wcEmpty', rootEl);
    if (empty) { empty.hidden = false; empty.textContent = '词库加载中…'; }
    if ($('#wcCard', rootEl)) $('#wcCard', rootEl).hidden = true;
    if ($('#wcBtns', rootEl)) $('#wcBtns', rootEl).hidden = true;
    if ($('#wcNum', rootEl)) $('#wcNum', rootEl).textContent = '';
    renderProgress();
    renderWordbook();

    LB.dict.load(k)
      .then(d => {
        /* 词库是异步加载的，用户可能已经切走页面或又换了词库 —— 直接放弃这次渲染 */
        if (!rootEl || libKey !== k) return;
        list = Array.isArray(d) ? d : [];
        if (!list.length) {
          if (empty) { empty.hidden = false; empty.textContent = '词库为空。'; }
          LB.toast('词库加载失败', 'err');
          return;
        }
        if (empty) empty.hidden = true;
        buildQueue();
        renderCard();
        renderProgress();
        renderWordbook();
      })
      .catch(e => {
        if (!rootEl || libKey !== k) return;
        if (empty) { empty.hidden = false; empty.textContent = '词库加载失败。'; }
        /* ★ 把原始错误带出来。之前这里只写「词库加载失败」，结果渲染层的 TypeError
           （比如模板缺 id）也被当成加载失败报，排查时完全被误导。 */
        LB.toast('词库加载失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      });
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>背单词</h1><p>四级 / 六级 / 考研 / 雅思词库卡片记忆，翻牌看释义，生词本本机保存</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="wc-top">' +
      '<select class="inp" id="wcLib" aria-label="词库选择">' +
      LIBS.map(x => '<option value="' + x.k + '"' + (x.k === libKey ? ' selected' : '') + '>' + x.name + '</option>').join('') +
      '</select>' +
      '<div class="wc-prog">' +
      '<div class="wc-prog-bar"><div class="wc-prog-fill" id="wcFill"></div></div>' +
      '<div class="wc-prog-txt" id="wcProgTxt"></div>' +
      '</div>' +
      '</div>' +
      '<p class="jst" id="wcNum"></p>' +
      '<p class="wc-empty" id="wcEmpty" hidden>词库为空或加载失败。</p>' +
      /* ★ wcCard 这个 id 必须存在：renderCard() 用它统一控制「卡片区+按钮区」的显隐。
         之前模板里漏了它，$('#wcCard') 返回 null，赋 .hidden 直接抛 TypeError，
         结果整条 .then 链被 .catch 当成「词库加载失败」吞掉，卡片永远空白。 */
      '<div id="wcCard">' +
      '<div class="wordcard-flip" id="wcFlip" role="button" tabindex="0" aria-label="点击翻转卡片">' +
      '<div class="wordcard-inner">' +
      '<div class="wordcard-face wordcard-front">' +
      '<div><div class="wc-w" id="wcWord"></div><div class="wc-p" id="wcPhon"></div></div>' +
      '<span class="wc-hint" id="wcHint"></span>' +
      '</div>' +
      '<div class="wordcard-face wordcard-back">' +
      '<div><div class="wc-m" id="wcMeaning"></div><div class="wc-ex" id="wcExample"></div></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="wc-btns" id="wcBtns">' +
      '<button class="btn btn-ghost" id="wcNo" type="button">❓ 不认识</button>' +
      '<button class="btn btn-main js-primary-submit" id="wcYes" type="button">🟢 认识</button>' +
      '<button class="btn btn-ghost" id="wcSkip" type="button">⏭ 跳过</button>' +
      '</div>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">生词本</span>' +
      '<div class="wc-list" id="wcBook"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="wcExport" type="button">⬇ 导出 CSV（送入表格工具）</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">进度保存在本设备浏览器：当天认识的词当天不再出现，次日自动进入复习队列；' +
      '生词本可一键导出为 CSV 并直接送入表格工具继续加工。词库内容仅供学习参考。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    list = []; cursor = 0; flipped = false; queue = [];

    $('#wcFlip', root).addEventListener('click', () => setFlipped(!flipped));
    $('#wcFlip', root).addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(!flipped); }
    });
    $('#wcYes', root).addEventListener('click', markKnown);
    $('#wcNo', root).addEventListener('click', markUnknown);
    $('#wcSkip', root).addEventListener('click', skip);
    $('#wcExport', root).addEventListener('click', exportCsv);
    $('#wcLib', root).addEventListener('change', e => loadLib(e.target.value));
    $('#wcBook', root).addEventListener('click', e => {
      const b = e.target.closest('.wc-rm');
      if (b) removeUnknown(b.dataset.w);
    });
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });

    migrateOldState();
    loadLib(libKey);
  }

  function unmount() {
    list = []; queue = []; cursor = 0; flipped = false;
    rootEl = null;
  }

  LB.router.register('wordcard', { mount, unmount });
})();
