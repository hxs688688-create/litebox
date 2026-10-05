/* LiteBox v5 · tools/meme.js — 表情包加字（顶部 / 底部白字黑边，实时预览） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let img = null;          /* 当前图片 HTMLImageElement */
  let canvas = null;       /* 渲染结果 canvas */
  let pasteCleanups = [];

  /* 白字黑边的核心：先 strokeText 再 fillText。
     lineJoin='round' 让描边拐角圆润，不会出现尖锐的毛刺。 */
  function drawText(ctx, text, cx, y, size, strokeW, baseline) {
    ctx.font = 'bold ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = baseline;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.strokeText(text, cx, y);
    ctx.fillText(text, cx, y);
  }

  function render() {
    if (!img || !canvas) return;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const top = $('#mmTop', rootEl).value.trim();
    const bottom = $('#mmBottom', rootEl).value.trim();
    const size = parseInt($('#mmSize', rootEl).value, 10);
    const strokeW = parseInt($('#mmStroke', rootEl).value, 10);
    /* 字号是绝对 px，图片小的时候会溢出 —— 按图宽缩放，
       小图（<480）自动收一档，大图（>1200）按比例放大，保证视觉比例一致。 */
    const scale = Math.min(1.6, Math.max(0.45, w / 640));
    const fs = Math.round(size * scale);
    const padding = fs * 0.4;

    if (top) drawText(ctx, top, w / 2, padding, fs, strokeW * scale, 'top');
    if (bottom) drawText(ctx, bottom, w / 2, h - padding, fs, strokeW * scale, 'bottom');
  }

  function updateLabels() {
    $('#mmSizeV', rootEl).textContent = $('#mmSize', rootEl).value;
    $('#mmStrokeV', rootEl).textContent = $('#mmStroke', rootEl).value;
  }

  function bindRender() {
    ['#mmTop', '#mmBottom', '#mmSize', '#mmStroke'].forEach(sel => {
      const el = $(sel, rootEl);
      el.addEventListener('input', () => { updateLabels(); render(); });
    });
  }

  function save() {
    if (!canvas) return;
    LB.img.toBlob(canvas, 'image/png')
      .then(b => LB.img.download(b, 'litebox-meme.png'))
      .catch(() => LB.toast('导出失败', 'err'));
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>表情包加字</h1><p>顶部 / 底部大字，白字黑边一键生成经典表情包</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="mmPick">' +
      '<div class="dropzone" id="mmZone">点击选择一张图片，或拖入 / Ctrl+V 粘贴</div>' +
      '<input type="file" id="mmFile" accept="image/*" hidden>' +
      '</div>' +
      '<div id="mmWork" hidden>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">文字设置</span>' +
      '<div class="mm-fields">' +
      '<label class="mm-lab">顶部文字<input class="inp" id="mmTop" type="text" maxlength="40" placeholder="例：我裂开了"></label>' +
      '<label class="mm-lab">底部文字<input class="inp" id="mmBottom" type="text" maxlength="40" placeholder="例：当牛做马"></label>' +
      '</div>' +
      '<div class="mm-grid">' +
      '<label class="mm-lab">字号 <output id="mmSizeV">48</output>' +
      '<input type="range" id="mmSize" min="20" max="80" step="1" value="48"></label>' +
      '<label class="mm-lab">描边 <output id="mmStrokeV">4</output>' +
      '<input type="range" id="mmStroke" min="2" max="8" step="1" value="4"></label>' +
      '</div>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">实时预览</span>' +
      '<div class="mm-result" id="mmBox"></div>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="mmSave" type="button">⬇ 下载 PNG</button>' +
      '<button class="btn btn-ghost" id="mmRe" type="button">换图</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">白字黑边（先描边后填充）是对比度最高、最经典的 meme 样式，' +
      '在任何背景图上都能看清；字号会按图片宽度自动缩放，小图也不会糊成一团。全部本地处理。</p>' +
      '</div>'
    );
  }

  async function onFiles(files) {
    const f = files && files[0];
    if (!f) return;
    let el;
    try {
      el = await LB.img.load(f);
    } catch (e) {
      LB.toast(e.message || '图片解码失败', 'err');
      return;
    }
    img = el;
    canvas = document.createElement('canvas');
    const box = $('#mmBox', rootEl);
    box.innerHTML = '';
    box.appendChild(canvas);
    render();
    $('#mmPick', rootEl).hidden = true;
    $('#mmWork', rootEl).hidden = false;
  }

  function reselect() {
    img = null; canvas = null;
    $('#mmWork', rootEl).hidden = true;
    $('#mmPick', rootEl).hidden = false;
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    img = null; canvas = null;

    LB.img.bindDrop($('#mmZone', root), $('#mmFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));
    bindRender();
    updateLabels();

    $('#mmSave', root).addEventListener('click', save);
    $('#mmRe', root).addEventListener('click', reselect);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    img = null; canvas = null;
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('meme', { mount, unmount });
})();
