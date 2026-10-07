/* LiteBox v5 · tools/quicklinks.js — 快捷收藏夹（网址收藏 / 搜索 / 分类 / 复制 / 打开，本机保存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_quicklinks';

  let rootEl = null;
  let links = []; /* [{ id, name, url, cat }] */

  /* URL 校验：可省略协议，自动补 https://；仅接受 http/https */
  function validURL(u) {
    try {
      const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
      return /^https?:$/.test(x.protocol) ? x.href : '';
    } catch { return ''; }
  }

  function save() { LB.storage.set(KEY, links); }

  function rowHTML(l) {
    const ic = (l.name || '?').trim().charAt(0).toUpperCase();
    return '<div class="ql-row">' +
      '<span class="ql-ic">' + esc(ic) + '</span>' +
      '<div class="ql-info"><b>' + esc(l.name) + '</b>' +
      '<small>' + esc(l.cat ? l.cat + ' · ' : '') + esc(l.url) + '</small></div>' +
      '<div class="ql-acts">' +
      '<button class="ql-btn" data-copy="' + l.id + '" type="button">复制</button>' +
      '<a class="ql-btn" href="' + esc(l.url) + '" target="_blank" rel="noopener">打开</a>' +
      '<button class="ql-btn" data-del="' + l.id + '" type="button">删除</button>' +
      '</div>' +
      '</div>';
  }

  function render() {
    const q = $('#qlSearch', rootEl).value.trim().toLowerCase();
    const list = links.filter(l =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.url.toLowerCase().includes(q) ||
      (l.cat || '').toLowerCase().includes(q)
    );
    $('#qlCnt', rootEl).textContent = list.length + ' 个';
    const listEl = $('#qlList', rootEl);
    if (!list.length) {
      /* Step 8：标准空状态（区分"一条都没有"与"搜索无结果"两种场景） */
      if (links.length) {
        LB.ui.empty(listEl, {
          icon: '🔍',
          title: '没有匹配的收藏',
          sub: '换个关键词试试，或清空搜索框查看全部'
        });
      } else {
        LB.ui.empty(listEl, {
          icon: '⚡',
          title: '还没有收藏',
          sub: '把常用网址存进来，一点就打开',
          ctaText: '添加第一个网址',
          onCta: () => { const inp = $('#qlName', rootEl); if (inp) inp.focus(); }
        });
      }
    } else {
      listEl.innerHTML = list.map(rowHTML).join('');
    }
  }

  function add() {
    const name = $('#qlName', rootEl).value.trim();
    const url = validURL($('#qlUrl', rootEl).value.trim());
    const cat = $('#qlCat', rootEl).value.trim();
    if (!name) { LB.toast('请输入名称', 'info'); return; }
    if (!url) { LB.toast('网址无效，请检查', 'info'); return; }
    links.unshift({ id: 'l' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36), name, url, cat });
    save();
    $('#qlName', rootEl).value = '';
    $('#qlUrl', rootEl).value = '';
    $('#qlCat', rootEl).value = '';
    render();
    LB.toast('已添加收藏', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>快捷收藏夹</h1><p>保存常用网站与链接，本机管理、搜索、分类和一键复制</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">添加网址</span>' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="qlName" maxlength="24" placeholder="名称（如：GitHub）" />' +
      '<input class="inp" id="qlUrl" maxlength="200" placeholder="网址（如：github.com）" />' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="qlCat" maxlength="12" placeholder="分类（可选，如：开发）" />' +
      '<button class="btn btn-main" id="qlAdd" type="button">＋ 添加网址</button>' +
      '</div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="qlSearch" maxlength="30" placeholder="搜索名称 / 网址 / 分类…" />' +
      '<span class="tool-lab" id="qlCnt">0 个</span>' +
      '</div>' +
      '</div>' +
      '<div class="ql-rows" id="qlList"></div>' +
      '<p class="cd-note">网址可省略 https:// 前缀（自动补全）；数据保存在本设备浏览器中。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    links = Array.isArray(saved) ? saved.filter(l => l && typeof l.name === 'string' && typeof l.url === 'string') : [];
    render();
    $('#qlAdd', root).addEventListener('click', add);
    $('#qlSearch', root).addEventListener('input', render);
    $('#qlList', root).addEventListener('click', e => {
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const l = links.find(x => x.id === cp.dataset.copy);
        if (l) LB.copyWithToast(l.url, '链接已复制');
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        /* Step 10：删除二次确认 */
        LB.confirm(del, () => {
          links = links.filter(x => x.id !== del.dataset.del);
          save();
          render();
          LB.toast('已删除', 'ok');
        }, 3000, { iconOnly: true });
      }
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('quicklinks', { mount, unmount });
})();
