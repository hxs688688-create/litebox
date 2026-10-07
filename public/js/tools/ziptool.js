/* LiteBox v5 · tools/ziptool.js — 压缩包工具（在线解压 / 压缩 ZIP，支持 AES-256 加密）
   Step 15 · B3。vendor/zip.js（@zip.js/zip.js 2.7.45，UMD，全局名 zip）按需加载。
   全部在本机浏览器完成，文件不上传。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  const ZIP_SRC = 'vendor/zip.min.js';
  const MAX_ENTRIES = 300;   /* 列表最多渲染条数，防止超大包卡顿 */

  let rootEl = null;
  let tab = 'un';

  let unFile = null;         /* 解压：选中的 zip */
  let unEntries = [];        /* [{ entry, name, size, date, encrypted }] */

  let zipFiles = [];         /* 压缩：待打包文件列表 */

  /* ---------- 依赖加载 ---------- */
  function loadZipJS() {
    if (window.zip) return Promise.resolve();
    if (!window.__lbZipPromise) {
      window.__lbZipPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = ZIP_SRC;
        s.onload = resolve;
        s.onerror = () => { window.__lbZipPromise = null; reject(new Error('压缩组件加载失败，请检查网络')); };
        document.head.appendChild(s);
      });
    }
    return window.__lbZipPromise;
  }

  const pad = n => String(n).padStart(2, '0');
  function fmtDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /* 去掉路径，避免下载文件名里带 / 被浏览器拒绝 */
  function baseName(p) {
    const s = String(p || '').replace(/\\/g, '/');
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  /* 本地版拖拽/点击绑定：LB.img.bindDrop 会把非 image/* 的文件全部过滤掉
     （它是给图片工具用的），压缩包工具要收任意类型文件，所以自己实现一份。 */
  function bindAnyDrop(zoneEl, inputEl, onFiles) {
    if (!zoneEl || !inputEl) return;
    zoneEl.addEventListener('click', () => inputEl.click());
    inputEl.addEventListener('change', () => {
      const files = Array.from(inputEl.files || []);
      inputEl.value = '';             /* 允许再次选择同一文件 */
      if (files.length) onFiles(files);
    });
    const onOver = e => { e.preventDefault(); zoneEl.classList.add('drag'); };
    zoneEl.addEventListener('dragover', onOver);
    zoneEl.addEventListener('dragenter', onOver);
    zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag'));
    zoneEl.addEventListener('drop', e => {
      e.preventDefault();
      zoneEl.classList.remove('drag');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) onFiles(files);
    });
  }

  /* zip.js 抛的是英文（Password required / File contains encrypted entry），
     统一翻成用户看得懂的中文提示 */
  function zipErrMsg(e, fallback) {
    const raw = String((e && e.message) || '');
    if (/password|encrypt/i.test(raw)) return '该压缩包已加密，请填写正确密码后重试';
    return fallback + '：' + (raw || '未知错误');
  }

  /* ================= 解压 ================= */

  function renderUnList() {
    const box = $('#ztUnList', rootEl);
    if (!unEntries.length) { box.innerHTML = ''; return; }
    const shown = unEntries.slice(0, MAX_ENTRIES);
    box.innerHTML = shown.map((it, i) =>
      '<div class="zt-row">' +
      '<span class="zt-ic" aria-hidden="true">' + (it.encrypted ? '🔒' : '📄') + '</span>' +
      '<span class="zt-info">' +
      '<b title="' + esc(it.name) + '">' + esc(it.name) + '</b>' +
      '<small>' + LB.dom.fmtSize(it.size) + ' · ' + esc(fmtDate(it.date)) + '</small>' +
      '</span>' +
      '<button class="btn btn-ghost btn-sm" data-un="' + i + '" type="button">下载</button>' +
      '</div>'
    ).join('') + (unEntries.length > MAX_ENTRIES
      ? '<p class="cd-note">共 ' + unEntries.length + ' 个文件，列表仅显示前 ' + MAX_ENTRIES + ' 个；「全部解压下载」会打包全部文件。</p>'
      : '');
  }

  async function readZip() {
    if (!unFile) return;
    const stat = $('#ztUnStat', rootEl);
    const btn = $('#ztUnGo', rootEl);
    const pwd = $('#ztUnPwd', rootEl).value;
    btn.disabled = true;
    stat.textContent = '⏳ 正在读取压缩包…';
    try {
      await loadZipJS();
      const reader = new zip.ZipReader(new zip.BlobReader(unFile), pwd ? { password: pwd } : undefined);
      const entries = await reader.getEntries();
      unEntries = entries
        .filter(e => !e.directory)
        .map(e => ({
          entry: e,
          name: e.filename,
          size: e.uncompressedSize || 0,
          date: e.lastModDate,
          encrypted: !!e.encrypted
        }));
      const dirs = entries.filter(e => e.directory).length;
      const enc = unEntries.filter(e => e.encrypted).length;
      if (!unEntries.length) {
        stat.textContent = '这个压缩包里没有文件' + (dirs ? '（只有 ' + dirs + ' 个空文件夹）' : '');
      } else {
        stat.textContent = '共 ' + unEntries.length + ' 个文件' + (dirs ? ' · ' + dirs + ' 个文件夹' : '') +
          (enc ? ' · ' + enc + ' 个已加密' : '') + (pwd ? ' · 已使用密码读取' : '');
      }
      renderUnList();
      
      /* 不主动 close：条目对象后续下载还要用；页面卸载时再释放 */
      rootEl._zipReader = reader;
    } catch (e) {
      unEntries = [];
      renderUnList();
      const msg = zipErrMsg(e, '压缩包读取失败');
      stat.textContent = '⚠️ ' + msg;
      LB.toast(msg, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function downloadEntry(idx) {
    const it = unEntries[idx];
    if (!it) return;
    const stat = $('#ztUnStat', rootEl);
    try {
      const blob = await it.entry.getData(new zip.BlobWriter());
      LB.img.download(blob, baseName(it.name) || 'file');
      stat.textContent = '已下载：' + baseName(it.name);
    } catch (e) {
      const msg = zipErrMsg(e, '解压失败');
      stat.textContent = '⚠️ ' + msg;
      LB.toast(msg, 'err');
    }
  }

  /* 「全部解压下载」直接下载原始 ZIP（Step 18）：重打包会丢目录层级、
     且带密码的包会被迫解密成明文包，直接下发原文件最稳。 */
  function downloadRaw() {
    if (!unFile) { LB.toast('请先选择 ZIP 压缩包', 'info'); return; }
    const stat = $('#ztUnStat', rootEl);
    LB.img.download(unFile, unFile.name);
    stat.textContent = '已开始下载原始压缩包：' + unFile.name;
  }

  /* ================= 压缩 ================= */

  function renderZipList() {
    const box = $('#ztZipList', rootEl);
    const n = $('#ztZipCount', rootEl);
    if (n) n.textContent = zipFiles.length ? '（' + zipFiles.length + ' 个）' : '';
    box.innerHTML = zipFiles.map((f, i) =>
      '<div class="pdf-row">' +
      '<span class="pdf-idx">' + (i + 1) + '</span>' +
      '<span class="pdf-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
      '<span class="pdf-acts"><span class="zt-size">' + LB.dom.fmtSize(f.size) + '</span>' +
      '<button class="btn btn-ghost btn-sm" data-zdel="' + i + '" type="button">✕</button></span>' +
      '</div>'
    ).join('');
  }

  function addZipFiles(files) {
    Array.from(files).forEach(f => zipFiles.push(f));
    renderZipList();
  }

  async function createZip() {
    if (!zipFiles.length) { LB.toast('请先选择要压缩的文件', 'info'); return; }
    const stat = $('#ztStat', rootEl);
    const btn = $('#ztGo', rootEl);
    const pwd = $('#ztPwd', rootEl).value;
    const level = parseInt($('#ztLevel', rootEl).value, 10) || 6;
    btn.disabled = true;
    stat.textContent = '⏳ 正在压缩…';
    try {
      await loadZipJS();
      const writer = new zip.ZipWriter(new zip.BlobWriter('application/zip'),
        pwd ? { password: pwd, encryptionStrength: 3 } : undefined);
      for (const f of zipFiles) {
        await writer.add(f.name, new zip.BlobReader(f), { level });
      }
      const blob = await writer.close();
      const name = 'LiteBox-' + Date.now() + '.zip';
      LB.img.download(blob, name);
      stat.textContent = '✅ 已生成 ' + name + ' · ' + LB.dom.fmtSize(blob.size) +
        ' · ' + zipFiles.length + ' 个文件' + (pwd ? ' · AES-256 加密' : ' · 未加密');
      LB.toast(pwd ? '加密 ZIP 已生成' : 'ZIP 已生成', 'ok');
    } catch (e) {
      const msg = '压缩失败：' + ((e && e.message) || '未知错误');
      stat.textContent = '⚠️ ' + msg;
      LB.toast(msg, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= 视图 ================= */

  function setTab(t) {
    tab = t;
    $$('.zt-tab', rootEl).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#ztUn', rootEl).hidden = t !== 'un';
    $('#ztZip', rootEl).hidden = t !== 'zip';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>压缩包工具</h1><p>在线解压 / 压缩 ZIP，支持 AES-256 加密，全部本机完成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2" id="ztTabs">' +
      '<button class="zt-tab on" data-tab="un" type="button">📂 解压 ZIP</button>' +
      '<button class="zt-tab" data-tab="zip" type="button">📦 压缩为 ZIP</button>' +
      '</div>' +

      /* —— 解压 —— */
      '<div class="card tool-sec set-card" id="ztUn">' +
      '<div class="dropzone" id="ztUnDrop">' +
      '<span class="pd-dz-ic">📂</span><b>选择或拖入 .zip 文件</b><small>支持加密压缩包（需输入密码）</small>' +
      '<input type="file" id="ztUnFile" accept=".zip,application/zip,application/x-zip-compressed" hidden />' +
      '</div>' +
      '<div class="pdf-form" id="ztUnCtl" hidden>' +
      '<label class="pz-lab pdf-wide">密码（未加密可留空）<input class="inp" id="ztUnPwd" type="text" autocomplete="off" spellcheck="false" placeholder="加密压缩包才需要填写" /></label>' +
      '</div>' +
      '<div class="pdf-btns" id="ztUnBtns" hidden>' +
      '<button class="btn btn-main" id="ztUnGo" type="button">📂 读取内容</button>' +
      '<button class="btn btn-ghost" id="ztUnAll" type="button">⬇️ 下载原始 ZIP</button>' +
      '</div>' +
      '<div class="pdf-stat" id="ztUnStat">上传 .zip 后即可查看内容</div>' +
      '<div class="zt-list" id="ztUnList"></div>' +
      '</div>' +

      /* —— 压缩 —— */
      '<div class="card tool-sec set-card" id="ztZip" hidden>' +
      '<div class="dropzone" id="ztZipDrop">' +
      '<span class="pd-dz-ic">📦</span><b>选择或拖入多个文件</b><small>可一次选中多个，打包成一个 ZIP</small>' +
      '<input type="file" id="ztZipFile" multiple hidden />' +
      '</div>' +
      '<span class="tool-lab">待压缩文件 <em id="ztZipCount" class="pdf-count"></em></span>' +
      '<div id="ztZipList" class="pdf-list"></div>' +
      '<div class="pdf-form">' +
      '<label class="pz-lab">压缩级别<select class="inp" id="ztLevel">' +
      '<option value="1">低（最快）</option><option value="6" selected>中（推荐）</option><option value="9">高（体积最小）</option>' +
      '</select></label>' +
      '<label class="pz-lab">密码（选填）<input class="inp" id="ztPwd" type="text" autocomplete="off" spellcheck="false" placeholder="留空 = 不加密" /></label>' +
      '</div>' +
      '<button class="btn btn-main" id="ztGo" type="button">📦 生成 ZIP</button>' +
      '<div class="pdf-stat" id="ztStat"></div>' +
      '</div>' +

      '<p class="cd-note">解压支持 ZIP（含 ZipCrypto / AES 加密，需填密码）；压缩可选择是否用 AES-256 加密，' +
      '加密后的 zip 用 Windows 自带解压、7-Zip、WinRAR 均可打开（需密码）。全部处理在本机浏览器完成。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    tab = 'un';
    unFile = null; unEntries = []; zipFiles = [];

    bindAnyDrop($('#ztUnDrop', root), $('#ztUnFile', root), files => {
      const f = files[0];
      if (!f) return;
      if (!/\.zip$/i.test(f.name) && !/zip/.test(f.type || '')) { LB.toast('请选择 .zip 压缩包', 'warn'); return; }
      unFile = f;
      unEntries = [];
      renderUnList();
      $('#ztUnCtl', root).hidden = false;
      $('#ztUnBtns', root).hidden = false;
      
      $('#ztUnStat', root).textContent = '已选择：' + f.name + '（' + LB.dom.fmtSize(f.size) + '），点「读取内容」';
    });

    bindAnyDrop($('#ztZipDrop', root), $('#ztZipFile', root), addZipFiles);

    $('#ztTabs', root).addEventListener('click', e => {
      const b = e.target.closest('.zt-tab');
      if (b) setTab(b.dataset.tab);
    });
    $('#ztUnGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; readZip(); });
    $('#ztUnAll', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; downloadRaw(); });
    $('#ztGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; createZip(); });

    $('#ztUnList', root).addEventListener('click', e => {
      const b = e.target.closest('[data-un]');
      if (b) downloadEntry(+b.dataset.un);
    });
    $('#ztZipList', root).addEventListener('click', e => {
      const b = e.target.closest('[data-zdel]');
      if (!b) return;
      zipFiles.splice(+b.dataset.zdel, 1);
      renderZipList();
    });

    renderZipList();
    /* 打开工具即后台预热 zip.js，用户点「读取内容」时不用等 */
    loadZipJS().catch(() => {});
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (rootEl && rootEl._zipReader) {
      try { rootEl._zipReader.close(); } catch (_) {}
      rootEl._zipReader = null;
    }
    unFile = null; unEntries = []; zipFiles = [];
    rootEl = null;
  }

  LB.router.register('ziptool', { mount, unmount });
})();
