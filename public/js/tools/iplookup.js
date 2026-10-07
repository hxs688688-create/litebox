/* LiteBox v5 · tools/iplookup.js — IP 归属地查询（Step 26 · 六：只走同源 /api/ip）
 *
 * 变化：
 *   1) 后端已改成加密钥的查询服务，前端不再保留任何「直连第三方」兜底
 *      —— 上一版这里会在同源失败时直连 ipify / ipwho.is，
 *      按 Step 26「所有第三方调用走自己的后端代理」的要求全部删除，
 *      现在浏览器 Network 里只会出现 /api/ip。
 *   2) 后端不再返回 latitude / longitude / timezone / asn（新数据源没有这些字段），
 *      原「时区」格改成新字段 zone（UTC 偏移），ASN 格改成「版本」（IPv4 / IPv6）。
 *      —— 任务书要求「若 UI 依赖 latitude / longitude / timezone，改为可空处理」，
 *      这里连同不再提供的 ASN 一起收掉，避免出现两格永远「—」。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0; /* 请求代次：unmount 后返回的旧响应直接丢弃 */
  let lastRun = null; /* Step 8：记住最后一次查询，错误卡片「重新获取」用 */

  /* 同源接口 → 数据；失败时抛出后端给的那句中文原因（LB.api 在非 2xx 时
     只给「请求失败：HTTP nnn」，会把「未找到该 IP 的归属信息」丢掉） */
  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
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
    if (!r.ok) throw new Error((d && d.error && d.error.message) || 'IP 查询服务暂时不可用');
    return d;
  }

  /* Step 9：本机查询缓存 3 分钟 —— 切走再切回不重发 */
  function fetchSelf() {
    return LB.cache('iplookup:self', 3 * 60 * 1000, () => apiGet('/api/ip'));
  }

  /* 查指定 IP / 域名：同源 /api/ip?q=（Step 9：缓存 30 分钟） */
  function fetchOne(q) {
    return LB.cache('iplookup:' + q, 30 * 60 * 1000, () =>
      apiGet('/api/ip?q=' + encodeURIComponent(q)));
  }

  function render(d, self) {
    if (!rootEl) return;
    const kind = $('#ilKind', rootEl);
    kind.textContent = self ? '本机公网出口' : ('指定查询' + (d.query && d.query !== d.ip ? ' · ' + d.query : ''));
    $('#ilIP', rootEl).textContent = d.ip || '—';
    /* 后端已把国家码转成中文，这里直接显示 */
    $('#ilC', rootEl).textContent = (d.country || '—') + (d.region && d.country ? ' · ' + d.region : '');
    $('#ilCity', rootEl).textContent = d.city || '—';
    $('#ilOrg', rootEl).textContent = d.org || '—';
    $('#ilVer', rootEl).textContent = d.version || '—';
    $('#ilZone', rootEl).textContent = d.zone || '—';
    renderV6(d, self);
    $('#ilCard', rootEl).hidden = false;
  }

  /* Step 28 修正 · 二：出口是 IPv6 时说明清楚，并把同时拿到的 IPv4 归属折叠展示 */
  function renderV6(d, self) {
    const box = $('#ilV6', rootEl);
    box.className = 'il-v6';
    box.innerHTML = '';
    if (!d.isIpv6) { box.hidden = true; return; }
    box.hidden = false;
    const tip = document.createElement('p');
    tip.className = 'il-v6-tip';
    tip.textContent = 'ⓘ 这是您的 IPv6 出口地址。';
    box.appendChild(tip);

    const v4 = d.ipv4Info;
    if (v4 && v4.ip) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'il-v4-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = '您的 IPv4 出口：' + v4.ip;
      const detail = document.createElement('div');
      detail.className = 'il-v4-detail';
      detail.hidden = true;
      detail.innerHTML =
        '<div class="il-grid">' +
        '<div class="il-cell"><small>国家 / 地区</small><b>' + esc((v4.country || '—') + (v4.region && v4.country ? ' · ' + v4.region : '')) + '</b></div>' +
        '<div class="il-cell"><small>省州城市</small><b>' + esc(v4.city || '—') + '</b></div>' +
        '<div class="il-cell"><small>运营商 / 组织</small><b>' + esc(v4.org || '—') + '</b></div>' +
        '<div class="il-cell"><small>UTC 偏移</small><b>' + esc(v4.zone || '—') + '</b></div>' +
        '</div>';
      btn.addEventListener('click', () => {
        const open = detail.hidden;
        detail.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      box.appendChild(btn);
      box.appendChild(detail);
    } else if (self) {
      const hint = document.createElement('p');
      hint.className = 'il-v6-hint';
      hint.textContent = '没有取到对应的 IPv4 出口，可在上方输入框手动填入 IPv4 地址查询归属地。';
      box.appendChild(hint);
    }
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
    if (!HAS_API) {
      $('#ilCard', rootEl).hidden = true;
      $('#ilErr', rootEl).hidden = false;
      $('#ilErrTxt', rootEl).textContent = '该工具需要联网服务支持，本地文件预览方式打不开';
      return;
    }
    const my = ++seq;
    lastRun = { self: self, q: q };
    busy(true);
    $('#ilCard', rootEl).hidden = true;
    $('#ilErr', rootEl).hidden = true;
    const loadEl = $('#ilLoad', rootEl);
    loadEl.hidden = false;
    LB.ui.skeleton(loadEl, 3, 'card');
    try {
      const d = self ? await fetchSelf() : await fetchOne(q);
      if (my !== seq) return; /* 已切走或发起了新查询 */
      loadEl.hidden = true;
      render(d, self);
    } catch (e) {
      if (my !== seq) return;
      loadEl.hidden = true;
      $('#ilCard', rootEl).hidden = true;
      $('#ilErr', rootEl).hidden = false;
      $('#ilErrTxt', rootEl).textContent = (e && e.message) || (self
        ? '本机网络出口查询失败，请检查网络后重试'
        : '无法查询该 IP 或域名，请检查输入后重试');
      LB.fail('IP 查询', (e && e.message) || '查询失败', '检查输入和网络后点击重试');
    } finally {
      if (my === seq) busy(false);
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>IP 归属地查询</h1><p>查本机或任意 IP / 域名的归属地与运营商</p></div>' +
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
      '<div class="il-cell"><small>协议版本</small><b id="ilVer"></b></div>' +
      '<div class="il-cell"><small>UTC 偏移</small><b id="ilZone"></b></div>' +
      '</div>' +
      /* Step 28 修正 · 二：IPv6 出口说明 + 可展开的 IPv4 归属（非 IPv6 时整块隐藏） */
      '<div class="il-v6" id="ilV6" hidden></div>' +
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
