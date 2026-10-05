/* LiteBox v5 · tools/webarchive.js — 网页快照（同源优先 → archive.org + Arquivo.pt 降级） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;
  let lastClean = '';

  async function directJSON(url, timeout) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || 6000);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* URL 预处理：无协议补 https://；只保留 hostname + path（去 query / hash） */
  function cleanUrl(s) {
    let q = (s || '').trim();
    if (!q) return '';
    if (!/^https?:\/\//i.test(q)) q = 'https://' + q;
    try {
      const u = new URL(q);
      return (u.hostname + u.pathname).replace(/\/+$/, '');
    } catch (_) {
      return '';
    }
  }

  /* 时间戳 20240115120000 → 2024-01-15 */
  function fmtTs(ts) {
    const s = String(ts || '');
    return s.length >= 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : s;
  }

  /* 源 1 · archive.org availability（拿最近 1 条） */
  async function viaAvailability(url) {
    const d = await directJSON('https://archive.org/wayback/available?url=' + encodeURIComponent(url));
    const c = d && d.archived_snapshots && d.archived_snapshots.closest;
    if (!c || !c.timestamp) return [];
    return [{ timestamp: c.timestamp, url: c.url || ('https://web.archive.org/web/' + c.timestamp + '/' + url), source: 'web.archive.org' }];
  }

  /* 源 2 · Arquivo.pt timemap（每行一个 JSON，容错解析） */
  async function viaArquivo(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let text;
    try {
      const r = await fetch('https://arquivo.pt/wayback/timemap/json/' + encodeURIComponent(url), { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      text = await r.text();
    } finally {
      clearTimeout(timer);
    }
    let arr = [];
    try {
      const parsed = JSON.parse(text);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const o = JSON.parse(t);
          if (o && (o.timestamp || o.ts)) arr.push(o);
        } catch (_) { /* 跳过坏行 */ }
      }
    }
    return arr.filter(o => o && (o.timestamp || o.ts)).map(o => ({
      timestamp: o.timestamp || o.ts,
      url: o.uri || o.url || ('https://arquivo.pt/wayback/' + (o.timestamp || o.ts) + '/' + url),
      source: 'Arquivo.pt'
    }));
  }

  async function fetchArchive(url) {
    if (HAS_API) {
      try {
        const d = await LB.api.getJSON('/api/archive?url=' + encodeURIComponent(url), { timeout: 6000 });
        if (d && Array.isArray(d.items) && d.items.length) {
          return d.items.map(x => ({ timestamp: x.timestamp, url: x.url, source: x.source || 'LiteBox' }));
        }
      } catch (_) { /* 降级 */ }
    }
    /* 双源并行，谁成功用谁，结果合并去重 */
    const settled = await Promise.allSettled([viaAvailability(url), viaArquivo(url)]);
    const all = [];
    const seen = new Set();
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !Array.isArray(s.value)) continue;
      for (const it of s.value) {
        const k = String(it.timestamp) + '|' + it.url;
        if (seen.has(k)) continue;
        seen.add(k);
        all.push(it);
      }
    }
    all.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    return all.slice(0, 15);
  }

  function render(items) {
    if (!rootEl) return;
    const box = $('#waList', rootEl);
    if (!items.length) {
      $('#waNone', rootEl).hidden = false;
      box.hidden = true;
    } else {
      $('#waNone', rootEl).hidden = true;
      box.innerHTML = items.map(x =>
        '<div class="wa-item">' +
        '<div class="wa-meta"><b>' + esc(fmtTs(x.timestamp)) + '</b><span class="wa-src">' + esc(x.source || '') + '</span></div>' +
        '<a class="wa-open" href="' + esc(x.url || '#') + '" target="_blank" rel="noopener">打开 ↗</a>' +
        '</div>'
      ).join('');
      box.hidden = false;
    }
    $('#waResult', rootEl).hidden = false;
  }

  async function run() {
    const url = cleanUrl($('#waQ', rootEl).value);
    if (!url) { LB.toast('请输入网址，如 github.com', 'info'); return; }
    lastClean = url;
    const my = ++seq;
    const btn = $('#waGo', rootEl);
    btn.disabled = true;
    btn.textContent = '⏳ 查询中…';
    $('#waResult', rootEl).hidden = true;
    try {
      const items = await fetchArchive(url);
      if (my !== seq) return;
      render(items);
    } catch (e) {
      if (my !== seq) return;
      $('#waNone', rootEl).hidden = false;
      $('#waList', rootEl).hidden = true;
      $('#waResult', rootEl).hidden = false;
    } finally {
      if (my === seq) {
        btn.disabled = false;
        btn.textContent = '🏛️ 查快照';
      }
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>网页快照</h1><p>查网页在 Web Archive 的历史存档快照</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="wa-search">' +
      '<input class="inp" id="waQ" maxlength="200" placeholder="网址，如 github.com（不带 https:// 也行）" />' +
      '<button class="btn btn-main btn-sm" id="waGo" type="button">🏛️ 查快照</button>' +
      '</div>' +
      '<div class="card tool-sec wa-res" id="waResult" hidden>' +
      '<div id="waList"></div>' +
      '<p class="wa-none" id="waNone" hidden>暂时没有直接返回历史记录，但不代表网页没有存档</p>' +
      '<div class="wa-fallback">' +
      '<a class="btn btn-ghost btn-sm wa-fb" id="waCal" href="#" target="_blank" rel="noopener">📄 打开网页存档日历</a>' +
      '<a class="btn btn-ghost btn-sm wa-fb" id="waArq" href="#" target="_blank" rel="noopener">🗂️ 打开 Arquivo.pt</a>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">快照数据来自 web.archive.org 与 Arquivo.pt；查询时自动去掉参数部分以便命中更多存档。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#waGo', root).addEventListener('click', run);
    $('#waQ', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    /* 两个兜底入口：动态填当前清理后的 URL */
    $('#waCal', root).addEventListener('click', e => {
      const u = lastClean || ($('#waQ', root).value.trim() && cleanUrl($('#waQ', root).value)) || '';
      if (u) e.currentTarget.href = 'https://web.archive.org/web/*/' + u;
      else { e.preventDefault(); LB.toast('请先输入网址', 'info'); }
    });
    $('#waArq', root).addEventListener('click', e => {
      const u = lastClean || ($('#waQ', root).value.trim() && cleanUrl($('#waQ', root).value)) || '';
      if (u) e.currentTarget.href = 'https://arquivo.pt/wayback/' + u;
      else { e.preventDefault(); LB.toast('请先输入网址', 'info'); }
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    rootEl = null;
  }

  LB.router.register('webarchive', { mount, unmount });
})();
