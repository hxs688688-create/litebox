/* LiteBox v5 · tools/mdview.js — Markdown 预览（自研轻量解析器，先转义再套正则，纯本地） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  let rootEl = null;
  let debounceTimer = null;

  /* 行内语法：入口统一先 esc() 转义 <>&，再套正则；code 片段用占位符保护 */
  function inline(text) {
    const stash = [];
    let s = esc(text);
    /* `code`（先保护） */
    s = s.replace(/`([^`]+)`/g, (_, c) => {
      stash.push('<code>' + c + '</code>');
      return '\x00' + (stash.length - 1) + '\x00';
    });
    /* [text](url)：URL 只允许 http(s) */
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, t, u) => {
      if (!/^https?:\/\//i.test(u)) return all;
      return '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\x00(\d+)\x00/g, (_, i) => stash[+i]);
  }

  /* 块级解析：逐行状态机 */
  function render(src) {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    let out = '', i = 0;
    const flushPara = buf => buf.length ? '<p>' + buf.map(inline).join('<br>') + '</p>' : '';

    let para = [];
    while (i < lines.length) {
      const line = lines[i];

      /* 围栏代码块 ``` */
      if (/^\s*```/.test(line)) {
        out += flushPara(para); para = [];
        const body = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i++; }
        i++; /* 跳过闭合 ``` */
        out += '<pre><code>' + esc(body.join('\n')) + '</code></pre>';
        continue;
      }
      /* 标题 # ~ #### */
      const hm = /^(#{1,4})\s+(.*)$/.exec(line);
      if (hm) {
        out += flushPara(para); para = [];
        out += '<h' + hm[1].length + '>' + inline(hm[2].trim()) + '</h' + hm[1].length + '>';
        i++; continue;
      }
      /* 分隔线 --- / *** */
      if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
        out += flushPara(para); para = [];
        out += '<hr>';
        i++; continue;
      }
      /* 引用 > */
      if (/^\s*>\s?/.test(line)) {
        out += flushPara(para); para = [];
        const body = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          body.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out += '<blockquote><p>' + body.map(inline).join('<br>') + '</p></blockquote>';
        continue;
      }
      /* 表格：当前行含 | 且下一行是 |---|---| 分隔行 */
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}[\s:|-]*$/.test(lines[i + 1])) {
        out += flushPara(para); para = [];
        const splitRow = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        const head = splitRow(line);
        i += 2;
        const body = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
          body.push(splitRow(lines[i]));
          i++;
        }
        let t = '<table><thead><tr>' + head.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead>';
        if (body.length) {
          t += '<tbody>' + body.map(r => '<tr>' + head.map((_, c) => '<td>' + inline(r[c] || '') + '</td>').join('') + '</tr>').join('') + '</tbody>';
        }
        out += t + '</table>';
        continue;
      }
      /* 无序列表 - * + */
      if (/^\s*[-*+]\s+/.test(line)) {
        out += flushPara(para); para = [];
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>');
          i++;
        }
        out += '<ul>' + items.join('') + '</ul>';
        continue;
      }
      /* 有序列表 1. / 1) */
      if (/^\s*\d+[.)]\s+/.test(line)) {
        out += flushPara(para); para = [];
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
          i++;
        }
        out += '<ol>' + items.join('') + '</ol>';
        continue;
      }
      /* 空行分段 */
      if (line.trim() === '') {
        out += flushPara(para); para = [];
        i++; continue;
      }
      para.push(line);
      i++;
    }
    out += flushPara(para);
    return out;
  }

  const SAMPLE = [
    '# LiteBox Markdown 示例',
    '',
    '支持 **加粗**、*斜体*、~~删除线~~、`行内代码` 与[链接](https://github.com)。',
    '',
    '## 列表',
    '',
    '- 无序一',
    '- 无序二',
    '* 星号也行',
    '+ 加号也可以',
    '',
    '1. 第一项',
    '2. 第二项',
    '',
    '## 表格',
    '',
    '| 工具 | 状态 |',
    '|---|---|',
    '| 二维码 | 可用 |',
    '| JSON 合并 | 可用 |',
    '',
    '> 引用块：数据不出浏览器，全部本地完成。',
    '',
    '```',
    'const ok = true;',
    '```',
    '',
    '---',
    '',
    '#### 结束',
    '',
    '感谢使用 LiteBox v5。'
  ].join('\n');

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>Markdown 预览</h1><p>边写边看的实时预览 · 全部本地渲染，无第三方库</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="btn-row"><button class="btn btn-ghost" id="mdSample" type="button">📄 示例</button></div>' +
      '<div class="tc-cols">' +
      '<div class="tool-sec"><span class="tool-lab">Markdown 源文</span>' +
      '<textarea class="inp" id="mdIn" rows="20" placeholder="# 标题' + '\n' + '- 列表项…" spellcheck="false"></textarea></div>' +
      '<div class="tool-sec"><span class="tool-lab">实时预览</span>' +
      '<div class="md-body" id="mdOut"></div></div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const ta = $('#mdIn', root);
    const out = $('#mdOut', root);
    const renderNow = () => { out.innerHTML = render(ta.value); };
    ta.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(renderNow, 150); });
    $('#mdSample', root).addEventListener('click', () => { ta.value = SAMPLE; renderNow(); });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    renderNow();
  }

  function unmount() { clearTimeout(debounceTimer); debounceTimer = null; rootEl = null; }

  LB.router.register('mdview', { mount, unmount });
})();
