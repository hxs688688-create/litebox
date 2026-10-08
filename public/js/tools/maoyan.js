/* LiteBox v5 · tools/maoyan.js — 实时猫眼票房（Step 26 · 四）
 *
 * 只请求同源 /api/maoyan；界面上不出现任何第三方域名或来源标注。
 * 任务书：51 条数据首屏只渲染前 10 条 +「展开全部」（避免一次塞 51 个节点）。
 * 排名 1-3 用金 / 银 / 铜徽章，颜色全部走 tokens 变量（.my-rank1/2/3）。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const FIRST = 10;

  let rootEl = null;
  let seq = 0;
  let rows = [];

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    let r = null, text = '';
    try {
      r = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '加载超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '票房服务暂时不可用');
    return d;
  }

  function rowHtml(x) {
    const rank = Number(x.rank) || 0;
    const medal = rank >= 1 && rank <= 3 ? ' my-rank' + rank : '';
    const meta = [
      x.boxRate ? '占比 ' + x.boxRate : '',
      x.sessions ? '排片 ' + x.sessions + ' 场' : '',
      x.sessionRate ? x.sessionRate : '',
      x.avgPeople ? '场均 ' + x.avgPeople : '',
      x.occupancy ? '上座 ' + x.occupancy : ''
    ].filter(Boolean).join(' · ');
    return '<div class="my-item">' +
      '<span class="my-rank' + medal + '">' + (rank || '—') + '</span>' +
      '<div class="my-main">' +
      '<b class="my-name">' + esc(x.name || '') + '</b>' +
      (x.info ? '<small class="my-info">' + esc(x.info) + '</small>' : '') +
      (meta ? '<small class="my-meta">' + esc(meta) + '</small>' : '') +
      '</div>' +
      '<b class="my-box">' + esc(x.totalBox || '—') + '</b>' +
      '</div>';
  }

  function renderList(upto) {
    const listEl = $('#myList', rootEl);
    listEl.innerHTML = rows.slice(0, upto).map(rowHtml).join('');
    const more = $('#myMore', rootEl);
    if (rows.length > upto) {
      more.hidden = false;
      more.textContent = '展开全部 ' + rows.length + ' 部';
    } else {
      more.hidden = true;
    }
  }

  function render(d) {
    rows = Array.isArray(d.list) ? d.list : [];
    const top = $('#myTop', rootEl);
    top.textContent = d.updated ? '更新时间 ' + String(d.updated).split('.')[0] : '';
    top.hidden = !d.updated;
    if (!rows.length) {
      LB.ui.empty($('#myList', rootEl), { icon: '🎟️', title: '暂无票房数据', sub: '稍后再试' });
      $('#myMore', rootEl).hidden = true;
      return;
    }
    renderList(FIRST);
  }

  async function load() {
    if (!HAS_API) {
      const box = $('#myList', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const my = ++seq;
    const listEl = $('#myList', rootEl);
    $('#myErr', rootEl).hidden = true;
    listEl.hidden = false;
    LB.ui.skeleton(listEl, 6, 'list');
    try {
      const d = await apiGet('/api/maoyan', 12000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      listEl.hidden = true;
      $('#myErr', rootEl).hidden = false;
      $('#myErrTxt', rootEl).textContent = (e && e.message) || '票房数据暂时无法获取';
      LB.fail('实时票房', (e && e.message) || '暂时无法获取', '检查网络后点击重试');
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>实时票房</h1><p>当日票房排行，总票房、排片、上座率一屏看懂</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<p class="my-top" id="myTop" hidden></p>' +
      '<div class="card my-card">' +
      '<div class="my-list" id="myList" hidden></div>' +
      '<button class="btn btn-ghost my-more" id="myMore" type="button" hidden>展开全部</button>' +
      '<div id="myErr" hidden><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">暂时无法获取票房数据</p>' +
      '<p class="es-sub" id="myErrTxt"></p>' +
      '<button class="btn btn-main es-cta" id="myRetry" type="button">重新获取</button>' +
      '</div></div>' +
      '</div>' +
      '<p class="cd-note">票房为实时估算，最终以官方结算为准。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#myMore', root).addEventListener('click', () => renderList(rows.length));
    $('#myRetry', root).addEventListener('click', load);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load();
  }

  function unmount() {
    seq++;
    rows = [];
    rootEl = null;
  }

  LB.router.register('maoyan', { mount, unmount });
})();
