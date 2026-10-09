/* LiteBox v5 · tools/fix.js — 图片修复去水印（涂抹/框选 + 加权边界扩散智能填充）
   Step 14：移除「试卷模式」（已独立为 handwriting-remove 工具），并新增「↺ 重新上传」。 */
(function () {
  'use strict';

  const { $, $$, clamp } = LB.dom;
  let rootEl = null;
  let srcImg = null;
  let cv = null, cover = null;      /* 底层图片 / 顶层蒙版 */
  let ictx = null, mctx = null;
  let mode = 'brush';               /* brush | rect */
  let brush = 28;
  let painting = false, last = null, rectStart = null;
  let undoStack = [];               /* 智能填充前 push，最多 5 层 */
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  let maskColor = 'rgba(255,255,255,.5)'; /* 兜底，实际从 tokens 读取 */

  const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;

  /* 屏幕坐标 → canvas 像素（Step 5D-1：用底层 canvas rect，scaleX/scaleY 分开换算） */
  function toXY(e) {
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width;
    const scaleY = cv.height / rect.height;
    return {
      x: clamp((e.clientX - rect.left) * scaleX, 0, cv.width),
      y: clamp((e.clientY - rect.top) * scaleY, 0, cv.height)
    };
  }

  function setBrush(v) {
    brush = clamp(parseInt(v, 10) || 28, 8, 90);
    mctx.lineWidth = brush * 2;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.strokeStyle = mctx.fillStyle = maskColor; /* canvas 重置会清空全部 ctx 状态，颜色统一在此恢复 */
  }

  /* ============ 蒙版绘制 ============ */
  function showRect(x, y, w, h) {
    const wrap = $('#fxWrap', rootEl);
    const r = $('#fxRect', rootEl);
    const wr = wrap.getBoundingClientRect();
    const cr = cover.getBoundingClientRect();
    const offX = cr.left - wr.left, offY = cr.top - wr.top;
    const k = cr.width / cv.width; /* canvas 像素 → CSS 像素 */
    r.hidden = false;
    r.style.left = (offX + x * k) + 'px';
    r.style.top = (offY + y * k) + 'px';
    r.style.width = (w * k) + 'px';
    r.style.height = (h * k) + 'px';
  }

  function updateCursor(e) {
    const cur = $('#fxCursor', rootEl);
    if (mode === 'rect' || !srcImg) { cur.hidden = true; return; }
    const wrap = $('#fxWrap', rootEl);
    const wr = wrap.getBoundingClientRect();
    const size = brush * 2; /* 与 lineWidth 一致 */
    cur.hidden = false;
    cur.style.width = size + 'px';
    cur.style.height = size + 'px';
    cur.style.left = (e.clientX - wr.left) + 'px';
    cur.style.top = (e.clientY - wr.top) + 'px';
  }

  function bindPointer() {
    /* Step 5D-1：cover 已设 pointer-events:none（任务规则 2），事件统一绑到底层 canvas */
    cv.addEventListener('pointerdown', e => {
      if (!srcImg) return;
      cv.setPointerCapture(e.pointerId); /* 移动端持续跟踪 */
      const p = toXY(e);
      if (mode === 'brush') {
        painting = true;
        last = p;
        mctx.beginPath();
        mctx.moveTo(p.x, p.y);
        mctx.lineTo(p.x + 0.01, p.y + 0.01);
        mctx.stroke();
      } else {
        rectStart = p;
        showRect(p.x, p.y, 0, 0);
      }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      updateCursor(e);
      if (mode === 'brush' && painting) {
        /* 从上一个点到当前点连线，避免快速拖动断点 */
        const p = toXY(e);
        mctx.beginPath();
        mctx.moveTo(last.x, last.y);
        mctx.lineTo(p.x, p.y);
        mctx.stroke();
        last = p;
        e.preventDefault();
      } else if (mode === 'rect' && rectStart) {
        const p = toXY(e);
        showRect(Math.min(rectStart.x, p.x), Math.min(rectStart.y, p.y),
                 Math.abs(p.x - rectStart.x), Math.abs(p.y - rectStart.y));
        e.preventDefault();
      }
    });
    const finish = e => {
      if (mode === 'brush') {
        painting = false;
      } else if (rectStart) {
        const p = toXY(e);
        const w = Math.abs(p.x - rectStart.x), h = Math.abs(p.y - rectStart.y);
        if (w >= 4 && h >= 4) {
          mctx.fillRect(Math.min(rectStart.x, p.x), Math.min(rectStart.y, p.y), w, h);
        }
        rectStart = null;
        $('#fxRect', rootEl).hidden = true;
      }
    };
    cv.addEventListener('pointerup', finish);
    cv.addEventListener('pointercancel', finish);
    cv.addEventListener('pointerleave', () => { $('#fxCursor', rootEl).hidden = true; });
  }

  /* ============ 智能填充（Step 5E：加权边界扩散 + 每通道噪声 + 边缘羽化 + 超 3 秒提示） ============ */
  function smartFill() {
    if (!srcImg) { LB.toast('请先上传图片', 'info'); return; }
    const W = cv.width, H = cv.height;
    const md = mctx.getImageData(0, 0, W, H).data;
    const pending = [];
    for (let i = 0; i < W * H; i++) {
      if (md[i * 4 + 3] > 40) pending.push(i); /* alpha > 40 视为待填充 */
    }
    if (!pending.length) { LB.toast('请先涂抹或框选要消除的区域', 'info'); return; }
    if (pending.length > W * H * 0.9) { LB.toast('几乎全图被选中，结果可能不理想', 'warn'); return; }
    setTimeout(() => doFill(W, H, pending), 50); /* 让点击反馈先渲染 */
  }

  function doFill(W, H, pending) {
    /* 撤销栈：填充前 push，最多 5 层（beforeImageData 语义保持不变） */
    undoStack.push(ictx.getImageData(0, 0, W, H));
    if (undoStack.length > 5) undoStack.shift();

    const imgData = ictx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const mask = new Uint8Array(W * H);  /* 1 = 待填充区（羽化定位用） */
    const known = new Uint8Array(W * H); /* 1 = 颜色已知 */
    known.fill(1);
    for (const p of pending) { known[p] = 0; mask[p] = 1; }

    const t0 = performance.now();
    let remaining = pending.length;
    let list = pending;
    let round = 0;
    let warned = false;

    /* 单轮扩散：每个待填像素取已知邻居的加权平均（正交权重 2、对角权重 1，越近权重越大），
       从边界向内一层层生长，填充色与边界保持一致，不再出现均值发白 */
    function dilateRound() {
      const next = [];
      const updates = [];
      for (const p of list) {
        const x = p % W, y = (p / W) | 0;
        let r = 0, g = 0, b = 0, wsum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          const nrow = ny * W;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            const ni = nrow + nx;
            if (!known[ni]) continue;
            const w = (dx === 0 || dy === 0) ? 2 : 1;
            r += d[ni * 4] * w;
            g += d[ni * 4 + 1] * w;
            b += d[ni * 4 + 2] * w;
            wsum += w;
          }
        }
        if (wsum > 0) updates.push(p, r / wsum, g / wsum, b / wsum);
        else next.push(p);
      }
      /* 本轮统一应用（延迟写回，避免影响邻居判断）；每通道独立 ±2 噪声，消除色块感 */
      for (let k = 0; k < updates.length; k += 4) {
        const i = updates[k];
        d[i * 4]     = clamp255(updates[k + 1] + (Math.random() - 0.5) * 4);
        d[i * 4 + 1] = clamp255(updates[k + 2] + (Math.random() - 0.5) * 4);
        d[i * 4 + 2] = clamp255(updates[k + 3] + (Math.random() - 0.5) * 4);
        d[i * 4 + 3] = 255;
        known[i] = 1;
        remaining--;
      }
      list = next;
      round++;
      return updates.length / 4;
    }

    /* 边缘羽化：填充区与原图交界 2px 带内，向 3×3 邻域均值靠拢（越近边界混合越强），消除硬分界 */
    function featherEdges() {
      const feather = 2;
      for (let y = 0; y < H; y++) {
        const row = y * W;
        for (let x = 0; x < W; x++) {
          const i = row + x;
          if (!mask[i]) continue;
          let minDist = 999;
          for (let dy = -feather; dy <= feather; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -feather; dx <= feather; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= W) continue;
              if (!mask[ny * W + nx]) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) minDist = dist;
              }
            }
          }
          if (minDist > feather) continue;
          let r = 0, g = 0, b = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= W) continue;
              const ni = ny * W + nx;
              r += d[ni * 4]; g += d[ni * 4 + 1]; b += d[ni * 4 + 2]; n++;
            }
          }
          const alpha = 0.5 * (1 - minDist / feather);
          d[i * 4]     = Math.round(d[i * 4]     * (1 - alpha) + (r / n) * alpha);
          d[i * 4 + 1] = Math.round(d[i * 4 + 1] * (1 - alpha) + (g / n) * alpha);
          d[i * 4 + 2] = Math.round(d[i * 4 + 2] * (1 - alpha) + (b / n) * alpha);
        }
      }
    }

    /* 分块执行：每帧预算约 40ms，不阻塞 UI；累计超过 3 秒提示"填充中…"（只提示一次） */
    function chunk() {
      const frameStart = performance.now();
      let filledN = 0;
      while (remaining > 0 && round < 200) { /* MAX_ITER = 200 防死循环 */
        filledN = dilateRound();
        if (!filledN) break; /* 无进展（极端全选情况），提前收尾 */
        if (performance.now() - frameStart > 40) break;
      }
      if (!warned && performance.now() - t0 > 3000) {
        LB.toast('填充中…', 'info');
        warned = true;
      }
      if (remaining > 0 && round < 200 && filledN > 0) {
        requestAnimationFrame(chunk);
      } else {
        featherEdges();
        ictx.putImageData(imgData, 0, 0);
        mctx.clearRect(0, 0, W, H); /* 清空蒙版 */
        LB.toast('填充完成', 'ok');
      }
    }
    chunk();
  }

  /* ============ 白纸增强（Step 6D · 供文档类工具复用）============
     原理：1%/99% 分位数做线性拉伸（跳过 1% 噪点，避免个别异常像素拉偏整体），
     再把 220+ 的亮部统一提到 245+，让纸张更白、印刷文字对比更明显。
     ★ 只做整体对比拉伸，不做二值化 —— 印刷笔画不会被淡化。
     Step 14：本工具不再自动调用，仅通过 LB.img.whiteEnhance 供 docscan 复用。 */
  function whiteEnhance(ctx, W, H) {
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const n = W * H;

    const lum = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
    }
    /* 用 256 桶计数求分位数：直接 Array.sort 在 1500×1500（约 225 万像素）上会卡住秒级 */
    const bucket = new Uint32Array(256);
    for (let i = 0; i < n; i++) bucket[lum[i]]++;
    const loTarget = (n * 0.01) | 0, hiTarget = (n * 0.99) | 0;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += bucket[v]; if (acc > loTarget) { lo = v; break; } }
    acc = 0;
    for (let v = 0; v < 256; v++) { acc += bucket[v]; if (acc >= hiTarget) { hi = v; break; } }

    const range = Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      for (let k = 0; k < 3; k++) {
        let v = ((d[o + k] - lo) / range) * 255;
        if (v < 0) v = 0; else if (v > 255) v = 255;
        /* 提升白场：220+ 拉到 245+，纸张更白 */
        if (v > 220) v = Math.min(255, 245 + (v - 220) * 0.5);
        d[o + k] = v;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /* ============ 按住看原图 ============ */
  function bindPeek() {
    const btn = $('#fxPeek', rootEl);
    let peekSnap = null; /* 按下前快照当前结果 */
    btn.addEventListener('pointerdown', e => {
      if (!srcImg) return;
      btn.setPointerCapture(e.pointerId);
      peekSnap = ictx.getImageData(0, 0, cv.width, cv.height);
      ictx.drawImage(srcImg, 0, 0, cv.width, cv.height); /* 临时换原图 */
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, () => {
      if (!srcImg || !peekSnap) return;
      ictx.putImageData(peekSnap, 0, 0); /* 换回填充结果 */
      peekSnap = null;
    }));
  }

  /* ============ 加载 / 视图 ============ */
  async function onFiles(files) {
    const f = files[0];
    if (!f) return;
    let img;
    try {
      img = await LB.img.load(f);
    } catch (e) {
      LB.toast(e.message || '图片解码失败', 'err');
      return;
    }
    srcImg = img;
    undoStack = [];
    /* Step 5D-1 统一规则 5：等比缩放尺寸，底层与蒙版 canvas 属性完全一致，clearRect 后 4 参绘制整图 */
    const { w, h } = LB.img.fitSize(img.naturalWidth, img.naturalHeight, 1500);
    cv.width = w; cv.height = h;
    cover.width = w; cover.height = h;   /* 必须与底层一致 */
    ictx.imageSmoothingQuality = 'high';
    ictx.clearRect(0, 0, w, h);
    ictx.drawImage(img, 0, 0, w, h);     /* 宽高都要传，画满整个 canvas */
    mctx.clearRect(0, 0, w, h);
    console.log('[fix] canvas 自检 base=' + cv.width + 'x' + cv.height + ' cover=' + cover.width + 'x' + cover.height);
    setBrush(brush); /* canvas 尺寸重置会清空全部 ctx 状态（含颜色），统一在此恢复 */
    $('#fxPick', rootEl).hidden = true;
    $('#fxWork', rootEl).hidden = false;
  }

  /* Step 14：重新上传 —— 清空当前状态并回到上传区，无需刷新页面 */
  function reselect() {
    srcImg = null;
    undoStack = [];
    painting = false;
    rectStart = null;
    if (cv) { cv.width = cv.height = 1; }
    if (cover) { cover.width = cover.height = 1; }
    $('#fxPick', rootEl).hidden = false;
    $('#fxWork', rootEl).hidden = true;
    $('#fxRect', rootEl).hidden = true;
    $('#fxCursor', rootEl).hidden = true;
    /* 清空文件输入，允许重复选择同一个文件 */
    const fi = $('#fxFile', rootEl);
    if (fi) fi.value = '';
    LB.toast('已重置，可重新选择图片', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片修复去水印</h1><p>涂抹或框选水印、字迹、路人，周边智能填充，全部本地处理</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="fxPick">' +
      '<div class="dropzone" id="fxZone">点击选择、拖入一张图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="fxFile" accept="image/*" hidden>' +
      '</div>' +
      '<div id="fxWork" hidden>' +
      '<div class="tool-sec"><div class="fx-head">' +
      '<span class="tool-lab" id="fxGuide">涂抹或框选要消除的区域，然后点"智能填充"</span>' +
      '<button class="btn btn-ghost btn-sm" id="fxReupload" type="button">↺ 重新上传</button>' +
      '</div>' +
      '<div class="crop-wrap" id="fxWrap">' +
      '<canvas id="fxCv" width="0" height="0"></canvas>' +
      '<canvas id="fxCover" class="cover" width="0" height="0"></canvas>' +
      '<div id="fxRect" hidden></div>' +
      '<div id="fxCursor" hidden></div>' +
      '</div></div>' +
      '<div class="tool-sec"><span class="tool-lab">模式</span>' +
      '<div class="seg seg-2" id="fxMode">' +
      '<button class="seg-btn on" data-m="brush" type="button">涂抹</button>' +
      '<button class="seg-btn" data-m="rect" type="button">框选</button>' +
      '</div>' +
      '<div class="field" id="fxBrushRow"><label>笔刷</label><input type="range" id="fxBrush" min="8" max="90" step="1" value="28"><output id="fxBrushV">28</output></div>' +
      '</div>' +
      '<div class="tip-dim">纯色背景效果最佳；复杂纹理建议少量多次涂抹</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="fxUndo" type="button">撤销</button>' +
      '<button class="btn btn-ghost" id="fxPeek" type="button">按住看原图</button>' +
      '<button class="btn btn-main js-primary-submit" id="fxGo" type="button">智能填充</button>' +
      '<button class="btn btn-ok" id="fxDl" type="button">下载 PNG</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    srcImg = null; undoStack = []; painting = false; rectStart = null; mode = 'brush'; brush = 28;

    cv = $('#fxCv', root);
    cover = $('#fxCover', root);
    /* Step 5D-1 统一规则 2：底层 auto 高度等比自适应；蒙版 absolute 满铺贴合底层 */
    cv.style.width = '100%';
    cv.style.height = 'auto';
    cv.style.display = 'block';
    cv.style.borderRadius = '10px';
    cover.style.position = 'absolute';
    cover.style.left = '0';
    cover.style.top = '0';
    cover.style.width = '100%';
    cover.style.height = '100%';
    cover.style.pointerEvents = 'none';
    ictx = cv.getContext('2d', { willReadFrequently: true });
    mctx = cover.getContext('2d', { willReadFrequently: true });

    /* 蒙版颜色只从 tokens.css 读取 */
    const cs = getComputedStyle(document.documentElement);
    maskColor = cs.getPropertyValue('--fx-mask').trim() || maskColor;
    setBrush(brush); /* 同时设置画笔尺寸与颜色 */

    LB.img.bindDrop($('#fxZone', root), $('#fxFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));
    bindPointer();
    bindPeek();

    $('#fxMode', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#fxMode .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      mode = b.dataset.m;
      /* 笔刷行：涂抹需要，框选不需要 */
      $('#fxBrushRow', root).hidden = mode === 'rect';
      if (mode === 'rect') $('#fxCursor', root).hidden = true;
    });
    $('#fxReupload', root).addEventListener('click', reselect);
    $('#fxBrush', root).addEventListener('input', e => {
      $('#fxBrushV', root).textContent = e.target.value;
      setBrush(e.target.value);
    });
    $('#fxUndo', root).addEventListener('click', () => {
      const prev = undoStack.pop();
      if (!prev) { LB.toast('没有可撤销的操作', 'info'); return; }
      ictx.putImageData(prev, 0, 0);
      LB.toast('已撤销', 'ok');
    });
    $('#fxGo', root).addEventListener('click', smartFill);
    $('#fxDl', root).addEventListener('click', () => {
      if (!srcImg) { LB.toast('请先上传图片', 'info'); return; }
      LB.img.toBlob(cv, 'image/png').then(b => LB.img.download(b, 'fixed.png')).catch(() => LB.toast('导出失败', 'err'));
    });
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    srcImg = null; undoStack = []; cv = null; cover = null; ictx = null; mctx = null;
    rootEl = null;
  }

  LB.router.register('fix', { mount, unmount });

  /* Step 6G：把白纸增强挂到 LB.img 上，供 docscan（文档矫正）复用。
     任务书要求 docscan「拉正后自动应用白纸增强，复用 fix.js 里的 whiteEnhance」，
     但 whiteEnhance 原本是本文件的内部函数、没导出，docscan 拿不到。
     这里只做挂载，不复制实现 —— 复制一份的话两边算法会各自漂移，
     将来调整分位数阈值就只改得到一处，很容易出现「修复工具和矫正工具效果不一致」。 */
  LB.img = LB.img || {};
  LB.img.whiteEnhance = whiteEnhance;
})();
