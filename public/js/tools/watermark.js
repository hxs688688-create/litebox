/* LiteBox v5 · tools/watermark.js — 图片加水印（文字平铺/单枚、旋转、描边，本地处理） */
(function () {
  'use strict';

  const { $, clamp } = LB.dom;
  let rootEl = null;
  let srcImg = null;
  let redrawTimer = null;
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  let wmFill = '#ffffff';      /* 兜底值，实际从 tokens.css 读取 */
  let wmStroke = 'rgba(0,0,0,.55)';

  function scheduleRedraw() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redraw, 60);
  }

  function redraw() {
    if (!srcImg || !rootEl) return;
    const canvas = $('#wmCanvas', rootEl);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(srcImg, 0, 0, canvas.width, canvas.height);

    const text = $('#wmText', rootEl).value || '© LiteBox';
    const size = clamp(parseInt($('#wmSize', rootEl).value, 10) || 36, 14, 120);
    const op = clamp(parseInt($('#wmOp', rootEl).value, 10) || 35, 5, 100) / 100;
    const rot = clamp(parseInt($('#wmRot', rootEl).value, 10) || 0, -90, 90) * Math.PI / 180;
    const tile = $('#wmTile', rootEl).checked;
    const stroke = $('#wmStroke', rootEl).checked;

    ctx.save();
    ctx.globalAlpha = op;
    ctx.font = size + 'px system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.strokeStyle = wmStroke;
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.lineJoin = 'round';
    }
    const put = (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (stroke) ctx.strokeText(text, 0, 0);
      ctx.fillStyle = wmFill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    if (tile) {
      /* 平铺：步长 X = 文字宽 + 字号×2.2，步长 Y = 字号×3.4，从 -20% 到 120% 覆盖 */
      const tw = ctx.measureText(text).width;
      const stepX = tw + size * 2.2;
      const stepY = size * 3.4;
      for (let y = -0.2 * canvas.height; y <= 1.2 * canvas.height; y += stepY) {
        for (let x = -0.2 * canvas.width; x <= 1.2 * canvas.width; x += stepX) put(x, y);
      }
    } else {
      /* 非平铺：右下角一枚 */
      const tw = ctx.measureText(text).width;
      put(canvas.width - tw / 2 - 28, canvas.height - size / 2 - 28);
    }
    ctx.restore();
  }

  function showImage(img) {
    srcImg = img;
    const { w, h } = LB.img.fitSize(img.naturalWidth, img.naturalHeight, 1600);
    const canvas = $('#wmCanvas', rootEl);
    canvas.width = w;
    canvas.height = h;
    $('#wmPick', rootEl).hidden = true;
    $('#wmCanWrap', rootEl).hidden = false;
    redraw();
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

  function reselect() {
    srcImg = null;
    $('#wmCanWrap', rootEl).hidden = true;
    $('#wmPick', rootEl).hidden = false;
  }

  async function downloadPng() {
    if (!srcImg) { LB.toast('请先上传图片', 'info'); return; }
    try {
      const blob = await LB.img.toBlob($('#wmCanvas', rootEl), 'image/png');
      LB.img.download(blob, 'watermark.png');
    } catch (e) {
      LB.toast(e.message || '导出失败', 'err');
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片加水印</h1><p>文字水印防搬运，支持平铺、旋转、透明度与描边，本地处理</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-cols">' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">图片</span>' +
      '<div id="wmPick">' +
      '<div class="dropzone" id="wmZone">点击选择、拖入一张图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="wmFile" accept="image/*" hidden>' +
      '</div>' +
      '<div id="wmCanWrap" class="wm-canvas-wrap" hidden><canvas id="wmCanvas" width="0" height="0"></canvas></div>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">水印设置</span>' +
      '<div class="card set-card">' +
      '<div class="field"><label>文字</label><input class="inp" id="wmText" value="© LiteBox" maxlength="40"></div>' +
      '<div class="field"><label>字号</label><input type="range" id="wmSize" min="14" max="120" step="1" value="36"><output id="wmSizeV">36</output></div>' +
      '<div class="field"><label>透明度</label><input type="range" id="wmOp" min="5" max="100" step="1" value="35"><output id="wmOpV">35%</output></div>' +
      '<div class="field"><label>旋转</label><input type="range" id="wmRot" min="-90" max="90" step="1" value="-30"><output id="wmRotV">-30°</output></div>' +
      '<label class="check-row"><input type="checkbox" id="wmTile"> 平铺整个画面</label>' +
      '<label class="check-row"><input type="checkbox" id="wmStroke"> 描边（深色图更清晰）</label>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="wmDl" type="button">下载 PNG</button>' +
      '<button class="btn btn-ghost" id="wmRe" type="button">重选</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    srcImg = null; redrawTimer = null;

    /* 水印颜色只从 tokens.css 读取（canvas 绘制与主题无关，读一次即可） */
    const cs = getComputedStyle(document.documentElement);
    wmFill = cs.getPropertyValue('--wm-fill').trim() || wmFill;
    wmStroke = cs.getPropertyValue('--wm-stroke').trim() || wmStroke;

    LB.img.bindDrop($('#wmZone', root), $('#wmFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    [['wmSize', 'wmSizeV', v => v],
     ['wmOp', 'wmOpV', v => v + '%'],
     ['wmRot', 'wmRotV', v => v + '°']].forEach(([id, out, fmt]) => {
      $('#' + id, root).addEventListener('input', e => {
        $('#' + out, root).textContent = fmt(e.target.value);
        scheduleRedraw();
      });
    });
    $('#wmText', root).addEventListener('input', scheduleRedraw);
    $('#wmTile', root).addEventListener('change', scheduleRedraw);
    $('#wmStroke', root).addEventListener('change', scheduleRedraw);
    $('#wmDl', root).addEventListener('click', downloadPng);
    $('#wmRe', root).addEventListener('click', reselect);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    clearTimeout(redrawTimer);
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    srcImg = null;
    rootEl = null;
  }

  LB.router.register('watermark', { mount, unmount });
})();
