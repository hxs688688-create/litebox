/* LiteBox v5 · tools/disaster.js — 灾害预警（Step 28 · 四）
 *
 * 只请求同源 /api/disaster?city=&page=；界面上不出现任何第三方域名或来源标注。
 *
 * 【实现取舍】
 *   1) 按钮绑定用 addEventListener，不用内联 onclick —— 全站红线禁内联；
 *   2) icon 走后端给出的同源代理地址（满足「Network 只看到 /api/*」），
 *      图片加载失败时隐藏占位，不留破图；
 *   3) 卡片跳转用 <a target="_blank" rel="noopener">，链接是后端过滤过的 https
 *      政府官网页面，用户主动点击才离开；
 *   4) apiGet 自己读 body.error.message（与 express.js / wzrank.js 同一处理）。
 *
 * 类名沿用任务书给定的 .di-head / .di-list / .di-item / .di-icon / .di-content /
 * .di-title / .di-abstract / .di-time / .di-badge / .di-item.level-blue /
 * .level-yellow / .level-orange / .level-red。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;
  let city = '';        /* 当前生效的城市（空 = 全国） */
  let page = 1;
  let total = 0;
  let loading = false;

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    let r = null, text = '';
    try {
      r = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '查询超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '灾害预警服务暂时不可用');
    return d;
  }

  /* iconDesc 形如「暴雨 | 橙色预警」——按颜色词定级 */
  function levelClass(desc) {
    const s = String(desc || '');
    if (s.indexOf('蓝') >= 0) return ' level-blue';
    if (s.indexOf('橙') >= 0) return ' level-orange';
    if (s.indexOf('红') >= 0) return ' level-red';
    if (s.indexOf('黄') >= 0) return ' level-yellow';
    return '';
  }

  function itemHtml(x) {
    const link = /^https:\/\//i.test(x.url || '') ? x.url : '';
    return '<div class="di-item' + levelClass(x.iconDesc) + '" data-url="' + esc(link) + '"' +
      (link ? ' role="link" tabindex="0"' : '') + '>' +
      (x.icon
        ? '<img class="di-icon" src="' + esc(x.icon) + '" alt="" loading="lazy" decoding="async" />'
        : '<span class="di-icon di-icon-none" aria-hidden="true">⚠️</span>') +
      '<div class="di-content">' +
      '<div class="di-title">' + esc(x.title || '预警信息') + '</div>' +
      (x.abstract ? '<p class="di-abstract">' + esc(x.abstract) + '</p>' : '') +
      (x.pubTime ? '<div class="di-time">' + esc(x.pubTime) + '</div>' : '') +
      '</div>' +
      (x.iconDesc ? '<span class="di-badge">' + esc(x.iconDesc) + '</span>' : '') +
      '</div>';
  }

  function footHtml() {
    const more = page * 20 < total;
    return '<div class="di-acts">' +
      (more ? '<button class="btn btn-ghost btn-sm" id="diMore" type="button">加载更多</button>' : '') +
      '</div>' +
      '<p class="cd-note">⚠️ 预警信息实时变化，具体防御指引以官方发布为准。</p>';
  }

  function updateSum() {
    const sum = $('#diSum', rootEl);
    if (!sum) return;
    sum.hidden = false;
    sum.textContent = (city ? '「' + city + '」' : '全国') + '共 ' + total + ' 条';
  }

  function renderList(d, append) {
    const box = $('#diList', rootEl);
    const list = Array.isArray(d.list) ? d.list : [];
    if (append) {
      box.insertAdjacentHTML('beforeend', list.map(itemHtml).join(''));
    } else {
      box.innerHTML = list.length
        ? list.map(itemHtml).join('')
        : '<div class="di-none">暂时没有找到相关预警</div>';
    }
    $('#diFoot', rootEl).innerHTML = footHtml();
    const more = $('#diMore', rootEl);
    if (more) more.addEventListener('click', () => { page++; load(true); });
  }

  async function load(append) {
    if (!HAS_API) {
      const box = $('#diBody', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    if (loading) return;
    loading = true;
    const my = seq;
    const box = $('#diBody', rootEl);
    box.hidden = false;
    const btn = $('#diGo', rootEl);
    if (btn && !append) btn.disabled = true;
    if (!append) LB.ui.skeleton($('#diList', rootEl), 4, 'card');
    try {
      const d = await apiGet('/api/disaster?city=' + encodeURIComponent(city) +
        '&page=' + encodeURIComponent(String(page)), 12000);
      if (my !== seq) return;
      total = Number(d.total) || 0;
      updateSum();
      renderList(d, !!append);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '预警信息暂时无法获取';
      if (append) {
        LB.toast(msg, 'info');
        page = Math.max(1, page - 1);
      } else {
        $('#diList', rootEl).innerHTML = '';
        LB.ui.empty($('#diList', rootEl), {
          icon: '🌪️',
          title: msg,
          sub: '预警接口偶尔抽风，稍后重新查询',
          ctaText: '重新查询',
          onCta: () => { page = 1; load(false); }
        });
        LB.fail('灾害预警', msg, '检查网络后点击重试');
      }
    } finally {
      if (my === seq) {
        loading = false;
        if (btn) btn.disabled = false;
      }
    }
  }

  function search() {
    const raw = $('#diCity', rootEl).value.trim();
    /* 上游按汉字/字母检索，过长或含符号先拦一下，省一次请求 */
    if (raw && !/^[一-龥A-Za-z0-9]{1,12}$/.test(raw)) {
      LB.toast('城市名请控制在 12 个字以内', 'info');
      return;
    }
    city = raw;
    page = 1;
    total = 0;
    load(false);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>灾害预警</h1><p>全国气象灾害预警实时查询，按颜色分级</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="diBody">' +
      '<div class="card tool-sec di-head">' +
      '<input class="inp" id="diCity" maxlength="12" placeholder="输入城市名，如：北京 / 毕节 / 留空看全国" aria-label="城市名" />' +
      '<button class="btn btn-main" id="diGo" type="button">🔍 查询</button>' +
      '</div>' +
      '<p class="di-sum" id="diSum" hidden></p>' +
      '<div class="di-list" id="diList"></div>' +
      '<div class="di-foot" id="diFoot"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function openItem(el) {
    const url = el.getAttribute('data-url') || '';
    if (!/^https:\/\//i.test(url)) return;
    window.open(url, '_blank', 'noopener');
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#diGo', root).addEventListener('click', search);
    LB.enterSubmit($('#diCity', root), search);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { LB.hash.go('home'); return; }
      /* 摘要 3 行截断 —— 点击摘要先展开，不跳走 */
      const ab = e.target.closest('.di-abstract');
      if (ab) { ab.classList.toggle('open'); return; }
      const item = e.target.closest('.di-item');
      if (item) openItem(item);
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const item = e.target.closest('.di-item');
      if (item && e.target === item) openItem(item);
    });
    load(false); /* 任务书：进入即看全国列表 */
  }

  function unmount() {
    seq++;
    loading = false;
    city = '';
    page = 1;
    total = 0;
    rootEl = null;
  }

  LB.router.register('disaster', { mount, unmount });
})();
