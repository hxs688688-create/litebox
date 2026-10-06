/* LiteBox v5 · tools/vconv.js — 视频工具
   tab 1 压缩：canvas captureStream + MediaRecorder 边播边录，输出 WebM
   tab 2 转码：FFmpeg.wasm（Step 16 · A1）—— MP4 / MKV / MOV / AVI / WebM
   FFmpeg 核心 32MB 按需加载：只有真正点「开始转码」时才拉。
   ★ 编码选项里 H.265 / VP9 置灰：实测 H.265 在 wasm 下 45 秒跑不完 2 秒测试片、
     VP9 会把 worker 打崩（详见 tools/ffmpeg-common.js 顶部注释）。 */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;
  let tab = 'zip';

  /* ---------- tab1 压缩状态 ---------- */
  let vcURL = null;      /* 输入视频 blob URL */
  let outURL = null;     /* 输出 WebM blob URL */
  let outputBlob = null; /* 最近一次输出，供下载 */
  let rec = null;        /* MediaRecorder */
  let vcTimer = null;    /* 画帧 + 进度定时器 */

  /* ---------- tab2 转码状态 ---------- */
  let trFile = null;
  let trOutBlob = null;
  let trOutURL = null;
  let busy = false;

  /* 容器 → 可用的编码组合（只列实测可用的；不可用的单独置灰展示） */
  const FORMATS = {
    mp4: { label: 'MP4', mime: 'video/mp4', ext: 'mp4',
      v: [['libx264', 'H.264'], ['mpeg4', 'MPEG-4']],
      a: [['aac', 'AAC'], ['libmp3lame', 'MP3']] },
    mkv: { label: 'MKV', mime: 'video/x-matroska', ext: 'mkv',
      v: [['libx264', 'H.264'], ['libvpx', 'VP8']],
      a: [['aac', 'AAC'], ['libmp3lame', 'MP3'], ['libopus', 'Opus']] },
    mov: { label: 'MOV', mime: 'video/quicktime', ext: 'mov',
      v: [['libx264', 'H.264'], ['mpeg4', 'MPEG-4']],
      a: [['aac', 'AAC'], ['libmp3lame', 'MP3']] },
    avi: { label: 'AVI', mime: 'video/x-msvideo', ext: 'avi',
      v: [['mpeg4', 'MPEG-4']],
      a: [['libmp3lame', 'MP3'], ['pcm_s16le', 'PCM']] },
    webm: { label: 'WebM', mime: 'video/webm', ext: 'webm',
      v: [['libvpx', 'VP8']],
      a: [['libopus', 'Opus'], ['libvorbis', 'Vorbis']] }
  };

  /* 实测不可用的编码：保留在列表里但 disabled，让用户知道为什么没有 */
  const DISABLED_V = [['libx265', 'H.265'], ['libvpx-vp9', 'VP9']];

  const QUALITY = {
    low:  { name: '低（体积最小）', crf: 32, qv: 8, abr: '96k', vb: '0.6M' },
    mid:  { name: '中（推荐）',     crf: 28, qv: 5, abr: '128k', vb: '1.2M' },
    high: { name: '高（画质优先）', crf: 23, qv: 3, abr: '192k', vb: '2.5M' }
  };

  function fmtT(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }

  /* ================= tab1 · 压缩（原有逻辑） ================= */

  async function compress() {
    if (!alive || !rootEl) return;
    const v = $('#vcV', rootEl);
    const stat = $('#vcStat', rootEl);
    if (typeof MediaRecorder === 'undefined') {
      LB.toast('当前浏览器不支持转码，请用 Chrome / Edge', 'err');
      return;
    }
    if (!vcURL) { LB.toast('请先载入视频', 'err'); return; }

    const res = +$('#vcRes', rootEl).value || 0;
    const br = Math.max(0.3, +$('#vcBr', rootEl).value || 2.5) * 1000000;
    const ow = v.videoWidth || 1280;
    const oh = v.videoHeight || 720;
    const W = res ? Math.min(res, ow) : ow;
    const H = Math.max(2, Math.round(W * oh / ow) & ~1);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    try {
      const src = v.captureStream ? v.captureStream() : null;
      if (src) src.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (_) { /* 无音轨或 captureStream 不支持 */ }

    let mime = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';

    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: br });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      if (!alive) return;
      outputBlob = new Blob(chunks, { type: 'video/webm' });
      if (outURL) { URL.revokeObjectURL(outURL); outURL = null; }
      outURL = URL.createObjectURL(outputBlob);
      const outVideo = $('#vcOut', rootEl);
      outVideo.src = outURL;
      outVideo.hidden = false;
      $('#vcDl', rootEl).hidden = false;
      try { v.pause(); } catch (_) {}
      clearInterval(vcTimer);
      vcTimer = null;
      $('#vcFill', rootEl).style.width = '100%';
      stat.textContent = '✅ 压缩完成 · 输出 ' + LB.dom.fmtSize(outputBlob.size);
    };

    v.currentTime = 0;
    try {
      await v.play();
    } catch (_) {
      stat.textContent = '视频播放失败，无法转码';
      return;
    }
    if (!alive) { try { v.pause(); } catch (_) {} return; }
    rec.start(500);

    $('#vcProg', rootEl).hidden = false;
    stat.textContent = '转码中…';

    vcTimer = setInterval(() => {
      try { ctx.drawImage(v, 0, 0, W, H); } catch (_) {}
      const p = v.duration ? Math.min(99, v.currentTime / v.duration * 100) : 0;
      $('#vcFill', rootEl).style.width = p + '%';
      stat.textContent = '⏳ 转码中 ' + p.toFixed(0) + '% · ' + fmtT(v.currentTime) + ' / ' + fmtT(v.duration || 0);
    }, 100);

    v.onended = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
  }

  function loadFile(file) {
    if (!alive) return;
    if (vcURL) { URL.revokeObjectURL(vcURL); vcURL = null; }
    const v = $('#vcV', rootEl);
    vcURL = URL.createObjectURL(file);
    v.src = vcURL;
    v.hidden = false;
    $('#vcDrop', rootEl).hidden = true;
    $('#vcCtl', rootEl).hidden = false;
    v.play().catch(() => { /* 自动播放可能被策略拒绝，忽略 */ });
    LB.toast('视频已载入，选择分辨率和码率后点「开始压缩」', 'ok');
  }

  /* ================= tab2 · 转码（FFmpeg.wasm） ================= */

  function fmtConf() { return FORMATS[$('#vcFmt', rootEl).value] || FORMATS.mp4; }

  /* 容器变化时重建编码下拉（只保留该容器真正支持的组合） */
  function syncEncoders() {
    const F = fmtConf();
    const vSel = $('#vcVenc', rootEl);
    const keepV = vSel.value;
    vSel.innerHTML = F.v.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') +
      DISABLED_V.map(x => '<option value="' + x[0] + '" disabled>' + x[1] + '（当前浏览器不可用）</option>').join('');
    if (F.v.some(x => x[0] === keepV)) vSel.value = keepV;

    const aSel = $('#vcAenc', rootEl);
    const keepA = aSel.value;
    aSel.innerHTML = F.a.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('');
    if (F.a.some(x => x[0] === keepA)) aSel.value = keepA;
  }

  function buildArgs() {
    const F = fmtConf();
    const venc = $('#vcVenc', rootEl).value;
    const aenc = $('#vcAenc', rootEl).value;
    const Q = QUALITY[$('#vcQ', rootEl).value] || QUALITY.mid;
    const args = [];
    if (venc === 'libx264') args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(Q.crf), '-pix_fmt', 'yuv420p');
    else if (venc === 'libvpx') args.push('-c:v', 'libvpx', '-b:v', Q.vb, '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p');
    else if (venc === 'mpeg4') args.push('-c:v', 'mpeg4', '-q:v', String(Q.qv));
    if (aenc === 'pcm_s16le') args.push('-c:a', 'pcm_s16le');
    else args.push('-c:a', aenc, '-b:a', Q.abr);
    const out = 'out.' + F.ext;
    args.push(out);
    return { args: args, out: out, mime: F.mime, ext: F.ext };
  }

  async function transcode() {
    if (busy || !alive || !rootEl) return;
    if (!trFile) { LB.toast('请先载入视频', 'err'); return; }
    const stat = $('#vcTrStat', rootEl);
    const btn = $('#vcTrGo', rootEl);
    const prog = $('#vcTrProg', rootEl);
    const fill = $('#vcTrFill', rootEl);
    busy = true;
    btn.disabled = true;
    prog.hidden = false;
    fill.style.width = '0%';
    stat.textContent = '准备中…';
    try {
      const cfg = buildArgs();
      stat.textContent = '正在加载转码组件…';
      const blob = await LB.ffmpeg.run({
        file: trFile,
        inputName: 'in.' + (trFile.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, ''),
        args: cfg.args,
        outName: cfg.out,
        mime: cfg.mime,
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
      const out = $('#vcTrOut', rootEl);
      out.src = trOutURL;
      out.hidden = false;
      $('#vcTrDl', rootEl).hidden = false;
      fill.style.width = '100%';
      stat.textContent = '✅ 转码完成 · ' + cfg.ext.toUpperCase() + ' · ' + LB.dom.fmtSize(blob.size);
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
    if (!/^video\//.test(file.type || '') && !/\.(mp4|webm|mov|mkv|avi|m4v|3gp)$/i.test(file.name || '')) {
      LB.toast('请选择视频文件', 'warn');
      return;
    }
    trFile = file;
    trOutBlob = null;
    $('#vcTrCtl', rootEl).hidden = false;
    $('#vcTrOut', rootEl).hidden = true;
    $('#vcTrDl', rootEl).hidden = true;
    $('#vcTrProg', rootEl).hidden = true;
    $('#vcTrStat', rootEl).textContent = '已载入：' + file.name + '（' + LB.dom.fmtSize(file.size) + '），选择格式后点「开始转码」';
    LB.toast('视频已载入', 'ok');
  }

  /* ================= 视图 ================= */

  function setTab(t) {
    tab = t;
    if (!rootEl) return;
    [['zip', '#vcZipBox'], ['tr', '#vcTrBox']].forEach(([k, sel]) => {
      const el = $(sel, rootEl);
      if (el) el.hidden = k !== t;
    });
    const tabs = rootEl.querySelectorAll('#vcTabs .vc-tab');
    for (let i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === t);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>视频压缩转码</h1><p>本机压缩为 WebM，或用 FFmpeg 转码成 MP4 / MKV / MOV / AVI / WebM</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2" id="vcTabs">' +
      '<button class="vc-tab on" data-tab="zip" type="button">🗜️ 压缩</button>' +
      '<button class="vc-tab" data-tab="tr" type="button">🔄 转码</button>' +
      '</div>' +

      /* —— tab1 压缩 —— */
      '<div id="vcZipBox">' +
      '<div class="vf-wrap">' +
      '<div class="card">' +
      '<div class="dropzone vf-drop" id="vcDrop">' +
      '<div class="vf-dz-ic">🎞️</div>' +
      '<div>点击或拖拽视频到这里</div>' +
      '<small>支持 MP4 / WebM / MOV 等，压缩全程在本机完成</small>' +
      '</div>' +
      '<input type="file" id="vcFile" accept="video/*,.mp4,.webm,.mov,.mkv" hidden>' +
      '<video controls id="vcV" class="vf-v" hidden></video>' +
      '<div class="vc-ctl" id="vcCtl" hidden>' +
      '<label class="ac-field">分辨率<select class="inp" id="vcRes">' +
      '<option value="0">保持原始</option>' +
      '<option value="1920">1080p</option>' +
      '<option value="1280" selected>720p</option>' +
      '<option value="854">480p</option>' +
      '</select></label>' +
      '<label class="ac-field">码率（Mbps）<input type="number" id="vcBr" min="0.3" step="0.1" value="2.5"></label>' +
      '<button class="btn btn-main" id="vcGo" type="button">🎥 开始压缩</button>' +
      '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="vc-prog" id="vcProg" hidden><div class="vc-fill" id="vcFill"></div></div>' +
      '<div class="vc-stat" id="vcStat">载入视频后即可开始压缩。</div>' +
      '<video controls id="vcOut" class="vf-v" hidden></video>' +
      '<div class="vc-dl"><button class="btn btn-main" id="vcDl" type="button" hidden>⬇️ 下载 WebM</button></div>' +
      '<p class="vc-note">压缩由浏览器 MediaRecorder 实时完成（边播边录），输出 WebM（VP9/VP8 + Opus）。视频越长耗时越久，请保持页面前台。</p>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* —— tab2 转码 —— */
      '<div id="vcTrBox" hidden>' +
      '<div class="card">' +
      '<div class="dropzone vf-drop" id="vcTrDrop">' +
      '<div class="vf-dz-ic">🔄</div>' +
      '<div>点击或拖拽要转码的视频</div>' +
      '<small>转码由 FFmpeg.wasm 在本机完成，首次使用需加载约 32MB 核心</small>' +
      '</div>' +
      '<input type="file" id="vcTrFile" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v" hidden>' +
      '<div id="vcTrCtl" hidden>' +
      '<div class="vc-form">' +
      '<label class="pz-lab">输出格式<select class="inp" id="vcFmt">' +
      Object.keys(FORMATS).map(k => '<option value="' + k + '">' + FORMATS[k].label + '</option>').join('') +
      '</select></label>' +
      '<label class="pz-lab">视频编码<select class="inp" id="vcVenc"></select></label>' +
      '<label class="pz-lab">音频编码<select class="inp" id="vcAenc"></select></label>' +
      '<label class="pz-lab">质量<select class="inp" id="vcQ">' +
      Object.keys(QUALITY).map(k => '<option value="' + k + '"' + (k === 'mid' ? ' selected' : '') + '>' + QUALITY[k].name + '</option>').join('') +
      '</select></label>' +
      '</div>' +
      '<button class="btn btn-main" id="vcTrGo" type="button">🔄 开始转码</button>' +
      '<div class="vc-prog" id="vcTrProg" hidden><div class="vc-fill" id="vcTrFill"></div></div>' +
      '<div class="vc-stat" id="vcTrStat">载入视频后即可开始转码。</div>' +
      '<video controls id="vcTrOut" class="vf-v" hidden></video>' +
      '<div class="vc-dl"><button class="btn btn-main" id="vcTrDl" type="button" hidden>⬇️ 下载文件</button></div>' +
      '</div>' +
      '</div>' +
      '<p class="vc-note">转码使用 FFmpeg.wasm（约 32MB 核心，首次点「开始转码」时才下载，之后浏览器会缓存）。' +
      '视频编码里的 <b>H.265 / VP9 已停用</b>：实测 H.265 在当前 wasm 构建下极慢（2 秒测试片 45 秒未完成），' +
      'VP9 会让转码进程崩溃，因此只保留实测可用的编码组合。</p>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    /* —— tab 切换 —— */
    $('#vcTabs', root).addEventListener('click', e => {
      const b = e.target.closest('.vc-tab');
      if (b) setTab(b.getAttribute('data-tab'));
    });

    /* —— tab1 —— */
    const drop = $('#vcDrop', root);
    const input = $('#vcFile', root);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) loadFile(f);
    });
    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    $('#vcGo', root).addEventListener('click', compress);
    $('#vcDl', root).addEventListener('click', () => {
      if (outputBlob) LB.img.download(outputBlob, 'litebox_compressed.webm');
    });

    /* —— tab2 —— */
    syncEncoders();
    const trDrop = $('#vcTrDrop', root);
    const trInput = $('#vcTrFile', root);
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
    $('#vcFmt', root).addEventListener('change', syncEncoders);
    $('#vcTrGo', root).addEventListener('click', transcode);
    $('#vcTrDl', root).addEventListener('click', () => {
      if (!trOutBlob) return;
      const F = fmtConf();
      const base = (trFile && trFile.name ? trFile.name.replace(/\.[^.]+$/, '') : 'litebox') + '.' + F.ext;
      LB.img.download(trOutBlob, base);
    });

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    alive = false;
    busy = false;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      try { rec.stop(); } catch (_) {}
    }
    rec = null;
    clearInterval(vcTimer);
    vcTimer = null;
    const v = rootEl && $('#vcV', rootEl);
    if (v) { try { v.pause(); } catch (_) {} v.onended = null; v.removeAttribute('src'); }
    const ov = rootEl && $('#vcTrOut', rootEl);
    if (ov) ov.removeAttribute('src');
    if (vcURL) { URL.revokeObjectURL(vcURL); vcURL = null; }
    if (outURL) { URL.revokeObjectURL(outURL); outURL = null; }
    if (trOutURL) { URL.revokeObjectURL(trOutURL); trOutURL = null; }
    outputBlob = null;
    trOutBlob = null;
    trFile = null;
    rootEl = null;
  }

  LB.router.register('vconv', { mount, unmount });
})();
