/* LiteBox v5 · tools/ocr.js — OCR 文字识别（/api/ocr 图片识别 → 可编辑结果，复制 / 送入文本处理 / 导出 TXT）
 *
 * Step 12 · B3：
 *   1) 上传前先用 canvas 把最大边压到 1600px —— 原图动辄 4000px，
 *      视觉模型的输入会被内部缩放，太大的图不但更慢，识别率反而下降。
 *   2) 新增「识别语言」下拉（中文 / 英文 / 中英混合），语言会随请求发给后端决定 prompt。
 */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let ocrFile = null;      /* 已选择的图片 File（原始文件） */
  let ocrSend = null;      /* 实际发送的 File（压缩后的），没压缩时与 ocrFile 同一对象 */
  let ocrURL = '';         /* 预览用的 objectURL，切走时必须 revoke */
  let ocrOnPaste = null;   /* document 上的 paste 监听，unmount 时必须移除 */

  const MAX_MB = 20;       /* 原始文件上限放宽：上传前会压缩，8MB 的服务端限制针对压缩后的体积 */
  const MAX_SIDE = 1600;   /* 压缩目标：最大边 1600px */
  const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

  function extOk(name) {
    const i = name.lastIndexOf('.');
    if (i < 0) return false;
    return EXT_OK.indexOf(name.slice(i + 1).toLowerCase()) >= 0;
  }

  /* 压缩：最大边超过 MAX_SIDE 才重编码（小图直接原样发，避免无谓的画质损失）。
     PNG 截图转 JPEG 会丢透明通道，但 OCR 只关心文字，收益（体积）远大于损失。 */
  function shrink(file) {
    return LB.img.load(file).then(img => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return file;
      const sz = LB.img.fitSize(w, h, MAX_SIDE);
      if (sz.w === w && sz.h === h) return file;   /* 本来就不大 */

      const cv = document.createElement('canvas');
      cv.width = sz.w;
      cv.height = sz.h;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      /* 白底铺一层：JPEG 无透明通道，透明区域会变黑，黑底白字反而更难识别 */
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

  function pickFile(file) {
    if (!alive || !rootEl || !file) return;
    const okType = (file.type && file.type.indexOf('image/') === 0) || extOk(file.name);
    if (!okType) { LB.toast('请选择图片文件（JPG / PNG / WEBP 等）', 'err'); return; }
    if (file.size > MAX_MB * 1048576) { LB.toast('图片过大：请选择 ' + MAX_MB + 'MB 以内的图片', 'err'); return; }

    /* 换图时先回收上一次的 objectURL，避免内存泄漏 */
    if (ocrURL) { try { URL.revokeObjectURL(ocrURL); } catch (_) {} }
    ocrFile = file;
    ocrSend = file;
    ocrURL = URL.createObjectURL(file);

    $('#ocrPrev', rootEl).src = ocrURL;
    $('#ocrPrevBox', rootEl).hidden = false;
    $('#ocrFname', rootEl).textContent = file.name;
    $('#ocrFsize', rootEl).textContent = (file.type || 'image') + ' · ' + LB.img.fmtSize(file.size) + ' · 识别前自动压缩到 1600px';
    $('#ocrGo', rootEl).disabled = false;

    /* 后台先压好，点「开始识别」时就不用等 */
    shrink(file).then(out => {
      if (!alive || !rootEl || ocrFile !== file) return;
      ocrSend = out;
    });
    LB.toast('图片已选择', 'ok');
  }

  /* 图片识别（/api/ocr） */
  async function runOCR() {
    if (!alive || !rootEl) return;
    const btn = $('#ocrGo', rootEl);
    const stat = $('#ocrStat', rootEl);
    if (!ocrFile) { LB.toast('先选择一张图片', 'err'); return; }
    btn.disabled = true;
    stat.hidden = false;
    stat.textContent = '⏳ 正在识别图中文字，请稍候…';

    try {
      /* 压缩可能还在进行中，这里再等一次（已压好就是同一个 File，立即返回） */
      const send = ocrSend || await shrink(ocrFile);
      ocrSend = send;

      const fd = new FormData();
      fd.append('image', send);
      fd.append('lang', $('#ocrLang', rootEl).value || 'mix');

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000); /* 60 秒超时 */

      const r = await fetch('/api/ocr', {
        method: 'POST',
        body: fd,
        signal: ctrl.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);

      if (!r.ok) {
        let msg = 'OCR 服务返回 ' + r.status;
        try { const x = await r.json(); msg = (x.error && x.error.message) || msg; } catch (_) {}
        const e2 = new Error(msg);
        e2.status = r.status;
        throw e2;
      }

      const d = await r.json();
      const text = (d.text || '').trim();
      if (d.empty || !text) {
        $('#ocrOut', rootEl).value = '';
        stat.textContent = '🤔 没有在图片中识别到文字。可以换一张更清晰、字更大的图片再试。';
        LB.toast('未识别到文字', 'info');
        return;
      }
      $('#ocrOut', rootEl).value = text;
      stat.textContent = '✅ 识别完成，共 ' + text.length + ' 个字符。可直接编辑、复制或送入文本处理。';
      LB.toast('OCR 识别完成', 'ok');
    } catch (e) {
      let msg;
      if (e.name === 'AbortError') msg = '识别超时（60 秒），请换一张更小的图片';
      else if (e.status === 503) msg = 'OCR 服务未配置（服务端未启用 Workers AI）';
      else if (e.status === 429) msg = e.message;
      else msg = e.message || 'OCR 识别失败';
      stat.textContent = '❌ ' + msg;
      LB.toast('OCR 识别失败', 'err');
    } finally {
      if (alive && rootEl) btn.disabled = false;
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
    if ($('#ocrOut', rootEl)) $('#ocrOut', rootEl).value = '';
    if ($('#ocrStat', rootEl)) $('#ocrStat', rootEl).hidden = true;
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>OCR 文字识别</h1><p>拍照或上传图片，识别图中文字，可复制导出</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card">' +
      '  <div class="dropzone ocr-drop" id="ocrDrop">' +
      '    <div class="ocr-dz-ic">📝</div>' +
      '    <div class="ocr-fname" id="ocrFname">点击选择图片，或直接粘贴截图</div>' +
      '    <div class="ocr-fsize" id="ocrFsize"></div>' +
      '    <small>JPG / PNG / WEBP / BMP / GIF · 上传前自动压缩到 1600px · 支持 Ctrl+V 粘贴</small>' +
      '    <button class="btn btn-ghost btn-sm ocr-pick" id="ocrPick">选择图片</button>' +
      '  </div>' +
      '  <input type="file" id="ocrFile" accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif" hidden>' +
      '  <div class="ocr-prev-box" id="ocrPrevBox" hidden>' +
      '    <img class="ocr-prev" id="ocrPrev" alt="待识别的图片预览">' +
      '  </div>' +
      '  <div class="ocr-opts">' +
      '    <label class="ocr-opt">识别语言' +
      '      <select class="inp" id="ocrLang" aria-label="识别语言">' +
      '        <option value="mix" selected>中英混合</option>' +
      '        <option value="zh">中文</option>' +
      '        <option value="en">英文</option>' +
      '      </select>' +
      '    </label>' +
      '  </div>' +
      '  <div class="ocr-btns">' +
      '    <button class="btn btn-main js-primary-submit" id="ocrGo" disabled>✨ 开始识别</button>' +
      '    <button class="btn btn-ghost" id="ocrClear">清空</button>' +
      '  </div>' +
      '  <div class="ocr-stat" id="ocrStat" hidden></div>' +
      '  <textarea class="inp ocr-out" id="ocrOut" rows="10" placeholder="识别结果会显示在这里，可直接编辑"></textarea>' +
      '  <div class="ocr-foot">' +
      '    <button class="btn btn-ghost btn-sm" id="ocrCopy">📋 复制文字</button>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrToTc">🔀 送入文本处理</button>' +
      '    <button class="btn btn-ghost btn-sm" id="ocrTxt">⬇️ 导出 TXT</button>' +
      '  </div>' +
      '</div>' +
      '<p class="cd-note">识别在 Cloudflare Workers AI 上完成，图片会发送到该服务端点后立即丢弃，不落库、不留存。手写体、艺术字、低分辨率小字识别率有限，识别后建议人工校对。连续识别会消耗 Workers AI 免费额度。</p>' +
      '</div>';

    const drop = $('#ocrDrop', root);
    const input = $('#ocrFile', root);
    drop.addEventListener('click', () => input.click());
    $('#ocrPick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) pickFile(f);
    });
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
       监听挂在 document 上才能收到任意位置的粘贴。
       ★ 清理靠模块级 ocrOnPaste + unmount() 主动 removeEventListener：
         router 的卸载流程只调 mod.unmount()，没有「_cleanups 数组」这种约定
         （曾误以为有，实测 grep 全库只有本页自己写过），挂在 root 上不会被执行。 */
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

    /* Step 5I：复制必须同步执行，不能放在 await 之后（手势栈丢失） */
    $('#ocrCopy', root).addEventListener('click', () => {
      const el = $('#ocrOut', root);
      const t = el && el.value ? el.value : '';   /* 从 DOM 现读 */
      if (!t) { LB.toast('没有可复制的文字', 'err'); return; }
      LB.copyNow(t, '已复制');
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
    /* 移除 document级 paste 监听——挂在 document 上的监听不会随 host.innerHTML='' 消失，
       不主动移除会在反复进出工具后越堆越多，且会在别的工具页里误触发选图。 */
    if (ocrOnPaste) {
      document.removeEventListener('paste', ocrOnPaste);
      ocrOnPaste = null;
    }
    /* 释放图片 objectURL，避免内存泄漏 */
    if (ocrURL) { try { URL.revokeObjectURL(ocrURL); } catch (_) {} }
    ocrURL = '';
    ocrFile = null;
    rootEl = null;
  }

  LB.router.register('ocr', { mount, unmount });
})();
