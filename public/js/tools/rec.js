/* LiteBox v5 · tools/rec.js — 录音机（MediaRecorder 本机录音，不上传不持久化） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let recorder = null;     /* MediaRecorder 实例 */
  let stream = null;       /* getUserMedia 返回的 MediaStream */
  let chunks = [];         /* 录音数据块 */
  let timer = null;        /* 计时器 setInterval 句柄 */
  let sec = 0;             /* 已录秒数 */
  const urls = new Set();  /* 列表中的 blob URL，unmount 时统一 revoke */

  function fmtMS(n) {
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }

  function fmtClock() {
    const d = new Date();
    const p = x => String(x).padStart(2, '0');
    return p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /* 按优先级选择可用 mimeType；空字符串表示让浏览器自选 */
  function pickMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
    for (const m of list) {
      if (!m || MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  function setUI(recording) {
    if (!rootEl) return;
    $('#rcDot', rootEl).classList.toggle('on', recording);
    $('#rcStart', rootEl).disabled = recording;
    $('#rcStop', rootEl).disabled = !recording;
  }

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function startRec() {
    if (!rootEl || !alive) return;
    const status = $('#rcStatus', rootEl);
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      status.textContent = '当前浏览器不支持录音，请用 Chrome / Edge';
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
      if (!alive) { s.getTracks().forEach(t => t.stop()); return; } /* 已切走：立即释放 */
      stream = s;
      const mime = pickMime();
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = onRecStop;
      recorder.start();
      sec = 0;
      $('#rcTimer', rootEl).textContent = '00:00';
      setUI(true);
      status.textContent = '录音中…点"停止"结束';
      timer = setInterval(() => {
        sec++;
        if (rootEl) $('#rcTimer', rootEl).textContent = fmtMS(sec);
      }, 1000);
    }).catch(() => {
      if (!alive) return;
      status.textContent = '录音未开始';
      LB.toast('无法访问麦克风：请检查浏览器权限设置', 'err');
    });
  }

  /* 录音结束：组装 blob → 列表插入一条（新录音置顶） */
  function onRecStop() {
    if (!alive) { chunks = []; return; } /* unmount 触发的 stop：只清数据不留 DOM */
    const type = (recorder && recorder.mimeType) || '';
    const ext = type.indexOf('mp4') >= 0 ? 'm4a' : 'webm';
    const blob = new Blob(chunks, { type: type || 'audio/webm' });
    chunks = [];
    const url = URL.createObjectURL(blob);
    urls.add(url);
    const name = '录音-' + fmtClock() + '.' + ext;
    const item = document.createElement('div');
    item.className = 'rc-item';
    item.innerHTML =
      '<div class="rc-meta"><span class="rc-name">' + name + '</span>' +
      '<span class="rc-size">' + LB.img.fmtSize(blob.size) + '</span></div>' +
      '<div class="rc-ops"><audio controls src="' + url + '"></audio>' +
      '<button class="btn btn-ghost btn-sm" data-dl>下载</button></div>';
    item.querySelector('[data-dl]').addEventListener('click', () => LB.img.download(blob, name));
    const list = $('#rcList', rootEl);
    const empty = $('.rc-empty', rootEl);
    if (empty) empty.remove();
    list.prepend(item);
    $('#rcStatus', rootEl).textContent = '✓ 录音完成（' + fmtMS(sec) + '），可试听或下载';
  }

  function stopRec() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    clearInterval(timer);
    timer = null;
    stopTracks();
    setUI(false);
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card rc-main">' +
      '  <div class="rc-dot" id="rcDot"></div>' +
      '  <div class="rc-timer" id="rcTimer">00:00</div>' +
      '  <div class="rc-btns">' +
      '    <button class="btn btn-main" id="rcStart">🎙️ 开始录音</button>' +
      '    <button class="btn btn-ghost" id="rcStop" disabled>⏹ 停止</button>' +
      '  </div>' +
      '  <div class="rc-status" id="rcStatus">点击"开始录音"并授权麦克风即可录制；全程在本机完成，录音不会上传。</div>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="rc-listtit">录音列表</h3>' +
      '  <div id="rcList"><div class="rc-empty">还没有录音，录一条试试</div></div>' +
      '</div>';
    $('#rcStart', root).addEventListener('click', startRec);
    $('#rcStop', root).addEventListener('click', stopRec);
  }

  function unmount() {
    alive = false;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder = null;
    clearInterval(timer);
    timer = null;
    stopTracks();
    chunks = [];
    urls.forEach(u => URL.revokeObjectURL(u));
    urls.clear();
    rootEl = null;
  }

  LB.router.register('rec', { mount, unmount });
})();
