/* LiteBox v5 · tools/screencap.js — 屏幕录制（getDisplayMedia + MediaRecorder，本机完成不上传） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let recorder = null;    /* MediaRecorder 实例 */
  let stream = null;      /* 屏幕流（可能混入麦克风音轨） */
  let chunks = [];        /* 视频数据块 */
  let timer = null;       /* 计时器句柄 */
  let sec = 0;            /* 已录秒数 */
  let blobUrl = null;     /* 预览视频 blob URL，unmount 时 revoke */
  let lastBlob = null;    /* 最近一次录制结果，供下载 */

  function fmtMS(n) {
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }

  /* 按优先级选择可用视频 mimeType */
  function pickMime() {
    const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of list) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  function setUI(recording) {
    if (!rootEl) return;
    $('#scStart', rootEl).hidden = recording;
    $('#scStop', rootEl).hidden = !recording;
    $('#scTimer', rootEl).hidden = !recording;
  }

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  /* 录制结束：组装 blob → 显示预览与下载 */
  function onRecStop() {
    if (!alive) { chunks = []; return; } /* unmount 触发的 stop：只清数据 */
    const blob = new Blob(chunks, { type: 'video/webm' });
    chunks = [];
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    blobUrl = URL.createObjectURL(blob);
    lastBlob = blob;
    $('#scPrev', rootEl).hidden = false;
    $('#scVideo', rootEl).src = blobUrl;
    $('#scStatus', rootEl).textContent = '✓ 录制完成：' + LB.img.fmtSize(blob.size) + '，可预览或下载';
  }

  async function startRec() {
    if (!rootEl || !alive) return;
    const status = $('#scStatus', rootEl);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) {
      status.textContent = '当前浏览器不支持屏幕录制，请用 Chrome / Edge';
      return;
    }
    let s;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: $('#scSys', rootEl).checked
      });
    } catch (_) {
      if (!alive) return;
      status.textContent = '未获取屏幕共享授权';
      LB.toast('无法录制屏幕：请在浏览器弹窗中允许屏幕共享', 'err');
      return;
    }
    if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    /* 同时录麦克风：失败不阻断，仅提示 */
    if ($('#scMic', rootEl).checked) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch (_) {
        LB.toast('麦克风授权失败，仅录系统声音', 'err');
      }
    }
    const mime = pickMime();
    const opts = { videoBitsPerSecond: 4000000 };
    if (mime) opts.mimeType = mime;
    recorder = new MediaRecorder(stream, opts);
    chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = onRecStop;
    recorder.start(500); /* 每 500ms 收一个 chunk */
    /* 用户点系统"停止共享"时自动停止录制 */
    const vt = stream.getVideoTracks()[0];
    if (vt) vt.addEventListener('ended', stopRec);
    sec = 0;
    $('#scTimer', rootEl).textContent = '00:00';
    setUI(true);
    status.textContent = '录制中…点"停止并保存"结束，或直接点系统的"停止共享"';
    timer = setInterval(() => {
      sec++;
      if (rootEl) $('#scTimer', rootEl).textContent = fmtMS(sec);
    }, 1000);
  }

  function stopRec() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    clearInterval(timer);
    timer = null;
    stopTracks();
    if (alive) setUI(false);
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card sc-main">' +
      '  <div class="sc-checks">' +
      '    <label class="sc-check"><input type="checkbox" id="scMic">同时录麦克风</label>' +
      '    <label class="sc-check"><input type="checkbox" id="scSys" checked>录制系统声音</label>' +
      '  </div>' +
      '  <div class="sc-btns">' +
      '    <button class="btn btn-main" id="scStart">🖥️ 开始录制</button>' +
      '    <button class="btn btn-ghost" id="scStop" hidden>⏹ 停止并保存</button>' +
      '  </div>' +
      '  <div class="rc-timer sc-timer" id="scTimer" hidden>00:00</div>' +
      '  <p class="sc-hint">首次使用需在浏览器弹窗中授权屏幕共享；录制全程在本机完成，视频不会上传。</p>' +
      '  <div class="sc-status" id="scStatus">选择要录制的屏幕 / 窗口 / 标签页即可开始。</div>' +
      '</div>' +
      '<div class="card sc-prev" id="scPrev" hidden>' +
      '  <h3 class="sc-prevtit">录制预览</h3>' +
      '  <video controls id="scVideo"></video>' +
      '  <div class="sc-dl"><button class="btn btn-ghost btn-sm" id="scDl">下载 .webm</button></div>' +
      '</div>';
    $('#scStart', root).addEventListener('click', startRec);
    $('#scStop', root).addEventListener('click', stopRec);
    $('#scDl', root).addEventListener('click', () => {
      if (lastBlob) LB.img.download(lastBlob, 'litebox_screen.webm');
    });
  }

  function unmount() {
    alive = false;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder = null;
    clearInterval(timer);
    timer = null;
    stopTracks();
    chunks = [];
    lastBlob = null;
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    rootEl = null;
  }

  LB.router.register('screencap', { mount, unmount });
})();
