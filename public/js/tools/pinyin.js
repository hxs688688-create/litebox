/* LiteBox v5 · tools/pinyin.js — 汉字转拼音（带声调/不带声调/首字母 × 符号/数字 × 分隔符，按需加载字典） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const HAN_RE = /[\u4e00-\u9fa5]/;
  let rootEl = null;
  let dict = null; /* 拼音表：{ '中': 'zhōng', '发': ['fā','fà'] } */

  /* 声调符号 → 数字后缀（任务规定 ǖǘǚǜ → v1-v4） */
  const TONE_NUM = {
    'ā': 'a1', 'á': 'a2', 'ǎ': 'a3', 'à': 'a4',
    'ō': 'o1', 'ó': 'o2', 'ǒ': 'o3', 'ò': 'o4',
    'ē': 'e1', 'é': 'e2', 'ě': 'e3', 'è': 'e4',
    'ī': 'i1', 'í': 'i2', 'ǐ': 'i3', 'ì': 'i4',
    'ū': 'u1', 'ú': 'u2', 'ǔ': 'u3', 'ù': 'u4',
    'ǖ': 'v1', 'ǘ': 'v2', 'ǚ': 'v3', 'ǜ': 'v4'
  };
  /* 声调符号 → 去调字母（ü 保留） */
  const TONE_PLAIN = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü'
  };

  /* 单个音节按当前选项转换 */
  function convSyl(syl, fmt, toneStyle) {
    if (fmt === 'initial') return syl.charAt(0);
    if (fmt === 'plain') {
      let r = '';
      for (const ch of syl) r += TONE_PLAIN[ch] || ch;
      return r;
    }
    if (toneStyle === 'num') {
      /* 声调数字后缀加在音节末尾：zhōng → zhong1，ǜ → v4 */
      let base = '', digit = '';
      for (const ch of syl) {
        if (TONE_NUM[ch]) { base += TONE_NUM[ch][0]; digit = TONE_NUM[ch][1]; }
        else base += ch;
      }
      return base + digit;
    }
    return syl;
  }

  function convert() {
    const s = $('#pyIn', rootEl).value;
    if (!dict) { LB.toast('字典加载中…', 'info'); return; }
    const fmt = $('#pyFmt .seg-btn.on', rootEl).dataset.v;
    const toneStyle = $('#pyTone .seg-btn.on', rootEl).dataset.v;
    const sepV = $('#pySep .seg-btn.on', rootEl).dataset.v;
    const sep = sepV === 'space' ? ' ' : (sepV === 'dash' ? '-' : '');

    let out = '', prevHan = false, total = 0, miss = 0;
    for (const ch of s) {
      if (HAN_RE.test(ch)) {
        total++;
        const v = dict[ch];
        if (v === undefined) {
          miss++;
          if (prevHan && sep) out += sep;
          out += ch; /* 不在字表内，保留原样 */
          prevHan = true;
          continue;
        }
        const syl = Array.isArray(v) ? v[0] : v; /* 多音字取第一个音 */
        if (prevHan && sep) out += sep; /* 分隔符只插在汉字与汉字之间 */
        out += convSyl(syl, fmt, toneStyle);
        prevHan = true;
      } else {
        out += ch; /* 非汉字原样保留 */
        prevHan = false;
      }
    }
    $('#pyOut', rootEl).value = out;
    $('#pyStat', rootEl).textContent =
      '共 ' + total + ' 个汉字，其中 ' + miss + ' 个不在字表内（已保留原样）';
    $('#pyStat', rootEl).className = 'jst' + (miss ? ' err' : ' ok');
  }

  function ensureDict(run) {
    if (dict) { run(); return; }
    $('#pyStat', rootEl).textContent = '字典加载中…';
    LB.dict.load('pinyin').then(d => {
      dict = d;
      run();
    }).catch(() => {
      $('#pyStat', rootEl).textContent = '⚠️ 字典加载失败，请刷新重试';
      $('#pyStat', rootEl).className = 'jst err';
    });
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>汉字转拼音</h1><p>带声调 / 不带声调 / 首字母，多音字取常用音</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入汉字</span>' +
      '<textarea class="inp" id="pyIn" rows="5" spellcheck="false">轻工具箱 LiteBox 很好用</textarea></div>' +
      '<div class="tool-lab">输出格式</div>' +
      '<div class="seg" id="pyFmt">' +
      '<button class="seg-btn on" data-v="tone" type="button">带声调</button>' +
      '<button class="seg-btn" data-v="plain" type="button">不带声调</button>' +
      '<button class="seg-btn" data-v="initial" type="button">首字母</button>' +
      '</div>' +
      '<div class="tool-lab">声调样式</div>' +
      '<div class="seg" id="pyTone">' +
      '<button class="seg-btn on" data-v="mark" type="button">符号 (zhōng)</button>' +
      '<button class="seg-btn" data-v="num" type="button">数字 (zhong1)</button>' +
      '</div>' +
      '<div class="tool-lab">分隔符</div>' +
      '<div class="seg" id="pySep">' +
      '<button class="seg-btn on" data-v="space" type="button">空格</button>' +
      '<button class="seg-btn" data-v="none" type="button">无</button>' +
      '<button class="seg-btn" data-v="dash" type="button">-</button>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="pyGo" type="button">✨ 转换</button>' +
      '<button class="btn btn-ghost" id="pyCopy" type="button">📋 复制</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">拼音结果</span>' +
      '<textarea class="inp" id="pyOut" rows="5" readonly spellcheck="false" placeholder="点击「转换」生成拼音…"></textarea>' +
      '<div class="jst" id="pyStat">输入后点击「转换」</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    /* 三个分段：点击即选中并即时重算 */
    for (const segId of ['pyFmt', 'pyTone', 'pySep']) {
      $('#' + segId, root).addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        $$('#' + segId + ' .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
        if (dict) convert();
      });
    }
    $('#pyGo', root).addEventListener('click', () => ensureDict(convert));
    $('#pyCopy', root).addEventListener('click', () => {
      const t = $('#pyOut', root).value;
      if (!t) { LB.toast('结果为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    /* 进入工具即按需加载字典并转换一次 */
    ensureDict(convert);
  }

  function unmount() { rootEl = null; dict = null; }

  LB.router.register('pinyin', { mount, unmount });
})();
