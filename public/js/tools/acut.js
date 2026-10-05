/* LiteBox v5 · tools/acut.js — 音频剪辑（波形可视化选区，截取片段导出 16-bit PCM WAV） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let audioBuffer = null; /* 解码后的完整音频 */
  let playCtx = null;     /* 试听 AudioContext */
  let playSrc = null;     /* 试听 BufferSource */
  let decCtx = null;      /* 解码用 AudioContext（decode 后立即关闭） */
  let fileName = '';      /* 当前加载的文件名 */

  /* 窗口宽度变化：debounce 200ms 重绘波形 */
  const onResize = LB.dom.debounce(() => drawWave(), 200);

  /* —— 16-bit PCM WAV 编码（任务给定核心算法） —— */
  function wavEncode(buffer) {
    const nCh = buffer.numberOfChannels;   /* 通常 1 或 2 */
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const bytes = 44 + len * nCh * 2;
    const ab = new ArrayBuffer(bytes);
    const dv = new DataView(ab);

    /* 写 ASCII 字符串 */
    const ws = (offset, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i)); };

    /* RIFF header */
    ws(0, 'RIFF');
    dv.setUint32(4, bytes - 8, true);
    ws(8, 'WAVE');

    /* fmt chunk */
    ws(12, 'fmt ');
    dv.setUint32(16, 16, true);           /* chunk size */
    dv.setUint16(20, 1, true);            /* audio format (1 = PCM) */
    dv.setUint16(22, nCh, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * nCh * 2, true); /* byte rate */
    dv.setUint16(32, nCh * 2, true);      /* block align */
    dv.setUint16(34, 16, true);           /* bits per sample */

    /* data chunk */
    ws(36, 'data');
    dv.setUint32(40, len * nCh * 2, true);

    /* 交错写入样本 */
    const chs = [];
    for (let c = 0; c < nCh; c++) chs.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        const s = Math.max(-1, Math.min(1, chs[c][i]));
        dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  /* —— 波形绘制（品牌色 / 选区高亮色均从 tokens 变量读取） —— */
  function drawWave() {
    if (!alive || !rootEl || !audioBuffer) return;
    const c = $('#acWave', rootEl);
    if (!c) return;
    c.width = c.clientWidth || 640;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const d = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / c.width));
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--brand1').trim();
    for (let i = 0; i < c.width; i++) {
      let mn = 1, mx = -1;
      for (let j = 0; j < step; j += 8) {
        const s = d[i * step + j] || 0;
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      const y1 = (1 + mn) * c.height / 2;
      const y2 = (1 + mx) * c.height / 2;
      ctx.fillRect(i, y1, 1, Math.max(1.5, y2 - y1));
    }
    /* 高亮选区 */
    const a = +$('#acA', rootEl).value || 0;
    const b = +$('#acB', rootEl).value || audioBuffer.duration;
    ctx.fillStyle = css.getPropertyValue('--ac-hl').trim();
    const x1 = a / audioBuffer.duration * c.width;
    const w = (b - a) / audioBuffer.duration * c.width;
    ctx.fillRect(x1, 0, Math.max(2, w), c.height);
  }

  /* —— 加载音频文件：解码 → 显示波形与选区 —— */
  function loadFile(file) {
    if (!alive || !rootEl) return;
    fileName = file.name || 'audio';
    const status = $('#acStatus', rootEl);
    status.textContent = '解码中…';
    file.arrayBuffer()
      .then(ab => {
        decCtx = new (window.AudioContext || window.webkitAudioContext)();
        const p = decCtx.decodeAudioData(ab);
        return p.finally ? p.finally(() => { if (decCtx) { decCtx.close().catch(() => {}); decCtx = null; } }) : p;
      })
      .then(buf => {
        if (!alive) return;
        audioBuffer = buf;
        $('#acA', rootEl).value = '0';
        $('#acB', rootEl).value = buf.duration.toFixed(1);
        $('#acWork', rootEl).hidden = false;
        const dz = $('#acDrop', rootEl);
        dz.innerHTML =
          '<div class="ac-dz-ic">🎵</div>' +
          '<div>已加载 <b>' + fileName + '</b> · 点击或拖拽可更换文件</div>' +
          '<small>支持 MP3 / WAV / M4A / OGG 等常见格式</small>';
        status.textContent = '';
        syncInfo();
        drawWave();
      })
      .catch(() => {
        if (!alive) return;
        status.textContent = '';
        LB.toast('音频解码失败，请换格式试试', 'err');
      });
  }

  /* —— 上传区：点击 / 拖拽（音频版，不挑图片） —— */
  function bindAudioDrop() {
    const zone = $('#acDrop', rootEl);
    const input = $('#acFile', rootEl);
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = ''; /* 允许再次选择同一文件 */
      if (f) loadFile(f);
    });
    const onOver = e => { e.preventDefault(); zone.classList.add('drag'); };
    zone.addEventListener('dragover', onOver);
    zone.addEventListener('dragenter', onOver);
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
  }

  function selRange() {
    const dur = audioBuffer.duration;
    const a = Math.max(0, +$('#acA', rootEl).value || 0);
    const bRaw = +$('#acB', rootEl).value;
    const b = bRaw > 0 ? Math.min(bRaw, dur) : dur;
    return { a: a, b: b };
  }

  function syncInfo() {
    if (!alive || !rootEl || !audioBuffer) return;
    const r = selRange();
    $('#acInfo', rootEl).textContent =
      '时长 ' + audioBuffer.duration.toFixed(1) + ' 秒 · 当前选区 ' + Math.max(0, r.b - r.a).toFixed(1) +
      ' 秒 · 导出为 16-bit PCM WAV';
  }

  /* 输入同步：改 A / B → 更新选区文字 + 重绘高亮（只绘制，不重算） */
  function syncSel() {
    syncInfo();
    drawWave();
  }

  /* —— 试听选区 —— */
  function playSel() {
    if (!alive || !rootEl || !audioBuffer) return;
    stopPlay();
    const r = selRange();
    if (r.b <= r.a) { LB.toast('选区无效：结束需大于开始', 'err'); return; }
    playCtx = new (window.AudioContext || window.webkitAudioContext)();
    playSrc = playCtx.createBufferSource();
    playSrc.buffer = audioBuffer;
    playSrc.connect(playCtx.destination);
    playSrc.onended = () => { if (alive && rootEl) $('#acStopP', rootEl).hidden = true; };
    playSrc.start(0, r.a, r.b - r.a);
    $('#acStopP', rootEl).hidden = false;
  }

  function stopPlay() {
    if (playSrc) {
      playSrc.onended = null;
      try { playSrc.stop(); } catch (_) { /* 已停止 */ }
      playSrc = null;
    }
    if (playCtx) {
      playCtx.close().catch(() => {});
      playCtx = null;
    }
    if (alive && rootEl) $('#acStopP', rootEl).hidden = true;
  }

  /* —— 剪切并导出 WAV（任务给定逻辑） —— */
  function exportClip() {
    if (!alive || !rootEl || !audioBuffer) return;
    const sr = audioBuffer.sampleRate;
    const a = Math.max(0, Math.floor((+$('#acA', rootEl).value || 0) * sr));
    const b = Math.min(audioBuffer.length, Math.ceil((+$('#acB', rootEl).value || audioBuffer.duration) * sr));
    if (b <= a) { LB.toast('选区无效：结束需大于开始', 'err'); return; }
    const nCh = audioBuffer.numberOfChannels;
    const tmp = new (window.AudioContext || window.webkitAudioContext)();
    const out = tmp.createBuffer(nCh, b - a, sr);
    for (let c = 0; c < nCh; c++) {
      out.getChannelData(c).set(audioBuffer.getChannelData(c).subarray(a, b));
    }
    tmp.close().catch(() => {});
    LB.img.download(wavEncode(out), 'litebox_clip.wav');
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card">' +
      '  <div class="dropzone ac-drop" id="acDrop">' +
      '    <div class="ac-dz-ic">🎵</div>' +
      '    <div>点击或拖拽音频文件到这里</div>' +
      '    <small>支持 MP3 / WAV / M4A / OGG 等常见格式，文件仅在本机处理</small>' +
      '  </div>' +
      '  <input type="file" id="acFile" accept="audio/*" hidden>' +
      '  <div class="ac-status" id="acStatus"></div>' +
      '  <div id="acWork" hidden>' +
      '    <canvas id="acWave" class="ac-wave" height="120"></canvas>' +
      '    <div class="ac-row">' +
      '      <label class="ac-field">开始（秒）<input type="number" id="acA" step="0.1" min="0"></label>' +
      '      <label class="ac-field">结束（秒）<input type="number" id="acB" step="0.1" min="0"></label>' +
      '      <button class="btn btn-ghost" id="acPlay">▶ 试听选区</button>' +
      '      <button class="btn btn-ghost" id="acStopP" hidden>⏹ 停止</button>' +
      '      <button class="btn btn-main" id="acCut">✂️ 剪切并导出 WAV</button>' +
      '    </div>' +
      '    <p class="ac-info" id="acInfo"></p>' +
      '  </div>' +
      '</div>';
    bindAudioDrop();
    $('#acA', root).addEventListener('input', syncSel);
    $('#acB', root).addEventListener('input', syncSel);
    $('#acPlay', root).addEventListener('click', playSel);
    $('#acStopP', root).addEventListener('click', stopPlay);
    $('#acCut', root).addEventListener('click', exportClip);
    window.addEventListener('resize', onResize);
  }

  function unmount() {
    alive = false;
    window.removeEventListener('resize', onResize);
    stopPlay();
    if (decCtx) {
      decCtx.close().catch(() => {});
      decCtx = null;
    }
    audioBuffer = null;
    /* 本模块不持有持久 blob URL（下载由 LB.img.download 延迟 3 秒自释放） */
    rootEl = null;
  }

  LB.router.register('acut', { mount, unmount });
})();
