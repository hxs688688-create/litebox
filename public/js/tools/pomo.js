/* LiteBox v5 · tools/pomo.js — 番茄钟（SVG 圆环进度 + 时间戳计时 + 专注/休息自动切换） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const KEY_CUSTOM = 'litebox_pomo_custom';
  const C = 2 * Math.PI * 118; /* 圆环周长 ≈ 741.42 */
  const DEF = { focusMin: 25, breakMin: 5 };

  let rootEl = null;
  let timer = null;       /* 250ms 轮询句柄 */
  let origTitle = '';     /* 原始标题，unmount 恢复 */
  let custom = { focusMin: 25, breakMin: 5 };
  let mode = 'focus';     /* focus | break */
  let total = 25 * 60;    /* 当前模式总秒数 */
  let remain = total;
  let running = false;
  let endAt = 0;
  let actx = null;

  /* ============ Step 13 · B4：白噪音已拆为独立工具 ============
     Step 6F 在这里用 Web Audio 合成背景音，现在整套音源（CDN 录音 + 合成降级、
     音量、定时关闭、播放历史）都搬到了 #noise 独立工具。
     番茄钟只保留完成提示音（ring3），专注时的背景音改为引导去白噪音工具。
     原来的合成算法已迁到 js/tools/noise.js，这里不再保留任何播放逻辑。 */
  const NOISE_HINT =
    '<div class="card tool-sec set-card pz-noise-hint">' +
    '<span class="tool-lab">背景音</span>' +
    '<p class="cd-note">专注时的雨声、海浪、白噪音已独立成「白噪音」工具，音量与定时关闭也在那里调。</p>' +
    '<div class="set-btns">' +
    '<a class="btn btn-ghost btn-sm" href="#noise">🌧 去白噪音工具播放</a>' +
    '</div>' +
    '</div>';

  const pad = n => String(n).padStart(2, '0');

  const fmt = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  const fmtMin = m => (Number.isInteger(m) ? m : +m.toFixed(1)) + ' 分';

  /* 今日统计 key 用真实日期（YYYY-M-D） */
  function dayKey() {
    const d = new Date();
    return 'litebox_pomo_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function todayStat() {
    const s = LB.storage.get(dayKey(), { count: 0, mins: 0 });
    return s && typeof s.count === 'number' ? s : { count: 0, mins: 0 };
  }
  function renderStat() {
    const s = todayStat();
    $('#pzStat', rootEl).textContent =
      '今日完成 ' + s.count + ' 个番茄 · 累计专注 ' + (Number.isInteger(s.mins) ? s.mins : +s.mins.toFixed(1)) + ' 分钟';
  }

  /* 圆环：dashoffset = C × (1 - remain/total)，随剩余时间减少环变短 */
  function ring() {
    const fg = $('#pzFg', rootEl);
    fg.setAttribute('stroke-dasharray', C.toFixed(2));
    fg.setAttribute('stroke-dashoffset', (C * (1 - remain / total)).toFixed(2));
  }

  function renderTime() {
    $('#pzTime', rootEl).textContent = fmt(Math.max(0, remain));
    ring();
    if (running) document.title = '▶ ' + fmt(remain) + (mode === 'focus' ? ' 专注中' : ' 休息中') + ' | 轻工具箱';
  }

  function renderState() {
    $('#pzState', rootEl).textContent = running
      ? (mode === 'focus' ? '专注中…' : '休息中…')
      : (remain !== total ? '已暂停' : '准备开始');
    $('#pzGo', rootEl).textContent = running
      ? '⏸ 暂停'
      : (remain !== total ? '▶ 继续' : '▶ ' + (mode === 'focus' ? '开始专注' : '开始休息'));
  }

  /* 完成时 3 声短促提示音（780Hz + 1046Hz 叠音 ×3） */
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

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    running = false;
    document.title = origTitle;
  }

  /* 切换模式（也用于完成后的自动切换）：重置到该模式满时长 */
  function setMode(m) {
    mode = m;
    total = Math.max(6, Math.round((m === 'focus' ? custom.focusMin : custom.breakMin) * 60));
    remain = total;
    stopTimer();
    $$('#pzSeg .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === m));
    renderState();
    renderTime();
  }

  function start() {
    if (remain <= 0) remain = total;
    endAt = Date.now() + remain * 1000; /* 时间戳计时，切后台不漂移 */
    running = true;
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 250);
    renderState();
    renderTime();
  }

  function pause() {
    remain = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    stopTimer();
    renderState();
    renderTime();
  }

  function reset() {
    remain = total;
    stopTimer();
    renderState();
    renderTime();
  }

  function tick() {
    remain = Math.round((endAt - Date.now()) / 1000);
    if (remain <= 0) { complete(); return; }
    renderTime();
  }

  function complete() {
    stopTimer();
    ring3();
    if (mode === 'focus') {
      const s = todayStat();
      s.count += 1;
      s.mins = +(s.mins + custom.focusMin).toFixed(1);
      LB.storage.set(dayKey(), s);
      setMode('break'); /* 自动切休息 */
      LB.toast('专注完成！休息一下 ☕', 'ok');
    } else {
      setMode('focus'); /* 自动切回专注 */
      LB.toast('休息结束，来一轮新专注 💪', 'ok');
    }
    renderStat();
  }

  function applyCustom() {
    const f = parseFloat($('#pzFocusMin', rootEl).value);
    const b = parseFloat($('#pzBreakMin', rootEl).value);
    if (!(f > 0 && f <= 180) || !(b > 0 && b <= 180)) { LB.toast('请输入 0.1 ~ 180 的分钟数', 'info'); return; }
    custom = { focusMin: f, breakMin: b };
    LB.storage.set(KEY_CUSTOM, custom);
    $$('#pzSeg .seg-btn', rootEl).forEach(b2 => {
      if (b2.dataset.v === 'focus') b2.textContent = '专注 ' + fmtMin(f);
      if (b2.dataset.v === 'break') b2.textContent = '休息 ' + fmtMin(b);
    });
    $('#pzCustom', rootEl).hidden = true;
    setMode(mode); /* 按新时长重置当前模式 */
    LB.toast('已应用自定义时长', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>番茄钟专注</h1><p>专注 / 休息循环计时，圆环进度可视化，今日番茄数统计</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="pzSeg">' +
      '<button class="seg-btn on" data-v="focus" type="button">专注 25 分</button>' +
      '<button class="seg-btn" data-v="break" type="button">休息 5 分</button>' +
      '<button class="seg-btn" data-v="custom" type="button">⚙ 自定义</button>' +
      '</div>' +
      '<div class="card pz-wrap">' +
      '<div class="pz-dial">' +
      '<svg viewBox="0 0 260 260" role="img" aria-label="番茄钟圆环进度">' +
      '<defs><linearGradient id="pzGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop class="pz-s1" offset="0"/><stop class="pz-s2" offset="1"/>' +
      '</linearGradient></defs>' +
      '<circle class="pz-ring-bg" cx="130" cy="130" r="118" stroke-width="12"/>' +
      '<circle class="pz-ring-fg" id="pzFg" cx="130" cy="130" r="118" stroke-width="12" stroke-linecap="round" stroke="url(#pzGrad)" transform="rotate(-90 130 130)"/>' +
      '</svg>' +
      '<div class="pz-center"><div class="pz-time" id="pzTime">25:00</div><div class="pz-state" id="pzState">准备开始</div></div>' +
      '</div>' +
      '<div class="pz-btns">' +
      '<button class="btn btn-main js-primary-submit" id="pzGo" type="button">▶ 开始专注</button>' +
      '<button class="btn btn-ghost" id="pzReset" type="button">↺ 重置</button>' +
      '</div>' +
      '<div class="pz-stat" id="pzStat"></div>' +
      '</div>' +
      '<div class="card pz-custom" id="pzCustom" hidden>' +
      '<span class="tool-lab">自定义时长（分钟，0.1 ~ 180）</span>' +
      '<div class="pz-custom-row">' +
      '<label class="pz-lab">专注<input class="inp" id="pzFocusMin" type="number" min="0.1" max="180" step="0.1" value="25" /></label>' +
      '<label class="pz-lab">休息<input class="inp" id="pzBreakMin" type="number" min="0.1" max="180" step="0.1" value="5" /></label>' +
      '<button class="btn btn-main btn-sm" id="pzApply" type="button">应用</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">基于时间戳计时，切后台 / 锁屏回来不漂移；完成自动切换专注 ⇄ 休息并响铃三声；今日统计保存在本设备浏览器中。</p>' +
      NOISE_HINT +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    origTitle = document.title;
    root.innerHTML = html();

    custom = LB.storage.get(KEY_CUSTOM, DEF);
    if (!custom || !(custom.focusMin > 0) || !(custom.breakMin > 0)) custom = { focusMin: 25, breakMin: 5 };
    $$('#pzSeg .seg-btn', root).forEach(b => {
      if (b.dataset.v === 'focus') b.textContent = '专注 ' + fmtMin(custom.focusMin);
      if (b.dataset.v === 'break') b.textContent = '休息 ' + fmtMin(custom.breakMin);
    });
    $('#pzFocusMin', root).value = custom.focusMin;
    $('#pzBreakMin', root).value = custom.breakMin;

    mode = 'focus';
    total = Math.max(6, Math.round(custom.focusMin * 60));
    remain = total;
    renderState();
    renderTime();
    renderStat();

    $('#pzGo', root).addEventListener('click', () => { running ? pause() : start(); });
    $('#pzReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, reset));
    $('#pzSeg', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      if (b.dataset.v === 'custom') { const p = $('#pzCustom', root); p.hidden = !p.hidden; return; }
      setMode(b.dataset.v);
    });
    $('#pzApply', root).addEventListener('click', applyCustom);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    stopTimer(); /* 清定时器 + 恢复原标题，切页后不得继续跑 */
    /* Step 13 · B4：背景音已交给白噪音工具，这里只关自己的完成提示音 AudioContext。
       AudioContext 不关会一直持有系统音频资源。 */
    if (actx) { try { actx.close(); } catch (_) {} actx = null; }
    rootEl = null;
  }

  LB.router.register('pomo', { mount, unmount });
})();
