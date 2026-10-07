/* LiteBox v5 · tools/textconvert.js — 文本互相转换（15 种模式，全部本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  /* 全角 → 半角：\uFF01-\uFF5E 与 \u0021-\u007E 相差 0xFEE0；全角空格 \u3000 → 空格 */
  function fw2hw(t) {
    let s = '';
    for (const ch of t) {
      const c = ch.codePointAt(0);
      s += c === 0x3000 ? ' '
        : (c >= 0xFF01 && c <= 0xFF5E) ? String.fromCharCode(c - 0xFEE0)
        : ch;
    }
    return s;
  }
  /* 半角 → 全角：可打印 ASCII → 全角；空格 → 全角空格 */
  function hw2fw(t) {
    let s = '';
    for (const ch of t) {
      const c = ch.codePointAt(0);
      s += c === 0x20 ? '\u3000'
        : (c >= 0x21 && c <= 0x7E) ? String.fromCharCode(c + 0xFEE0)
        : ch;
    }
    return s;
  }
  /* Unicode 转义：码点 > 127 的码元输出 \uXXXX */
  function uniesc(t) {
    let s = '';
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      s += c > 127 ? '\\u' + c.toString(16).padStart(4, '0') : t[i];
    }
    return s;
  }
  /* Unicode 反转义：支持 \uXXXX 与 \u{XXXXX} */
  function unidec(t) {
    return t
      .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, h) => {
        const c = parseInt(h, 16);
        return c > 0x10FFFF ? _ : String.fromCodePoint(c);
      })
      .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  function jsonTransform(t, space) {
    return JSON.stringify(JSON.parse(t), null, space);
  }
  /* 行工具：统一按 \n 切（兼容 \r\n） */
  const lines = t => t.replace(/\r\n?/g, '\n').split('\n');

  const MODES = [
    { v: 'upper', n: '英文转大写', f: t => t.toUpperCase() },
    { v: 'lower', n: '英文转小写', f: t => t.toLowerCase() },
    { v: 'fw2hw', n: '全角 → 半角', f: fw2hw },
    { v: 'hw2fw', n: '半角 → 全角', f: hw2fw },
    { v: 'urlenc', n: 'URL 编码', f: t => encodeURIComponent(t) },
    { v: 'urldec', n: 'URL 解码', f: t => decodeURIComponent(t) },
    { v: 'uniesc', n: 'Unicode 转义', f: uniesc },
    { v: 'unidec', n: 'Unicode 反转义', f: unidec },
    { v: 'jsonfmt', n: 'JSON 格式化', f: t => jsonTransform(t, 2) },
    { v: 'jsonmin', n: 'JSON 压缩', f: t => jsonTransform(t) },
    { v: 'trimlines', n: '清理空白', f: t => lines(t).map(l => l.replace(/^[ \t\u3000\u00a0]+|[ \t\u3000\u00a0]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n') },
    { v: 'uniq', n: '逐行去重', f: t => {
      const seen = new Set();
      return lines(t).filter(l => { if (seen.has(l)) return false; seen.add(l); return true; }).join('\n');
    } },
    { v: 'sortzh', n: '逐行中文排序', f: t => lines(t).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join('\n') },
    { v: 'sortnum', n: '逐行数字排序', f: t => {
      const num = s => { const v = parseFloat(s); return isNaN(v) ? Infinity : v; };
      return lines(t).sort((a, b) => num(a) - num(b)).join('\n');
    } },
    { v: 'reverse', n: '逐行反转', f: t => lines(t).reverse().join('\n') }
  ];

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本互相转换</h1><p>大小写 / 全半角 / URL / Unicode / JSON / 排序去重，一站式处理</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="field"><label>转换模式</label><select class="inp" id="tcMode">' +
      MODES.map(m => '<option value="' + m.v + '">' + m.n + '</option>').join('') +
      '</select></div>' +
      '<div class="tc-cols">' +
      '<div class="tool-sec"><span class="tool-lab">输入</span>' +
      '<textarea class="inp" id="tcIn" rows="12" placeholder="粘贴或输入文本…" spellcheck="false"></textarea></div>' +
      '<div class="tool-sec"><span class="tool-lab">输出</span>' +
      '<textarea class="inp" id="tcOut" rows="12" placeholder="转换结果…" spellcheck="false" readonly></textarea></div>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="tcSwap" type="button">⇄ 交换</button>' +
      '<button class="btn btn-main" id="tcGo" type="button">✨ 立即转换</button>' +
      '<button class="btn btn-ghost" id="tcCopy" type="button">复制结果</button>' +
      '<button class="btn btn-ghost" id="tcClear" type="button">清空</button>' +
      '</div>' +
      '<div class="jst" id="tcStat">输入 0 字 / 0 行</div>' +
      '</div>'
    );
  }

  function renderStat() {
    const t = $('#tcIn', rootEl).value;
    const n = t === '' ? 0 : lines(t).length;
    $('#tcStat', rootEl).textContent = '输入 ' + t.length + ' 字 / ' + n + ' 行';
  }

  function convert() {
    const mode = MODES.find(m => m.v === $('#tcMode', rootEl).value) || MODES[0];
    const t = $('#tcIn', rootEl).value;
    let out;
    try { out = mode.f(t); }
    catch (e) {
      LB.toast('转换失败：' + (e.message || '输入内容格式不正确'), 'err');
      $('#tcStat', rootEl).textContent = '⚠️ ' + (e.message || '转换失败');
      $('#tcStat', rootEl).classList.add('err');
      return;
    }
    $('#tcOut', rootEl).value = out;
    $('#tcStat', rootEl).classList.remove('err');
    renderStat();
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const inp = $('#tcIn', root);
    inp.addEventListener('input', renderStat);

    $('#tcGo', root).addEventListener('click', convert);
    $('#tcSwap', root).addEventListener('click', () => {
      const out = $('#tcOut', root);
      inp.value = out.value;
      out.value = '';
      renderStat();
    });
    $('#tcCopy', root).addEventListener('click', () => {
      const t = $('#tcOut', root).value;
      if (!t) { LB.toast('输出为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    $('#tcClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => {
      inp.value = '';
      $('#tcOut', root).value = '';
      renderStat();
    }));

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    renderStat();

    /* Step 6E：消费链路种子（ocr / stt / translate 的「送入文本处理」会写入）
       —— 与 csvtab 的 litebox_csv_seed 同构：读取 → 回填 → 立即清种子。
       注意 ocr.js / stt.js 早就写了这个 key，但此前全库无人读，
       导致「跳过去了但内容丢了」，这里补上接收端。 */
    const seed = LB.storage.get('litebox_tc_seed', '');
    if (seed && String(seed).trim()) {
      inp.value = String(seed);
      LB.storage.remove('litebox_tc_seed');
      LB.toast('已接收上一步的结果', 'info');
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('textconvert', { mount, unmount });
})();
