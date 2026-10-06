/* LiteBox v5 · tools/docscan.js — 文档矫正（拖四角 → jscanify 拉正 + 自动白纸增强）
 *
 * 【Step 22 · 二：拉正引擎换成 jscanify】
 *   主路径：拖好的四角 → jscanify.extractPaper() → 底层 OpenCV.js 的
 *   getPerspectiveTransform + warpPerspective（C++/wasm，边缘与插值都比手写稳）。
 *   兜底：引擎脚本 8.99MB（vendor/jscanify.min.js = opencv.js + jscanify.js 合并单文件），
 *   首次点「拉正」才动态加载；加载/执行失败 → 回退 Step 19 的自研反向映射算法，
 *   并 toast「已使用简化模式」，功能不断档。
 *
 * 【自研兜底算法链路（保留原样）】
 *   源图4 角（拖动得到）→ 单应性矩阵 H（8 元一次方程组）→
 *   目标矩形逐像素**反向映射**回源图 → 双线性插值取色 → 白纸增强
 *
 * 【为什么必须反向映射，不能正向映射】
 *   正向（源→目标）对每个源像素算目标位置，落在非整数位置的像素会丢失，
 *   输出出现空洞/锯齿。反向映射（目标→源）保证每个目标像素都有值，
 *   这是图像变换的标准做法。jscanify 内部做的同样是反向映射。
 *
 * 【为什么用双线性插值，不能用最近邻】
 *   最近邻只取 1 个邻居，放大 2倍会出现明显的马赛克块；
 *   双线性取 4 个邻居加权，边缘平滑。任务书「关键提醒」第 4 条也点名了这点。
 *
 * 【Step 11 · B3：上传后"图片不显示"的根因】
 *   真正的原因不在本文件，而在 tools.css：
 *     .ds-canvas-wrap canvas{... background:var(--card2)}   ← 特异性 0,1,1
 *   这条规则会把容器里**每一个** canvas 都涂上不透明底色，
 *   而覆盖层 canvas（.ds-overlay，z-index:1）正好压在源图 canvas 上面，
 *   于是一整块纯色把源图盖住 —— 用户看到的就是空白卡片。
 *   tools.css 里已用更高特异性把 .ds-overlay 还原为透明；
 *   本文件同时按任务书要求做了三处加固：
 *     1) canvas 尺寸一律用 width/height **属性**设置（不用 CSS 定尺寸）
 *     2) drawImage 传 4 参数（dx, dy, dw, dh）
 *     3) 源图 canvas 就位后再建覆盖层与四角手柄，并对 clientWidth=0 的竞态重试
 */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let alive = false;         /* Step 22 · 二：引擎是异步加载的，回调前必须确认工具还在页面上 */
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

  /* Step 19 · 六（关键修复）：强制角点排序。
     手柄与角点是按下标绑定的，用户把角点拖过界（比如左上角拖到右下）
     后，下标顺序不再对应「左上→右上→右下→左下」，单应性方程组的
     点对映射随之错乱，输出就是一坨错位色块 + 斜线。
     这里在计算 H 之前按几何位置强制排序为 TL → TR → BR → BL：
     按 y 分组，y 小的两个是上边，上/下边内部再按 x 分左右。 */
  function orderCorners(points) {
    const sorted = [...points].sort((a, b) => a[1] - b[1]);
    const top1 = sorted[0], top2 = sorted[1], bot1 = sorted[2], bot2 = sorted[3];
    const [tl, tr] = top1[0] < top2[0] ? [top1, top2] : [top2, top1];
    const [bl, br] = bot1[0] < bot2[0] ? [bot1, bot2] : [bot2, bot1];
    return [tl, tr, br, bl];
  }

  /* 任两个角点太近（< 20px）视为重合，禁止拉正 */
  const MIN_CORNER_DIST = 20;
  function cornersTooClose(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (Math.hypot(list[i][0] - list[j][0], list[i][1] - list[j][1]) < MIN_CORNER_DIST) return true;
      }
    }
    return false;
  }

  /* 目标矩形尺寸：取四条边长度的最大值取整。
     用 max 而不是平均：拖歪时四边不等长，取最大保证内容不裁掉。
     入参为已排序的 TL/TR/BR/BL 角点。 */
  function targetSize(p) {
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const w = Math.max(d(p[0], p[1]), d(p[3], p[2]));
    const h = Math.max(d(p[0], p[3]), d(p[1], p[2]));
    return {
      w: Math.max(8, Math.round(w)),
      h: Math.max(8, Math.round(h))
    };
  }

  /* ---------- 引擎：jscanify（OpenCV.js）动态加载 ---------- */

  let busy = false;
  let enginePromise = null;

  function msg(e) { return (e && e.message) || String(e || '未知错误'); }

  function stat(t) { const s = $('#dsStat', rootEl); if (s) s.textContent = t; }

  /* vendor/jscanify.min.js = opencv.js + jscanify.js 合并的单文件（约 9MB），
     只在第一次点「拉正」时加载；LB.router.loadScript 内部缓存 Promise，
     失败时不缓存（下次点击可重试）。 */
  function loadEngine() {
    if (!enginePromise) {
      enginePromise = LB.router.loadScript('vendor/jscanify.min.js')
        .then(waitCv)
        .catch(e => { enginePromise = null; throw e; });
    }
    return enginePromise;
  }

  /* OpenCV.js 是异步初始化（wasm 解码），轮询 cv.Mat 出现即就绪。
     不用 onRuntimeInitialized 回调：脚本加载完可能已经初始化过了，回调就永远不触发。 */
  function waitCv() {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        if (window.cv && window.cv.Mat) { resolve(); return; }
        if (Date.now() - t0 > 30000) { reject(new Error('OpenCV 初始化超时')); return; }
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function showResult(out, label) {
    if (!alive || !rootEl) return;      /* 引擎回调可能在离开页面后才到 */
    let enhanced = false;
    const ctx = out.getContext('2d');
    /* 白纸增强：直接复用 fix.js 挂在 LB.img 上的实现（不复制算法） */
    if (typeof LB.img.whiteEnhance === 'function') {
      try { LB.img.whiteEnhance(ctx, out.width, out.height); enhanced = true; }
      catch (_) { enhanced = false; }
    }
    const box = $('#dsOut', rootEl);
    box.innerHTML = '';
    box.appendChild(out);
    $('#dsOutSec', rootEl).hidden = false;
    stat('已拉正 ' + out.width + '×' + out.height + ' · ' + label +
      (enhanced ? ' · 已自动白纸增强' : ' · （白纸增强不可用，未应用）'));
    LB.toast('拉正完成', 'ok');
  }

  /* ---------- 拉正（jscanify 主路径 + 自研算法兜底） ---------- */

  function warp() {
    const l = layout();
    /* Step 11 · B3：画布被隐藏时 rect 宽高为 0，kx/ky 会算出 Infinity，
       整个结果变成空白图且不报错。这里显式拦住。 */
    if (!l || !l.rect.width || !l.rect.height) { LB.toast('请先上传图片', 'err'); return; }
    if (!pts.length) { LB.toast('请先上传图片', 'err'); return; }
    /* Step 19 · 六：两点太近 → 禁止拉正并提示 */
    if (cornersTooClose(pts)) {
      LB.toast('四角不能重合，请把太近的角点分开一点', 'err');
      return;
    }
    /* Step 19 · 六：先按几何位置排序成 TL → TR → BR → BL，再参与映射 */
    const ordered = orderCorners(pts);
    if (busy) return;
    busy = true;
    stat('⏳ 正在准备文档矫正引擎（首次需加载约 9MB，稍等）…');
    loadEngine().then(() => {
      if (!alive || !rootEl) return;
      stat('⏳ 引擎就绪，正在拉正…');
      /* 让上面的提示先绘制一帧，再跑同步的 OpenCV 计算 */
      setTimeout(() => {
        warpJscanify(ordered, l).catch(e => {
          if (!alive || !rootEl) return;
          LB.toast('jscanify 拉正失败（' + msg(e) + '），已使用简化模式', 'warn');
          warpCustom(ordered, l);
        }).then(() => { busy = false; });
      }, 40);
    }).catch(e => {
      busy = false;
      if (!alive || !rootEl) return;
      LB.toast('文档矫正引擎加载失败（' + msg(e) + '），已使用简化模式', 'warn');
      warpCustom(ordered, l);
    });
  }

  /* jscanify 1.1.0 的 extractPaper 在末尾又做了一次上下翻转（它自己的
     getPerspectiveTransform 映射 TL→(0,0) 输出本来就是正的），
     实测：在纸面顶部 4%~10% 处画的标记条出现在结果 90% 高度处 → 结果倒置。
     这里翻回来，并用相邻像素补掉 warp 边界采样留下的 1~3px 黑边。 */
  function unflip(canvas) {
    const W = canvas.width, H = canvas.height;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.setTransform(1, 0, 0, -1, 0, H);
    ctx.drawImage(canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const e = Math.max(1, Math.min(3, Math.floor(H / 60)));
    try {
      ctx.drawImage(out, 0, e, W, e, 0, 0, W, e);
      ctx.drawImage(out, 0, H - e * 2, W, e, 0, H - e, W, e);
    } catch (_) { /* 极端尺寸下补边失败就算了，不影响主结果 */ }
    return out;
  }

  /* 用 jscanify 拉正。★ 任务书写的 extractPaper(img, w, h) 直接返回结果，
     实际 API（v1.1.0）是回调式：extractPaper(image, w, h, onComplete, cornerPoints)，
     且 cornerPoints 是 { topLeftCorner / topRightCorner / bottomLeftCorner / bottomRightCorner }
     四个具名点（不是数组），这里按真实签名调用。 */
  function warpJscanify(orderedCss, l) {
    const p = orderedCss.map(pt => [pt[0] * l.kx, pt[1] * l.ky]);   /* CSS 像素 → 源图像素 */
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const w = Math.max(d(p[0], p[1]), d(p[3], p[2]));
    const h = Math.max(d(p[0], p[3]), d(p[1], p[2]));
    /* 输出上限 2400 边长：与自研路径保持一致，避免超大结果拖垮下载与显示 */
    const cap = Math.min(1, 2400 / Math.max(w, h));
    const ow = Math.max(8, Math.round(w * cap));
    const oh = Math.max(8, Math.round(h * cap));
    const corners = {
      topLeftCorner: { x: p[0][0], y: p[0][1] },
      topRightCorner: { x: p[1][0], y: p[1][1] },
      bottomRightCorner: { x: p[2][0], y: p[2][1] },
      bottomLeftCorner: { x: p[3][0], y: p[3][1] }
    };
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = c => { if (settled) return; settled = true; showResult(c, 'jscanify / OpenCV'); resolve(); };
      const fail = e => { if (settled) return; settled = true; reject(e); };
      const timer = setTimeout(() => fail(new Error('引擎处理超时')), 30000);
      try {
        new window.jscanify().extractPaper(srcCv, ow, oh, c => {
          clearTimeout(timer);
          done(unflip(c));
        }, corners);
      } catch (e) {
        clearTimeout(timer);
        fail(e);
      }
    });
  }

  /* ---------- 兜底：自研反向映射 + 双线性插值（Step 19 的实现，原样保留） ---------- */

  function warpCustom(orderedCss, l) {
    const ts = targetSize(orderedCss);

    /* CSS 像素 → 源图像素（顺序与 dst 的 TL/TR/BR/BL 一一对应） */
    const src = orderedCss.map(p => [p[0] * l.kx, p[1] * l.ky]);
    const dst = [[0, 0], [ts.w, 0], [ts.w, ts.h], [0, ts.h]];

    /* Step 19 · 六（关键修复 2）：像素循环做的是「目标 → 源」反向映射，
       所以这里必须求 dst → src 的单应性矩阵（getPerspectiveTransform
       解出的方向是第一个参数 → 第二个参数）。旧代码把 src → dst 的
       矩阵直接当反向映射用，采样点整体坍缩到源图左上角，
       输出就是用户截图里"一坨错位色块 + 斜线"。 */
    const H = getPerspectiveTransform(dst, src);
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
    showResult(out, '简化模式（自研反向映射）');
  }

  function save() {
    const out = $('#dsOut', rootEl).querySelector('canvas');
    if (!out) { LB.toast('还没有结果', 'err'); return; }
    LB.img.toBlob(out, 'image/png')
      .then(b => LB.img.download(b, 'litebox-docscan.png'))
      .catch(() => LB.toast('导出失败', 'err'));
  }

  function reset(tries) {
    if (!srcCv) return;
    const w = srcCv.clientWidth, h = srcCv.clientHeight;
    /* Step 11 · B3：容器刚由 hidden 变可见时，布局尚未回流，clientWidth 会是 0。
       此时算出来的四个角全在原点（四角重合），点「拉正」只会报"四角不能共线"。
       这里等下一帧重试，最多 5 次，彻底避免这个竞态。 */
    if ((!w || !h) && (tries || 0) < 5) {
      requestAnimationFrame(() => reset((tries || 0) + 1));
      return;
    }
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

    /* Step 11 · B3：naturalWidth/Height 才是原图尺寸。
       用 el.width 在某些浏览器上拿到的是 HTML 属性（可能缺失）→ 得到 0×0 的画布，
       drawImage 后什么都画不出来，这正是"图片不显示"的另一种表现。 */
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    if (!nw || !nh) { LB.toast('图片尺寸无效，请换一张', 'err'); return; }

    img = el;
    const sz = LB.img.fitSize(nw, nh, MAX_SIDE);

    /* ★ canvas 尺寸必须用 width/height **属性**设置，不能用 CSS：
       CSS 只负责把它等比缩到容器里，属性才决定真实像素与 drawImage 的坐标系。
       （CSS 侧只保留 .ds-canvas-wrap canvas 的 max-width:100%，不写死宽高） */
    srcCv = document.createElement('canvas');
    srcCv.width = sz.w;
    srcCv.height = sz.h;
    srcCv.className = 'ds-src';
    const ctx = srcCv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    /* drawImage 传 4 个参数（dx, dy, dw, dh），把源图铺满整块 canvas */
    ctx.drawImage(el, 0, 0, sz.w, sz.h);

    const wrap = $('#dsWrap', rootEl);
    wrap.innerHTML = '';
    wrap.appendChild(srcCv);

    /* 覆盖层与四角手柄都必须在源图 canvas **就位之后**再创建：
       顺序反了手柄会按旧坐标系定位，出现"手柄和图片对不上"。 */
    const ov = document.createElement('canvas');
    ov.id = 'dsOverlay';
    ov.className = 'ds-overlay';
    wrap.appendChild(ov);
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

    /* 等布局完成（CSS max-width 生效、容器脱离 hidden）再放点；
       reset() 内部还会对 clientWidth=0 的竞态做二次重试。 */
    requestAnimationFrame(() => reset(0));
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
      '<p class="cd-note">全部在本地完成，照片不会上传。拉正由 jscanify（底层 OpenCV.js，wasm 本地执行）' +
      '做透视变换，白纸增强自动跟上；引擎首次使用需加载约 9MB，加载失败会自动改用内置的简化算法，功能不断档。' +
      '输出边长上限 2400 像素，超大图会等比缩小以免浏览器长时间无响应。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    alive = true;
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
    $('#dsReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => reset(0)));
    $('#dsRe', root).addEventListener('click', reselect);
    $('#dsSave', root).addEventListener('click', save);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    alive = false;
    /* 必须解window 监听 —— 否则离开页面后pointermove 仍在跑，
       onMove 里访问 rootEl 会报错，且 4 个手柄的 DOM 已被移除。 */
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    img = null; srcCv = null; pts = []; handles = []; dragIdx = -1;
    busy = false;                       /* 引擎 Promise 保留缓存，下次进来不用重下 9MB */
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('docscan', { mount, unmount });
})();
