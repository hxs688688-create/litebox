/* LiteBox v5 · tools/sheetbox.js — Excel 转换箱（XLSX/XLS 走 SheetJS 按需加载，CSV 走自研解析，JSON ⇄ CSV） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;
  let xlsxLoading = null; /* 并发加载去重：复用同一个 Promise */

  /* 确保 XLSX 已加载（任务给定；仅上传 xlsx/xls 或导出 CSV 时才加载） */
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = () => { xlsxLoading = null; resolve(); };
      s.onerror = () => {
        s.remove();
        xlsxLoading = null;
        reject(new Error('组件加载失败，请检查网络'));
      };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  /* 自研 CSV 解析（RFC 4180：双引号转义 / 逗号 / 换行；不依赖 XLSX） */
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQ = false;
        } else cell += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      if (row.length > 1 || row[0] !== '') rows.push(row);
    }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
      const o = {};
      head.forEach((h, i) => { o[h || ('列' + (i + 1))] = r[i] != null ? r[i] : ''; });
      return o;
    });
  }

  /* 文件 → JSON（任务给定流程；CSV 不加载 XLSX） */
  async function loadFile(file) {
    if (!alive || !rootEl) return;
    const stat = $('#sbStat', rootEl);
    const outTextarea = $('#sbOut', rootEl);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      stat.textContent = '⏳ 读取表格…';
      if (ext === 'csv' || file.type === 'text/csv') {
        const data = parseCsv(await file.text());
        outTextarea.value = JSON.stringify(data, null, 2);
        stat.textContent = '✅ Sheet1 · ' + data.length + ' 行';
      } else {
        await ensureXLSX();
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        outTextarea.value = JSON.stringify(data, null, 2);
        stat.textContent = '✅ ' + (wb.SheetNames[0] || 'Sheet1') + ' · ' + data.length + ' 行';
      }
      LB.toast('表格读取成功', 'ok');
    } catch (e) {
      stat.textContent = '❌ ' + e.message;
      LB.toast('表格读取失败', 'err');
    }
  }

  /* JSON → CSV 下载（任务给定流程，走 SheetJS） */
  async function jsonToCsv() {
    if (!alive || !rootEl) return;
    try {
      const arr = JSON.parse($('#sbIn', rootEl).value);
      if (!Array.isArray(arr) || !arr.length) throw new Error('请输入 JSON 数组');
      await ensureXLSX();
      const ws = XLSX.utils.json_to_sheet(arr);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, 'LiteBox-export.csv', { bookType: 'csv' });
    } catch (e) {
      LB.toast(e.message || '导出失败', 'err');
    }
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card">' +
      '  <div class="dropzone sb-drop">' +
      '    <div class="sb-dz-ic">📊</div>' +
      '    <div>点击或拖拽表格文件到这里</div>' +
      '    <small>XLSX / XLS / CSV · 首次解析 Excel 需联网加载组件，CSV 纯本地</small>' +
      '    <button class="btn btn-ghost btn-sm sb-pick">选择 Excel / CSV</button>' +
      '  </div>' +
      '  <input type="file" id="sbFile" accept=".xlsx,.xls,.csv" hidden>' +
      '  <div class="sb-stat" id="sbStat">选择文件后可转 JSON</div>' +
      '  <textarea class="inp sb-ta" id="sbOut" rows="14" readonly placeholder="表格转出的 JSON 数组会显示在这里"></textarea>' +
      '  <div class="sb-btns"><button class="btn btn-ghost btn-sm" id="sbCopy">📋 复制 JSON</button></div>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="sb-tit">JSON → CSV</h3>' +
      '  <p class="sb-note">粘贴 JSON 数组（对象字段作表头），导出 CSV 文件。</p>' +
      '  <textarea class="inp sb-ta" id="sbIn" rows="9" placeholder=\'[{"name":"张三","age":18}]\'></textarea>' +
      '  <div class="sb-btns"><button class="btn btn-main btn-sm" id="sbCsv">⬇️ JSON → CSV 下载</button></div>' +
      '</div>';

    const drop = $('.sb-drop', root);
    const input = $('#sbFile', root);
    drop.addEventListener('click', () => input.click());
    $('.sb-pick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) loadFile(f);
    });
    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });

    /* Step 5I：同步复制，去掉 async/await（手势不跨任务） */
    $('#sbCopy', root).addEventListener('click', () => {
      const el = $('#sbOut', root);
      const t = el && el.value ? el.value : '';   /* 从 DOM 现读 */
      if (!t) { LB.toast('没有可复制的 JSON', 'err'); return; }
      LB.copyNow(t, '已复制');
    });
    $('#sbCsv', root).addEventListener('click', jsonToCsv);
  }

  function unmount() {
    alive = false;
    /* 无 blob URL / 无定时器，无需特殊清理 */
    rootEl = null;
  }

  LB.router.register('sheetbox', { mount, unmount });
})();
