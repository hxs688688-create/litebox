/* LiteBox v5 · tools/imgbatch.js — 图片批量处理（尺寸 / 格式 / 信息清理 / 打码马赛克） */
(function () {
  'use strict';

  const { $, $$, clamp } = LB.dom;
  let rootEl = null;
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  let curTab = 'p1';

  /* 每个 tab 独立状态；blobUrls 统一记录，unmount 全部 revoke */
  const st = {
    p1: { items: [], urls: [] }, /* items: {name, img, orig} → 运行后补 {url, w, h, size} */
    p2: { items: [], urls: [] },
    p3: { items: [], urls: [] },
    p4: { img: null, undo: [], boxTimer: null }
  };
  let blobUrls = [];
  let dlTimers = [];

  function trackUrl(url, tab) {
    blobUrls.push(url);
    if (tab && st[tab]) st[tab].urls.push(url);
    return url;
  }
  function revokeTab(tab) {
    const urls = st[tab].urls || [];
    urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* noop */ } });
    blobUrls = blobUrls.filter(u => urls.indexOf(u) === -1); /* 从全量表同步移除，避免 unmount 重复 revoke */
    st[tab].urls = [];
  }
  function collectUrls() {
    blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* noop */ } });
    blobUrls = [];
  }

  function clearGrid(pane) {
    const g = $('.ib-grid', pane);
    if (g) g.innerHTML = '';
    const sec = $('.ib-result', pane);
    if (sec) sec.hidden = true;
  }

  /* 结果卡片：缩略图 + 名称 + meta，点击下载 */
  function cardHTML(url, name, meta, fname) {
    return (
      '<div class="res-card clickable" data-dl="' + fname + '" data-url="' + url + '" title="点击下载">' +
      '<img loading="lazy" class="ib-thumb" src="' + url + '" alt="">' +
      '<div class="ib-name">' + name + '</div>' +
      '<div class="ib-meta">' + meta + '</div>' +
      '</div>'
    );
  }

  function renderGrid(pane, cards) {
    const g = $('.ib-grid', pane);
    g.innerHTML = cards.join('');
    $('.ib-result', pane).hidden = false;
  }

  function dlByUrl(url, fname) {
    /* blob URL 直接作为 a.href 下载（无需 fetch 再包装） */
    const a = document.createElement('a');
    a.href = url;
    a.download = fname || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadAll(pane, tip) {
    const cards = $$('.res-card[data-url]', pane);
    if (!cards.length) { LB.toast(tip || '请先处理图片', 'info'); return; }
    dlTimers.forEach(clearTimeout);
    dlTimers = cards.map((c, i) => setTimeout(() => dlByUrl(c.dataset.url, c.dataset.dl), i * 400));
    LB.toast('开始下载 ' + cards.length + ' 张', 'ok');
  }

  /* ============ Tab1 尺寸修改 ============ */
  function calcResize(iw, ih, wIn, hIn, lock) {
    if (wIn && hIn) {
      if (lock) {
        const s = Math.min(wIn / iw, hIn / ih);
        return { w: Math.max(1, Math.round(iw * s)), h: Math.max(1, Math.round(ih * s)) };
      }
      return { w: wIn, h: hIn }; /* 不锁定：直接拉伸 */
    }
    if (wIn) return { w: wIn, h: Math.max(1, Math.round(ih * wIn / iw)) };
    if (hIn) return { w: Math.max(1, Math.round(iw * hIn / ih)), h: hIn };
    return null;
  }

  let r1Busy = false, r1Again = false; /* 重入保护：自动跑与手动点击并发时，等当前轮结束后重跑一次 */
  async function runResize() {
    if (r1Busy) { r1Again = true; return; }
    r1Busy = true;
    try {
      await runResizeCore();
    } finally {
      r1Busy = false;
      if (r1Again) { r1Again = false; runResize(); }
    }
  }

  async function runResizeCore() {
    const pane = $('#ibP1', rootEl);
    const wIn = clamp(parseInt($('#ibW', rootEl).value, 10) || 0, 0, 20000);
    const hIn = clamp(parseInt($('#ibH', rootEl).value, 10) || 0, 0, 20000);
    const lock = $('#ibLock', rootEl).value === '1';
    const items = st.p1.items;
    if (!items.length) { LB.toast('请先上传图片', 'info'); return; }
    if (!wIn && !hIn) { LB.toast('请输入宽度或高度', 'info'); return; }
    revokeTab('p1'); /* 重跑前释放上一轮结果 */
    const cards = [];
    for (const it of items) {
      const size = calcResize(it.img.naturalWidth, it.img.naturalHeight, wIn, hIn, lock);
      if (!size) continue;
      const c = document.createElement('canvas');
      c.width = size.w; c.height = size.h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(it.img, 0, 0, size.w, size.h);
      try {
        const blob = await LB.img.toBlob(c, 'image/png');
        const url = trackUrl(URL.createObjectURL(blob), 'p1');
        it.url = url;
        const fname = it.name.replace(/\.[^.]+$/, '') + '-resized.png';
        it.dl = fname;
        cards.push(cardHTML(url, it.name, size.w + '×' + size.h + ' · ' + LB.img.fmtSize(blob.size), fname));
      } catch (e) {
        cards.push('<div class="res-card"><div class="ib-name">' + it.name + '</div><div class="ib-meta">' + (e.message || '处理失败') + '</div></div>');
      }
    }
    renderGrid(pane, cards);
  }

  /* ============ Tab2 格式转换 ============ */
  let r2Busy = false, r2Again = false;
  async function runConvert() {
    if (r2Busy) { r2Again = true; return; }
    r2Busy = true;
    try {
      await runConvertCore();
    } finally {
      r2Busy = false;
      if (r2Again) { r2Again = false; runConvert(); }
    }
  }

  async function runConvertCore() {
    const pane = $('#ibP2', rootEl);
    const items = st.p2.items;
    if (!items.length) { LB.toast('请先上传图片', 'info'); return; }
    const mime = $('#ibFmt', rootEl).value;
    const q = clamp(parseInt($('#ibQ', rootEl).value, 10) || 85, 30, 100) / 100;
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    revokeTab('p2'); /* 重跑前释放上一轮结果 */
    const cards = [];
    for (const it of items) {
      const c = document.createElement('canvas');
      c.width = it.img.naturalWidth; c.height = it.img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      /* JPEG 不支持透明，先铺白底 */
      if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(it.img, 0, 0);
      try {
        const blob = mime === 'image/png'
          ? await LB.img.toBlob(c, 'image/png')
          : await LB.img.toBlob(c, mime, q);
        const url = trackUrl(URL.createObjectURL(blob), 'p2');
        const saved = Math.round((1 - blob.size / it.orig) * 100);
        const fname = it.name.replace(/\.[^.]+$/, '') + '.' + ext;
        cards.push(cardHTML(url, it.name,
          LB.img.fmtSize(it.orig) + ' → ' + LB.img.fmtSize(blob.size) +
          ' · ' + (saved >= 0 ? '节省 ' + saved + '%' : '增大 ' + (-saved) + '%'), fname));
      } catch (e) {
        cards.push('<div class="res-card"><div class="ib-name">' + it.name + '</div><div class="ib-meta">' + (e.message || '转换失败') + '</div></div>');
      }
    }
    renderGrid(pane, cards);
  }

  /* ============ Tab3 信息清理 ============ */
  async function runClean(files) {
    const pane = $('#ibP3', rootEl);
    const items = files || st.p3.items;
    if (!items.length) return;
    revokeTab('p3'); /* 释放上一轮结果（本轮 URL 尚未创建） */
    const cards = [];
    for (const it of items) {
      let img;
      try {
        img = await LB.img.load(it);
      } catch (e) {
        LB.toast(e.message || '图片解码失败', 'err');
        continue;
      }
      st.p3.items.push({ name: it.name || '图片', img: img, orig: it.size });
      /* 重绘成 JPEG(0.92)：EXIF / GPS / 相机参数全部抹除 */
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      try {
        const blob = await LB.img.toBlob(c, 'image/jpeg', 0.92);
        const url = trackUrl(URL.createObjectURL(blob), 'p3');
        const fname = (it.name || 'image').replace(/\.[^.]+$/, '') + '-clean.jpg';
        cards.push(cardHTML(url, it.name || '图片',
          LB.img.fmtSize(it.size) + ' → ' + LB.img.fmtSize(blob.size) + ' · 元数据已抹除', fname));
      } catch (e) {
        cards.push('<div class="res-card"><div class="ib-name">' + (it.name || '图片') + '</div><div class="ib-meta">' + (e.message || '清理失败') + '</div></div>');
      }
    }
    if (cards.length) {
      renderGrid(pane, cards);
    }
  }

  /* ============ Tab4 打码马赛克 ============ */
  function setupMosaic(pane) {
    const cv = $('#mbCv', pane);
    const box = $('#mbBox', pane);
    /* Step 5D-1 统一规则 2：显示尺寸 100%/auto，高度按宽高比自适应撑起容器 */
    cv.style.width = '100%';
    cv.style.height = 'auto';
    cv.style.display = 'block';
    cv.style.borderRadius = '10px';
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let dragging = false, anchor = null, sel = null;

    /* Step 5D-1：scaleX/scaleY 分开换算（用底层 canvas 自身 rect） */
    const toXY = e => {
      const rect = cv.getBoundingClientRect();
      const scaleX = cv.width / rect.width;
      const scaleY = cv.height / rect.height;
      return {
        x: clamp((e.clientX - rect.left) * scaleX, 0, cv.width),
        y: clamp((e.clientY - rect.top) * scaleY, 0, cv.height)
      };
    };
    const renderBox = () => {
      if (!sel || sel.w < 1 || sel.h < 1) { box.hidden = true; return; }
      box.hidden = false;
      box.style.left = (sel.x / cv.width * 100) + '%';
      box.style.top = (sel.y / cv.height * 100) + '%';
      box.style.width = (sel.w / cv.width * 100) + '%';
      box.style.height = (sel.h / cv.height * 100) + '%';
    };

    cv.addEventListener('pointerdown', e => {
      if (!st.p4.img) return;
      cv.setPointerCapture(e.pointerId);
      dragging = true;
      anchor = toXY(e);
      sel = { x: anchor.x, y: anchor.y, w: 0, h: 0 };
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (!dragging) return;
      const p = toXY(e);
      /* 支持反向拖拽：统一 min/max，w/h 恒为正 */
      sel = {
        x: Math.min(anchor.x, p.x), y: Math.min(anchor.y, p.y),
        w: Math.abs(p.x - anchor.x), h: Math.abs(p.y - anchor.y)
      };
      renderBox();
      e.preventDefault();
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      if (!sel) return;
      if (sel.w < 4 || sel.h < 4) { sel = null; box.hidden = true; return; } /* 小于 4px 无效 */
      applySel();
    };
    cv.addEventListener('pointerup', finish);
    cv.addEventListener('pointercancel', finish);

    function applySel() {
      const mode = $('#mbMode', pane).value;
      const strength = clamp(parseInt($('#mbStr', pane).value, 10) || 12, 4, 40);
      /* 撤销栈：应用前 push，最多 8 层 */
      st.p4.undo.push(ctx.getImageData(0, 0, cv.width, cv.height));
      if (st.p4.undo.length > 8) st.p4.undo.shift();

      if (mode === 'mosaic') {
        const cell = Math.max(2, strength * 0.9);
        const mw = Math.max(1, Math.round(sel.w / cell));
        const mh = Math.max(1, Math.round(sel.h / cell));
        const tmp = document.createElement('canvas');
        tmp.width = mw; tmp.height = mh;
        tmp.getContext('2d').drawImage(cv, sel.x, sel.y, sel.w, sel.h, 0, 0, mw, mh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, mw, mh, sel.x, sel.y, sel.w, sel.h);
        ctx.restore();
        ctx.imageSmoothingEnabled = true;
      } else {
        /* 高斯模糊：临时 canvas 全图模糊（先铺一遍原图避免边缘透明），clip 选区贴回 */
        const tmp = document.createElement('canvas');
        tmp.width = cv.width; tmp.height = cv.height;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(cv, 0, 0);
        tctx.filter = 'blur(' + strength + 'px)';
        tctx.drawImage(cv, 0, 0);
        tctx.filter = 'none';
        ctx.save();
        ctx.beginPath();
        ctx.rect(sel.x, sel.y, sel.w, sel.h);
        ctx.clip();
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      }
      /* 选区保留 200ms 提示后清除 */
      renderBox();
      clearTimeout(st.p4.boxTimer);
      st.p4.boxTimer = setTimeout(() => { sel = null; box.hidden = true; }, 200);
    }

    /* 撤销 */
    $('#mbUndo', pane).addEventListener('click', () => {
      const prev = st.p4.undo.pop();
      if (!prev) { LB.toast('没有可撤销的操作', 'info'); return; }
      ctx.putImageData(prev, 0, 0);
      LB.toast('已撤销', 'ok');
    });
    /* 下载 */
    $('#mbDl', pane).addEventListener('click', () => {
      if (!st.p4.img) { LB.toast('请先上传图片', 'info'); return; }
      LB.img.toBlob(cv, 'image/png').then(b => LB.img.download(b, 'mosaic.png')).catch(() => LB.toast('导出失败', 'err'));
    });
    /* 强度显示 */
    $('#mbStr', pane).addEventListener('input', e => { $('#mbStrV', pane).textContent = e.target.value; });
  }

  async function loadMosaic(file) {
    const pane = $('#ibP4', rootEl);
    let img;
    try {
      img = await LB.img.load(file);
    } catch (e) {
      LB.toast(e.message || '图片解码失败', 'err');
      return;
    }
    st.p4.img = img;
    st.p4.undo = [];
    const cv = $('#mbCv', pane);
    /* Step 5D-1 统一规则 5：等比尺寸 + clearRect + 4 参绘制整图 */
    const { w, h } = LB.img.fitSize(img.naturalWidth, img.naturalHeight, 1500);
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    console.log('[imgbatch] 打码 canvas 自检 base=' + cv.width + 'x' + cv.height);
    $('#mbPick', pane).hidden = true;
    $('#mbWork', pane).hidden = false;
  }

  /* ============ Tab 切换 ============ */
  function setTab(p) {
    curTab = p;
    $$('#ibTabs .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.p === p));
    ['p1', 'p2', 'p3', 'p4'].forEach(k => { $('#ib' + k.toUpperCase(), rootEl).hidden = k !== p; });
  }

  /* 各 tab 上传分发（粘贴用当前 tab） */
  function dispatchFiles(files) {
    if (curTab === 'p1') return addResize(files);
    if (curTab === 'p2') return addConvert(files);
    if (curTab === 'p3') return runClean(files);
    return loadMosaic(files[0]);
  }

  async function addResize(files) {
    for (const f of files) {
      try {
        const img = await LB.img.load(f);
        st.p1.items.push({ name: f.name || '图片', img: img, orig: f.size });
      } catch (e) { LB.toast(e.message || '图片解码失败', 'err'); }
    }
    if (st.p1.items.length) runResize();
  }

  async function addConvert(files) {
    for (const f of files) {
      try {
        const img = await LB.img.load(f);
        st.p2.items.push({ name: f.name || '图片', img: img, orig: f.size });
      } catch (e) { LB.toast(e.message || '图片解码失败', 'err'); }
    }
    if (st.p2.items.length) runConvert();
  }

  /* ============ 视图 ============ */
  function dropHTML(id, multiple) {
    return (
      '<div class="dropzone" id="' + id + '">点击选择、拖入图片，或直接 Ctrl+V 粘贴' + (multiple ? '（支持多张）' : '') + '</div>' +
      '<input type="file" id="' + id + 'File" accept="image/*"' + (multiple ? ' multiple' : '') + ' hidden>'
    );
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片批量处理</h1><p>尺寸修改 / 格式转换 / EXIF 清理 / 打码马赛克，全部本地处理</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="ibTabs">' +
      '<button class="seg-btn on" data-p="p1" type="button">尺寸修改</button>' +
      '<button class="seg-btn" data-p="p2" type="button">格式转换</button>' +
      '<button class="seg-btn" data-p="p3" type="button">信息清理</button>' +
      '<button class="seg-btn" data-p="p4" type="button">打码马赛克</button>' +
      '</div>' +

      /* Tab1 尺寸修改 */
      '<div class="tool-sec" id="ibP1">' +
      dropHTML('ibZ1', true) +
      '<div class="card set-card">' +
      '<div class="field"><label>宽度 px</label><input class="inp" id="ibW" type="number" min="0" max="20000" placeholder="如 800"></div>' +
      '<div class="field"><label>高度 px</label><input class="inp" id="ibH" type="number" min="0" max="20000" placeholder="留空则按宽等比"></div>' +
      '<div class="field"><label>比例</label><select class="inp" id="ibLock"><option value="1" selected>锁定比例</option><option value="0">不锁定（拉伸）</option></select></div>' +
      '<button class="btn btn-main" id="ibGo1" type="button">开始处理</button>' +
      '</div>' +
      '<div class="tool-sec ib-result" hidden><span class="tool-lab">结果 · 点击单张可下载</span><div class="res-grid ib-grid"></div></div>' +
      '<button class="btn btn-ghost" id="ibDl1" type="button">全部下载</button>' +
      '</div>' +

      /* Tab2 格式转换 */
      '<div class="tool-sec" id="ibP2" hidden>' +
      dropHTML('ibZ2', true) +
      '<div class="card set-card">' +
      '<div class="field"><label>目标格式</label><select class="inp" id="ibFmt"><option value="image/jpeg">JPG（体积小）</option><option value="image/png">PNG（无损）</option><option value="image/webp">WebP</option></select></div>' +
      '<div class="field"><label>质量</label><input type="range" id="ibQ" min="30" max="100" step="1" value="85"><output id="ibQv">85</output></div>' +
      '<button class="btn btn-main" id="ibGo2" type="button">开始转换</button>' +
      '</div>' +
      '<div class="tool-sec ib-result" hidden><span class="tool-lab">结果 · 点击单张可下载</span><div class="res-grid ib-grid"></div></div>' +
      '</div>' +

      /* Tab3 信息清理 */
      '<div class="tool-sec" id="ibP3" hidden>' +
      dropHTML('ibZ3', true) +
      '<div class="tip-dim">重绘后不保留任何元数据，隐私友好</div>' +
      '<div class="tool-sec ib-result" hidden><span class="tool-lab">结果 · 点击单张可下载</span><div class="res-grid ib-grid"></div></div>' +
      '<button class="btn btn-ghost" id="ibDl3" type="button">全部下载</button>' +
      '</div>' +

      /* Tab4 打码马赛克 */
      '<div class="tool-sec" id="ibP4" hidden>' +
      '<div id="mbPick">' + dropHTML('ibZ4') + '</div>' +
      '<div id="mbWork" hidden>' +
      '<div class="crop-wrap"><canvas id="mbCv" width="0" height="0"></canvas><div id="mbBox" hidden></div></div>' +
      '<div class="card set-card">' +
      '<div class="field"><label>方式</label><select class="inp" id="mbMode"><option value="mosaic" selected>马赛克</option><option value="blur">高斯模糊</option></select></div>' +
      '<div class="field"><label>强度</label><input type="range" id="mbStr" min="4" max="40" step="1" value="12"><output id="mbStrV">12</output></div>' +
      '<div class="tip-dim">在图片上拖拽框选要打码的区域</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="mbUndo" type="button">撤销</button>' +
      '<button class="btn btn-main" id="mbDl" type="button">下载 PNG</button>' +
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
    st.p1.items = []; st.p2.items = []; st.p3.items = [];
    st.p4 = { img: null, undo: [], boxTimer: null };
    blobUrls = []; dlTimers = [];

    /* 4 个 tab 各自绑定拖拽上传 */
    LB.img.bindDrop($('#ibZ1', root), $('#ibZ1File', root), addResize);
    LB.img.bindDrop($('#ibZ2', root), $('#ibZ2File', root), addConvert);
    LB.img.bindDrop($('#ibZ3', root), $('#ibZ3File', root), files => runClean(files));
    LB.img.bindDrop($('#ibZ4', root), $('#ibZ4File', root), files => loadMosaic(files[0]));
    pasteCleanups.push(LB.img.bindPasteAll(root, dispatchFiles));

    /* tab 切换：只显示当前 pane */
    $('#ibTabs', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTab(b.dataset.p);
    });

    /* Tab1 */
    $('#ibGo1', root).addEventListener('click', runResize);
    $('#ibDl1', root).addEventListener('click', () => downloadAll($('#ibP1', root), '请先处理图片'));
    /* Tab2 */
    $('#ibFmt', root).addEventListener('change', e => {
      $('#ibQ', root).disabled = e.target.value === 'image/png'; /* PNG 时禁用质量 */
    });
    $('#ibQ', root).addEventListener('input', e => { $('#ibQv', root).textContent = e.target.value; });
    $('#ibGo2', root).addEventListener('click', runConvert);
    /* Tab3 */
    $('#ibDl3', root).addEventListener('click', () => downloadAll($('#ibP3', root), '请先上传图片'));
    /* Tab4 */
    setupMosaic($('#ibP4', root));

    /* 结果卡片：点击下载（覆盖式委托） */
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { LB.hash.go('home'); return; }
      const card = e.target.closest('.res-card[data-url]');
      if (card) dlByUrl(card.dataset.url, card.dataset.dl);
    });
  }

  function unmount() {
    dlTimers.forEach(clearTimeout); dlTimers = [];
    clearTimeout(st.p4.boxTimer);
    collectUrls(); /* 全部 blob URL revoke */
    st.p1.items = []; st.p2.items = []; st.p3.items = [];
    st.p4 = { img: null, undo: [], boxTimer: null };
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('imgbatch', { mount, unmount });
})();
