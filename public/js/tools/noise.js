/* LiteBox v5 · tools/noise.js — 白噪音（独立工具，Step 13 · B4）
 *
 * 【为什么要从番茄钟里拆出来】
 *   Step 6F 把背景音塞在番茄钟里，只能用那四种合成音，也没法单独当助眠用。
 *   拆成独立工具后：番茄钟专注、睡前刷手机、图书馆学习都能单独打开它。
 *
 * 【音源策略：CDN 主源 + Web Audio 合成降级】
 *   · 主源：vendor/dict/noise-sources.js 里的免费 CDN 音频（每条带 2 个备用镜像）。
 *   · 每条 url 加载失败（error / 超时）就顺 alt 重试，全部失败才降级合成。
 *   · 降级：Web Audio 现场合成 2 秒循环 buffer（雨=白噪+低通+随机脉冲、
 *     海浪=粉噪+慢包络、篝火=白噪+随机爆裂、鸟鸣=底噪+短促啁啾）。
 *   合成部分不加载任何文件，所以离线也能响 —— 番茄钟当年就是靠这个零体积方案。
 *
 * 【AudioContext 必须由用户手势创建】
 *   浏览器自动播放策略：非手势里 new AudioContext() 会得到 suspended 状态，
 *   听起来就是「点了没声音」。这里所有 play/start 都从 click 回调同步发起，
 *   并在 resume() 之后再 start，避免踩这个坑。
 *
 * 【定时器 / 音频资源必须全部收回】
 *   离开页面后还在响是最像 bug 的问题：unmount 里停 <audio>、停 BufferSource、
 *   关 AudioContext、清 sleep timer，四样一个都不能漏。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  const KEY_VOL = 'litebox_noise_vol';
  const KEY_TIMER = 'litebox_noise_timer';
  const KEY_HIST = 'litebox_noise_hist';
  const HIST_MAX = 12;
  const TIMERS = [15, 30, 60, 0]; /* 分钟，0 = 不限 */
  const URL_TIMEOUT = 6000;       /* 单个镜像 6 秒没出声就换下一个 */

  let rootEl = null;
  let sources = [];
  let current = null;      /* 正在播的音源对象 */
  let audioEl = null;      /* <audio> 元素 */
  let watchdog = null;     /* 当前镜像的超时句柄（切源 / 停止都必须清） */
  let actx = null;         /* 合成降级用的 AudioContext */
  let synthSrc = null;
  let synthGain = null;
  let volume = 60;         /* 0-100，UI 与存储都用整数 */
  let timerMin = 0;        /* 定时关闭分钟数，0 = 不限 */
  let sleepAt = 0;         /* 定时到点的时间戳 */
  let tickTimer = null;
  let hist = [];

  /* ================= 合成降级 ================= */

  /* 2 秒循环 buffer。太短循环有接缝，太长生成慢、白占内存，2 秒是折中。 */
  function buildBuffer(ctx, kind) {
    const sr = ctx.sampleRate;
    const len = 2 * sr;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);

    if (kind === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      /* Paul Kellet 7 阶滤波近似 1/f 谱，比白噪柔和不刺耳 */
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
      /* 雨声：白噪底 + 稀疏雨滴脉冲，再交给低通（见 startSynth）磨掉「沙」感 */
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.35;
        if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.9;
      }
    } else if (kind === 'ocean') {
      /* 海浪：噪声 × 慢包络。包络周期整除 buffer 长度，接缝处相位才连续 */
      const waves = 3;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(0.5 + 0.5 * Math.sin((i / len) * waves * Math.PI * 2), 1.6);
        d[i] = (Math.random() * 2 - 1) * env * 0.75;
      }
    } else if (kind === 'fire') {
      /* 篝火：低响度沙沙底 + 随机爆裂（几个采样点的短冲击） */
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.16;
      for (let k = 0; k < 90; k++) {
        const p = Math.floor(Math.random() * len);
        const amp = 0.4 + Math.random() * 0.5;
        const n = 12 + Math.floor(Math.random() * 60);
        for (let i = 0; i < n && p + i < len; i++) {
          d[p + i] = (Math.random() * 2 - 1) * amp * (1 - i / n);
        }
      }
    } else if (kind === 'birds') {
      /* 鸟鸣：远处底噪 + 若干短促上滑啁啾（正弦扫频，包络起振快、收尾慢） */
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.05;
      for (let k = 0; k < 14; k++) {
        const p = Math.floor(Math.random() * (len - sr / 4));
        const n = Math.floor(sr * (0.05 + Math.random() * 0.12));
        const f0 = 2200 + Math.random() * 1400;
        const rate = (Math.random() * 2 - 1) * 0.004;
        for (let i = 0; i < n && p + i < len; i++) {
          const t = i / sr;
          const env = Math.min(1, i / (n * 0.15)) * (1 - i / n);
          d[p + i] += Math.sin(2 * Math.PI * (f0 + rate * sr * t) * t) * env * 0.5;
        }
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    }
    return buf;
  }

  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  /* 合成一路循环音：kind 决定 buffer 算法，filter 决定音色走向 */
  function startSynth(kind) {
    const ctx = ensureCtx();
    if (!ctx) { LB.toast('当前浏览器不支持 Web Audio', 'err'); return false; }
    stopSynth();
    try {
      const src = ctx.createBufferSource();
      src.buffer = buildBuffer(ctx, kind);
      src.loop = true;

      const gain = ctx.createGain();
      gain.gain.value = volume / 100 * 0.4;

      let node = src;
      if (kind === 'rain' || kind === 'fire' || kind === 'birds') {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = kind === 'rain' ? 2000 : (kind === 'birds' ? 6500 : 3200);
        src.connect(lp);
        node = lp;
      } else if (kind === 'pink' || kind === 'ocean') {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 5200;
        src.connect(lp);
        node = lp;
      }
      node.connect(gain).connect(ctx.destination);
      src.start(0);
      synthSrc = src; synthGain = gain;
      return true;
    } catch (e) {
      synthSrc = null; synthGain = null;
      LB.toast('合成音启动失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      return false;
    }
  }

  function stopSynth() {
    if (synthSrc) {
      try { synthSrc.stop(0); } catch (_) { /* 已停止再 stop 会抛，忽略 */ }
      try { synthSrc.disconnect(); } catch (_) {}
      synthSrc = null;
    }
    if (synthGain) { try { synthGain.disconnect(); } catch (_) {} synthGain = null; }
  }

  /* ================= 播放 / 停止 ================= */

  function urlList(item) {
    const out = [];
    if (item.url) out.push(item.url);
    (item.alt || []).forEach(u => out.push(u));
    return out;
  }

  function clearWatchdog() {
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  }

  function stopAudioEl() {
    clearWatchdog();
    if (!audioEl) return;
    try { audioEl.pause(); } catch (_) {}
    audioEl.removeAttribute('src');
    try { audioEl.load(); } catch (_) { /* 清 src 后 load 触发取消，个别浏览器会抛 */ }
    audioEl = null;
  }

  /* 依次试每个镜像：onerror 或超时未真正出声就换下一个；全部失败回调 fail。
     用「是否进入 playing（已能出帧）」判定成功：网络不通时 error 往往迟迟不来，
     只靠 error 会让用户对着静音等十几秒。 */
  function playRemote(item, fail) {
    const urls = urlList(item);
    if (!urls.length) { fail(); return; }
    let idx = 0;
    let settled = false;

    function tryNext() {
      if (settled) return;
      clearWatchdog();
      if (idx >= urls.length) { settled = true; stopAudioEl(); fail(); return; }
      const url = urls[idx++];
      const a = new Audio();
      a.loop = item.loop !== false;
      a.preload = 'auto';
      a.volume = volume / 100;
      a.src = url;

      watchdog = setTimeout(() => {
        /* 还没真正出声（未在播放 / 缓冲区没数据）→ 判定这个镜像不可用 */
        if (settled || audioEl !== a) return;
        if (a.paused || a.readyState < 2) tryNext();
      }, URL_TIMEOUT);

      a.addEventListener('playing', () => {
        if (settled || audioEl !== a) return;
        settled = true;
        clearWatchdog();
        renderState();
      });
      a.addEventListener('error', () => {
        if (settled || audioEl !== a) return;
        tryNext();
      });
      audioEl = a;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 失败推进交给 watchdog / error，避免 unhandled rejection */ });
    }

    tryNext();
  }

  function play(item) {
    if (!item) return;
    stopAll();
    current = item;
    playRemote(item, () => {
      if (!rootEl || current !== item) return;
      /* CDN 全挂 → 合成降级，保证「点了就一定有声音」 */
      if (startSynth(item.synth || 'white')) {
        markFallback('网络音源暂时不可用，已切换为浏览器合成音');
        renderState();
      } else if (rootEl) {
        current = null;
        renderState();
      }
    });
    pushHist(item.id);
    renderState();
    startSleep();
  }

  function toggle(item) {
    if (current && current.id === item.id) { stopAll(); renderState(); return; }
    play(item);
  }

  function stopAll() {
    stopAudioEl();
    stopSynth();
    clearSleep();
  }

  /* 音量：CDN 走 audio.volume，合成走 gain.gain */
  function applyVolume() {
    if (audioEl) audioEl.volume = volume / 100;
    if (synthGain) synthGain.gain.value = volume / 100 * 0.4;
    const out = $('#nzVolV', rootEl);
    if (out) out.textContent = volume;
  }

  /* ================= 定时关闭 ================= */

  function clearSleep() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    sleepAt = 0;
    const el = $('#nzSleep', rootEl);
    if (el) el.textContent = '';
  }

  function startSleep() {
    clearSleep();
    if (!current || !timerMin) { renderState(); return; }
    sleepAt = Date.now() + timerMin * 60000;
    tickTimer = setInterval(() => {
      if (!rootEl) return;
      if (!current) { clearSleep(); return; }
      const left = sleepAt - Date.now();
      const el = $('#nzSleep', rootEl);
      if (left <= 0) {
        stopAll();
        current = null;
        renderState();
        LB.toast('定时到，已停止播放', 'info');
        return;
      }
      if (el) {
        const m = Math.floor(left / 60000);
        const s = Math.floor(left % 60000 / 1000);
        el.textContent = '⏻ ' + m + ':' + String(s).padStart(2, '0') + ' 后停止';
      }
    }, 1000);
    renderState();
  }

  function setTimer(min) {
    timerMin = min;
    LB.storage.set(KEY_TIMER, min);
    $$('#nzTimer .seg-btn', rootEl).forEach(b => b.classList.toggle('on', parseInt(b.dataset.m, 10) === min));
    if (current) startSleep(); else renderState();
  }

  /* ================= 播放历史 ================= */

  function pushHist(id) {
    hist.unshift({ id: id, t: Date.now() });
    /* 同一首连续重听只留最近一次，历史列表才有信息量 */
    for (let i = 1; i < hist.length; i++) {
      if (hist[i].id === id) { hist.splice(i, 1); i--; }
    }
    hist = hist.slice(0, HIST_MAX);
    LB.storage.set(KEY_HIST, hist);
    renderHist();
  }

  function srcById(id) {
    for (let i = 0; i < sources.length; i++) if (sources[i].id === id) return sources[i];
    return null;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderHist() {
    const box = $('#nzHist', rootEl);
    if (!box) return;
    if (!hist.length) {
      box.innerHTML = '<p class="cd-note nz-hist-empty">还没有播放记录，点上方任意音源试试。</p>';
      return;
    }
    box.innerHTML = hist.map(h => {
      const s = srcById(h.id);
      if (!s) return '';
      return '<button class="nz-hist-row" type="button" data-id="' + s.id + '">' +
        '<span class="nz-hist-ic">' + s.emoji + '</span>' +
        '<span class="nz-hist-name">' + s.name + '</span>' +
        '<span class="nz-hist-time">' + fmtTime(h.t) + '</span></button>';
    }).join('');
  }

  /* ================= 渲染 ================= */

  function markFallback(msg) {
    const el = $('#nzHint', rootEl);
    if (el) { el.textContent = '⚠ ' + msg; el.hidden = false; }
  }

  function renderState() {
    $$('#nzGrid .nz-card', rootEl).forEach(c => {
      const on = !!current && c.dataset.id === current.id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const name = $('#nzNow', rootEl);
    if (name) name.textContent = current ? current.emoji + ' ' + current.name : '未播放';
    if (!current) {
      const el = $('#nzHint', rootEl);
      if (el) { el.hidden = true; el.textContent = ''; }
      const sp = $('#nzSleep', rootEl);
      if (sp) sp.textContent = '';
    }
    const go = $('#nzStop', rootEl);
    if (go) go.disabled = !current;
  }

  function gridHTML() {
    return sources.map(s =>
      '<button class="nz-card" type="button" data-id="' + s.id + '" aria-pressed="false">' +
      '<span class="nz-ic">' + s.emoji + '</span>' +
      '<span class="nz-nm">' + s.name + '</span></button>'
    ).join('');
  }

  function html() {
    const seg = TIMERS.map(m =>
      '<button class="seg-btn' + (m === timerMin ? ' on' : '') + '" data-m="' + m + '" type="button">' +
      (m ? m + ' 分钟' : '不限') + '</button>'
    ).join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>白噪音</h1><p>雨声、海浪、篝火、咖啡馆等背景音，专注与助眠时循环播放</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="nz-now">' +
      '<span class="nz-now-label">正在播放</span>' +
      '<b class="nz-now-name" id="nzNow">未播放</b>' +
      '<span class="nz-sleep" id="nzSleep"></span>' +
      '</div>' +
      '<div class="nz-grid" id="nzGrid">' + gridHTML() + '</div>' +
      '<p class="cd-note nz-hint" id="nzHint" hidden></p>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">音量 <output id="nzVolV">' + volume + '</output></span>' +
      '<input class="nz-range" type="range" id="nzVol" min="0" max="100" step="1" value="' + volume + '" aria-label="音量">' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">定时关闭</span>' +
      '<div class="seg seg-4" id="nzTimer">' + seg + '</div>' +
      '<p class="cd-note">选定时长后到点自动停止；选「不限」则一直播到手动停止或离开本页。</p>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost js-primary-submit" id="nzStop" type="button" disabled>⏹ 停止播放</button>' +
      '<button class="btn btn-ghost" id="nzClearHist" type="button">↺ 清空记录</button>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">播放历史</span>' +
      '<div class="nz-hist" id="nzHist"></div>' +
      '</div>' +
      '<p class="cd-note">部分音源需要联网加载；网络不可用时会自动改用浏览器实时合成，因此离线也至少能听到一种背景音。离开本页会自动停止播放。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    volume = parseInt(LB.storage.get(KEY_VOL, 60), 10);
    if (!(volume >= 0 && volume <= 100)) volume = 60;
    timerMin = parseInt(LB.storage.get(KEY_TIMER, 0), 10);
    if (TIMERS.indexOf(timerMin) < 0) timerMin = 0;
    const h = LB.storage.get(KEY_HIST, []);
    hist = Array.isArray(h) ? h.filter(x => x && x.id && typeof x.t === 'number').slice(0, HIST_MAX) : [];

    root.innerHTML = html();
    applyVolume();
    renderHist();
    renderState();

    LB.dict.load('noiseSources')
      .then(list => {
        if (!rootEl) return;
        sources = Array.isArray(list) ? list : [];
        $('#nzGrid', rootEl).innerHTML = gridHTML();
        renderHist();
        renderState();
      })
      .catch(() => {
        if (!rootEl) return;
        $('#nzGrid', rootEl).innerHTML =
          '<p class="cd-note">音源列表加载失败，请刷新重试。</p>';
      });

    $('#nzGrid', root).addEventListener('click', e => {
      const c = e.target.closest('.nz-card');
      if (!c) return;
      const s = srcById(c.dataset.id);
      if (s) toggle(s);
    });
    $('#nzVol', root).addEventListener('input', e => {
      volume = parseInt(e.target.value, 10) || 0;
      LB.storage.set(KEY_VOL, volume);
      applyVolume();
    });
    $('#nzTimer', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTimer(parseInt(b.dataset.m, 10));
    });
    $('#nzStop', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => {
      stopAll();
      current = null;
      renderState();
      LB.toast('已停止播放', 'info');
    }));
    $('#nzClearHist', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => {
      hist = [];
      LB.storage.remove(KEY_HIST);
      renderHist();
      LB.toast('播放记录已清空', 'ok');
    }));
    $('#nzHist', root).addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      const s = srcById(b.dataset.id);
      if (s) play(s);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    stopAll();
    if (actx) { try { actx.close(); } catch (_) {} actx = null; }
    current = null;
    rootEl = null;
  }

  LB.router.register('noise', { mount, unmount });
})();
