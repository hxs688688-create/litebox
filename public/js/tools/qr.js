/* LiteBox v5 · tools/qr.js — 二维码工具（Step 20 · A3 大升级）
 * 生成：7 种类型（文本/网址/WiFi/名片/电话/短信/邮件）+ 画布比例/尺寸 + 容错 +
 *   前景单色/渐变(方向) + 码点样式(方/圆角/圆点) + 定位图案(跟随/圆角/圆形/叶形) +
 *   装饰元素（背景图 / 中心Logo / 色块 / 文字）+ 下载 PNG/SVG/JPG；
 * 识别：BarcodeDetector → vendor/jsQR 兜底（沿用）。
 * 矩阵：vendor/qrcode.min.js（qrcode@1.5.3，byte 模式，中文走 UTF-8）。
 * 绘制顺序：背景色 → 背景图 → 色块 → 二维码 → Logo → 文字。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;
  let pasteCleanups = [];
  const QR = { tab: 'gen', type: 'text' };
  let logoImg = null;        /* 方裁预处理后的 canvas */
  let bgImg = null;          /* 背景图 HTMLImageElement */
  let blocks = [];           /* 色块 [{x,y,w,h,color}]（百分比坐标） */
  let texts = [];            /* 文字 [{t,pos,size,color,font}] */

  const FONT_CSS = {
    song: '"Songti SC","SimSun",serif',
    hei: '"PingFang SC","Microsoft YaHei",sans-serif',
    kai: '"Kaiti SC","KaiTi",serif',
    sys: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
  };

  /* ---------- 载荷构造（7 类型） ---------- */

  function wifiEscape(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }

  function val(id) { const el = $(id, rootEl); return el ? el.value.trim() : ''; }

  function buildPayload() {
    const t = QR.type;
    if (t === 'text') {
      const d = val('#qrText');
      if (!d) { LB.toast('请输入文本', 'warn'); return ''; }
      return d;
    }
    if (t === 'url') {
      let u = val('#qrUrl');
      if (!u) { LB.toast('请输入网址', 'warn'); return ''; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      return u;
    }
    if (t === 'wifi') {
      const ssid = val('#qrSsid'), pass = val('#qrPass'), enc = $('#qrEnc', rootEl).value;
      const hidden = $('#qrHidden', rootEl).checked;
      if (!ssid) { LB.toast('请填写 WiFi 名称', 'warn'); return ''; }
      if (enc !== 'nopass' && !pass) { LB.toast('该加密方式需要填写密码', 'warn'); return ''; }
      let s = 'WIFI:T:' + enc + ';S:' + wifiEscape(ssid) + ';';
      if (enc !== 'nopass') s += 'P:' + wifiEscape(pass) + ';';
      if (hidden) s += 'H:true;';
      return s + ';';
    }
    if (t === 'vcard') {
      const name = val('#qrVName');
      if (!name) { LB.toast('名片至少要填姓名', 'warn'); return ''; }
      let s = 'BEGIN:VCARD\nVERSION:3.0\nFN:' + name + '\nN:' + name + ';;;;\n';
      const org = val('#qrVOrg'); if (org) s += 'ORG:' + org + '\n';
      const title = val('#qrVTitle'); if (title) s += 'TITLE:' + title + '\n';
      const tel = val('#qrVTel'); if (tel) s += 'TEL;TYPE=CELL:' + tel + '\n';
      const email = val('#qrVEmail'); if (email) s += 'EMAIL:' + email + '\n';
      let url = val('#qrVUrl'); if (url) { if (!/^[a-z]+:/i.test(url)) url = 'https://' + url; s += 'URL:' + url + '\n'; }
      return s + 'END:VCARD';
    }
    if (t === 'tel') {
      const n = val('#qrTel');
      if (!n) { LB.toast('请填写电话号码', 'warn'); return ''; }
      return 'tel:' + n.replace(/[\s-]/g, '');
    }
    if (t === 'sms') {
      const n = val('#qrSmsTel'), body = val('#qrSmsBody');
      if (!n) { LB.toast('请填写收信号码', 'warn'); return ''; }
      return 'SMSTO:' + n.replace(/[\s-]/g, '') + ':' + body;
    }
    if (t === 'mail') {
      const to = val('#qrMailTo');
      if (!to) { LB.toast('请填写邮箱地址', 'warn'); return ''; }
      const sub = val('#qrMailSub'), body = val('#qrMailBody');
      let s = 'mailto:' + to;
      const q = [];
      if (sub) q.push('subject=' + encodeURIComponent(sub));
      if (body) q.push('body=' + encodeURIComponent(body));
      if (q.length) s += '?' + q.join('&');
      return s;
    }
    return '';
  }

  /* ---------- 工具 ---------- */

  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    const v = parseInt(m[1], 16);
    return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  }

  function showStat(msg, warn) {
    const el = $('#qrStat', rootEl);
    el.textContent = msg;
    el.classList.toggle('err', !!warn);
    el.classList.toggle('ok', !warn);
    el.hidden = false;
  }

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  /* 任意半径圆角矩形（每角独立半径，顺时针：左上/右上/右下/左下）。
     ★ 不在这里 beginPath：调用方自行 begin —— 挖洞(evenodd)需要把外环与
     内孔放进同一个 path，内部 beginPath 会把第一条路径清掉。 */
  function roundedPath(ctx, x, y, w, h, r) {
    const rr = i => Math.min(r[i] || 0, w / 2, h / 2);
    const a = rr(0), b = rr(1), c = rr(2), d = rr(3);
    ctx.moveTo(x + a, y);
    ctx.lineTo(x + w - b, y);
    ctx.arcTo(x + w, y, x + w, y + b, b);
    ctx.lineTo(x + w, y + h - c);
    ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
    ctx.lineTo(x + d, y + h);
    ctx.arcTo(x, y + h, x, y + h - d, d);
    ctx.lineTo(x, y + a);
    ctx.arcTo(x, y, x + a, y, a);
    ctx.closePath();
  }

  /* ---------- Logo（沿用：方裁 + 22% 上限 + H 级容错） ---------- */

  const LOGO_RATIO = 0.22;

  function preprocessLogo(img) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    const side = Math.max(1, Math.min(w, h));
    const c = document.createElement('canvas');
    c.width = c.height = side;
    c.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
    return c;
  }

  function isLogoReady(img) {
    if (!img) return false;
    if (typeof img.naturalWidth === 'number') return img.complete && img.naturalWidth > 0;
    return (img.width || 0) > 0;
  }

  function drawLogo(ctx, size, img) {
    const logoSize = size * LOGO_RATIO;
    const cx = size / 2, cy = size / 2;
    const x = cx - logoSize / 2, y = cy - logoSize / 2;
    const r = logoSize * 0.18;
    ctx.fillStyle = cssVar('--qr-logo-bg', '#ffffff');
    ctx.beginPath();
    roundedPath(ctx, x, y, logoSize, logoSize, [r, r, r, r]);
    ctx.fill();
    if (!isLogoReady(img)) return;
    const inner = logoSize * 0.84;
    try { ctx.drawImage(img, cx - inner / 2, cy - inner / 2, inner, inner); }
    catch (_) { /* 跨域污染等异常时只留白底 */ }
  }

  /* ---------- 前景填充 ---------- */

  function makeFill(ctx, W, H, opt) {
    if (opt.fgStyle !== 'gradient') return opt.fg;
    const dir = opt.gdir || 'diag';
    let g;
    if (dir === 'h') g = ctx.createLinearGradient(0, 0, W, 0);
    else if (dir === 'v') g = ctx.createLinearGradient(0, 0, 0, H);
    else g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, opt.c1);
    g.addColorStop(1, opt.c2);
    return g;
  }

  /* ---------- 矩阵 ---------- */

  function qrMatrix(text, ec) {
    const q = QRCode.create([{ data: text, mode: 'byte' }], { errorCorrectionLevel: ec });
    const n = q.modules.size;
    return { n: n, version: q.version, isDark: (x, y) => !!q.modules.data[y * n + x] };
  }

  const QUIET = 4;
  const MIN_CELL = 4;

  /* ---------- 定位图案（三个角）：跟随 / 圆角 / 圆形 / 叶形 ----------
     无论哪种美化，都必须保留 7×7 的「外环 1 模块 + 中芯 3×3」结构，
     否则扫码器无法定位。环用 evenodd 挖洞实现，不依赖底色回填。 */
  function drawFinders(ctx, m, cell, off, fill, finder, modStyle) {
    if (finder === 'follow') return;   /* 跟随码点：主循环已按普通模块画出 */
    const corners = [[0, 0], [m.n - 7, 0], [0, m.n - 7]];
    corners.forEach(([fx, fy]) => {
      const x = off + fx * cell, y = off + fy * cell, s = cell * 7;
      ctx.fillStyle = fill;
      if (finder === 'round') {
        const ro = cell * 2.2, ri = cell * 1.2;
        ctx.beginPath();
        roundedPath(ctx, x, y, s, s, [ro, ro, ro, ro]);
        roundedPath(ctx, x + cell, y + cell, s - cell * 2, s - cell * 2, [ri, ri, ri, ri]);
        ctx.fill('evenodd');
        ctx.beginPath();
        roundedPath(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, [ri, ri, ri, ri]);
        ctx.fill();
      } else if (finder === 'circle') {
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.arc(x + s / 2, y + s / 2, s / 2 - cell, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, cell * 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (finder === 'leaf') {
        const ro = cell * 3.2, ri = cell * 1.2;
        /* 叶形：对角两个角全圆、另两个角直角（左上与右下圆润，右上左下方正） */
        ctx.beginPath();
        roundedPath(ctx, x, y, s, s, [ro, 0, ro, 0]);
        roundedPath(ctx, x + cell, y + cell, s - cell * 2, s - cell * 2, [ri, 0, ri, 0]);
        ctx.fill('evenodd');
        ctx.beginPath();
        roundedPath(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, [ri, 0, ri, 0]);
        ctx.fill();
      }
    });
  }

  function drawModule(ctx, x, y, cell, modStyle) {
    if (modStyle === 'dot') {
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (modStyle === 'round') {
      ctx.beginPath();
      const rr = cell * 0.3;
      roundedPath(ctx, x, y, cell, cell, [rr, rr, rr, rr]);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
    }
  }

  /* ---------- 合成 ---------- */

  function compose() {
    const data = buildPayload();
    if (!data) return;

    const size = parseInt($('#qrSize', rootEl).value, 10);
    const ecSel = $('#qrEc', rootEl);
    const ratio = $('#qrRatio', rootEl).value;
    const modStyle = $('#qrStyle', rootEl).value;
    const finder = $('#qrFinder', rootEl).value;
    const fgStyle = $$('#qrFgStyle .seg-btn', rootEl).find(b => b.classList.contains('on'));
    const fgMode = fgStyle ? fgStyle.dataset.fg : 'solid';
    const fg = $('#qrFg', rootEl).value;
    const bg = $('#qrBgColor', rootEl).value;
    const opt = {
      fgStyle: fgMode,
      fg: fg,
      c1: $('#qrC1', rootEl).value,
      c2: $('#qrC2', rootEl).value,
      gdir: $('#qrGDir', rootEl).value,
      logo: !!logoImg
    };

    /* 容错下限：有 Logo 强制 H；L 提升到 M（沿用 Step 16 · A4 策略） */
    if (opt.logo && ecSel.value !== 'H') {
      ecSel.value = 'H';
      LB.toast('已加 Logo，容错等级自动提升到 H（30% 可修复）以保证可扫描', 'info');
    } else if (!opt.logo && ecSel.value === 'L') {
      ecSel.value = 'M';
      LB.toast('容错等级已从 L 提升到 M（15% 可修复），L 级容易扫不出', 'info');
    }

    const m = qrMatrix(data, ecSel.value);
    const n = m.n;
    const total = n + QUIET * 2;
    const cell = Math.max(MIN_CELL, Math.floor(size / total));
    const px = cell * total;

    /* 文字装饰占用的边缘空间（auto 比例或文字在上下时需要额外高度） */
    const txtItems = texts.filter(t => t.t);
    const tTop = txtItems.filter(t => t.pos === 'top');
    const tBottom = txtItems.filter(t => t.pos === 'bottom');
    const tSide = txtItems.filter(t => t.pos === 'left' || t.pos === 'right');
    const sideSpace = tSide.length ? Math.max(...tSide.map(t => t.size)) * 1.6 : 0;
    const topSpace = tTop.length ? Math.max(...tTop.map(t => t.size)) * 1.5 + 8 : 0;
    const bottomSpace = tBottom.length ? Math.max(...tBottom.map(t => t.size)) * 1.5 + 8 : 0;

    let W = px, H = px;
    if (ratio === '34') { H = Math.round(px * 4 / 3); }
    else if (ratio === '43') { W = Math.round(px * 4 / 3); }
    else if (ratio === 'card') { W = Math.round(px * 5 / 3); }
    else if (ratio === 'auto') { H = px + topSpace + bottomSpace; }

    let qx = Math.round((W - px) / 2);
    let qy = Math.round((H - px) / 2);
    if (ratio === 'auto') { qx = Math.round((W - px) / 2); qy = Math.round(topSpace); }

    const cvs = $('#qrCv', rootEl);
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });

    /* 1. 背景色 */
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    /* 2. 背景图（cover 铺满） */
    if (bgImg && isLogoReady(bgImg)) {
      const iw = bgImg.naturalWidth || bgImg.width, ih = bgImg.naturalHeight || bgImg.height;
      const sc = Math.max(W / iw, H / ih);
      const dw = iw * sc, dh = ih * sc;
      try { ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch (_) {}
      /* 二维码区域垫一块半透明白板，保证对比度（色值取 --qr-bg token） */
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = cssVar('--qr-bg', '#ffffff');
      ctx.beginPath();
      roundedPath(ctx, qx - QUIET * cell * 0.5, qy - QUIET * cell * 0.5, px + QUIET * cell, px + QUIET * cell, [cell * 2, cell * 2, cell * 2, cell * 2]);
      ctx.fill();
      ctx.restore();
    }
    /* 3. 色块（百分比坐标 → 像素） */
    blocks.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      roundedPath(ctx, W * b.x / 100, H * b.y / 100, W * b.w / 100, H * b.h / 100, [Math.min(W * b.w / 100, H * b.h / 100) * 0.18, 0, 0, 0]);
      ctx.fill();
    });
    /* 4. 二维码模块 */
    const fill = makeFill(ctx, W, H, opt);
    ctx.fillStyle = fill;
    const off = QUIET * cell;
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const finderCustom = finder !== 'follow';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!m.isDark(x, y)) continue;
        if (finderCustom && inFinder(x, y)) continue;
        /* follow：定位环内的模块永远按方块画 —— 定位图案是扫码器的定位基准，
           逐模块圆点/圆角化会把 7×7 环打散导致扫不出（实测 jsQR 解码失败）。 */
        const st = (!finderCustom && inFinder(x, y)) ? 'square' : modStyle;
        drawModule(ctx, qx + off + x * cell, qy + off + y * cell, cell, st);
      }
    }
    /* 5. 定位图案（自定义样式时单独画；follow 已由主循环按普通模块画出） */
    if (finderCustom) {
      ctx.save();
      ctx.translate(qx, qy);
      drawFinders(ctx, m, cell, off, fill, finder, modStyle);
      ctx.restore();
    }
    /* 6. Logo */
    if (opt.logo) {
      ctx.save();
      ctx.translate(qx, qy);
      drawLogo(ctx, px, logoImg);
      ctx.restore();
    }
    /* 7. 文字装饰 */
    const cs = getComputedStyle(document.documentElement);
    txtItems.forEach(t => {
      ctx.save();
      ctx.fillStyle = t.color;
      ctx.font = '600 ' + t.size + 'px ' + (FONT_CSS[t.font] || FONT_CSS.sys);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (t.pos === 'top') ctx.fillText(t.t, W / 2, topSpace / 2);
      else if (t.pos === 'bottom') ctx.fillText(t.t, W / 2, H - bottomSpace / 2);
      else if (t.pos === 'left') {
        ctx.translate(sideSpace / 2, H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(t.t, 0, 0);
      } else if (t.pos === 'right') {
        ctx.translate(W - sideSpace / 2, H / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(t.t, 0, 0);
      }
      ctx.restore();
    });

    $('#qrOut', rootEl).hidden = false;

    /* 提示：容错不足 > 前景过浅 > 自动放大 */
    const msgs = [];
    if (fgMode === 'gradient') {
      const l1 = luminance(opt.c1), l2 = luminance(opt.c2);
      if (l1 > 200 || l2 > 200) msgs.push('⚠️ 渐变中存在偏浅的颜色，建议深浅对比明显，否则可能扫不出');
    } else if (luminance(fg) > 200 && !bgImg) {
      msgs.push('⚠️ 前景色偏浅，建议前景深背景浅以保证扫描率');
    }
    if (px > size) msgs.push('为保证模块不小于 4px，码区已自动放大到 ' + px + 'px');
    showStat('✓ 已生成 ' + W + '×' + H + ' · 码区 ' + px + 'px（模块 ' + cell + 'px · 版本 ' + m.version + '） · ' +
      ecSel.value + ' 级容错' + (opt.logo ? ' · 含Logo' : '') + (bgImg ? ' · 含背景图' : '')
      + (msgs.length ? ' · ' + msgs.join(' · ') : ''), false);
  }

  /* ---------- 装饰列表编辑 ---------- */

  function renderBlocks() {
    const box = $('#qrBlocks', rootEl);
    if (!blocks.length) { box.innerHTML = '<p class="cd-note">还没有色块，点「添加色块」试试</p>'; return; }
    box.innerHTML = blocks.map((b, i) =>
      '<div class="qr-deco-row" data-i="' + i + '">' +
      '<label>X<input type="number" data-f="x" min="0" max="100" value="' + b.x + '"></label>' +
      '<label>Y<input type="number" data-f="y" min="0" max="100" value="' + b.y + '"></label>' +
      '<label>宽<input type="number" data-f="w" min="1" max="100" value="' + b.w + '"></label>' +
      '<label>高<input type="number" data-f="h" min="1" max="100" value="' + b.h + '"></label>' +
      '<input type="color" data-f="color" value="' + b.color + '" aria-label="色块颜色">' +
      '<button class="btn btn-ghost btn-sm" data-del="' + i + '" type="button">✕</button>' +
      '</div>').join('');
  }

  function renderTexts() {
    const box = $('#qrTexts', rootEl);
    if (!texts.length) { box.innerHTML = '<p class="cd-note">还没有文字，点「添加文字」试试</p>'; return; }
    box.innerHTML = texts.map((t, i) =>
      '<div class="qr-deco-text" data-i="' + i + '">' +
      '<input class="inp" type="text" data-f="t" maxlength="40" value="' + LB.dom.esc(t.t) + '" placeholder="文字内容" aria-label="文字内容">' +
      '<select class="inp" data-f="pos">' +
      ['top', 'bottom', 'left', 'right'].map(p => '<option value="' + p + '"' + (t.pos === p ? ' selected' : '') + '>' +
        ({ top: '上方', bottom: '下方', left: '左侧', right: '右侧' }[p]) + '</option>').join('') +
      '</select>' +
      '<select class="inp" data-f="font">' +
      Object.keys(FONT_CSS).map(f => '<option value="' + f + '"' + (t.font === f ? ' selected' : '') + '>' +
        ({ song: '宋体', hei: '黑体', kai: '楷体', sys: '系统' }[f]) + '</option>').join('') +
      '</select>' +
      '<input type="number" data-f="size" min="10" max="120" value="' + t.size + '" aria-label="字号">' +
      '<input type="color" data-f="color" value="' + t.color + '" aria-label="文字颜色">' +
      '<button class="btn btn-ghost btn-sm" data-del="' + i + '" type="button">✕</button>' +
      '</div>').join('');
  }

  function bindDeco(root) {
    $('#qrBlockAdd', root).addEventListener('click', () => {
      if (blocks.length >= 6) { LB.toast('色块最多 6 个', 'warn'); return; }
      /* 默认位置放底部中部：三个定位图案在角上，底部中部不会破坏定位与静区 */
      blocks.push({ x: 30, y: 92, w: 40, h: 6, color: cssVar('--brand1', '#4a5ae6') });
      renderBlocks();
    });
    $('#qrTextAdd', root).addEventListener('click', () => {
      if (texts.length >= 4) { LB.toast('文字最多 4 条', 'warn'); return; }
      texts.push({ t: '扫码了解更多', pos: 'bottom', size: 28, color: cssVar('--qr-fg', '#111111'), font: 'sys' });
      renderTexts();
    });
    const deco = $('#qrDeco', root);
    deco.addEventListener('input', e => {
      const el = e.target;
      const row = el.closest('[data-i]');
      if (!row || el.closest('[data-del]')) return;
      const i = +row.dataset.i;
      const f = el.dataset.f;
      if (!f) return;
      if (row.classList.contains('qr-deco-row')) {
        blocks[i][f] = f === 'color' ? el.value : Math.max(0, Math.min(100, +el.value || 0));
      } else {
        texts[i][f] = (f === 'size') ? Math.max(10, Math.min(120, +el.value || 28)) : el.value;
      }
    });
    deco.addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const row = del.closest('[data-i]');
      const i = +row.dataset.i;
      if (row.classList.contains('qr-deco-row')) blocks.splice(i, 1); else texts.splice(i, 1);
      renderBlocks(); renderTexts();
    });
  }

  /* ---------- 识别（沿用） ---------- */

  async function onFiles(files) {
    const f = files[0];
    if (!f) return;
    let img;
    try { img = await LB.img.load(f); }
    catch (e) { LB.toast(e.message || '图片解码失败', 'err'); return; }
    const { w, h } = LB.img.fitSize(img.naturalWidth, img.naturalHeight, 1600);
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    let text = '', engine = '';
    if ('BarcodeDetector' in window) {
      try {
        const codes = await new BarcodeDetector().detect(cvs);
        if (codes.length) { text = codes[0].rawValue; engine = 'BarcodeDetector'; }
      } catch (e) { /* 降级 jsQR */ }
    }
    if (!text && typeof jsQR === 'function') {
      const res = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
      if (res && res.data) { text = res.data; engine = 'jsQR'; }
    }

    $('#qrResult', rootEl).value = text;
    const link = $('#qrOpen', rootEl);
    link.hidden = !/^https?:\/\//i.test(text);
    if (!link.hidden) link.href = text;
    if (text) showStat('✓ 识别成功（' + engine + '）· ' + text.length + ' 字符', false);
    else showStat('⚠️ 未检测到二维码，请换一张更清晰的图片试试', true);
  }

  /* ---------- 视图 ---------- */

  const TYPE_CHIPS = [
    ['text', '📝 文本'], ['url', '🔗 网址'], ['wifi', '📶 WiFi'], ['vcard', '👤 名片'],
    ['tel', '📞 电话'], ['sms', '💬 短信'], ['mail', '✉️ 邮件']
  ];

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>二维码工具</h1><p>7 种类型生成 + 码点/定位美化 + 背景图/Logo/色块/文字装饰 · 全部本地完成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="qrTab">' +
      '<button class="seg-btn on" data-t="gen" type="button">生成二维码</button>' +
      '<button class="seg-btn" data-t="scan" type="button">识别二维码</button>' +
      '</div>' +
      '<div class="jst" id="qrStat" hidden></div>' +

      /* —— 生成面板 —— */
      '<div id="qrGen">' +
      '<div class="tool-sec"><span class="tool-lab">类型</span>' +
      '<div class="seg qr-types" id="qrMode">' +
      TYPE_CHIPS.map(t => '<button class="seg-btn' + (t[0] === 'text' ? ' on' : '') + '" data-m="' + t[0] + '" type="button">' + t[1] + '</button>').join('') +
      '</div></div>' +

      /* —— 类型表单 —— */
      '<div class="tool-sec">' +
      '<div id="qrF-text"><textarea class="inp" id="qrText" rows="4" placeholder="输入要生成二维码的文本…" spellcheck="false"></textarea></div>' +
      '<div id="qrF-url" hidden><input class="inp" id="qrUrl" type="text" inputmode="url" placeholder="example.com/path（可省略 https://）" autocomplete="off"></div>' +
      '<div id="qrF-wifi" hidden><div class="card set-card">' +
      '<div class="field"><label>WiFi 名称 (SSID)</label><input class="inp" id="qrSsid" type="text" placeholder="MyWiFi" autocomplete="off"></div>' +
      '<div class="field"><label>密码</label><input class="inp" id="qrPass" type="text" placeholder="WiFi 密码（开放网络可留空）" autocomplete="off"></div>' +
      '<div class="field"><label>加密方式</label><select class="inp" id="qrEnc">' +
      '<option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">开放网络（无密码）</option>' +
      '</select></div>' +
      '<label class="chk-row"><input type="checkbox" id="qrHidden"><span>隐藏网络（不广播 SSID）</span></label>' +
      '</div></div>' +
      '<div id="qrF-vcard" hidden><div class="card set-card">' +
      '<div class="field"><label>姓名 *</label><input class="inp" id="qrVName" type="text" autocomplete="off"></div>' +
      '<div class="field"><label>电话</label><input class="inp" id="qrVTel" type="tel" autocomplete="off"></div>' +
      '<div class="field"><label>公司</label><input class="inp" id="qrVOrg" type="text" autocomplete="off"></div>' +
      '<div class="field"><label>职位</label><input class="inp" id="qrVTitle" type="text" autocomplete="off"></div>' +
      '<div class="field"><label>邮箱</label><input class="inp" id="qrVEmail" type="email" autocomplete="off"></div>' +
      '<div class="field"><label>网址</label><input class="inp" id="qrVUrl" type="url" autocomplete="off"></div>' +
      '</div></div>' +
      '<div id="qrF-tel" hidden><input class="inp" id="qrTel" type="tel" placeholder="+8613800138000" autocomplete="off"></div>' +
      '<div id="qrF-sms" hidden><div class="card set-card">' +
      '<div class="field"><label>收信号码 *</label><input class="inp" id="qrSmsTel" type="tel" autocomplete="off"></div>' +
      '<div class="field"><label>短信内容</label><textarea class="inp" id="qrSmsBody" rows="2"></textarea></div>' +
      '</div></div>' +
      '<div id="qrF-mail" hidden><div class="card set-card">' +
      '<div class="field"><label>邮箱地址 *</label><input class="inp" id="qrMailTo" type="email" autocomplete="off"></div>' +
      '<div class="field"><label>主题</label><input class="inp" id="qrMailSub" type="text" autocomplete="off"></div>' +
      '<div class="field"><label>正文</label><textarea class="inp" id="qrMailBody" rows="2"></textarea></div>' +
      '</div></div>' +
      '</div>' +

      /* —— 画布与样式 —— */
      '<div class="tool-sec"><span class="tool-lab">画布与样式</span>' +
      '<div class="card set-card">' +
      '<div class="field"><label>画布比例</label><select class="inp" id="qrRatio">' +
      '<option value="auto" selected>自动（有上下文字时加高）</option>' +
      '<option value="square">正方形</option>' +
      '<option value="34">竖版 3:4</option>' +
      '<option value="43">横版 4:3</option>' +
      '<option value="card">名片 5:3</option>' +
      '</select></div>' +
      '<div class="field"><label>尺寸（码区）</label><select class="inp" id="qrSize">' +
      '<option value="400">400 × 400</option>' +
      '<option value="512" selected>512 × 512</option>' +
      '<option value="800">800 × 800</option>' +
      '<option value="1024">1024 × 1024</option>' +
      '</select></div>' +
      '<div class="field"><label>容错级别</label><select class="inp" id="qrEc">' +
      '<option value="L">L · 7% 可修复</option>' +
      '<option value="M" selected>M · 15% 可修复</option>' +
      '<option value="Q">Q · 25% 可修复</option>' +
      '<option value="H">H · 30% 可修复</option>' +
      '</select></div>' +
      '<div class="field"><label>码点样式</label><select class="inp" id="qrStyle">' +
      '<option value="square">方形</option>' +
      '<option value="round">圆角</option>' +
      '<option value="dot">圆点</option>' +
      '</select></div>' +
      '<div class="field"><label>定位图案（三个角）</label><select class="inp" id="qrFinder">' +
      '<option value="follow">跟随码点（定位环保持方块）</option>' +
      '<option value="round">圆角</option>' +
      '<option value="circle">圆形</option>' +
      '<option value="leaf">叶形</option>' +
      '</select></div>' +
      '<div class="field"><label>前景样式</label>' +
      '<div class="seg qr-fg-seg" id="qrFgStyle">' +
      '<button class="seg-btn on" data-fg="solid" type="button">单色</button>' +
      '<button class="seg-btn" data-fg="gradient" type="button">渐变</button>' +
      '</div></div>' +
      '<div class="field" id="qrFgField"><label>前景色</label><input type="color" id="qrFg" value="#111111" aria-label="前景色"></div>' +
      '<div class="field" id="qrGradField" hidden><label>渐变颜色 / 方向</label>' +
      '<span class="qr-grad-swatches">' +
      '<input type="color" id="qrC1" value="#4a5ae6" aria-label="渐变起始色">' +
      '<span class="qr-grad-arrow" aria-hidden="true">→</span>' +
      '<input type="color" id="qrC2" value="#7c3aed" aria-label="渐变结束色">' +
      '<select class="inp" id="qrGDir" aria-label="渐变方向">' +
      '<option value="diag" selected>↘ 对角</option><option value="h">→ 水平</option><option value="v">↓ 垂直</option>' +
      '</select></span></div>' +
      '<div class="field"><label>背景色</label><input type="color" id="qrBgColor" value="#ffffff" aria-label="背景色"></div>' +
      '</div></div>' +

      /* —— 装饰元素（Step 21 · 二：单列栅格 + 行内「说明在左、按钮在右」，
             按钮 flex:0 0 auto + white-space:nowrap，窄屏不再被压成竖排） —— */
      '<div class="tool-sec" id="qrDeco"><span class="tool-lab">装饰元素</span>' +
      '<div class="card set-card qr-decoration-grid">' +

      '<div class="qr-decoration-row">' +
      '<div class="qr-label">背景图（二维码下垫半透明白板保扫率）</div>' +
      '<button class="btn" id="qrBgPick" type="button">选择背景图</button>' +
      '<input type="file" id="qrBgFile" accept="image/*" hidden>' +
      '<span class="qr-logo-name" id="qrBgName">未设置</span>' +
      '<span class="qr-logo-tools" id="qrBgTools" hidden>' +
      '<button class="btn btn-ghost btn-sm" id="qrBgDel" type="button">✕ 移除背景</button>' +
      '</span></div>' +

      '<div class="qr-decoration-row">' +
      '<div class="qr-label">中心 Logo（自动 H 级容错，≤22%）</div>' +
      '<button class="btn" id="qrLogoPick" type="button">选择图片</button>' +
      '<input type="file" id="qrLogoFile" accept="image/*" hidden>' +
      '<span class="qr-logo-name" id="qrLogoName">未设置</span>' +
      '<span class="qr-logo-tools" id="qrLogoTools" hidden>' +
      '<img class="qr-logo-thumb" id="qrLogoThumb" alt="Logo 预览">' +
      '<button class="btn btn-ghost btn-sm" id="qrLogoDel" type="button">✕ 移除</button>' +
      '</span></div>' +

      '<div class="qr-decoration-row">' +
      '<div class="qr-label">色块（矩形装饰，渲染在二维码之下）</div>' +
      '<button class="btn" id="qrBlockAdd" type="button">＋ 添加色块</button>' +
      '</div>' +
      '<div class="qr-decoration-list" id="qrBlocks"></div>' +

      '<div class="qr-decoration-row">' +
      '<div class="qr-label">文字（可选，可添加多条）</div>' +
      '<button class="btn" id="qrTextAdd" type="button">＋ 添加文字</button>' +
      '</div>' +
      '<div class="qr-decoration-list" id="qrTexts"></div>' +

      '</div></div>' +

      '<div class="set-btns"><button class="btn btn-main js-primary-submit" id="qrGo" type="button">生成二维码</button></div>' +

      '<div class="tool-sec" id="qrOut" hidden><span class="tool-lab">预览</span>' +
      '<div class="qr-stage"><canvas id="qrCv" width="0" height="0" aria-label="二维码预览"></canvas></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="qrDlPng" type="button">⬇️ PNG</button>' +
      '<button class="btn btn-ghost" id="qrDlJpg" type="button">⬇️ JPG</button>' +
      '<button class="btn btn-ghost" id="qrDlSvg" type="button">⬇️ SVG</button>' +
      '</div></div>' +
      '</div>' +

      /* —— 识别面板 —— */
      '<div id="qrScan" hidden>' +
      '<div class="tool-sec"><span class="tool-lab">二维码图片</span>' +
      '<div class="dropzone" id="qrZone">点击选择、拖入二维码图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="qrFile" accept="image/*" hidden>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">识别结果</span>' +
      '<textarea class="inp mono" id="qrResult" rows="5" readonly placeholder="识别结果…"></textarea>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="qrCopy" type="button">复制结果</button>' +
      '<a class="btn btn-ghost" id="qrOpen" href="#" target="_blank" rel="noopener noreferrer" hidden>打开链接</a>' +
      '</div></div>' +
      '</div>' +
      '</div>'
    );
  }

  function setTab(t) {
    QR.tab = t;
    $$('#qrTab .seg-btn', rootEl).forEach(x => x.classList.toggle('on', x.dataset.t === t));
    $('#qrGen', rootEl).hidden = t !== 'gen';
    $('#qrScan', rootEl).hidden = t !== 'scan';
    $('#qrStat', rootEl).hidden = true;
  }

  function setType(m) {
    QR.type = m;
    $$('#qrMode .seg-btn', rootEl).forEach(x => x.classList.toggle('on', x.dataset.m === m));
    ['text', 'url', 'wifi', 'vcard', 'tel', 'sms', 'mail'].forEach(k => {
      const el = $('#qrF-' + k, rootEl);
      if (el) el.hidden = k !== m;
    });
  }

  function downloadCanvas(mime, ext) {
    const cvs = $('#qrCv', rootEl);
    if (!cvs || !cvs.width) { LB.toast('请先生成二维码', 'info'); return; }
    LB.img.toBlob(cvs, mime)
      .then(b => LB.img.download(b, 'qrcode.' + ext))
      .catch(() => LB.toast('导出失败', 'err'));
  }

  function downloadSvg() {
    const cvs = $('#qrCv', rootEl);
    if (!cvs || !cvs.width) { LB.toast('请先生成二维码', 'info'); return; }
    /* 画布栅格内嵌进 SVG（data URL）：任何查看器都能打开，装饰效果与预览完全一致 */
    let url;
    try { url = cvs.toDataURL('image/png'); }
    catch (e) { LB.toast('导出失败：画布被跨域图片污染', 'err'); return; }
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + cvs.width + '" height="' + cvs.height + '" viewBox="0 0 ' + cvs.width + ' ' + cvs.height + '">' +
      '<image width="' + cvs.width + '" height="' + cvs.height + '" xlink:href="' + url + '"/>' +
      '</svg>';
    LB.img.download(new Blob([svg], { type: 'image/svg+xml' }), 'qrcode.svg');
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#qrFg', root).value = cssVar('--qr-fg', '#111111');
    renderBlocks();
    renderTexts();

    $('#qrTab', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTab(b.dataset.t);
    });
    $('#qrMode', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setType(b.dataset.m);
    });
    $('#qrGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; compose(); });

    /* 背景图 */
    $('#qrBgPick', root).addEventListener('click', () => $('#qrBgFile', root).click());
    $('#qrBgFile', root).addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      LB.img.load(f).then(img => {
        bgImg = img;
        $('#qrBgName', root).textContent = f.name || '已选择';
        $('#qrBgTools', root).hidden = false;
        LB.toast('背景图已就绪', 'ok');
      }).catch(err => LB.toast(err.message || '图片解码失败', 'err'));
    });
    $('#qrBgDel', root).addEventListener('click', () => {
      bgImg = null;
      $('#qrBgName', root).textContent = '未设置';
      $('#qrBgTools', root).hidden = true;
      $('#qrBgFile', root).value = '';
      LB.toast('已移除背景图', 'ok');
    });

    /* Logo（沿用） */
    $('#qrLogoPick', root).addEventListener('click', () => $('#qrLogoFile', root).click());
    $('#qrLogoFile', root).addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      LB.img.load(f)
        .then(img => {
          logoImg = preprocessLogo(img);
          const nm = $('#qrLogoName', root);
          nm.textContent = f.name || '已选择';
          nm.classList.add('on');
          const thumb = $('#qrLogoThumb', root);
          try { thumb.src = logoImg.toDataURL('image/png'); } catch (_) { thumb.removeAttribute('src'); }
          $('#qrLogoTools', root).hidden = false;
          LB.toast('Logo 已就绪，生成时会自动用 H 级容错', 'ok');
        })
        .catch(err => LB.toast(err.message || '图片解码失败', 'err'));
    });
    $('#qrLogoDel', root).addEventListener('click', () => {
      if (!logoImg) { LB.toast('当前没有设置 Logo', 'info'); return; }
      logoImg = null;
      const nm = $('#qrLogoName', root);
      if (nm) { nm.textContent = '未设置'; nm.classList.remove('on'); }
      const tools = $('#qrLogoTools', root);
      if (tools) tools.hidden = true;
      const fi = $('#qrLogoFile', root);
      if (fi) fi.value = '';
      LB.toast('已移除 Logo', 'ok');
    });

    /* 前景样式切换 */
    $('#qrFgStyle', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#qrFgStyle .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      const grad = b.dataset.fg === 'gradient';
      $('#qrGradField', root).hidden = !grad;
      const fgField = $('#qrFgField', root);
      if (fgField) fgField.hidden = grad;
    });

    bindDeco(root);

    $('#qrDlPng', root).addEventListener('click', () => downloadCanvas('image/png', 'png'));
    $('#qrDlJpg', root).addEventListener('click', () => downloadCanvas('image/jpeg', 'jpg'));
    $('#qrDlSvg', root).addEventListener('click', downloadSvg);

    LB.img.bindDrop($('#qrZone', root), $('#qrFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    $('#qrCopy', root).addEventListener('click', () => {
      const t = $('#qrResult', rootEl).value;
      if (!t) { LB.toast('还没有识别结果', 'info'); return; }
      LB.copyNow(t, '识别结果已复制');   /* 红线：复制一律走 LB.copyNow */
    });

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    logoImg = null;
    bgImg = null;
    blocks = [];
    texts = [];
    rootEl = null;
  }

  LB.router.register('qr', { mount, unmount });
})();
