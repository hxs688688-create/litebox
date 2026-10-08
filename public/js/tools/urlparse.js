/* LiteBox v5 · tools/urlparse.js — URL 参数解析（结构拆解 + 参数 JSON 复制） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  let rootEl = null;
  let lastParams = {};

  function parse() {
    let raw = $('#upIn', rootEl).value.trim();
    if (!raw) { LB.toast('请先粘贴 URL', 'info'); return; }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw; /* 没写协议自动补 https:// */
    let url;
    try { url = new URL(raw); }
    catch (e) { LB.toast('URL 格式有误：' + e.message, 'err'); return; }

    /* 查询参数：getAll 支持多值 */
    const rows = [];
    lastParams = {};
    url.searchParams.forEach((v, k) => {
      if (!Array.isArray(lastParams[k])) lastParams[k] = [];
      lastParams[k].push(v);
    });
    Object.keys(lastParams).forEach(k => {
      rows.push('<tr><td>' + esc(k) + '</td><td class="up-val">' + esc(lastParams[k].join(' , ')) + '</td></tr>');
    });

    const struct = [
      ['协议', url.protocol.replace(/:$/, '')],
      ['主机', url.hostname],
      ['端口', url.port || '(默认)'],
      ['路径', url.pathname],
      ['锚点', url.hash ? url.hash.slice(1) : '(无)']
    ];
    $('#upStruct', rootEl).innerHTML =
      struct.map(([l, v]) => '<tr><td>' + l + '</td><td class="up-val">' + esc(v) + '</td></tr>').join('');
    $('#upParams', rootEl).innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="2" class="up-empty">（无查询参数）</td></tr>';
    $('#upOut', rootEl).hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>URL 参数解析</h1><p>拆解协议 / 主机 / 参数，一键复制 JSON · 中文自动解码</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">URL</span>' +
      '<textarea class="inp" id="upIn" rows="4" placeholder="https://a.com/p?a=1&b=2" spellcheck="false"></textarea>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="upGo" type="button">🔍 解析</button>' +
      '<button class="btn btn-ghost" id="upJson" type="button">📋 复制 JSON</button>' +
      '</div></div>' +
      '<div id="upOut" hidden>' +
      '<div class="tool-sec"><span class="tool-lab">链接结构</span>' +
      '<div class="card"><table class="stat-table"><tbody id="upStruct"></tbody></table></div></div>' +
      '<div class="tool-sec"><span class="tool-lab">查询参数</span>' +
      '<div class="card"><table class="stat-table"><tbody id="upParams"></tbody></table></div></div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#upGo', root).addEventListener('click', parse);
    $('#upIn', root).addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) parse();
    });
    $('#upJson', root).addEventListener('click', () => {
      if (!Object.keys(lastParams).length) { LB.toast('请先解析一个 URL', 'info'); return; }
      /* 单值输出字符串，多值输出数组 */
      const flat = {};
      Object.keys(lastParams).forEach(k => { flat[k] = lastParams[k].length === 1 ? lastParams[k][0] : lastParams[k]; });
      LB.copyWithToast(JSON.stringify(flat, null, 2), '已复制 JSON');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; lastParams = {}; }

  LB.router.register('urlparse', { mount, unmount });
})();
