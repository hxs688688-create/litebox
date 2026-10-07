/* LiteBox v5 · tools/crop.js — 图片裁剪（拖拽框选、比例锁定、手机端坐标换算） */
(function () {
  'use strict';

  const { $, $$, clamp } = LB.dom;
  let rootEl = null;
  let srcImg = null;
  let sel = null;          /* 选框，canvas 像素坐标 {x,y,w,h} */
  let dragging = false;
  let anchor = null;       /* 拖拽锚点（canvas 像素） */
  let ratio = null;        /* 宽高比 w/h，null 为自由 */
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  let outCanvas = null;

  /* 屏幕坐标 → canvas 像素坐标（Step 5D-1：scaleX/scaleY 分开换算，x/y 不再共用宽度比） */
  function toCanvasXY(e) {
    const canvas = $('#crCanvas', rootEl);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: clamp((e.clientX - rect.left) * scaleX, 0, canvas.width),
      y: clamp((e.clientY - rect.top) * scaleY, 0, canvas.height)
    };
  }

  /* 由锚点与当前点计算选框；锁定比例时按"取小值"方向适配，并夹紧在 canvas 内 */
  function calcSel(ax, ay, bx, by) {
    const canvas = $('#crCanvas', rootEl);
    const W = canvas.width, H = canvas.height;
    let dx = bx - ax, dy = by - ay;
    let x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
    let w = Math.abs(dx), h = Math.abs(dy);
    if (ratio) {
      const maxW = dx >= 0 ? W - ax : ax;
      const maxH = dy >= 0 ? H - ay : ay;
      w = Math.min(w, maxW);
      h = Math.min(h, maxH);
      const h2 = w / ratio;
      if (h2 <= h) {
        h = h2;                     /* 宽度受限，高度按比例缩小 */
      } else {
        w = h * ratio;              /* 高度受限，宽度按比例缩小 */
      }
      x0 = dx >= 0 ? ax : ax - w;
      y0 = dy >= 0 ? ay : ay - h;
    }
    return {
      x: clamp(x0, 0, Math.max(0, W - w)),
      y: clamp(y0, 0, Math.max(0, H - h)),
      w: w, h: h
    };
  }

  /* 已有选框按新比例适配（中心保持、取小值、夹紧在 canvas 内） */
  function fitRatioSel(s, r) {
    const canvas = $('#crCanvas', rootEl);
    const W = canvas.width, H = canvas.height;
    let w = s.w, h = w / r;
    if (h > s.h) { h = s.h; w = h * r; }
    let x = s.x + (s.w - w) / 2;
    let y = s.y + (s.h - h) / 2;
    return {
      x: clamp(x, 0, Math.max(0, W - w)),
      y: clamp(y, 0, Math.max(0, H - h)),
      w: w, h: h
    };
  }

  function renderBox() {
    const canvas = $('#crCanvas', rootEl);
    const b = $('#cropBox', rootEl);
    if (!sel || sel.w < 1 || sel.h < 1) { b.hidden = true; return; }
    b.hidden = false;
    /* 百分比定位：随容器缩放自适应 */
    b.style.left = (sel.x / canvas.width * 100) + '%';
    b.style.top = (sel.y / canvas.height * 100) + '%';
    b.style.width = (sel.w / canvas.width * 100) + '%';
    b.style.height = (sel.h / canvas.height * 100) + '%';
  }

  function onDown(e) {
    if (!srcImg || dragging) return;
    const canvas = $('#crCanvas', rootEl);
    canvas.setPointerCapture(e.pointerId); /* 移动端也能持续拖动 */
    dragging = true;
    anchor = toCanvasXY(e);
    sel = { x: anchor.x, y: anchor.y, w: 0, h: 0 };
    renderBox();
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    const p = toCanvasXY(e);
    sel = calcSel(anchor.x, anchor.y, p.x, p.y);
    renderBox();
    e.preventDefault();
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    /* 误触过滤：几乎没拖动的视为取消 */
    if (sel && sel.w < 8 && sel.h < 8) { sel = null; }
    renderBox();
  }

  function showImage(img) {
    srcImg = img;
    sel = null;
    const canvas = $('#crCanvas', rootEl);
    /* Step 5D-1 统一规则 5：等比尺寸 + clearRect + 4 参绘制整图 */
    const { w, h } = LB.img.fitSize(img.naturalWidth, img.naturalHeight, 720);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    console.log('[crop] canvas 自检 base=' + canvas.width + 'x' + canvas.height);
    $('#crPick', rootEl).hidden = true;
    $('#crWork', rootEl).hidden = false;
    $('#crOutSec', rootEl).hidden = true;
    outCanvas = null;
    renderBox();
  }

  async function onFiles(files) {
    const f = files[0];
    if (!f) return;
    try {
      showImage(await LB.img.load(f));
    } catch (e) {
      LB.toast(e.message || '图片解码失败', 'err');
    }
  }

  function cropNow() {
    if (!srcImg) return;
    if (!sel || sel.w < 4 || sel.h < 4) { LB.toast('请先在图片上拖拽框选', 'info'); return; }
    /* 反向映射回原图坐标，避免缩放误差 */
    const iw = srcImg.naturalWidth, ih = srcImg.naturalHeight;
    const canvas = $('#crCanvas', rootEl);
    const s = iw / canvas.width;
    const sx = clamp(Math.round(sel.x * s), 0, iw - 1);
    const sy = clamp(Math.round(sel.y * (ih / canvas.height)), 0, ih - 1);
    const sw = clamp(Math.round(sel.w * s), 1, iw - sx);
    const sh = clamp(Math.round(sel.h * (ih / canvas.height)), 1, ih - sy);
    const oc = document.createElement('canvas');
    oc.width = sw; oc.height = sh;
    const ctx = oc.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
    outCanvas = oc;
    const out = $('#crOut', rootEl);
    out.innerHTML = '';
    out.appendChild(oc);
    $('#crOutSec', rootEl).hidden = false;
  }

  async function downloadPng() {
    if (!outCanvas) { LB.toast('请先裁剪', 'info'); return; }
    try {
      const blob = await LB.img.toBlob(outCanvas, 'image/png');
      LB.img.download(blob, 'crop.png');
    } catch (e) {
      LB.toast(e.message || '导出失败', 'err');
    }
  }

  function resetSel() {
    sel = null;
    renderBox();
  }

  function html() {
    const ratios = [
      ['', '自由'], ['1', '1:1'], ['0.75', '3:4'],
      ['1.3333', '4:3'], ['0.5625', '9:16'], ['1.7778', '16:9']
    ];
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片裁剪</h1><p>自由 / 1:1 / 3:4 / 4:3 / 9:16 / 16:9，拖拽框选，按原图像素输出</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="crPick">' +
      '<div class="dropzone" id="crZone">点击选择、拖入一张图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="crFile" accept="image/*" hidden>' +
      '</div>' +
      '<div id="crWork" hidden>' +
      '<div class="tool-sec"><span class="tool-lab">在图片上按住拖拽，框选裁剪区域</span>' +
      '<div class="crop-wrap" id="crWrap">' +
      '<canvas id="crCanvas" width="0" height="0"></canvas>' +
      '<div id="cropBox" hidden></div>' +
      '</div></div>' +
      '<div class="tool-sec"><span class="tool-lab">比例</span><div class="seg" id="crRatio">' +
      ratios.map(r => '<button class="seg-btn' + (r[0] === '' ? ' on' : '') + '" data-r="' + r[0] + '" type="button">' + r[1] + '</button>').join('') +
      '</div></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="crReset" type="button">重新框选</button>' +
      '<button class="btn btn-main js-primary-submit" id="crGo" type="button">裁剪并预览</button>' +
      '</div>' +
      '<div class="tool-sec" id="crOutSec" hidden>' +
      '<span class="tool-lab">裁剪结果</span>' +
      '<div class="crop-out" id="crOut"></div>' +
      '<button class="btn btn-main" id="crDl" type="button">下载 PNG</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    srcImg = null; sel = null; dragging = false; anchor = null; ratio = null; outCanvas = null;

    LB.img.bindDrop($('#crZone', root), $('#crFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    const canvas = $('#crCanvas', root);
    /* Step 5D-1 统一规则 2：显示尺寸 100%/auto，高度按宽高比自适应撑起容器 */
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '10px';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    $('#crRatio', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#crRatio .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      const v = parseFloat(b.dataset.r);
      ratio = v > 0 ? v : null;
      /* 已有选框时立即按新比例适配 */
      if (sel && ratio && sel.w > 0 && sel.h > 0) { sel = fitRatioSel(sel, ratio); }
      renderBox();
    });
    $('#crReset', root).addEventListener('click', resetSel);
    $('#crGo', root).addEventListener('click', cropNow);
    $('#crDl', root).addEventListener('click', downloadPng);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    srcImg = null; sel = null; dragging = false; anchor = null; outCanvas = null;
    rootEl = null;
  }

  LB.router.register('crop', { mount, unmount });
})();
