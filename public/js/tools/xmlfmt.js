/* LiteBox v5 · tools/xmlfmt.js — XML 美化 / 压缩（DOMParser + XMLSerializer，纯本地） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) {
      const msg = (doc.querySelector('parsererror div') || doc.querySelector('parsererror')).textContent || '';
      throw new Error('XML 格式有误：' + msg.split('\n')[0].slice(0, 120));
    }
    return doc;
  }

  /* 美化：序列化后在标签流上按层级缩进（</> 减一，非自闭合开始标签加一） */
  function pretty(serialized) {
    /* 拆 token：<...> 与标签间文本 */
    const tokens = serialized.split(/(?=<)|(?<=>)/).filter(t => t.trim() !== '' || t === ' ');
    const out = [];
    let depth = 0;
    const pad = () => '  '.repeat(Math.max(0, depth));
    for (const tk of tokens) {
      const t = tk.trim();
      if (t === '') continue;
      if (/^<\//.test(t)) {                 /* 结束标签 */
        depth--;
        out.push(pad() + t);
      } else if (/^<[^!?]/.test(t) && /\/>$/.test(t)) {  /* 自闭合 */
        out.push(pad() + t);
      } else if (/^<[^!?/]/.test(t) && !/\/>$/.test(t)) { /* 开始标签 */
        out.push(pad() + t);
        depth++;
      } else {                              /* 文本 / 声明 / DOCTYPE */
        out.push(pad() + t);
      }
    }
    return out.join('\n');
  }

  function run(mode) {
    const input = $('#xfIn', rootEl).value;
    if (!input.trim()) { LB.toast('请先粘贴 XML 内容', 'info'); return; }
    let doc;
    try { doc = parseXML(input); }
    catch (e) {
      $('#xfOut', rootEl).value = '';
      $('#xfStat', rootEl).textContent = '⚠️ ' + e.message;
      $('#xfStat', rootEl).className = 'jst err';
      return;
    }
    const serialized = new XMLSerializer().serializeToString(doc);
    $('#xfOut', rootEl).value = mode === 'min'
      ? serialized.replace(/>\s+</g, '><')
      : pretty(serialized);
    $('#xfStat', rootEl).textContent = '✓ 解析成功 · ' + ($('#xfOut', rootEl).value.length) + ' 字符';
    $('#xfStat', rootEl).className = 'jst ok';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>XML 美化工具</h1><p>校验 / 美化 / 压缩 XML，格式错误即时提示 · 纯本地</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">输入 XML</span>' +
      '<textarea class="inp mono" id="xfIn" rows="15" placeholder="<root><item>1</item></root>" spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="xfPretty" type="button">✨ 美化</button>' +
      '<button class="btn btn-ghost" id="xfMin" type="button">压缩</button>' +
      '<button class="btn btn-ghost" id="xfCopy" type="button">📋 复制</button>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输出</span>' +
      '<textarea class="inp mono" id="xfOut" rows="15" readonly placeholder="结果…"></textarea>' +
      '<div class="jst" id="xfStat">粘贴 XML 后点击「美化」或「压缩」</div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#xfPretty', root).addEventListener('click', () => run('pretty'));
    $('#xfMin', root).addEventListener('click', () => run('min'));
    $('#xfCopy', root).addEventListener('click', () => {
      const t = $('#xfOut', root).value;
      if (!t) { LB.toast('输出为空', 'info'); return; }
      LB.copyWithToast(t);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('xmlfmt', { mount, unmount });
})();
