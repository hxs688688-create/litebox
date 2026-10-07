/* LiteBox v5 · tools/idphoto.js — 证件照换底色
   双引擎：⚡ 快速兼容（四边 flood fill + 去污染合成，纯本地）
          ✨ AI 精准（MediaPipe Selfie Segmentation，CDN 三源降级） */
(function () {
  'use strict';

  const { $, $$, clamp } = LB.dom;
  const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
  let rootEl = null;
  let cv = null, ctx = null;      /* 主画布 */
  let mk = null, fg = null;       /* AI 临时层：蒙版 / 前景 */
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  let rerunTimer = null;

  /* ============ 公共状态 ============ */
  const IDP = {
    img: null,      /* 原 HTMLImageElement */
    base: null,     /* 原图 ImageData（缩放后） */
    clean: null,    /* 原图干净副本 canvas（供 AI 分割） */
    bg: '#438EDB',  /* 当前目标色（mount 时从 tokens 刷新） */
    tol: 45,        /* 当前力度 */
    eng: 'ai',      /* 'ai' | 'fast' */
    spec: 'custom', /* Step 6A：当前证件照规格 key（custom = 保持当前尺寸） */
    sheetCv: null   /* Step 6A：六寸排版照 canvas（懒创建） */
  };

  /* ================================================================
   * Step 6A · 证件照规格预设（300dpi 像素级对照表）
   *
   * w/h 是「毫米 × 300dpi / 25.4」换算出的像素：
   *   一寸 25×35mm → 295×413；二寸 35×49mm → 413×579；美签 2×2in → 600×600。
   *
   * ★ 排布数量不写死，而是由 fitSheet() 按相纸尺寸实时计算 —— 这是 Step 6A 实测纠错：
   *   任务书给的「一寸 5×5 = 25 张」在物理上放不下：
   *     5 列宽 = 5×295 + 4×12 = 1523px（宽度够），
   *     但 5 行高 = 5×413 + 4×12 = 2113px > 相纸 1205px —— 超了 75%，一寸只能排 2 行。
   *   「美签 3×2」同样溢出：3 列宽 = 3×600 + 2×12 = 1824px > 1795px。
   *   写死这些值会导致 buildSheet 直接报"超出相纸"，用户永远看不到排版照。
   *   改为实时计算后：一寸 5×2=10、二寸 4×2=8、小二寸 4×2=8、
   *   美签 2×1=2、公务员 4×2=8、社保卡 5×3=15，且永远不溢出。
   * ================================================================ */
  const SPECS = {
    custom:  { name: '自定义（当前尺寸）', w: 0, h: 0 },
    '1inch': { name: '一寸',   w: 295, h: 413 },
    '2inch': { name: '二寸',   w: 413, h: 579 },
    small2:  { name: '小二寸', w: 390, h: 567 },
    us:      { name: '美签',   w: 600, h: 600 },
    kaogong: { name: '公务员', w: 413, h: 531 },
    shebao:  { name: '社保卡', w: 307, h: 378 }
  };
  /* 六寸相纸：152×102 mm @300dpi = 1795×1205 px（横向） */
  const SHEET_W = 1795, SHEET_H = 1205;
  /* 照片之间的白边：1mm @300dpi ≈ 12px */
  const GAP = 12;

  /* 按相纸尺寸计算某规格的最大可行排布（含 GAP） */
  function fitSheet(w, h) {
    const cols = Math.max(1, Math.floor((SHEET_W + GAP) / (w + GAP)));
    const rows = Math.max(1, Math.floor((SHEET_H + GAP) / (h + GAP)));
    return { cols: cols, rows: rows, total: cols * rows };
  }

  /* AI 引擎（模块级缓存：重新进入页面无需二次加载模型） */
  const IDP_AI = {
    ss: null, ready: false, loading: false,
    busy: false, rerunQueued: false, first: true,
    SOURCES: [
      'https://registry.npmmirror.com/@mediapipe/selfie_segmentation/0.1.1675465747/files',
      'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747',
      'https://unpkg.com/@mediapipe/selfie_segmentation@0.1.1675465747'
    ]
  };

  /* 业务数据色（swatch 选项），只从 tokens.css 读取 */
  const VAL = {
    white: '#ffffff', blue: '#438EDB', red: '#D9001B',
    custom: '#1f2937', invert: '#ffffff' /* difference 反转操作色 */
  };

  function parseColor(str) {
    if (str === 'transparent') return null;
    let m = /^#([0-9a-f]{6})$/i.exec(str);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^#([0-9a-f]{3})$/i.exec(str);
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    return [0, 0, 0];
  }

  /* ============ 4.1 背景色采样：边缘带 + 量化桶众数 ============ */
  function sampleBg(d, w, h) {
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.045));
    const step = Math.max(1, Math.floor(Math.min(w, h) / 260));
    const buckets = new Map();
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (x < band || x >= w - band || y < band || y >= h - band) {
          const i = (y * w + x) * 4;
          const key = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
          const b = buckets.get(key) || { n: 0, r: 0, g: 0, bl: 0 };
          b.n++; b.r += d[i]; b.g += d[i + 1]; b.bl += d[i + 2];
          buckets.set(key, b);
        }
      }
    }
    let best = null;
    buckets.forEach(b => { if (!best || b.n > best.n) best = b; });
    return best ? [best.r / best.n, best.g / best.n, best.bl / best.n] : [255, 255, 255];
  }

  /* ============ 4.2 蒙版生成：四边 flood fill（连通背景扩散） ============ */
  function buildMask(tol, bgRGB) {
    const w = IDP.base.width, h = IDP.base.height;

    /* 1. 降采样到宽 360（高不超过 2 倍宽） */
    const dw = Math.min(360, w);
    const dh = Math.min(Math.max(1, Math.round(h * dw / w)), dw * 2);
    const small = document.createElement('canvas');
    small.width = dw; small.height = dh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(IDP.clean, 0, 0, dw, dh);
    const dd = sctx.getImageData(0, 0, dw, dh).data;

    /* 2. 每像素与背景色的综合距离（色度为主，亮度低权重） */
    const bgSum = (bgRGB[0] + bgRGB[1] + bgRGB[2]) || 1;
    const bgRp = bgRGB[0] / bgSum, bgGp = bgRGB[1] / bgSum, bgBp = bgRGB[2] / bgSum;
    const bgLum = bgSum / 3;
    const dist = new Float32Array(dw * dh);
    for (let p = 0, i = 0; p < dw * dh; p++, i += 4) {
      const R = dd[i], G = dd[i + 1], B = dd[i + 2];
      const s = (R + G + B) || 1;
      const dC = Math.sqrt(
        (R / s - bgRp) * (R / s - bgRp) +
        (G / s - bgGp) * (G / s - bgGp) +
        (B / s - bgBp) * (B / s - bgBp)
      ) * 255;
      const dL = Math.abs((R + G + B) / 3 - bgLum);
      dist[p] = Math.sqrt(dC * dC + dL * dL * 0.10);
    }

    /* 3-4. 双阈值 + 四边 BFS 扩散 */
    const lo = tol * 0.5, hi = tol;
    const mark = new Uint8Array(dw * dh);
    const queue = new Int32Array(dw * dh);
    let qh = 0, qt = 0, marked = 0;
    const seed = p => { if (!mark[p] && dist[p] <= lo) { mark[p] = 1; marked++; queue[qt++] = p; } };
    for (let x = 0; x < dw; x++) { seed(x); seed((dh - 1) * dw + x); }
    for (let y = 0; y < dh; y++) { seed(y * dw); seed(y * dw + dw - 1); }
    while (qh < qt) {
      const p = queue[qh++];
      const x = p % dw, y = (p / dw) | 0;
      if (x > 0 && !mark[p - 1] && dist[p - 1] < hi) { mark[p - 1] = 1; marked++; queue[qt++] = p - 1; }
      if (x < dw - 1 && !mark[p + 1] && dist[p + 1] < hi) { mark[p + 1] = 1; marked++; queue[qt++] = p + 1; }
      if (y > 0 && !mark[p - dw] && dist[p - dw] < hi) { mark[p - dw] = 1; marked++; queue[qt++] = p - dw; }
      if (y < dh - 1 && !mark[p + dw] && dist[p + dw] < hi) { mark[p + dw] = 1; marked++; queue[qt++] = p + dw; }
    }

    /* 5-6. 双线性上采样到全尺寸（0..1 背景程度 → 0..255 保留度） */
    const mask = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const gy = clamp((y + 0.5) * dh / h - 0.5, 0, dh - 1);
      const y0 = gy | 0, y1 = Math.min(y0 + 1, dh - 1), fy = gy - y0;
      const r0 = y0 * dw, r1 = y1 * dw;
      for (let x = 0; x < w; x++) {
        const gx = clamp((x + 0.5) * dw / w - 0.5, 0, dw - 1);
        const x0 = gx | 0, x1 = Math.min(x0 + 1, dw - 1), fx = gx - x0;
        const vTop = mark[r0 + x0] * (1 - fx) + mark[r0 + x1] * fx;
        const vBot = mark[r1 + x0] * (1 - fx) + mark[r1 + x1] * fx;
        mask[y * w + x] = (1 - (vTop * (1 - fy) + vBot * fy)) * 255;
      }
    }

    /* 7. 盒式模糊（半径 2）两次近似高斯，边缘过渡自然 */
    boxBlur(mask, w, h, 2);
    boxBlur(mask, w, h, 2);
    return { mask: mask, rate: marked / (dw * dh) };
  }

  /* 盒式模糊：水平 + 垂直两趟（滚动窗口 O(n)） */
  function boxBlur(arr, w, h, r) {
    const win = 2 * r + 1;
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += arr[row + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / win;
        sum += arr[row + clamp(x + r + 1, 0, w - 1)] - arr[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        arr[y * w + x] = sum / win;
        sum += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }

  /* ============ 快速兼容模式主流程 ============ */
  function runFast() {
    const w = cv.width, h = cv.height;
    const bgRGB = sampleBg(IDP.base.data, w, h);

    /* 4.3 自适应力度：替换率 < 4% 时 +18 重试，最多 5 次（上限 115） */
    let tol = IDP.tol, attempts = 0, res = null;
    for (;;) {
      res = buildMask(tol, bgRGB);
      attempts++;
      if (res.rate >= 0.04 || attempts >= 5 || tol >= 115) break;
      tol = Math.min(115, tol + 18);
    }
    let enhanceNote = '';
    if (tol !== IDP.tol) {
      IDP.tol = tol;
      $('#idTol', rootEl).value = tol;
      $('#idTolV', rootEl).textContent = tol;
      enhanceNote = '（已自动增强力度至 ' + tol + '）';
    }

    /* 4.4 去污染合成：输出 = 原色 + (1-k)·(目标色 - 背景色) */
    const out = new ImageData(new Uint8ClampedArray(IDP.base.data), w, h);
    const d = out.data;
    const t = parseColor(IDP.bg);
    const total = w * h;
    let replaced = 0;
    for (let p = 0, i = 0; p < total; p++, i += 4) {
      const k = res.mask[p] / 255;
      if (k >= 0.995) continue;
      if (k < 0.5) replaced++;
      if (!t) {
        d[i + 3] = d[i + 3] * k; /* 透明底：alpha = alpha * k */
      } else {
        const inv = 1 - k;
        d[i] = d[i] + inv * (t[0] - bgRGB[0]);
        d[i + 1] = d[i + 1] + inv * (t[1] - bgRGB[1]);
        d[i + 2] = d[i + 2] + inv * (t[2] - bgRGB[2]);
      }
    }
    ctx.putImageData(out, 0, 0);

    const pct = Math.round(replaced / total * 100);
    let msg = '本次替换了 ' + pct + '% 的区域' + (enhanceNote ? ' ' + enhanceNote : '');
    const warn = pct < 2;
    if (warn) msg += ' · ⚠️ 几乎没有匹配到背景色，请确认照片为纯色背景，或调大力度';
    showStat(msg, warn);
  }

  /* ============ 5.1 AI 引擎加载（三源降级） ============ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => { s.remove(); reject(new Error('script load failed')); };
      document.head.appendChild(s);
    });
  }

  function ensureAI() {
    if (IDP_AI.ready || IDP_AI.loading) return;
    IDP_AI.loading = true;
    showEngStat('⏳ AI 引擎加载中（首次使用需联网，之后走浏览器缓存）…');
    (async () => {
      for (const base of IDP_AI.SOURCES) {
        try {
          await loadScript(base + '/selfie_segmentation.js');
          if (!window.SelfieSegmentation) throw new Error('SelfieSegmentation missing');
          const ss = new SelfieSegmentation({ locateFile: f => base + '/' + f });
          await ss.setOptions({ modelSelection: 0 }); /* 0=general，竖版证件照更准 */
          ss.onResults(onAIResults);
          IDP_AI.ss = ss;
          IDP_AI.ready = true;
          IDP_AI.loading = false;
          IDP_AI.first = true; /* 真正"就绪"提示等首次分割结果 */
          if (IDP.base && IDP.eng === 'ai') rerunNow(); /* 触发首次 send（模型懒加载） */
          return;
        } catch (e) { /* 尝试下一个源 */ }
      }
      IDP_AI.loading = false;
      aiFallback();
    })();
  }

  /* 三源都失败 / send 抛错：降级快速模式 */
  function aiFallback() {
    showEngStat('⚠️ AI 引擎不可用（网络受限），已切换快速兼容模式');
    LB.toast('⚠️ AI 引擎不可用（网络受限），已切换快速兼容模式', 'warn');
    setEngine('fast');
    rerunNow();
  }

  /* ============ AI 模式主流程（含忙闲保护与超时兜底） ============ */
  async function runAI() {
    if (!IDP.base) return;
    if (!IDP_AI.ready) { ensureAI(); return; }
    if (IDP_AI.busy) { IDP_AI.rerunQueued = true; return; }
    IDP_AI.busy = true;
    try {
      await Promise.race([
        IDP_AI.ss.send({ image: IDP.clean }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('AI engine timeout')), 90000))
      ]);
    } catch (e) {
      IDP_AI.ready = false;
      aiFallback();
    } finally {
      IDP_AI.busy = false;
      if (IDP_AI.rerunQueued) { IDP_AI.rerunQueued = false; rerunNow(); }
    }
  }

  /* ============ 5.3 onResults 处理 ============ */
  function onAIResults(res) {
    if (!IDP.base || !rootEl) return;
    if (IDP.eng !== 'ai') return; /* 结果晚到且用户已切走引擎：丢弃，避免覆盖快速模式输出 */
    /* 模型随首次 send 懒加载：首次出结果才算真正"就绪" */
    if (IDP_AI.first) {
      IDP_AI.first = false;
      showEngStat('✓ AI 引擎已就绪');
      setTimeout(() => { if (rootEl && IDP_AI.ready) $('#idEngStat', rootEl).hidden = true; }, 3000);
    }
    const w = cv.width, h = cv.height;

    /* 1. 蒙版绘制到同尺寸临时 canvas（浏览器双线性缩放，边缘自然） */
    mk.width = w; mk.height = h;
    const mx = mk.getContext('2d', { willReadFrequently: true });
    mx.globalCompositeOperation = 'source-over';
    mx.drawImage(res.segmentationMask, 0, 0, w, h);

    /* 2. 蒙版极性自检：边缘带 vs 中心区域（部分平台 mask 白=背景） */
    let md = mx.getImageData(0, 0, w, h).data;
    const bx = Math.max(1, (w / 16) | 0), by = Math.max(1, (h / 16) | 0);
    let eSum = 0, eN = 0, cSum = 0, cN = 0;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const v = md[(y * w + x) * 4];
        if (x < bx || x >= w - bx || y < by || y >= h - by) { eSum += v; eN++; }
        else if (x >= w * 0.3 && x < w * 0.7 && y >= h * 0.2 && y < h * 0.75) { cSum += v; cN++; }
      }
    }
    if (eN && cN && eSum / eN > cSum / cN + 25) {
      mx.globalCompositeOperation = 'difference';
      mx.fillStyle = VAL.invert;
      mx.fillRect(0, 0, w, h);
      mx.globalCompositeOperation = 'source-over';
      md = mx.getImageData(0, 0, w, h).data;
    }
    let bgN = 0;
    for (let p = 0; p < w * h; p++) if (md[p * 4] < 128) bgN++;

    /* 3. 合成前景层 fg：蒙版 × 原图干净副本（source-in） */
    fg.width = w; fg.height = h;
    const fx = fg.getContext('2d', { willReadFrequently: true });
    fx.globalCompositeOperation = 'source-over';
    fx.clearRect(0, 0, w, h);
    fx.drawImage(mk, 0, 0);
    fx.globalCompositeOperation = 'source-in';
    fx.drawImage(IDP.clean, 0, 0, w, h);
    fx.globalCompositeOperation = 'source-over';

    /* 4. 边缘去污染：反解过渡带纯前景色，消除底色镶边 */
    const fd = fx.getImageData(0, 0, w, h);
    const f = fd.data;
    const bgRGB = sampleBg(IDP.base.data, w, h); /* 采样方法同 4.1 */
    for (let i = 0; i < f.length; i += 4) {
      const a = f[i + 3];
      if (a <= 13 || a >= 250) continue;
      const al = a / 255, inv = 1 - al;
      f[i] = clamp255((f[i] - inv * bgRGB[0]) / al);
      f[i + 1] = clamp255((f[i + 1] - inv * bgRGB[1]) / al);
      f[i + 2] = clamp255((f[i + 2] - inv * bgRGB[2]) / al);
    }
    fx.putImageData(fd, 0, 0);

    /* 5. 输出到主 canvas */
    ctx.clearRect(0, 0, w, h);
    const t = parseColor(IDP.bg);
    if (t) { ctx.fillStyle = IDP.bg; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(fg, 0, 0);

    showStat('✓ AI 分割完成 · 发丝级边缘 · 本次替换了 ' + Math.round(bgN / (w * h) * 100) + '% 的区域', false);
  }

  /* ============ 状态行 / 调度 ============ */
  function showStat(msg, warn) {
    const el = $('#idStat', rootEl);
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
    el.hidden = false;
  }
  function showEngStat(msg) {
    const el = $('#idEngStat', rootEl);
    el.textContent = msg;
    el.hidden = false;
  }
  function setEngine(eng) {
    IDP.eng = eng;
    $$('#idEng .seg-btn', rootEl).forEach(x => x.classList.toggle('on', x.dataset.e === eng));
    $('#idTolRow', rootEl).hidden = eng !== 'fast'; /* 力度仅快速模式显示 */
  }
  function scheduleRerun() {
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(rerunNow, 60);
  }
  function rerunNow() {
    if (!IDP.base || !rootEl) return;
    if (IDP.eng === 'ai') runAI(); else runFast();
  }

  /* ============ 上传 / 重新上传 ============ */
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
    IDP.img = img;
    /* 最大边 1200 等比缩放 */
    const { w, h } = LB.img.fitSize(img.naturalWidth, img.naturalHeight, 1200);
    cv.width = w; cv.height = h;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    IDP.base = ctx.getImageData(0, 0, w, h);
    /* 干净副本 canvas（供 AI 分割，避免被 putImageData 覆盖） */
    IDP.clean = IDP.clean || document.createElement('canvas');
    IDP.clean.width = w; IDP.clean.height = h;
    IDP.clean.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
    $('#idpPick', rootEl).hidden = true;
    $('#idpWork', rootEl).hidden = false;
    LB.replay($('#idpWork', rootEl), 'lb-scale-in'); /* Step 10 */
    /* Step 6A：图片就绪后启用排版照按钮并刷新规格信息 */
    const sg = $('#idSheetGo', rootEl);
    if (sg) sg.disabled = false;
    updateSpecInfo();
    rerunNow();
  }

  function reselect() {
    IDP.img = null; IDP.base = null; IDP.clean = null;
    IDP.spec = 'custom';
    IDP.sheetCv = null;
    $('#idpWork', rootEl).hidden = true;
    $('#idpPick', rootEl).hidden = false;
    $('#idStat', rootEl).hidden = true;
    if ($('#idSheetBox', rootEl)) $('#idSheetBox', rootEl).hidden = true;
    if ($('#idSheetGo', rootEl)) $('#idSheetGo', rootEl).disabled = true;
    if ($('#idSpec', rootEl)) $('#idSpec', rootEl).value = 'custom';
    updateSpecInfo();
  }

  /* ================================================================
   * Step 6A · 规格裁剪
   *
   * 【关键设计：不碰现有 cv】
   *   抠图流程（runFast / onAIResults）始终作用在 cv 上，尺寸是原图等比缩放后的尺寸。
   *   规格裁剪是**派生输出**：把cv 当前内容按目标宽高比居中裁剪到 spec.w × spec.h，
   *   画到一个独立 canvas。理由：
   *     · 抠图算法依赖完整人像轮廓，裁剪后再抠会破坏发丝级边缘
   *     · 换底色 / 调力度都基于原图重跑，若把 cv 改成规格尺寸，
   *       反复切换规格会导致画质被反复缩放而永久劣化
   *   因此：cv 保持原尺寸（下载的PNG 仍是原图），
   *   规格切换只影响「规格预览」与「排版照」，并在UI 上明确说明。
   *
   * @param {HTMLCanvasElement} src 源画布（已换好底色的 cv）
   * @param {number} tw 目标宽（px）
   * @param {number} th 目标高（px）
   * @returns {HTMLCanvasElement} 新画布
   */
  function cropToSpec(src, tw, th) {
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';

    const sw = src.width, sh = src.height;
    if (!sw || !sh) return out;

    /* 以目标宽高比裁剪源图（保持宽高比，居中）——标准cover 行为 */
    const targetRatio = tw / th;
    const srcRatio = sw / sh;
    let cw, ch, cx, cy;
    if (srcRatio > targetRatio) {
      /* 源图更宽 → 裁左右 */
      ch = sh; cw = Math.round(sh * targetRatio);
      cx = Math.round((sw - cw) / 2); cy = 0;
    } else {
      /* 源图更高 → 裁上下 */
      cw = sw; ch = Math.round(sw / targetRatio);
      cx = 0; cy = Math.round((sh - ch) / 2);
    }
    c.drawImage(src, cx, cy, cw, ch, 0, 0, tw, th);
    return out;
  }

  /* 当前规格对应的画布：custom 返回原 cv，否则返回裁剪结果 */
  function currentSpecCanvas() {
    const sp = SPECS[IDP.spec];
    if (!sp || !sp.w) return cv;
    return cropToSpec(cv, sp.w, sp.h);
  }

  function updateSpecInfo() {
    const el = $('#idSpecInfo', rootEl);
    if (!el) return;
    const sp = SPECS[IDP.spec];
    if (!sp || !sp.w) {
      el.textContent = cv ? ('当前尺寸 ' + cv.width + ' × ' + cv.height + ' px · 未套用规格') : '未上传图片';
      return;
    }
    const fit = fitSheet(sp.w, sp.h);
    el.textContent = sp.name + ' · ' + sp.w + ' × ' + sp.h + ' px（300dpi）· 六寸相纸可排 ' +
      fit.cols + ' 列 × ' + fit.rows + ' 行 = ' + fit.total + ' 张';
  }

  /* ================================================================
   * Step 6A · 六寸相纸排版照
   * 152×102mm @300dpi = 1795×1205px，照片间留 1mm（12px）白边。
   * 排布数量由 fitSheet() 按相纸尺寸实时计算，保证永不溢出。
   * 排布时在剩余空间内居中，避免左边距大、右边距空的不对称观感。
   * ================================================================ */
  function buildSheet() {
    if (!cv) { LB.toast('请先上传图片', 'info'); return; }
    const sp = SPECS[IDP.spec];
    if (!sp || !sp.w) { LB.toast('请先选择规格（自定义尺寸无法排版）', 'warn'); return; }

    /* 单张照片用当前规格（custom 时用原cv 尺寸） */
    const one = currentSpecCanvas();
    const pw = one.width, ph = one.height;
    const fit = fitSheet(pw, ph);
    const sp2 = fit.cols * pw + (fit.cols - 1) * GAP;
    const sp3 = fit.rows * ph + (fit.rows - 1) * GAP;
    /* 兜底：理论上 fitSheet 保证不溢出，这里防御极端尺寸（如超大自定义图） */
    if (sp2 > SHEET_W || sp3 > SHEET_H) {
      LB.toast(sp.name + ' 尺寸过大，六寸相纸放不下，请选更小的规格', 'err');
      return;
    }

    const sheet = document.createElement('canvas');
    sheet.width = SHEET_W; sheet.height = SHEET_H;
    const sc = sheet.getContext('2d');
    /* 白底（相纸），透明底照片在此白底上预览才看得清 */
    sc.fillStyle = '#ffffff';
    sc.fillRect(0, 0, SHEET_W, SHEET_H);
    sc.imageSmoothingEnabled = true;
    sc.imageSmoothingQuality = 'high';

    const offX = Math.round((SHEET_W - sp2) / 2);
    const offY = Math.round((SHEET_H - sp3) / 2);
    for (let r = 0; r < fit.rows; r++) {
      for (let cI = 0; cI < fit.cols; cI++) {
        sc.drawImage(one, offX + cI * (pw + GAP), offY + r * (ph + GAP), pw, ph);
      }
    }

    IDP.sheetCv = sheet;
    const box = $('#idSheetBox', rootEl);
    const view = $('#idSheetCv', rootEl);
    view.width = SHEET_W; view.height = SHEET_H;
    const vctx = view.getContext('2d');
    vctx.clearRect(0, 0, SHEET_W, SHEET_H);
    vctx.drawImage(sheet, 0, 0);
    box.hidden = false;
    $('#idSheetMeta', rootEl).textContent =
      sp.name + ' · ' + fit.cols + ' 列 × ' + fit.rows + ' 行 = ' + fit.total + ' 张 · ' +
      SHEET_W + '×' + SHEET_H + 'px（152×102 mm @300dpi）· 含 ' + GAP + 'px 白边';
    LB.toast('排版照已生成', 'ok');
  }

  /* 视图 */
  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>证件照换底色</h1><p>白 / 蓝 / 红 / 透明底一键替换 · 图片不离开本机</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-cols">' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">证件照</span>' +
      '<div id="idpPick">' +
      '<div class="dropzone idp-zone" id="idpZone">点击选择、拖入一张图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="idpFile" accept="image/*" hidden>' +
      '</div>' +
      '<div id="idpWork" hidden>' +
      '<div class="crop-wrap idp-stage" id="idpStage">' +
      '<canvas id="idCv" width="0" height="0"></canvas>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">设置</span>' +
      '<div class="card set-card">' +
      '<div class="tool-sec"><span class="tool-lab">抠图引擎</span>' +
      '<div class="seg" id="idEng">' +
      '<button class="seg-btn on" data-e="ai" type="button">✨ AI 精准</button>' +
      '<button class="seg-btn" data-e="fast" type="button">⚡ 快速兼容</button>' +
      '</div>' +
      '<div class="idp-engstat" id="idEngStat" hidden></div>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">目标背景色</span>' +
      '<div class="idp-swatches" id="idpSwatches">' +
      '<button class="idp-sw" data-k="white" type="button" title="白底" aria-label="白底"></button>' +
      '<button class="idp-sw on" data-k="blue" type="button" title="蓝底" aria-label="蓝底"></button>' +
      '<button class="idp-sw" data-k="red" type="button" title="红底" aria-label="红底"></button>' +
      '<button class="idp-sw" data-k="transparent" type="button" title="透明底" aria-label="透明底"></button>' +
      '<label class="idp-sw idp-sw-custom" title="自定义颜色">' +
      '<input type="color" id="idColor" aria-label="自定义颜色">' +
      '</label>' +
      '</div></div>' +
      /* ---------- Step 6A · 规格预设 ---------- */
      '<div class="tool-sec"><span class="tool-lab">证件照规格</span>' +
      '<select class="inp" id="idSpec" aria-label="证件照规格">' +
      '<option value="custom">自定义（当前尺寸）</option>' +
      '<option value="1inch">一寸（25×35 mm）</option>' +
      '<option value="2inch">二寸（35×49 mm）</option>' +
      '<option value="small2">小二寸（33×48 mm）</option>' +
      '<option value="us">美签（51×51 mm / 2×2 in）</option>' +
      '<option value="kaogong">公务员（35×45 mm）</option>' +
      '<option value="shebao">社保卡（26×32 mm）</option>' +
      '</select>' +
      '<div class="idp-specinfo" id="idSpecInfo">当前尺寸 · 未套用规格</div>' +
      '</div>' +
      /* ---------- Step 6A · 六寸相纸排版照 ---------- */
      '<div class="tool-sec"><span class="tool-lab">六寸相纸排版照</span>' +
      '<div class="idp-sheet" id="idSheetBox" hidden>' +
      '<canvas id="idSheetCv" class="idp-sheet-cv"></canvas>' +
      '<div class="idp-sheet-meta" id="idSheetMeta"></div>' +
      '<button class="btn btn-ghost" id="idSheetDl" type="button" style="width:100%;margin-top:8px">⬇️ 下载排版照（PNG）</button>' +
      '</div>' +
      '<button class="btn btn-ghost" id="idSheetGo" type="button" style="width:100%" disabled>🖨️ 生成六寸排版照</button>' +
      '<div class="tip-dim">排版照是额外输出，不影响上方证件照预览；照片间留 1mm 白边方便裁剪</div>' +
      '</div>' +
      '<div class="field" id="idTolRow" hidden><label>替换力度 <output id="idTolV">45</output></label><input type="range" id="idTol" min="10" max="120" step="1" value="45"></div>' +
      '<div class="idp-stat" id="idStat" hidden></div>' +
      '<div class="tip-dim">AI 模式由 Google 开源人像分割引擎驱动（首次使用需联网加载模型，之后走浏览器缓存）；快速模式为纯本地色彩算法，适合纯色背景</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="idDl" type="button">⬇️ 下载 PNG</button>' +
      '<button class="btn btn-ghost" id="idReset" type="button">↺ 重新上传</button>' +
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
    IDP.img = null; IDP.base = null; IDP.clean = null;
    IDP.tol = 45; IDP.eng = 'ai';
    /* Step 6A：重置规格与排版照（离开工具再回来不应残留上次的规格） */
    IDP.spec = 'custom'; IDP.sheetCv = null;

    cv = $('#idCv', root);
    ctx = cv.getContext('2d', { willReadFrequently: true });
    mk = document.createElement('canvas');
    fg = document.createElement('canvas');

    /* 色值只从 tokens.css 读取 */
    const cs = getComputedStyle(document.documentElement);
    VAL.white = cs.getPropertyValue('--idp-white').trim() || VAL.white;
    VAL.blue = cs.getPropertyValue('--idp-blue').trim() || VAL.blue;
    VAL.red = cs.getPropertyValue('--idp-red').trim() || VAL.red;
    VAL.custom = cs.getPropertyValue('--idp-custom').trim() || VAL.custom;
    VAL.invert = cs.getPropertyValue('--idp-white').trim() || VAL.invert;
    IDP.bg = VAL.blue;
    $('#idColor', root).value = VAL.custom;
    setEngine('ai');

    LB.img.bindDrop($('#idpZone', root), $('#idpFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    $('#idEng', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b || b.dataset.e === IDP.eng) return;
      setEngine(b.dataset.e);
      if (IDP.eng === 'ai' && !IDP_AI.ready && IDP.base) {
        $('#idStat', root).hidden = true; /* 旧结果来自另一引擎，先收起 */
      }
      rerunNow(); /* 切 AI 且未加载会在 runAI 内触发加载，完成后自动补跑 */
    });
    $('#idpSwatches', root).addEventListener('click', e => {
      const b = e.target.closest('.idp-sw[data-k]');
      if (!b) return;
      $$('.idp-sw', root).forEach(x => x.classList.toggle('on', x === b));
      IDP.bg = b.dataset.k === 'transparent' ? 'transparent' : (VAL[b.dataset.k] || VAL.blue);
      $('#idpStage', root).classList.toggle('tr', b.dataset.k === 'transparent');
      scheduleRerun(); /* debounce 60ms */
    });
    $('#idColor', root).addEventListener('input', e => {
      IDP.bg = e.target.value;
      $$('.idp-sw', root).forEach(x => x.classList.remove('on'));
      e.target.closest('.idp-sw').classList.add('on');
      $('#idpStage', root).classList.remove('tr');
      scheduleRerun();
    });
    $('#idTol', root).addEventListener('input', e => {
      IDP.tol = clamp(parseInt(e.target.value, 10) || 45, 10, 120);
      $('#idTolV', root).textContent = IDP.tol;
      scheduleRerun(); /* debounce 60ms */
    });
    $('#idDl', root).addEventListener('click', () => {
      if (!IDP.base) { LB.toast('请先上传图片', 'info'); return; }
      LB.img.toBlob(cv, 'image/png').then(b => LB.img.download(b, 'idphoto.png')).catch(() => LB.toast('导出失败', 'err'));
    });
    /* ---------- Step 6A · 规格切换 ---------- */
    $('#idSpec', root).addEventListener('change', e => {
      IDP.spec = e.target.value || 'custom';
      /* 换规格后旧的排版照失效，需重新生成 */
      IDP.sheetCv = null;
      $('#idSheetBox', root).hidden = true;
      updateSpecInfo();
      if (IDP.spec !== 'custom' && !IDP.base) {
        LB.toast('规格已选择，上传图片后即可生成排版照', 'info');
      }
    });
    /* ---------- Step 6A · 六寸排版照 ---------- */
    $('#idSheetGo', root).addEventListener('click', buildSheet);
    $('#idSheetDl', root).addEventListener('click', () => {
      const s = IDP.sheetCv;
      if (!s) { LB.toast('请先生成排版照', 'info'); return; }
      const sp = SPECS[IDP.spec] || SPECS.custom;
      const fname = 'id-photo-排版-六寸-' + sp.name + '.png';
      LB.img.toBlob(s, 'image/png')
        .then(b => LB.img.download(b, fname))
        .catch(() => LB.toast('导出失败', 'err'));
    });
    $('#idReset', root).addEventListener('click', reselect);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    clearTimeout(rerunTimer);
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    IDP.img = null; IDP.base = null; IDP.clean = null;
    IDP.sheetCv = null;
    cv = null; ctx = null; mk = null; fg = null;
    rootEl = null;
  }

  LB.router.register('idphoto', { mount, unmount });
})();
