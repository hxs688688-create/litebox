/* LiteBox v5 · tools/subtitle.js — 字幕互转（Step 20 · A4 新增工具）
 *
 * 【格式】SRT / WebVTT / LRC / ASS 两两转换，统一中间格式 cues = [{start,end,text}]。
 *
 * 【编码】读取：BOM 识别（UTF-8 / UTF-16LE / UTF-16BE）→ jschardet 检测 →
 *   严格 UTF-8 试解码兜底（失败即按 GBK 解，覆盖 GB2312/GBK/GB18030 常见字幕）。
 *   写出：UTF-8 / UTF-8 BOM / GBK——TextEncoder 只支持 UTF-8（规范如此），
 *   选 GBK 时自动降级为 UTF-8 BOM 并提示（BOM 头可让绝大多数播放器正确识别）。
 *
 * 【批量】多文件统一输出格式，JSZip 按需加载（vendor/jszip.min.js）打包下载。
 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  let rootEl = null;
  let alive = false;
  let curText = '';        /* 当前单文件解码后的文本 */
  let curName = '';        /* 当前单文件名（去扩展名） */
  let curFmt = '';         /* 识别出的格式 srt|vtt|lrc|ass */
  let batchFiles = [];

  /* ================= 编码识别与解码 ================= */

  function detectDecode(buf) {
    const bytes = new Uint8Array(buf);
    /* 1. BOM */
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { text: new TextDecoder('utf-8').decode(buf.slice(3)), enc: 'UTF-8 BOM' };
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { text: new TextDecoder('utf-16le').decode(buf.slice(2)), enc: 'UTF-16LE' };
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { text: new TextDecoder('utf-16be').decode(buf.slice(2)), enc: 'UTF-16BE' };
    }
    /* 2. jschardet（vendor 全局） */
    let enc = '';
    try {
      if (typeof jschardet !== 'undefined' && jschardet.detect) {
        const det = jschardet.detect(bytes);
        if (det && det.encoding) enc = String(det.encoding);
      }
    } catch (_) { /* 检测失败走兜底 */ }
    if (/utf-?16(le|be)?/i.test(enc) && !/le|be/i.test(enc)) enc = 'utf-16le';
    if (/utf-?16le/i.test(enc)) return { text: new TextDecoder('utf-16le').decode(buf), enc: 'UTF-16LE' };
    if (/utf-?16be/i.test(enc)) return { text: new TextDecoder('utf-16be').decode(buf), enc: 'UTF-16BE' };
    if (/big5/i.test(enc)) return { text: new TextDecoder('big5', { fatal: false }).decode(buf), enc: 'Big5' };
    if (/gb/i.test(enc)) return { text: new TextDecoder('gbk', { fatal: false }).decode(buf), enc: 'GBK' };
    if (/utf-?8|ascii|iso-8859/i.test(enc)) {
      /* jschardet 认为是 UTF-8/ASCII：严格解码验证一次，失败按 GBK */
      try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'UTF-8' };
      } catch (_) {
        return { text: new TextDecoder('gbk', { fatal: false }).decode(buf), enc: 'GBK' };
      }
    }
    /* 3. 兜底：严格 UTF-8 试解码，失败按 GBK */
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'UTF-8' };
    } catch (_) {
      return { text: new TextDecoder('gbk', { fatal: false }).decode(buf), enc: 'GBK(兜底)' };
    }
  }

  /* GBK 写出：TextEncoder 只支持 UTF-8（规范限制），降级为带 BOM 的 UTF-8 */
  function encodeOut(text, enc) {
    if (enc === 'bom') {
      return new TextEncoder().encode('\uFEFF' + text);
    }
    if (enc === 'gbk') {
      return new TextEncoder().encode('\uFEFF' + text);   /* 降级：BOM 头帮助播放器识别 */
    }
    return new TextEncoder().encode(text);
  }

  /* ================= 时间工具 ================= */

  function toMs(h, m, s, ms) { return ((+h * 60 + +m) * 60 + +s) * 1000 + +ms; }

  function pad(n, w) { n = String(Math.floor(n)); while (n.length < w) n = '0' + n; return n; }

  function msToSRT(t) {
    t = Math.max(0, Math.round(t));
    const ms = t % 1000, s = Math.floor(t / 1000) % 60, m = Math.floor(t / 60000) % 60, h = Math.floor(t / 3600000);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + ',' + pad(ms, 3);
  }
  function msToVTT(t) {
    return msToSRT(t).replace(',', '.');
  }
  function msToASSTime(t) {
    t = Math.max(0, Math.round(t));
    const cs = Math.floor(t / 10) % 100, s = Math.floor(t / 1000) % 60, m = Math.floor(t / 60000) % 60, h = Math.floor(t / 3600000);
    return h + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(cs, 2);
  }
  function msToLRC(t) {
    t = Math.max(0, Math.round(t));
    const cs = Math.floor(t / 10) % 100, s = Math.floor(t / 1000) % 60, m = Math.floor(t / 60000);
    return pad(m, 2) + ':' + pad(s, 2) + '.' + pad(cs, 2);
  }

  /* ================= 解析（→ cues） ================= */

  function parseSRT(text) {
    const cues = [];
    text.replace(/\r/g, '').trim().split(/\n\s*\n/).forEach(block => {
      const lines = block.split('\n').filter(l => l.trim() !== '' || true);
      const ti = lines.findIndex(l => l.indexOf('-->') > -1);
      if (ti === -1) return;
      const m = lines[ti].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
      if (!m) return;
      const body = lines.slice(ti + 1).join('\n').trim();
      if (!body) return;
      cues.push({ start: toMs(m[1], m[2], m[3], pad(m[4], 3)), end: toMs(m[5], m[6], m[7], pad(m[8], 3)), text: body });
    });
    return cues;
  }

  function parseVTT(text) {
    /* 去掉 WEBVTT 头与 NOTE / STYLE / REGION 块 */
    const cleaned = text.replace(/\r/g, '').split(/\n\s*\n/).filter(b => {
      const t = b.trim();
      if (!t) return false;
      if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(t)) return false;
      return true;
    });
    const cues = [];
    cleaned.forEach(block => {
      const lines = block.split('\n');
      const ti = lines.findIndex(l => l.indexOf('-->') > -1);
      if (ti === -1) return;
      const m = lines[ti].match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/)
        || lines[ti].match(/(\d{1,2}):(\d{2})\.(\d{3})\s*-->\s*(\d{1,2}):(\d{2})\.(\d{3})/);
      if (!m) return;
      let st, en, body;
      if (m.length === 9) {
        st = toMs(m[1], m[2], m[3], m[4]); en = toMs(m[5], m[6], m[7], m[8]);
        body = lines.slice(ti + 1).join('\n').trim();
      } else {
        st = toMs(0, m[1], m[2], m[3]); en = toMs(0, m[4], m[5], m[6]);
        body = lines.slice(ti + 1).join('\n').trim();
      }
      if (!body) return;
      cues.push({ start: st, end: en, text: body });
    });
    return cues;
  }

  function parseLRC(text) {
    /* [mm:ss.xx]歌词，可能一行多时间标签；结束时间 = 下一行起始（末尾 +5s） */
    const marks = [];
    text.replace(/\r/g, '').split('\n').forEach(line => {
      const re = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
      let m, last = 0;
      const times = [];
      while ((m = re.exec(line))) { times.push(toMs(0, m[1], m[2], m[3] ? pad(m[3].length === 1 ? m[3] * 10 : m[3], 3) : '0')); last = re.lastIndex; }
      const content = line.slice(last).trim();
      if (!times.length || !content) return;
      times.forEach(t => marks.push({ start: t, text: content }));
    });
    marks.sort((a, b) => a.start - b.start);
    return marks.map((mk, i) => ({
      start: mk.start,
      end: i + 1 < marks.length ? Math.max(mk.start + 200, marks[i + 1].start - 50) : mk.start + 5000,
      text: mk.text
    }));
  }

  function parseASS(text) {
    const cues = [];
    const lines = text.replace(/\r/g, '').split('\n');
    let fmtIdx = null;
    lines.forEach(line => {
      if (/^Format:/i.test(line) && line.toLowerCase().indexOf('start') > -1) {
        fmtIdx = line.slice(7).split(',').map(s => s.trim().toLowerCase());
        return;
      }
      if (!/^Dialogue:/i.test(line)) return;
      const parts = line.slice(9).split(',');
      if (!fmtIdx) {
        /* 标准 v4+ 默认列序：Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text */
        if (parts.length < 10) return;
        cues.push({ start: assTimeToMs(parts[1]), end: assTimeToMs(parts[2]), text: parts.slice(9).join(',') });
        return;
      }
      const si = fmtIdx.indexOf('start'), ei = fmtIdx.indexOf('end'), ti = fmtIdx.indexOf('text');
      if (si < 0 || ei < 0 || ti < 0) return;
      const body = parts.slice(ti).join(',').trim();
      if (!body) return;
      cues.push({ start: assTimeToMs(parts[si]), end: assTimeToMs(parts[ei]), text: body });
    });
    return cues;
  }

  function assTimeToMs(s) {
    const m = String(s).trim().match(/(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,2})/);
    if (!m) return 0;
    return toMs(m[1], m[2], m[3], pad(m[4], 2) * 10);
  }

  /* 识别格式：扩展名优先，内容嗅探兜底 */
  function detectFormat(name, text) {
    const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    if (/^srt$/i.test(ext)) return 'srt';
    if (/^(vtt|webvtt)$/i.test(ext)) return 'vtt';
    if (/^lrc$/i.test(ext)) return 'lrc';
    if (/^(ass|ssa)$/i.test(ext)) return 'ass';
    if (/^WEBVTT/.test(text.trim())) return 'vtt';
    if (/\[Script Info\]/i.test(text) || /^Dialogue:/im.test(text)) return 'ass';
    if (/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*/.test(text)) return 'srt';
    if (/^\[\d{1,3}:\d{2}/m.test(text)) return 'lrc';
    return '';
  }

  function parseAny(fmt, text) {
    if (fmt === 'srt') return parseSRT(text);
    if (fmt === 'vtt') return parseVTT(text);
    if (fmt === 'lrc') return parseLRC(text);
    if (fmt === 'ass') return parseASS(text);
    return [];
  }

  /* ================= 序列化（cues → 目标格式） ================= */

  function cleanText(t) {
    return t
      .replace(/\{\\[^}]*\}/g, '')            /* ASS 覆写标签 {\...} */
      .replace(/<\/?(i|b|u|s|font|ruby|rt|v|c)[^>]*>/gi, '')  /* HTML/ASS 内嵌标签 */
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .trim();
  }

  function toSRT(cues) {
    return cues.map((c, i) => (i + 1) + '\n' + msToSRT(c.start) + ' --> ' + msToSRT(c.end) + '\n' + c.text + '\n').join('\n');
  }
  function toVTT(cues) {
    return 'WEBVTT\n\n' + cues.map(c => msToVTT(c.start) + ' --> ' + msToVTT(c.end) + '\n' + c.text + '\n').join('\n');
  }
  function toLRC(cues) {
    return cues.map(c => '[' + msToLRC(c.start) + ']' + c.text.replace(/\n/g, ' ')).join('\n');
  }
  const ASS_HEADER = '[Script Info]\n' +
    'Title: LiteBox Subtitle\n' +
    'ScriptType: v4.00+\n' +
    'WrapStyle: 0\n' +
    'ScaledBorderAndShadow: yes\n' +
    '\n' +
    '[V4+ Styles]\n' +
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
    'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n' +
    '\n' +
    '[Events]\n' +
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  function toASS(cues) {
    return ASS_HEADER + cues.map(c =>
      'Dialogue: 0,' + msToASSTime(c.start) + ',' + msToASSTime(c.end) + ',Default,,0,0,0,,' + c.text.replace(/\n/g, '\\N')
    ).join('\n');
  }

  function serialize(fmt, cues) {
    if (fmt === 'srt') return toSRT(cues);
    if (fmt === 'vtt') return toVTT(cues);
    if (fmt === 'lrc') return toLRC(cues);
    if (fmt === 'ass') return toASS(cues);
    return '';
  }

  function applyOffset(cues, offset) {
    cues.forEach(c => {
      c.start += offset;
      c.end += offset;
      if (c.start < 0) c.start = 0;
      if (c.end < c.start) c.end = c.start + 1000;
    });
    return cues;
  }

  /* ================= 视图 ================= */

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>字幕互转</h1><p>SRT / WebVTT / LRC / ASS 两两转换，自动修复编码乱码，时间偏移</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2" id="sbMode">' +
      '<button class="seg-btn on" data-m="single" type="button">单文件模式</button>' +
      '<button class="seg-btn" data-m="batch" type="button">批量模式</button>' +
      '</div>' +
      '<div class="jst" id="sbStat" hidden></div>' +

      /* —— 单文件 —— */
      '<div id="sbSingle">' +
      '<div class="tool-sec"><span class="tool-lab">字幕文件（.srt / .vtt / .lrc / .ass）</span>' +
      '<div class="dropzone" id="sbZone">点击选择、拖入字幕文件，或直接 Ctrl+V 粘贴字幕文本</div>' +
      '<input type="file" id="sbFile" accept=".srt,.vtt,.lrc,.ass,.ssa,text/plain" hidden>' +
      '</div>' +
      '<div class="tool-sec" id="sbOpts" hidden>' +
      '<span class="tool-lab">转换选项</span>' +
      '<div class="card set-card">' +
      '<div class="sb-fileinfo" id="sbFileInfo"></div>' +
      '<div class="field"><label>输出格式</label><select class="inp" id="sbOutFmt">' +
      '<option value="srt" selected>SRT</option>' +
      '<option value="vtt">WebVTT</option>' +
      '<option value="lrc">LRC</option>' +
      '<option value="ass">ASS</option>' +
      '</select></div>' +
      '<div class="field"><label>时间偏移（毫秒，可正可负）</label><input class="inp" id="sbOffset" type="number" step="100" value="0" placeholder="如 1500 或 -800"></div>' +
      '<label class="chk-row"><input type="checkbox" id="sbClean"><span>清理样式标签（ASS 覆写 / HTML 标签）</span></label>' +
      '<div class="field"><label>编码输出</label><select class="inp" id="sbEnc">' +
      '<option value="utf8" selected>UTF-8</option>' +
      '<option value="bom">UTF-8 BOM（兼容性最好）</option>' +
      '<option value="gbk">GBK（旧设备 / 部分播放器）</option>' +
      '</select></div>' +
      '<div class="set-btns"><button class="btn btn-main js-primary-submit" id="sbGo" type="button">🔄 转换</button></div>' +
      '</div></div>' +
      '<div class="tool-sec" id="sbOutSec" hidden><span class="tool-lab">转换结果预览（前 20 行）</span>' +
      '<textarea class="inp mono" id="sbPreview" rows="10" readonly></textarea>' +
      '<div class="set-btns"><button class="btn btn-main" id="sbDl" type="button">⬇️ 下载</button></div>' +
      '</div>' +
      '</div>' +

      /* —— 批量 —— */
      '<div id="sbBatch" hidden>' +
      '<div class="tool-sec"><span class="tool-lab">批量转换（统一输出格式，打包 ZIP 下载）</span>' +
      '<div class="dropzone" id="sbZoneBatch">点击选择多个字幕文件，或拖入</div>' +
      '<input type="file" id="sbFiles" accept=".srt,.vtt,.lrc,.ass,.ssa" multiple hidden>' +
      '</div>' +
      '<div class="tool-sec" id="sbBatchOpts" hidden>' +
      '<span class="tool-lab">批量选项</span>' +
      '<div class="card set-card">' +
      '<div class="sb-fileinfo" id="sbBatchInfo"></div>' +
      '<div class="field"><label>输出格式</label><select class="inp" id="sbBatchFmt">' +
      '<option value="srt" selected>SRT</option>' +
      '<option value="vtt">WebVTT</option>' +
      '<option value="lrc">LRC</option>' +
      '<option value="ass">ASS</option>' +
      '</select></div>' +
      '<div class="field"><label>时间偏移（毫秒）</label><input class="inp" id="sbBatchOffset" type="number" step="100" value="0"></div>' +
      '<label class="chk-row"><input type="checkbox" id="sbBatchClean"><span>清理样式标签</span></label>' +
      '<div class="set-btns"><button class="btn btn-main js-primary-submit" id="sbBatchGo" type="button">📦 批量转换并打包</button></div>' +
      '<p class="sb-progress" id="sbBatchProg"></p>' +
      '</div></div>' +
      '</div>' +

      '<p class="cd-note">编码自动识别支持 UTF-8 / UTF-8 BOM / UTF-16 / GBK / Big5；' +
      'LRC 没有结束时间，按下一行起始自动推算；转换全部在本机完成，字幕不会上传。</p>' +
      '</div>'
    );
  }

  function showStat(msg, warn) {
    const el = $('#sbStat', rootEl);
    el.textContent = msg;
    el.classList.toggle('err', !!warn);
    el.hidden = false;
  }

  function setMode(m) {
    $$('#sbMode .seg-btn', rootEl).forEach(x => x.classList.toggle('on', x.dataset.m === m));
    $('#sbSingle', rootEl).hidden = m !== 'single';
    $('#sbBatch', rootEl).hidden = m !== 'batch';
    $('#sbStat', rootEl).hidden = true;
  }

  function extOf(fmt) { return '.' + fmt; }

  function downloadBytes(bytes, name, mime) {
    const blob = new Blob([bytes], { type: mime || 'text/plain;charset=utf-8' });
    LB.img.download(blob, name);
  }

  /* ---------- 单文件 ---------- */

  async function onFile(f) {
    if (!f) return;
    const buf = await f.arrayBuffer();
    const dec = detectDecode(buf);
    curText = dec.text;
    curName = (f.name || 'subtitle').replace(/\.[a-z0-9]+$/i, '');
    curFmt = detectFormat(f.name || '', curText);
    if (!curFmt) { showStat('⚠️ 无法识别字幕格式，请确认是 SRT / VTT / LRC / ASS 文件', true); $('#sbOpts', rootEl).hidden = true; return; }
    const cues = parseAny(curFmt, curText);
    $('#sbOpts', rootEl).hidden = false;
    $('#sbFileInfo', rootEl).innerHTML =
      '<b>' + esc(f.name || '字幕文件') + '</b> · 识别为 <b>' + curFmt.toUpperCase() + '</b> · 编码 <b>' + esc(dec.enc) + '</b> · ' + cues.length + ' 条字幕';
    showStat('✓ 解析成功：' + cues.length + ' 条字幕', false);
  }

  function convertOne(text, fmt, name, opts) {
    const inFmt = detectFormat(name, text);
    if (!inFmt) throw new Error('无法识别格式：' + name);
    let cues = parseAny(inFmt, text);
    if (!cues.length) throw new Error('没有解析到字幕内容：' + name);
    const off = Math.round(+opts.offset || 0);
    if (off) cues = applyOffset(cues, off);
    if (opts.clean) cues = cues.map(c => Object.assign({}, c, { text: cleanText(c.text) }));
    return serialize(fmt, cues);
  }

  function convertSingle() {
    if (!curText) { LB.toast('请先上传字幕文件', 'info'); return; }
    const fmt = $('#sbOutFmt', rootEl).value;
    const opts = {
      offset: $('#sbOffset', rootEl).value,
      clean: $('#sbClean', rootEl).checked
    };
    try {
      const out = convertOne(curText, fmt, curName, opts);
      const enc = $('#sbEnc', rootEl).value;
      $('#sbOutSec', rootEl).hidden = false;
      $('#sbPreview', rootEl).value = out.split('\n').slice(0, 20).join('\n');
      const btn = $('#sbDl', rootEl);
      let encName = 'UTF-8';
      if (enc === 'bom') encName = 'UTF-8 BOM';
      else if (enc === 'gbk') encName = 'UTF-8 BOM（GBK 输出当前浏览器不支持，已用 BOM 兜底）';
      btn.onclick = () => downloadBytes(encodeOut(out, enc), curName + extOf(fmt));
      showStat('✓ 已转换 ' + cues2count(out) + ' 行 · 输出 ' + fmt.toUpperCase() + ' · ' + encName, false);
    } catch (e) {
      showStat('✗ ' + (e.message || '转换失败'), true);
      LB.toast(e.message || '转换失败', 'err');
    }
  }

  function cues2count(out) { return out.split(/\n/).filter(l => l.trim()).length; }

  /* ---------- 批量 ---------- */

  async function onBatchFiles(files) {
    batchFiles = Array.from(files || []).filter(f => /\.(srt|vtt|lrc|ass|ssa)$/i.test(f.name));
    if (!batchFiles.length) { LB.toast('请选择字幕文件', 'warn'); return; }
    $('#sbBatchOpts', rootEl).hidden = false;
    $('#sbBatchInfo', rootEl).textContent = '已选择 ' + batchFiles.length + ' 个文件：' +
      batchFiles.slice(0, 3).map(f => f.name).join('、') + (batchFiles.length > 3 ? ' 等' : '');
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve();
    if (!window.__lbJSZipP) {
      window.__lbJSZipP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/jszip.min.js';
        s.onload = resolve;
        s.onerror = () => { window.__lbJSZipP = null; reject(new Error('打包组件加载失败')); };
        document.head.appendChild(s);
      });
    }
    return window.__lbJSZipP;
  }

  async function convertBatch() {
    if (!batchFiles.length) { LB.toast('请先选择文件', 'info'); return; }
    const fmt = $('#sbBatchFmt', rootEl).value;
    const opts = { offset: $('#sbBatchOffset', rootEl).value, clean: $('#sbBatchClean', rootEl).checked };
    const prog = $('#sbBatchProg', rootEl);
    try {
      await loadJSZip();
      const zip = new JSZip();
      let ok = 0, fail = 0;
      for (let i = 0; i < batchFiles.length; i++) {
        const f = batchFiles[i];
        prog.textContent = '处理中 ' + (i + 1) + '/' + batchFiles.length + ' · ' + f.name;
        try {
          const buf = await f.arrayBuffer();
          const dec = detectDecode(buf);
          const out = convertOne(dec.text, fmt, f.name, opts);
          const base = f.name.replace(/\.[a-z0-9]+$/i, '');
          zip.file(base + extOf(fmt), out);
          ok++;
        } catch (e) { fail++; }
      }
      prog.textContent = '打包中…';
      const blob = await zip.generateAsync({ type: 'blob' });
      LB.img.download(blob, 'subtitles-' + fmt + '.zip');
      prog.textContent = '完成：成功 ' + ok + ' 个' + (fail ? '，失败 ' + fail + ' 个' : '');
      showStat('✓ 批量转换完成：成功 ' + ok + (fail ? ' · 失败 ' + fail : ''), !!fail);
    } catch (e) {
      prog.textContent = '';
      showStat('✗ ' + (e.message || '批量转换失败'), true);
      LB.toast(e.message || '批量转换失败', 'err');
    }
  }

  /* ---------- 挂载 ---------- */

  function bindZone(zone, input, handler) {
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const fs = Array.from(input.files || []);
      input.value = '';
      handler(fs);
    });
    const onOver = e => { e.preventDefault(); zone.classList.add('drag'); };
    zone.addEventListener('dragover', onOver);
    zone.addEventListener('dragenter', onOver);
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      handler(fs);
    });
  }

  function onPasteText() {
    /* 粘贴字幕文本：识别剪贴板里的字幕内容（单文件模式） */
    return function (e) {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t) return;
      const fmt = detectFormat('pasted', t);
      if (!fmt) return;
      curText = t; curName = 'pasted'; curFmt = fmt;
      const cues = parseAny(fmt, t);
      $('#sbOpts', rootEl).hidden = false;
      $('#sbFileInfo', rootEl).innerHTML = '<b>剪贴板内容</b> · 识别为 <b>' + fmt.toUpperCase() + '</b> · ' + cues.length + ' 条字幕';
      showStat('✓ 已粘贴并识别：' + cues.length + ' 条字幕', false);
      e.preventDefault();
    };
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    $$('#sbMode .seg-btn', root).forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));

    bindZone($('#sbZone', root), $('#sbFile', root), fs => { if (fs.length) onFile(fs[0]); });
    bindZone($('#sbZoneBatch', root), $('#sbFiles', root), fs => { if (fs.length) onBatchFiles(fs); });

    const pasteHandler = onPasteText();
    document.addEventListener('paste', pasteHandler);

    $('#sbGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; convertSingle(); });
    $('#sbBatchGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; convertBatch(); });

    root._pasteCleanup = () => document.removeEventListener('paste', pasteHandler);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    alive = false;
    if (rootEl && rootEl._pasteCleanup) rootEl._pasteCleanup();
    curText = ''; curName = ''; curFmt = ''; batchFiles = [];
    rootEl = null;
  }

  LB.router.register('subtitle', { mount, unmount });
})();
