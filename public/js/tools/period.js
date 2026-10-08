/* LiteBox v5 · tools/period.js — 经期记录（Step 17 深度重构）
   纯记录与日期估算：月历视图（经期/排卵日/易孕期/安全期）、周期分析、历史记录。
   纯前端无法做系统级推送，故不含任何"提醒"能力，数据仅本机保存。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const KEY = 'litebox_period';
  const LEGACY_HIST_KEY = 'litebox_period_history';
  const LEGACY_REMIND_KEY = 'litebox_period_reminded_at';

  const LUTEAL = 14;      /* 黄体期固定 14 天 */
  const MAX_RECORDS = 24; /* 历史最多 24 次 */

  const DOW = ['日', '一', '二', '三', '四', '五', '六'];

  let rootEl = null;
  /* 新格式：{ records: [{ id, start, days }], settings: { defaultCycle, defaultDays } } */
  let data = { records: [], settings: { defaultCycle: 28, defaultDays: 5 } };
  let view = { y: 0, m: 0 }; /* 日历当前查看的年月（m: 0-11） */
  let pred = null;           /* 当前预测缓存（基于最近一次记录） */

  /* ================= 日期工具 ================= */
  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  /* 用当日中午 12 点构造，避免时区 / 夏令时误差 */
  const noon = s => new Date(s + 'T12:00:00');
  const addDays = (s, n) => {
    const d = noon(s);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  const diffDays = (a, b) => Math.round((noon(b) - noon(a)) / 86400000);
  const genId = () => 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const clampDays = d => { const n = parseInt(d, 10); return (n >= 1 && n <= 14) ? n : 5; };
  const clampCycle = c => { const n = parseInt(c, 10); return (n >= 15 && n <= 60) ? n : 28; };

  /* ================= 读取 + 旧格式迁移 ================= */
  function load() {
    const cur = LB.storage.get(KEY, null);
    if (cur && Array.isArray(cur.records)) {
      /* 已是新格式 */
      const s = cur.settings || {};
      data = {
        records: cur.records
          .filter(r => r && typeof r.start === 'string')
          .map(r => ({ id: r.id || genId(), start: r.start, days: clampDays(r.days) })),
        settings: { defaultCycle: clampCycle(s.defaultCycle), defaultDays: clampDays(s.defaultDays) }
      };
      return;
    }
    /* 旧格式：KEY = { start, cycle, days, note, remind } + HIST_KEY = [{ id, start, cycle, days }]
       → 转为 records 数组（note / remind / 逐条 cycle 弃用，"提醒"能力已移除） */
    const records = [];
    if (cur && typeof cur.start === 'string') records.push({ id: genId(), start: cur.start, days: clampDays(cur.days) });
    const hist = LB.storage.get(LEGACY_HIST_KEY, null);
    if (Array.isArray(hist)) {
      hist.forEach(h => { if (h && typeof h.start === 'string') records.push({ id: h.id || genId(), start: h.start, days: clampDays(h.days) }); });
    }
    const seen = new Set();
    data = {
      records: records
        .filter(r => { if (seen.has(r.start)) return false; seen.add(r.start); return true; })
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
        .slice(-MAX_RECORDS),
      settings: { defaultCycle: clampCycle(cur && cur.cycle), defaultDays: clampDays(cur && cur.days) }
    };
    persist();
    LB.storage.remove(LEGACY_HIST_KEY);
    LB.storage.remove(LEGACY_REMIND_KEY);
  }

  function persist() { LB.storage.set(KEY, data); }

  /* ================= 周期统计 ================= */
  /* 平均周期 =（最后一次 − 第一次）÷（次数 − 1）；多次记录才可用 */
  function cycleStats() {
    const recs = data.records;
    if (recs.length < 2) return { avg: data.settings.defaultCycle, min: 0, max: 0, gaps: [], enough: false };
    const gaps = [];
    for (let i = 1; i < recs.length; i++) gaps.push(diffDays(recs[i - 1].start, recs[i].start));
    const avgRaw = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    return { avg: clampCycle(avgRaw), min: Math.min(...gaps), max: Math.max(...gaps), gaps, enough: true };
  }

  /* 规律性：近 6 次间隔的最大波动，波动越小星越多 */
  function regularity(gaps) {
    const recent = gaps.slice(-6);
    if (recent.length < 2) return { stars: 0, label: '数据不足' };
    const avg = recent.reduce((s, g) => s + g, 0) / recent.length;
    const dev = Math.max(...recent.map(g => Math.abs(g - avg)));
    const stars = dev <= 2 ? 5 : dev <= 4 ? 4 : dev <= 7 ? 3 : dev <= 10 ? 2 : 1;
    return { stars, label: '近 ' + recent.length + ' 次' };
  }

  /* ================= 预测（基于最近一次开始日期，只预测下一周期） ================= */
  function predict() {
    const recs = data.records;
    if (!recs.length) return null;
    const lastRec = recs[recs.length - 1];
    const st = cycleStats();
    const nextStart = addDays(lastRec.start, st.avg);
    const ovulation = addDays(nextStart, -LUTEAL);
    const fertileStart = addDays(ovulation, -5);
    const fertileEnd = addDays(ovulation, 1);
    return {
      lastRec, cycle: st.avg, stats: st,
      nextStart, ovulation, fertileStart, fertileEnd,
      safeBefore: { start: addDays(lastRec.start, lastRec.days), end: addDays(fertileStart, -1) },
      safeAfter: { start: addDays(fertileEnd, 1), end: addDays(nextStart, -1) }
    };
  }

  /* 日历单日状态：period / ovu / fertile / safe / ''（无标记） */
  function dayStatus(dateStr, p) {
    for (const rec of data.records) {
      if (dateStr >= rec.start && dateStr <= addDays(rec.start, rec.days - 1)) return 'period';
    }
    if (!p) return '';
    if (dateStr === p.ovulation) return 'ovu';
    if (dateStr >= p.fertileStart && dateStr <= p.fertileEnd) return 'fertile';
    if (dateStr >= p.safeBefore.start && dateStr <= p.safeBefore.end) return 'safe';
    if (dateStr >= p.safeAfter.start && dateStr <= p.safeAfter.end) return 'safe';
    return '';
  }

  /* ================= 渲染 ================= */
  function renderStatus() {
    const box = $('#pdStatus', rootEl);
    if (!pred) { box.hidden = true; return; }
    const today = todayStr();
    const dayNo = diffDays(pred.lastRec.start, today) + 1;
    $('#pdStatusMain', rootEl).textContent = dayNo < 1 ? '🌸 经期尚未开始' : '🌸 周期第 ' + dayNo + ' 天';

    const ovuGap = diffDays(today, pred.ovulation);
    $('#pdStatusSub', rootEl).textContent =
      ovuGap > 0 ? '预计 ' + ovuGap + ' 天后排卵' : ovuGap === 0 ? '预计今天排卵' : '本次排卵日已过';

    const nextGap = diffDays(today, pred.nextStart);
    $('#pdStatusNext', rootEl).innerHTML =
      '下次经期：<b>' + esc(pred.nextStart) + '</b>' +
      (nextGap >= 0 ? '（距今 ' + nextGap + ' 天）' : '（已逾期 ' + (-nextGap) + ' 天）');
    box.hidden = false;
  }

  function renderCal() {
    const y = view.y, m = view.m;
    $('#pdCalTitle', rootEl).textContent = y + ' 年 ' + (m + 1) + ' 月';
    const startDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = todayStr();
    let h = DOW.map(d => '<div class="pd-dow">' + d + '</div>').join('');
    for (let i = 0; i < startDow; i++) h += '<div class="pd-cell pd-cell-blank"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = y + '-' + pad(m + 1) + '-' + pad(d);
      const st = dayStatus(dateStr, pred);
      let cls = 'pd-cell';
      if (st) cls += ' is-' + st;
      else if (dateStr < today) cls += ' is-muted';
      if (dateStr === today) cls += ' is-today';
      h += '<div class="' + cls + '"><span>' + d + '</span><i class="pd-dot' + (st ? ' dot-' + st : ' dot-plain') + '"></i></div>';
    }
    $('#pdGrid', rootEl).innerHTML = h;
  }

  function renderAnalysis() {
    const stats = pred ? pred.stats : cycleStats();
    const avgEl = $('#pdAvg', rootEl), mmEl = $('#pdMinMax', rootEl), regEl = $('#pdRegularity', rootEl);
    if (!pred) {
      avgEl.textContent = '—';
      mmEl.textContent = '—';
      regEl.textContent = '☆☆☆☆☆（数据不足）';
    } else {
      avgEl.textContent = stats.avg + ' 天';
      mmEl.textContent = stats.enough ? stats.min + ' / ' + stats.max + ' 天' : '—';
      const rg = regularity(stats.gaps);
      regEl.textContent = rg.stars > 0
        ? '★'.repeat(rg.stars) + '☆'.repeat(5 - rg.stars) + '（' + rg.label + '）'
        : '☆☆☆☆☆（' + rg.label + '）';
    }

    /* 历史记录列表（最多 24 次） */
    const hist = $('#pdHist', rootEl);
    if (!data.records.length) {
      LB.ui.empty(hist, {
        icon: '🌙',
        title: '暂无记录',
        sub: '点击「记录本次经期」开始第一次记录'
      });
      return;
    }
    /* 列表倒序（最近在上） */
    hist.innerHTML = data.records.slice().reverse().map(r =>
      '<div class="lg-row"><div class="lg-info"><b>' + esc(r.start) + '</b>' +
      '<small>经期 ' + r.days + ' 天</small></div>' +
      '<button class="td-del" data-del="' + esc(r.id) + '" type="button" aria-label="删除">×</button>' +
      '</div>'
    ).join('');
  }

  function renderAll() {
    pred = predict();
    renderStatus();
    renderCal();
    renderAnalysis();
  }

  /* ================= 记录 ================= */
  function tryShowPicker() {
    const el = $('#pdStart', rootEl);
    try { if (el && el.showPicker) el.showPicker(); else el.focus(); } catch (_) { el.focus(); }
  }

  function save() {
    const start = $('#pdStart', rootEl).value;
    const days = parseInt($('#pdDays', rootEl).value, 10);
    if (!start) { LB.toast('请先选择本次开始日期', 'info'); tryShowPicker(); return; }
    if (!(days >= 1 && days <= 14)) { LB.toast('持续天数需在 1-14 天之间', 'info'); return; }

    const exist = data.records.find(r => r.start === start);
    if (exist) {
      exist.days = days;
      LB.toast('已更新该次记录', 'ok');
    } else {
      data.records.push({ id: genId(), start, days });
      data.records.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      if (data.records.length > MAX_RECORDS) data.records = data.records.slice(-MAX_RECORDS);
      data.settings.defaultDays = days;
      LB.toast('已记录，预测已更新', 'ok');
    }
    persist();
    /* 记录的开始日期落在哪个月，日历就翻到哪个月 */
    const d = noon(start);
    view = { y: d.getFullYear(), m: d.getMonth() };
    renderAll();
  }

  function removeRecord(id) {
    data.records = data.records.filter(r => r.id !== id);
    persist();
    renderAll();
    LB.toast('已删除该条记录', 'ok');
  }

  /* ================= HTML ================= */
  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>经期记录</h1><p>记录月经周期，预测排卵期与易孕期，数据仅本机保存</p></div>' +
      '</div>' +
      '<div class="tool-body">' +

      /* 顶部 · 本次状态卡 */
      '<div class="card tool-sec set-card pd-status" id="pdStatus" hidden>' +
      '<div class="pd-status-main" id="pdStatusMain">—</div>' +
      '<div class="pd-status-sub" id="pdStatusSub">—</div>' +
      '<div class="pd-status-next" id="pdStatusNext">—</div>' +
      '</div>' +

      /* 中部 · 月历视图 */
      '<div class="card tool-sec set-card">' +
      '<div class="pd-cal-head">' +
      '<div class="pd-nav"><button id="pdPrev" type="button" aria-label="上个月">‹</button></div>' +
      '<div class="pd-cal-title" id="pdCalTitle">—</div>' +
      '<div class="pd-nav"><button id="pdNext" type="button" aria-label="下个月">›</button></div>' +
      '</div>' +
      '<div class="pd-grid" id="pdGrid"></div>' +
      '<div class="pd-legend">' +
      '<span class="pd-lg-item"><i class="pd-lg-dot dot-period"></i>经期</span>' +
      '<span class="pd-lg-item"><i class="pd-lg-dot dot-ovu"></i>排卵日</span>' +
      '<span class="pd-lg-item"><i class="pd-lg-dot dot-fertile"></i>易孕期</span>' +
      '<span class="pd-lg-item"><i class="pd-lg-dot dot-safe"></i>安全期</span>' +
      '<span class="pd-lg-item"><i class="pd-lg-dot dot-future"></i>未来</span>' +
      '</div>' +
      '</div>' +

      /* 底部 · 记录区 */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">记录本次经期</span>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">本次开始日期<input class="inp" id="pdStart" type="date" /></label>' +
      '<label class="pz-lab">持续天数<input class="inp" id="pdDays" type="number" min="1" max="14" value="5" /></label>' +
      '</div>' +
      '<button class="btn btn-main js-primary-submit" id="pdGo" type="button">📅 记录本次经期</button>' +
      '</div>' +

      /* 底部 · 周期分析（折叠） */
      '<details class="card tool-sec set-card set-details" id="pdAnalyBox">' +
      '<summary>周期分析</summary>' +
      '<div class="pd-stats">' +
      '<div class="pd-stat-row"><span>平均周期</span><b id="pdAvg">—</b></div>' +
      '<div class="pd-stat-row"><span>最短 / 最长</span><b id="pdMinMax">—</b></div>' +
      '<div class="pd-stat-row"><span>规律性</span><b id="pdRegularity">—</b></div>' +
      '</div>' +
      '<span class="tool-lab">历史记录（最多 24 次）</span>' +
      '<div class="lg-rows pd-hist" id="pdHist"></div>' +
      '</details>' +

      '<p class="cd-note">数据仅保存在本机浏览器，不上传服务器。仅作日常记录与日期估算，不构成医疗建议。</p>' +
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">周期预测存在自然波动，仅供参考，不构成医疗建议。如身体持续不适，请咨询医生。</span></div>' +
      '</div>'
    );
  }

  /* ================= 生命周期 ================= */
  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    load();

    const now = new Date();
    view = { y: now.getFullYear(), m: now.getMonth() };
    $('#pdStart', root).value = todayStr();
    $('#pdDays', root).value = data.settings.defaultDays;

    $('#pdGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; save(); });
    $('#pdStart', root).addEventListener('click', tryShowPicker);
    $('#pdPrev', root).addEventListener('click', () => {
      view.m--; if (view.m < 0) { view.m = 11; view.y--; }
      renderCal();
    });
    $('#pdNext', root).addEventListener('click', () => {
      view.m++; if (view.m > 11) { view.m = 0; view.y++; }
      renderCal();
    });
    $('#pdHist', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      LB.confirm(del, () => removeRecord(del.dataset.del), 3000, { iconOnly: true });
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    renderAll();
  }

  function unmount() { rootEl = null; pred = null; }

  LB.router.register('period', { mount, unmount });
})();
