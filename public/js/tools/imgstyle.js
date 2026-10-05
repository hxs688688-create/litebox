/* LiteBox v5 · tools/imgstyle.js — 图片风格化（素描 / 漫画 / 复古 / 黑白）
   全部用 Canvas 逐像素滤镜纯本地实现，图片不上传。
   ★ 素描是 O(W×H×9) 的 Sobel 边缘检测，大图会明显卡顿，
     故统一把最长边缩到 MAX_SIDE(1200) 再处理。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  const MAX_SIDE = 1200;   /* 最长边上限（px） */
  const MAX_MB = 12;
  const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  const MODES = [
    { v: 'orig', n: '原图' },
    { v: 'sketch', n: '素描' },
    { v: 'comic', n: '漫画' },
    { v: 'vintage', n: '复古' },
    { v: 'gray', n: '黑白' }
  ];

  let rootEl = null;
  let srcImg = null;      /* 原始 HTMLImageElement */
  let srcURL = '';         /* objectURL，切走时 revoke */
  let baseCv = null;       /* 缩放后的基准画布（所有滤镜的输入） */
  let outCv = null;        /* 当前输出画布 */
  let mode = 'orig';
  let onPaste = null;
  let busy = false;

  function extOk(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 && EXT_OK.indexOf(name.slice(i + 1).toLowerCase()) >= 0;
  }

  function pickFile(file) {
    if (!rootEl || !file) return;
    const okType = (file.type && file.type.indexOf('image/') === 0) || extOk(file.name || '');
    if (!okType) { LB.toast('请选择图片文件（JPG / PNG / WEBP 等）', 'err'); return; }
    if (file.size > MAX_MB * 1048576) { LB.toast('图片过大：请选择 ' + MAX_MB + 'MB 以以内的图片', 'info'); return; }
    if (srcURL) { try { URL.revokeObjectURL(srcURL); } catch (_) {} }
    srcURL = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      srcImg = img;
      prepareBase();
      render();
      LB.toast('图片已载入', 'ok');
    };
    img.onerror = () => LB.toast('图片解码失败，请换一张试试', 'err');
    img.src = srcURL;
  }

  /* 等比缩放到最长边 ≤ MAX_SIDE，作为滤镜输入 */
  function prepareBase() {
    if (!srcImg) return;
    const w = srcImg.naturalWidth || srcImg.width;
    const h = srcImg.naturalHeight || srcImg.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const bw = Math.max(1, Math.round(w * scale));
    const bh = Math.max(1, Math.round(h * scale));
    baseCv = document.createElement('canvas');
    baseCv.width = bw; baseCv.height = bh;
    const c = baseCv.getContext('2d', { willReadFrequently: true });
    c.drawImage(srcImg, 0, 0, bw, bh);
    outCv = document.createElement('canvas');
    outCv.width = bw; outCv.height = bh;
    $('#isSize', rootEl).textContent = w + ' × ' + h + (scale < 1 ? ' → 已缩放至 ' + bw + ' × ' + bh : '');
  }

  function grayAt(d, i) {
    /* Rec.601 亮度 */
    return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  }

  /* 素描：Sobel 九宫格边缘检测 → 反色成白底黑线 */
  function sketch(cv) {
    const w = cv.width, h = cv.height;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const img = c.getImageData(0, 0, w, h);
    const src = img.data;
    /* 先取灰度副本 */
    const g = new Float32Array(w * h);
    for (let p = 0, q = 0; q < w * h; q++, p += 4) g[q] = grayAt(src, p);

    const out = img.data;
    /* 首末行/列置白，避免取不到邻域产生黑边 */
    const edge = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const tl = g[i - w - 1], t = g[i - w], tr = g[i - w + 1];
        const l = g[i - 1], r = g[i + 1];
        const bl = g[i + w - 1], b = g[i + w], br = g[i + w + 1];
        const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
        edge[i] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        let v;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) v = 255;
        else {
          const e = edge[y * w + x];
          /* 归一化 + 反色：边缘越强越黑 */
          const norm = Math.min(1, e / 220);
          v = 255 - Math.round(norm * 255);
          /* 保留一点原图明暗，避免纯线稿丢失体积感 */
          v = Math.max(0, Math.min(255, Math.round(v * 0.82 + grayAt(src, p) * 0.18)));
        }
        out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }

  /* 漫画：色调量化（每通道 4 档）+ 亮度差 > 阈值处描黑边 */
  function comic(cv) {
    const w = cv.width, h = cv.height;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const img = c.getImageData(0, 0, w, h);
    const d = img.data;
    const Q = 64;                       /* 4 档：0/64/128/192 → 补 255 共 5 档 */
    const EDGE = 40;                    /* 亮度差阈值 */
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        let r = d[p], g = d[p + 1], b = d[p + 2];
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        /* 与右邻、下邻比较，差异大 → 描边 */
        let edge = false;
        if (x + 1 < w) {
          const q = p + 4;
          const nl = d[q] * 0.299 + d[q + 1] * 0.587 + d[q + 2] * 0.114;
          if (Math.abs(lum - nl) > EDGE) edge = true;
        }
        if (!edge && y + 1 < h) {
          const q = p + w * 4;
          const nd = d[q] * 0.299 + d[q + 1] * 0.587 + d[q + 2] * 0.114;
          if (Math.abs(lum - nd) > EDGE) edge = true;
        }
        if (edge) {
          d[p] = 20; d[p + 1] = 20; d[p + 2] = 20;
        } else {
          d[p] = Math.min(255, Math.round(r / Q) * Q);
          d[p + 1] = Math.min(255, Math.round(g / Q) * Q);
          d[p + 2] = Math.min(255, Math.round(b / Q) * Q);
        }
        d[p + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }

  /* 复古：棕褐色调（sepia 矩阵）+ 轻微提亮 */
  function vintage(cv) {
    const w = cv.width, h = cv.height;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const img = c.getImageData(0, 0, w, h);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      d[p] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      d[p + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      d[p + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    }
    c.putImageData(img, 0, 0);
  }

  /* 黑白：Rec.601 灰度 */
  function gray(cv) {
    const w = cv.width, h = cv.height;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const img = c.getImageData(0, 0, w, h);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const v = Math.round(d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114);
      d[p] = v; d[p + 1] = v; d[p + 2] = v;
    }
    c.putImageData(img, 0, 0);
  }

  function setMode(v) {
    mode = v;
    render();
  }

  /* 应用当前滤镜到 outCv，并绘制到预览 */
  function render() {
    if (!baseCv) return;
    const btn = $('#isDl', rootEl);
    btn.disabled = true;
    btn.textContent = '⏳ 处理中…';
    /* 让按钮先进入 loading 态再跑同步滤镜（大图会阻塞主线程） */
    setTimeout(() => {
      try {
        const oc = outCv.getContext('2d', { willReadFrequently: true });
        oc.clearRect(0, 0, outCv.width, outCv.height);
        oc.drawImage(baseCv, 0, 0);
        if (mode === 'sketch') sketch(outCv);
        else if (mode === 'comic') comic(outCv);
        else if (mode === 'vintage') vintage(outCv);
        else if (mode === 'gray') gray(outCv);
        const cvEl = $('#isCanvas', rootEl);
        cvEl.width = outCv.width; cvEl.height = outCv.height;
        cvEl.getContext('2d').drawImage(outCv, 0, 0);
        $('#isBox', rootEl).hidden = false;
        $('#isEmpty', rootEl).hidden = true;
        btn.disabled = false;
        btn.textContent = '⬇️ 下载图片';
        $('#isStat', rootEl).textContent = (MODES.find(m => m.v === mode) || {}).n +
          ' · ' + outCv.width + ' × ' + outCv.height;
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '⬇️ 下载图片';
        LB.toast('处理失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      }
    }, 16);
  }

  function download() {
    if (!outCv) { LB.toast('还没有可下载的结果', 'info'); return; }
    const name = 'imgstyle-' + mode + '-' + outCv.width + 'x' + outCv.height + '.png';
    outCv.toBlob(b => {
      if (!b) { LB.toast('导出失败，请重试', 'err'); return; }
      const href = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }, 'image/png');
  }

  function clearAll() {
    if (srcURL) { try { URL.revokeObjectURL(srcURL); } catch (_) {} srcURL = ''; }
    srcImg = null; baseCv = null; outCv = null;
    $('#isBox', rootEl).hidden = true;
    $('#isEmpty', rootEl).hidden = false;
    $('#isSize', rootEl).textContent = '';
    $('#isStat', rootEl).textContent = '';
    $('#isDl', rootEl).disabled = true;
    $('#isFname', rootEl).textContent = '点击选择图片，或直接粘贴截图';
    $('#isFsize', rootEl).textContent = '';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片风格化</h1><p>素描 / 漫画 / 复古 / 黑白，一键转换纯本地处理不上传</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card">' +
      '<div class="dropzone is-drop" id="isDrop">' +
      '<div class="ocr-dz-ic">🎨</div>' +
      '<div class="ocr-fname" id="isFname">点击选择图片，或直接粘贴截图</div>' +
      '<div class="ocr-fsize" id="isFsize"></div>' +
      '<small>JPG / PNG / WEBP / BMP / GIF · 最大 12MB · 支持 Ctrl+V 粘贴</small>' +
      '<button class="btn btn-ghost btn-sm ocr-pick" id="isPick" type="button">选择图片</button>' +
      '</div>' +
      '<input type="file" id="isFile" accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif" hidden>' +
      '<div class="seg seg-5" id="isModes">' +
      MODES.map((m, i) => '<button class="seg-btn' + (i === 0 ? ' on' : '') + '" data-v="' + m.v + '" type="button">' + m.n + '</button>').join('') +
      '</div>' +
      '<p class="is-size" id="isSize"></p>' +
      '<div class="is-box" id="isBox" hidden><canvas id="isCanvas"></canvas></div>' +
      '<p class="dn-empty2" id="isEmpty">先选一张图片，然后点上方风格切换效果。</p>' +
      '<div class="jst" id="isStat"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="isClear" type="button">清空</button>' +
      '<button class="btn btn-ghost js-primary-submit" id="isDl" type="button" disabled>⬇️ 下载图片</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">所有处理都在你自己的浏览器里完成，图片不会上传到任何服务器。为保证速度，最长边超过 ' +
      MAX_SIDE + 'px 的图片会先等比缩放到 ' + MAX_SIDE + 'px 再处理（素描为逐像素算法，超大图会明显卡顿）。下载结果为 PNG。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    const drop = $('#isDrop', root);
    const input = $('#isFile', root);
    drop.addEventListener('click', () => input.click());
    $('#isPick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) { $('#isFname', root).textContent = f.name; $('#isFsize', root).textContent = (f.type || 'image') + ' · ' + LB.img.fmtSize(f.size); pickFile(f); }
    });
    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { $('#isFname', root).textContent = f.name; pickFile(f); }
    });

    /* 粘贴：模块级 handle，unmount 时必须移除（本库无 _cleanups 约定） */
    onPaste = e => {
      if (!rootEl || !$('#tool-host', document) || !$('#tool-host', document).classList.contains('active')) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.indexOf('image/') === 0) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            $('#isFname', rootEl).textContent = '粘贴的截图';
            pickFile(f);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);

    $('#isModes', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#isModes .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      setMode(b.getAttribute('data-v'));
    });
    $('#isDl', root).addEventListener('click', download);
    $('#isClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (onPaste) { document.removeEventListener('paste', onPaste); onPaste = null; }
    if (srcURL) { try { URL.revokeObjectURL(srcURL); } catch (_) {} srcURL = ''; }
    srcImg = null; baseCv = null; outCv = null;
    rootEl = null;
  }

  LB.router.register('imgstyle', { mount, unmount });
})();
