/* LiteBox v5 · tools/timer.js — 计时器 / 秒表（倒计时到点响铃 + 分段秒表，切 tab 不销毁状态） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  let rootEl = null;
  let cdTimer = null; /* 倒计时 250ms 轮询 */
  let swTimer = null; /* 秒表 30ms 刷新 */
  let actx = null;

  /* 倒计时状态（时间戳计时，不递减） */
  const cd = { total: 60, remain: 60, running: false, endAt: 0 };
  /* 秒表状态（acc 累计毫秒 + t0 本次开始时间戳） */
  const sw = { acc: 0, t0: 0, running: false, laps: [] };

  const pad = n => String(n).padStart(2, '0');
  const fmtCd = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  const fmtSw = ms => pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor(ms / 1000) % 60) + '.' + pad(Math.floor(ms / 10) % 100);

  /* —— 3 声到点响铃（780Hz + 1046Hz 叠音 ×3） —— */
  function ring3() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime + 0.02;
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.22;
        [780, 1046].forEach(f => {
          const o = actx.createOscillator();
          const g = actx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.25, st + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.18);
          o.connect(g).connect(actx.destination);
          o.start(st);
          o.stop(st + 0.2);
        });
      }
    } catch (_) { /* 音频环境不可用时静默跳过 */ }
  }

  /* ============ 倒计时 ============ */
  function cdShow() { $('#tmCdBig', rootEl).textContent = fmtCd(Math.max(0, cd.remain)); }

  function cdBtn() {
    $('#tmCdGo', rootEl).textContent = cd.running ? '⏸️ 暂停' : (cd.remain !== cd.total ? '▶️ 继续' : '▶️ 开始');
  }

  /* 运行中锁定输入框与快捷时长 */
  function cdLock(on) {
    $$('#tmCdPane .tm-chip', rootEl).forEach(c => { c.disabled = on; });
    $('#tmMin', rootEl).disabled = on;
    $('#tmSec', rootEl).disabled = on;
  }

  function cdSet(sec) {
    if (!(sec > 0)) return; /* 无效输入不重置 */
    cd.total = Math.round(sec);
    cd.remain = cd.total;
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    cd.running = false;
    cdShow(); cdBtn(); cdLock(false);
  }

  function cdFromInputs() {
    const m = parseInt($('#tmMin', rootEl).value, 10) || 0;
    const s = parseInt($('#tmSec', rootEl).value, 10) || 0;
    cdSet(m * 60 + s);
  }

  function cdStart() {
    if (cd.remain <= 0) cd.remain = cd.total;
    cd.endAt = Date.now() + cd.remain * 1000;
    cd.running = true;
    if (cdTimer) clearInterval(cdTimer);
    cdTimer = setInterval(cdTick, 250);
    cdShow(); cdBtn(); cdLock(true);
  }

  function cdPause() {
    cd.remain = Math.max(0, Math.round((cd.endAt - Date.now()) / 1000));
    cd.running = false;
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    cdShow(); cdBtn(); cdLock(false);
  }

  function cdTick() {
    cd.remain = Math.round((cd.endAt - Date.now()) / 1000);
    if (cd.remain > 0) { cdShow(); return; }
    cd.remain = 0;
    cd.running = false;
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    ring3();
    LB.toast('时间到 ⏰', 'ok');
    cd.remain = cd.total; /* 响铃后恢复满时长，方便下一轮 */
    cdShow(); cdBtn(); cdLock(false);
  }

  /* ============ 秒表 ============ */
  function swNow() { return sw.acc + (sw.running ? Date.now() - sw.t0 : 0); }
  function swShow() { $('#tmSwBig', rootEl).textContent = fmtSw(swNow()); }

  function swBtn() {
    $('#tmSwGo', rootEl).textContent = sw.running ? '⏸️ 暂停' : (sw.acc > 0 ? '▶️ 继续' : '▶️ 开始');
  }

  function swStart() {
    sw.t0 = Date.now();
    sw.running = true;
    if (swTimer) clearInterval(swTimer);
    swTimer = setInterval(swShow, 30); /* 30ms 刷新，百分秒流畅 */
    swShow(); swBtn();
  }

  function swPause() {
    sw.acc = swNow();
    sw.running = false;
    if (swTimer) { clearInterval(swTimer); swTimer = null; }
    swShow(); swBtn();
  }

  function swLap() {
    const t = swNow();
    if (t <= 0) { LB.toast('先开始计时再分段', 'info'); return; }
    sw.laps.unshift({ n: sw.laps.length + 1, t }); /* 最新在上 */
    renderLaps();
  }

  function renderLaps() {
    $('#tmLaps', rootEl).innerHTML = sw.laps.map(l =>
      '<div class="tm-lap"><b>分段 ' + l.n + '</b><span>' + fmtSw(l.t) + '</span></div>'
    ).join('');
  }

  function swReset() {
    if (swTimer) { clearInterval(swTimer); swTimer = null; }
    sw.acc = 0; sw.t0 = 0; sw.running = false; sw.laps = [];
    swShow(); swBtn(); renderLaps();
  }

  /* ============ tab 切换（只切显示，不销毁状态） ============ */
  function setPane(v) {
    $$('#tmSeg .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#tmCdPane', rootEl).hidden = v !== 'cd';
    $('#tmSwPane', rootEl).hidden = v !== 'sw';
  }

  function html() {
    const chips = [1, 3, 5, 10, 15, 25, 30, 45, 60]
      .map(m => '<button class="chip tm-chip" data-min="' + m + '" type="button">' + m + ' 分</button>').join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>计时器秒表</h1><p>倒计时 / 秒表 / 分段计时三合一，到点响铃提醒</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="tmSeg">' +
      '<button class="seg-btn on" data-v="cd" type="button">⏱️ 倒计时</button>' +
      '<button class="seg-btn" data-v="sw" type="button">⏲️ 秒表</button>' +
      '</div>' +
      '<div id="tmCdPane">' +
      '<div class="card tm-pane">' +
      '<div class="tm-big" id="tmCdBig">01:00</div>' +
      '<div class="tm-chips">' + chips + '</div>' +
      '<div class="tm-in-row">' +
      '<label>分<input class="inp" id="tmMin" type="number" min="0" max="999" value="1" /></label>' +
      '<label>秒<input class="inp" id="tmSec" type="number" min="0" max="59" value="0" /></label>' +
      '</div>' +
      '<div class="tm-btns">' +
      '<button class="btn btn-main" id="tmCdGo" type="button">▶️ 开始</button>' +
      '<button class="btn btn-ghost" id="tmCdReset" type="button">重置</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div id="tmSwPane" hidden>' +
      '<div class="card tm-pane">' +
      '<div class="tm-big" id="tmSwBig">00:00.00</div>' +
      '<div class="tm-btns">' +
      '<button class="btn btn-main" id="tmSwGo" type="button">▶️ 开始</button>' +
      '<button class="btn btn-ghost" id="tmSwLap" type="button">分段</button>' +
      '<button class="btn btn-ghost" id="tmSwReset" type="button">重置</button>' +
      '</div>' +
      '<div class="tm-laps" id="tmLaps"></div>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">倒计时到点响铃三声（需浏览器声音开启）；秒表支持分段计时，两个面板来回切换计时不中断。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    $('#tmSeg', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setPane(b.dataset.v);
    });
    /* 倒计时：快捷时长 */
    root.addEventListener('click', e => {
      const chip = e.target.closest('.tm-chip');
      if (chip) {
        $('#tmMin', rootEl).value = chip.dataset.min;
        $('#tmSec', rootEl).value = 0;
        cdSet(+chip.dataset.min * 60);
      }
    });
    /* 倒计时：分秒输入即时生效 */
    $('#tmMin', root).addEventListener('input', cdFromInputs);
    $('#tmSec', root).addEventListener('input', cdFromInputs);
    $('#tmCdGo', root).addEventListener('click', () => { cd.running ? cdPause() : cdStart(); });
    $('#tmCdReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => cdSet(cd.total)));
    /* 秒表 */
    $('#tmSwGo', root).addEventListener('click', () => { sw.running ? swPause() : swStart(); });
    $('#tmSwLap', root).addEventListener('click', swLap);
    $('#tmSwReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, swReset));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (swTimer) { clearInterval(swTimer); swTimer = null; }
    rootEl = null;
  }

  LB.router.register('timer', { mount, unmount });
})();
