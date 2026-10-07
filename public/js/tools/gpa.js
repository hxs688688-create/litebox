/* LiteBox v5 · tools/gpa.js — GPA 计算器（百分制 / 等级制，多种换算算法，tbody 事件委托）
   Step 6B-2：新增「换算算法」四选一（4.0 标准 / 加权平均 / 北大算法 / 5.0 制）
                与「从剪贴板解析课表」，算法偏好存 litebox_gpa_algo */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const KEY = 'litebox_gpa';
  const ALGO_KEY = 'litebox_gpa_algo';
  let rootEl = null;
  let state = { mode: 'score', rows: [], algo: 'standard' }; /* rows: { n, c, g } */

  const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
  const GRADE_GP = { 'A+': 4.0, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D': 1.0, 'F': 0 };
  /* 5.0 制等级映射（百分制五档） */
  const SCORE5 = [
    [95, 5.0], [90, 4.5], [85, 4.0], [80, 3.5], [75, 3.0], [70, 2.5], [65, 2.0], [60, 1.5], [0, 0]
  ];

  const ALGOS = [
    { v: 'standard', n: '4.0 标准' },
    { v: 'weighted', n: '加权平均' },
    { v: 'pku', n: '北大算法' },
    { v: 'five', n: '5.0 制' }
  ];

  /* 百分制 → 4.0 绩点（标准分段） */
  function gp4(score) {
    if (score >= 90) return 4.0;
    if (score >= 85) return 3.7;
    if (score >= 82) return 3.3;
    if (score >= 78) return 3.0;
    if (score >= 75) return 2.7;
    if (score >= 72) return 2.3;
    if (score >= 68) return 2.0;
    if (score >= 64) return 1.5;
    if (score >= 60) return 1.0;
    return 0;
  }

  /* 百分制 → 5.0 制绩点 */
  function gp5(score) {
    for (const [min, v] of SCORE5) if (score >= min) return v;
    return 0;
  }

  /* 北大算法：(分数 - 50) / 10，3 位小数，60 分→1.0，85 分→3.5，低于 60 记 0。
     注：任务书对照表里「北大算法」列与「4.0 标准」列数值完全相同（疑为笔误），
     若照抄则「切到北大算法 GPA 数值变化」验收必然不成立，故按通行定义实现。 */
  function gpPku(score) {
    if (score < 60) return 0;
    return Math.round((score - 50) / 10 * 1000) / 1000;
  }

  /* 当前算法下的百分制 → 绩点 */
  function gpOf(score) {
    if (state.algo === 'five') return gp5(score);
    if (state.algo === 'pku') return gpPku(score);
    return gp4(score); /* standard 与 weighted 都用 4.0 分段 */
  }

  /* 等级制：5.0 制把 A+→5.0、A→4.7、A-→4.3… 其余沿用 4.0 映射 */
  const GRADE5 = { 'A+': 5.0, 'A': 4.7, 'A-': 4.3, 'B+': 3.7, 'B': 3.3, 'B-': 3.0, 'C+': 2.7, 'C': 2.3, 'C-': 2.0, 'D': 1.0, 'F': 0 };
  const GRADE_PKU = { 'A+': 4.0, 'A': 4.0, 'A-': 3.8, 'B+': 3.5, 'B': 3.2, 'B-': 3.0, 'C+': 2.5, 'C': 2.2, 'C-': 2.0, 'D': 1.3, 'F': 0 };

  function gradeGp(name) {
    if (state.algo === 'five') return GRADE5[name];
    if (state.algo === 'pku') return GRADE_PKU[name];
    return GRADE_GP[name];
  }

  /* 行是否有效：学分 > 0 且成绩有效 */
  function validRow(r) {
    const c = parseFloat(r.c);
    if (!(c > 0)) return null;
    if (state.mode === 'score') {
      const g = parseFloat(r.g);
      if (isNaN(g) || g < 0 || g > 100) return null;
      return { c, g, gp: gpOf(g) };
    }
    const gp = gradeGp(r.g);
    return gp === undefined ? null : { c, g: null, gp };
  }

  /* 展示标签：加权平均模式主数字是平均分而非绩点 */
  function algoLabel() {
    if (state.algo === 'weighted') return '加权平均分';
    if (state.algo === 'five') return 'GPA（5.0 制）';
    if (state.algo === 'pku') return 'GPA（北大算法）';
    return 'GPA（4.0 制）';
  }

  function updateStats() {
    const valid = state.rows.map(validRow).filter(Boolean);
    const sumC = valid.reduce((s, v) => s + v.c, 0);
    const gpa = sumC > 0 ? valid.reduce((s, v) => s + v.c * v.gp, 0) / sumC : 0;
    const avg = sumC > 0 ? valid.reduce((s, v) => s + v.c * v.g, 0) / sumC : null;

    /* 加权平均模式：主数字直接显示加权平均分（按任务书要求） */
    const main = state.algo === 'weighted' ? (avg === null ? '0.00' : avg.toFixed(2)) : gpa.toFixed(2);
    const gpaEl = $('#gpGpa', rootEl);
    if (gpaEl.textContent !== main) {
      gpaEl.textContent = main;
      LB.replay(gpaEl, 'lb-pop');   /* Step 10：绩点数字变化时回弹 */
    }
    $('#gpGpaLab', rootEl).textContent = algoLabel();
    /* 平均分：加权平均模式下主数字已是平均分，此处置 — 避免重复 */
    $('#gpAvg', rootEl).textContent = (state.mode === 'score' && state.algo !== 'weighted' && avg !== null)
      ? avg.toFixed(2)
      : '—';
    $('#gpSum', rootEl).textContent = sumC ? String(+sumC.toFixed(2)) : '0';
  }

  function save() { LB.storage.set(KEY, { mode: state.mode, rows: state.rows }); }

  /* 仅增删行 / 切模式 / 示例 / 清空时重绘；输入时只更新统计，避免丢焦点 */
  function render() {
    const isScore = state.mode === 'score';
    const body = $('#gpBody', rootEl);
    if (!state.rows.length) {
      /* Step 8：空状态。#gpBody 是 tbody，不能直接放 .empty-state 的 div，
         用 colspan 行包一层保证 HTML 合法；CTA 复用「添加一门课程」按钮。 */
      body.innerHTML =
        '<tr><td colspan="4">' +
        '<div class="empty-state">' +
        '<div class="es-icon" aria-hidden="true">🎓</div>' +
        '<p class="es-title">还没有课程</p>' +
        '<p class="es-sub">手动添加一门，或从剪贴板解析课表</p>' +
        '<button class="btn btn-main es-cta" type="button">添加一门课程</button>' +
        '</div>' +
        '</td></tr>';
      body.querySelector('.es-cta').addEventListener('click', () => {
        const btn = $('#gpAdd', rootEl);
        if (btn) btn.click();
      });
      updateStats();
      save();
      return;
    }
    body.innerHTML = state.rows.map((r, i) => {
      const gCell = isScore
        ? '<input class="inp gp-num" data-i="' + i + '" data-k="g" type="number" min="0" max="100" step="0.5" placeholder="0-100" value="' + esc(r.g) + '" />'
        : '<select class="inp gp-num" data-i="' + i + '" data-k="g"><option value="">未选</option>' +
          GRADES.map(g => '<option' + (r.g === g ? ' selected' : '') + '>' + g + '</option>').join('') +
          '</select>';
      return '<tr>' +
        '<td><input class="inp" data-i="' + i + '" data-k="n" type="text" placeholder="选填" value="' + esc(r.n) + '" /></td>' +
        '<td><input class="inp gp-num" data-i="' + i + '" data-k="c" type="number" min="0" step="0.5" placeholder="学分" value="' + esc(r.c) + '" /></td>' +
        '<td>' + gCell + '</td>' +
        '<td><button class="gp-del" data-del="' + i + '" type="button" aria-label="删除">×</button></td>' +
        '</tr>';
    }).join('');
    updateStats();
    save();
  }

  function load() {
    const saved = LB.storage.get(KEY, null);
    state.rows = saved && Array.isArray(saved.rows)
      ? saved.rows
      : [{ n: '', c: '', g: '' }, { n: '', c: '', g: '' }, { n: '', c: '', g: '' }];
    state.mode = saved && saved.mode === 'grade' ? 'grade' : 'score';
    const a = LB.storage.get(ALGO_KEY, 'standard');
    state.algo = ALGOS.some(x => x.v === a) ? a : 'standard';
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    state.rows.forEach(r => { r.g = ''; }); /* 两种模式成绩互不兼容，切换即清空 */
    $$('#gpSeg .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    render();
    LB.toast(mode === 'grade' ? '已切换为等级制，成绩已清空' : '已切换为百分制，成绩已清空', 'info');
  }

  function setAlgo(algo) {
    if (state.algo === algo) return;
    state.algo = algo;
    LB.storage.set(ALGO_KEY, algo);
    $$('#gpaAlgo .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === algo));
    $('#gpNote', rootEl).innerHTML = algoNote();
    updateStats();
    LB.toast('已切换为「' + (ALGOS.find(a => a.v === algo) || {}).n + '」', 'info');
  }

  function algoNote() {
    if (state.algo === 'five') {
      return '5.0 制换算：≥95→5.0 · ≥90→4.5 · ≥85→4.0 · ≥80→3.5 · ≥75→3.0 · ≥70→2.5 · ≥65→2.0 · ≥60→1.5 · &lt;60→0；' +
        '等级制 A+→5.0 · A→4.7 · A-→4.3 · B+→3.7 · B→3.3 · B-→3.0 · C+→2.7 · C→2.3 · C-→2.0 · D→1.0 · F→0。';
    }
    if (state.algo === 'pku') {
      return '北大算法：绩点 =（分数 − 50）÷ 10，60 分→1.0、70 分→2.0、85 分→3.5、90 分→4.0、100 分→5.0，低于 60 分记 0；' +
        '等级制 A+→4.0 · A→4.0 · A-→3.8 · B+→3.5 · B→3.2 · B-→3.0 · C+→2.5 · C→2.2 · C-→2.0 · D→1.3 · F→0。';
    }
    if (state.algo === 'weighted') {
      return '加权平均：主数字直接显示学分加权平均分（不再换算绩点），适用于国内高校「平均学分绩点」未统一为 4.0 的情况。';
    }
    return '4.0 换算：≥90→4.0 · ≥85→3.7 · ≥82→3.3 · ≥78→3.0 · ≥75→2.7 · ≥72→2.3 · ≥68→2.0 · ≥64→1.5 · ≥60→1.0 · &lt;60→0；' +
      '等级制 A+/A→4.0 · A-→3.7 · B+→3.3 · B→3.0 · B-→2.7 · C+→2.3 · C→2.0 · C-→1.7 · D→1.0 · F→0。';
  }

  function sample() {
    state.rows = [
      { n: '大学英语', c: '2', g: '82' },
      { n: '体育', c: '1', g: '88' },
      { n: '艺术鉴赏', c: '1', g: '91' },
      { n: '专业核心课', c: '5', g: '76' }
    ];
    render();
  }

  function clearAll() {
    state.rows = [{ n: '', c: '', g: '' }, { n: '', c: '', g: '' }, { n: '', c: '', g: '' }];
    render();
  }

  /* ---------- 从剪贴板解析课表 ---------- */
  /* 每行形如「课程名 学分 成绩」，允许多空格 / 制表符；正则来自任务书 */
  const LINE_RE = /(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/;

  function parseText(text) {
    const lines = String(text || '').split(/\r\n|\r|\n/);
    const okRows = [];
    let skip = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { continue; }
      if (state.mode === 'grade') {
        /* 等级制：课程名 + 学分 + 等级（A/B/C…） */
        const m = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([ABCDF][+-]?)$/i);
        if (!m) { skip++; continue; }
        const g = m[3].toUpperCase();
        if (GRADE_GP[g] === undefined) { skip++; continue; }
        okRows.push({ n: m[1].trim(), c: m[2], g: g });
      } else {
        const m = line.match(LINE_RE);
        if (!m) { skip++; continue; }
        const c = parseFloat(m[2]);
        const g = parseFloat(m[3]);
        if (!(c > 0) || g < 0 || g > 100) { skip++; continue; }
        okRows.push({ n: m[1].trim(), c: m[2], g: m[3] });
      }
    }
    return { rows: okRows, skip: skip };
  }

  function applyParsed(text) {
    const r = parseText(text);
    if (!r.rows.length) {
      LB.toast('没能从剪贴板里认出课程，每行请写成「课程名 学分 成绩」', 'warn');
      return;
    }
    state.rows = state.rows.concat(r.rows);
    render();
    LB.toast('成功解析 ' + r.rows.length + ' 条，跳过 ' + r.skip + ' 条', 'ok');
  }

  /* 剪贴板读取：优先 navigator.clipboard.readText()，失败降级为手动粘贴框 */
  async function fromClipboard() {
    const btn = $('#gpaParse', rootEl);
    btn.disabled = true;
    try {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch (_) {
        text = '';
      }
      if (text && text.trim()) {
        applyParsed(text);
        return;
      }
      openManual();
    } catch (_) {
      openManual();
    } finally {
      btn.disabled = false;
    }
  }

  function openManual() {
    const box = $('#gpaPasteBox', rootEl);
    if (box) { box.hidden = false; $('#gpaPaste', rootEl).value = ''; $('#gpaPaste', rootEl).focus(); return; }
    LB.toast('请允许浏览器读取剪贴板，或改用下方手动粘贴', 'info');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>GPA 计算器</h1><p>加权平均分与绩点一键换算，支持 4 种算法，数据本地留存</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="gpSeg">' +
      '<button class="seg-btn on" data-v="score" type="button">百分制</button>' +
      '<button class="seg-btn" data-v="grade" type="button">等级制 (A-F)</button>' +
      '</div>' +
      '<div class="gp-algo-wrap">' +
      '<span class="gp-algo-lab">换算算法</span>' +
      '<div class="seg seg-4" id="gpaAlgo">' +
      ALGOS.map(a => '<button class="seg-btn" data-v="' + a.v + '" type="button">' + a.n + '</button>').join('') +
      '</div>' +
      '</div>' +
      '<div class="gp-cols">' +
      '<div class="gp-table-wrap">' +
      '<table class="gp-table"><thead><tr><th>课程名</th><th>学分</th><th>成绩</th><th></th></tr></thead>' +
      '<tbody id="gpBody"></tbody></table>' +
      '<button class="btn btn-ghost btn-sm" id="gpAdd" type="button">＋ 添加一门课程</button>' +
      '<button class="btn btn-ghost btn-sm" id="gpaParse" type="button">📋 从剪贴板解析课表</button>' +
      '<div class="gp-paste" id="gpaPasteBox" hidden>' +
      '<textarea class="inp" id="gpaPaste" rows="4" placeholder="每行一条，例如：&#10;高等数学 5 88&#10;大学英语 3 82"></textarea>' +
      '<div class="gp-paste-ops">' +
      '<button class="btn btn-main btn-sm" id="gpaPasteOk" type="button">解析并追加</button>' +
      '<button class="btn btn-ghost btn-sm" id="gpaPasteNo" type="button">取消</button>' +
      '</div>' +
      '<p class="gp-paste-tip">每行格式「课程名 学分 成绩」，例如「高等数学 5 88」。允许多余空格与制表符。</p>' +
      '</div>' +
      '</div>' +
      '<div class="gp-panel">' +
      '<div class="gp-big"><span class="gp-big-num" id="gpGpa">0.00</span><span class="gp-big-lab" id="gpGpaLab">GPA（4.0 制）</span></div>' +
      '<div class="gp-mini"><span>加权平均分</span><b id="gpAvg">—</b></div>' +
      '<div class="gp-mini"><span>总学分</span><b id="gpSum">0</b></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost btn-sm js-primary-submit" id="gpSample" type="button">示例数据</button>' +
      '<button class="btn btn-ghost btn-sm" id="gpClear" type="button">清空</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<p class="gp-note" id="gpNote"></p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    load();
    $$('#gpSeg .seg-btn', root).forEach(b => b.classList.toggle('on', b.dataset.v === state.mode));
    $$('#gpaAlgo .seg-btn', root).forEach(b => b.classList.toggle('on', b.dataset.v === state.algo));
    $('#gpNote', root).innerHTML = algoNote();
    render();

    $('#gpSeg', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setMode(b.dataset.v);
    });
    $('#gpaAlgo', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setAlgo(b.dataset.v);
    });
    /* 事件委托：输入只更新统计不重绘（保焦点） */
    $('#gpBody', root).addEventListener('input', e => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      state.rows[+el.dataset.i][el.dataset.k] = el.value;
      updateStats();
      save();
    });
    $('#gpBody', root).addEventListener('change', e => {
      const el = e.target.closest('select[data-i]');
      if (!el) return; /* select 由 change 触发；input 事件兜底上面已处理 */
      state.rows[+el.dataset.i][el.dataset.k] = el.value;
      updateStats();
      save();
    });
    $('#gpAdd', root).addEventListener('click', () => { state.rows.push({ n: '', c: '', g: '' }); render(); });
    $('#gpBody', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      state.rows.splice(+del.dataset.del, 1);
      if (!state.rows.length) state.rows.push({ n: '', c: '', g: '' });
      render();
    });
    $('#gpSample', root).addEventListener('click', sample);
    $('#gpClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));
    $('#gpaParse', root).addEventListener('click', fromClipboard);
    $('#gpaPasteOk', root).addEventListener('click', () => {
      const t = $('#gpaPaste', root).value;
      if (!t.trim()) { LB.toast('请先粘贴课表文本', 'info'); return; }
      applyParsed(t);
      $('#gpaPasteBox', root).hidden = true;
    });
    $('#gpaPasteNo', root).addEventListener('click', () => { $('#gpaPasteBox', root).hidden = true; });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('gpa', { mount, unmount });
})();
