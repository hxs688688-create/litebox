/* LiteBox v5 · tools/pdf.js — PDF 工具箱
   Tab：图片转 PDF / PDF 转图片 / 合并拆分 / 页码水印 / 签名盖章 / 加密解密
   vendor 按需加载：pdf-lib（写操作）、PDF.js + worker（渲染预览与转换）
   状态按 tab 独立保存，切换不清空；unmount revoke 全部 objectURL

   【Step 15 · B2 的两处技术说明】
   1) 任务书说「pdf-lib ≥1.17.0 内置加密」——**不成立**。官方 pdf-lib 至今（1.17.1）没有
      encrypt 能力，仓库里那条 `PDFDocument.load is encrypted` 只是「拒绝加载」的错误文案。
      因此这里把 vendor 换成 **@cantoo/pdf-lib**（pdf-lib 的维护分支，API 完全兼容，
      额外提供 `doc.encrypt({userPassword, ownerPassword, permissions, algorithm})`
      与 `PDFDocument.load(bytes, { password })`），默认 AES-256。
   2) 解密**不能**只 `load({password})` 再 `save()`：实测解密后的上下文仍保留原文件的
      /Encrypt 残留对象，重新保存出来的文件 Adobe / Chrome 依然判定为加密。
      正确做法是新建一个空文档 + `copyPages` 把页面搬过去，得到真正无加密的 PDF。 */
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

  /* Step 15 · B1 签名 / 盖章 */
  let p5File = null;       /* 待签名 PDF */
  let p5Pdf = null;        /* PDF.js 文档（预览用） */
  let p5PageNo = 1;
  let p5PageCount = 0;
  let p5Sig = null;        /* { base, canvas, w, h, url } 去白底后的签名图 */
  let p5Place = null;      /* { rx, ry, rw } 相对页面尺寸的比例 */
  let p5Angle = 0;
  let p5AllPages = true;

  /* Step 15 · B2 加密 / 解密 */
  let p6EncFile = null;
  let p6DecFile = null;
  let p6Sub = 'enc';

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
    ['ip', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach(x => { const el = $('#pd-' + x, rootEl); if (el) el.hidden = x !== t; });
    /* 切到转图片 tab 时预热 PDF.js（worker 在首次转换时由 pdf.js 拉起） */
    if (t === 'p2') loadPDFJS().catch(() => {});
    /* Step 15：签名 tab 需要 PDF.js 渲染预览；加密 tab 需要 pdf-lib */
    if (t === 'p5') {
      loadPDFJS().catch(() => {});
      if (p5Pdf) renderSigStage();   /* 切回来时按当前容器宽度重渲染，避免宽度为 0 */
    }
    if (t === 'p6') loadPDFLib().catch(() => {});
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

  /* ================= Tab 5 · 签名 / 盖章 ================= */

  /* 去白底：亮度 ≥240 全透明，200~240 之间线性过渡（保留笔画边缘，避免一圈白边） */
  function removeWhiteBg(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (lum >= 240) d[i + 3] = 0;
      else if (lum > 200) d[i + 3] = Math.round(255 * (240 - lum) / 40);
    }
    ctx.putImageData(img, 0, 0);
  }

  /* 裁掉四周全透明的空白，让签名贴边 —— 否则放置位置会明显偏 */
  function trimCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const W = canvas.width, H = canvas.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return canvas;   /* 整张图都被判成白色 → 原样返回，交给用户自己换图 */
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    return out;
  }

  /* 按倾斜角重绘签名（旋转留透明边，保证后续放置仍是轴对齐矩形） */
  function applySigAngle() {
    if (!p5Sig) return;
    const src = p5Sig.base;
    const rad = p5Angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const w = Math.max(1, Math.ceil(src.width * cos + src.height * sin));
    const h = Math.max(1, Math.ceil(src.width * sin + src.height * cos));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.translate(w / 2, h / 2);
    x.rotate(rad);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    p5Sig.canvas = c;
    p5Sig.w = w; p5Sig.h = h;
    p5Sig.url = c.toDataURL('image/png');
    layoutSig();
  }

  /* 默认落点：页面右下方（真实签名的常见位置）。
     上传完签名图立刻自动放一枚，用户能马上看到效果，再拖/点微调。 */
  function autoPlace() {
    const cv = $('#p5Cv', rootEl);
    if (!cv || !p5Sig || p5Place) return;
    const rw = clamp((parseFloat($('#p5Scale', rootEl).value) || 28) / 100, 0.05, 0.9);
    const hRatio = rw * cv.width * (p5Sig.h / p5Sig.w) / cv.height;
    p5Place = {
      rx: clamp(0.62 - rw / 2, 0, Math.max(0, 1 - rw)),
      ry: clamp(0.80 - hRatio / 2, 0, Math.max(0, 1 - hRatio)),
      rw: rw
    };
    layoutSig();
    renderSigHint();
  }

  async function loadSigImage(file) {
    const img = await LB.img.load(file);
    const c = document.createElement('canvas');
    c.width = Math.max(1, img.naturalWidth);
    c.height = Math.max(1, img.naturalHeight);
    c.getContext('2d').drawImage(img, 0, 0);
    removeWhiteBg(c);
    const trimmed = trimCanvas(c);
    p5Sig = { base: trimmed, canvas: trimmed, w: trimmed.width, h: trimmed.height, url: trimmed.toDataURL('image/png') };
    p5Place = null;
    applySigAngle();
    autoPlace();
    layoutSig();
    renderSigHint();
  }

  async function openP5Pdf(file) {
    p5File = file;
    p5Pdf = null;
    p5PageNo = 1;
    $('#p5Ctl', rootEl).hidden = false;
    $('#p5Stat', rootEl).textContent = '⏳ 正在解析 PDF…';
    try {
      await loadPDFJS();
      const buf = await file.arrayBuffer();
      p5Pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      p5PageCount = p5Pdf.numPages;
      $('#p5PageInfo', rootEl).textContent = '第 1 / ' + p5PageCount + ' 页';
      $('#p5Stat', rootEl).textContent = '已选择：' + file.name + '（' + p5PageCount + ' 页）';
      await renderSigStage();
    } catch (e) {
      $('#p5Stat', rootEl).textContent = '⚠️ PDF 解析失败：' + ((e && e.message) || '未知错误');
      LB.toast('PDF 解析失败', 'err');
    }
  }

  async function renderSigStage() {
    const stage = $('#p5Stage', rootEl);
    if (!stage) return;
    if (!p5Pdf) { stage.innerHTML = '<p class="cd-note">上传 PDF 后在这里预览并放置签名。</p>'; return; }
    const page = await p5Pdf.getPage(p5PageNo);
    const vp1 = page.getViewport({ scale: 1 });
    const maxW = Math.max(240, Math.min(720, (stage.clientWidth || stage.parentNode.clientWidth || 340)));
    const scale = Math.min(1.6, maxW / vp1.width);
    const vp = page.getViewport({ scale });
    stage.innerHTML =
      '<div class="p5-wrap" id="p5Wrap">' +
      '<canvas id="p5Cv" width="' + Math.round(vp.width) + '" height="' + Math.round(vp.height) + '"></canvas>' +
      '<img class="p5-sig" id="p5Sig" alt="签名预览" />' +
      '</div>';
    const cv = $('#p5Cv', rootEl);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    bindSigDrag();
    /* 签名图先于 PDF 上传时，这里补一次自动落点 */
    if (p5Sig && !p5Place) autoPlace();
    layoutSig();
    renderSigHint();
  }

  function sigBox(cvW, cvH) {
    if (!p5Sig || !p5Place) return null;
    const w = p5Place.rw * cvW;
    return { w: w, h: w * (p5Sig.h / p5Sig.w) };
  }

  function layoutSig() {
    const cv = $('#p5Cv', rootEl);
    const el = $('#p5Sig', rootEl);
    if (!cv || !el) return;
    if (!p5Sig || !p5Place) { el.hidden = true; return; }
    const box = sigBox(cv.width, cv.height);
    el.hidden = false;
    el.src = p5Sig.url;
    el.style.left = (p5Place.rx * cv.width) + 'px';
    el.style.top = (p5Place.ry * cv.height) + 'px';
    el.style.width = box.w + 'px';
    el.style.height = box.h + 'px';
  }

  function renderSigHint() {
    const hint = $('#p5Hint', rootEl);
    if (!hint) return;
    if (!p5Pdf) { hint.textContent = '先上传 PDF。'; return; }
    if (!p5Sig) { hint.textContent = '再上传签名 / 印章图片（白底会自动去掉）。'; return; }
    if (!p5Place) { hint.textContent = '在预览图上点一下放置签名；拖动可微调位置。'; return; }
    hint.textContent = '已放置 · 位置 ' + Math.round(p5Place.rx * 100) + '% / ' + Math.round(p5Place.ry * 100) +
      '% · 宽度 ' + Math.round(p5Place.rw * 100) + '%（拖动可微调，也可以直接点预览图重新放置）';
  }

  /* 点击预览图 → 把签名中心放到点击处 */
  function placeAt(evt) {
    const cv = $('#p5Cv', rootEl);
    if (!cv || !p5Sig) { if (!p5Sig) LB.toast('请先上传签名 / 印章图片', 'info'); return; }
    const r = cv.getBoundingClientRect();
    const px = clamp((evt.clientX - r.left) / r.width, 0, 1);
    const py = clamp((evt.clientY - r.top) / r.height, 0, 1);
    const rw = p5Place ? p5Place.rw : (parseFloat($('#p5Scale', rootEl).value) || 28) / 100;
    const hRatio = rw * cv.width * (p5Sig.h / p5Sig.w) / cv.height;   /* 高度占页高比例 */
    p5Place = {
      rx: clamp(px - rw / 2, 0, Math.max(0, 1 - rw)),
      ry: clamp(py - hRatio / 2, 0, Math.max(0, 1 - hRatio)),
      rw: rw
    };
    layoutSig();
    renderSigHint();
  }

  function bindSigDrag() {
    const el = $('#p5Sig', rootEl);
    const cv = $('#p5Cv', rootEl);
    if (!el || !cv) return;
    let dragging = false, sx = 0, sy = 0, srx = 0, sry = 0;
    el.addEventListener('pointerdown', e => {
      if (!p5Place) return;
      dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      sx = e.clientX; sy = e.clientY;
      srx = p5Place.rx; sry = p5Place.ry;
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('pointermove', e => {
      if (!dragging || !p5Place) return;
      const r = cv.getBoundingClientRect();
      const box = sigBox(cv.width, cv.height);
      p5Place.rx = clamp(srx + (e.clientX - sx) / r.width, 0, Math.max(0, 1 - p5Place.rw));
      p5Place.ry = clamp(sry + (e.clientY - sy) / r.height, 0, Math.max(0, 1 - box.h / cv.height));
      layoutSig();
      e.preventDefault();
    });
    const up = () => { dragging = false; renderSigHint(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function dataURLtoBytes(url) {
    const bin = atob(String(url).split(',')[1] || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function sigToPDF() {
    if (!p5File) { LB.toast('请先选择 PDF', 'err'); return; }
    if (!p5Sig) { LB.toast('请先上传签名 / 印章图片', 'err'); return; }
    if (!p5Place) { LB.toast('请在预览图上点一下放置签名', 'err'); return; }
    const btn = $('#p5Go', rootEl);
    const stat = $('#p5Stat', rootEl);
    btn.disabled = true;
    try {
      await loadPDFLib();
      const { PDFDocument } = PDFLib;
      const doc = await PDFDocument.load(await p5File.arrayBuffer(), { ignoreEncryption: true });
      const png = await doc.embedPng(dataURLtoBytes(p5Sig.canvas.toDataURL('image/png')));
      const pages = doc.getPages();
      const targets = p5AllPages
        ? pages.map((_, i) => i)
        : parsePageRange($('#p5Pages', rootEl).value, pages.length).map(n => n - 1);
      if (!targets.length) { LB.toast('目标页为空，请检查页码', 'err'); return; }
      const opacity = clamp((parseFloat($('#p5Op', rootEl).value) || 95) / 100, 0.1, 1);

      targets.forEach(i => {
        const page = pages[i];
        const size = page.getSize();
        const w = p5Place.rw * size.width;
        const h = w * (p5Sig.h / p5Sig.w);
        page.drawImage(png, {
          x: p5Place.rx * size.width,
          /* PDF 原点在左下角，预览是左上角 → 需要翻转 y */
          y: size.height - p5Place.ry * size.height - h,
          width: w,
          height: h,
          opacity: opacity
        });
      });

      const bytes = await doc.save();
      LB.img.download(new Blob([bytes], { type: 'application/pdf' }),
        p5File.name.replace(/\.pdf$/i, '') + '-已签名.pdf');
      stat.textContent = '✅ 已在 ' + targets.length + ' 页放置签名';
      LB.toast('签名 PDF 已生成', 'ok');
    } catch (e) {
      stat.textContent = '⚠️ 生成失败：' + ((e && e.message) || '未知错误');
      LB.toast('生成失败', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= Tab 6 · 加密 / 解密 ================= */

  function setSub6(s) {
    p6Sub = s;
    $$('#p6Seg button', rootEl).forEach(b => b.classList.toggle('on', b.dataset.sub === s));
    $('#p6EncBox', rootEl).hidden = s !== 'enc';
    $('#p6DecBox', rootEl).hidden = s !== 'dec';
  }

  async function encryptPDF() {
    if (!p6EncFile) { LB.toast('请先选择 PDF', 'err'); return; }
    const user = $('#p6User', rootEl).value;
    if (!user) { LB.toast('请输入用户密码（打开文件时需要）', 'info'); return; }
    const owner = $('#p6Owner', rootEl).value || user;
    const btn = $('#p6GoEnc', rootEl);
    const stat = $('#p6EncStat', rootEl);
    btn.disabled = true;
    try {
      await loadPDFLib();
      const { PDFDocument } = PDFLib;
      const doc = await PDFDocument.load(await p6EncFile.arrayBuffer(), { ignoreEncryption: true });
      doc.encrypt({
        userPassword: user,
        ownerPassword: owner,
        permissions: {
          printing: $('#p6Print', rootEl).checked ? 'highResolution' : false,
          copying: $('#p6Copy', rootEl).checked,
          modifying: $('#p6Mod', rootEl).checked
        }
      });
      const bytes = await doc.save();
      LB.img.download(new Blob([bytes], { type: 'application/pdf' }),
        p6EncFile.name.replace(/\.pdf$/i, '') + '-已加密.pdf');
      stat.textContent = '✅ 已生成 AES-256 加密 PDF，打开时需要输入用户密码';
      LB.toast('加密 PDF 已生成', 'ok');
    } catch (e) {
      const msg = (e && e.message) || '未知错误';
      stat.textContent = '⚠️ 加密失败：' + msg;
      LB.toast('加密失败：' + msg, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function decryptPDF() {
    if (!p6DecFile) { LB.toast('请先选择 PDF', 'err'); return; }
    const pwd = $('#p6DecPwd', rootEl).value;
    if (!pwd) { LB.toast('请输入密码', 'info'); return; }
    const btn = $('#p6GoDec', rootEl);
    const stat = $('#p6DecStat', rootEl);
    btn.disabled = true;
    stat.textContent = '⏳ 正在解密…';
    try {
      await loadPDFLib();
      const { PDFDocument } = PDFLib;
      const bytes = await p6DecFile.arrayBuffer();
      const src = await PDFDocument.load(bytes, { password: pwd });
      /* 关键：不能直接 src.save() —— 解密后的上下文仍带着原文件的 /Encrypt 残留对象，
         重新保存出来的文件仍被判定为加密（实测 Adobe / Chrome 都会继续要密码）。
         新建空文档 + copyPages 搬页面，才是真正无加密的输出。 */
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
      const dec = await out.save();
      LB.img.download(new Blob([dec], { type: 'application/pdf' }),
        p6DecFile.name.replace(/\.pdf$/i, '') + '-已解密.pdf');
      stat.textContent = '✅ 已解密并下载（' + pages.length + ' 页），新文件无密码';
      LB.toast('解密完成', 'ok');
    } catch (e) {
      const raw = (e && e.message) || '';
      const msg = /password|encrypt/i.test(raw) ? '密码错误，或该 PDF 并未加密' : raw || '未知错误';
      stat.textContent = '⚠️ 解密失败：' + msg;
      LB.toast('解密失败：' + msg, 'err');
    } finally {
      btn.disabled = false;
    }
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
      '<button type="button" class="pd-tab" data-tab="p5">✍️ 签名 / 盖章</button>' +
      '<button type="button" class="pd-tab" data-tab="p6">🔒 加密 / 解密</button>' +
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

      /* —— Tab 5 签名 / 盖章 —— */
      '<div class="card tool-sec set-card" id="pd-p5" hidden>' +
      '<div class="dropzone" id="p5Drop">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF</b><small>要签名 / 盖章的 PDF</small>' +
      '<input type="file" id="p5File" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p5Ctl" hidden class="pdf-panel">' +
      '<div class="dropzone p5-sigdrop" id="p5SigDrop">' +
      '<span class="pd-dz-ic">✍️</span><b>选择签名 / 印章图片</b><small>PNG / JPG 均可，白底会自动去掉</small>' +
      '<input type="file" id="p5SigFile" accept="image/*" hidden />' +
      '</div>' +
      '<div class="p5-toolbar">' +
      '<button class="btn btn-ghost btn-sm" id="p5Prev" type="button">← 上一页</button>' +
      '<span class="p5-pageinfo" id="p5PageInfo">第 1 页</span>' +
      '<button class="btn btn-ghost btn-sm" id="p5Next" type="button">下一页 →</button>' +
      '</div>' +
      '<div class="p5-stage" id="p5Stage"></div>' +
      '<p class="cd-note" id="p5Hint">先上传 PDF。</p>' +
      '<div class="pdf-form">' +
      '<label class="pz-lab">签名宽度 %<input class="inp" id="p5Scale" type="range" min="8" max="80" step="1" value="28" /></label>' +
      '<label class="pz-lab">倾斜角度 °<input class="inp" id="p5Angle" type="range" min="-25" max="25" step="1" value="0" /></label>' +
      '<label class="pz-lab">不透明度 %<input class="inp" id="p5Op" type="number" min="20" max="100" value="95" /></label>' +
      '</div>' +
      '<label class="chk-row"><input type="checkbox" id="p5All" checked><span>应用到所有页</span></label>' +
      '<label class="pz-lab pdf-wide" id="p5PagesRow" hidden>指定页<input class="inp" id="p5Pages" type="text" placeholder="如 1,3-5；留空 = 全部" /></label>' +
      '<button class="btn btn-main" id="p5Go" data-act="p5Go" type="button">✍️ 生成并下载</button>' +
      '<div class="pdf-stat" id="p5Stat">上传 PDF 与签名图后即可生成</div>' +
      '</div>' +
      '</div>' +

      /* —— Tab 6 加密 / 解密 —— */
      '<div class="card tool-sec set-card" id="pd-p6" hidden>' +
      '<div class="seg" id="p6Seg">' +
      '<button type="button" class="on" data-sub="enc">🔒 加密</button>' +
      '<button type="button" data-sub="dec">🔓 解密</button>' +
      '</div>' +
      '<div id="p6EncBox" class="pdf-panel">' +
      '<div class="dropzone" id="p6EncDrop">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF</b><small>要加密的 PDF</small>' +
      '<input type="file" id="p6EncFile" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p6EncCtl" hidden class="pdf-panel">' +
      '<div class="pdf-form">' +
      '<label class="pz-lab">用户密码<input class="inp" id="p6User" type="text" autocomplete="off" spellcheck="false" placeholder="打开文件时需要，必填" /></label>' +
      '<label class="pz-lab">所有者密码<input class="inp" id="p6Owner" type="text" autocomplete="off" spellcheck="false" placeholder="留空 = 与用户密码相同" /></label>' +
      '</div>' +
      '<div class="p6-perms">' +
      '<label class="chk-row"><input type="checkbox" id="p6Print" checked><span>允许打印</span></label>' +
      '<label class="chk-row"><input type="checkbox" id="p6Copy"><span>允许复制</span></label>' +
      '<label class="chk-row"><input type="checkbox" id="p6Mod"><span>允许编辑</span></label>' +
      '</div>' +
      '<button class="btn btn-main" id="p6GoEnc" data-act="p6GoEnc" type="button">🔒 生成加密 PDF</button>' +
      '<div class="pdf-stat" id="p6EncStat">加密采用 AES-256；加密后的文件用 Adobe Reader 打开会要求输入密码</div>' +
      '</div>' +
      '</div>' +
      '<div id="p6DecBox" class="pdf-panel" hidden>' +
      '<div class="dropzone" id="p6DecDrop">' +
      '<span class="pd-dz-ic">🔓</span><b>选择或拖入加密 PDF</b><small>输入密码后另存为无密码版本</small>' +
      '<input type="file" id="p6DecFile" accept="application/pdf,.pdf" hidden />' +
      '</div>' +
      '<div id="p6DecCtl" hidden class="pdf-panel">' +
      '<label class="pz-lab pdf-wide">密码<input class="inp" id="p6DecPwd" type="text" autocomplete="off" spellcheck="false" placeholder="打开该 PDF 的密码" /></label>' +
      '<button class="btn btn-main" id="p6GoDec" data-act="p6GoDec" type="button">🔓 解密并下载</button>' +
      '<div class="pdf-stat" id="p6DecStat">解密后得到的新文件不再需要密码</div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '<p class="cd-note">所有处理均在本机浏览器完成，文件不会上传到任何服务器。</p>' +
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

  function isPdfFile(f) {
    return /^application\/pdf$/.test(f.type || '') || /\.pdf$/i.test(f.name || '');
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
    $('#p6Seg', root).addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) setSub6(b.dataset.sub); });

    /* —— Step 15 · B1 签名 / 盖章 —— */
    bindDrop('#p5Drop', '#p5File', files => {
      const f = files[0];
      if (!f) return;
      if (!isPdfFile(f)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      openP5Pdf(f);
    });
    bindDrop('#p5SigDrop', '#p5SigFile', files => {
      const f = files[0];
      if (!f) return;
      loadSigImage(f)
        .then(() => LB.toast('签名图已就绪（白底已去掉），点预览图放置', 'ok'))
        .catch(e => LB.toast((e && e.message) || '图片解码失败', 'err'));
    });
    $('#p5Stage', root).addEventListener('click', placeAt);
    $('#p5Prev', root).addEventListener('click', async () => {
      if (!p5Pdf || p5PageNo <= 1) return;
      p5PageNo--;
      $('#p5PageInfo', root).textContent = '第 ' + p5PageNo + ' / ' + p5PageCount + ' 页';
      await renderSigStage();
    });
    $('#p5Next', root).addEventListener('click', async () => {
      if (!p5Pdf || p5PageNo >= p5PageCount) return;
      p5PageNo++;
      $('#p5PageInfo', root).textContent = '第 ' + p5PageNo + ' / ' + p5PageCount + ' 页';
      await renderSigStage();
    });
    $('#p5Scale', root).addEventListener('input', e => {
      if (!p5Place) return;
      const rw = clamp((parseFloat(e.target.value) || 28) / 100, 0.05, 0.9);
      p5Place.rw = rw;
      p5Place.rx = clamp(p5Place.rx, 0, Math.max(0, 1 - rw));
      layoutSig();
      renderSigHint();
    });
    $('#p5Angle', root).addEventListener('input', e => {
      p5Angle = parseFloat(e.target.value) || 0;
      applySigAngle();
      renderSigHint();
    });
    $('#p5All', root).addEventListener('change', e => {
      p5AllPages = e.target.checked;
      $('#p5PagesRow', root).hidden = p5AllPages;
    });

    /* —— Step 15 · B2 加密 / 解密 —— */
    bindDrop('#p6EncDrop', '#p6EncFile', files => {
      const f = files[0];
      if (!f) return;
      if (!isPdfFile(f)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      p6EncFile = f;
      $('#p6EncCtl', root).hidden = false;
      $('#p6EncStat', root).textContent = '已选择：' + f.name + '，设置密码后点「生成加密 PDF」';
    });
    bindDrop('#p6DecDrop', '#p6DecFile', files => {
      const f = files[0];
      if (!f) return;
      if (!isPdfFile(f)) { LB.toast('请选择 PDF 文件', 'warn'); return; }
      p6DecFile = f;
      $('#p6DecCtl', root).hidden = false;
      $('#p6DecStat', root).textContent = '已选择：' + f.name + '，输入密码后点「解密并下载」';
    });

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
      else if (act === 'p5Go') sigToPDF();
      else if (act === 'p6GoEnc') encryptPDF();
      else if (act === 'p6GoDec') decryptPDF();
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
    /* Step 15：签名 / 加密状态一并清掉（PDF.js 文档要显式销毁，否则 worker 侧资源不释放） */
    if (p5Pdf) { try { p5Pdf.destroy(); } catch (_) {} }
    p5File = null; p5Pdf = null; p5Sig = null; p5Place = null;
    p5PageNo = 1; p5PageCount = 0; p5Angle = 0; p5AllPages = true;
    p6EncFile = null; p6DecFile = null; p6Sub = 'enc';
    rootEl = null;
  }

  LB.router.register('pdf', { mount, unmount });
})();
