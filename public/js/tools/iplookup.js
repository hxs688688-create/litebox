/* LiteBox v5 · tools/iplookup.js — IP 归属地查询（同源优先 → 直连降级） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  /* file:// 预览时 /api/ 不可达（fetch 会 reject 并向 Console 打错），直接走降级；
     http(s) 部署环境严格"同源优先"。 */
  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  /* 国家代码 → 中文映射（Step 17：与 functions/api/ip.js 同表。
     同源 /api/ip 响应已是中文；仅 file:// 直连兜底 ipwho.is 时用 code 转换） */
  const COUNTRY_CN = {
    CN: '中国', US: '美国', JP: '日本', SG: '新加坡',
    HK: '中国香港', TW: '中国台湾', MO: '中国澳门', KR: '韩国',
    GB: '英国', DE: '德国', CA: '加拿大', AU: '澳大利亚',
    FR: '法国', NL: '荷兰', IN: '印度', RU: '俄罗斯',
    VN: '越南', TH: '泰国', MY: '马来西亚', ID: '印度尼西亚',
    IT: '意大利', ES: '西班牙', PH: '菲律宾', BR: '巴西'
  };

  let rootEl = null;
  let seq = 0; /* 请求代次：unmount 后返回的旧响应直接丢弃 */
  let lastRun = null; /* Step 8：记住最后一次查询，错误卡片「重新获取」用 */

  /* 同源优先，直连降级（任务约定模板） */
  async function tryAPI(path, fallbackFn) {
    if (!HAS_API) {
      if (fallbackFn) return fallbackFn();
      throw new Error('服务暂时不可用');
    }
    try {
      return await LB.api.getJSON(path, { timeout: 6000 });
    } catch (_) {
      if (fallbackFn) return fallbackFn();
      throw new Error('服务暂时不可用');
    }
  }

  /* 直连第三方 GET（自带 6 秒超时） */
  async function directJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ipwho.is 字段 → 协议格式（国家用 country_code 查中文映射） */
  function fromIpwho(d, q) {
    return {
      ip: d.ip || q, country: COUNTRY_CN[d.country_code] || d.country || '', region: d.region || '', city: d.city || '',
      org: (d.connection && d.connection.org) || '',
      asn: (d.connection && d.connection.asn ? 'AS' + d.connection.asn : '') || '',
      timezone: (d.timezone && d.timezone.id) || '', query: q, source: 'IPWHO'
    };
  }

  function cnCountry(c) { return COUNTRY_CN[c] || c || '—'; }

  /* 查本机：/api/ip → ipify
     Step 9：LB.cache 缓存 3 分钟 —— 切走再切回不重发（修复此前每次 mount 重发 3 次请求）
     Step 15：去掉 ipapi.co 这一级直连 —— 它**不返回 CORS 头**，浏览器直连必然被拦，
     只会往控制台丢一条 "blocked by CORS policy" 错误（验收要求 Console 0 报错）。
     ipify 返回 Access-Control-Allow-Origin: *，是唯一真正可用的浏览器直连兜底。 */
  async function fetchSelf() {
    return LB.cache('iplookup:self', 3 * 60 * 1000, function () {
      return tryAPI('/api/ip', async function () {
        const d = await directJSON('https://api.ipify.org?format=json');
        return { ip: d.ip, country: '', region: '', city: '', org: '', asn: '', timezone: '', query: d.ip, source: 'ipify' };
      });
    });
  }

  /* 查指定 IP / 域名：/api/ip?q= → ipwho.is（Step 9：缓存 30 分钟） */
  async function fetchOne(q) {
    return LB.cache('iplookup:' + q, 30 * 60 * 1000, function () {
      return tryAPI('/api/ip?q=' + encodeURIComponent(q), async function () {
        const d = await directJSON('https://ipwho.is/' + encodeURIComponent(q));
        if (!d || d.success === false) throw new Error('notfound');
        return fromIpwho(d, q);
      });
    });
  }

  /* source → 显示名 */
  function render(d, viaFallback, self) {
    if (!rootEl) return;
    const kind = $('#ilKind', rootEl);
    kind.textContent = self ? '本机公网出口' : ('指定查询' + (d.query && d.query !== d.ip ? ' · ' + d.query : ''));
    $('#ilIP', rootEl).textContent = d.ip || '—';
    $('#ilC', rootEl).textContent = cnCountry(d.country) + (d.region && d.country ? ' · ' : '') + (d.region || '');
    $('#ilCity', rootEl).textContent = d.city || '—';
    $('#ilOrg', rootEl).textContent = d.org || '—';
    $('#ilASN', rootEl).textContent = d.asn || '—';
    $('#ilTZ', rootEl).textContent = d.timezone || '—';
    $('#ilCard', rootEl).hidden = false;
  }

  function busy(on) {
    $('#ilGo', rootEl).disabled = on;
    $('#ilMe', rootEl).disabled = on;
  }

  /* Step 8：错误卡片「重新获取」 */
  function retryLast() {
    if (!lastRun) return;
    if (lastRun.self) run(true);
    else if (lastRun.q) run(false);
  }

  async function run(self) {
    const q = $('#ilQ', rootEl).value.trim();
    if (!self && !q) { LB.toast('请输入 IP 或域名，留空可点"本机"查询', 'info'); return; }
    const my = ++seq;
    lastRun = { self: self, q: q };
    busy(true);
    /* Step 8：请求期间显示骨架屏，出错显示标准错误卡片 */
    $('#ilCard', rootEl).hidden = true;
    $('#ilErr', rootEl).hidden = true;
    const loadEl = $('#ilLoad', rootEl);
    loadEl.hidden = false;
    LB.ui.skeleton(loadEl, 3, 'card');
    try {
      const d = self ? await fetchSelf() : await fetchOne(q);
      if (my !== seq) return; /* 已切走或发起了新查询 */
      loadEl.hidden = true;
      render(d, !HAS_API || d.source !== '同源', self);
    } catch (e) {
      if (my !== seq) return;
      loadEl.hidden = true;
      $('#ilCard', rootEl).hidden = true;
      $('#ilErr', rootEl).hidden = false;
      $('#ilErrTxt', rootEl).textContent = self
        ? '本机网络出口查询失败，请检查网络后重试'
        : '无法查询该 IP 或域名，请检查输入后重试';
      LB.fail('IP 查询', self ? '查询服务暂时不可用' : '查询失败或输入有误', '检查输入和网络后点击重试');
    } finally {
      if (my === seq) busy(false);
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>IP 归属地查询</h1><p>查本机或任意 IP / 域名的归属地、运营商、时区</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="il-search">' +
      '<input class="inp" id="ilQ" maxlength="80" placeholder="留空查本机 · 或输入 IP / 域名" />' +
      '<button class="btn btn-main btn-sm js-primary-submit" id="ilGo" type="button">🔍 查询</button>' +
      '<button class="btn btn-ghost btn-sm" id="ilMe" type="button">📍 本机</button>' +
      '</div>' +
      '<div id="ilLoad" hidden></div>' +
      /* Step 8：错误态标准空状态卡片（含重新获取 CTA） */
      '<div class="card tool-sec" id="ilErr" hidden><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">获取失败</p>' +
      '<p class="es-sub" id="ilErrTxt"></p>' +
      '<button class="btn btn-main es-cta" id="ilRetry" type="button">重新获取</button>' +
      '</div></div>' +
      '<div class="card tool-sec il-card" id="ilCard" hidden>' +
      '<div class="il-bigip" id="ilIP"></div>' +
      '<div class="il-kind" id="ilKind"></div>' +
      '<div class="il-grid">' +
      '<div class="il-cell"><small>国家 / 地区</small><b id="ilC"></b></div>' +
      '<div class="il-cell"><small>省州城市</small><b id="ilCity"></b></div>' +
      '<div class="il-cell"><small>运营商 / 组织</small><b id="ilOrg"></b></div>' +
      '<div class="il-cell"><small>ASN</small><b id="ilASN"></b></div>' +
      '<div class="il-cell"><small>时区</small><b id="ilTZ"></b></div>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">IP 归属是网络出口位置；若使用 VPN / 代理，结果通常是代理出口。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#ilGo', root).addEventListener('click', () => run(false));
    $('#ilMe', root).addEventListener('click', () => run(true));
    $('#ilRetry', root).addEventListener('click', retryLast);
    $('#ilQ', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(false); });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    run(true); /* 打开自动查本机 */
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    rootEl = null;
  }

  LB.router.register('iplookup', { mount, unmount });
})();
