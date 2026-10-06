/* LiteBox v5 · tools/acut.js — 音频工具
   tab 1 剪辑：波形可视化选区，截取片段导出 16-bit PCM WAV（纯本地，无需 FFmpeg）
   tab 2 转码：FFmpeg.wasm（Step 16 · A1）—— MP3 / WAV / AAC / FLAC / OGG
   ★ Step 16：原文件没有 .tool-head（连返回按钮都没有），本轮一并补上。
   ★ 编码选项里 H.265/VP9 那类不可用项与音频无关；音频实测 libmp3lame / pcm_s16le /
     aac / flac / libvorbis 全部可用（见 tools/ffmpeg-common.js 顶部注释）。 */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;
  let tab = 'cut';

  /* ---------- tab1 剪辑状态 ---------- */
  let audioBuffer = null; /* 解码后的完整音频 */
  let playCtx = null;     /* 试听 AudioContext */
  let playSrc = null;     /* 试听 BufferSource */
  let decCtx = null;      /* 解码用 AudioContext（decode 后立即关闭） */
  let fileName = '';      /* 当前加载的文件名 */

  /* ---------- tab2 转码状态 ---------- */
  let trFile = null;
  let trOutBlob = null;
  let trOutURL = null;
  let busy = false;

  const A_FMTS = {
    mp3:  { label: 'MP3',       mime: 'audio/mpeg', ext: 'mp3',  lossy: true,  args: b => ['-c:a', 'libmp3lame', '-b:a', b] },
    wav:  { label: 'WAV',       mime: 'audio/wav',  ext: 'wav',  lossy: false, args: () => ['-c:a', 'pcm_s16le'] },
    m4a:  { label: 'AAC（.m4a）', mime: 'audio/mp4',  ext: 'm4a',  lossy: true,  args: b => ['-c:a', 'aac', '-b:a', b] },
    flac: { label: 'FLAC',      mime: 'audio/flac', ext: 'flac', lossy: false, args: () => ['-c:a', 'flac'] },
    ogg:  { label: 'OGG',       mime: 'audio/ogg',  ext: 'ogg',  lossy: true,  args: b => ['-c:a', 'libvorbis', '-b:a', b] }
  };

  /* 窗口宽度变化：debounce 200ms 重绘波形 */
  const onResize = LB.dom.debounce(() => drawWave(), 200);

  /* —— 16-bit PCM WAV 编码（任务给定核心算法） —— */
  function wavEncode(buffer) {
    const nCh = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const bytes = 44 + len * nCh * 2;
    const ab = new ArrayBuffer(bytes);
    const dv = new DataView(ab);

    const ws = (offset, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i)); };

    ws(0, 'RIFF');
    dv.setUint32(4, bytes - 8, true);
    ws(8, 'WAVE');
    ws(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, nCh, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * nCh * 2, true);
    dv.setUint16(32, nCh * 2, true);
    dv.setUint16(34, 16, true);
    ws(36, 'data');
    dv.setUint32(40, len * nCh * 2, true);

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
          '<div>已加载 <b>' + LB.dom.esc(fileName) + '</b> · 点击或拖拽可更换文件</div>' +
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
      input.value = '';
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

  /* ================= tab2 · 音频转码（FFmpeg.wasm） ================= */

  function aFmt() { return A_FMTS[$('#acFmt', rootEl).value] || A_FMTS.mp3; }

  /* 无损格式（WAV / FLAC）没有码率概念，选到就禁用码率下拉 */
  function syncBitrate() {
    const lossy = aFmt().lossy;
    const sel = $('#acBr', rootEl);
    sel.disabled = !lossy;
    const hint = $('#acBrHint', rootEl);
    if (hint) hint.hidden = lossy;
  }

  async function transcode() {
    if (busy || !alive || !rootEl) return;
    if (!trFile) { LB.toast('请先载入音频', 'err'); return; }
    const F = aFmt();
    const brVal = $('#acBr', rootEl).value;       /* '128' / '192' / '320' */
    const bitrate = brVal + 'k';                  /* ffmpeg 的 -b:a 参数 */
    const stat = $('#acTrStat', rootEl);
    const btn = $('#acTrGo', rootEl);
    const prog = $('#acTrProg', rootEl);
    const fill = $('#acTrFill', rootEl);
    busy = true;
    btn.disabled = true;
    prog.hidden = false;
    fill.style.width = '0%';
    stat.textContent = '准备中…';
    try {
      const ext = (trFile.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const blob = await LB.ffmpeg.run({
        file: trFile,
        inputName: 'in.' + ext,
        args: F.args(bitrate).concat(['out.' + F.ext]),
        outName: 'out.' + F.ext,
        mime: F.mime,
        onStage: s => { stat.textContent = LB.ffmpeg.stageText(s); },
        onProgress: p => {
          fill.style.width = (p * 100).toFixed(0) + '%';
          stat.textContent = '⏳ 转码中 ' + (p * 100).toFixed(0) + '%';
        }
      });
      if (!alive) return;
      trOutBlob = blob;
      if (trOutURL) { URL.revokeObjectURL(trOutURL); trOutURL = null; }
      trOutURL = URL.createObjectURL(blob);
      const out = $('#acTrOut', rootEl);
      out.src = trOutURL;
      out.hidden = false;
      $('#acTrDl', rootEl).hidden = false;
      fill.style.width = '100%';
      stat.textContent = '✅ 转码完成 · ' + F.label + ' · ' + LB.dom.fmtSize(blob.size) +
        (F.lossy ? ' · ' + brVal + ' kbps' : ' · 无损');
      LB.toast('转码完成', 'ok');
    } catch (e) {
      stat.textContent = '⚠️ ' + ((e && e.message) || '转码失败');
      LB.toast('转码失败：' + ((e && e.message) || '未知错误'), 'err');
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  function loadTrFile(file) {
    if (!alive || !rootEl) return;
    if (!/^audio\//.test(file.type || '') && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|wma|aiff?)$/i.test(file.name || '')) {
      LB.toast('请选择音频文件', 'warn');
      return;
    }
    trFile = file;
    trOutBlob = null;
    $('#acTrCtl', rootEl).hidden = false;
    $('#acTrOut', rootEl).hidden = true;
    $('#acTrDl', rootEl).hidden = true;
    $('#acTrProg', rootEl).hidden = true;
    $('#acTrStat', rootEl).textContent = '已载入：' + file.name + '（' + LB.dom.fmtSize(file.size) + '），选择格式后点「开始转码」';
    LB.toast('音频已载入', 'ok');
  }

  /* ================= 视图 ================= */

  function setTab(t) {
    tab = t;
    if (!rootEl) return;
    [['cut', '#acCutBox'], ['tr', '#acTrBox']].forEach(([k, sel]) => {
      const el = $(sel, rootEl);
      if (el) el.hidden = k !== t;
    });
    const tabs = rootEl.querySelectorAll('#acTabs .ac-tab');
    for (let i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === t);
    if (t === 'cut') setTimeout(drawWave, 30);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>音频剪辑转码</h1><p>波形选区剪切导出 WAV，或用 FFmpeg 转成 MP3 / WAV / AAC / FLAC / OGG</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2" id="acTabs">' +
      '<button class="ac-tab on" data-tab="cut" type="button">✂️ 剪辑</button>' +
      '<button class="ac-tab" data-tab="tr" type="button">🔄 转码</button>' +
      '</div>' +

      /* —— tab1 剪辑 —— */
      '<div id="acCutBox">' +
      '<div class="card">' +
      '<div class="dropzone ac-drop" id="acDrop">' +
      '<div class="ac-dz-ic">🎵</div>' +
      '<div>点击或拖拽音频文件到这里</div>' +
      '<small>支持 MP3 / WAV / M4A / OGG 等常见格式，文件仅在本机处理</small>' +
      '</div>' +
      '<input type="file" id="acFile" accept="audio/*" hidden>' +
      '<div class="ac-status" id="acStatus"></div>' +
      '<div id="acWork" hidden>' +
      '<canvas id="acWave" class="ac-wave" height="120"></canvas>' +
      '<div class="ac-row">' +
      '<label class="ac-field">开始（秒）<input type="number" id="acA" step="0.1" min="0"></label>' +
      '<label class="ac-field">结束（秒）<input type="number" id="acB" step="0.1" min="0"></label>' +
      '<button class="btn btn-ghost" id="acPlay" type="button">▶ 试听选区</button>' +
      '<button class="btn btn-ghost" id="acStopP" type="button" hidden>⏹ 停止</button>' +
      '<button class="btn btn-main" id="acCut" type="button">✂️ 剪切并导出 WAV</button>' +
      '</div>' +
      '<p class="ac-info" id="acInfo"></p>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* —— tab2 转码 —— */
      '<div id="acTrBox" hidden>' +
      '<div class="card">' +
      '<div class="dropzone ac-drop" id="acTrDrop">' +
      '<div class="ac-dz-ic">🔄</div>' +
      '<div>点击或拖拽要转码的音频</div>' +
      '<small>转码由 FFmpeg.wasm 在本机完成，首次使用需加载约 32MB 核心</small>' +
      '</div>' +
      '<input type="file" id="acTrFile" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" hidden>' +
      '<div id="acTrCtl" hidden>' +
      '<div class="vc-form">' +
      '<label class="pz-lab">输出格式<select class="inp" id="acFmt">' +
      Object.keys(A_FMTS).map(k => '<option value="' + k + '">' + A_FMTS[k].label + '</option>').join('') +
      '</select></label>' +
      '<label class="pz-lab">码率<select class="inp" id="acBr">' +
      '<option value="128">128 kbps</option>' +
      '<option value="192" selected>192 kbps</option>' +
      '<option value="320">320 kbps</option>' +
      '</select></label>' +
      '</div>' +
      '<p class="cd-note" id="acBrHint" hidden>WAV / FLAC 是无损格式，码率固定，不参与设置。</p>' +
      '<button class="btn btn-main" id="acTrGo" type="button">🔄 开始转码</button>' +
      '<div class="vc-prog" id="acTrProg" hidden><div class="vc-fill" id="acTrFill"></div></div>' +
      '<div class="vc-stat" id="acTrStat">载入音频后即可开始转码。</div>' +
      '<audio controls id="acTrOut" class="ac-out" hidden></audio>' +
      '<div class="vc-dl"><button class="btn btn-main" id="acTrDl" type="button" hidden>⬇️ 下载文件</button></div>' +
      '</div>' +
      '</div>' +
      '<p class="vc-note">转码使用 FFmpeg.wasm（约 32MB 核心，首次点「开始转码」时才下载，之后浏览器会缓存）。码率只对 MP3 / AAC / OGG 这类有损格式生效。</p>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    $('#acTabs', root).addEventListener('click', e => {
      const b = e.target.closest('.ac-tab');
      if (b) setTab(b.getAttribute('data-tab'));
    });

    /* —— tab1 —— */
    bindAudioDrop();
    $('#acA', root).addEventListener('input', syncSel);
    $('#acB', root).addEventListener('input', syncSel);
    $('#acPlay', root).addEventListener('click', playSel);
    $('#acStopP', root).addEventListener('click', stopPlay);
    $('#acCut', root).addEventListener('click', exportClip);

    /* —— tab2 —— */
    syncBitrate();
    const trDrop = $('#acTrDrop', root);
    const trInput = $('#acTrFile', root);
    const onOver = e => { e.preventDefault(); trDrop.classList.add('drag'); };
    trDrop.addEventListener('click', () => trInput.click());
    trInput.addEventListener('change', () => {
      const f = trInput.files && trInput.files[0];
      trInput.value = '';
      if (f) loadTrFile(f);
    });
    trDrop.addEventListener('dragover', onOver);
    trDrop.addEventListener('dragenter', onOver);
    trDrop.addEventListener('dragleave', () => trDrop.classList.remove('drag'));
    trDrop.addEventListener('drop', e => {
      e.preventDefault();
      trDrop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadTrFile(f);
    });
    $('#acFmt', root).addEventListener('change', syncBitrate);
    $('#acTrGo', root).addEventListener('click', transcode);
    $('#acTrDl', root).addEventListener('click', () => {
      if (!trOutBlob) return;
      const F = aFmt();
      const base = (trFile && trFile.name ? trFile.name.replace(/\.[^.]+$/, '') : 'litebox') + '.' + F.ext;
      LB.img.download(trOutBlob, base);
    });

    window.addEventListener('resize', onResize);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    alive = false;
    busy = false;
    window.removeEventListener('resize', onResize);
    stopPlay();
    if (decCtx) {
      decCtx.close().catch(() => {});
      decCtx = null;
    }
    const ov = rootEl && $('#acTrOut', rootEl);
    if (ov) ov.removeAttribute('src');
    if (trOutURL) { URL.revokeObjectURL(trOutURL); trOutURL = null; }
    audioBuffer = null;
    trOutBlob = null;
    trFile = null;
    rootEl = null;
  }

  LB.router.register('acut', { mount, unmount });
})();
