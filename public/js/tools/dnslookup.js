/* LiteBox v5 · tools/dnslookup.js — DNS 查询（同源优先 → 阿里 / Google DoH 直连降级） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA'];
  /* DoH Answer[].type 数字 → 记录名 */
  const TYPE_NUM = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 257: 'CAA' };

  let rootEl = null;
  let seq = 0;

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

  /* 域名预处理：去掉 https:// 前缀和路径部分 */
  function cleanDomain(s) {
    let q = (s || '').trim();
    q = q.replace(/^https?:\/\//i, '');
    q = q.split('/')[0];
    q = q.split(':')[0];
    return q;
  }

  /* 解析：/api/dns → 阿里 DoH → Google DoH */
  async function resolve(name, type) {
    return tryAPI('/api/dns?name=' + encodeURIComponent(name) + '&type=' + type, async function () {
      const q = 'name=' + encodeURIComponent(name) + '&type=' + type;
      try {
        return await directJSON('https://dns.alidns.com/resolve?' + q);
      } catch (_) {
        return await directJSON('https://dns.google/resolve?' + q);
      }
    });
  }

  function render(d, name, type) {
    if (!rootEl) return;
    const st = d && (d.Status !== undefined ? d.Status : d.status);
    const out = $('#dnOut', rootEl);

    if (st === 3) {
      out.innerHTML = '<div class="dn-empty2">域名不存在（NXDOMAIN）</div>';
      out.hidden = false;
      return;
    }
    if (st !== 0 && st !== undefined) {
      out.innerHTML = '<div class="dn-empty2">查询未成功，状态码 ' + esc(String(st)) + '</div>';
      out.hidden = false;
      return;
    }
    const ans = d && d.Answer;
    if (!ans || !ans.length) {
      out.innerHTML = '<div class="dn-empty2">无 ' + esc(type) + ' 记录</div>';
      out.hidden = false;
      return;
    }
    let h = '';
    for (const a of ans) {
      const t = (typeof a.type === 'number' ? TYPE_NUM[a.type] : a.type) || type;
      const ttl = a.TTL !== undefined ? a.TTL : a.ttl;
      h += '<div class="dn-rec">' +
        '<div class="dn-meta"><span class="dn-type">' + esc(t) + '</span>' +
        '<span>TTL ' + esc(ttl === undefined ? '—' : String(ttl)) + '</span>' +
        '<span class="dn-name">' + esc(a.name || name) + '</span></div>' +
        '<div class="dn-data">' + esc(a.data || '') + '</div>' +
        '</div>';
    }
    out.innerHTML = h;
    out.hidden = false;
  }

  async function run() {
    const q = cleanDomain($('#dnQ', rootEl).value);
    if (!q) { LB.toast('请输入域名，如 baidu.com', 'info'); return; }
    const type = $('#dnType', rootEl).value;
    const my = ++seq;
    const btn = $('#dnGo', rootEl);
    btn.disabled = true;
    btn.textContent = '⏳ 解析中…';
    try {
      const d = await resolve(q, type);
      if (my !== seq) return;
      render(d, q, type);
    } catch (e) {
      if (my !== seq) return;
      $('#dnOut', rootEl).innerHTML = '<div class="dn-empty2">解析失败，请检查网络后重试</div>';
      $('#dnOut', rootEl).hidden = false;
    } finally {
      if (my === seq) {
        btn.disabled = false;
        btn.textContent = '🧭 解析';
      }
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>DNS 查询</h1><p>A / AAAA / CNAME / MX / TXT 等记录解析，DoH 节点直连</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="dn-row">' +
      '<input class="inp" id="dnQ" maxlength="120" placeholder="域名，如 baidu.com" />' +
      '<select class="inp dn-type-sel" id="dnType">' +
      TYPES.map(t => '<option value="' + t + '"' + (t === 'A' ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select>' +
      '<button class="btn btn-main btn-sm js-primary-submit" id="dnGo" type="button">🧭 解析</button>' +
      '</div>' +
      '<div class="empty-state dn-empty" id="dnEmpty">' +
      '<div class="es-icon">🧭</div>' +
      '<div class="es-title">输入域名选择记录类型即可解析</div>' +
      '<div class="es-sub">支持 A / AAAA / CNAME / MX / NS / TXT / SOA</div>' +
      '</div>' +
      '<div id="dnOut" hidden></div>' +
      '<p class="cd-note">优先走 LiteBox 同源服务，失败自动切换阿里 / Google DoH；查询结果仅供网络诊断参考。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#dnGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#dnQ', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    $('#dnQ', root).addEventListener('input', () => {
      const has = $('#dnQ', root).value.trim().length > 0;
      $('#dnEmpty', root).hidden = has;
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    rootEl = null;
  }

  LB.router.register('dnslookup', { mount, unmount });
})();
