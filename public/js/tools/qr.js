/* LiteBox v5 · tools/qr.js — 二维码工具（生成 / 识别双 tab）
   生成：vendor/qrcode-generator（离线，typeNumber 自动）；识别：BarcodeDetector → vendor/jsQR 兜底 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */
  const QR = { tab: 'gen', mode: 'text' }; /* UI 状态：tab = gen|scan，mode = text|wifi */
  /* Step 6E：中心 Logo 的已解码图片（null = 未设置）。
     ★ 存HTMLImageElement 而非 File，避免每次生成都重新 FileReader 解码。 */
  let logoImg = null;

  /* WiFi 字段转义：\ ; , : " 前加反斜杠 */
  function wifiEscape(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }

  function buildWifiText() {
    const ssid = $('#qrSsid', rootEl).value;
    const pass = $('#qrPass', rootEl).value;
    const enc = $('#qrEnc', rootEl).value;
    const hidden = $('#qrHidden', rootEl).checked;
    if (!ssid.trim()) { LB.toast('请填写 WiFi 名称', 'warn'); return ''; }
    if (enc !== 'nopass' && !pass) { LB.toast('该加密方式需要填写密码', 'warn'); return ''; }
    let s = 'WIFI:T:' + enc + ';S:' + wifiEscape(ssid) + ';';
    if (enc !== 'nopass') s += 'P:' + wifiEscape(pass) + ';';
    if (hidden) s += 'H:true;';
    return s + ';'; /* 末尾单个终止分号：与各字段自带的分号组成规范要求的 ;; 收尾 */
  }

  /* 前景色亮度 0..255：过浅则与白底对比不足，给出提示 */
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

  /* ============ 生成 ============ */

  /* Step 6E：中心 Logo 叠加
     —— 在二维码正中盖一块白色圆角矩形，再把 logo 画上去。
     尺寸上限硬编码 22%：logo 过大会遮挡数据模块，扫码失败率急剧上升。
     内缩 8%（inner = logoSize * 0.84）留出白边，避免 logo 贴边显得拥挤。 */
  const LOGO_RATIO = 0.22;
  function drawLogo(ctx, size, img) {
    const logoSize = size * LOGO_RATIO;
    const cx = size / 2, cy = size / 2;
    const x = cx - logoSize / 2, y = cy - logoSize / 2;
    const r = logoSize * 0.18;

    /* 白底圆角矩形（四条arcTo 拼圆角，比 roundRect 兼容性更好） */
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + logoSize, y, x + logoSize, y + logoSize, r);
    ctx.arcTo(x + logoSize, y + logoSize, x, y + logoSize, r);
    ctx.arcTo(x, y + logoSize, x, y, r);
    ctx.arcTo(x, y, x + logoSize, y, r);
    ctx.closePath();
    ctx.fill();

    /* 画 logo（内缩 8%）；图片未加载完成时跳过，避免抛 InvalidStateError */
    if (!img || !img.complete || !img.naturalWidth) return;
    const inner = logoSize * 0.84;
    try {
      ctx.drawImage(img, cx - inner / 2, cy - inner / 2, inner, inner);
    } catch (_) { /* 跨域污染等异常时只留白底，不影响二维码本体 */ }
  }

  /* 圆点 + 渐变：把 fillStyle 从纯色换成 createLinearGradient 即可，
     绘制调用点不用改（任务书给的思路）。 */
  function makeFill(ctx, size, opt) {
    if (opt.fgStyle === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, opt.c1 || '#4a5ae6');
      g.addColorStop(1, opt.c2 || '#7c3aed');
      return g;
    }
    return opt.fg;
  }

  function drawQR(data, size, ec, style, fg, opt) {
    opt = opt || {};
    const q = qrcode(0, ec); /* typeNumber 0 = 自动版本 */
    q.addData(data, 'Byte');
    q.make();
    const n = q.getModuleCount();
    const QUIET = 4; /* 规范静区：四周各 4 模块 */
    const cell = size / (n + QUIET * 2);
    const cvs = $('#qrCv', rootEl);
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--qr-bg').trim() || '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = makeFill(ctx, size, { fgStyle: opt.fgStyle, c1: opt.c1, c2: opt.c2, fg: fg });
    const off = QUIET * cell;
    /* finder pattern：3 个角的 7×7 区域，圆点/圆角风格下也必须保持方块
       —— 定位图案是扫码器的定位基准，一旦被美化破坏就再也扫不出来。 */
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!q.isDark(x, y)) continue;
        if (style === 'dot' && !inFinder(x, y)) {
          /* 半径 0.55：相邻圆点轻微相融，保证扫码器采样率（0.46 以下 jsQR 解不出） */
          ctx.beginPath();
          ctx.arc(off + (x + 0.5) * cell, off + (y + 0.5) * cell, cell * 0.55, 0, Math.PI * 2);
          ctx.fill();
        } else if (style === 'round' && !inFinder(x, y)) {
          /* 圆角方块：半径取cell 的 30%，视觉上比纯方块柔和，扫码率与 dot 同级 */
          const px = off + x * cell, py = off + y * cell;
          const rr = cell * 0.3;
          ctx.beginPath();
          ctx.moveTo(px + rr, py);
          ctx.arcTo(px + cell, py, px + cell, py + cell, rr);
          ctx.arcTo(px + cell, py + cell, px, py + cell, rr);
          ctx.arcTo(px, py + cell, px, py, rr);
          ctx.arcTo(px, py, px + cell, py, rr);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(off + x * cell, off + y * cell, cell + 0.5, cell + 0.5);
        }
      }
    }

    /* logo 最后画：盖在模块之上 */
    if (opt.logo) drawLogo(ctx, size, logoImg);
  }

  function gen() {
    let data;
    if (QR.mode === 'wifi') {
      data = buildWifiText();
      if (!data) return;
    } else {
      data = $('#qrText', rootEl).value;
      if (!data.trim()) { LB.toast('请输入文本或链接', 'warn'); return; }
    }
    const size = parseInt($('#qrSize', rootEl).value, 10);
    const ecSel = $('#qrEc', rootEl);
    const fgStyle = $('#qrFgStyle .seg-btn.on', rootEl).dataset.fg || 'solid';
    const hasLogo = !!logoImg;

    /* ★ 有 logo 时必须把容错等级提到 H。
       H 级可修复 30%，而 logo 遮挡 + 圆点/圆角化会额外吃掉一部分容错余量；
       若用户当前选的是 L/M，H 级下限不足以兜住，扫码会失败。
       这里直接改 select 的值并给出说明，而不是只弹一次 toast——
       否则用户下次生成又会退回低容错。 */
    if (hasLogo && ecSel.value !== 'H') {
      ecSel.value = 'H';
      LB.toast('已加Logo，容错等级自动提升到 H（30% 可修复）以保证可扫描', 'info');
    }

    drawQR(data, size, ecSel.value, $('#qrStyle', rootEl).value, $('#qrFg', rootEl).value, {
      fgStyle: fgStyle,
      c1: $('#qrC1', rootEl).value,
      c2: $('#qrC2', rootEl).value,
      logo: hasLogo
    });
    $('#qrOut', rootEl).hidden = false;

    /* 提示优先级：容错不足 > 前景过浅 > 正常
       —— 渐变需要额外判断两端色的亮度：只要有一端过浅就可能扫不出。 */
    const msgs = [];
    if (fgStyle === 'gradient') {
      const l1 = luminance($('#qrC1', rootEl).value), l2 = luminance($('#qrC2', rootEl).value);
      if (l1 > 200 || l2 > 200) msgs.push('⚠️ 渐变中存在偏浅的颜色，建议深浅对比明显，否则可能扫不出');
    } else if (luminance($('#qrFg', rootEl).value) > 200) {
      msgs.push('⚠️ 前景色偏浅，建议前景深背景浅以保证扫描率');
    }
    showStat('✓ 已生成 · ' + size + 'px · ' + ecSel.value + ' 级容错' + (hasLogo ? ' · 含Logo' : '')
      + (msgs.length ? ' · ' + msgs.join(' · ') : ''), false);
  }

  /* ============ 识别 ============ */
  async function onFiles(files) {
    const f = files[0];
    if (!f) return;
    let img;
    try { img = await LB.img.load(f); }
    catch (e) { LB.toast(e.message || '图片解码失败', 'err'); return; }
    /* 识别前缩放到最大边 1600：太小扫不到，太大解码慢 */
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

  /* ============ 视图 ============ */
  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>二维码工具</h1><p>文本 / 链接 / WiFi 码生成，传图即解码 · 全部本地完成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="qrTab">' +
      '<button class="seg-btn on" data-t="gen" type="button">生成二维码</button>' +
      '<button class="seg-btn" data-t="scan" type="button">识别二维码</button>' +
      '</div>' +
      '<div class="jst" id="qrStat" hidden></div>' +

      /* —— 生成面板 —— */
      '<div id="qrGen">' +
      '<div class="seg" id="qrMode">' +
      '<button class="seg-btn on" data-m="text" type="button">文本 / 链接</button>' +
      '<button class="seg-btn" data-m="wifi" type="button">WiFi 分享</button>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<div id="qrTextWrap"><textarea class="inp" id="qrText" rows="5" placeholder="输入要生成二维码的文本或链接…" spellcheck="false"></textarea></div>' +
      '<div id="qrWifiWrap" hidden><div class="card set-card">' +
      '<div class="field"><label>WiFi 名称 (SSID)</label><input class="inp" id="qrSsid" type="text" placeholder="MyWiFi" autocomplete="off"></div>' +
      '<div class="field"><label>密码</label><input class="inp" id="qrPass" type="text" placeholder="WiFi 密码（开放网络可留空）" autocomplete="off"></div>' +
      '<div class="field"><label>加密方式</label><select class="inp" id="qrEnc">' +
      '<option value="WPA">WPA / WPA2</option>' +
      '<option value="WEP">WEP</option>' +
      '<option value="nopass">开放网络（无密码）</option>' +
      '</select></div>' +
      '<label class="chk-row"><input type="checkbox" id="qrHidden"><span>隐藏网络（不广播 SSID）</span></label>' +
      '</div></div>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">参数</span>' +
      '<div class="card set-card">' +
      '<div class="field"><label>容错等级</label><select class="inp" id="qrEc">' +
      '<option value="L">L · 7% 可修复</option>' +
      '<option value="M" selected>M · 15% 可修复</option>' +
      '<option value="Q">Q · 25% 可修复</option>' +
      '<option value="H">H · 30% 可修复</option>' +
      '</select></div>' +
      '<div class="field"><label>输出尺寸</label><select class="inp" id="qrSize">' +
      '<option value="256">256 × 256</option>' +
      '<option value="384" selected>384 × 384</option>' +
      '<option value="512">512 × 512</option>' +
      '</select></div>' +
      '<div class="field"><label>模块风格</label><select class="inp" id="qrStyle">' +
      '<option value="square">经典方块</option>' +
      '<option value="round">圆角方块</option>' +
      '<option value="dot">圆点</option>' +
      '</select></div>' +
      '<div class="field"><label>前景色</label><input type="color" id="qrFg" value="#111111" aria-label="前景色"></div>' +

      /* Step 6E：美化区 —— 中心 Logo + 渐变前景 */
      '<div class="field"><label>中心 Logo</label>' +
      '<button class="btn btn-ghost btn-sm" id="qrLogoPick" type="button">选择图片</button>' +
      '<input type="file" id="qrLogoFile" accept="image/*" hidden>' +
      '<span class="qr-logo-name" id="qrLogoName">未设置</span></div>' +
      '<div class="field"><label>前景样式</label>' +
      '<div class="seg qr-fg-seg" id="qrFgStyle">' +
      '<button class="seg-btn on" data-fg="solid" type="button">纯色</button>' +
      '<button class="seg-btn" data-fg="gradient" type="button">渐变</button>' +
      '</div></div>' +
      '<div class="field" id="qrGradField" hidden><label>渐变颜色</label>' +
      '<span class="qr-grad-swatches">' +
      '<input type="color" id="qrC1" value="#4a5ae6" aria-label="渐变起始色">' +
      '<span class="qr-grad-arrow" aria-hidden="true">→</span>' +
      '<input type="color" id="qrC2" value="#7c3aed" aria-label="渐变结束色">' +
      '</span></div>' +
      '<p class="cd-note qr-beauty-note">加 Logo 会自动把容错等级提到 H；Logo 不超过画布 22%，避免遮挡数据模块导致扫不出。</p>' +

      '<div class="set-btns"><button class="btn btn-main js-primary-submit" id="qrGo" type="button">立即生成</button></div>' +
      '</div></div>' +
      '<div class="tool-sec" id="qrOut" hidden><span class="tool-lab">预览</span>' +
      '<div class="qr-stage"><canvas id="qrCv" width="0" height="0" aria-label="二维码预览"></canvas></div>' +
      '<div class="set-btns"><button class="btn btn-main" id="qrDl" type="button">⬇️ 下载 PNG</button></div>' +
      '</div>' +
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

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#qrFg', root).value = getComputedStyle(document.documentElement).getPropertyValue('--qr-fg').trim() || '#111111';

    $('#qrTab', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTab(b.dataset.t);
    });
    $('#qrMode', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      QR.mode = b.dataset.m;
      $$('#qrMode .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      $('#qrTextWrap', root).hidden = QR.mode !== 'text';
      $('#qrWifiWrap', root).hidden = QR.mode !== 'wifi';
    });
    $('#qrGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; gen(); });

    /* Step 6E：中心 Logo 选择。
       用 LB.img.load 走统一的 FileReader 通道，拿到的是已解码的 HTMLImageElement，
       之后每次 gen 直接复用，不再重复解码。 */
    $('#qrLogoPick', root).addEventListener('click', () => $('#qrLogoFile', root).click());
    $('#qrLogoFile', root).addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      LB.img.load(f)
        .then(img => {
          logoImg = img;
          const nm = $('#qrLogoName', root);
          nm.textContent = f.name || '已选择';
          nm.classList.add('on');
          LB.toast('Logo 已就绪，生成时会自动用 H 级容错', 'ok');
          /* 选了 logo 就立刻出一版，用户不用再点「立即生成」才知道效果 */
          gen();
        })
        .catch(err => LB.toast(err.message || '图片解码失败', 'err'));
    });

    /* 前景样式：纯色 / 渐变。切到渐变时隐藏纯色取色器、反之亦然，
       避免两套控件同时出现让人不知道哪个生效。 */
    $('#qrFgStyle', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $$('#qrFgStyle .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      const grad = b.dataset.fg === 'gradient';
      $('#qrGradField', root).hidden = !grad;
      const fgField = $('#qrFg', root).closest('.field');
      if (fgField) fgField.hidden = grad;
      gen();
    });
    /* 渐变双色改动后实时重绘，让用户能立刻看到效果 */
    ['#qrC1', '#qrC2'].forEach(sel => {
      $(sel, root).addEventListener('input', () => { if (!$('#qrOut', root).hidden) gen(); });
    });

    $('#qrDl', root).addEventListener('click', () => {
      if (!$('#qrOut', root).hidden) {
        LB.img.toBlob($('#qrCv', root), 'image/png')
          .then(b => LB.img.download(b, 'qrcode.png'))
          .catch(() => LB.toast('导出失败', 'err'));
      }
    });

    LB.img.bindDrop($('#qrZone', root), $('#qrFile', root), onFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, onFiles));

    $('#qrCopy', root).addEventListener('click', () => {
      const t = $('#qrResult', root).value;
      if (!t) { LB.toast('还没有识别结果', 'info'); return; }
      LB.copyWithToast(t);
    });

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('qr', { mount, unmount });
})();
