/* LiteBox v5 · tools/compress.js — 图片压缩（多图、质量/最大宽/格式可调，本地处理） */
(function () {
  'use strict';

  const { $, clamp } = LB.dom;
  let rootEl = null;
  let items = [];            /* { file, name, img, orig } */
  let urls = [];             /* 结果 blob URL，unmount 时统一 revoke */
  let outBlobs = [];         /* { blob, name } 供全部下载使用 */
  let runTimer = null;       /* 设置变化 debounce */
  let dlTimers = [];         /* 全部下载的 setTimeout 句柄 */
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  let running = false, rerunNeeded = false;

  const FORMATS = [
    { v: 'image/jpeg', label: 'JPEG' },
    { v: 'image/webp', label: 'WebP' },
    { v: 'image/png', label: 'PNG' }
  ];

  function extOf(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'img';
  }

  function collectUrls() {
    urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* noop */ } });
    urls = [];
  }

  async function runAll() {
    if (!items.length) return;
    if (running) { rerunNeeded = true; return; }
    running = true;
    const list = $('#cpList', rootEl);
    const q = clamp(parseInt($('#cpQ', rootEl).value, 10) || 70, 10, 100);
    const maxW = parseInt($('#cpW', rootEl).value, 10) || 0;
    const mime = $('#cpF', rootEl).value;

    /* 先清掉上一轮的结果 URL，避免泄漏 */
    collectUrls();
    outBlobs = [];
    list.innerHTML = '<div class="loading-box"><div class="spinner"></div><span class="lb-tip">正在压缩…</span></div>';

    const rows = [];
    for (const it of items) {
      const { w, h } = LB.img.fitSize(it.img.naturalWidth, it.img.naturalHeight, maxW);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(it.img, 0, 0, w, h);
      try {
        /* PNG 不传 quality */
        const blob = mime === 'image/png'
          ? await LB.img.toBlob(canvas, 'image/png')
          : await LB.img.toBlob(canvas, mime, q / 100);
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const name = it.name.replace(/\.[^.]+$/, '') + '.' + extOf(mime);
        outBlobs.push({ blob: blob, name: name });
        const saved = Math.round((1 - blob.size / it.orig) * 100);
        rows.push(
          '<div class="comp-row">' +
          '<img loading="lazy" src="' + url + '" alt="">' +
          '<div class="comp-info">' +
          '<div class="comp-name">' + it.name + '</div>' +
          '<div class="comp-meta">' + it.w0 + '×' + it.h0 + ' → ' + w + '×' + h +
          ' · ' + LB.img.fmtSize(it.orig) + ' → ' + LB.img.fmtSize(blob.size) + '</div>' +
          '</div>' +
          '<span class="comp-save' + (saved < 0 ? ' neg' : '') + '">' +
          (saved >= 0 ? '节省 ' + saved + '%' : '增大 ' + (-saved) + '%') + '</span>' +
          '</div>'
        );
      } catch (e) {
        rows.push('<div class="comp-row"><div class="comp-info"><div class="comp-name">' + it.name + '</div><div class="comp-meta">' + (e.message || '压缩失败') + '</div></div></div>');
      }
    }
    list.innerHTML = rows.join('');
    /* Step 10：结果行入场级联动效（延迟走 DOM style API） */
    list.querySelectorAll('.comp-row').forEach((el, i) => {
      el.classList.add('lb-fade-in-up');
      el.style.animationDelay = (i * 30) + 'ms';
    });
    running = false;
    if (rerunNeeded) { rerunNeeded = false; runAll(); }
  }

  function scheduleRun() {
    clearTimeout(runTimer);
    runTimer = setTimeout(runAll, 300);
  }

  async function onFiles(files) {
    for (const f of files) {
      try {
        const img = await LB.img.load(f);
        items.push({ file: f, name: f.name || '图片', img: img, orig: f.size, w0: img.naturalWidth, h0: img.naturalHeight });
      } catch (e) {
        LB.toast(e.message || '图片解码失败', 'err');
      }
    }
    if (items.length) {
      $('#cpListSec', rootEl).hidden = false;
      runAll();
    }
  }

  function downloadAll() {
    if (!outBlobs.length) { LB.toast('请先添加图片', 'info'); return; }
    dlTimers.forEach(clearTimeout);
    dlTimers = outBlobs.map((o, i) => setTimeout(() => {
      LB.img.download(o.blob, o.name);
    }, i * 400));
  }

  function clearAll() {
    collectUrls();
    dlTimers.forEach(clearTimeout); dlTimers = [];
    items = []; outBlobs = [];
    $('#cpList', rootEl).innerHTML = '';
    $('#cpListSec', rootEl).hidden = true;
    LB.toast('已清空', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片压缩</h1><p>批量压缩并互转 JPG / WebP / PNG，全部本地处理，图片不出浏览器</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-cols">' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">上传图片（可多选 / 拖拽 / 粘贴）</span>' +
      '<div class="dropzone" id="cpZone">点击选择、拖入图片，或直接 Ctrl+V 粘贴<br>支持一次添加多张</div>' +
      '<input type="file" id="cpFile" accept="image/*" multiple hidden>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">压缩设置</span>' +
      '<div class="card set-card">' +
      '<div class="field"><label>质量</label>' +
      '<input type="range" id="cpQ" min="10" max="100" step="1" value="70"><output id="cpQv">70</output></div>' +
      '<div class="field"><label>最大宽度</label>' +
      '<select class="inp" id="cpW"><option value="0" selected>保持原尺寸</option><option value="1920">1920 px</option><option value="1280">1280 px</option><option value="800">800 px</option></select></div>' +
      '<div class="field"><label>输出格式</label>' +
      '<select class="inp" id="cpF">' + FORMATS.map(f => '<option value="' + f.v + '">' + f.label + '</option>').join('') + '</select></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="cpDown" type="button">全部下载</button>' +
      '<button class="btn btn-ghost" id="cpClear" type="button">清空</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="tool-sec" id="cpListSec" hidden>' +
      '<span class="tool-lab">压缩结果</span>' +
      '<div class="comp-list" id="cpList"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    items = []; urls = []; outBlobs = []; dlTimers = []; running = false; rerunNeeded = false;

    LB.img.bindDrop($('#cpZone', root), $('#cpFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    $('#cpQ', root).addEventListener('input', e => {
      $('#cpQv', root).textContent = e.target.value;
      scheduleRun();
    });
    $('#cpW', root).addEventListener('change', scheduleRun);
    $('#cpF', root).addEventListener('change', scheduleRun);
    $('#cpDown', root).addEventListener('click', downloadAll);
    $('#cpClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    clearTimeout(runTimer);
    dlTimers.forEach(clearTimeout);
    dlTimers = [];
    collectUrls(); /* 所有 createObjectURL 全部 revoke */
    items = []; outBlobs = [];
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null; running = false; rerunNeeded = false;
  }

  LB.router.register('compress', { mount, unmount });
})();
