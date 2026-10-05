/* LiteBox v5 · tools/tsconv.js — 时间戳转换（10/13 位 ↔ 日期，当前时间实时刷新） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let tick = null;

  function fmtD(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
           ' · 星期' + ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  }

  const row = (lab, val) => '<div class="tc-row"><span>' + lab + '</span><b>' + val + '</b></div>';

  /* 时间戳 → 日期 */
  function tsToD() {
    const raw = $('#tsIn', rootEl).value.trim();
    if (!/^\d{10}$/.test(raw) && !/^\d{13}$/.test(raw)) {
      LB.toast('请输入 10 位或 13 位时间戳', 'info');
      return;
    }
    /* 10 位当作秒（×1000），13 位当作毫秒 */
    const n = raw.length === 10 ? +raw * 1000 : +raw;
    const d = new Date(n);
    $('#tsOut1', rootEl).innerHTML =
      row('本地时间', fmtD(d)) +
      row('秒级（10 位）', Math.floor(n / 1000)) +
      row('毫秒级（13 位）', n) +
      row('UTC', d.toUTCString()) +
      row('ISO 8601', d.toISOString());
    $('#tsOut1', rootEl).hidden = false;
  }

  /* 日期 → 时间戳 */
  function dToTs() {
    const v = $('#dtIn', rootEl).value;
    if (!v) { LB.toast('请选择日期时间', 'info'); return; }
    const d = new Date(v);
    if (isNaN(d.getTime())) { LB.toast('日期无效', 'info'); return; }
    $('#tsOut2', rootEl).innerHTML =
      row('秒级（10 位）', Math.floor(d.getTime() / 1000)) +
      row('毫秒级（13 位）', d.getTime()) +
      row('对应时间', fmtD(d));
    $('#tsOut2', rootEl).hidden = false;
  }

  function nowTick() {
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    const secEl = $('#tsNow', rootEl);
    if (!secEl) return;
    secEl.textContent = String(sec);
    $('#tsNowMs', rootEl).textContent = now;
    $('#tsNowLocal', rootEl).textContent = fmtD(new Date(now));
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>时间戳转换</h1><p>Unix 时间戳与日期互转，秒 / 毫秒双精度</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tc-grid">' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">时间戳 → 日期</span>' +
      '<input class="inp" id="tsIn" maxlength="14" placeholder="10 位或 13 位时间戳" inputmode="numeric" />' +
      '<button class="btn btn-main" id="tsGo" type="button">转换</button>' +
      '<div class="tc-rows" id="tsOut1" hidden></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">日期 → 时间戳</span>' +
      '<input class="inp" id="dtIn" type="datetime-local" />' +
      '<button class="btn btn-main" id="dtGo" type="button">转换</button>' +
      '<div class="tc-rows" id="tsOut2" hidden></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">当前时间</span>' +
      '<div class="tc-big" id="tsNow">—</div>' +
      '<div class="tc-mid" id="tsNowMs">—</div>' +
      '<div class="tc-mid" id="tsNowLocal">—</div>' +
      '<button class="btn" id="tsCopy" type="button">复制当前秒级时间戳</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">10 位数字按秒、13 位数字按毫秒解析；当前时间每 0.5 秒刷新。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#tsGo', root).addEventListener('click', tsToD);
    $('#tsIn', root).addEventListener('keydown', e => { if (e.key === 'Enter') tsToD(); });
    $('#dtGo', root).addEventListener('click', dToTs);
    $('#tsCopy', root).addEventListener('click', () => {
      const sec = $('#tsNow', rootEl).textContent;
      LB.copyWithToast(sec, '秒级时间戳已复制 (' + sec + ')');
    });
    nowTick();
    tick = setInterval(nowTick, 500);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (tick) { clearInterval(tick); tick = null; }
    rootEl = null;
  }

  LB.router.register('tsconv', { mount, unmount });
})();
