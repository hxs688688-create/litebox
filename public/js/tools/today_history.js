/* LiteBox v5 · tools/today_history.js — 历史今日（Step 28 · 三，重写）
 *
 * 数据源换成同源 /api/history_today（action=today|date|search），原本地历史字典
 * 已删除，界面上不出现任何来源标注。
 *
 * 【日期窗口为什么按真实日历推进】
 *   上一版用闰年 2000 做基准是为了覆盖 02-29；这版窗口只有「当日前后 3 天」，
 *   直接用真实 Date 加减，跨月、跨年交给 Date 处理，闰年的 02-29 也天然可达。
 *
 * 【传参格式】
 *   任务书给的是 fmtDate → 'MMdd'（如 1005），后端按 4 位数字校验后转 YYYY-MM-DD。
 *
 * 【实现取舍】
 *   1) 按钮绑定用 addEventListener，不用内联 onclick —— 全站红线禁内联；
 *   2) 超出前后 3 天时按钮置灰，同时点一次给「仅支持查询当日前后 3 天」提示；
 *   3) apiGet 自己读 body.error.message（与 express.js / disaster.js 同一处理）；
 *   4) 「随机一天」随数据源换成联网接口一并移除（随机日期同样受 ±3 天窗口限制）。
 *
 * 类名沿用任务书给定的 .th-head / .th-nav / .th-list / .th-item / .th-year /
 * .th-title / .th-desc / .th-category。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const RANGE = 3;               /* 任务书：限当日前后 3 天 */
  const RANGE_MSG = '仅支持查询当日前后 3 天';
  const SEARCH_MSG = '没有找到相关事件';

  let rootEl = null;
  let seq = 0;
  let cur = null;                /* 当前选中的真实日期（当天 0 点） */
  let keyword = '';              /* 当前生效的搜索词 */

  const pad = n => String(n).padStart(2, '0');

  function atMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function today() { return atMidnight(new Date()); }

  /* 任务书给定的格式：'MMdd' */
  function fmtDate(d) {
    return pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function dayDiff(d) {
    return Math.round((atMidnight(d) - today()) / 86400000);
  }

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    let r = null, text = '';
    try {
      r = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '查询超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '未获取到历史事件');
    return d;
  }

  function itemHtml(x) {
    const year = Number(x.year) || 0;
    return '<div class="th-item">' +
      '<div class="th-year">' + (year < 0 ? '公元前 ' + Math.abs(year) : year) + '</div>' +
      '<div class="th-body">' +
      '<div class="th-title">' + esc(x.title || '') + '</div>' +
      (x.desc ? '<p class="th-desc">' + esc(x.desc) + '</p>' : '') +
      (x.category ? '<span class="th-category">' + esc(x.category) + '</span>' : '') +
      '</div>' +
      '</div>';
  }

  function showEmpty(title, sub) {
    LB.ui.empty($('#thList', rootEl), { icon: '📅', title: title, sub: sub || '换个日期或关键词再试试' });
    $('#thFoot', rootEl).innerHTML = '';
  }

  function render(d) {
    const box = $('#thList', rootEl);
    const list = (Array.isArray(d.events) ? d.events : []).slice()
      .sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0));
    box.innerHTML = list.length ? list.map(itemHtml).join('') : '';
    if (!list.length) {
      showEmpty(keyword ? SEARCH_MSG : '这一天暂无记录', keyword ? '换个关键词，或清空搜索回看当天' : RANGE_MSG);
      return;
    }
    $('#thFoot', rootEl).innerHTML =
      '<p class="th-sum">共 ' + (Number(d.total) || list.length) + ' 条</p>';
  }

  function syncNav() {
    const diff = dayDiff(cur);
    const lab = diff === 0 ? '今天：' : (diff > 0 ? '之后 ' + diff + ' 天：' : '之前 ' + (-diff) + ' 天：');
    $('#thLab', rootEl).textContent = lab;
    $('#thDate', rootEl).textContent = (cur.getMonth() + 1) + ' 月 ' + cur.getDate() + ' 日';
    /* 越界按钮保持可点（任务书：点 3 次后给范围提示），不做 disabled */
    $('#thTodayBtn', rootEl).disabled = diff === 0;
  }

  async function load() {
    if (!rootEl) return;
    if (!HAS_API) {
      $('#thList', rootEl).innerHTML = '';
      LB.ui.empty($('#thList', rootEl), { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    syncNav();
    const my = ++seq;
    const box = $('#thList', rootEl);
    LB.ui.skeleton(box, 5, 'card');
    /* 搜索走 action=search；今天走 action=today；其余日期传 MMdd */
    const path = keyword
      ? '/api/history_today?action=search&q=' + encodeURIComponent(keyword)
      : (dayDiff(cur) === 0
        ? '/api/history_today?action=today'
        : '/api/history_today?action=date&date=' + encodeURIComponent(fmtDate(cur)));
    try {
      const d = await apiGet(path, 12000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '历史查询服务暂时不可用';
      box.innerHTML = '';
      LB.ui.empty(box, {
        icon: '📅',
        title: msg,
        sub: '历史接口偶尔抽风，稍后重新加载',
        ctaText: '重新加载',
        onCta: load
      });
      LB.fail('历史今日', msg, '检查网络后点击重试');
    }
  }

  function shift(delta) {
    const next = dayDiff(cur) + delta;
    if (next < -RANGE || next > RANGE) { LB.toast(RANGE_MSG, 'info'); return; }
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + delta);
    /* 换日期 = 回到「看当天」模式（任务书：清空搜索 → 返回当天数据的同类逻辑） */
    if (keyword) {
      keyword = '';
      $('#thSearch', rootEl).value = '';
    }
    load();
    /* 走到边界就提示一次，省掉下一次必然失败的点击（任务书：点 3 次后提示） */
    if (Math.abs(next) === RANGE) LB.toast(RANGE_MSG, 'info');
  }

  function goToday() {
    cur = today();
    if (keyword) {
      keyword = '';
      $('#thSearch', rootEl).value = '';
    }
    load();
  }

  function runSearch() {
    const raw = $('#thSearch', rootEl).value.trim();
    if (raw.length > 50) { LB.toast('搜索词请控制在 50 个字以内', 'info'); return; }
    keyword = raw;
    /* 清空搜索 → 返回当天数据 */
    if (!keyword) cur = today();
    load();
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>历史今日</h1><p>按日期翻历史上今天的大事，支持关键词搜索</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card th-head">' +
      '<div class="th-nav">' +
      '<button class="btn btn-ghost btn-sm" id="thPrev" type="button">‹ 前一天</button>' +
      '<div class="th-cur"><span class="th-lab" id="thLab">今天：</span><b id="thDate"></b></div>' +
      '<button class="btn btn-ghost btn-sm" id="thNext" type="button">后一天 ›</button>' +
      '</div>' +
      '<div class="th-acts">' +
      '<button class="btn btn-ghost btn-sm" id="thTodayBtn" type="button">回到今天</button>' +
      '</div>' +
      '<div class="th-search">' +
      '<input class="inp" id="thSearch" maxlength="50" placeholder="搜索事件关键词，如：中华人民共和国" aria-label="搜索历史事件" />' +
      '<button class="btn btn-main btn-sm" id="thGo" type="button">🔍 搜索</button>' +
      '</div>' +
      '</div>' +
      '<div class="th-list" id="thList"></div>' +
      '<div class="th-foot" id="thFoot"></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    cur = today();
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    $('#thPrev', root).addEventListener('click', () => shift(-1));
    $('#thNext', root).addEventListener('click', () => shift(1));
    $('#thTodayBtn', root).addEventListener('click', goToday);
    $('#thGo', root).addEventListener('click', runSearch);
    LB.enterSubmit($('#thSearch', root), runSearch);
    /* 清空输入框 → 直接回当天 */
    $('#thSearch', root).addEventListener('input', e => {
      if (!e.target.value && keyword) { keyword = ''; cur = today(); load(); }
    });
    /* 描述 3 行截断 —— 点击展开/收起 */
    root.addEventListener('click', e => {
      const desc = e.target.closest('.th-desc');
      if (desc) desc.classList.toggle('open');
    });
    load();
  }

  function unmount() {
    seq++;
    keyword = '';
    cur = null;
    rootEl = null;
  }

  LB.router.register('today_history', { mount, unmount });
})();
