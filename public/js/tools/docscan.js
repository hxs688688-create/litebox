/* LiteBox v5 · tools/docscan.js — 文档矫正（拖四角逐透视校正 + 自动白纸增强）
 *
 * 【算法链路】
 *   源图4 角（拖动得到）→ 单应性矩阵 H（8 元一次方程组）→
 *   目标矩形逐像素**反向映射**回源图 → 双线性插值取色→ 白纸增强
 *
 * 【为什么必须反向映射，不能正向映射】
 *   正向（源→目标）对每个源像素算目标位置，落在非整数位置的像素会丢失，
 *   输出出现空洞/锯齿。反向映射（目标→源）保证每个目标像素都有值，
 *   这是图像变换的标准做法。
 *
 * 【为什么用双线性插值，不能用最近邻】
 *   最近邻只取 1 个邻居，放大 2倍会出现明显的马赛克块；
 *   双线性取 4 个邻居加权，边缘平滑。任务书「关键提醒」第 4 条也点名了这点。
 */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let img = null;            /* HTMLImageElement */
  let srcCv = null;          /* 显示用的源图 canvas（已缩放到可操作尺寸） */
  let pts = [];/* 4 个角点，坐标系 = srcCv 的 CSS 像素 */
  let handles = [];          /* 4 个 DOM 手柄 */
  let dragIdx = -1;
  let pasteCleanups = [];
  const MAX_SIDE = 1400;     /* 交互画布上限，避免手机上拖不动超大图 */

  /* ---------- 数学：求单应性矩阵 ---------- */

  /* 高斯消元（含部分主元选取）解 A x = b，A 为 n×n。返回 null 表示矩阵奇异。
     任务书示例没做除零保护：四角共线时主元为 0 会算出 Infinity/NaN，
     整个结果变成空白图且不报错。这里加了零主元判定。 */
  function solveN(A, b, n) {
    const M = [];
    for (let i = 0; i < n; i++) { M.push(A[i].slice()); M[i].push(b[i]); }
    for (let i = 0; i < n; i++) {
      /* 选主元：绝对值最大的行换到当前行（部分主元法，数值稳定性更好） */
      let piv = i;
      for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
      if (Math.abs(M[piv][i]) < 1e-12) return null;   /* 奇异：四角退化/共线 */
      const t = M[i]; M[i] = M[piv]; M[piv] = t;
      for (let k = i + 1; k < n; k++) {
        const f = M[k][i] / M[i][i];
        if (!f) continue;
        for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n];
      for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
      x[i] = sum / M[i][i];
      if (!isFinite(x[i])) return null;
    }
    return x;
  }

  /* 由 4 对对应点求 3×3 单应性矩阵（h33 归一化为 1） */
  function getPerspectiveTransform(src, dst) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    const h = solveN(A, B, 8);
    if (!h) return null;
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }

  /* ---------- 交互画布与手柄 ---------- */

  function layout() {
    if (!srcCv) return;
    /* canvas 内部是原始尺寸，CSS 缩放过。pts 存 CSS 像素，
       换算回原始像素时要乘scale —— 手机的 devicePixelRatio 也已含在 CSS 缩放里。 */
    const rect = srcCv.getBoundingClientRect();
    const kx = srcCv.width / rect.width;
    const ky = srcCv.height / rect.height;
    return { rect: rect, kx: kx, ky: ky };
  }

  function drawOverlay() {
    if (!srcCv) return;
    const g = $('#dsOverlay', rootEl);
    const w = srcCv.clientWidth, h = srcCv.clientHeight;
    if (g.width !== (w * devicePixelRatio) || g.height !== (h * devicePixelRatio)) {
      g.width = w * devicePixelRatio; g.height = h * devicePixelRatio;
    }
    g.style.width = w + 'px'; g.style.height = h + 'px';
    const ctx = g.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    /* 4 条边 + 半透明遮罩，标出要拉正的区域 */
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,90,230,.14)';
    ctx.fill();
    ctx.strokeStyle = '#4a5ae6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function placeHandles() {
    for (let i = 0; i < 4; i++) {
      const h = handles[i];
      if (!h) continue;
      h.style.left = pts[i][0] + 'px';
      h.style.top = pts[i][1] + 'px';
    }
  }

  function refresh() { drawOverlay(); placeHandles(); }

  function clampPts() {
    const w = srcCv.clientWidth, h = srcCv.clientHeight;
    for (let i = 0; i < 4; i++) {
      pts[i][0] = Math.max(0, Math.min(w, pts[i][0]));
      pts[i][1] = Math.max(0, Math.min(h, pts[i][1]));
    }
  }

  function onDown(i, e) {
    dragIdx = i;
    handles[i].classList.add('on');
    /*必须 preventDefault：否则手机端会触发页面滚动 / 图片长按菜单，
       拖拽会「不跟手」，这正是任务书验收里「手机端拖拽跟手，不偏移」要防的。*/
    if (e.cancelable) e.preventDefault();
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function onMove(e) {
    if (dragIdx < 0) return;
    if (e.cancelable) e.preventDefault();
    const l = layout();
    if (!l) return;
    /* 用 clientX/Y - rect.left 换算到 CSS 像素。
       ★ 不能用 offsetX/offsetY：它们是相对 target 的，
       而 target 可能是手柄或 canvas，偏移量不一致会「拖拽偏移」。 */
    pts[dragIdx][0] = e.clientX - l.rect.left;
    pts[dragIdx][1] = e.clientY - l.rect.top;
    clampPts();
    refresh();
  }

  function onUp() {
    if (dragIdx < 0) return;
    handles[dragIdx].classList.remove('on');
    dragIdx = -1;
  }

  /* ---------- 拉正 ---------- */

  /* 目标矩形尺寸：取四条边长度的最大值取整。
     用 max 而不是平均：拖歪时四边不等长，取最大保证内容不裁掉。 */
  function targetSize() {
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const w = Math.max(d(pts[0], pts[1]), d(pts[3], pts[2]));
    const h = Math.max(d(pts[0], pts[3]), d(pts[1], pts[2]));
    return {
      w: Math.max(8, Math.round(w)),
      h: Math.max(8, Math.round(h))
    };
  }

  function warp() {
    const l = layout();
    if (!l) { LB.toast('请先上传图片', 'err'); return; }
    const ts = targetSize();

    /* CSS 像素 → 源图像素 */
    const src = pts.map(p => [p[0] * l.kx, p[1] * l.ky]);
    const dst = [[0, 0], [ts.w, 0], [ts.w, ts.h], [0, ts.h]];

    const H = getPerspectiveTransform(src, dst);
    if (!H) {
      LB.toast('四角不能共线或重合，请把四个角分开摆好', 'err');
      return;
    }

    const sw = srcCv.width, sh = srcCv.height;
    const sctx = srcCv.getContext('2d', { willReadFrequently: true });
    const srcData = sctx.getImageData(0, 0, sw, sh).data;

    /* 输出上限 2400边长：透视变换是逐像素 JS 循环，
       3000×3000 要跑约 900 万次插值，浏览器会卡十几秒。*/
    const cap = Math.min(1, 2400 / Math.max(ts.w, ts.h));
    const ow = Math.max(8, Math.round(ts.w * cap));
    const oh = Math.max(8, Math.round(ts.h * cap));
    const scaleOut = ow / ts.w;   /* 若被 cap 缩放，H 的目标坐标要同比缩放 */

    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    const octx = out.getContext('2d');
    const imgData = octx.createImageData(ow, oh);
    const o = imgData.data;

    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const dx = x / scaleOut, dy = y / scaleOut;   /* 回到 H 的目标坐标系 */
        const w = H[2][0] * dx + H[2][1] * dy + H[2][2];
        if (Math.abs(w) < 1e-12) continue;
        const sx = (H[0][0] * dx + H[0][1] * dy + H[0][2]) / w;
        const sy = (H[1][0] * dx + H[1][1] * dy + H[1][2]) / w;
        if (sx < 0 || sx > sw - 1 || sy < 0 || sy > sh - 1) continue;

        /* 双线性插值：取 4 个邻居加权 */
        const x0 = sx | 0, y0 = sy | 0;
        const x1 = x0 + 1 < sw ? x0 + 1 : x0;
        const y1 = y0 + 1 < sh ? y0 + 1 : y0;
        const fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
        const oi = (y * ow + x) * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy, w11 = fx * fy;
        for (let k = 0; k < 3; k++) {
          o[oi + k] = srcData[i00 + k] * w00 + srcData[i10 + k] * w10 +
                      srcData[i01 + k] * w01 + srcData[i11 + k] * w11;
        }
        o[oi + 3] = 255;   /* 区域外的像素留透明（alpha=0） */
      }
    }
    octx.putImageData(imgData, 0, 0);

    /* 白纸增强：直接复用 fix.js 挂在 LB.img 上的实现（不复制算法） */
    let enhanced = false;
    if (typeof LB.img.whiteEnhance === 'function') {
      try { LB.img.whiteEnhance(octx, ow, oh); enhanced = true; }
      catch (_) { enhanced = false; }
    }

    const box = $('#dsOut', rootEl);
    box.innerHTML = '';
    box.appendChild(out);
    $('#dsOutSec', rootEl).hidden = false;
    $('#dsStat', rootEl).textContent =
      '已拉正 ' + ow + '×' + oh + (enhanced ? ' · 已自动白纸增强' : ' · （白纸增强不可用，未应用）');
    LB.toast('拉正完成', 'ok');
  }

  function save() {
    const out = $('#dsOut', rootEl).querySelector('canvas');
    if (!out) { LB.toast('还没有结果', 'err'); return; }
    LB.img.toBlob(out, 'image/png')
      .then(b => LB.img.download(b, 'litebox-docscan.png'))
      .catch(() => LB.toast('导出失败', 'err'));
  }

  function reset() {
    const w = srcCv.clientWidth, h = srcCv.clientHeight;
    /* 默认取画布四角内缩 6%，比死贴四角更符合「先微调再精调」的手感 */
    const ix = w * 0.06, iy = h * 0.06;
    pts = [[ix, iy], [w - ix, iy], [w - ix, h - iy], [ix, h - iy]];
    $('#dsOutSec', rootEl).hidden = true;
    $('#dsStat', rootEl).textContent = '';
    refresh();
  }

  async function onFiles(files) {
    const f = files && files[0];
    if (!f) return;
    let el;
    try { el = await LB.img.load(f); }
    catch (e) { LB.toast(e.message || '图片解码失败', 'err'); return; }
    img = el;
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    const sz = LB.img.fitSize(nw, nh, MAX_SIDE);
    srcCv = document.createElement('canvas');
    srcCv.width = sz.w; srcCv.height = sz.h;
    const ctx = srcCv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(el, 0, 0, sz.w, sz.h);

    const wrap = $('#dsWrap', rootEl);
    wrap.innerHTML = '';
    wrap.appendChild(srcCv);
    const ov = document.createElement('canvas');
    ov.id = 'dsOverlay';
    ov.className = 'ds-overlay';
    wrap.appendChild(ov);
    /* 手柄：4 个 div，absolute 定位在 wrap 内 */
    handles = [];
    for (let i = 0; i < 4; i++) {
      const hEl = document.createElement('div');
      hEl.className = 'ds-h';
      hEl.dataset.i = i;
      hEl.setAttribute('role', 'slider');
      hEl.setAttribute('aria-label', '第' + (i + 1) + '个角点');
      hEl.addEventListener('pointerdown', e => onDown(i, e));
      wrap.appendChild(hEl);
      handles.push(hEl);
    }
    $('#dsPick', rootEl).hidden = true;
    $('#dsWork', rootEl).hidden = false;
    /* 等布局完成（CSS max-width 生效后 clientWidth 才是真实值）再放点 */
    requestAnimationFrame(() => { reset(); });
  }

  function reselect() {
    img = null; srcCv = null; pts = []; handles = [];
    $('#dsWork', rootEl).hidden = true;
    $('#dsPick', rootEl).hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文档矫正</h1><p>拍摄的课件、书页透视校正，拖动四角拉正成矩形文档</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="dsPick">' +
      '<div class="dropzone" id="dsZone">点击选择一张拍摄的文档照片，或拖入 / Ctrl+V 粘贴</div>' +
      '<input type="file" id="dsFile" accept="image/*" hidden>' +
      '</div>' +
      '<div id="dsWork" hidden>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">① 拖动四个圆点，对齐文档的四个角</span>' +
      '<div class="ds-canvas-wrap" id="dsWrap"></div>' +
      '<p class="cd-note">角点可以拖到图片边缘外侧一点点，裁切时用外框为准；四角不要共线或重合。</p>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="dsGo" type="button">② 拉正</button>' +
      '<button class="btn btn-ghost" id="dsReset" type="button">重置四角</button>' +
      '<button class="btn btn-ghost" id="dsRe" type="button">换图</button>' +
      '</div>' +
      '<p class="jst" id="dsStat"></p>' +
      '<div class="tool-sec" id="dsOutSec" hidden>' +
      '<span class="tool-lab">拉正结果（已自动白纸增强）</span>' +
      '<div class="ds-out" id="dsOut"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="dsSave" type="button">⬇ 下载 PNG</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">全部在本地完成，照片不会上传。双线性插值 + 反向映射保证放大不出现马赛克；' +
      '输出边长上限 2400 像素，超大图会等比缩小以免浏览器长时间无响应。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    img = null; srcCv = null; pts = []; handles = []; dragIdx = -1;

    LB.img.bindDrop($('#dsZone', root), $('#dsFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    /* pointermove/up挂在 window 上：手指/鼠标移出手柄本身时也要继续跟手，
       只挂在手柄上会出现「按住拖到边缘就卡住」的问题。 */
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    $('#dsGo', root).addEventListener('click', warp);
    $('#dsReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, reset));
    $('#dsRe', root).addEventListener('click', reselect);
    $('#dsSave', root).addEventListener('click', save);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    /* 必须解window 监听 —— 否则离开页面后pointermove 仍在跑，
       onMove 里访问 rootEl 会报错，且 4 个手柄的 DOM 已被移除。 */
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    img = null; srcCv = null; pts = []; handles = []; dragIdx = -1;
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('docscan', { mount, unmount });
})();
