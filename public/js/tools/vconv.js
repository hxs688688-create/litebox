/* LiteBox v5 · tools/vconv.js — 视频压缩转码（canvas captureStream + MediaRecorder 边播边录，输出 WebM） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let vcURL = null;      /* 输入视频 blob URL */
  let outURL = null;     /* 输出 WebM blob URL */
  let outputBlob = null; /* 最近一次输出，供下载 */
  let rec = null;        /* MediaRecorder */
  let vcTimer = null;    /* 画帧 + 进度定时器 */

  function fmtT(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }

  async function compress() {
    if (!alive || !rootEl) return;
    const v = $('#vcV', rootEl);
    const stat = $('#vcStat', rootEl);
    /* 1. 检查浏览器支持 */
    if (typeof MediaRecorder === 'undefined') {
      LB.toast('当前浏览器不支持转码，请用 Chrome / Edge', 'err');
      return;
    }
    if (!vcURL) { LB.toast('请先载入视频', 'err'); return; }

    /* 2. 计算输出尺寸 */
    const res = +$('#vcRes', rootEl).value || 0;
    const br = Math.max(0.3, +$('#vcBr', rootEl).value || 2.5) * 1000000; /* 转 bps */
    const ow = v.videoWidth || 1280;
    const oh = v.videoHeight || 720;
    const W = res ? Math.min(res, ow) : ow;
    const H = Math.max(2, Math.round(W * oh / ow) & ~1); /* 保证偶数（编码器要求） */

    /* 3. 创建 canvas 作为输出源 */
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    /* 4. 添加音轨（如果有） */
    try {
      const src = v.captureStream ? v.captureStream() : null;
      if (src) src.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (_) { /* 无音轨或 captureStream 不支持 */ }

    /* 5. 选 mimeType */
    let mime = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';

    /* 6. 创建 MediaRecorder */
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
      /* 清理 */
      try { v.pause(); } catch (_) {}
      clearInterval(vcTimer);
      vcTimer = null;
      $('#vcFill', rootEl).style.width = '100%';
      stat.textContent = '✅ 压缩完成 · 输出 ' + LB.dom.fmtSize(outputBlob.size);
    };

    /* 7. 从头播放并开始录制 */
    v.currentTime = 0;
    try {
      await v.play();
    } catch (_) {
      stat.textContent = '视频播放失败，无法转码';
      return;
    }
    if (!alive) { try { v.pause(); } catch (_) {} return; }
    rec.start(500); /* 每 500ms 一个 chunk */

    $('#vcProg', rootEl).hidden = false;
    stat.textContent = '转码中…';

    /* 8. 每 100ms 把视频帧画到 canvas，同时更新进度 */
    vcTimer = setInterval(() => {
      try { ctx.drawImage(v, 0, 0, W, H); } catch (_) {}
      const p = v.duration ? Math.min(99, v.currentTime / v.duration * 100) : 0;
      $('#vcFill', rootEl).style.width = p + '%';
      stat.textContent = '⏳ 转码中 ' + p.toFixed(0) + '% · ' + fmtT(v.currentTime) + ' / ' + fmtT(v.duration || 0);
    }, 100);

    /* 9. 视频播放结束 → 停止录制 */
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

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="vf-wrap">' +
      '  <div class="card">' +
      '    <div class="dropzone vf-drop" id="vcDrop">' +
      '      <div class="vf-dz-ic">🎞️</div>' +
      '      <div>点击或拖拽视频到这里</div>' +
      '      <small>支持 MP4 / WebM / MOV 等，转码全程在本机完成</small>' +
      '    </div>' +
      '    <input type="file" id="vcFile" accept="video/*,.mp4,.webm,.mov,.mkv" hidden>' +
      '    <video controls id="vcV" class="vf-v" hidden></video>' +
      '    <div class="vc-ctl" id="vcCtl" hidden>' +
      '      <label class="ac-field">分辨率<select class="inp" id="vcRes">' +
      '        <option value="0">保持原始</option>' +
      '        <option value="1920">1080p</option>' +
      '        <option value="1280" selected>720p</option>' +
      '        <option value="854">480p</option>' +
      '      </select></label>' +
      '      <label class="ac-field">码率（Mbps）<input type="number" id="vcBr" min="0.3" step="0.1" value="2.5"></label>' +
      '      <button class="btn btn-main" id="vcGo">🎥 开始压缩</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="card">' +
      '    <div class="vc-prog" id="vcProg" hidden><div class="vc-fill" id="vcFill"></div></div>' +
      '    <div class="vc-stat" id="vcStat">载入视频后即可开始压缩。</div>' +
      '    <video controls id="vcOut" class="vf-v" hidden></video>' +
      '    <div class="vc-dl"><button class="btn btn-main" id="vcDl" hidden>⬇️ 下载 WebM</button></div>' +
      '    <p class="vc-note">转码由浏览器 MediaRecorder 实时完成（边播边录），输出 WebM（VP9/VP8 + Opus）。视频越长耗时越久，请保持页面前台。</p>' +
      '  </div>' +
      '</div>';

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
  }

  function unmount() {
    alive = false;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null; /* 已切走，不再组装输出 */
      try { rec.stop(); } catch (_) {}
    }
    rec = null;
    clearInterval(vcTimer);
    vcTimer = null;
    const v = rootEl && $('#vcV', rootEl);
    if (v) { try { v.pause(); } catch (_) {} v.onended = null; v.removeAttribute('src'); }
    if (vcURL) { URL.revokeObjectURL(vcURL); vcURL = null; }
    if (outURL) { URL.revokeObjectURL(outURL); outURL = null; }
    outputBlob = null;
    rootEl = null;
  }

  LB.router.register('vconv', { mount, unmount });
})();
