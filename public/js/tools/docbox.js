/* LiteBox v5 · tools/docbox.js — 文档转换箱（7 tab）
   EPUB→TXT / PDF→TXT / DOCX→TXT / HTML→TXT / MD→HTML / TXT→EPUB / CSV↔JSON
   vendor 按需加载：JSZip（tab1/6）、mammoth（tab3）、PDF.js+worker（tab2），均不进 index.html */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  let rootEl = null;
  let alive = false;
  const docTab = { current: 'epub' };
  /* 结果元信息，供下载/另存按钮使用。任务原文用 window.__docResultMeta 挂全局，
     违反"全局只挂 window.LB"铁律，改为模块内变量，逻辑不变 */
  let docResultMeta = null;
  let txtepubFile = null; /* Tab6 已上传的 TXT（点「下载 EPUB」时生成） */

  /* ================= 懒加载工具函数 ================= */

  async function loadJSZip() {
    if (window.JSZip) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jszip.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('ZIP 组件加载失败'));
      document.head.appendChild(s);
    });
  }

  async function loadMammoth() {
    if (window.mammoth) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/mammoth.browser.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('DOCX 组件加载失败'));
      document.head.appendChild(s);
    });
  }

  /* pdf.js 模块内的 loadPDFJS 为 IIFE 私有函数，无法跨文件复用，按任务原文重新实现一份 */
  async function loadPDFJS() {
    if (window.pdfjsLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('PDF 组件加载失败'));
      document.head.appendChild(s);
    });
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    }
  }

  /* ================= 结果展示（所有 tab 共用） ================= */

  function showResult(text, filename, mime = 'text/plain;charset=utf-8') {
    const out = $('#docResult', rootEl);
    out.hidden = false;
    out.value = text;
    /* 记录当前结果的元信息，供下载按钮使用 */
    docResultMeta = { text, filename, mime };
  }

  function downloadResult() {
    const m = docResultMeta;
    if (!m || !m.text) { LB.toast('没有可下载的结果', 'err'); return; }
    const blob = new Blob([m.text], { type: m.mime });
    LB.img.download(blob, m.filename);
  }

  /* 另存为：File System Access API，不支持或用户取消时友好提示 */
  async function saveResultAs() {
    const m = docResultMeta;
    if (!m || !m.text) { LB.toast('没有可保存的结果', 'err'); return; }
    if (!window.showSaveFilePicker) { LB.toast('当前浏览器不支持另存为，请用「下载结果」', 'warn'); return; }
    try {
      const ext = (m.filename.split('.').pop() || 'txt').toLowerCase();
      const handle = await window.showSaveFilePicker({
        suggestedName: m.filename,
        types: [{ description: 'LiteBox 文档', accept: { [m.mime.split(';')[0]]: ['.' + ext] } }]
      });
      const w = await handle.createWritable();
      await w.write(new Blob([m.text], { type: m.mime }));
      await w.close();
      LB.toast('已保存', 'ok');
    } catch (_) { /* 用户取消另存为对话框 */ }
  }

  /* ================= Tab 1 · EPUB → TXT ================= */

  async function epubToTxt(file) {
    const stat = $('#docEpubStat', rootEl);
    try {
      stat.textContent = '⏳ 正在解析 EPUB…';
      await loadJSZip();
      if (!alive) return;

      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      if (!alive) return;

      /* 1. 读 META-INF/container.xml 找到 rootfile 路径 */
      const containerXml = await zip.file('META-INF/container.xml').async('string');
      const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
      const rootfile = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
      if (!rootfile) throw new Error('无法读取 EPUB 目录');

      /* 2. 读 content.opf（.opf 文件）拿 manifest 和 spine */
      const opfXml = await zip.file(rootfile).async('string');
      const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

      /* manifest：id → href */
      const manifest = {};
      opfDoc.querySelectorAll('manifest item').forEach(item => {
        manifest[item.getAttribute('id')] = item.getAttribute('href');
      });

      /* 3. 处理相对路径（相对 .opf 文件所在目录） */
      const basePath = rootfile.slice(0, rootfile.lastIndexOf('/') + 1);
      function fixPath(p) {
        const parts = (basePath + decodeURIComponent(p)).split('/');
        const out = [];
        for (const x of parts) {
          if (!x || x === '.') continue;
          if (x === '..') out.pop();
          else out.push(x);
        }
        return out.join('/');
      }

      /* 4. 按 spine 顺序读每个章节 */
      const parts = [];
      for (const ref of opfDoc.querySelectorAll('spine itemref')) {
        const href = manifest[ref.getAttribute('idref')];
        if (!href) continue;
        const entry = zip.file(fixPath(href));
        if (!entry) continue;

        const html = await entry.async('string');
        if (!alive) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        /* 移除脚本和样式 */
        doc.querySelectorAll('script, style, noscript').forEach(n => n.remove());

        /* 用 innerText 优先（保留换行），退化到 textContent */
        const raw = (doc.body?.innerText || doc.body?.textContent || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (raw) parts.push(raw);
      }

      const text = parts.join('\n\n');
      if (!text) throw new Error('未提取到正文');

      const name = file.name.replace(/\.epub$/i, '.txt');
      showResult(text, name);
      stat.textContent = '✅ 已提取 ' + parts.length + ' 个章节';
      LB.toast('EPUB 转换完成', 'ok');
    } catch (e) {
      stat.textContent = '❌ ' + e.message;
      LB.toast('EPUB 转换失败', 'err');
    }
  }

  /* ================= Tab 2 · PDF → TXT ================= */

  async function pdfToTxt(file) {
    const stat = $('#docPdfStat', rootEl);
    try {
      stat.textContent = '⏳ 提取 PDF 文字…';
      await loadPDFJS();
      if (!alive) return;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      if (!alive) return;
      let out = '';
      let textLen = 0; /* 真实文字量（不含分隔结构），用于扫描版判断 */
      for (let i = 1; i <= pdf.numPages; i++) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        const pageText = tc.items.map(x => x.str).join(' ');
        textLen += pageText.replace(/\s/g, '').length;
        out += '\n\n===== 第 ' + i + ' 页 =====\n' + pageText;
      }
      const name = file.name.replace(/\.pdf$/i, '.txt');
      showResult(out.trim(), name);
      if (!textLen) {
        /* 验收要求：扫描版 PDF 无文字层时明确提示 */
        stat.textContent = '⚠️ 未提取到文字，扫描版 PDF 可能提取不到文字';
        LB.toast('扫描版 PDF 可能提取不到文字', 'warn');
      } else {
        stat.textContent = '✅ 已提取 ' + pdf.numPages + ' 页';
      }
    } catch (e) {
      stat.textContent = '❌ ' + e.message;
      LB.toast('PDF 转换失败', 'err');
    }
  }

  /* ================= Tab 3 · DOCX → TXT ================= */

  async function docxToTxt(file) {
    const stat = $('#docDocxStat', rootEl);
    try {
      stat.textContent = '⏳ 提取 DOCX 正文…';
      await loadMammoth();
      if (!alive) return;
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      if (!alive) return;
      const name = file.name.replace(/\.docx$/i, '.txt');
      showResult(result.value || '', name);
      stat.textContent = '✅ 已提取 DOCX 正文';
    } catch (e) {
      stat.textContent = '❌ ' + e.message;
      LB.toast('DOCX 转换失败', 'err');
    }
  }

  /* ================= Tab 4 · HTML → TXT ================= */

  function htmlToTxt(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach(n => n.remove());
    const text = (doc.body?.innerText || doc.body?.textContent || '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    showResult(text, 'converted.txt');
  }

  /* ================= Tab 5 · MD → HTML（自研轻量解析器） ================= */

  function mdToHtml(md) {
    const esc = LB.dom.esc;

    function inline(s) {
      s = esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }

    const lines = md.split('\n');
    let out = '';
    let i = 0;

    while (i < lines.length) {
      const L = lines[i];

      /* 代码块 */
      if (/^\s*```/.test(L)) {
        let code = '';
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { code += lines[i] + '\n'; i++; }
        i++;
        out += '<pre><code>' + esc(code) + '</code></pre>\n';
        continue;
      }

      /* 标题 */
      const hm = L.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        out += '<h' + hm[1].length + '>' + inline(hm[2]) + '</h' + hm[1].length + '>\n';
        i++; continue;
      }

      /* 引用 */
      if (/^\s*>/.test(L)) {
        let q = '';
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          q += lines[i].replace(/^\s*>\s?/, '') + '\n';
          i++;
        }
        out += '<blockquote>' + mdToHtml(q) + '</blockquote>\n';
        continue;
      }

      /* 无序列表 */
      if (/^\s*[\*\+-]\s+\S/.test(L)) {
        const items = [];
        while (i < lines.length && /^\s*[\*\+-]\s+\S/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[\*\+-]\s+/, ''));
          i++;
        }
        out += '<ul>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ul>\n';
        continue;
      }

      /* 有序列表 */
      if (/^\s*\d+[.)]\s+\S/.test(L)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+\S/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
          i++;
        }
        out += '<ol>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ol>\n';
        continue;
      }

      /* 分隔线 */
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(L)) {
        out += '<hr>\n';
        i++; continue;
      }

      /* 表格 */
      if (/^\s*\|.*\|/.test(L)) {
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        if (rows.length >= 2 && /^\s*\|[\s:|-]+\|\s*$/.test(rows[1])) {
          const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
          out += '<table>\n<thead><tr>' + cells(rows[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead>\n<tbody>\n';
          for (let k = 2; k < rows.length; k++) {
            out += '<tr>' + cells(rows[k]).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>\n';
          }
          out += '</tbody></table>\n';
        }
        continue;
      }

      /* 空行 */
      if (!L.trim()) { i++; continue; }

      /* 段落 */
      let para = '';
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*[\*\+-]\s+\S|\s*\d+[.)]\s|\s*\|)/.test(lines[i])) {
        para += lines[i] + '\n'; i++;
      }
      if (para) out += '<p>' + inline(para.trim()) + '</p>\n';
    }

    return out;
  }

  /* ================= Tab 6 · TXT → EPUB ================= */

  async function txtToEpub(file) {
    const stat = $('#docEpub6Stat', rootEl);
    try {
      stat.textContent = '⏳ 正在打包 EPUB…';
      await loadJSZip();
      if (!alive) return;

      const title = ($('#txt2epubName', rootEl).value.trim() || file.name.replace(/\.txt$/i, '') || 'LiteBox 文本').trim();
      const text = await file.text();

      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      /* 按空行分段，每段一个 <p>，段内换行变 <br> */
      const body = text
        .split(/\n{2,}/)
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => '<p>' + esc(x).replace(/\n/g, '<br/>') + '</p>')
        .join('');

      const uuid = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());

      const zip = new JSZip();

      /* 1. mimetype 必须是第一个文件，且无压缩 */
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      /* 2. META-INF/container.xml */
      zip.folder('META-INF').file('container.xml',
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
        '</container>'
      );

      /* 3. OEBPS/content.opf */
      const opf =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:identifier id="BookId">' + uuid + '</dc:identifier>' +
        '<dc:title>' + esc(title) + '</dc:title>' +
        '<dc:language>zh-CN</dc:language>' +
        '<meta property="dcterms:modified">' + new Date().toISOString().slice(0, 19) + 'Z</meta>' +
        '</metadata>' +
        '<manifest>' +
        '<item id="nav" properties="nav" href="nav.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>' +
        '</manifest>' +
        '<spine><itemref idref="c1"/></spine>' +
        '</package>';

      /* 4. OEBPS/chapter.xhtml */
      const chapter =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + esc(title) + '</title></head>' +
        '<body><h1>' + esc(title) + '</h1>' + body + '</body></html>';

      /* 5. OEBPS/nav.xhtml */
      const nav =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
        '<head><title>目录</title></head>' +
        '<body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">正文</a></li></ol></nav></body></html>';

      const oebps = zip.folder('OEBPS');
      oebps.file('content.opf', opf);
      oebps.file('chapter.xhtml', chapter);
      oebps.file('nav.xhtml', nav);

      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
      LB.img.download(blob, 'LiteBox-' + title.replace(/[\\/:*?"<>|]/g, '_') + '.epub');
      /* 状态附 blob 大小，对齐任务 UI「显示生成的 EPUB blob 信息」 */
      stat.textContent = '✅ EPUB 已生成（' + LB.dom.fmtSize(blob.size) + '），可导入阅读器';
      LB.toast('EPUB 生成完成', 'ok');
    } catch (e) {
      stat.textContent = '❌ ' + e.message;
      LB.toast('TXT 转 EPUB 失败', 'err');
    }
  }

  /* ================= Tab 7 · CSV ↔ JSON ================= */

  function parseCSV(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    const t = String(text).replace(/^\ufeff/, '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inQ) {
        if (ch === '"') {
          if (t[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }

  function csvToJson(csvText) {
    const rows = parseCSV(csvText);
    if (!rows.length) throw new Error('没有 CSV 内容');
    const head = rows[0].map(x => x.trim());
    const arr = rows.slice(1).filter(x => x.some(v => v !== '')).map(row => {
      const o = {};
      head.forEach((k, i) => { o[k] = row[i] == null ? '' : row[i]; });
      return o;
    });
    return JSON.stringify(arr, null, 2);
  }

  function jsonToCsv(jsonText) {
    const arr = JSON.parse(jsonText);
    if (!Array.isArray(arr) || !arr.length) throw new Error('请输入 JSON 数组');
    const keys = [...new Set(arr.flatMap(x => Object.keys(x || {})))];
    const qv = v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [keys.map(qv).join(',')];
    arr.forEach(o => lines.push(keys.map(k => qv(o[k])).join(',')));
    return lines.join('\n');
  }

  /* ================= 上传区绑定（click / dragover / drop） ================= */

  function bindDrop(dropId, inputId, handler) {
    const drop = $(dropId, rootEl);
    const input = $(inputId, rootEl);
    if (!drop || !input) return;
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files && input.files.length) handler(input.files); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files.length) handler(e.dataTransfer.files);
    });
  }

  /* ================= 页面结构 ================= */

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文档转换箱</h1><p>EPUB / PDF / DOCX 提取文字，Markdown / HTML / CSV 格式互转，全部在本机浏览器完成</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="doc-tabs" role="tablist">' +
      '<button type="button" class="doc-tab on" data-tab="epub">📚 EPUB → TXT</button>' +
      '<button type="button" class="doc-tab" data-tab="pdf">📄 PDF → TXT</button>' +
      '<button type="button" class="doc-tab" data-tab="docx">📘 DOCX → TXT</button>' +
      '<button type="button" class="doc-tab" data-tab="html">🌐 HTML → TXT</button>' +
      '<button type="button" class="doc-tab" data-tab="md">📝 MD → HTML</button>' +
      '<button type="button" class="doc-tab" data-tab="txtepub">📖 TXT → EPUB</button>' +
      '<button type="button" class="doc-tab" data-tab="csv">🔀 CSV ↔ JSON</button>' +
      '</div>' +

      /* —— Tab 1 EPUB → TXT —— */
      '<div class="doc-panel" data-panel="epub">' +
      '<div class="file-drop" id="docEpubDrop" role="button" tabindex="0">' +
      '<span class="pd-dz-ic">📚</span><b>选择或拖入 EPUB 电子书</b><small>按 spine 顺序提取全部章节文字</small>' +
      '<input type="file" id="docEpubFile" accept=".epub,application/epub+zip" hidden />' +
      '</div>' +
      '<p class="doc-stat" id="docEpubStat">等待文件</p>' +
      '</div>' +

      /* —— Tab 2 PDF → TXT —— */
      '<div class="doc-panel" data-panel="pdf" hidden>' +
      '<div class="file-drop" id="docPdfDrop" role="button" tabindex="0">' +
      '<span class="pd-dz-ic">📄</span><b>选择或拖入 PDF 文档</b><small>逐页提取文字层；扫描版 PDF 可能提取不到文字</small>' +
      '<input type="file" id="docPdfFile" accept=".pdf,application/pdf" hidden />' +
      '</div>' +
      '<p class="doc-stat" id="docPdfStat">等待文件</p>' +
      '</div>' +

      /* —— Tab 3 DOCX → TXT —— */
      '<div class="doc-panel" data-panel="docx" hidden>' +
      '<div class="file-drop" id="docDocxDrop" role="button" tabindex="0">' +
      '<span class="pd-dz-ic">📘</span><b>选择或拖入 DOCX 文档</b><small>提取纯文本正文，段落与表格内容保留</small>' +
      '<input type="file" id="docDocxFile" accept=".docx" hidden />' +
      '</div>' +
      '<p class="doc-stat" id="docDocxStat">等待文件</p>' +
      '</div>' +

      /* —— Tab 4 HTML → TXT —— */
      '<div class="doc-panel" data-panel="html" hidden>' +
      '<span class="tool-lab">粘贴 HTML 源码</span>' +
      '<textarea class="inp doc-src" id="htmlSrc" rows="12" placeholder="&lt;!doctype html&gt;&lt;html&gt;…"></textarea>' +
      '<div class="doc-acts"><button class="btn btn-main" id="htmlGo" type="button">🌐 提取 TXT</button></div>' +
      '</div>' +

      /* —— Tab 5 MD → HTML —— */
      '<div class="doc-panel" data-panel="md" hidden>' +
      '<span class="tool-lab">Markdown 源码</span>' +
      '<textarea class="inp doc-src" id="mdSrc" rows="12" placeholder="# 标题&#10;&#10;**加粗** 与 *斜体*&#10;&#10;- 列表项"></textarea>' +
      '<div class="doc-acts"><button class="btn btn-main" id="mdGo" type="button">📝 转换 HTML</button></div>' +
      '</div>' +

      /* —— Tab 6 TXT → EPUB —— */
      '<div class="doc-panel" data-panel="txtepub" hidden>' +
      '<div class="file-drop" id="docTxtDrop" role="button" tabindex="0">' +
      '<span class="pd-dz-ic">📖</span><b>选择或拖入 TXT 文本</b><small>按空行分段打包为 EPUB 3.0 电子书</small>' +
      '<input type="file" id="docTxtFile" accept=".txt,text/plain" hidden />' +
      '</div>' +
      '<span class="tool-lab">书名（留空则用文件名）</span>' +
      '<input class="inp" id="txt2epubName" type="text" placeholder="如：我的第一本书" maxlength="60" />' +
      '<p class="doc-stat" id="docEpub6Stat">等待文件</p>' +
      '<div class="doc-acts"><button class="btn btn-main" id="txtepubGo" type="button">⬇️ 下载 EPUB</button></div>' +
      '</div>' +

      /* —— Tab 7 CSV ↔ JSON —— */
      '<div class="doc-panel" data-panel="csv" hidden>' +
      '<span class="tool-lab">输入 CSV 或 JSON（首行为表头）</span>' +
      '<textarea class="inp doc-src" id="csvSrc" rows="12" placeholder="姓名,分数&#10;张三,90&#10;李四,85"></textarea>' +
      '<div class="doc-acts">' +
      '<button class="btn btn-main" id="csv2json" type="button">🔀 CSV → JSON</button>' +
      '<button class="btn btn-ghost" id="json2csv" type="button">🔀 JSON → CSV</button>' +
      '</div>' +
      '</div>' +

      /* —— 共用结果区 —— */
      '<div class="card doc-result">' +
      '<span class="tool-lab">转换结果</span>' +
      '<textarea id="docResult" readonly hidden placeholder="结果将显示在这里"></textarea>' +
      '<div class="doc-acts">' +
      '<button class="btn btn-ghost btn-sm" id="docCopy" type="button">📋 复制</button>' +
      '<button class="btn btn-main btn-sm" id="docDownload" type="button">⬇️ 下载结果</button>' +
      '<button class="btn btn-ghost btn-sm" id="docSaveAs" type="button">💾 另存为文件</button>' +
      '</div>' +
      '</div>' +

      '<p class="cd-note">所有转换均在本机浏览器完成，文件不会上传到任何服务器。</p>' +
      '</div>';
  }

  /* ================= Tab 切换（面板常驻，不清空结果） ================= */

  function setTab(id) {
    docTab.current = id;
    $$('.doc-tab', rootEl).forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    $$('.doc-panel', rootEl).forEach(p => { p.hidden = p.dataset.panel !== id; });
  }

  /* ================= mount / unmount ================= */

  function mount(root) {
    rootEl = root;
    alive = true;
    docResultMeta = null;
    root.innerHTML = html();

    $$('.doc-tab', rootEl).forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

    bindDrop('#docEpubDrop', '#docEpubFile', files => { const f = files[0]; if (f) epubToTxt(f); });
    bindDrop('#docPdfDrop', '#docPdfFile', files => { const f = files[0]; if (f) pdfToTxt(f); });
    bindDrop('#docDocxDrop', '#docDocxFile', files => { const f = files[0]; if (f) docxToTxt(f); });
    bindDrop('#docTxtDrop', '#docTxtFile', files => {
      const f = files[0];
      if (!f) return;
      if (!/\.txt$/i.test(f.name) && f.type !== 'text/plain') { LB.toast('请选择 TXT 文件', 'warn'); return; }
      txtepubFile = f;
      $('#txt2epubName', rootEl).value = '';
      $('#docEpub6Stat', rootEl).textContent = '📄 ' + f.name + '（' + LB.dom.fmtSize(f.size) + '）已就绪，点下方按钮生成';
    });

    $('#htmlGo', rootEl).addEventListener('click', () => {
      const v = $('#htmlSrc', rootEl).value;
      if (!v.trim()) { LB.toast('请先粘贴 HTML 源码', 'warn'); return; }
      htmlToTxt(v);
      LB.toast('提取完成', 'ok');
    });

    $('#mdGo', rootEl).addEventListener('click', () => {
      const src = $('#mdSrc', rootEl).value;
      if (!src.trim()) { LB.toast('请先输入 Markdown 源码', 'warn'); return; }
      const body = mdToHtml(src);
      const fullHtml = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>LiteBox</title>\n<style>body{font-family:-apple-system,"PingFang SC",sans-serif;max-width:760px;margin:2em auto;padding:0 20px;line-height:1.75;color:#1f2937}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}pre{background:#f3f4f6;padding:13px 15px;border-radius:8px;overflow:auto}blockquote{border-left:3px solid #4a5ae6;padding:8px 14px;background:#f8f9fc;margin:1em 0}table{border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:6px 11px}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>';
      showResult(fullHtml, 'converted.html', 'text/html;charset=utf-8');
      LB.toast('转换完成', 'ok');
    });

    $('#txtepubGo', rootEl).addEventListener('click', () => {
      if (!txtepubFile) { LB.toast('请先选择 TXT 文件', 'err'); return; }
      txtToEpub(txtepubFile);
    });

    $('#csv2json', rootEl).addEventListener('click', () => {
      try {
        const out = csvToJson($('#csvSrc', rootEl).value);
        showResult(out, 'converted.json', 'application/json;charset=utf-8');
        LB.toast('CSV 转 JSON 完成', 'ok');
      } catch (e) { LB.toast(e.message || '转换失败', 'err'); }
    });

    $('#json2csv', rootEl).addEventListener('click', () => {
      try {
        const out = jsonToCsv($('#csvSrc', rootEl).value);
        showResult(out, 'converted.csv', 'text/csv;charset=utf-8');
        LB.toast('JSON 转 CSV 完成', 'ok');
      } catch (e) { LB.toast(e.message || '转换失败', 'err'); }
    });

    /* Step 5I：复制必须是**同步动作**。
       -处理器不能是 async（async 函数体会引入await 语义，手势可能过期）
       - 内容直接从 DOM 现读，不用state 里的缓存
       - 调LB.copyNow（同步返回 boolean），失败会自动弹可长按的兜底框 */
    $('#docCopy', rootEl).addEventListener('click', () => {
      const box = $('#docResult', rootEl);
      const txt = box && box.value ? box.value : (docResultMeta && docResultMeta.text) || '';
      if (!txt) { LB.toast('没有可复制的结果', 'err'); return; }
      LB.copyNow(txt, '已复制到剪贴板');
    });
    $('#docDownload', rootEl).addEventListener('click', downloadResult);
    $('#docSaveAs', rootEl).addEventListener('click', saveResultAs);
  }

  function unmount() {
    alive = false;
    docResultMeta = null;
    txtepubFile = null;
    rootEl = null;
  }

  LB.router.register('docbox', { mount, unmount });
})();
