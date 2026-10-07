/* LiteBox v5 · tools/image-common.js — 图片工具公共模块（挂 LB.img，不注册路由） */
(function () {
  'use strict';

  window.LB = window.LB || {};

  /* 从 File / Blob 读取图片，返回 Promise<HTMLImageElement>，失败 reject Error('图片解码失败') */
  function load(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  }

  /* 从 FileList 里挑出图片 */
  function pickImages(fileList) {
    return Array.from(fileList || []).filter(f => f && f.type && f.type.indexOf('image/') === 0);
  }

  /* 绑定拖拽上传：zoneEl 是 .dropzone，inputEl 是 <input type=file>
     支持 点击 / 拖拽 / change 三种触发，回调 onFiles(files: File[]) */
  function bindDrop(zoneEl, inputEl, onFiles) {
    zoneEl.addEventListener('click', () => inputEl.click());
    inputEl.addEventListener('change', () => {
      const files = pickImages(inputEl.files);
      inputEl.value = ''; /* 允许再次选择同一文件 */
      if (files.length) onFiles(files);
    });
    const onOver = e => { e.preventDefault(); zoneEl.classList.add('drag'); };
    const onLeave = () => zoneEl.classList.remove('drag');
    zoneEl.addEventListener('dragover', onOver);
    zoneEl.addEventListener('dragenter', onOver);
    zoneEl.addEventListener('dragleave', onLeave);
    zoneEl.addEventListener('drop', e => {
      e.preventDefault();
      zoneEl.classList.remove('drag');
      const files = pickImages(e.dataTransfer && e.dataTransfer.files);
      if (files.length) onFiles(files);
    });
  }

  /* 全屏监听粘贴图片，仅在 pageEl 是 .active 时触发；返回取消函数 */
  function bindPaste(pageEl, onFiles) {
    const handler = e => {
      if (!pageEl.classList.contains('active')) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.type && it.type.indexOf('image/') === 0) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); onFiles([f]); return; }
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }

  // 全局粘贴监听：任何工具页激活时，粘贴图片都会传给 onFiles
  // 返回取消函数
  function bindPasteAll(pageEl, onFiles) {
    const handler = (e) => {
      if (!pageEl.classList.contains('active')) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(it => it.type.startsWith('image/'));
      if (imgItem) {
        const file = imgItem.getAsFile();
        if (file) onFiles([file]);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }

  /* canvas.toBlob 的 Promise 封装（quality 传 undefined 即不传） */
  function toBlob(canvas, type, quality) {
    type = type || 'image/png';
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('图片导出失败'))), type, quality);
    });
  }

  /* 触发浏览器下载（临时 URL 延迟释放，保证下载已启动） */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  /* 按最大边等比缩放，返回 {w, h}（maxSide 为 0/空 表示保持原尺寸） */
  function fitSize(w, h, maxSide) {
    if (!maxSide || (w <= maxSide && h <= maxSide)) return { w: w, h: h };
    const r = (w >= h ? maxSide / w : maxSide / h);
    return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
  }

  /* 居中裁剪为正方形 canvas（用于九宫格、头像） */
  function centerSquare(img, side) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const s = Math.min(w, h);
    const c = document.createElement('canvas');
    c.width = side;
    c.height = side;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, side, side);
    return c;
  }

  /* 格式化字节数：B / KB / MB */
  function fmtSize(b) {
    if (b == null || isNaN(b)) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  LB.img = { load, bindDrop, bindPaste, bindPasteAll, toBlob, download, fitSize, centerSquare, fmtSize };
})();
