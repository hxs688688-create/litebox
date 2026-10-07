/* LiteBox v5 · tools/gifmake.js — GIF 制作（Step 11 · B4：四个模式）
 *
 *   📷 多图合成   多张图片 → GIF（帧率 / 尺寸 / 循环次数可调）
 *   🎬 视频转 GIF 视频 → 按帧 seek + drawImage 抓帧 → GIF
 *   🖼️ GIF 转图片 GIF → 逐帧解析导出 PNG（gifuct-js）
 *   🎥 GIF 转视频 GIF → 逐帧绘制到 canvas + MediaRecorder 录制
 *
 * 【为什么 gif.js 要连 worker 一起引】
 *   gif.js 的编码工作在 Web Worker 里跑，主线程只负责丢帧。
 *   只引 gif.js 不引 gif.worker.js 的话，构造 GIF 时传 workerScript 会取不到文件，
 *   表现为「生成中卡住不动」—— 这是本工具最容易踩的坑，两个文件必须成对存在。
 *
 * 【循环次数：直接写进 GIF 文件头，不在播放端做】
 *   GIF 的 NETSCAPE2.0 应用扩展块里有个 2 字节的 loop count（0 = 无限循环），
 *   浏览器/看图软件读的就是它，所以「播 N 遍后停」必须写进文件本身。
 *
 *   ★ 关于字节布局（这里踩过坑，记住）：
 *     块结构是 0x21 0xFF 0x0B "NETSCAPE2.0"(11字节) 0x03 0x01 <loop低> <loop高> 0x00
 *     若以 "NETSCAPE2.0" 首字节为偏移 at，则 loop 在 at+13 / at+14，at+15 是块结束符 0x00。
 *
 * 【为什么「视频转 GIF」用 seek 抓帧而不是播放中录屏】
 *   播放中录屏会丢帧且不可复现；seek 到指定时间点再 drawImage 是确定性的，
 *   同一段视频每次生成的帧序列完全一致，也便于按帧率精确取点。
 *   注意 seek 前必须先等 loadedmetadata，否则 currentTime 赋值会被忽略。
 *
 * 【为什么「GIF 转视频」用 canvas.captureStream + MediaRecorder】
 *   浏览器里唯一能直接产出视频文件的路径。MediaRecorder 支持的容器/编码因浏览器而异，
 *   故按 vp9 → vp8 → webm → mp4 顺序探测，都不支持时给出明确提示而不是静默失败。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;
  let mode = 'compose';     /* compose | v2g | g2i | g2v */

  /* ---- 多图合成 ---- */
  let files = [];           /* File[]，按选择顺序 */
  let urls = [];            /* 预览缩略图 URL，需及时 revoke */
  let previewUrl = '';      /* 合成结果的 blob URL */

  /* ---- 视频转 GIF ---- */
  let vFile = null;
  let vPreviewUrl = '';

  /* ---- GIF 转图片 ---- */
  let g2iFrames = [];       /* [{blob, url, i}] */

  /* ---- GIF 转视频 ---- */
  let g2vUrl = '';

  let pasteCleanups = [];

  /* ---------- 通用小工具 ---------- */
  function loadScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (globalName && !window[globalName])
        ? reject(new Error('组件加载失败：' + src))
        : resolve();
      s.onerror = () => reject(new Error('组件加载失败，请检查 ' + src));
      document.head.appendChild(s);
    });
  }
  /* 三个 vendor 组件都懒加载：只有真的用到对应模式才下载 */
  const loadGifJS = () => loadScript('vendor/gif.js', 'GIF');
  const loadGifuct = () => loadScript('vendor/gifuct-js.min.js', 'GIFUCT');
  const loadJSZip = () => loadScript('vendor/jszip.min.js', 'JSZip');

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function revoke(url) { if (url) { try { URL.revokeObjectURL(url); } catch (_) {} } }

  function clampNum(v, min, max, dflt) {
    const n = parseFloat(v);
    if (!isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  /* 视频 / GIF 不能被 LB.img.bindDrop 的「只收 image/*」过滤器接住，
     所以这里自己绑一套：点击、拖入、change 三入口，过滤函数可自定义。 */
  function bindFilePick(zone, input, accept, onFiles) {
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const picked = Array.from(input.files || []).filter(accept);
      input.value = '';   /* 允许再次选择同一个文件 */
      if (picked.length) onFiles(picked);
    });
    const over = e => { e.preventDefault(); zone.classList.add('drag'); };
    const leave = () => zone.classList.remove('drag');
    zone.addEventListener('dragover', over);
    zone.addEventListener('dragenter', over);
    zone.addEventListener('dragleave', leave);
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      const picked = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(accept);
      if (picked.length) onFiles(picked);
    });
  }

  const isGif = f => /gif/i.test(f.type || '') || /\.gif$/i.test(f.name || '');
  const isVideo = f => /^video\//i.test(f.type || '') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(f.name || '');

  function waitEvent(el, type, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        clearTimeout(timer);
        el.removeEventListener(type, ok);
        el.removeEventListener('error', bad);
      };
      const ok = () => { if (!done) { done = true; cleanup(); resolve(); } };
      const bad = () => { if (!done) { done = true; cleanup(); reject(new Error('视频加载失败或超时')); } };
      const timer = setTimeout(bad, timeoutMs || 8000);
      el.addEventListener(type, ok);
      el.addEventListener('error', bad);
    });
  }

  /* =========================================================
   * 模式 1 · 多图合成
   * ========================================================= */
  function revUrls() {
    urls.forEach(u => URL.revokeObjectURL(u));
    urls = [];
  }

  /* 尺寸下拉 → 实际宽高。value 为 0 表示「原尺寸（取第一张的宽）」 */
  function targetSize(img0) {
    const sel = $('#gmSize', rootEl).value;
    const natW = img0.naturalWidth || img0.width;
    const natH = img0.naturalHeight || img0.height;
    if (sel === '0') return { w: natW, h: natH, label: natW + '×' + natH };
    const w = parseInt(sel, 10);
    /* 等比缩放，不能只改宽 —— 那样会把图压变形 */
    const r = natH / natW;
    const h = Math.max(1, Math.round(w * r));
    return { w: w, h: h, label: w + '×' + h };
  }

  function renderThumbs() {
    revUrls();
    const box = $('#gmThumbs', rootEl);
    if (!box) return;
    box.innerHTML = '';
    urls = files.map((f, i) => {
      const u = URL.createObjectURL(f);
      const w = document.createElement('div');
      w.className = 'gm-thumb';
      w.innerHTML = '<img src="' + u + '" alt="第' + (i + 1) + '帧"><span class="gm-tn">' + (i + 1) + '</span>' +
        '<button class="gm-del" type="button" data-i="' + i + '" aria-label="移除第' + (i + 1) + '帧">×</button>';
      box.appendChild(w);
      return u;
    });
    $('#gmCount', rootEl).textContent = files.length ? ('已选 ' + files.length + ' 张 · 顺序即播放顺序') : '';
    $('#gmGo', rootEl).disabled = files.length < 2;
    /* 少于 2 张时提示，而不是让用户点了才报错 */
    $('#gmHint', rootEl).textContent = files.length < 2
      ? '至少选择 2 张图片才能合成 GIF（当前 ' + files.length + ' 张）'
      : '';
  }

  function addFiles(list) {
    const imgs = Array.from(list || []).filter(f => f && f.type && f.type.indexOf('image/') === 0);
    if (!imgs.length) { LB.toast('请选择图片文件', 'err'); return; }
    files = files.concat(imgs).slice(0, 60);   /* 上限 60 帧，再多浏览器会卡死 */
    if (files.length >= 60) LB.toast('最多 60 帧', 'info');
    renderThumbs();
  }

  function removeAt(i) {
    files.splice(i, 1);
    renderThumbs();
  }

  async function composeMake() {
    if (files.length < 2) { LB.toast('至少选择 2 张图片', 'err'); return; }
    const btn = $('#gmGo', rootEl);
    btn.disabled = true;
    const stat = $('#gmStat', rootEl);
    const out = $('#gmOut', rootEl);
    out.hidden = true;

    try {
      stat.textContent = '正在加载 GIF 组件…';
      await loadGifJS();

      /* 先解码第一张取原始尺寸 */
      const first = await LB.img.load(files[0]);
      const sz = targetSize(first);
      const fps = parseInt($('#gmFps', rootEl).value, 10);
      const loopSel = $('#gmLoop', rootEl).value;   /* 0 无限 / 1 / 3 */
      const times = parseInt(loopSel, 10);

      stat.textContent = '正在解码 ' + files.length + ' 帧…';

      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: sz.w,
        height: sz.h,
        workerScript: 'vendor/gif.worker.js',   /* 必须与 gif.js 成对存在 */
        /* 循环次数写进 GIF 文件头的 NETSCAPE2.0 块（gif.worker.js 的 writeNetscapeExt）。
           0 = 无限循环，1 = 播1 遍，3 = 播 3 遍。 */
        repeat: times
      });

      /* 把每张图画进统一尺寸的 canvas 再交给 gif 编码 */
      for (let i = 0; i < files.length; i++) {
        const img = await LB.img.load(files[i]);
        const cv = document.createElement('canvas');
        cv.width = sz.w; cv.height = sz.h;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        /* 铺满而非拉伸变形：等比居中裁切（cover） */
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const s = Math.max(sz.w / natW, sz.h / natH);
        const dw = natW * s, dh = natH * s;
        ctx.drawImage(img, (sz.w - dw) / 2, (sz.h - dh) / 2, dw, dh);
        gif.addFrame(ctx, { delay: 1000 / fps, copy: true });
        stat.textContent = '已准备 ' + (i + 1) + ' / ' + files.length + ' 帧…';
      }

      const result = await new Promise((resolve, reject) => {
        gif.on('progress', p => { stat.textContent = '生成中 ' + Math.round(p * 100) + '%'; });
        gif.on('finished', resolve);
        gif.on('abort', () => reject(new Error('生成已取消')));
        try { gif.render(); } catch (e) { reject(e); }
        setTimeout(() => reject(new Error('生成超时，请减少帧数或降低尺寸')), 90000);
      });

      stat.textContent = '已生成 · ' + LB.img.fmtSize(result.size) + ' · ' + sz.label +
        ' · ' + fps + 'fps · ' + files.length + ' 帧 · ' +
        (times > 0 ? ('播 ' + times + ' 遍后停') : '无限循环');
      out.hidden = false;
      /* 释放上一张预览的 URL，避免多次生成后泄漏 */
      revoke(previewUrl);
      previewUrl = URL.createObjectURL(result);
      $('#gmPreview', rootEl).src = previewUrl;

      LB.toast('GIF 生成完成', 'ok');
    } catch (e) {
      stat.textContent = '生成失败：' + (e && e.message ? e.message : '未知错误');
      LB.toast(stat.textContent, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  function composeClear() {
    files = [];
    renderThumbs();
    $('#gmOut', rootEl).hidden = true;
    $('#gmStat', rootEl).textContent = '';
  }

  /* =========================================================
   * 模式 2 · 视频转 GIF
   * ========================================================= */
  function v2gReset() {
    vFile = null;
    revoke(vPreviewUrl);
    vPreviewUrl = '';
    const v = $('#vgPreview', rootEl);
    if (v) { v.removeAttribute('src'); v.load(); }
    $('#vgOut', rootEl).hidden = true;
    $('#vgStat', rootEl).textContent = '';
    const name = $('#vgName', rootEl);
    if (name) name.textContent = '';
  }

  function v2gPick(list) {
    const f = list && list[0];
    if (!f) return;
    vFile = f;
    revoke(vPreviewUrl);
    vPreviewUrl = URL.createObjectURL(f);
    const v = $('#vgPreview', rootEl);
    v.src = vPreviewUrl;
    v.hidden = false;
    const name = $('#vgName', rootEl);
    if (name) name.textContent = f.name + ' · ' + LB.img.fmtSize(f.size);
    $('#vgStat', rootEl).textContent = '';
    $('#vgOut', rootEl).hidden = true;
  }

  /* seek 到 t 秒并等 seeked。加超时兜底：部分编码（无关键帧的 webm 等）
     不会触发 seeked，不加兜底整个流程会永远卡住。 */
  function seekTo(video, t) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        resolve();
      };
      video.addEventListener('seeked', finish);
      try { video.currentTime = t; } catch (_) { finish(); return; }
      setTimeout(finish, 1500);
    });
  }

  async function v2gMake() {
    if (!vFile) { LB.toast('先选择一个视频文件', 'err'); return; }
    const btn = $('#vgGo', rootEl);
    const stat = $('#vgStat', rootEl);
    const out = $('#vgOut', rootEl);
    btn.disabled = true;
    out.hidden = true;

    let v = null;
    let objUrl = '';
    try {
      stat.textContent = '正在加载 GIF 组件…';
      await loadGifJS();

      objUrl = URL.createObjectURL(vFile);
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = objUrl;
      /* 必须先等元数据：否则 currentTime 赋值会被忽略，抓到的全是第一帧 */
      await waitEvent(v, 'loadedmetadata', 10000);

      const natW = v.videoWidth, natH = v.videoHeight;
      if (!natW || !natH) throw new Error('读不到视频尺寸（该编码可能不被浏览器支持）');

      /* 目标尺寸：等比缩放 + 单边上限 720（逐帧 drawImage 很吃性能） */
      const sel = $('#vgSize', rootEl).value;
      let W = sel === '0' ? natW : parseInt(sel, 10);
      let H = Math.max(2, Math.round(W * natH / natW));
      const cap = 720 / Math.max(W, H);
      if (cap < 1) { W = Math.round(W * cap); H = Math.round(H * cap); }
      W = Math.max(2, W - (W % 2));   /* GIF 编码器对偶数尺寸更稳 */
      H = Math.max(2, H - (H % 2));

      const dur = (v.duration && isFinite(v.duration)) ? v.duration : 0;
      let start = clampNum($('#vgStart', rootEl).value, 0, 3600, 0);
      if (dur) start = Math.min(start, Math.max(0, dur - 0.2));
      let clip = clampNum($('#vgDur', rootEl).value, 0.2, 15, 3);
      if (dur) clip = Math.min(clip, Math.max(0.2, dur - start));
      const fps = clampNum($('#vgFps', rootEl).value, 5, 20, 10);
      const total = Math.max(1, Math.round(clip * fps));

      const gif = new GIF({
        workers: 2, quality: 10, width: W, height: H,
        workerScript: 'vendor/gif.worker.js',
        repeat: 0
      });
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';

      for (let i = 0; i < total; i++) {
        const t = start + i / fps;
        await seekTo(v, t);
        ctx.drawImage(v, 0, 0, W, H);
        gif.addFrame(ctx, { delay: 1000 / fps, copy: true });
        stat.textContent = '已抓取 ' + (i + 1) + ' / ' + total + ' 帧…';
      }

      const result = await new Promise((resolve, reject) => {
        gif.on('progress', p => { stat.textContent = '编码中 ' + Math.round(p * 100) + '%'; });
        gif.on('finished', resolve);
        gif.on('abort', () => reject(new Error('生成已取消')));
        try { gif.render(); } catch (e) { reject(e); }
        setTimeout(() => reject(new Error('生成超时，请缩短时长或降低帧率')), 120000);
      });

      stat.textContent = '已生成 · ' + LB.img.fmtSize(result.size) + ' · ' + W + '×' + H +
        ' · ' + fps + 'fps · ' + total + ' 帧';
      out.hidden = false;
      revoke(previewUrl);
      previewUrl = URL.createObjectURL(result);
      $('#vgOutImg', rootEl).src = previewUrl;
      LB.toast('GIF 生成完成', 'ok');
    } catch (e) {
      stat.textContent = '生成失败：' + (e && e.message ? e.message : '未知错误');
      LB.toast(stat.textContent, 'err');
    } finally {
      revoke(objUrl);
      if (v) { v.removeAttribute('src'); try { v.load(); } catch (_) {} }
      btn.disabled = false;
    }
  }

  /* =========================================================
   * 公共：解析 GIF → 每帧一张完整合成快照
   *   gifuct-js 给的是「每帧的局部补丁 + 位置 + disposal 类型」，
   *   要自己按 GIF 规范叠加到一张持续画布上，才能得到「第 N 帧看起来是什么样」。
   * ========================================================= */
  async function decodeGif(file) {
    await loadGifuct();
    const buf = await file.arrayBuffer();
    const gif = window.GIFUCT.parseGIF(buf);
    const W = gif.lsd.width, H = gif.lsd.height;
    const raw = window.GIFUCT.decompressFrames(gif, true);
    if (!raw.length) throw new Error('这个 GIF 没有可解析的帧');

    /* 帧数与总像素双限：每帧一张 canvas 快照很吃内存，大 GIF 会拖死标签页 */
    const MAX_FRAMES = 100;
    const frames = raw.slice(0, MAX_FRAMES);
    const totalPx = frames.length * W * H;
    const scale = totalPx > 4e7 ? Math.sqrt(4e7 / totalPx) : 1;
    const ow = Math.max(1, Math.round(W * scale));
    const oh = Math.max(1, Math.round(H * scale));

    const base = document.createElement('canvas');
    base.width = ow; base.height = oh;
    const bctx = base.getContext('2d');

    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');

    const out = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const d = f.dims;

      /* 把这一帧的补丁画到临时画布（宽度赋值会顺带清空上一帧） */
      tmp.width = d.width;
      tmp.height = d.height;
      const id = tctx.createImageData(d.width, d.height);
      id.data.set(f.patch);
      tctx.putImageData(id, 0, 0);

      /* 按补丁位置贴到持续画布上 */
      bctx.drawImage(tmp, 0, 0, d.width, d.height,
        Math.round(d.left * scale), Math.round(d.top * scale),
        Math.round(d.width * scale), Math.round(d.height * scale));

      /* 快照 = 此刻的完整画面 */
      const snap = document.createElement('canvas');
      snap.width = ow; snap.height = oh;
      snap.getContext('2d').drawImage(base, 0, 0);
      out.push({ canvas: snap, delay: f.delay > 0 ? f.delay : 100 });

      /* disposal = 2（还原为背景色）：本帧显示完要清掉自己的区域，再画下一帧 */
      if (f.disposalType === 2) {
        bctx.clearRect(Math.round(d.left * scale), Math.round(d.top * scale),
          Math.round(d.width * scale), Math.round(d.height * scale));
      }
    }
    return { width: ow, height: oh, frames: out, truncated: raw.length > frames.length };
  }

  /* =========================================================
   * 模式 3 · GIF 转图片
   * ========================================================= */
  function g2iClear() {
    g2iFrames.forEach(f => revoke(f.url));
    g2iFrames = [];
    const grid = $('#giGrid', rootEl);
    if (grid) grid.innerHTML = '';
    $('#giOut', rootEl).hidden = true;
    $('#giStat', rootEl).textContent = '';
  }

  function renderG2I() {
    const grid = $('#giGrid', rootEl);
    if (!grid) return;
    grid.innerHTML = g2iFrames.map(f =>
      '<div class="gi-thumb">' +
      '<img src="' + f.url + '" alt="第' + f.i + '帧" loading="lazy">' +
      '<span class="gm-tn">' + f.i + '</span>' +
      '<button class="gm-del gi-dl" type="button" data-dl="' + (f.i - 1) + '" aria-label="下载第' + f.i + '帧">⬇</button>' +
      '</div>').join('');
    $('#giOut', rootEl).hidden = !g2iFrames.length;
  }

  async function g2iRun(file) {
    const stat = $('#giStat', rootEl);
    g2iClear();
    stat.textContent = '正在解析 GIF…';
    try {
      const dec = await decodeGif(file);
      stat.textContent = '已解析 ' + dec.frames.length + ' 帧，正在导出 PNG…';
      for (let i = 0; i < dec.frames.length; i++) {
        const blob = await new Promise(res => dec.frames[i].canvas.toBlob(res, 'image/png'));
        if (!blob) continue;
        g2iFrames.push({ blob: blob, url: URL.createObjectURL(blob), i: i + 1 });
      }
      if (!g2iFrames.length) throw new Error('没有导出任何帧');
      renderG2I();
      stat.textContent = '已导出 ' + g2iFrames.length + ' 张 PNG · ' + dec.width + '×' + dec.height +
        (dec.truncated ? '（原图帧数过多，只取前 100 帧）' : '');
      LB.toast('已解析 ' + g2iFrames.length + ' 帧', 'ok');
    } catch (e) {
      stat.textContent = '解析失败：' + (e && e.message ? e.message : '未知错误');
      LB.toast(stat.textContent, 'err');
    }
  }

  function g2iDownload(idx) {
    const f = g2iFrames[idx];
    if (!f) return;
    LB.img.download(f.blob, 'frame-' + String(f.i).padStart(3, '0') + '.png');
  }

  async function g2iZip() {
    if (!g2iFrames.length) { LB.toast('先解析一个 GIF', 'err'); return; }
    const btn = $('#giZip', rootEl);
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '打包中…';
    try {
      await loadJSZip();
      const zip = new JSZip();
      g2iFrames.forEach(f => zip.file('frame-' + String(f.i).padStart(3, '0') + '.png', f.blob));
      const blob = await zip.generateAsync({ type: 'blob' });
      LB.img.download(blob, 'litebox-gif-frames.zip');
      LB.toast('ZIP 已生成', 'ok');
    } catch (e) {
      LB.toast('打包失败：' + (e && e.message ? e.message : '未知错误'), 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  /* =========================================================
   * 模式 4 · GIF 转视频
   * ========================================================= */
  function pickMime() {
    const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (let i = 0; i < cands.length; i++) {
      try { if (MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (_) {}
    }
    return '';
  }

  function captureStreamOf(canvas, fps) {
    if (canvas.captureStream) return canvas.captureStream(fps);
    if (canvas.mozCaptureStream) return canvas.mozCaptureStream(fps);
    return null;
  }

  async function g2vRun(file) {
    const stat = $('#gvStat', rootEl);
    const out = $('#gvOut', rootEl);
    out.hidden = true;
    stat.textContent = '正在解析 GIF…';
    try {
      if (typeof MediaRecorder === 'undefined') {
        stat.textContent = '当前浏览器不支持画面录制';
        LB.fail('GIF 转视频', '当前浏览器不支持画面录制', '请用 Chrome / Edge 打开');
        return;
      }
      const dec = await decodeGif(file);

      const cv = document.createElement('canvas');
      cv.width = dec.width; cv.height = dec.height;
      const ctx = cv.getContext('2d');

      const FPS = 25;
      const stream = captureStreamOf(cv, FPS);
      if (!stream) {
        stat.textContent = '当前浏览器不支持画面录制';
        LB.fail('GIF 转视频', '当前浏览器不支持画面捕获', '请用 Chrome / Edge 打开');
        return;
      }
      const mime = pickMime();
      if (!mime) {
        stat.textContent = '当前浏览器没有可用的视频编码器';
        LB.fail('GIF 转视频', '没有可用的视频编码器', '请用 Chrome / Edge 打开');
        return;
      }

      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { rec.onstop = res; });
      rec.start();

      for (let i = 0; i < dec.frames.length; i++) {
        const f = dec.frames[i];
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(f.canvas, 0, 0);
        stat.textContent = '录制中 ' + (i + 1) + ' / ' + dec.frames.length + ' 帧…';
        await sleep(Math.max(20, f.delay));
      }
      /* 末尾多留一帧时长，避免最后一帧被编码器截掉 */
      await sleep(140);
      rec.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error('录制结果为空，请重试或改用更短的 GIF');

      revoke(g2vUrl);
      g2vUrl = URL.createObjectURL(blob);
      const vid = $('#gvPreview', rootEl);
      vid.src = g2vUrl;
      const dl = $('#gvDl', rootEl);
      dl.setAttribute('download', 'litebox.' + (mime.indexOf('mp4') > -1 ? 'mp4' : 'webm'));
      out.hidden = false;
      stat.textContent = '已生成 ' + LB.img.fmtSize(blob.size) + ' · ' + dec.width + '×' + dec.height +
        ' · ' + dec.frames.length + ' 帧 · ' + (mime.indexOf('mp4') > -1 ? 'MP4' : 'WebM');
      LB.toast('视频已生成', 'ok');
    } catch (e) {
      stat.textContent = '转换失败：' + (e && e.message ? e.message : '未知错误');
      LB.toast(stat.textContent, 'err');
    }
  }

  function g2vDownload() {
    if (!g2vUrl) return;
    fetch(g2vUrl).then(r => r.blob())
      .then(b => LB.img.download(b, $('#gvDl', rootEl).getAttribute('download') || 'litebox.webm'))
      .catch(() => LB.toast('下载失败', 'err'));
  }

  /* =========================================================
   * HTML
   * ========================================================= */
  const BACK = '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>';

  function html() {
    return (
      '<div class="tool-head">' + BACK +
      '<div><h1>GIF 制作</h1><p>多图合成、视频转 GIF、GIF 转图片 / 视频，全部在本地完成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      /* ---- 四个模式 ---- */
      '<div class="seg seg-4 gm-modes" id="gmModes">' +
      '<button class="gm-mode on" data-m="compose" type="button">📷 多图合成</button>' +
      '<button class="gm-mode" data-m="v2g" type="button">🎬 视频转 GIF</button>' +
      '<button class="gm-mode" data-m="g2i" type="button">🖼️ GIF 转图片</button>' +
      '<button class="gm-mode" data-m="g2v" type="button">🎥 GIF 转视频</button>' +
      '</div>' +

      /* ============ 模式 1 · 多图合成 ============ */
      '<div id="gmPaneCompose">' +
      '<div class="dropzone" id="gmZone">点击选择多张图片（可继续追加），或拖入 / Ctrl+V 粘贴</div>' +
      '<input type="file" id="gmFile" accept="image/*" multiple hidden>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">已选帧 <span id="gmCount" class="gm-count"></span></span>' +
      '<div class="gm-thumbs" id="gmThumbs"></div>' +
      '<p class="cd-note" id="gmHint"></p>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">生成设置</span>' +
      '<div class="gm-grid">' +
      '<label class="gm-lab">帧率 <output id="gmFpsV">12</output> fps' +
      '<input type="range" id="gmFps" min="5" max="30" step="1" value="12"></label>' +
      '<label class="gm-lab">尺寸（宽）<select class="inp" id="gmSize">' +
      '<option value="480">480</option>' +
      '<option value="320">320</option>' +
      '<option value="240">240</option>' +
      '<option value="0" selected>原尺寸</option>' +
      '</select></label>' +
      '<label class="gm-lab">循环<select class="inp" id="gmLoop">' +
      '<option value="0" selected>无限循环</option>' +
      '<option value="1">播 1 遍后停</option>' +
      '<option value="3">播 3 遍后停</option>' +
      '</select></label>' +
      '</div>' +
      '<p class="cd-note">「播 N 遍后停」直接写入 GIF 文件头的 NETSCAPE2.0 循环字段，' +
      '下载下来的动图在任何播放器里都是播完即停，无需再设置。</p>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="gmGo" type="button" disabled>生成 GIF</button>' +
      '<button class="btn btn-ghost" id="gmClear" type="button">清空</button>' +
      '</div>' +
      '<p class="jst" id="gmStat"></p>' +
      '<div class="tool-sec" id="gmOut" hidden>' +
      '<span class="tool-lab">结果预览</span>' +
      '<div class="gm-result"><img id="gmPreview" alt="GIF 预览"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="gmDl" type="button">⬇ 下载 GIF</button>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* ============ 模式 2 · 视频转 GIF ============ */
      '<div id="gmPaneV2G" hidden>' +
      '<div class="dropzone" id="vgZone">点击选择一段视频（mp4 / webm / mov），或拖入</div>' +
      '<input type="file" id="vgFile" accept="video/*" hidden>' +
      '<p class="cd-note" id="vgName"></p>' +
      '<div class="gm-result"><video class="gm-video" id="vgPreview" controls playsinline hidden></video></div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">抓帧设置</span>' +
      '<div class="gm-grid">' +
      '<label class="gm-lab">起始时间 <output id="vgStartV">0</output> 秒' +
      '<input type="range" id="vgStart" min="0" max="60" step="0.5" value="0"></label>' +
      '<label class="gm-lab">截取时长 <output id="vgDurV">3</output> 秒' +
      '<input type="range" id="vgDur" min="0.5" max="15" step="0.5" value="3"></label>' +
      '<label class="gm-lab">帧率 <output id="vgFpsV">10</output> fps' +
      '<input type="range" id="vgFps" min="5" max="20" step="1" value="10"></label>' +
      '<label class="gm-lab">尺寸（宽）<select class="inp" id="vgSize">' +
      '<option value="640">640</option>' +
      '<option value="480" selected>480</option>' +
      '<option value="320">320</option>' +
      '<option value="0">原尺寸</option>' +
      '</select></label>' +
      '</div>' +
      '<p class="cd-note">按「起始时间 + 截取时长 × 帧率」逐帧 seek 抓取，同一段视频每次生成的帧序列完全一致。' +
      '单边最长 720 像素，避免逐帧绘制把手机卡死。</p>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="vgGo" type="button">🎬 生成 GIF</button>' +
      '<button class="btn btn-ghost" id="vgClear" type="button">清空</button>' +
      '</div>' +
      '<p class="jst" id="vgStat"></p>' +
      '<div class="tool-sec" id="vgOut" hidden>' +
      '<span class="tool-lab">结果预览</span>' +
      '<div class="gm-result"><img id="vgOutImg" alt="GIF 预览"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="vgDl" type="button">⬇ 下载 GIF</button>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* ============ 模式 3 · GIF 转图片 ============ */
      '<div id="gmPaneG2I" hidden>' +
      '<div class="dropzone" id="giZone">点击选择一个 GIF，或拖入</div>' +
      '<input type="file" id="giFile" accept="image/gif" hidden>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="giClear" type="button">清空</button>' +
      '</div>' +
      '<p class="jst" id="giStat"></p>' +
      '<div class="tool-sec" id="giOut" hidden>' +
      '<span class="tool-lab">每一帧（点缩略图右下角 ⬇ 下载单帧）</span>' +
      '<div class="gi-grid" id="giGrid"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="giZip" type="button">⬇ 打包下载 ZIP</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">按 GIF 规范逐帧叠加（含 disposal 处理），导出的是「每帧最终看到的画面」而不是局部补丁。' +
      '帧数上限 100，超大 GIF 会等比缩小以免浏览器内存溢出。</p>' +
      '</div>' +

      /* ============ 模式 4 · GIF 转视频 ============ */
      '<div id="gmPaneG2V" hidden>' +
      '<div class="dropzone" id="gvZone">点击选择一个 GIF，或拖入</div>' +
      '<input type="file" id="gvFile" accept="image/gif" hidden>' +
      '<p class="jst" id="gvStat"></p>' +
      '<div class="tool-sec" id="gvOut" hidden>' +
      '<span class="tool-lab">结果预览</span>' +
      '<div class="gm-result"><video class="gm-video" id="gvPreview" controls playsinline></video></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="gvDl" type="button">⬇ 下载视频</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">逐帧绘制到 canvas，用 MediaRecorder 录成视频；按原 GIF 的帧间隔保持播放节奏。' +
      '输出格式取决于浏览器支持的编码器（Chrome / Edge 通常为 WebM）。</p>' +
      '</div>' +

      '<p class="cd-note">全部在浏览器本地合成，图片与视频不会上传任何服务器。' +
      'GIF 编码在 Web Worker 中进行，帧数越多耗时越长（建议 30 帧以内）。</p>' +
      '</div>'
    );
  }

  /* =========================================================
   * 模式切换
   * ========================================================= */
  function setMode(m) {
    if (mode === m) return;
    mode = m;
    $$('.gm-mode', rootEl).forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#gmPaneCompose', rootEl).hidden = m !== 'compose';
    $('#gmPaneV2G', rootEl).hidden = m !== 'v2g';
    $('#gmPaneG2I', rootEl).hidden = m !== 'g2i';
    $('#gmPaneG2V', rootEl).hidden = m !== 'g2v';
  }

  /* =========================================================
   * mount / unmount
   * ========================================================= */
  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    mode = 'compose';
    files = []; revUrls();
    revoke(previewUrl); previewUrl = '';
    vFile = null; revoke(vPreviewUrl); vPreviewUrl = '';
    g2iFrames = [];
    revoke(g2vUrl); g2vUrl = '';
    pasteCleanups = [];

    /* --- 模式切换 --- */
    $('#gmModes', root).addEventListener('click', e => {
      const b = e.target.closest('.gm-mode');
      if (b) setMode(b.dataset.m);
    });

    /* --- 模式 1 --- */
    LB.img.bindDrop($('#gmZone', root), $('#gmFile', root), addFiles);
    /* 粘贴只在「多图合成」模式下接管：否则在 GIF 模式里粘贴一张图会莫名其妙加进合成队列 */
    pasteCleanups.push(LB.img.bindPasteAll(root, list => { if (mode === 'compose') addFiles(list); }));
    $('#gmThumbs', root).addEventListener('click', e => {
      const b = e.target.closest('.gm-del');
      if (b) removeAt(parseInt(b.dataset.i, 10));
    });
    $('#gmFps', root).addEventListener('input', e => { $('#gmFpsV', root).textContent = e.target.value; });
    $('#gmGo', root).addEventListener('click', composeMake);
    $('#gmClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, composeClear));
    $('#gmDl', root).addEventListener('click', downloadCompose);

    /* --- 模式 2 --- */
    bindFilePick($('#vgZone', root), $('#vgFile', root), isVideo, v2gPick);
    [['#vgStart', '#vgStartV'], ['#vgDur', '#vgDurV'], ['#vgFps', '#vgFpsV']].forEach(pair => {
      $(pair[0], root).addEventListener('input', e => { $(pair[1], root).textContent = e.target.value; });
    });
    $('#vgGo', root).addEventListener('click', v2gMake);
    $('#vgClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, v2gReset));
    $('#vgDl', root).addEventListener('click', downloadV2G);

    /* --- 模式 3 --- */
    bindFilePick($('#giZone', root), $('#giFile', root), isGif, list => g2iRun(list[0]));
    $('#giGrid', root).addEventListener('click', e => {
      const b = e.target.closest('[data-dl]');
      if (b) g2iDownload(parseInt(b.dataset.dl, 10));
    });
    $('#giZip', root).addEventListener('click', g2iZip);
    $('#giClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, g2iClear));

    /* --- 模式 4 --- */
    bindFilePick($('#gvZone', root), $('#gvFile', root), isGif, list => g2vRun(list[0]));
    $('#gvDl', root).addEventListener('click', g2vDownload);

    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function downloadCompose() {
    const src = $('#gmPreview', rootEl).src;
    if (!src) return;
    fetch(src).then(r => r.blob()).then(b => LB.img.download(b, 'litebox.gif'))
      .catch(() => LB.toast('下载失败', 'err'));
  }

  function downloadV2G() {
    const src = $('#vgOutImg', rootEl).src;
    if (!src) return;
    fetch(src).then(r => r.blob()).then(b => LB.img.download(b, 'litebox-video.gif'))
      .catch(() => LB.toast('下载失败', 'err'));
  }

  function unmount() {
    revoke(previewUrl); previewUrl = '';
    revoke(vPreviewUrl); vPreviewUrl = '';
    revoke(g2vUrl); g2vUrl = '';
    g2iFrames.forEach(f => revoke(f.url));
    g2iFrames = [];
    revUrls();
    files = [];
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('gifmake', { mount, unmount });
})();
