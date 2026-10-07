/* LiteBox v5 · tools/filemerge.js — 文本文件合并（TXT / MD / CSV 按顺序合并下载，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  /* 任务给定合并逻辑 */
  async function merge() {
    if (!alive || !rootEl) return;
    const input = $('#fmFile', rootEl);
    const stat = $('#fmStat', rootEl);
    const files = [...input.files];
    if (!files.length) { LB.toast('先选择 TXT / MD / CSV 文件', 'err'); return; }
    stat.textContent = '⏳ 正在读取…';
    const parts = [];
    for (const f of files) {
      const text = await f.text();
      parts.push('===== ' + f.name + ' =====\n' + text);
    }
    const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    LB.img.download(blob, 'LiteBox-merged.txt');
    stat.textContent = '✅ 已合并 ' + files.length + ' 个文件';
    LB.toast('合并完成', 'ok');
  }

  function syncCount() {
    const n = ($('#fmFile', rootEl).files || []).length;
    $('#fmStat', rootEl).textContent = n ? '已选择 ' + n + ' 个文件' : '选择文件后可合并';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card">' +
      '  <div class="dropzone fm-drop">' +
      '    <div class="fm-dz-ic">🧩</div>' +
      '    <div>点击或拖拽文本文件到这里（可多选）</div>' +
      '    <small>支持 .txt / .md / .csv</small>' +
      '    <button class="btn btn-ghost btn-sm fm-pick">选择文件</button>' +
      '  </div>' +
      '  <input type="file" id="fmFile" multiple accept=".txt,.md,.csv,text/plain" hidden>' +
      '  <div class="fm-btns"><button class="btn btn-main" id="fmGo">🧩 合并并下载</button></div>' +
      '  <div class="fm-stat" id="fmStat">选择文件后可合并</div>' +
      '  <p class="fm-note">按文件选择顺序合并，自动加文件标题。不上传，纯本地。</p>' +
      '</div>';

    const drop = $('.fm-drop', root);
    const input = $('#fmFile', root);
    drop.addEventListener('click', () => input.click());
    $('.fm-pick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', syncCount);
    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      /* 拖拽多文件：转存到 input（保持可重复点击合并） */
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        syncCount();
      }
    });
    $('#fmGo', root).addEventListener('click', merge);
  }

  function unmount() {
    alive = false;
    rootEl = null;
  }

  LB.router.register('filemerge', { mount, unmount });
})();
