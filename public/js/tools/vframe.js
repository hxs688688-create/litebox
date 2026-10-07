/* LiteBox v5 · tools/vframe.js — 视频帧提取（单帧截取 + 从头连拍，本地完成） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let vURL = null;        /* 视频 blob URL */
  const frames = [];      /* { blob, url, t } */
  let burstTimer = null;  /* 连拍 setTimeout 句柄 */

  function fmtT(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }

  function updateBadge() {
    $('#vfBadge', rootEl).textContent = String(frames.length);
    const has = frames.length > 0;
    $('#vfClear', rootEl).hidden = !has;
    $('#vfAll', rootEl).hidden = !has;
  }

  function renderFrame(f, idx) {
    const item = document.createElement('div');
    item.className = 'vf-frame';
    item.innerHTML =
      '<img loading="lazy" src="' + f.url + '" alt="帧 ' + (idx + 1) + '">' +
      '<div class="vf-cap"><span>' + fmtT(f.t) + '</span>' +
      '<button class="btn btn-ghost btn-sm" data-dl="' + idx + '">下载</button></div>';
    $('#vfGrid', rootEl).appendChild(item);
  }

  function loadFile(file) {
    if (!alive) return;
    if (vURL) { URL.revokeObjectURL(vURL); vURL = null; }
    const v = $('#vfV', rootEl);
    vURL = URL.createObjectURL(file);
    v.src = vURL;
    v.hidden = false;
    $('#vfDrop', rootEl).hidden = true;
    $('#vfCtl', rootEl).hidden = false;
    v.play().catch(() => { /* 自动播放可能被策略拒绝，忽略 */ });
    LB.toast('视频已载入，拖到想要的位置后点「截取当前帧」', 'ok');
  }

  /* 单帧截取：canvas 绘制当前画面 → PNG blob */
  function shoot() {
    const v = $('#vfV', rootEl);
    if (!v.videoWidth) {
      LB.toast('视频尚未就绪，稍等一下', 'err');
      return null;
    }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return new Promise(resolve => {
      c.toBlob(b => {
        if (!b || !alive) { resolve(null); return; }
        const f = { blob: b, url: URL.createObjectURL(b), t: v.currentTime };
        frames.push(f);
        renderFrame(f, frames.length - 1);
        updateBadge();
        resolve(f);
      }, 'image/png');
    });
  }

  async function shootOne() {
    if (!alive) return;
    await shoot();
  }

  /* 从头连拍（任务给定逻辑）：seeked 确保帧就绪，间隔 80ms 让 UI 喘息 */
  function burst() {
    if (!alive) return;
    const v = $('#vfV', rootEl);
    const dur = v.duration;
    if (!dur || dur === Infinity) { LB.toast('视频时长读取中，请稍候再试', 'err'); return; }
    const gap = Math.max(0.5, +$('#vfGap', rootEl).value || 2);
    let t = 0, n = 0;
    LB.toast('连拍开始，间隔 ' + gap + ' 秒', 'ok');

    function step() {
      if (!alive) return;                 /* 已切走：终止连拍 */
      if (t >= dur || n >= 60) {          /* 最多 60 帧，防内存爆炸 */
        LB.toast('连拍完成，共 ' + n + ' 帧', 'ok');
        return;
      }
      v.currentTime = Math.min(t, Math.max(0, dur - 0.05));
      v.addEventListener('seeked', function once() {
        v.removeEventListener('seeked', once);
        if (!alive) return;
        shoot();
        n++;
        t += gap;
        burstTimer = setTimeout(step, 80); /* 留点时间让 UI 更新 */
      });
    }
    step();
  }

  function clearFrames() {
    frames.forEach(f => URL.revokeObjectURL(f.url));
    frames.length = 0;
    $('#vfGrid', rootEl).innerHTML =
      '<div class="vf-empty">还没有截取任何帧 · 播放视频后点「截取当前帧」，或用「从头连拍」批量抽帧</div>';
    updateBadge();
  }

  function frameName(i, t) {
    return 'frame_' + String(i + 1).padStart(2, '0') + '_' + t.toFixed(1).replace('.', 'p') + 's.png';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="vf-wrap">' +
      '  <div class="card">' +
      '    <div class="dropzone vf-drop" id="vfDrop">' +
      '      <div class="vf-dz-ic">🎬</div>' +
      '      <div>点击或拖拽视频到这里</div>' +
      '      <small>支持 MP4 / WebM / MOV 等，文件仅在本机处理</small>' +
      '    </div>' +
      '    <input type="file" id="vfFile" accept="video/*,.mp4,.webm,.mov,.mkv" hidden>' +
      '    <video controls id="vfV" class="vf-v" hidden></video>' +
      '    <div class="vf-ctl" id="vfCtl" hidden>' +
      '      <button class="btn btn-main" id="vfShot">📷 截取当前帧</button>' +
      '      <label class="vf-gap">间隔（秒）<input type="number" id="vfGap" min="0.5" step="0.5" value="2"></label>' +
      '      <button class="btn btn-ghost" id="vfBurst">⚡ 从头连拍</button>' +
      '      <button class="btn btn-ghost" id="vfClear" hidden>清空</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="card">' +
      '    <div class="vf-head"><h3 class="vf-tit">帧列表</h3><span class="vf-badge" id="vfBadge">0</span></div>' +
      '    <div class="vf-grid" id="vfGrid">' +
      '      <div class="vf-empty">还没有截取任何帧 · 播放视频后点「截取当前帧」，或用「从头连拍」批量抽帧</div>' +
      '    </div>' +
      '    <button class="btn btn-ghost vf-all" id="vfAll" hidden>⬇️ 逐张下载全部帧</button>' +
      '  </div>' +
      '</div>';

    const drop = $('#vfDrop', root);
    const input = $('#vfFile', root);
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

    $('#vfShot', root).addEventListener('click', shootOne);
    $('#vfBurst', root).addEventListener('click', burst);
    $('#vfClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearFrames));
    /* 逐张下载全部帧：间隔 320ms 依次触发 */
    $('#vfAll', root).addEventListener('click', () => {
      frames.forEach((f, i) => {
        setTimeout(() => LB.img.download(f.blob, frameName(i, f.t)), i * 320);
      });
    });
    /* 单帧下载（事件委托） */
    $('#vfGrid', root).addEventListener('click', e => {
      const b = e.target.closest('[data-dl]');
      if (!b) return;
      const i = +b.dataset.dl;
      const f = frames[i];
      if (f) LB.img.download(f.blob, frameName(i, f.t));
    });
  }

  function unmount() {
    alive = false;
    clearTimeout(burstTimer);
    burstTimer = null;
    if (vURL) { URL.revokeObjectURL(vURL); vURL = null; }
    frames.forEach(f => URL.revokeObjectURL(f.url));
    frames.length = 0;
    const v = rootEl && $('#vfV', rootEl);
    if (v) { try { v.pause(); } catch (_) {} v.removeAttribute('src'); }
    rootEl = null;
  }

  LB.router.register('vframe', { mount, unmount });
})();
