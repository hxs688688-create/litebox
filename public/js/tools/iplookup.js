/* LiteBox v5 · tools/iplookup.js — 本机公网 IP 查询（Step 29 · 一）
 *
 * Step 29 变化：
 *   1) 结果区只显示 IP 一行（居中大字号）——归属地信息改成 <details> 折叠，
 *      默认收起，展开才看到网格（任务书：可省略或折叠）。
 *   2) 后端现在保证「即使上游归属地查询失败也返回真实 IP」，
 *      所以这里不再因归属地缺失而整卡报错；d.hasGeo=false 时隐藏折叠块。
 *   3) IPv6 提示与 IPv4 出口展开逻辑保留，挪进折叠块内部。
 * 安全：仍只请求同源 /api/ip，界面不出现任何第三方域名或来源标注。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0; /* 请求代次：unmount 后返回的旧响应直接丢弃 */
  let lastRun = null; /* Step 8：记住最后一次查询，错误卡片「重新获取」用 */

  /* 同源接口 → 数据；失败时抛出后端给的那句中文原因（LB.api 在非 2xx 时
     只给「请求失败：HTTP nnn」，会把后端的具体提示丢掉） */
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
    if (!r.ok) throw new Error((d && (d.msg || (d.error && d.error.message))) || 'IP 查询服务暂时不可用');
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
    $('#ilVer', rootEl).textContent = d.ip ? (d.version || (d.isIpv6 ? 'IPv6' : 'IPv4')) : '';
    renderGeo(d, self);
    $('#ilCard', rootEl).hidden = false;
  }

  /* Step 31 · 二：归属地不再折叠，全部平铺 —— IP / 国家地区 / 城市 / ISP·ASN / 时区
     各占一行，字号分级（IP 最大 → 国家 → 城市 → 明细）。
     原先的 <details> 折叠与「IPv4 出口」展开按钮一并去掉。 */
  function renderGeo(d, self) {
    const box = $('#ilGeoBox', rootEl);
    box.innerHTML = '';

    const rows = [];
    const row = (cls, label, value) => {
      rows.push('<div class="il-row ' + cls + '">' +
        '<small class="il-row-k">' + esc(label) + '</small>' +
        '<b class="il-row-v">' + esc(value || '—') + '</b>' +
        '</div>');
    };

    const countryLine = (d.country || '') + (d.region && d.country ? ' ' + d.region : '');
    if (!d.hasGeo && !d.isIpv6) {
      /* 归属地整块查不到：仍平铺，只给一行说明，不铺四个空值 */
      box.innerHTML = '<div class="il-row il-r-none"><small class="il-row-k">归属地</small>' +
        '<b class="il-row-v">暂未取到归属地信息，可稍后重试</b></div>';
      return;
    }
    row('il-r-country', '国家 / 地区', countryLine);
    row('il-r-city', '城市', d.city);
    /* ISP 与 ASN 同行展示：ASN 来自 Cloudflare 自带的请求元信息，可能为空 */
    row('il-r-isp', '运营商 / ASN', [d.org, d.asn].filter(Boolean).join(' · '));
    row('il-r-zone', '时区', d.zone);
    box.innerHTML = rows.join('');

    /* IPv6 出口说明：本机查询且确实是 IPv6 时保留一句提示（不再是折叠入口）。
       IPv4 出口直接平铺成一行，原来的「点击展开」按钮按要求移除。 */
    if (d.isIpv6) {
      const tip = document.createElement('p');
      tip.className = 'il-v6-tip';
      tip.textContent = 'ⓘ 这是您的 IPv6 出口地址。';
      box.appendChild(tip);

      const v4 = d.ipv4Info;
      if (v4 && v4.ip) {
        const wrap = document.createElement('div');
        wrap.className = 'il-v4-rows';
        wrap.innerHTML =
          '<div class="il-v4-t">IPv4 出口</div>' +
          '<div class="il-row il-r-country"><small class="il-row-k">国家 / 地区</small><b class="il-row-v">' +
          esc(((v4.country || '') + (v4.region && v4.country ? ' ' + v4.region : '')) || '—') + '</b></div>' +
          '<div class="il-row il-r-city"><small class="il-row-k">城市</small><b class="il-row-v">' + esc(v4.city || '—') + '</b></div>' +
          '<div class="il-row il-r-isp"><small class="il-row-k">运营商 / ASN</small><b class="il-row-v">' + esc(v4.org || '—') + '</b></div>';
        box.appendChild(wrap);
      } else if (self) {
        const hint = document.createElement('p');
        hint.className = 'il-v6-hint';
        hint.textContent = '没有取到对应的 IPv4 出口，可在上方输入框手动填入 IPv4 地址查询归属地。';
        box.appendChild(hint);
      }
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
    LB.ui.skeleton(loadEl, 2, 'card');
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
      '<div><h1>IP 归属地查询</h1><p>查看本机公网 IP，或查询任意 IP / 域名</p></div>' +
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
      /* Step 31 · 二：结果全平铺，不再折叠 —— IP 大字 + 归属地逐行 */
      '<div class="card tool-sec il-card" id="ilCard" hidden>' +
      '<div class="il-bigip" id="ilIP"></div>' +
      '<div class="il-kind" id="ilKind"></div>' +
      '<div class="il-ver" id="ilVer"></div>' +
      '<div id="ilGeoBox"></div>' +
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
