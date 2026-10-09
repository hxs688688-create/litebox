/* LiteBox v5 · tools/speedtest.js — 网速测试（多节点流式下载，实时速率 + 评级） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  /* 测速源：按顺序尝试，第一个有效即用 */
  const SP_SRCS = [
    { name: 'Cloudflare', url: 'https://speed.cloudflare.com/__down?bytes=30000000' },
    { name: 'npmmirror', url: 'https://registry.npmmirror.com/typescript/-/typescript-5.5.4.tgz' },
    { name: 'jsDelivr', url: 'https://cdn.jsdelivr.net/npm/typescript@5.5.4/lib/typescript.js' }
  ];

  /* 评级（Mbps 下行） */
  function grade(v) {
    if (v >= 100) return ['🚀', '极速：8K 串流 / 大文件无压力'];
    if (v >= 50) return ['⚡', '很快：4K 视频 / 多任务流畅'];
    if (v >= 25) return ['✅', '流畅：高清视频 / 网课无压力'];
    if (v >= 10) return ['🌐', '日常：网页 / 社交 / 1080p'];
    if (v >= 3) return ['🐢', '较慢：基本可用，加载偏久'];
    return ['📟', '拥挤：请检查网络连接'];
  }

  let rootEl = null;
  let running = false;
  let abortCtrl = null;   /* unmount 时中断 fetch */
  let curReader = null;   /* unmount 时 reader.cancel() */
  let barTimer = 0;       /* 进度条定时器 */

  /* 单源流式下载测速（任务给定逻辑），onLive 实时上报 Mbps */
  async function runOne(src, onLive, signal) {
    const t0 = performance.now();
    const r = await fetch(src.url + (src.url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store', signal: signal });
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
    const rd = r.body.getReader();
    curReader = rd;
    let bytes = 0, lastT = t0, lastB = 0;
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      bytes += value.length;
      const now = performance.now();
      if (now - lastT > 300) {
        const live = (bytes - lastB) * 8 / ((now - lastT) / 1000) / 1e6; /* 实时速率 */
        onLive(live);
        lastT = now; lastB = bytes;
      }
      if (performance.now() - t0 > 12000) { try { rd.cancel(); } catch (_) {} break; } /* 12 秒兜底 */
    }
    const secs = Math.max(0.5, (performance.now() - t0) / 1000);
    return bytes * 8 / secs / 1e6;
  }

  function fmt(v) { return v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toFixed(1); }

  function setBar(p) { $('#spFill', rootEl).style.width = Math.min(100, Math.max(0, p)) + '%'; }

  async function run() {
    if (running || !rootEl) return;
    running = true;
    abortCtrl = new AbortController();
    const btn = $('#spGo', rootEl);
    btn.disabled = true;
    btn.textContent = '⏳ 测速中…';
    $('#spGrade', rootEl).textContent = '';
    $('#spSrc', rootEl).textContent = '';
    setBar(4);
    clearInterval(barTimer);
    barTimer = setInterval(() => {
      const w = parseFloat($('#spFill', rootEl).style.width) || 4;
      if (w < 95) setBar(w + 1.5);
    }, 220);

    let mbps = NaN;
    for (const src of SP_SRCS) {
      try {
        $('#spSrc', rootEl).textContent = '节点：' + src.name;
        const v = await runOne(src, live => { $('#spNum', rootEl).textContent = fmt(live); }, abortCtrl.signal);
        if (v > 0) { mbps = v; break; } /* 第一个有效结果即用 */
      } catch (e) {
        if (e && e.name === 'AbortError') { mbps = NaN; break; } /* 主动中断：不再尝试下一源 */
        continue; /* 该源失败，尝试下一个 */
      }
    }

    clearInterval(barTimer);
    curReader = null;
    abortCtrl = null;
    if (!rootEl) { running = false; return; } /* 已 unmount */

    running = false;
    btn.disabled = false;
    btn.textContent = '🔄 再测一次';
    if (isNaN(mbps)) {
      setBar(0);
      $('#spNum', rootEl).textContent = '—';
      $('#spSrc', rootEl).textContent = '';
      $('#spGrade', rootEl).textContent = '❌ 测速失败，请检查网络后重试';
      return;
    }
    setBar(100);
    $('#spNum', rootEl).textContent = fmt(mbps);
    const g = grade(mbps);
    $('#spGrade', rootEl).textContent = g[0] + ' ' + g[1];
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>网速测试</h1><p>多节点下载测速，实时速度与网络评级</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec sp-card">' +
      '<div class="sp-numrow"><span class="sp-num" id="spNum">—</span><span class="sp-unit">Mbps 下载速度</span></div>' +
      '<div class="sp-bar"><i class="sp-fill" id="spFill"></i></div>' +
      '<div class="sp-grade" id="spGrade"></div>' +
      '<div class="sp-src" id="spSrc"></div>' +
      '<button class="btn btn-main sp-go" id="spGo" type="button">🚀 开始测速</button>' +
      '</div>' +
      '<p class="cd-note">测速节点自动选择，约需 6 秒。测速会下载约 30MB 数据，注意流量。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    running = false;
    $('#spGo', root).addEventListener('click', run);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    clearInterval(barTimer);
    if (abortCtrl) { try { abortCtrl.abort(); } catch (_) {} }
    if (curReader) { try { curReader.cancel(); } catch (_) {} }
    abortCtrl = null;
    curReader = null;
    running = false;
    rootEl = null;
  }

  LB.router.register('speedtest', { mount, unmount });
})();
