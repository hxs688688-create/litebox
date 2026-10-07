/* LiteBox v5 · tools/csvtab.js — CSV 表格预览（逐字符状态机解析，引号转义完整支持）
   Step 6B-5：首行是否为表头开关（#ctHeader）、分隔符选择（#ctDelim，含自动检测）
             新增「复制为 CSV」「复制为 Markdown」两个按钮
   Step 6B-6：支持从 litebox_csv_seed 读取 textscan 提取结果自动生成（挂载时回填并清种子） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const SEED_KEY = 'litebox_csv_seed';
  let rootEl = null;
  let lastRows = [];
  let lastDelim = ',';

  /* 分隔符选项：value 为实际字符，auto 表示自动检测 */
  const DELIMS = [
    { v: ',', n: '逗号 ,' },
    { v: ';', n: '分号 ;' },
    { v: '|', n: '竖线 |' },
    { v: '\t', n: '制表符 \\t' },
    { v: 'auto', n: '自动检测' }
  ];

  /* 自动检测：取首个非空行，统计各候选分隔符出现次数，取最多者（并列时按逗号优先的固定顺序） */
  function detectDelimiter(text) {
    const line = String(text || '').split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean)[0] || '';
    if (!line) return ',';
    let best = ',', bestN = 0;
    [',', ';', '|', '\t'].forEach(d => {
      const n = line.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    });
    return bestN > 0 ? best : ',';
  }

  function currentDelim() {
    const v = $('#ctDelim', rootEl) ? $('#ctDelim', rootEl).value : 'auto';
    return v === 'auto' ? detectDelimiter($('#ctIn', rootEl).value) : v;
  }

  /* CSV 解析：引号模式内 分隔符/换行 特殊处理；"" 转义；\r\n / \n / \r 行尾；跳过 BOM */
  function parseCSV(text, delim) {
    const D = delim || ',';
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); /* UTF-8 BOM */
    const rows = [];
    let row = [], cell = '', inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } /* "" → 字面双引号 */
          else inQuote = false;
        } else cell += c;
      } else if (c === '"') {
        inQuote = true;
      } else if (c === D) {
        row.push(cell); cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else {
        cell += c;
      }
    }
    /* 末尾无换行的最后一行 */
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function hasHeader() {
    const el = $('#ctHeader', rootEl);
    return el ? el.checked : true;
  }

  function render(rows) {
    const wrap = $('#ctOut', rootEl);
    if (!rows.length) { LB.toast('没有可解析的内容', 'info'); return; }
    const withHead = hasHeader();
    /* 无表头模式：首行也是数据，故整表都是 <td>；列数以首行长度为准 */
    const nCols = Math.max.apply(null, rows.map(r => r.length));
    const isNum = v => String(v).trim() !== '' && !isNaN(Number(v));
    const dataRows = withHead ? rows.slice(1) : rows;
    const headRow = withHead ? rows[0] : null;
    const numCols = [];
    for (let c = 0; c < nCols; c++) {
      numCols[c] = dataRows.length > 0 && dataRows.every(r => (r[c] === undefined) || isNum(r[c] || ''));
    }
    let html = '<table class="csv-table">';
    if (withHead) {
      html += '<thead><tr>';
      for (let c = 0; c < nCols; c++) html += '<th>' + esc(headRow[c] === undefined ? '' : headRow[c]) + '</th>';
      html += '</tr></thead>';
    }
    html += '<tbody>';
    dataRows.forEach(r => {
      html += '<tr>';
      for (let c = 0; c < nCols; c++) {
        const v = r[c] === undefined ? '' : r[c];
        const cls = numCols[c] && isNum(v) ? ' class="num"' : '';
        html += '<td' + cls + '>' + esc(v) + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    wrap.hidden = false;
  }

  function run() {
    const t = $('#ctIn', rootEl).value;
    if (!t.trim()) { LB.toast('请先粘贴 CSV 内容', 'info'); return; }
    lastDelim = currentDelim();
    lastRows = parseCSV(t, lastDelim);
    if (lastDelim !== ',') {
      $('#ctTip', rootEl).textContent = '当前按「' + delimName(lastDelim) + '」解析';
    } else {
      $('#ctTip', rootEl).textContent = '';
    }
    render(lastRows);
  }

  function delimName(d) {
    const hit = DELIMS.find(x => x.v === d);
    return hit ? hit.n.split(' ')[0] : d;
  }

  /* Markdown 生成：首行作表头（无表头模式则第一行数据提升为表头，避免空表头行） */
  function toMarkdown(rows) {
    if (!rows.length) return '';
    const nCols = Math.max.apply(null, rows.map(r => r.length));
    const withHead = hasHeader();
    const head = withHead ? rows[0] : rows[0];
    const body = withHead ? rows.slice(1) : rows.slice(1);
    const line = arr => '| ' + (function () {
      const out = [];
      for (let c = 0; c < nCols; c++) {
        const v = arr[c] === undefined ? '' : String(arr[c]).replace(/\|/g, '\\|');
        out.push(v);
      }
      return out.join(' | ');
    })() + ' |';
    const sep = '|' + new Array(nCols).fill(' --- ').join('|') + '|';
    return [line(head), sep].concat(body.map(line)).join('\n');
  }

  /* 转义回 CSV（字段含分隔符/引号/换行时加引号） */
  function toCSV(rows) {
    return rows.map(r => r.map(v => {
      const s = v === undefined ? '' : String(v);
      return /["\n\r]|,/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>CSV 表格预览</h1><p>引号转义完整支持，分隔符可选/自动识别，可导出 CSV / Markdown / JSON</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">CSV 内容</span>' +
      '<textarea class="inp mono" id="ctIn" rows="6" placeholder="a,b,c&#10;1,2,3" spellcheck="false"></textarea>' +
      '<div class="ct-opts">' +
      '<label class="chk-row"><input type="checkbox" id="ctHeader" checked /><span>首行为表头</span></label>' +
      '<label class="ct-delim"><span>分隔符</span>' +
      '<select class="inp" id="ctDelim">' +
      DELIMS.map(d => '<option value="' + esc(d.v) + '">' + d.n + '</option>').join('') +
      '</select></label>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="ctGo" type="button">📊 生成表格</button>' +
      '<button class="btn btn-ghost" id="ctCsv" type="button">📋 复制为 CSV</button>' +
      '<button class="btn btn-ghost" id="ctMd" type="button">📋 复制为 Markdown</button>' +
      '<button class="btn btn-ghost" id="ctJson" type="button">导出 JSON</button>' +
      '<button class="btn btn-ghost" id="ctDl" type="button">⬇️ 下载 CSV</button>' +
      '</div>' +
      '<p class="ct-tip" id="ctTip"></p>' +
      '</div>' +
      '<div class="csv-wrap" id="ctOut" hidden></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    lastRows = [];
    lastDelim = ',';

    $('#ctGo', root).addEventListener('click', run);
    /* 选项变化后若已有表格则立即重绘（表头开关 / 分隔符） */
    $('#ctHeader', root).addEventListener('change', () => { if (lastRows.length) render(lastRows); });
    $('#ctDelim', root).addEventListener('change', run);

    /* Step 6A 约束：复制必须同步调用，不能放在 await/.then/setTimeout 之后 */
    $('#ctCsv', root).addEventListener('click', () => {
      if (!lastRows.length) { LB.toast('请先生成表格', 'info'); return; }
      LB.copyNow(toCSV(lastRows), '已复制为 CSV，可直接粘到 Excel');
    });
    $('#ctMd', root).addEventListener('click', () => {
      if (!lastRows.length) { LB.toast('请先生成表格', 'info'); return; }
      const md = toMarkdown(lastRows);
      if (!md) { LB.toast('表格为空', 'info'); return; }
      LB.copyNow(md, '已复制 Markdown，粘到 Typora / Notion 即可渲染');
    });
    $('#ctJson', root).addEventListener('click', () => {
      if (!lastRows.length) { LB.toast('请先生成表格', 'info'); return; }
      /* 首行作键 → 对象数组（无表头模式也沿用首行作键，保证结构一致） */
      const head = lastRows[0];
      const objs = lastRows.slice(1).map(r => {
        const o = {};
        head.forEach((k, c) => { o[k || ('col' + (c + 1))] = r[c] === undefined ? '' : r[c]; });
        return o;
      });
      LB.copyWithToast(JSON.stringify(objs, null, 2), '已复制 JSON');
    });
    $('#ctDl', root).addEventListener('click', () => {
      const t = $('#ctIn', root).value;
      if (!t.trim()) { LB.toast('请先粘贴 CSV 内容', 'info'); return; }
      LB.img.download(new Blob([t], { type: 'text/csv;charset=utf-8' }), 'data.csv');
    });

    /* Step 6B-6：textscan「转入表格工具」会写入种子，挂载时回填 → 清种子 → 自动生成 */
    const seed = LB.storage.get(SEED_KEY, '');
    if (seed && String(seed).trim()) {
      $('#ctIn', root).value = String(seed);
      LB.storage.remove(SEED_KEY);
      LB.toast('已接收文本提取结果，正在生成表格', 'info');
      setTimeout(run, 0); /* 让 toast 先渲染，避免同帧竞争（不涉及复制，安全） */
    }

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; lastRows = []; lastDelim = ','; }

  LB.router.register('csvtab', { mount, unmount });
})();
