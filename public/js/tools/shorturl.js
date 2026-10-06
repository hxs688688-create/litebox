/* LiteBox v5 · tools/shorturl.js — 短网址生成
   Step 14：国内短链 API 优先（suol.cc → xiaoqi），失败回退 is.gd / tinyurl。
   注：xiaoqi 未返回 CORS 头，浏览器直连会被拦截，故经同源 /api/shorturl 代理兜一层。 */
(function () {
  const { $ } = LB.dom;
  let rootEl = null;
  let shortUrl = '';

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>短网址生成</h1><p>把长链接变成短网址，支持复制与一键打开</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">长链接</span>' +
      '<input class="inp" id="suIn" placeholder="https://example.com/very/long/url" inputmode="url" autocomplete="off" spellcheck="false"></div>' +
      '<button class="btn btn-main js-primary-submit" id="suGo" type="button">生成短网址</button>' +
      '<p class="tip-err" id="suErr" hidden></p>' +
      '<div class="tool-sec" id="suBox"><span class="tool-lab">结果</span>' +
      '<div class="res-card"><div class="rc-lab">短链接</div>' +
      '<div class="rc-val mono" id="suOut">—</div></div>' +
      '</div>' +
      '<div id="suActions" hidden>' +
      '<button class="btn btn-ghost" id="suCopy" type="button">复制短链</button> ' +
      '<button class="btn btn-ghost" id="suOpen" type="button">打开</button>' +
      '</div>' +
      '<p class="tip-dim">生成短网址需要联网，若暂时失败请稍后重试。</p>' +
      '</div>'
    );
  }

  function setLoading(on) {
    const box = $('#suBox', rootEl);
    const btn = $('#suGo', rootEl);
    btn.disabled = on;
    if (on) {
      box.innerHTML = '<div class="loading-box"><div class="spinner"></div><div class="lb-tip">正在生成短网址…</div></div>';
    } else {
      box.innerHTML =
        '<span class="tool-lab">结果</span>' +
        '<div class="res-card"><div class="rc-lab">短链接</div>' +
        '<div class="rc-val mono" id="suOut">' + (shortUrl ? LB.dom.esc(shortUrl) : '—') + '</div></div>';
    }
  }

  /* 各家返回结构不同（s_url / data.url / url / shorturl / 纯文本），统一挑出第一个合法短链 */
  function pickShort(data) {
    if (!data) return '';
    if (typeof data === 'string') {
      const t = data.trim();
      try { data = JSON.parse(t); } catch (_) { return /^https?:\/\//i.test(t) ? t : ''; }
    }
    if (typeof data !== 'object') return '';
    const cands = [data.s_url, data.url, data.short, data.shorturl, data.data && data.data.url];
    for (const c of cands) {
      if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) return c.trim();
    }
    return '';
  }

  async function generateShortUrl(longUrl) {
    const enc = encodeURIComponent(longUrl);

    /* 1) 同源代理优先：服务端请求不受同源限制，国内短链服务（suol.cc / xiaoqi）大多
          未返回可用的 CORS 头，浏览器直连会被拦；代理内部同样按 国内 API → is.gd/tinyurl 依次尝试。 */
    if (HAS_API) {
      try {
        const d = await LB.api.getJSON('/api/shorturl?url=' + enc, { timeout: 12000 });
        const short = pickShort(d);
        if (short) return short;
      } catch (_) { /* 无后端或后端失败 → 走直连 */ }
    }

    /* 2) 国内免费短链接 API 直连（无需 key） */
    const apis = [
      { name: 'suol.cc', url: 'https://api.suol.cc/v1/dwz_free.php?url=' + enc + '&suol_type=1' },
      { name: 'xiaoqi', url: 'https://xiaoqi.icofun.cn/API/dwz.php?url=' + enc }
    ];

    for (const api of apis) {
      try {
        const r = await LB.api.get(api.url, { timeout: 8000 });
        if (!r.ok) continue;
        const short = pickShort(r.data);
        if (short) return short;
      } catch (_) { /* 试下一个 */ }
    }

    /* 3) 降级：is.gd / tinyurl */
    try {
      const d = await LB.api.getJSON('https://is.gd/create.php?format=json&url=' + enc, { timeout: 8000 });
      const short = pickShort(d);
      if (short) return short;
    } catch (_) { /* 落入下一个 */ }
    try {
      const r = await LB.api.get('https://tinyurl.com/api-create.php?url=' + enc, { timeout: 8000 });
      if (r.ok) {
        const short = pickShort(r.data);
        if (short) return short;
      }
    } catch (_) { /* 全部失败 */ }

    throw new Error('短链接生成失败，请稍后重试');
  }

  async function run() {
    const input = $('#suIn', rootEl);
    const err = $('#suErr', rootEl);
    const raw = (input.value || '').trim();
    err.hidden = true;
    if (!/^https?:\/\//i.test(raw)) {
      err.textContent = '请输入以 http:// 或 https:// 开头的链接';
      err.hidden = false;
      return;
    }
    shortUrl = '';
    setLoading(true);
    try {
      shortUrl = await generateShortUrl(raw);
    } catch (e) {
      shortUrl = '';
    } finally {
      setLoading(false);
    }
    if (shortUrl) {
      $('#suActions', rootEl).hidden = false;
      LB.toast('生成成功', 'ok');
    } else {
      $('#suActions', rootEl).hidden = true;
      $('#suOut', rootEl).textContent = '生成失败，请稍后重试';
    }
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#suGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#suIn', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    $('#suCopy', root).addEventListener('click', () => {
      if (shortUrl) LB.copyNow(shortUrl, '短链接已复制');
    });
    $('#suOpen', root).addEventListener('click', () => {
      if (shortUrl) window.open(shortUrl, '_blank', 'noopener');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; shortUrl = ''; }

  LB.router.register('shorturl', { mount, unmount });
})();
