/* LiteBox v5 · tools/grid9.js — 九宫格切图（居中裁方 → 3×3 逐张下载） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let pieces = [];      /* 9 张 300×300 canvas */
  let dlTimers = [];
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */

  function dlOne(canvas, name) {
    LB.img.toBlob(canvas, 'image/png')
      .then(b => LB.img.download(b, name))
      .catch(() => LB.toast('导出失败', 'err'));
  }

  function downloadAll() {
    if (!pieces.length) return;
    dlTimers.forEach(clearTimeout);
    dlTimers = pieces.map((p, i) => setTimeout(() => dlOne(p, (i + 1) + '.png'), i * 400));
  }

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
    /* 居中裁成 900×900 方图，再切成 9 张 300×300 */
    const sq = LB.img.centerSquare(img, 900);
    const src = $('#g9Src', rootEl);
    src.innerHTML = '';
    src.appendChild(sq);

    const grid = $('#g9Grid', rootEl);
    grid.innerHTML = '';
    pieces = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const t = document.createElement('canvas');
        t.width = 300; t.height = 300;
        const ctx = t.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sq, c * 300, r * 300, 300, 300, 0, 0, 300, 300);
        t.title = (r * 3 + c + 1) + '.png · 点击下载';
        grid.appendChild(t);
        pieces.push(t);
      }
    }
    $('#g9Pick', rootEl).hidden = true;
    $('#g9Work', rootEl).hidden = false;
  }

  function reselect() {
    dlTimers.forEach(clearTimeout); dlTimers = [];
    pieces = [];
    $('#g9Work', rootEl).hidden = true;
    $('#g9Pick', rootEl).hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>九宫格切图</h1><p>一张图切成 9 张 300×300，朋友圈 / 小红书拼图必备</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="g9Pick">' +
      '<div class="dropzone" id="g9Zone">点击选择、拖入一张图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="g9File" accept="image/*" hidden>' +
      '</div>' +
      '<div id="g9Work" hidden>' +
      '<div class="tool-sec"><span class="tool-lab">原图 · 居中裁方 900×900</span><div class="g9-src" id="g9Src"></div></div>' +
      '<div class="tool-sec"><span class="tool-lab">九宫格 · 点击单张可下载</span><div class="grid9-grid" id="g9Grid"></div></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="g9All" type="button">全部下载（1.png ~ 9.png）</button>' +
      '<button class="btn btn-ghost" id="g9Re" type="button">重选</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    pieces = []; dlTimers = [];

    LB.img.bindDrop($('#g9Zone', root), $('#g9File', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    $('#g9Grid', root).addEventListener('click', e => {
      if (e.target.tagName === 'CANVAS') dlOne(e.target, e.target.title.split(' ')[0]);
    });
    $('#g9All', root).addEventListener('click', downloadAll);
    $('#g9Re', root).addEventListener('click', reselect);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    dlTimers.forEach(clearTimeout);
    dlTimers = [];
    pieces = [];
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('grid9', { mount, unmount });
})();
