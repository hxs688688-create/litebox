/* LiteBox v5 · tools/ocr.js — OCR 文字识别（Step 32 · 三：云萌阁 POST 识别）
 *
 * Step 32 变更：
 *   1) 撤销 Step 31 的「浏览器本地 WASM（PaddleOCR + onnxruntime）」方案——
 *      vendor/paddleocr/ 整个目录已删除，本文件不再引用任何 onnxruntime / WASM / 模型加载。
 *      因此**首次识别不会再提示「加载识别模型」**，选图后即可直接识别。
 *   2) 流程：用户选图（相册 / 拍照 / 粘贴 / 拖拽）→ FileReader 转 Base64 →
 *      POST 同源 /api/ocr（body { file }），由后端转投云萌阁。前端零上游域名。
 *   3) 5MB 限制：超出即提示「图片过大，请压缩后重试」；识别前仍自动压缩到 1600px 以内
 *      （Base64 体积敏感，压缩能显著降低超时率）。
 *   4) 加载态用骨架屏（LB.ui.skeleton），结果区 = 全文文本框 + 分段列表，
 *      每段可单独复制（复制走 LB.copyNow 同步栈）。
 *   5) 网络请求统一走 LB.api.postJSON；错误文案严格三选一：
 *      Token 未配置 / 图片过大，请压缩后重试 / 识别失败，请换一张图试试。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  let rootEl = null;
  let alive = false;
  let seq = 0;

  let ocrFile = null;      /* 已选择的图片 File（原始文件） */
  let ocrSend = null;      /* 实际发送的 File（压缩后的），没压缩时与 ocrFile 同一对象 */
  let ocrURL = '';         /* 预览用的 objectURL，切走时必须 revoke */
  let ocrOnPaste = null;   /* document 上的 paste 监听，unmount 时必须移除 */
  let ocrResult = null;    /* { content, paragraphs } */

  const MAX_MB = 5;        /* spec：前端限制 5MB */
  const MAX_SIDE = 1600;   /* 压缩目标：最大边 1600px */
  const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

  function extOk(name) {
    const i = name.lastIndexOf('.');
    if (i < 0) return false;
    return EXT_OK.indexOf(name.slice(i + 1).toLowerCase()) >= 0;
  }

  /* 压缩：最大边超过 MAX_SIDE 才重编码（小图原样发，避免无谓的画质损失） */
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

  /* File → data:image/...;base64,xxx */
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('图片读取失败，请重新选择'));
      try { fr.readAsDataURL(file); } catch (_) { reject(new Error('图片读取失败，请重新选择')); }
    });
  }

  function stat(text, kind) {
    const el = $('#ocrStat', rootEl);
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'ocr-stat' + (kind ? ' ocr-stat-' + kind : '');
  }

  function pickFile(file) {
    if (!alive || !rootEl || !file) return;
    const okType = (file.type && file.type.indexOf('image/') === 0) || extOk(file.name);
    if (!okType) { LB.toast('请选择图片文件（JPG / PNG / WEBP 等）', 'err'); return; }
    /* spec：前端限制 5MB，超出提示统一文案 */
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

  function clearResult() {
    ocrResult = null;
    const out = $('#ocrOut', rootEl);
    if (out) out.value = '';
    const list = $('#ocrParas', rootEl);
    if (list) { list.innerHTML = ''; list.hidden = true; }
    const foot = $('#ocrFoot', rootEl);
    if (foot) foot.hidden = true;
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

  /* 图片识别（POST /api/ocr） */
  async function runOCR() {
    if (!alive || !rootEl) return;
    const btn = $('#ocrGo', rootEl);
    if (!ocrFile) { LB.toast('先选择一张图片', 'err'); return; }
    const my = ++seq;
    btn.disabled = true;
    stat('⏳ 正在识别图中文字，请稍候…');
    /* 加载态 = 骨架屏（Step 32：不再有「加载识别模型」进度条） */
    const loadEl = $('#ocrLoad', rootEl);
    loadEl.hidden = false;
    LB.ui.skeleton(loadEl, 4, 'list');
    clearResult();

    try {
      /* 压缩可能还在进行中，这里再等一次（已压好就是同一个 File，立即返回） */
      const send = ocrSend || await shrink(ocrFile);
      if (my !== seq) return;
      ocrSend = send;

      const dataUrl = await readAsDataUrl(send);
      if (my !== seq) return;
      if (send.size > MAX_MB * 1048576) {
        stat('图片过大，请压缩后重试', 'err');
        LB.toast('图片过大，请压缩后重试', 'err');
        return;
      }

      /* spec：网络请求走 LB.api.postJSON（OCR 上游慢，超时放宽到 30s） */
      const d = await LB.api.postJSON('/api/ocr', { file: dataUrl }, { timeout: 30000 });
      if (my !== seq) return;
      loadEl.hidden = true;

      /* 后端未配置 token 时回 { code:500, msg:'OCR 服务未配置' }（HTTP 503 会被 postJSON throw），
         这里两种形态都兜住 */
      if (d && d.code === 500) {
        stat('Token 未配置，请联系管理员', 'err');
        LB.toast('Token 未配置，请联系管理员', 'err');
        return;
      }

      const content = String((d && d.content) || '').trim();
      const paras = Array.isArray(d && d.paragraphs) ? d.paragraphs.filter(Boolean) : [];
      if (!content && !paras.length) {
        stat('没有在图片中识别到文字，可以换一张更清晰、字更大的图片再试。');
        LB.toast('未识别到文字', 'info');
        return;
      }
      ocrResult = { content: content || paras.join('\n'), paragraphs: paras };
      $('#ocrOut', rootEl).value = ocrResult.content;
      renderParas(paras);
      $('#ocrFoot', rootEl).hidden = false;
      stat('✅ 识别完成，共 ' + ocrResult.content.length + ' 个字符' + (paras.length ? ' · ' + paras.length + ' 段' : '') + '。可直接编辑、复制或送入文本处理。');
      LB.toast('OCR 识别完成', 'ok');
    } catch (e) {
      if (my !== seq) return;
      loadEl.hidden = true;
      const msg = (e && e.message) || '';
      /* 三种文案归一：Token 未配置 / 图片过大 / 识别失败 */
      if (/未配置/.test(msg)) stat('Token 未配置，请联系管理员', 'err');
      else if (/过大/.test(msg)) stat('图片过大，请压缩后重试', 'err');
      else if (/超时|AbortError/.test(msg)) stat('识别失败，请换一张图试试', 'err');
      else stat(msg || '识别失败，请换一张图试试', 'err');
      LB.toast('OCR 识别失败', 'err');
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
    const loadEl = $('#ocrLoad', rootEl);
    if (loadEl) loadEl.hidden = true;
    clearResult();
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>OCR 文字识别</h1><p>拍照或选图，识别图中文字，可分段复制导出</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card">' +
      '  <div class="dropzone ocr-drop" id="ocrDrop">' +
      '    <div class="ocr-dz-ic">📝</div>' +
      '    <div class="ocr-fname" id="ocrFname">点击选择图片，或直接粘贴截图</div>' +
      '    <div class="ocr-fsize" id="ocrFsize"></div>' +
      '    <small>JPG / PNG / WEBP · 5MB 以内 · 识别前自动压缩到 1600px</small>' +
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
      '  <div id="ocrLoad" hidden></div>' +
      '  <textarea class="inp ocr-out" id="ocrOut" rows="8" placeholder="识别结果会显示在这里，可直接编辑"></textarea>' +
      '  <div class="ocr-foot" id="ocrFoot" hidden>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrCopy" type="button">📋 复制全文</button>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrToTc" type="button">🔀 送入文本处理</button>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrTxt" type="button">⬇️ 导出 TXT</button>' +
      '  </div>' +
      '  <div class="ocr-paras" id="ocrParas" hidden></div>' +
      '</div>' +
      '<p class="cd-note">图片需先上传到识别服务完成解析，识别后建议人工校对。手写体、艺术字、低分辨率小字识别率有限。</p>' +
      '</div>';

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
  }

  LB.router.register('ocr', { mount, unmount });
})();
