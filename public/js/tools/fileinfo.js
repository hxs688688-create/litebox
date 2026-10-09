/* LiteBox v5 · tools/fileinfo.js — 文件信息（名称/大小/MIME/修改时间/图片尺寸，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;
  const objURLs = []; /* 追踪所有 objectURL，unmount 统一 revoke */

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  function card(label, value) {
    return '<div class="fi-card"><div class="fi-lab">' + label + '</div><div class="fi-val">' + value + '</div></div>';
  }

  function esc(s) {
    return LB.dom.esc(s);
  }

  function pickFile(file) {
    if (!alive || !rootEl || !file) return;
    const res = $('#fiRes', rootEl);
    const type = file.type || '';
    let html =
      card('文件名', esc(file.name)) +
      card('大小', fmtSize(file.size)) +
      card('MIME 类型', type ? esc(type) : '未知') +
      card('修改时间', new Date(file.lastModified).toLocaleString('zh-CN'));
    res.innerHTML = html;
    res.hidden = false;
    /* 图片：额外显示尺寸 */
    if (file.type && file.type.startsWith('image/')) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      objURLs.push(url);
      img.onload = () => {
        if (!alive) return;
        res.insertAdjacentHTML('beforeend', card('图片尺寸', img.naturalWidth + ' × ' + img.naturalHeight));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); };
      img.src = url;
    }
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card">' +
      '  <div class="dropzone fi-drop">' +
      '    <div class="fi-dz-ic">🗂️</div>' +
      '    <div>点击或拖拽文件到这里</div>' +
      '    <small>不上传不联网，信息仅在本机读取</small>' +
      '    <button class="btn btn-ghost btn-sm fi-pick">选择文件</button>' +
      '  </div>' +
      '  <input type="file" id="fiFile" hidden>' +
      '</div>' +
      '<div class="card fi-res" id="fiRes" hidden></div>';

    const drop = $('.fi-drop', root);
    const input = $('#fiFile', root);
    drop.addEventListener('click', () => input.click());
    $('.fi-pick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
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
  }

  function unmount() {
    alive = false;
    objURLs.forEach(u => URL.revokeObjectURL(u));
    objURLs.length = 0;
    rootEl = null;
  }

  LB.router.register('fileinfo', { mount, unmount });
})();
