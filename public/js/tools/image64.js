/* LiteBox v5 · tools/image64.js — 图片 ⇄ Base64 双向转换（本地处理） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;
  let pasteCleanups = [];   /* 粘贴监听取消函数列表（Step 5A bindPasteAll 统一收口） */

  function setTab(p) {
    const isT1 = p === 't1';
    $$('#b64Tab .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.p === p));
    /* display 切换，不重渲染 */
    $('#b64T1', rootEl).hidden = !isT1;
    $('#b64T2', rootEl).hidden = isT1;
  }

  function showT1(name, dataUrl, bytes) {
    const out = $('#b64Out', rootEl);
    out.value = dataUrl;
    $('#b64OutSec', rootEl).hidden = false;
    $('#b64Info', rootEl).textContent =
      name + ' · ' + LB.img.fmtSize(bytes) + ' 原图 → ' + LB.img.fmtSize(dataUrl.length) + ' Base64 文本';
  }

  /* 图片 → Base64：FileReader.readAsDataURL */
  function onFiles(files) {
    const f = files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => showT1(f.name || '图片', String(fr.result), f.size);
    fr.onerror = () => LB.toast('读取文件失败', 'err');
    fr.readAsDataURL(f);
  }

  /* Base64 → 图片：校验前缀 → atob → Uint8Array → Blob → 下载 */
  function decodeAndDownload() {
    const errEl = $('#b64Err', rootEl);
    const prev = $('#b64Prev', rootEl);
    errEl.hidden = true;
    const txt = $('#b64In', rootEl).value.trim();
    if (!txt) { LB.toast('请先粘贴 Base64 文本', 'info'); return; }
    if (!/^data:image\/\w+;base64,/.test(txt)) {
      errEl.textContent = '请粘贴以 data:image/ 开头的 Base64 文本，例如 data:image/png;base64,…';
      errEl.hidden = false;
      return;
    }
    const comma = txt.indexOf(',');
    const mime = txt.slice(5, txt.indexOf(';', 5)) || 'image/png';
    let bin;
    try {
      bin = atob(txt.slice(comma + 1));
    } catch (e) {
      errEl.textContent = 'Base64 内容无效，无法解码';
      errEl.hidden = false;
      return;
    }
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const ext = (mime.split('/')[1] || 'png').toLowerCase();
    LB.img.download(blob, 'image.' + ext);
    /* 预览（data URL 直接作为 img src，不产生 objectURL） */
    prev.src = txt;
    prev.hidden = false;
    LB.toast('已开始下载', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片 Base64</h1><p>图片转 Data URL 文本，或把 Base64 还原为图片下载，全部本地处理</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="b64Tab">' +
      '<button class="seg-btn on" data-p="t1" type="button">图片 → Base64</button>' +
      '<button class="seg-btn" data-p="t2" type="button">Base64 → 图片</button>' +
      '</div>' +
      '<div class="tool-sec" id="b64T1">' +
      '<div class="dropzone" id="b64Zone">点击选择、拖入图片，或直接 Ctrl+V 粘贴</div>' +
      '<input type="file" id="b64File" accept="image/*" hidden>' +
      '<div class="tool-sec" id="b64OutSec" hidden>' +
      '<span class="tool-lab">Data URL</span>' +
      '<textarea class="inp mono-area" id="b64Out" rows="7" readonly spellcheck="false"></textarea>' +
      '<div class="tip-dim" id="b64Info"></div>' +
      '<button class="btn btn-main" id="b64Copy" type="button">复制 Data URL</button>' +
      '</div>' +
      '</div>' +
      '<div class="tool-sec" id="b64T2" hidden>' +
      '<span class="tool-lab">粘贴 Data URL</span>' +
      '<textarea class="inp mono-area" id="b64In" rows="7" placeholder="data:image/png;base64,iVBORw0KGgo…" spellcheck="false"></textarea>' +
      '<button class="btn btn-main" id="b64Dl" type="button">下载图片</button>' +
      '<img id="b64Prev" class="b64-prev" alt="解码预览" hidden>' +
      '<div class="tip-err" id="b64Err" hidden></div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    LB.img.bindDrop($('#b64Zone', root), $('#b64File', root), onFiles);
    /* 粘贴图片文件：仅在"图片 → Base64"标签下处理 */
    pasteCleanups.push(LB.img.bindPasteAll(root, files => {
      if (!$('#b64T1', root).hidden) onFiles(files);
    }));

    $('#b64Tab', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTab(b.dataset.p);
    });
    $('#b64Copy', root).addEventListener('click', () => {
      const v = $('#b64Out', root).value;
      if (!v) { LB.toast('请先上传图片', 'info'); return; }
      LB.copyWithToast(v);
    });
    $('#b64Dl', root).addEventListener('click', decodeAndDownload);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    pasteCleanups.forEach(fn => fn()); pasteCleanups = [];
    rootEl = null;
  }

  LB.router.register('image64', { mount, unmount });
})();
