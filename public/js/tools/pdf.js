/* LiteBox v5 · tools/pdf.js — PDF 工具箱（图片转 PDF / PDF 转图片 / 合并拆分 / 页码水印）
   vendor 按需加载：pdf-lib（tab1 预热 + 各写操作）、PDF.js + worker（tab2 预热 + 转换）
   状态按 tab 独立保存，切换不清空；unmount revoke 全部 objectURL */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ================= 通用：动态加载 vendor（脚本标签缓存：window 全局已存在则跳过） ================= */

  async function loadPDFLib() {
    if (window.PDFLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf-lib.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('PDF 组件加载失败，请检查网络'));
      document.head.appendChild(s);
    });
  }

  async function loadPDFJS() {
    if (window.pdfjsLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('PDF 解析组件加载失败，请检查网络'));
      document.head.appendChild(s);
    });
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    }
  }

  /* 解析页码范围字符串（如 "1-3,5"）→ 数字数组 */
  function parsePageRange(str, max) {
    if (!str.trim()) return Array.from({ length: max }, (_, i) => i + 1);
    const out = [];
    str.split(/[,，;；]/).forEach(part => {
      const m = part.trim().match(/^(\d+)(?:\s*[-—~]\s*(\d+))?$/);
      if (!m) return;
      let a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= max && out.indexOf(i) < 0) out.push(i);
    });
    return out;
  }

  /* canvas 绘制色从 tokens 读取（--pdf-page-bg 白底 / --pdf-wm-ink 墨色水印） */
  function tokenColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ================= 状态（切 tab 不清空） ================= */

  let rootEl = null;
  let alive = false;
  let tab = 'ip';
  let sub3 = 'merge';
  let sub4 = 'num';

  let ipFiles = [];        /* [{ file, img, thumb, url }] 图片转 PDF */
  let p2File = null;       /* PDF 转图片 */
  let p2Results = [];      /* [{ page, blob, url }] */
  let p3Files = [];        /* [File] 合并列表 */
  let p3SplitFile = null;  /* 拆分 */
  let p4NumFile = null;    /* 加页码 */
  let p4WmFile = null;     /* 加水印 */

  const urls = [];         /* 全部 objectURL 追踪，unmount 统一 revoke */

  function trackURL(u) { urls.push(u); return u; }

  /* ================= Tab 1 · 图片转 PDF ================= */

  function makeThumb(img) {
    const h = 48;
    const w = Math.max(1, Math.round(img.naturalWidth * (h / img.naturalHeight)));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function addImages(files) {
    const imgs = Array.from(files).filter(f => /^image\//.test(f.type));
    if (!imgs.length) { LB.toast('请选择图片文件', 'warn'); return; }
    /* 同步按选择顺序占位，onload 后异步填充缩略图（避免多图加载竞态打乱列表顺序） */
    imgs.forEach(file => {
      const url = trackURL(URL.createObjectURL(file));
      const item = { file, img: null, thumb: '', url };
      ipFiles.push(item);
      const img = new Image();
      img.onload = () => {
        item.img = img;
        item.thumb = makeThumb(img);
        renderIpList();
      };
      img.onerror = () => {
        item.bad = true;
        renderIpList();
      };
      img.src = url;
    });
    renderIpList();
  }

  /* 兜底：生成前补加载尚未完成的图片（如用户秒点生成） */
  function awaitImages() {
    return Promise.all(ipFiles.filter(x => !x.img).map(x => new Promise(res => {
      const im = new Image();
      im.onload = () => { x.img = im; x.thumb = makeThumb(im); res(); };
      im.onerror = () => { x.bad = true; res(); };
      im.src = x.url;
    })));
  }

  function renderIpList() {
    const box = $('#ipList', rootEl);
    if (!box) return;
    box.innerHTML = ipFiles.map((it, i) =>
      '<div class="pdf-row">' +
      '<span class="pdf-idx">' + (i + 1) + '</span>' +
      '<img class="pdf-thumbsm" loading="lazy" src="' + it.thumb + '" alt="" />' +
      '<span class="pdf-name" title="' + esc(it.file.name) + '">' + esc(it.file.name) + '</span>' +
      '<span class="pdf-acts">' +
      '<button class="btn btn-ghost btn-sm" data-act="ipUp" data-i="' + i + '" type="button"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="ipDown" data-i="' + i + '" type="button"' + (i === ipFiles.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="ipDel" data-i="' + i + '" type="button">✕</button>' +
      '</span></div>'
    ).join('');
    const n = $('#ipCount', rootEl);
    if (n) n.textContent = ipFiles.length ? '（' + ipFiles.length + ' 张）' : '';
  }

  async function imgToPDF() {
    if (!ipFiles.length) { LB.toast('请先选择图片', 'err'); return; }
    const btn = $('#ipGo', rootEl); btn.disabled = true; btn.textContent = '⏳ 正在生成…';
    try {
      await loadPDFLib();
      await awaitImages();
      const { PDFDocument } = PDFLib;
      const doc = await PDFDocument.create();
      const A4_W = 595.28, A4_H = 841.89;

      for (const item of ipFiles) {
        const img = item.img;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        /* 透明区填白（PDF 不支持透明层） */
        cx.fillStyle = tokenColor('--pdf-page-bg');
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(img, 0, 0);

        const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
        const buf = await blob.arrayBuffer();

        const jpg = await doc.embedJpg(buf);
        const page = doc.addPage([A4_W, A4_H]);
        /* 按宽高比缩放到 A4（留边 24pt），不拉伸变形 */
        const maxW = A4_W - 48, maxH = A4_H - 48;
        const scale = Math.min(maxW / jpg.width, maxH / jpg.height);
        const w = jpg.width * scale, h = jpg.height * scale;
        page.drawImage(jpg, {
          x: (A4_W - w) / 2,
          y: (A4_H - h) / 2,
          width: w,
          height: h
        });
      }

      const bytes = await doc.save();
      LB.img.download(new Blob([bytes], { type: 'application/pdf' }), 'LiteBox-' + Date.now() + '.pdf');
      LB.toast('PDF 已生成（' + ipFiles.length + ' 页）', 'ok');
    } catch (e) {
      LB.toast(e.message || '生成失败', 'err');
    } finally {
      btn.disabled = false; btn.textContent = '🖼️ 生成 PDF';
    }
  }

  /* ================= Tab 2 · PDF 转图片 ================= */

  async function pdfToImg() {
    if (!p2File) return;
    const btn = $('#p2Go', rootEl); btn.disabled = true;
    const stat = $('#p2Stat', rootEl);
    const grid = $('#p2Grid', rootEl);
    try {
      await loadPDFJS();
      const buf = await p2File.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pages = parsePageRange($('#p2Range', rootEl).value, pdf.numPages);
      if (!pages.length) { LB.toast('页码范围为空', 'err'); return; }

      const scale = +$('#p2Scale', rootEl).value;
      const fmt = $('#p2Fmt', rootEl).value;
      p2Results = [];
      grid.innerHTML = '';

      for (let i = 0; i < pages.length; i++) {
        stat.textContent = '⏳ 渲染第 ' + (i + 1) + ' / ' + pages.length + ' 页…';
        const page = await pdf.getPage(pages[i]);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise(r => canvas.toBlob(r, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
        const url = trackURL(URL.createObjectURL(blob));
        p2Results.push({ page: pages[i], blob, url });

        /* 插入缩略图卡片 */
        const item = document.createElement('div');
        item.className = 'pdf-thumb';
        item.innerHTML = '<img loading="lazy" src="' + url + '" alt="第 ' + pages[i] + ' 页"><b>第 ' + pages[i] + ' 页</b>';
        item.addEventListener('click', () => {
          LB.img.download(blob, p2File.name.replace(/\.pdf$/i, '') + '-p' + pages[i] + (fmt === 'png' ? '.png' : '.jpg'));
        });
        grid.appendChild(item);
      }
      stat.textContent = '✓ 转换完成：' + pages.length + ' 张图片';
      $('#p2Down', rootEl).hidden = false;
    } catch (e) {
      LB.toast(e.message || '转换失败', 'err');
      stat.textContent = '⚠️ ' + (e.message || '转换失败');
    } finally {
      btn.disabled = false;
    }
  }

  function downloadAll() {
    if (!p2File || !p2Results.length) return;
    const ext = $('#p2Fmt', rootEl).value === 'png' ? '.png' : '.jpg';
    const base = p2File.name.replace(/\.pdf$/i, '');
    p2Results.forEach((r, i) => {
      setTimeout(() => { if (alive) LB.img.download(r.blob, base + '-p' + r.page + ext); }, i * 320);
    });
  }

  /* ================= Tab 3 · 合并 / 拆分 ================= */

  function renderP3List() {
    const box = $('#p3List', rootEl);
    if (!box) return;
    box.innerHTML = p3Files.map((f, i) =>
      '<div class="pdf-row">' +
      '<span class="pdf-idx">' + (i + 1) + '</span>' +
      '<span class="pdf-ico">📄</span>' +
      '<span class="pdf-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
      '<small class="pdf-size">' + LB.dom.fmtSize(f.size) + '</small>' +
      '<span class="pdf-acts">' +
      '<button class="btn btn-ghost btn-sm" data-act="p3Up" data-i="' + i + '" type="button"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="p3Down" data-i="' + i + '" type="button"' + (i === p3Files.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="p3Del" data-i="' + i + '" type="button">✕</button>' +
      '</span></div>'
    ).join('');
    const n = $('#p3Count', rootEl);
    if (n) n.textContent = p3Files.length ? '（' + p3Files.length + ' 个）' : '';
  }

  async function merge() {
    if (p3Files.length < 2) { LB.toast('请先选择至少 2 个 PDF', 'err'); return; }
    const btn = $('#p3Go', rootEl); btn.disabled = true;
    try {
      await loadPDFLib();
      const { PDFDocument } = PDFLib;
      const out = await PDFDocument.create();
      for (const f of p3Files) {
        const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        const cps = await out.copyPages(src, src.getPageIndices());
        cps.forEach(p => out.addPage(p));
      }
      const bytes = await out.save();
      LB.img.download(new Blob([bytes], { type: 'application/pdf' }), 'LiteBox-合并-' + Date.now() + '.pdf');
      LB.toast('合并完成，共 ' + out.getPageCount() + ' 页', 'ok');
    } catch (e) {
      LB.toast(e.message || '合并失败', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function split() {
    const info = $('#p3Info', rootEl);
    const btn = $('#p3Go2', rootEl); btn.disabled = true;
    try {
      await loadPDFLib();
      const { PDFDocument } = PDFLib;
      const src = await PDFDocument.load(await p3SplitFile.arrayBuffer(), { ignoreEncryption: true });
      const total = src.getPageCount();
      const rangeStr = $('#p3Pages', rootEl).value.trim();
      const base = p3SplitFile.name.replace(/\.pdf$/i, '');

      if (rangeStr) {
        /* 提取指定页 */
        const want = parsePageRange(rangeStr, total);
        if (!want.length) { LB.toast('页码范围无效', 'err'); return; }
        const out = await PDFDocument.create();
        const cps = await out.copyPages(src, want.map(n => n - 1));
        cps.forEach(p => out.addPage(p));
        const bytes = await out.save();
        LB.img.download(new Blob([bytes], { type: 'application/pdf' }), base + '-提取' + want.length + '页.pdf');
        LB.toast('已提取 ' + want.length + ' 页', 'ok');
      } else {
        /* 每页拆开 */
        if (total > 40) { LB.toast('共 ' + total + ' 页，超过 40 页请用「提取页」功能分批处理', 'err'); return; }
        for (let i = 0; i < total; i++) {
          info.textContent = '⏳ 正在拆出第 ' + (i + 1) + ' / ' + total + ' 页…';
          const out = await PDFDocument.create();
          const cps = await out.copyPages(src, [i]);
          cps.forEach(p => out.addPage(p));
          const bytes = await out.save();
          LB.img.download(new Blob([bytes], { type: 'application/pdf' }), base + '-第' + (i + 1) + '页.pdf');
          await new Promise(r => setTimeout(r, 240)); /* 留间隔让浏览器处理多个下载 */
        }
        info.textContent = '✓ 已拆分 ' + total + ' 个 PDF';
      }
    } catch (e) {
      LB.toast(e.message || '拆分失败', 'err');
      info.textContent = '⚠️ ' + (e.message || '拆分失败');
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= Tab 4 · 页码 / 水印 ================= */

  async function addPageNumbers() {
    if (!p4NumFile) return;
    const btn = $('#p4GoN', rootEl); btn.disabled = true;
    try {
      await loadPDFLib();
      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const doc = await PDFDocument.load(await p4NumFile.arrayBuffer(), { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const pos = $('#p4Pos', rootEl).value;
      const from = +$('#p4From', rootEl).value || 1;
      const fs = clamp(+$('#p4Size', rootEl).value || 11, 6, 36);

      doc.getPages().forEach((pg, i) => {
        const { width } = pg.getSize();
        const txt = String(from + i);
        const tw = font.widthOfTextAtSize(txt, fs);
        let x;
        if (pos === 'l') x = 36;
        else if (pos === 'r') x = width - tw - 36;
        else x = (width - tw) / 2;
        pg.drawText(txt, { x, y: 26, size: fs, font, color: rgb(0.2, 0.22, 0.3) });
      });

      const bytes = await doc.save();
      LB.img.download(new Blob([bytes], { type: 'application/pdf' }), p4NumFile.name.replace(/\.pdf$/i, '') + '-页码版.pdf');
      LB.toast('页码添加完成，共 ' + doc.getPageCount() + ' 页', 'ok');
    } catch (e) {
      LB.toast(e.message || '生成失败', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function addWatermark() {
    const text = $('#p4Text', rootEl).value.trim();
    if (!text) { LB.toast('请输入水印文字', 'err'); return; }
    if (!p4WmFile) { LB.toast('请先选择 PDF 文件', 'err'); return; }
    const btn = $('#p4GoW', rootEl); btn.disabled = true;
    try {
      await loadPDFLib();
      const { PDFDocument, degrees, rgb } = PDFLib;
      const doc = await PDFDocument.load(await p4WmFile.arrayBuffer(), { ignoreEncryption: true });
      const fs = clamp(+$('#p4WSize', rootEl).value || 40, 12, 120);
      const deg = +$('#p4Deg', rootEl).value || 0;
      const op = clamp((+$('#p4Op', rootEl).value || 12) / 100, 0.03, 0.6);
      const tile = $('#p4Tile', rootEl).value === '1';

      /* 用 canvas 画一次水印，导出 PNG，再嵌入 PDF（pdf-lib 内置字体不支持中文） */
      const cv = document.createElement('canvas');
      const mctx = cv.getContext('2d');
      mctx.font = 'bold ' + fs + 'px sans-serif';
      const w = Math.ceil(mctx.measureText(text).width) + 40;
      const h = fs + 40;
      cv.width = w;
      cv.height = h;
      mctx.font = 'bold ' + fs + 'px sans-serif';
      mctx.textBaseline = 'middle';
      mctx.fillStyle = tokenColor('--pdf-wm-ink');
      mctx.fillText(text, 20, h / 2);

      const pngDataUrl = cv.toDataURL('image/png');
      const stamp = await doc.embedPng(pngDataUrl);

      doc.getPages().forEach(pg => {
        const { width, height } = pg.getSize();
        if (tile) {
          for (let y = -h; y < height + h; y += h + Math.round(h * 1.6)) {
            for (let x = -w; x < width + w; x += w + Math.round(w * 0.8)) {
              pg.drawImage(stamp, {
                x, y, width: w, height: h,
                opacity: op,
                rotate: degrees(deg)
              });
            }
          }
        } else {
          pg.drawImage(stamp, {
            x: (width - w) / 2,
            y: (height - h) / 2,
            width: w,
            height: h,
            opacity: op,
            rotate: degrees(deg)
          });
        }
      });

      const bytes = await doc.save();
      LB.img.download(new Blob([bytes], { type: 'application/pdf' }), p4WmFile.name.replace(/\.pdf$/i, '') + '-水印版.pdf');
      LB.toast('水印添加完成，共 ' + doc.getPageCount() + ' 页', 'ok');
    } catch (e) {
      LB.toast(e.message || '生成失败', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= Tab 切换（面板常驻，仅 hidden 切换 → 状态天然保持） ================= */

  function setTab(t) {
    tab = t;
    $$('.pd-tab', rootEl).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    ['ip', 'p2', 'p3', 'p4'].forEach(x => { const el = $('#pd-' + x, rootEl); if (el) el.hidden = x !== t; });
    /* 切到转图片 tab 时预热 PDF.js（worker 在首次转换时由 pdf.js 拉起） */
    if (t === 'p2') loadPDFJS().catch(() => {});
  }

  function setSub3(s) {
    sub3 = s;
    $$('#p3Seg button', rootEl).forEach(b => b.classList.toggle('on', b.dataset.sub === s));
    const m = $('#p3Merge', rootEl), sp = $('#p3SplitBox', rootEl);
    if (m) m.hidden = s !== 'merge';
    if (sp) sp.hidden = s !== 'split';
  }

  function setSub4(s) {
    sub4 = s;
    $$('#p4Seg button', rootEl).forEach(b => b.classList.toggle('on', b.dataset.sub === s));
    const n = $('#p4NumBox', rootEl), w = $('#p4WmBox', rootEl);
    if (n) n.hidden = s !== 'num';
    if (w) w.hidden = s !== 'wm';
  }

  /* ================= 页面结构 ================= */

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>PDF 工具箱</h1><p>图片与 PDF 互转、合并拆分、加页码与水印，全部在本机浏览器完成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg pd-tabs">' +
      '<button type="button" class="pd-tab on" data-tab="ip">🖼️ 图片转 PDF</button>' +
      '<button type="button" class="pd-tab" data-tab="p2">🏞️ PDF 转图片</button>' +
      '<button type="button" class="pd-tab" data-tab="p3">📑 合并 / 拆分</button>' +
      '<button type="button" class="pd-tab" data-tab="p4">#️⃣ 页码 / 水印</button>' +
      '</div>' +

      /* —— Tab 1 图片转 PDF —— */
      '<div class="card tool-sec set-card" id="pd-ip">' +
      '<div class="dropzone" id="ipDrop" data-drop="ip">' +
      '<span class="pd-dz-ic">🖼️</span><b>选择或拖入图片</b><small>支持多张，生成后每张一页 A4</small>' +
      '<input type="file" id="ipFile" accept="image/*" multiple hidden />' +
      '</div>' +
      '<span class="tool-lab">图片列表 <em id="ipCount" class="pdf-count"></em></span>' +
      '<div id="ipList" class="pdf-list"></div>' +
      '<button class="btn btn-main" id="ipGo" data-act="ipGo" type="button">🖼️ 生成 PDF</button>' +
      '</div>' +

      /* —— Tab 2 PDF 转图片 —— */
      '<div class="card tool-sec set-card" id="pd-p2" hidden>' +
      '<div class="dropzone" id="p2Drop" data-drop="p2">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF</b><small>转成 JPG / PNG 图片</small>' +
      '<input type="file" id="p2File" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p2Ctl" hidden class="pdf-panel">' +
      '<div class="pdf-form">' +
      '<label class="pz-lab">页码范围<input class="inp" id="p2Range" type="text" placeholder="如 1-3,5，留空 = 全部" /></label>' +
      '<label class="pz-lab">格式<select class="inp" id="p2Fmt"><option value="jpg">JPG</option><option value="png">PNG</option></select></label>' +
      '<label class="pz-lab">清晰度<select class="inp" id="p2Scale"><option value="1.5">标准 1.5x</option><option value="2" selected>高清 2x</option><option value="3">超清 3x</option></select></label>' +
      '</div>' +
      '<div class="pdf-btns">' +
      '<button class="btn btn-main" id="p2Go" data-act="p2Go" type="button">🏞️ 开始转换</button>' +
      '<button class="btn btn-ghost" id="p2Down" data-act="p2Down" type="button" hidden>⬇️ 下载全部图片</button>' +
      '</div>' +
      '<div class="pdf-stat" id="p2Stat">上传 PDF 后即可转换</div>' +
      '<div id="p2Grid" class="pdf-grid"></div>' +
      '</div>' +
      '</div>' +

      /* —— Tab 3 合并 / 拆分 —— */
      '<div class="card tool-sec set-card" id="pd-p3" hidden>' +
      '<div class="seg" id="p3Seg">' +
      '<button type="button" class="on" data-sub="merge">🔗 合并</button>' +
      '<button type="button" data-sub="split">✂️ 拆分</button>' +
      '</div>' +
      '<div id="p3Merge" class="pdf-panel">' +
      '<div class="dropzone" id="p3Drop" data-drop="p3m">' +
      '<span class="pd-dz-ic">📑</span><b>选择或拖入多个 PDF</b><small>按列表顺序合并</small>' +
      '<input type="file" id="p3File" accept="application/pdf,.pdf" multiple hidden />' +
      '</div>' +
      '<span class="tool-lab">合并顺序 <em id="p3Count" class="pdf-count"></em></span>' +
      '<div id="p3List" class="pdf-list"></div>' +
      '<button class="btn btn-main" id="p3Go" data-act="p3Go" type="button">🔗 合并并下载</button>' +
      '</div>' +
      '<div id="p3SplitBox" class="pdf-panel" hidden>' +
      '<div class="dropzone" id="p3SplitDrop" data-drop="p3s">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF</b><small>拆分为多个 PDF</small>' +
      '<input type="file" id="p3SplitFile" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p3SplitCtl" hidden class="pdf-panel">' +
      '<label class="pz-lab pdf-wide">页码<input class="inp" id="p3Pages" type="text" placeholder="如 1,3-5；留空 = 每页拆成单独 PDF" /></label>' +
      '<button class="btn btn-main" id="p3Go2" data-act="p3Go2" type="button">✂️ 执行并下载</button>' +
      '<div class="pdf-stat" id="p3Info"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* —— Tab 4 页码 / 水印 —— */
      '<div class="card tool-sec set-card" id="pd-p4" hidden>' +
      '<div class="seg" id="p4Seg">' +
      '<button type="button" class="on" data-sub="num">#️⃣ 加页码</button>' +
      '<button type="button" data-sub="wm">💧 加水印</button>' +
      '</div>' +
      '<div id="p4NumBox" class="pdf-panel">' +
      '<div class="dropzone" id="p4NumDrop" data-drop="p4n">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF</b><small>在页面底部添加页码</small>' +
      '<input type="file" id="p4NumFile" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p4NumCtl" hidden class="pdf-panel">' +
      '<div class="pdf-form">' +
      '<label class="pz-lab">位置<select class="inp" id="p4Pos"><option value="c">底部居中</option><option value="l">底部左侧</option><option value="r">底部右侧</option></select></label>' +
      '<label class="pz-lab">起始页码<input class="inp" id="p4From" type="number" value="1" min="1" /></label>' +
      '<label class="pz-lab">字号<input class="inp" id="p4Size" type="number" value="11" min="6" max="36" /></label>' +
      '</div>' +
      '<button class="btn btn-main" id="p4GoN" data-act="p4GoN" type="button">#️⃣ 生成并下载</button>' +
      '</div>' +
      '</div>' +
      '<div id="p4WmBox" class="pdf-panel" hidden>' +
      '<div class="dropzone" id="p4WmDrop" data-drop="p4w">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF</b><small>添加文字水印</small>' +
      '<input type="file" id="p4WmFile" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p4WmCtl" hidden class="pdf-panel">' +
      '<div class="pdf-form">' +
      '<label class="pz-lab pdf-wide">水印文字<input class="inp" id="p4Text" type="text" value="仅供学习使用" maxlength="40" /></label>' +
      '<label class="pz-lab">不透明度 %<input class="inp" id="p4Op" type="number" value="12" min="3" max="60" /></label>' +
      '<label class="pz-lab">角度 °<input class="inp" id="p4Deg" type="number" value="45" /></label>' +
      '<label class="pz-lab">字号<input class="inp" id="p4WSize" type="number" value="40" min="12" max="120" /></label>' +
      '<label class="pz-lab">布局<select class="inp" id="p4Tile"><option value="1">平铺全页</option><option value="0">居中一枚</option></select></label>' +
      '</div>' +
      '<button class="btn btn-main" id="p4GoW" data-act="p4GoW" type="button">💧 生成并下载</button>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '<p class="cd-note">所有处理均在本机浏览器完成，文件不会上传到任何服务器；扫描版 PDF 与加密 PDF 可能无法处理。</p>' +
      '</div>';
  }

  /* ================= 文件接入 ================= */

  function bindDrop(dropId, inputId, handler) {
    const drop = $(dropId, rootEl);
    const input = $(inputId, rootEl);
    if (!drop || !input) return;
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files && input.files.length) handler(input.files); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files.length) handler(e.dataTransfer.files);
    });
  }

  function showP2Ctl() {
    $('#p2Ctl', rootEl).hidden = false;
    LB.replay($('#p2Ctl', rootEl), 'lb-scale-in'); /* Step 10 */
    $('#p2Stat', rootEl).textContent = '已选择：' + p2File.name + '，点击「开始转换」';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    bindDrop('#ipDrop', '#ipFile', addImages);
    bindDrop('#p2Drop', '#p2File', files => {
      const f = files[0];
      if (!f) return;
      if (!/^application\/pdf$/.test(f.type) && !/\.pdf$/i.test(f.name)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      p2File = f;
      showP2Ctl();
    });
    bindDrop('#p3Drop', '#p3File', files => {
      Array.from(files).forEach(f => { if (/^application\/pdf$/.test(f.type) || /\.pdf$/i.test(f.name)) p3Files.push(f); });
      renderP3List();
    });
    bindDrop('#p3SplitDrop', '#p3SplitFile', files => {
      const f = files[0];
      if (!f) return;
      if (!/^application\/pdf$/.test(f.type) && !/\.pdf$/i.test(f.name)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      p3SplitFile = f;
      $('#p3SplitCtl', rootEl).hidden = false;
      $('#p3Info', rootEl).textContent = '已选择：' + f.name;
    });
    bindDrop('#p4NumDrop', '#p4NumFile', files => {
      const f = files[0];
      if (!f) return;
      if (!/^application\/pdf$/.test(f.type) && !/\.pdf$/i.test(f.name)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      p4NumFile = f;
      $('#p4NumCtl', rootEl).hidden = false;
    });
    bindDrop('#p4WmDrop', '#p4WmFile', files => {
      const f = files[0];
      if (!f) return;
      if (!/^application\/pdf$/.test(f.type) && !/\.pdf$/i.test(f.name)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      p4WmFile = f;
      $('#p4WmCtl', rootEl).hidden = false;
    });

    $$('.pd-tab', root).forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#p3Seg', root).addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) setSub3(b.dataset.sub); });
    $('#p4Seg', root).addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) setSub4(b.dataset.sub); });

    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const i = +b.dataset.i;
      const act = b.dataset.act;
      if (act === 'ipGo') imgToPDF();
      else if (act === 'ipUp' && i > 0) { [ipFiles[i - 1], ipFiles[i]] = [ipFiles[i], ipFiles[i - 1]]; renderIpList(); }
      else if (act === 'ipDown' && i < ipFiles.length - 1) { [ipFiles[i + 1], ipFiles[i]] = [ipFiles[i], ipFiles[i + 1]]; renderIpList(); }
      else if (act === 'ipDel') { ipFiles.splice(i, 1); renderIpList(); }
      else if (act === 'p2Go') pdfToImg();
      else if (act === 'p2Down') downloadAll();
      else if (act === 'p3Go') merge();
      else if (act === 'p3Go2') split();
      else if (act === 'p3Up' && i > 0) { [p3Files[i - 1], p3Files[i]] = [p3Files[i], p3Files[i - 1]]; renderP3List(); }
      else if (act === 'p3Down' && i < p3Files.length - 1) { [p3Files[i + 1], p3Files[i]] = [p3Files[i], p3Files[i + 1]]; renderP3List(); }
      else if (act === 'p3Del') { p3Files.splice(i, 1); renderP3List(); }
      else if (act === 'p4GoN') addPageNumbers();
      else if (act === 'p4GoW') addWatermark();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    renderIpList();
    renderP3List();
    /* 打开工具即后台预热 pdf-lib（验收：首次打开 Network 加载 pdf-lib.min.js；失败静默，用时再报错） */
    loadPDFLib().catch(() => {});
  }

  function unmount() {
    alive = false;
    urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
    urls.length = 0;
    ipFiles = [];
    p2File = null;
    p2Results = [];
    p3Files = [];
    p3SplitFile = null;
    p4NumFile = null;
    p4WmFile = null;
    rootEl = null;
  }

  LB.router.register('pdf', { mount, unmount });
})();
