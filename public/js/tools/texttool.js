/* LiteBox v5 · tools/texttool.js — 文本清理（即时操作按钮，原地替换；统计见 textstats） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let undoText = null; /* 撤销栈：只保留 1 步 */

  /* 7 个即时操作：入参全文 → 返回新全文 */
  const OPS = [
    { n: '去行首尾空格', f: t => t.split('\n').map(l => l.replace(/^[ \t\u3000\u00a0]+|[ \t\u3000\u00a0]+$/g, '')).join('\n') },
    { n: '去多余空行', f: t => t.replace(/\n{3,}/g, '\n\n') },
    { n: '去重复行', f: t => {
      const seen = new Set();
      return t.split('\n').filter(l => { if (seen.has(l)) return false; seen.add(l); return true; }).join('\n');
    } },
    { n: '删除所有空格', f: t => t.replace(/[ \t\u3000\u00a0]/g, '') },
    { n: '全角空格转半角', f: t => t.replace(/\u3000/g, ' ') },
    { n: '中英文间加空格', f: t => t
      .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2') },
    { n: '一键清除首尾空白', f: t => t.trim() }
  ];

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本处理</h1><p>一键清理排版：空格 / 空行 / 重复行 / 中英文间距 · 纯本地</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">清理操作（点击即时生效）</span>' +
      '<div class="btn-row" id="ttOps">' +
      OPS.map((o, i) => '<button class="btn btn-ghost" data-op="' + i + '" type="button">' + o.n + '</button>').join('') +
      '</div></div>' +
      '<div class="tool-sec"><span class="tool-lab">文本</span>' +
      '<textarea class="inp" id="ttIn" rows="14" placeholder="粘贴或输入文本…" spellcheck="false"></textarea></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="ttCopy" type="button">复制全文</button>' +
      '<button class="btn btn-ghost" id="ttUndo" type="button">↺ 撤销</button>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const ta = $('#ttIn', root);
    undoText = null;

    $('#ttOps', root).addEventListener('click', e => {
      const b = e.target.closest('[data-op]');
      if (!b) return;
      const op = OPS[+b.dataset.op];
      const oldText = ta.value;
      const newText = op.f(oldText);
      if (newText === oldText) { LB.toast('没有需要处理的内容', 'info'); return; }
      undoText = oldText;
      ta.value = newText;
      LB.toast('✓ ' + op.n + ' 完成', 'ok');
    });

    $('#ttUndo', root).addEventListener('click', () => {
      if (undoText === null) { LB.toast('没有可撤销的操作', 'info'); return; }
      ta.value = undoText;
      undoText = null;
      LB.toast('已撤销', 'ok');
    });

    $('#ttCopy', root).addEventListener('click', () => {
      if (!ta.value) { LB.toast('文本为空', 'info'); return; }
      LB.copyWithToast(ta.value);
    });

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* Step 6E：消费链路种子（ocr / stt / translate 的「文本清理」按钮会写入） */
    const seed = LB.storage.get('litebox_tt_seed', '');
    if (seed && String(seed).trim()) {
      ta.value = String(seed);
      LB.storage.remove('litebox_tt_seed');
      LB.toast('已接收上一步的结果', 'info');
    }
  }

  function unmount() { rootEl = null; undoText = null; }

  LB.router.register('texttool', { mount, unmount });
})();
