/* LiteBox v5 · tools/llmapis.js — 大模型 API 速查（Step 18；Step 19 · 五 加"国内访问"）
 *
 * 【数据】vendor/dict/llm-apis.js（LB.dict.load('llmApis')），内置 15 家厂商：
 *   accessFromCN：'direct' 直连 / 'proxy' 需代理 / 'partial' 不稳定；
 *   兼容旧数据的 cnAccessible 布尔字段（true→direct / false→proxy）。
 *
 * 【交互】搜索框（按模型 ID 实时过滤）+ 厂商 chips（全部 / 单选厂商）+
 *   访问筛选 chips（全部 / 直连 / 代理）+ 按厂商分组的 details 表格：
 *   点厂商名折叠展开；分组头右侧「定价页」按钮 window.open(vendorUrl,
 *   '_blank', 'noopener')，open 事件里 stopPropagation 避免触发折叠。
 *   模型 ID 点击 LB.copyNow 复制。
 *
 * 【价格口径】美元 / 1M tokens（刊例快照），cache 列显示缓存命中价。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  let rootEl = null;
  let alive = false;
  let data = null;          /* dict 原始对象 */
  let filterVendor = '';    /* '' = 全部 */
  let filterAccess = '';    /* '' = 全部 | 'direct' | 'proxy' */
  let kw = '';

  /* accessFromCN 归一化（兼容旧 cnAccessible 布尔字段） */
  function accessOf(m) {
    if (m.accessFromCN) return m.accessFromCN;
    return m.cnAccessible ? 'direct' : 'proxy';
  }

  const CN_META = {
    direct: { cls: 'llm-cn-ok', txt: '🌏 直连' },
    proxy: { cls: 'llm-cn-proxy', txt: '🔀 代理' },
    partial: { cls: 'llm-cn-part', txt: '⚠️ 不稳定' }
  };

  /* 128000 → "128K"，1048576 → "1M"，2097152 → "2M" */
  function fmtCtx(n) {
    if (!n) return '—';
    if (n >= 1048576) {
      const m = n / 1048576;
      return (m % 1 ? m.toFixed(1) : m) + 'M';
    }
    return Math.round(n / 1024) + 'K';
  }

  function fmtPrice(n) {
    if (n == null) return '—';
    return '$' + (n < 0.1 ? n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : n.toFixed(2));
  }

  function badges(m) {
    const out = [];
    if (m.vision) out.push('<i class="llm-bdg">👁 视觉</i>');
    if (m.tools) out.push('<i class="llm-bdg">🔧 工具</i>');
    if (m.reasoning) out.push('<i class="llm-bdg llm-bdg-hot">🧠 推理</i>');
    if (m.cache != null) out.push('<i class="llm-bdg" title="缓存命中输入价 ' + fmtPrice(m.cache) + '/1M">💾 缓存</i>');
    return out.join('') || '<i class="llm-bdg llm-bdg-dim">纯文本</i>';
  }

  function matchModel(m) {
    if (filterAccess && accessOf(m) !== filterAccess) return false;
    if (!kw) return true;
    return m.id.toLowerCase().indexOf(kw) > -1;
  }

  /* 搜索同时匹配厂商名（需求：搜模型 ID / 厂商名），命中时展示该厂商全部模型 */
  function vendorHit(g) {
    return !!kw && g.vendor.toLowerCase().indexOf(kw) > -1;
  }

  function groupHTML(key, g) {
    const models = vendorHit(g) ? g.models.filter(m => !filterAccess || accessOf(m) === filterAccess) : g.models.filter(matchModel);
    /* 筛选厂商或搜索命中时自动展开；搜索无命中的组保持折叠 */
    const open = filterVendor ? ' open' : (kw || filterAccess ? (models.length ? ' open' : '') : '');
    let rows = models.map(m => {
      const cn = CN_META[accessOf(m)] || CN_META.proxy;
      return '<tr>' +
      '<td><button class="llm-mid" data-copy="' + esc(m.id) + '" type="button" title="点击复制模型 ID">' + esc(m.id) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></td>' +
      '<td class="llm-num">' + fmtCtx(m.context) + '</td>' +
      '<td class="llm-num">' + fmtCtx(m.maxOutput) + '</td>' +
      '<td class="llm-num">' + fmtPrice(m.inputPrice) + '</td>' +
      '<td class="llm-num">' + fmtPrice(m.outputPrice) + '</td>' +
      '<td class="llm-cn"><i class="' + cn.cls + '">' + cn.txt + '</i></td>' +
      '<td class="llm-bdgs">' + badges(m) + '</td>' +
      '</tr>';
    }).join('');
    return '<details class="llm-group"' + open + '>' +
      '<summary>' +
      '<span class="llm-gname">' + esc(g.vendor) + '</span>' +
      '<span class="llm-gcount">' + models.length + ' 个模型</span>' +
      '<span class="llm-garrow" aria-hidden="true">▾</span>' +
      '<button class="btn btn-ghost btn-sm llm-link" data-vendor="' + key + '" type="button">📄 定价页</button>' +
      '</summary>' +
      (models.length
        ? '<div class="llm-tbl-wrap"><table class="llm-tbl"><thead><tr>' +
          '<th>模型 ID</th><th>上下文</th><th>最大输出</th><th>输入 /1M</th><th>输出 /1M</th><th>国内访问</th><th>能力</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="llm-nomatch">没有匹配的模型</div>') +
      '</details>';
  }

  function render() {
    const host = $('#llmList', rootEl);
    if (!host) return;
    if (!data) return;
    const keys = Object.keys(data).filter(k => !filterVendor || k === filterVendor);
    const html = keys.map(k => groupHTML(k, data[k])).join('');
    const acc = m => !filterAccess || accessOf(m) === filterAccess;
    const any = keys.some(k => vendorHit(data[k]) || data[k].models.some(m => acc(m) && matchModel(m)));
    if (!any) {
      LB.ui.empty(host, { icon: '🔍', title: '没有匹配的模型', sub: '换个关键词或筛选条件试试，比如 gpt、claude、gemini' });
      return;
    }
    host.innerHTML = html;
  }

  function renderChips() {
    const box = $('#llmChips', rootEl);
    const total = Object.keys(data).reduce((n, k) => n + data[k].models.length, 0);
    const chips = ['<button class="chip' + (filterVendor === '' ? ' on' : '') + '" data-vendor="" type="button">全部 ' + total + '</button>'];
    Object.keys(data).forEach(k => {
      chips.push('<button class="chip' + (filterVendor === k ? ' on' : '') + '" data-vendor="' + k + '" type="button">' +
        esc(data[k].vendor) + ' ' + data[k].models.length + '</button>');
    });
    box.innerHTML = chips.join('');
    /* Step 19 · 五：访问筛选 chips（全部 / 直连 / 代理） */
    const ab = $('#llmAccChips', rootEl);
    if (!ab) return;
    const accChips = [
      ['<button class="chip' + (filterAccess === '' ? ' on' : '') + '" data-acc="" type="button">🌐 全部</button>'],
      ['<button class="chip' + (filterAccess === 'direct' ? ' on' : '') + '" data-acc="direct" type="button">🌏 直连</button>'],
      ['<button class="chip' + (filterAccess === 'proxy' ? ' on' : '') + '" data-acc="proxy" type="button">🔀 代理</button>']
    ];
    ab.innerHTML = accChips.join('');
  }

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>大模型 API 速查</h1><p>上下文窗口、输入输出价格与能力徽章，点模型 ID 直接复制</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<input class="inp" id="llmSearch" type="search" inputmode="search" placeholder="搜索模型 ID 或厂商名，如 gpt-4o、deepseek" autocomplete="off">' +
      '<div class="llm-chips" id="llmChips"></div>' +
      '<div class="llm-chips" id="llmAccChips"></div>' +
      '<div class="llm-list" id="llmList"></div>' +
      '<p class="cd-note">价格单位：美元 / 100 万 tokens（刊例快照，以各厂商定价页实时价为准）；「💾 缓存」悬停可看缓存命中价；「国内访问」指 API 端点在大陆网络的一般可达性，实际以你的网络环境为准。</p>' +
      '</div>' +
      '</div>';
  }

  function bind() {
    rootEl.addEventListener('click', e => {
      const back = e.target.closest('[data-back]');
      if (back) { LB.hash.go('home'); return; }

      /* 定价页按钮：preventDefault 阻止 summary 默认折叠 + 停止冒泡 */
      const link = e.target.closest('.llm-link');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        const g = data[link.getAttribute('data-vendor')];
        if (g && g.vendorUrl) window.open(g.vendorUrl, '_blank', 'noopener');
        return;
      }

      /* 模型 ID 复制 */
      const mid = e.target.closest('[data-copy]');
      if (mid) {
        LB.copyNow(mid.getAttribute('data-copy'));
        return;
      }

      /* 厂商 chips */
      const chip = e.target.closest('#llmChips .chip');
      if (chip) {
        filterVendor = chip.getAttribute('data-vendor') || '';
        renderChips();
        render();
        return;
      }

      /* 访问筛选 chips（全部 / 直连 / 代理） */
      const acc = e.target.closest('#llmAccChips .chip');
      if (acc) {
        filterAccess = acc.getAttribute('data-acc') || '';
        renderChips();
        render();
      }
    });
    $('#llmSearch', rootEl).addEventListener('input', e => {
      kw = e.target.value.trim().toLowerCase();
      render();
    });
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    filterVendor = '';
    filterAccess = '';
    kw = '';
    root.innerHTML = html();
    bind();
    LB.ui.skeleton($('#llmList', root), 3, 'card');
    LB.dict.load('llmApis').then(d => {
      if (!alive) return;
      data = d;
      renderChips();
      render();
    }).catch(() => {
      if (!alive) return;
      LB.ui.empty($('#llmList', rootEl), { icon: '⚠️', title: '数据加载失败', sub: '请检查网络后重进本工具' });
    });
  }

  function unmount() {
    alive = false;
    rootEl = null;
    data = null;
  }

  LB.router.register('llmapis', { mount, unmount });
})();
