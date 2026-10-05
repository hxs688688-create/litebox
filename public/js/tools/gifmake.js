/* LiteBox v5 · tools/gifmake.js — GIF 制作（多图合成动图，帧率 / 尺寸 / 循环可调）
 *
 * 【为什么 gif.js 要连worker 一起引】
 *   gif.js 的编码工作在 Web Worker 里跑，主线程只负责丢帧。
 *   只引 gif.js 不引 gif.worker.js 的话，构造 GIF 时传 workerScript 会取不到文件，
 *   表现为「生成中卡住不动」—— 这是本工具最容易踩的坑，两个文件必须成对存在。
 *
 * 【循环次数：直接写进 GIF 文件头，不在播放端做】
 *   GIF 的 NETSCAPE2.0 应用扩展块里有个 2 字节的 loop count（0 = 无限循环），
 *   浏览器/看图软件读的就是它，所以「播 N 遍后停」必须写进文件本身，
 *   靠 <img> 直接放就能生效，不需要 canvas 逐帧模拟播放。
 *
 *   ★ 关于字节布局（这里踩过坑，记住）：
 *     块结构是 0x21 0xFF 0x0B "NETSCAPE2.0"(11字节) 0x03 0x01 <loop低> <loop高> 0x00
 *     若以 "NETSCAPE2.0" 首字节为偏移 at，则 loop 在 at+13 / at+14，at+15 是块结束符 0x00。
 *     误读成 at+14 / at+15 会拿到结束符和下一块的首字节，表现为「循环次数怎么都是 0」。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;
  let files = [];          /* File[]，按选择顺序 */
  let urls = [];           /* 预览缩略图 URL，需及时 revoke */
  let pasteCleanups = [];

  /* gif.js 懒加载：只有点了「生成」才加载，避免首屏多下一个脚本 */
  function loadGifJS() {
    if (window.GIF) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/gif.js';
      s.onload = () => (window.GIF ? resolve() : reject(new Error('GIF 组件加载失败')));
      s.onerror = () => reject(new Error('GIF 组件加载失败，请检查 vendor/gif.js'));
      document.head.appendChild(s);
    });
  }

  function revUrls() {
    urls.forEach(u => URL.revokeObjectURL(u));
    urls = [];
  }

  /* 尺寸下拉 → 实际宽高。value 为 0 表示「原尺寸（取第一张的宽）」 */
  function targetSize(img0) {
    const sel = $('#gmSize', rootEl).value;
    const natW = img0.naturalWidth || img0.width;
    const natH = img0.naturalHeight || img0.height;
    if (sel === '0') return { w: natW, h: natH, label: natW + '×' + natH };
    const w = parseInt(sel, 10);
    /* 等比缩放，不能只改宽 —— 那样会把图压变形 */
    const r = natH / natW;
    return { w: w, h: Math.max(1, Math.round(w * r)), label: w + '×' + Math.max(1, Math.round(w * r)) };
  }

  function renderThumbs() {
    revUrls();
    const box = $('#gmThumbs', rootEl);
    box.innerHTML = '';
    urls = files.map((f, i) => {
      const u = URL.createObjectURL(f);
      const w = document.createElement('div');
      w.className = 'gm-thumb';
      w.innerHTML = '<img src="' + u + '" alt="第' + (i + 1) + '帧"><span class="gm-tn">' + (i + 1) + '</span>' +
        '<button class="gm-del" type="button" data-i="' + i + '" aria-label="移除第' + (i + 1) + '帧">×</button>';
      box.appendChild(w);
      return u;
    });
    $('#gmCount', rootEl).textContent = files.length ? ('已选 ' + files.length + ' 张 · 顺序即播放顺序') : '';
    $('#gmGo', rootEl).disabled = files.length < 2;
    /* 少于2 张时提示，而不是让用户点了才报错 */
    $('#gmHint', rootEl).textContent = files.length < 2
      ? '至少选择 2 张图片才能合成 GIF（当前 ' + files.length + ' 张）'
      : '';
  }

  function addFiles(list) {
    const imgs = Array.from(list || []).filter(f => f && f.type && f.type.indexOf('image/') === 0);
    if (!imgs.length) { LB.toast('请选择图片文件', 'err'); return; }
    files = files.concat(imgs).slice(0, 60);   /* 上限 60 帧，再多浏览器会卡死 */
    if (files.length >= 60) LB.toast('最多 60 帧', 'info');
    renderThumbs();
  }

  function removeAt(i) {
    files.splice(i, 1);
    renderThumbs();
  }

  /* gif.js 的编码在 Web Worker 里跑，主线程只负责丢帧；
     循环次数已经写进 GIF 文件头（NETSCAPE2.0 块），<img> 直接放就按次数播完即停。 */
  let previewUrl = '';   /* 当前预览的 blob URL，unmount / 重新生成时释放 */

  async function makeGif() {
    if (files.length < 2) { LB.toast('至少选择 2 张图片', 'err'); return; }
    const btn = $('#gmGo', rootEl);
    btn.disabled = true;
    const stat = $('#gmStat', rootEl);
    const out = $('#gmOut', rootEl);
    out.hidden = true;

    try {
      stat.textContent = '正在加载 GIF 组件…';
      await loadGifJS();

      /* 先解码第一张取原始尺寸 */
      const first = await LB.img.load(files[0]);
      const sz = targetSize(first);
      const fps = parseInt($('#gmFps', rootEl).value, 10);
      const loopSel = $('#gmLoop', rootEl).value;   /* 0 无限 / 1 / 3 */
      const times = parseInt(loopSel, 10);

      stat.textContent = '正在解码 ' + files.length + ' 帧…';

      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: sz.w,
        height: sz.h,
        workerScript: 'vendor/gif.worker.js',   /* 必须与 gif.js 成对存在 */
        /* 循环次数写进 GIF 文件头的 NETSCAPE2.0 块（gif.worker.js 的 writeNetscapeExt）。
           0 = 无限循环，1 = 播1 遍，3 = 播 3 遍。
           经查证 gif.js 0.2.0 的 defaults 里就有 repeat:0，任务书示例把它写死成 0 是多余的。 */
        repeat: times
      });

      /* 把每张图画进统一尺寸的 canvas 再交给 gif 编码 */
      for (let i = 0; i < files.length; i++) {
        const img = await LB.img.load(files[i]);
        const cv = document.createElement('canvas');
        cv.width = sz.w; cv.height = sz.h;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        /* 铺满而非拉伸变形：等比居中裁切（cover） */
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const s = Math.max(sz.w / natW, sz.h / natH);
        const dw = natW * s, dh = natH * s;
        ctx.drawImage(img, (sz.w - dw) / 2, (sz.h - dh) / 2, dw, dh);
        gif.addFrame(ctx, { delay: 1000 / fps, copy: true });
        stat.textContent = '已准备 ' + (i + 1) + ' / ' + files.length + ' 帧…';
      }

      const result = await new Promise((resolve, reject) => {
        gif.on('progress', p => { stat.textContent = '生成中 ' + Math.round(p * 100) + '%'; });
        gif.on('finished', resolve);
        gif.on('abort', () => reject(new Error('生成已取消')));
        try { gif.render(); } catch (e) { reject(e); }
        setTimeout(() => reject(new Error('生成超时，请减少帧数或降低尺寸')), 90000);
      });

      stat.textContent = '已生成 · ' + LB.img.fmtSize(result.size) + ' · ' + sz.label +
        ' · ' + fps + 'fps · ' + files.length + ' 帧 · ' +
        (times > 0 ? ('播 ' + times + ' 遍后停') : '无限循环');
      out.hidden = false;
      /* 释放上一张预览的 URL，避免多次生成后泄漏 */
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (_) {} }
      previewUrl = URL.createObjectURL(result);
      $('#gmPreview', rootEl).src = previewUrl;

      LB.toast('GIF 生成完成', 'ok');
    } catch (e) {
      stat.textContent = '生成失败：' + (e && e.message ? e.message : '未知错误');
      LB.toast(stat.textContent, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  function download() {
    const src = $('#gmPreview', rootEl).src;
    if (!src) return;
    /* 直接把当前预览的 blob 存下来 */
    fetch(src).then(r => r.blob()).then(b => LB.img.download(b, 'litebox.gif'))
      .catch(() => LB.toast('下载失败', 'err'));
  }

  function clearAll() {
    files = [];
    renderThumbs();
    $('#gmOut', rootEl).hidden = true;
    $('#gmStat', rootEl).textContent = '';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>GIF 制作</h1><p>多张图片合成动图，帧率 / 尺寸 / 循环次数可调，纯本地生成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="dropzone" id="gmZone">点击选择多张图片（可继续追加），或拖入 / Ctrl+V 粘贴</div>' +
      '<input type="file" id="gmFile" accept="image/*" multiple hidden>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">已选帧 <span id="gmCount" class="gm-count"></span></span>' +
      '<div class="gm-thumbs" id="gmThumbs"></div>' +
      '<p class="cd-note" id="gmHint"></p>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">生成设置</span>' +
      '<div class="gm-grid">' +
      '<label class="gm-lab">帧率 <output id="gmFpsV">12</output> fps' +
      '<input type="range" id="gmFps" min="5" max="30" step="1" value="12"></label>' +
      '<label class="gm-lab">尺寸（宽）<select class="inp" id="gmSize">' +
      '<option value="480">480</option>' +
      '<option value="320">320</option>' +
      '<option value="240">240</option>' +
      '<option value="0" selected>原尺寸</option>' +
      '</select></label>' +
      '<label class="gm-lab">循环<select class="inp" id="gmLoop">' +
      '<option value="0" selected>无限循环</option>' +
      '<option value="1">播 1 遍后停</option>' +
      '<option value="3">播 3 遍后停</option>' +
      '</select></label>' +
      '</div>' +
      '<p class="cd-note">「播 N 遍后停」直接写入 GIF 文件头的 NETSCAPE2.0 循环字段，' +
      '下载下来的动图在任何播放器里都是播完即停，无需再设置。</p>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="gmGo" type="button" disabled>生成 GIF</button>' +
      '<button class="btn btn-ghost" id="gmClear" type="button">清空</button>' +
      '</div>' +
      '<p class="jst" id="gmStat"></p>' +
      '<div class="tool-sec" id="gmOut" hidden>' +
      '<span class="tool-lab">结果预览</span>' +
      '<div class="gm-result"><img id="gmPreview" alt="GIF 预览"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="gmDl" type="button">⬇ 下载 GIF</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">全部在浏览器本地合成，图片不会上传任何服务器。GIF 编码在 Web Worker 中进行，' +
      '帧数越多耗时越长（建议 30 帧以内）。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    files = []; revUrls();

    LB.img.bindDrop($('#gmZone', root), $('#gmFile', root), addFiles);
    pasteCleanups.push(LB.img.bindPasteAll(root, addFiles));

    $('#gmThumbs', root).addEventListener('click', e => {
      const b = e.target.closest('.gm-del');
      if (b) { removeAt(parseInt(b.dataset.i, 10)); return; }
    });
    $('#gmFps', root).addEventListener('input', e => { $('#gmFpsV', root).textContent = e.target.value; });
    $('#gmGo', root).addEventListener('click', makeGif);
    $('#gmClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));
    $('#gmDl', root).addEventListener('click', download);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (_) {} previewUrl = ''; }
    revUrls();
    files = [];
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('gifmake', { mount, unmount });
})();
