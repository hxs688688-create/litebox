/* LiteBox v5 · tools/shorturl.js — 短网址生成（is.gd 优先，tinyurl 兜底） */
(function () {
  const { $ } = LB.dom;
  let rootEl = null;
  let shortUrl = '';

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
      '<p class="tip-dim">服务由 is.gd / tinyurl 提供，生成需联网。</p>' +
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
      /* 首选 is.gd */
      try {
        const data = await LB.api.getJSON('https://is.gd/create.php?format=json&url=' + encodeURIComponent(raw));
        if (data && data.shorturl) { shortUrl = data.shorturl; }
      } catch (_) { /* 落入兜底 */ }
      /* 兜底 tinyurl（纯文本返回） */
      if (!shortUrl) {
        const txt = await LB.api.get('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(raw));
        if (txt.ok && typeof txt.data === 'string' && /^https?:\/\//.test(txt.data.trim())) {
          shortUrl = txt.data.trim();
        }
      }
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
      LB.copyWithToast(shortUrl);
    });
    $('#suOpen', root).addEventListener('click', () => {
      if (shortUrl) window.open(shortUrl, '_blank', 'noopener');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; shortUrl = ''; }

  LB.router.register('shorturl', { mount, unmount });
})();
