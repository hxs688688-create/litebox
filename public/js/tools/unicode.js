/* LiteBox v5 · tools/unicode.js — Unicode 编解码 + 字符码点查询（纯本地） */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  let rootEl = null;

  /* 编码：for...of 支持代理对；<128 原样；>0xFFFF 输出代理对两个 \uXXXX */
  function encode(s) {
    let out = '';
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (cp < 128) { out += ch; continue; }
      if (cp > 0xFFFF) {
        const h = Math.floor((cp - 0x10000) / 0x400) + 0xD800;
        const l = ((cp - 0x10000) % 0x400) + 0xDC00;
        out += '\\u' + h.toString(16).padStart(4, '0') + '\\u' + l.toString(16).padStart(4, '0');
      } else {
        out += '\\u' + cp.toString(16).padStart(4, '0');
      }
    }
    return out;
  }

  /* 解码：支持 \uXXXX 与 \u{XXXXX} */
  function decode(s) {
    return s
      .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, h) => {
        const c = parseInt(h, 16);
        return c > 0x10FFFF ? _ : String.fromCodePoint(c);
      })
      .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  /* UTF-8 字节序列（空格分隔 hex） */
  function utf8Bytes(ch) {
    return Array.from(new TextEncoder().encode(ch))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
  }

  /* 字符查询：跳过空白字符 */
  function query(s) {
    const cards = [];
    for (const ch of s) {
      if (/\s/.test(ch)) continue;
      const cp = ch.codePointAt(0);
      cards.push(
        '<div class="uc-ch">' +
        '<div class="uc-big">' + esc(ch) + '</div>' +
        '<div class="uc-meta">U+' + cp.toString(16).toUpperCase().padStart(4, '0') + '</div>' +
        '<div class="uc-meta">十进制 ' + cp + '</div>' +
        '<div class="uc-meta">UTF-8 ' + esc(utf8Bytes(ch)) + '</div>' +
        '</div>'
      );
    }
    $('#ucCards', rootEl).innerHTML = cards.join('') || '<div class="uc-empty">输入字符后展示码点信息</div>';
    $('#ucCards', rootEl).classList.toggle('uc-grid', cards.length > 0);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>Unicode 编解码</h1><p>中文与 \\uXXXX 互转，码点 / UTF-8 字节查询 · 支持代理对</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="ucTab">' +
      '<button class="seg-btn on" data-t="codec" type="button">转义编解码</button>' +
      '<button class="seg-btn" data-t="query" type="button">字符查询</button>' +
      '</div>' +

      '<div id="ucCodec">' +
      '<div class="tool-sec"><span class="tool-lab">输入</span>' +
      '<textarea class="inp" id="ucIn" rows="6" placeholder="输入文本或 \\uXXXX 转义串…" spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="ucEnc" type="button">编码 → \\uXXXX</button>' +
      '<button class="btn btn-ghost" id="ucDec" type="button">← 解码 \\uXXXX</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输出</span>' +
      '<textarea class="inp mono" id="ucOut" rows="6" readonly placeholder="结果…"></textarea>' +
      '<div class="set-btns"><button class="btn btn-main" id="ucCopy" type="button">复制结果</button></div>' +
      '</div>' +
      '</div>' +

      '<div id="ucQuery" hidden>' +
      '<div class="tool-sec"><span class="tool-lab">输入字符（最多 20 个）</span>' +
      '<input class="inp" id="ucQIn" type="text" maxlength="20" placeholder="输入任意字符，如：中 A"></div>' +
      '<div id="ucCards" class="uc-empty">输入字符后展示码点信息</div>' +
      '</div>' +
      '</div>'
    );
  }

  function setTab(t) {
    $$('#ucTab .seg-btn', rootEl).forEach(x => x.classList.toggle('on', x.dataset.t === t));
    $('#ucCodec', rootEl).hidden = t !== 'codec';
    $('#ucQuery', rootEl).hidden = t !== 'query';
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#ucTab', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setTab(b.dataset.t);
    });
    $('#ucEnc', root).addEventListener('click', () => { $('#ucOut', root).value = encode($('#ucIn', root).value); });
    $('#ucDec', root).addEventListener('click', () => { $('#ucOut', root).value = decode($('#ucIn', root).value); });
    $('#ucCopy', root).addEventListener('click', () => {
      const t = $('#ucOut', root).value;
      if (!t) { LB.toast('输出为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    $('#ucQIn', root).addEventListener('input', e => query(e.target.value));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('unicode', { mount, unmount });
})();
