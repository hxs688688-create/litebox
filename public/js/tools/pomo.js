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

  /* ============ Step 6F：白噪音 ============
     全部用 Web Audio 实时合成，不加载任何音频文件 ——
     这样离线可用、零体积，也不会有版权/加载失败问题。
     声音是「一次性生成 2 秒 buffer + loop 播放」，
     不是每帧重算：CPU 占用恒定，长时间专注也不会烧 CPU。 */
  let noiseSrc = null;      /* 当前正在播的 BufferSource */
  let noiseGain = null;     /* 音量节点 */
  let noiseType = '';       /* 当前音效 key，空串 = 无声*/
  const KEY_SOUND = 'litebox_pomo_sound';
  const KEY_AUTOPLAY = 'litebox_pomo_autoplay';

  const SOUNDS = {
    rain:  { name: '🌧 雨声' },
    ocean: { name: '🌊 海浪' },
    white: { name: '⚪ 白噪音' },
    pink:  { name: '🩷 粉噪音' }
  };

  /* 合成 2 秒循环 buffer。kind 决定波形算法。
     2 秒是折中：太短循环时能听出接缝，太长生成慢、白占内存。 */
  function buildNoiseBuffer(ctx, kind) {
    const sr = ctx.sampleRate;
    const len = 2 * sr;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);

    if (kind === 'white') {
      /* 白噪音：纯随机，能量在各频率上均匀分布 */
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      /* 粉噪音：1/f 谱，能量随频率下降，听感更柔和、不刺耳。
         用Paul Kellet 的经典 7 阶滤波器近似（-3dB/octave），
         比直接白噪更接近真实的雨声底噪。 */
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (kind === 'rain') {
      /* 雨声：白噪 + 稀疏脉冲（雨滴），
         再经低通滤掉高频「沙」感，让它听起来像连绵的雨。 */
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.35;
        if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.9;
      }
    } else if (kind === 'ocean') {
      /* 海浪：白噪 × 慢速包络（0.15Hz 一涨一落）。
         循环无缝的关键：包络周期必须整除 buffer 长度，
         这里用 len/sr 反推周期数，保证接缝处相位连续。 */
      const waves = 3;                       /* 2 秒内 3 个浪头 */
      for (let i = 0; i < len; i++) {
        const phase = (i / len) * waves * Math.PI * 2;
        /* 0.5+0.5sin → 0~1，再用 sin 塑形出「涨潮感」而不是机械的方波 */
        const env = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
        d[i] = (Math.random() * 2 - 1) * env * 0.75;
      }
    }
    return buf;
  }

  function stopNoise() {
    if (noiseSrc) {
      try { noiseSrc.stop(0); } catch (_) { /* 已停止的节点再 stop 会抛，忽略 */ }
      try { noiseSrc.disconnect(); } catch (_) {}
      noiseSrc = null;
    }
    if (noiseGain) { try { noiseGain.disconnect(); } catch (_) {} noiseGain = null; }
    noiseType = '';
  }

  function setSound(kind) {
    /* 同一个声音重复点击不重启 —— 免得每次都「咔」一声 */
    if (kind === noiseType) return;
    stopNoise();
    if (!kind || !SOUNDS[kind]) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { LB.toast('当前浏览器不支持 Web Audio', 'err'); return; }
      /* 复用 pomo 已有的 actx（响铃也在用），不重复创建 */
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();

      const src = actx.createBufferSource();
      src.buffer = buildNoiseBuffer(actx, kind);
      src.loop = true;

      const gain = actx.createGain();
      gain.gain.value = 0.25;

      let node = src;
      if (kind === 'rain') {
        /* 雨声加低通，把白噪的刺耳高频压掉 */
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2000;
        src.connect(lp);
        node = lp;
      }
      node.connect(gain).connect(actx.destination);
      src.start(0);
      noiseSrc = src; noiseGain = gain; noiseType = kind;
    } catch (e) {
      noiseSrc = null; noiseGain = null; noiseType = '';
      LB.toast('音效启动失败：' + (e && e.message ? e.message : '未知错误'), 'err');
    }
  }

  function autoplayOn() {
    return $('#pzAutoPlay', rootEl) ? $('#pzAutoPlay', rootEl).checked : true;
  }

  /* 试听定时器句柄：未开始专注时点声音只试听 2.5 秒。
     必须留句柄在 unmount 里清掉 —— 否则离开页面后这个回调仍会执行 setSound('')，     那时 actx 已被close，重新访问页面会报「AudioContext 已关闭」的错。 */
  let previewTimer = null;

  /* 专注开始/暂停时的联动入口 */
  function syncSound() {
    const want = $('#pzSound', rootEl).value;
    if (running && mode === 'focus' && autoplayOn()) setSound(want);
    else setSound('');
  }

  function renderSoundUi() {
    const sel = $('#pzSound', rootEl);
    if (!sel) return;
    const cur = LB.storage.get(KEY_SOUND, '');
    sel.value = SOUNDS[cur] ? cur : '';
    const ap = $('#pzAutoPlay', rootEl);
    if (ap) ap.checked = LB.storage.get(KEY_AUTOPLAY, true) !== false;
    setSound(running && mode === 'focus' && ap.checked ? sel.value : '');
  }

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
    setSound('');         /* Step 6F：切模式必须停音，否则休息时还响着雨声很吵 */
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
    syncSound();          /* Step 6F：专注开始 → 按设置起播背景音 */
    renderState();
    renderTime();
  }

  function pause() {
    remain = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    stopTimer();
    syncSound();          /* Step 6F：暂停 → 停止背景音 */
    renderState();
    renderTime();
  }

  function reset() {
    remain = total;
    stopTimer();
    setSound('');         /* Step 6F：重置一律静音 */
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
      '<div class="card pz-sound">' +
      '<span class="tool-lab">背景音（Web Audio 实时合成 · 离线可用）</span>' +
      '<div class="pz-sound-row">' +
      '<select class="inp" id="pzSound" aria-label="背景音">' +
      '<option value="">无</option>' +
      '<option value="rain">🌧 雨声</option>' +
      '<option value="ocean">🌊 海浪</option>' +
      '<option value="white">⚪ 白噪音</option>' +
      '<option value="pink">🩷 粉噪音</option>' +
      '</select>' +
      '<label class="chk-row pz-auto"><input type="checkbox" id="pzAutoPlay" checked> 专注时自动播放</label>' +
      '</div>' +
      '<p class="cd-note" id="pzSoundHint">声音由浏览器实时合成，不加载任何音频文件；暂停 / 休息 / 切走页面会自动停止。</p>' +
      '</div>' +
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
    /* Step 6F：背景音选择 */
    renderSoundUi();
    $('#pzSound', root).addEventListener('change', e => {
      LB.storage.set(KEY_SOUND, e.target.value);
      syncSound();
      /* 立即试听：未开始专注时也能听到效果，方便挑声音 */
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
      if (!running && e.target.value) {
        setSound(e.target.value);
        previewTimer = setTimeout(() => {
          previewTimer = null;
          if (!running) setSound('');   /* 已离开页面则 unmount 已清空 actx，这里不再动 */
        }, 2500);
      }
    });
    $('#pzAutoPlay', root).addEventListener('change', e => {
      LB.storage.set(KEY_AUTOPLAY, e.target.checked);
      syncSound();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    stopTimer(); /* 清定时器 + 恢复原标题，切页后不得继续跑 */
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    /* Step 6F：必须停音并关掉 AudioContext ——
       离开页面后声音还在放是最容易被用户当成 bug 的问题。
       定时器只是停止轮询，AudioContext 不关会一直持有系统音频资源。 */
    stopNoise();
    if (actx) { try { actx.close(); } catch (_) {} actx = null; }
    rootEl = null;
  }

  LB.router.register('pomo', { mount, unmount });
})();
