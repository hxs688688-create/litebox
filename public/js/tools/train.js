/* LiteBox v5 · tools/train.js — 火车票查询（同源 /api/train，降级提供 12306 / 第三方跳转） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;
  const recent = []; /* 最近 5 条查询 { from, to, date }，内存不持久化 */

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function todayStr() { return fmtDate(new Date()); }

  /* 车次类型：G/D/K/T/Z 等色 */
  function typeCls(code) {
    const c = (code || '').charAt(0).toUpperCase();
    if (c === 'G' || c === 'C') return 'tr-t-g';
    if (c === 'D') return 'tr-t-d';
    if (c === 'K') return 'tr-t-k';
    if (c === 'T' || c === 'Z') return 'tr-t-tz';
    return 'tr-t-o';
  }

  /* 座位余票值 → 状态类：有/数字 绿，无/-- 灰 */
  function seatCls(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s || s === '--' || s === '无') return 'tr-seat-off';
    return 'tr-seat-on';
  }

  /* Step 14：后端 seat 可能是 对象 / 数组 / 字符串（MCP 文本解析出来的是字符串），统一收口渲染 */
  function seatHtmlOf(seat) {
    if (!seat) return '';

    if (typeof seat === 'string') {
      const s = seat.trim();
      if (!s) return '';
      return s.split(/[·,，;；|｜]/).map(x => x.trim()).filter(Boolean).map(x => {
        const m = x.match(/^(.+?)[\s:：]+(\S+)$/);
        const name = m ? m[1] : x;
        const val = m ? m[2] : '';
        return '<span class="tr-seat ' + seatCls(val) + '">' + esc(name) +
          (val ? ' <b>' + esc(val) + '</b>' : '') + '</span>';
      }).join('');
    }

    if (Array.isArray(seat)) {
      return seat.map(x => {
        if (typeof x === 'string') return '<span class="tr-seat tr-seat-on">' + esc(x) + '</span>';
        const val = x && x.value != null ? x.value : '';
        return '<span class="tr-seat ' + seatCls(val) + '">' + esc((x && x.name) || '') +
          (val === '' ? '' : ' <b>' + esc(String(val)) + '</b>') + '</span>';
      }).join('');
    }

    return Object.keys(seat).map(k =>
      '<span class="tr-seat ' + seatCls(seat[k]) + '">' + esc(k) + ' <b>' + esc(String(seat[k])) + '</b></span>'
    ).join('');
  }

  function renderTrains(list) {
    const box = $('#tnList', rootEl);
    if (!list.length) { /* Step 5D-3：空结果提示 */
      box.innerHTML = '<div class="card tool-sec set-card"><p class="cd-note">未查询到车次，请尝试车站全名（如"兰州西"）或更换日期。</p></div>';
      box.hidden = false;
      $('#tnLoad', rootEl).hidden = true;
      $('#tnFail', rootEl).hidden = true;
      return;
    }
    box.innerHTML = list.map(t => {
      const seatHtml = seatHtmlOf(t.seat);
      return (
        '<div class="card tr-item">' +
        '<span class="tr-code ' + typeCls(t.code) + '">' + esc(t.code || '') + '</span>' +
        '<div class="tr-mid">' +
        '<div class="tr-times"><b>' + esc(t.depart || '--') + '</b><i>→</i><b>' + esc(t.arrive || '--') + '</b></div>' +
        '<small class="tr-dur">' + esc(t.duration || '') + '</small>' +
        '<div class="tr-seats">' + seatHtml + '</div>' +
        '</div>' +
        '<div class="tr-stations"><span>' + esc(t.from || '--') + '</span><span>' + esc(t.to || '--') + '</span></div>' +
        '</div>'
      );
    }).join('');
    box.hidden = false;
    $('#tnLoad', rootEl).hidden = true;
    $('#tnFail', rootEl).hidden = true;
  }

  /* 降级：不直连 12306（CORS / 反爬），给出官方与第三方跳转。
     Step 4C：优先使用 /api/train 返回的 reason + links（12306 / 携程）；无后端时用本地构造兜底 */
  function renderFail(from, to, date, api) {
    $('#tnList', rootEl).hidden = true;
    $('#tnLoad', rootEl).hidden = true;
    const fail = $('#tnFail', rootEl);
    $('#tnFailTxt', rootEl).textContent = (api && api.reason) || '当前暂无法直接查询余票。可前往 12306 官方网站查询。';
    const box = $('#tnFailLinks', rootEl);
    if (api && Array.isArray(api.links) && api.links.length) {
      box.innerHTML = api.links.map((x, i) =>
        '<a class="btn ' + (i === 0 ? 'btn-main' : 'btn-ghost') + ' btn-sm" href="' + esc(x.url || '#') + '" target="_blank" rel="noopener">' + (i === 0 ? '🚄 ' : '🧭 ') + esc(x.name || '打开链接') + '</a>'
      ).join('');
    } else {
      const u = 'https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=' + encodeURIComponent(from) + '&ts=' + encodeURIComponent(to) + '&date=' + date;
      box.innerHTML =
        '<a class="btn btn-main btn-sm" href="' + u + '" target="_blank" rel="noopener">🚄 打开 12306 查询</a>' +
        '<a class="btn btn-ghost btn-sm" href="https://train.qunar.com/stationToStation.htm?fromStation=' + encodeURIComponent(from) + '&toStation=' + encodeURIComponent(to) + '&date=' + date + '" target="_blank" rel="noopener">🧭 去哪儿查询</a>';
    }
    fail.hidden = false;
  }

  function pushRecent(q) {
    const idx = recent.findIndex(x => x.from === q.from && x.to === q.to && x.date === q.date);
    if (idx > -1) recent.splice(idx, 1);
    recent.unshift(q);
    if (recent.length > 5) recent.length = 5;
    $('#tnRecent', rootEl).innerHTML = recent.map((x, i) =>
      '<button class="chip" data-r="' + i + '" type="button">' + esc(x.from) + ' → ' + esc(x.to) + ' · ' + esc(x.date) + '</button>'
    ).join('');
    $('#tnRecentWrap', rootEl).hidden = recent.length === 0;
  }

  async function run() {
    const from = $('#tnFrom', rootEl).value.trim();
    const to = $('#tnTo', rootEl).value.trim();
    const date = $('#tnDate', rootEl).value;
    if (!from) { LB.toast('请输入出发地', 'info'); return; }
    if (!to) { LB.toast('请输入目的地', 'info'); return; }
    if (!date) { LB.toast('请选择出发日期', 'info'); return; }
    if (from === to) { LB.toast('出发地与目的地相同', 'info'); return; }
    if (date < todayStr()) { LB.toast('出发日期不能早于今天', 'warn'); return; }
    const diff = Math.round((new Date(date + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000);
    if (diff > 15) { LB.toast('12306 一般只支持查询 15 天内的车票', 'warn'); return; }

    pushRecent({ from: from, to: to, date: date });
    const my = ++seq;
    $('#tnList', rootEl).hidden = true;
    $('#tnFail', rootEl).hidden = true;
    $('#tnLoad', rootEl).hidden = false;
    const btn = $('#tnGo', rootEl);
    btn.disabled = true;
    btn.textContent = '⏳ 查询中…';
    try {
      let trains = null;
      let apiFail = null;
      if (HAS_API) {
        try {
          const d = await LB.api.getJSON('/api/train?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&date=' + date, { timeout: 6000 });
          if (d && d.available === true && Array.isArray(d.trains)) trains = d.trains; /* Step 5D-3：available:true 时空数组也走 renderTrains（显示"未查询到车次"） */
          else if (d && d.available === false) apiFail = d; /* Step 4C：{ available:false, reason, links } */
        } catch (_) { trains = null; }
      }
      if (my !== seq) return;
      if (trains) renderTrains(trains);
      else renderFail(from, to, date, apiFail);
    } finally {
      if (my === seq) {
        btn.disabled = false;
        btn.textContent = '🔍 查询车次';
      }
    }
  }

  function swap() {
    const f = $('#tnFrom', rootEl);
    const t = $('#tnTo', rootEl);
    const tmp = f.value;
    f.value = t.value;
    t.value = tmp;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>火车票查询</h1><p>查询公开余票信息，无需登录</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec tr-card">' +
      '<div class="tr-grid">' +
      '<label class="pz-lab">出发地<input class="inp" id="tnFrom" maxlength="20" placeholder="例如：兰州" /></label>' +
      '<button class="btn btn-ghost btn-sm tr-swap" id="tnSwap" type="button" aria-label="交换">⇄</button>' +
      '<label class="pz-lab">目的地<input class="inp" id="tnTo" maxlength="20" placeholder="例如：西安" /></label>' +
      '</div>' +
      '<label class="pz-lab">出发日期<input class="inp" id="tnDate" type="date" /></label>' +
      '<button class="btn btn-main tr-go" id="tnGo" type="button">🔍 查询车次</button>' +
      '</div>' +
      '<p class="tr-note">仅查询公开余票信息，不需要登录；查询结果显示在当前页面，不跳转。</p>' +
      '<div id="tnRecentWrap" hidden><small class="tr-recentlab">最近查询</small><div class="hl-chips" id="tnRecent"></div></div>' +
      '<div id="tnLoad" hidden><p class="cd-note">⏳ 正在查询…</p></div>' +
      '<div class="card tool-sec tr-fail" id="tnFail" hidden>' +
      '<p class="tr-failtxt" id="tnFailTxt">当前暂无法直接查询余票。可前往 12306 官方网站查询。</p>' +
      '<div class="wa-fallback" id="tnFailLinks"></div>' +
      '</div>' +
      '<div id="tnList" hidden></div>' +
      '<p class="cd-note">余票信息仅供参考，实际请以 12306 官方为准。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#tnDate', root).value = fmtDate(new Date(Date.now() + 86400000)); /* 默认明天 */
    $('#tnGo', root).addEventListener('click', run);
    $('#tnSwap', root).addEventListener('click', swap);
    $('#tnFrom', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    $('#tnTo', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    $('#tnRecent', root).addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const q = recent[+b.getAttribute('data-r')];
      if (!q) return;
      $('#tnFrom', root).value = q.from;
      $('#tnTo', root).value = q.to;
      $('#tnDate', root).value = q.date;
      run();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    rootEl = null;
  }

  LB.router.register('train', { mount, unmount });
})();
