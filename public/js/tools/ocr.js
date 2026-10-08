/* LiteBox v5 · tools/ocr.js — OCR 文字识别（Step 31 · 三：方案 A，纯前端本地识别）
 *
 * 与旧版（云萌阁 OCR）的差别：
 *   1) 识别完全在浏览器内完成：onnxruntime-web + PaddleOCR PP-OCRv4 mobile
 *      （det 4.7MB + rec 10.8MB + 字典 26KB + ort 运行时/ wasm 约 11MB，合计约 20MB）。
 *      图片不再上传，后端 /api/ocr 接口与云萌阁调用逻辑已删除。
 *   2) 首次识别前要加载模型，界面给骨架屏 + 进度条（文案「正在加载识别模型，约 20MB」）；
 *      模型与会话常驻内存，同一次访问内再次识别无需重新加载。
 *   3) 识别管线为调优后的最优组合（行准确率 65%，baseline 24%）：
 *      det 长边 1280 + 阈值 0.3 + 连通域（3x3 膨胀 1 次）取框 + rec 宽 480 封顶 + CTC 贪心解码。
 *   4) 结果区 = 全文文本框 + 分段列表，每段单独复制（复制走 LB.copyNow 同步栈）。
 * 保留：相册 / 拍照 / 粘贴截图 / 拖拽上传、识别前压缩到 1600px、送入文本处理、导出 TXT。
 *
 * 体积红线：模型地址走 LB.router.loadScript / fetch 时统一拼 ?v=LB_VERSION，
 *   _headers 里 /vendor/* 是 immutable 一年缓存，靠版本号让升级时能换文件。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  let rootEl = null;
  let alive = false;
  let seq = 0;

  let ocrFile = null;      /* 已选择的图片 File（原始文件） */
  let ocrSend = null;      /* 实际用于识别的 File（压缩后的），没压缩时与 ocrFile 同一对象 */
  let ocrURL = '';         /* 预览用的 objectURL，切走时必须 revoke */
  let ocrOnPaste = null;   /* document 上的 paste 监听，unmount 时必须移除 */
  let ocrResult = null;    /* { content, paragraphs } */

  const MAX_MB = 20;       /* 本地识别不再受上传体积限制，放宽到 20MB（手机原图常见 8~15MB） */
  const MAX_SIDE = 1600;   /* 识别前压缩：最大边 1600px，既保精度又控制算力 */
  const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

  /* ---------- 方案 A 常量（与调优实验一致，不要随手改） ---------- */
  const VENDOR = 'vendor/paddleocr';
  const MODEL_HINT = '正在加载识别模型，约 20MB';
  const DET_TARGET = 1280;
  const DET_THRESHOLD = 0.3;
  const CC_DILATE = 1;
  const CC_MIN_AREA = 50;
  const CC_MIN_H = 4;
  const CC_MARGIN = 4;
  const REC_MAX_W = 480;
  const REC_H = 48;
  const CLS_TOTAL = 6625;              /* 1 blank + 6623 字 + 1 空格 */
  const IMAGENET_MEAN = [0.485, 0.456, 0.406];
  const IMAGENET_STD = [0.229, 0.224, 0.225];
  /* 进度权重：模型 60% / 文本检测 10% / 逐行识别 30% */
  const P_MODEL = 0.6, P_DET = 0.1, P_REC = 0.3;

  /* 引擎态跨工具切换保留：模块级缓存，避免每次进页面都重新下载模型 */
  let enginePromise = null;
  let detSession = null;
  let recSession = null;
  let vocab = null;
  let workCanvas = null;

  function extOk(name) {
    const i = name.lastIndexOf('.');
    if (i < 0) return false;
    return EXT_OK.indexOf(name.slice(i + 1).toLowerCase()) >= 0;
  }

  /* 静态资源地址：统一拼 ?v=，绕开 immutable 缓存钉死旧版本的问题 */
  function vurl(rel) {
    return rel + '?v=' + (window.LB_VERSION || '5.6.0');
  }

  function canvas2d(w, h) {
    if (!workCanvas) workCanvas = document.createElement('canvas');
    workCanvas.width = w;
    workCanvas.height = h;
    const ctx = workCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    return ctx;
  }

  /* ============================================================
   * 一、张量与推理（移植自调优实验 /tmp/ocrspike2/final_pipeline.html）
   * ============================================================ */

  /* RGBA ImageData → CHW float32（ImageNet 归一化） */
  function pixelsToTensor(imageData, w, h) {
    const px = imageData.data;
    const t = new Float32Array(3 * h * w);
    const hw = h * w;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const oi = y * w + x;
        t[oi] = (px[si] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
        t[oi + hw] = (px[si + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
        t[oi + 2 * hw] = (px[si + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
      }
    }
    return t;
  }

  /* 检测预处理：长边缩放到 targetSize，补齐到 32 的倍数（白底填充） */
  function detPreprocess(img, targetSize) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = targetSize / Math.max(w, h);
    const nw = Math.ceil(w * scale / 32) * 32;
    const nh = Math.ceil(h * scale / 32) * 32;
    const ctx = canvas2d(nw, nh);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h, 0, 0, nw, nh);
    const id = ctx.getImageData(0, 0, nw, nh);
    return { tensor: pixelsToTensor(id, nw, nh), w: nw, h: nh, scale: scale };
  }

  async function runDet(img, ort) {
    const p = detPreprocess(img, DET_TARGET);
    const out = await detSession.run({ x: new ort.Tensor('float32', p.tensor, [1, 3, p.h, p.w]) });
    return { probMap: out['sigmoid_0.tmp_0'].data, w: p.w, h: p.h, scale: p.scale };
  }

  /* 概率图 → 文本行框：二值化 → 膨胀 → 8 邻域连通域 → 过滤 → 行合并 → 外扩回原坐标 */
  function extractBoxesCC(probMap, w, h, scale) {
    let bin = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bin[i] = probMap[i] >= DET_THRESHOLD ? 1 : 0;

    for (let d = 0; d < CC_DILATE; d++) {
      const out = new Uint8Array(w * h);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (bin[y * w + x]) { out[y * w + x] = 1; continue; }
          for (let dy = -1; dy <= 1 && !out[y * w + x]; dy++) {
            for (let dx = -1; dx <= 1 && !out[y * w + x]; dx++) {
              if (bin[(y + dy) * w + (x + dx)]) out[y * w + x] = 1;
            }
          }
        }
      }
      bin = out;
    }

    const labels = new Int32Array(w * h);
    let nextLabel = 1;
    const comps = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!bin[y * w + x] || labels[y * w + x]) continue;
        const lbl = nextLabel++;
        const queue = [y * w + x];
        labels[y * w + x] = lbl;
        let minX = x, maxX = x, minY = y, maxY = y, area = 0, qi = 0;
        while (qi < queue.length) {
          const idx = queue[qi++];
          const cx = idx % w, cy = (idx - cx) / w;
          area++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const ni = ny * w + nx;
              if (bin[ni] && !labels[ni]) { labels[ni] = lbl; queue.push(ni); }
            }
          }
        }
        comps.push({ minX: minX, minY: minY, maxX: maxX, maxY: maxY, area: area });
      }
    }

    const valid = comps.filter(c => c.area >= CC_MIN_AREA && (c.maxY - c.minY) >= CC_MIN_H);
    valid.sort((a, b) => a.minY - b.minY);

    /* y 方向重叠超过一半 → 同一行 */
    const groups = [];
    for (const c of valid) {
      let merged = false;
      for (const g of groups) {
        const overlapY = Math.min(c.maxY, g.maxY) - Math.max(c.minY, g.minY);
        const minHgt = Math.min(c.maxY - c.minY, g.maxY - g.minY);
        if (overlapY > minHgt * 0.5) {
          g.minX = Math.min(g.minX, c.minX);
          g.maxX = Math.max(g.maxX, c.maxX);
          g.minY = Math.min(g.minY, c.minY);
          g.maxY = Math.max(g.maxY, c.maxY);
          merged = true;
          break;
        }
      }
      if (!merged) groups.push({ minX: c.minX, minY: c.minY, maxX: c.maxX, maxY: c.maxY });
    }
    groups.sort((a, b) => a.minY - b.minY);

    /* 上下间距过小的行再合并一次（避免同一句话被拆成两行） */
    const out = [];
    for (const g of groups) {
      if (out.length) {
        const prev = out[out.length - 1];
        const prevH = prev.maxY - prev.minY;
        if (g.minY - prev.maxY < prevH * 0.4) {
          prev.minX = Math.min(prev.minX, g.minX);
          prev.maxX = Math.max(prev.maxX, g.maxX);
          prev.maxY = Math.max(prev.maxY, g.maxY);
          continue;
        }
      }
      out.push({ minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY });
    }

    return out.map(g => ({
      x0: Math.max(0, (g.minX - CC_MARGIN) / scale),
      y0: Math.max(0, (g.minY - CC_MARGIN) / scale),
      x1: (g.maxX + CC_MARGIN) / scale,
      y1: (g.maxY + CC_MARGIN) / scale
    }));
  }

  /* 从原图裁出一个框（白底补边，越界自动裁到图内） */
  function cropBox(img, box) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const x0 = Math.max(0, Math.floor(box.x0));
    const y0 = Math.max(0, Math.floor(box.y0));
    const x1 = Math.min(iw, Math.ceil(box.x1));
    const y1 = Math.min(ih, Math.ceil(box.y1));
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    return c;
  }

  /* 识别预处理：高等比缩到 48，宽封顶 480 并取 48 的倍数 */
  function recPreprocess(cropCanvas) {
    const sw = cropCanvas.width, sh = cropCanvas.height;
    const sc = REC_H / sh;
    let tw = Math.ceil(sw * sc);
    if (tw > REC_MAX_W) tw = REC_MAX_W;
    tw = Math.ceil(tw / REC_H) * REC_H;
    if (tw < REC_H) tw = REC_H;
    const c = document.createElement('canvas');
    c.width = tw; c.height = REC_H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, REC_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cropCanvas, 0, 0, sw, sh, 0, 0, tw, REC_H);
    const id = ctx.getImageData(0, 0, tw, REC_H);
    return { tensor: pixelsToTensor(id, tw, REC_H), w: tw, h: REC_H };
  }

  async function runRec(cropCanvas, ort) {
    const p = recPreprocess(cropCanvas);
    const out = await recSession.run({ x: new ort.Tensor('float32', p.tensor, [1, 3, p.h, p.w]) });
    return { output: out['softmax_11.tmp_0'].data, w: p.w };
  }

  /* CTC 贪心解码：逐帧取 argmax，去连续重复与 blank */
  function ctcDecode(recOutput) {
    const T = Math.floor(recOutput.length / CLS_TOTAL);
    const picked = [];
    let prev = -1;
    for (let t = 0; t < T; t++) {
      const off = t * CLS_TOTAL;
      let maxIdx = 0, maxVal = -Infinity;
      for (let i = 0; i < CLS_TOTAL; i++) {
        if (recOutput[off + i] > maxVal) { maxVal = recOutput[off + i]; maxIdx = i; }
      }
      if (maxIdx !== 0 && maxIdx !== prev) picked.push(maxIdx);
      prev = maxIdx;
    }
    let text = '';
    for (let i = 0; i < picked.length; i++) {
      const idx = picked[i];
      if (idx >= 1 && idx - 1 < vocab.length) text += vocab[idx - 1];
    }
    return text;
  }

  /* ============================================================
   * 二、引擎加载（ort 脚本 + 模型 + 字典，带流式进度）
   * ============================================================ */

  /* 带进度的字节下载：有 content-length 就报百分比，没有就只报已下载体积 */
  async function fetchBytes(url, onProgress) {
    const r = await fetch(url, { cache: 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const total = Number(r.headers.get('content-length')) || 0;
    if (!r.body || !r.body.getReader) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (onProgress) onProgress(buf.length, buf.length);
      return buf;
    }
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const it = await reader.read();
      if (it.done) break;
      chunks.push(it.value);
      got += it.value.length;
      if (onProgress) onProgress(got, total || got);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (let i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }

  async function buildEngine(onModelProgress) {
    /* 1) 运行时：走 router.loadScript（自带 ?v= 与 Promise 去重），暴露全局 ort */
    await LB.router.loadScript(VENDOR + '/ort.min.js');
    const ort = window.ort;
    if (!ort || !ort.InferenceSession) throw new Error('ONNX 运行时加载失败');

    /* 2) 单线程：浏览器无 COOP/COEP 时 SharedArrayBuffer 不可用，
          1 线程既能跑又是实测最稳的配置（4x/6x CPU 降速下整页 4~6s）。
          wasm / mjs 不写 wasmPaths —— ort 默认按 ort.min.js 自身所在目录解析，
          三个文件必须同目录放（public/vendor/paddleocr/），换位置就找不到 wasm。 */
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    /* 3) 模型与字典：浏览器直接 fetch（本地静态资源，不经后端） */
    const detBuf = await fetchBytes(vurl(VENDOR + '/models/ch_PP-OCRv4_det.onnx'), onModelProgress);
    const recBuf = await fetchBytes(vurl(VENDOR + '/models/ch_PP-OCRv4_rec.onnx'), onModelProgress);
    const keysBuf = await fetchBytes(vurl(VENDOR + '/models/ch_PP-OCR_keys_v1.txt'), onModelProgress);

    const t = new TextDecoder('utf-8').decode(keysBuf);
    vocab = t.split('\n').map(s => s.trim());
    detSession = await ort.InferenceSession.create(detBuf, { executionProviders: ['wasm'] });
    recSession = await ort.InferenceSession.create(recBuf, { executionProviders: ['wasm'] });
    return ort;
  }

  function ensureEngine(onModelProgress) {
    if (detSession && recSession && vocab) {
      return Promise.resolve(window.ort);
    }
    if (!enginePromise) {
      enginePromise = buildEngine(onModelProgress).catch(e => {
        enginePromise = null;   /* 失败不缓存，下次点识别可重试 */
        detSession = null;
        recSession = null;
        throw e;
      });
    }
    return enginePromise;
  }

  /* ============================================================
   * 三、UI：状态、骨架屏 + 进度条
   * ============================================================ */

  function stat(text, kind) {
    const el = $('#ocrStat', rootEl);
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'ocr-stat' + (kind ? ' ocr-stat-' + kind : '');
  }

  function showLoad(title) {
    const box = $('#ocrLoad', rootEl);
    if (!box) return;
    box.hidden = false;
    $('#ocrLoadT', rootEl).textContent = title;
    $('#ocrProgS', rootEl).textContent = '';
    $('#ocrProgFill', rootEl).style.width = '0%';
    const sk = $('#ocrSk', rootEl);
    sk.hidden = false;
    LB.ui.skeleton(sk, 4, 'list');
  }

  function setPhase(title) {
    $('#ocrSk', rootEl).hidden = true;
    $('#ocrLoadT', rootEl).textContent = title;
  }

  /* 进度：JS 写元素 style.width（全站动态宽度同此写法，非内联属性） */
  function setProgress(ratio, sub) {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    $('#ocrProgFill', rootEl).style.width = pct + '%';
    if (sub !== undefined) $('#ocrProgS', rootEl).textContent = sub;
  }

  function hideLoad() {
    const box = $('#ocrLoad', rootEl);
    if (box) box.hidden = true;
  }

  /* 让出一帧，保证进度条能真的画出来（长任务全在主线程） */
  function nextFrame() {
    return new Promise(resolve => {
      if (window.requestAnimationFrame) requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });
  }

  function pickFile(file) {
    if (!alive || !rootEl || !file) return;
    const okType = (file.type && file.type.indexOf('image/') === 0) || extOk(file.name);
    if (!okType) { LB.toast('请选择图片文件（JPG / PNG / WEBP 等）', 'err'); return; }
    if (file.size > MAX_MB * 1048576) {
      stat('图片过大，请压缩后重试', 'err');
      LB.toast('图片过大，请压缩后重试', 'err');
      return;
    }

    if (ocrURL) { try { URL.revokeObjectURL(ocrURL); } catch (_) {} }
    ocrFile = file;
    ocrSend = file;
    ocrURL = URL.createObjectURL(file);

    $('#ocrPrev', rootEl).src = ocrURL;
    $('#ocrPrevBox', rootEl).hidden = false;
    $('#ocrFname', rootEl).textContent = file.name || '已选择的图片';
    $('#ocrFsize', rootEl).textContent = (file.type || 'image') + ' · ' + LB.img.fmtSize(file.size) + ' · 识别前自动压缩到 1600px';
    $('#ocrGo', rootEl).disabled = false;
    stat('');
    clearResult();

    /* 后台先压好，点「开始识别」时不用等 */
    shrink(file).then(out => {
      if (!alive || !rootEl || ocrFile !== file) return;
      ocrSend = out;
    });
    LB.toast('图片已选择', 'ok');
  }

  /* 压缩：最大边超过 MAX_SIDE 才重编码（小图原样用，避免无谓画质损失） */
  function shrink(file) {
    return LB.img.load(file).then(img => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return file;
      const sz = LB.img.fitSize(w, h, MAX_SIDE);
      if (sz.w === w && sz.h === h) return file;

      const cv = document.createElement('canvas');
      cv.width = sz.w;
      cv.height = sz.h;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      /* 白底铺一层：JPEG 无透明通道，透明区会变黑，黑底白字反而更难识别 */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sz.w, sz.h);
      ctx.drawImage(img, 0, 0, sz.w, sz.h);

      return new Promise(resolve => {
        cv.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      });
    }).catch(() => file);
  }

  function clearResult() {
    ocrResult = null;
    const out = $('#ocrOut', rootEl);
    if (out) out.value = '';
    const list = $('#ocrParas', rootEl);
    if (list) { list.innerHTML = ''; list.hidden = true; }
    const foot = $('#ocrFoot', rootEl);
    if (foot) foot.hidden = true;
  }

  /* 识别行 → 段落：中心落在上一行范围内算同一行；行间距大 → 换段 */
  function toParagraphs(items) {
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cy = (it.y0 + it.y1) / 2;
      const h = Math.max(2, it.y1 - it.y0);
      const r = rows.length ? rows[rows.length - 1] : null;
      if (r && cy >= r.y0 - h * 0.5 && cy <= r.y1 + h * 0.5) {
        r.items.push(it);
        r.y0 = Math.min(r.y0, it.y0);
        r.y1 = Math.max(r.y1, it.y1);
      } else {
        rows.push({ items: [it], y0: it.y0, y1: it.y1 });
      }
    }

    const paras = [];
    let cur = '';
    let prev = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = r.items.slice().sort((a, b) => a.x0 - b.x0).map(x => x.text).join(' ');
      const h = Math.max(2, r.y1 - r.y0);
      const gap = prev ? (r.y0 - prev.y1) : 0;
      if (!cur) cur = line;
      else if (gap > h * 1.2) { paras.push(cur); cur = line; }
      /* 中英文之间补空格，纯中文直接连读 */
      else cur += (/[A-Za-z0-9]$/.test(cur) && /^[A-Za-z0-9]/.test(line) ? ' ' : '') + line;
      prev = r;
    }
    if (cur) paras.push(cur);
    return paras.map(s => s.trim()).filter(Boolean);
  }

  /* 分段列表：每段一个「复制」按钮，复制走同步栈 */
  function renderParas(paras) {
    const list = $('#ocrParas', rootEl);
    list.innerHTML = '';
    if (!paras.length) { list.hidden = true; return; }
    list.hidden = false;
    list.innerHTML =
      '<h2 class="ocr-sec-t">分段结果（' + paras.length + ' 段）</h2>' +
      paras.map((p, i) =>
        '<div class="ocr-p" data-i="' + i + '">' +
        '<p class="ocr-p-t">' + esc(p) + '</p>' +
        '<button class="btn btn-ghost btn-sm ocr-p-copy" type="button" aria-label="复制第 ' + (i + 1) + ' 段">📋 复制本段</button>' +
        '</div>'
      ).join('');
  }

  /* ============================================================
   * 四、识别主流程（全程本地，无网络请求）
   * ============================================================ */
  async function runOCR() {
    if (!alive || !rootEl) return;
    const btn = $('#ocrGo', rootEl);
    if (!ocrFile) { LB.toast('先选择一张图片', 'err'); return; }
    const my = ++seq;
    btn.disabled = true;
    stat('');
    showLoad(MODEL_HINT + '，首次稍慢，之后走浏览器缓存…');
    clearResult();

    try {
      /* 1) 模型：已加载则秒过；加载期间进度条走 0 → 60% */
      const ort = await ensureEngine((got, total) => {
        if (my !== seq) return;
        const ratio = total ? got / total : 0;
        setProgress(ratio * P_MODEL, LB.img.fmtSize(got) + (total ? ' / ' + LB.img.fmtSize(total) : '') + ' · ' + Math.round(ratio * 100) + '%');
      });
      if (my !== seq) return;
      setProgress(P_MODEL, '100%');

      /* 2) 取图（压缩后的 File，压好的对象可能就是原文件） */
      const send = ocrSend || await shrink(ocrFile);
      if (my !== seq) return;
      ocrSend = send;
      const img = await LB.img.load(send);
      if (my !== seq) return;

      /* 3) 文本检测 */
      setPhase('正在定位图中的文字…');
      setProgress(P_MODEL, '100%');
      await nextFrame();
      const det = await runDet(img, ort);
      if (my !== seq) return;
      const boxes = extractBoxesCC(det.probMap, det.w, det.h, det.scale);
      setProgress(P_MODEL + P_DET, boxes.length + ' 行文字');
      await nextFrame();

      /* 4) 逐行识别：每行让出一帧刷新进度 */
      setPhase('正在识别文字（' + boxes.length + ' 行）…');
      const hits = [];
      for (let i = 0; i < boxes.length; i++) {
        if (my !== seq) return;
        const box = boxes[i];
        const crop = cropBox(img, box);
        const r = await runRec(crop, ort);
        const text = ctcDecode(r.output).trim();
        if (text) hits.push({ text: text, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 });
        setProgress(P_MODEL + P_DET + P_REC * ((i + 1) / boxes.length), (i + 1) + ' / ' + boxes.length);
        if ((i & 1) === 1) await nextFrame();
      }
      if (my !== seq) return;

      const paras = toParagraphs(hits);
      const content = paras.join('\n');
      hideLoad();

      if (!content) {
        stat('没有在图片中识别到文字，可以换一张更清晰、字更大的图片再试。');
        LB.toast('未识别到文字', 'info');
        return;
      }
      ocrResult = { content: content, paragraphs: paras };
      $('#ocrOut', rootEl).value = content;
      renderParas(paras);
      $('#ocrFoot', rootEl).hidden = false;
      stat('✅ 识别完成，共 ' + content.length + ' 个字符 · ' + paras.length + ' 段（本地识别，图片未上传）。可直接编辑、复制或送入文本处理。');
      LB.toast('OCR 识别完成', 'ok');
    } catch (e) {
      if (my !== seq) return;
      hideLoad();
      console.warn('[ocr] fail:', (e && e.message) || e);
      /* 统一中文错误文案：模型加载失败 / 图片解码失败 / 识别失败 */
      const msg = (e && e.message) || '';
      if (/加载失败|HTTP|Failed to fetch|script load fail/.test(msg)) {
        stat('识别模型加载失败，请检查网络后重试', 'err');
        LB.toast('识别模型加载失败', 'err');
      } else if (/解码/.test(msg)) {
        stat('图片解码失败，请换一张图片', 'err');
        LB.toast('图片解码失败', 'err');
      } else {
        stat('识别失败，请换一张图试试', 'err');
        LB.toast('OCR 识别失败', 'err');
      }
    } finally {
      if (alive && rootEl && my === seq) btn.disabled = false;
    }
  }

  function clearAll() {
    if (ocrURL) { try { URL.revokeObjectURL(ocrURL); } catch (_) {} }
    ocrURL = '';
    ocrFile = null;
    ocrSend = null;
    const p = $('#ocrPrev', rootEl);
    if (p) p.removeAttribute('src');
    if ($('#ocrPrevBox', rootEl)) $('#ocrPrevBox', rootEl).hidden = true;
    if ($('#ocrFname', rootEl)) $('#ocrFname', rootEl).textContent = '点击选择图片，或直接粘贴截图';
    if ($('#ocrFsize', rootEl)) $('#ocrFsize', rootEl).textContent = '';
    if ($('#ocrGo', rootEl)) $('#ocrGo', rootEl).disabled = true;
    if ($('#ocrStat', rootEl)) $('#ocrStat', rootEl).hidden = true;
    hideLoad();
    clearResult();
  }

  function html() {
    return '' +
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>OCR 文字识别</h1><p>拍照或选图，在手机上本地识别图中文字，可分段复制导出</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card">' +
      '  <div class="dropzone ocr-drop" id="ocrDrop">' +
      '    <div class="ocr-dz-ic">📝</div>' +
      '    <div class="ocr-fname" id="ocrFname">点击选择图片，或直接粘贴截图</div>' +
      '    <div class="ocr-fsize" id="ocrFsize"></div>' +
      '    <small>JPG / PNG / WEBP · ' + MAX_MB + 'MB 以内 · 识别前自动压缩到 1600px</small>' +
      '    <div class="ocr-picks">' +
      '      <button class="btn btn-ghost btn-sm ocr-pick" id="ocrPick" type="button">🖼️ 相册选图</button>' +
      '      <button class="btn btn-ghost btn-sm ocr-pick" id="ocrCam" type="button">📷 拍照识别</button>' +
      '    </div>' +
      '  </div>' +
      '  <input type="file" id="ocrFile" accept="image/*" hidden>' +
      '  <input type="file" id="ocrCamFile" accept="image/*" capture="environment" hidden>' +
      '  <div class="ocr-prev-box" id="ocrPrevBox" hidden>' +
      '    <img class="ocr-prev" id="ocrPrev" alt="待识别的图片预览">' +
      '  </div>' +
      '  <div class="ocr-btns">' +
      '    <button class="btn btn-main js-primary-submit" id="ocrGo" type="button" disabled>✨ 开始识别</button>' +
      '    <button class="btn btn-ghost" id="ocrClear" type="button">清空</button>' +
      '  </div>' +
      '  <div class="ocr-stat" id="ocrStat" hidden></div>' +
      /* Step 31 · 三：首次加载模型 = 骨架屏 + 进度条 */
      '  <div class="ocr-load" id="ocrLoad" hidden>' +
      '    <p class="ocr-load-t" id="ocrLoadT">' + MODEL_HINT + '</p>' +
      '    <div class="ocr-sk" id="ocrSk"></div>' +
      '    <div class="ocr-prog"><span class="ocr-prog-fill" id="ocrProgFill"></span></div>' +
      '    <p class="ocr-prog-s" id="ocrProgS"></p>' +
      '  </div>' +
      '  <textarea class="inp ocr-out" id="ocrOut" rows="8" placeholder="识别结果会显示在这里，可直接编辑"></textarea>' +
      '  <div class="ocr-foot" id="ocrFoot" hidden>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrCopy" type="button">📋 复制全文</button>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrToTc" type="button">🔀 送入文本处理</button>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrTxt" type="button">⬇️ 导出 TXT</button>' +
      '  </div>' +
      '  <div class="ocr-paras" id="ocrParas" hidden></div>' +
      '</div>' +
      '<p class="cd-note">识别在浏览器本地完成，图片不会上传。首次使用需加载约 20MB 模型（之后走缓存），识别后建议人工校对；手写体、艺术字、低分辨率小字识别率有限。</p>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    const drop = $('#ocrDrop', root);
    const input = $('#ocrFile', root);
    const camInput = $('#ocrCamFile', root);
    drop.addEventListener('click', () => input.click());
    $('#ocrPick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    $('#ocrCam', root).addEventListener('click', e => { e.stopPropagation(); camInput.click(); });
    const onPick = el => {
      const f = el.files && el.files[0];
      el.value = '';
      if (f) pickFile(f);
    };
    input.addEventListener('change', () => onPick(input));
    camInput.addEventListener('change', () => onPick(camInput));

    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) pickFile(f);
    });

    /* ---------- 粘贴截图（Ctrl+V） ----------
       监听挂在 document 上才能收到任意位置的粘贴；
       清理靠模块级 ocrOnPaste + unmount() 主动 removeEventListener。 */
    ocrOnPaste = e => {
      if (!alive || !rootEl || !rootEl.isConnected) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
          const f = items[i].getAsFile();
          if (f) { e.preventDefault(); pickFile(f); return; }
        }
      }
    };
    document.addEventListener('paste', ocrOnPaste);

    $('#ocrGo', root).addEventListener('click', runOCR);
    $('#ocrClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));

    /* 复制必须同步执行（LB.copyNow），不能放在 await 之后（手势栈丢失） */
    $('#ocrCopy', root).addEventListener('click', () => {
      const el = $('#ocrOut', root);
      const t = el && el.value ? el.value : '';
      if (!t) { LB.toast('没有可复制的文字', 'err'); return; }
      LB.copyNow(t, '已复制全文');
    });
    /* 分段复制：事件委托，读当前 DOM 文本，仍在点击同步栈内 */
    $('#ocrParas', root).addEventListener('click', e => {
      const btn = e.target.closest('.ocr-p-copy');
      if (!btn) return;
      const p = btn.parentElement && btn.parentElement.querySelector('.ocr-p-t');
      const t = p ? p.textContent : '';
      if (!t) { LB.toast('这段没有文字', 'err'); return; }
      LB.copyNow(t, '已复制本段');
    });
    $('#ocrToTc', root).addEventListener('click', () => {
      const t = $('#ocrOut', root).value;
      if (!t) { LB.toast('没有可送入的文字', 'err'); return; }
      LB.storage.set('litebox_tc_seed', t);
      LB.hash.go('textconvert');
    });
    $('#ocrTxt', root).addEventListener('click', () => {
      const t = $('#ocrOut', root).value;
      if (!t) { LB.toast('没有可导出的文字', 'err'); return; }
      LB.img.download(new Blob([t], { type: 'text/plain;charset=utf-8' }), 'LiteBox-OCR结果.txt');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* 引擎已在内存里（本次会话识别过）→ 直接把进度条摆到就绪态，省得用户以为还要等 */
    if (detSession && recSession && vocab) {
      showLoad(MODEL_HINT + '，首次稍慢，之后走浏览器缓存…');
      setPhase('识别模型已就绪');
      setProgress(1, '100%');
      hideLoad();
    }
  }

  function unmount() {
    alive = false;
    seq++;
    /* 挂在 document 上的监听不会随 host.innerHTML='' 消失，必须主动移除 */
    if (ocrOnPaste) {
      document.removeEventListener('paste', ocrOnPaste);
      ocrOnPaste = null;
    }
    if (ocrURL) { try { URL.revokeObjectURL(ocrURL); } catch (_) {} }
    ocrURL = '';
    ocrFile = null;
    ocrSend = null;
    ocrResult = null;
    rootEl = null;
    /* detSession / recSession / vocab / enginePromise 保留：模型只加载一次 */
  }

  LB.router.register('ocr', { mount, unmount });
})();
