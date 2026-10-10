/* LiteBox v5 · tools/shortvideo.js — 聚合解析（Step 26 · 二）
 *
 * 前端只请求同源 /api/shortvideo 与 /api/shortvideo-proxy，不直连任何第三方；
 * 解析出的封面 / 头像 / 图集 / 视频 / 背景音乐全部是后端给出的同源代理地址
 * （实测第三方 CDN 直链需要平台 Referer 且签名会过期，浏览器直连必然挂）。
 *
 * Step 26 变化：换到新的聚合解析契约后，结果多了统计数据、话题标签、
 * 背景音乐与作者扩展信息，按任务书分别渲染；图集支持点击放大（.sv-lightbox，
 * 沿用壁纸工具已有的 lightbox 思路，纯 class 控制显隐，不写内联样式）。
 *
 * Step 36 · 一：后端升级主备双通道（主失效自动切备），本页加「解析通道」
 *   下拉，选择存 localStorage；简介同步改为多平台口径。
 *
 * Step 38.2：下拉精简为「自动 + 备用通道 A/B/C/D」五项（用户要求），
 *   点单通道未配密钥时后端给出明确指引；界面上依旧不标注任何上游服务名。
 *
 * 关于按钮绑定：统一用「一次事件委托」绑在结果区上，与全站写法一致。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;
  let lastTitle = '';
  let lastData = null;

  /* Step 36 · 一 / Step 38.2：解析通道选择（auto / nf=备A / xy=备B /
     sk89=备C / qx=备D），本机记住；界面上不暴露上游服务名。
     备D=主通道的点名入口（免配置恒可用），A/B/C 需对应密钥 */
  const VIA_KEY = 'litebox_sv_via';
  const VIA_VALUES = ['auto', 'nf', 'xy', 'sk89', 'qx'];

  function viaOf() {
    const v = LB.storage.get(VIA_KEY, 'auto');
    return VIA_VALUES.indexOf(v) > -1 ? v : 'auto';
  }

  async function apiPost(path, body, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
    let r = null, text = '';
    try {
      r = await fetch(path, {
        method: 'POST',
        cache: 'no-store',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '解析超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '解析服务暂时不可用');
    return d;
  }

  /* 从分享口令里挑第一个链接（纯链接输入原样返回） */
  function firstUrl(text) {
    const m = String(text || '').match(/https?:\/\/[^\s，,、"'<>]+/i);
    return m ? m[0] : '';
  }

  function fileBase(title) {
    const s = String(title || '').replace(/[\\/:*?"<>|#\s@]+/g, '').slice(0, 24);
    return s || '作品';
  }

  function num(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
  }

  function statsHtml(s) {
    if (!s) return '';
    const cells = [
      ['❤️', '点赞', s.likes],
      ['💬', '评论', s.comments],
      ['⭐', '收藏', s.collects],
      ['↗️', '分享', s.shares]
    ].filter(c => Number(c[2]) > 0);
    if (!cells.length) return '';
    return '<div class="sv-stats">' + cells.map(c =>
      '<span class="sv-stat"><b>' + esc(num(c[2])) + '</b><small>' + c[0] + ' ' + c[1] + '</small></span>'
    ).join('') + '</div>';
  }

  function tagsHtml(tags) {
    if (!Array.isArray(tags) || !tags.length) return '';
    return '<div class="sv-tags">' + tags.slice(0, 12).map(t =>
      '<span class="sv-tag-item">#' + esc(String(t).replace(/^#/, '')) + '</span>'
    ).join('') + '</div>';
  }

  function authorHtml(d) {
    const a = d.author || {};
    const ext = d.authorExt || {};
    if (!a.nickname && !a.avatar) return '';
    return '<div class="sv-author">' +
      (a.avatar ? '<img class="sv-avatar" src="' + esc(a.avatar) + '" alt="" loading="lazy" data-fallback>' : '<span class="sv-avatar sv-avatar-none">👤</span>') +
      '<span class="sv-nick">' + esc(a.nickname || '匿名作者') + '</span>' +
      (ext.douyinId ? '<span class="sv-tag">ID ' + esc(ext.douyinId) + '</span>' : '') +
      (Number(ext.fans) > 0 ? '<span class="sv-tag">粉丝 ' + esc(num(ext.fans)) + '</span>' : '') +
      '</div>';
  }

  function musicHtml(d) {
    const m = d.music || {};
    if (!m.title && !m.url) return '';
    return '<div class="sv-music">' +
      (m.cover ? '<img class="sv-music-cover" src="' + esc(m.cover) + '" alt="" loading="lazy" data-fallback>' : '') +
      '<div class="sv-music-txt"><b>' + esc(m.title || '背景音乐') + '</b>' +
      (m.author ? '<small>' + esc(m.author) + '</small>' : '') + '</div>' +
      '</div>';
  }

  function renderImages(d) {
    const box = $('#svResult', rootEl);
    box.innerHTML =
      '<div class="card tool-sec sv-card">' +
      (d.title ? '<h3 class="sv-title">' + esc(d.title) + '</h3>' : '') +
      authorHtml(d) +
      '<div class="sv-images">' +
      d.images.map((u, i) =>
        '<img src="' + esc(u) + '" alt="第 ' + (i + 1) + ' 张" loading="lazy" data-fallback data-zoom>'
      ).join('') +
      '</div>' +
      statsHtml(d.stats) +
      tagsHtml(d.tags) +
      musicHtml(d) +
      '<div class="sv-actions">' +
      '<button class="btn btn-main" type="button" data-act="dl-all">⬇️ 下载全部图片</button>' +
      (d.music && d.music.url ? '<button class="btn btn-ghost" type="button" data-act="dl-music">🎵 下载背景音乐</button>' : '') +
      (d.title ? '<button class="btn btn-ghost" type="button" data-act="copy-title">📋 复制标题</button>' : '') +
      (d.sourceUrl ? '<a class="btn btn-ghost" href="' + esc(d.sourceUrl) + '" target="_blank" rel="noopener noreferrer">🔗 原链接</a>' : '') +
      '</div>' +
      '<p class="cd-note">点击图片可放大查看；共 ' + d.images.length + ' 张。</p>' +
      '</div>';
    bindImgFallback(box);
  }

  function renderVideo(d) {
    const box = $('#svResult', rootEl);
    if (!d.playUrl) {
      /* 图集和视频都没有 → 上游只给了文字信息，如实说明，不摆空播放器 */
      box.innerHTML = '<div class="card tool-sec sv-card">' +
        (d.title ? '<h3 class="sv-title">' + esc(d.title) + '</h3>' : '') +
        authorHtml(d) +
        (d.cover ? '<img class="sv-cover" src="' + esc(d.cover) + '" alt="封面" loading="lazy" data-fallback data-zoom>' : '') +
        statsHtml(d.stats) + tagsHtml(d.tags) +
        '<div class="empty-state"><div class="es-icon" aria-hidden="true">🤔</div>' +
        '<p class="es-title">这条作品没有取到可播放的视频地址</p>' +
        '<p class="es-sub">可能是作品已被删除、设为私密，或链接已过期</p></div></div>';
      bindImgFallback(box);
      return;
    }
    const name = fileBase(d.title) + '.mp4';
    box.innerHTML =
      '<div class="card tool-sec sv-card">' +
      (d.cover ? '<img class="sv-cover" src="' + esc(d.cover) + '" alt="封面" loading="lazy" data-fallback data-zoom>' : '') +
      (d.title ? '<h3 class="sv-title">' + esc(d.title) + '</h3>' : '') +
      authorHtml(d) +
      '<video class="sv-video" controls preload="metadata" playsinline src="' + esc(d.playUrl) + '"></video>' +
      statsHtml(d.stats) +
      tagsHtml(d.tags) +
      musicHtml(d) +
      '<div class="sv-actions">' +
      '<button class="btn btn-main" type="button" data-act="download" data-name="' + esc(name) + '">⬇️ 下载视频</button>' +
      (d.music && d.music.url ? '<button class="btn btn-ghost" type="button" data-act="dl-music">🎵 下载背景音乐</button>' : '') +
      (d.title ? '<button class="btn btn-ghost" type="button" data-act="copy-title">📋 复制标题</button>' : '') +
      (d.sourceUrl ? '<a class="btn btn-ghost" href="' + esc(d.sourceUrl) + '" target="_blank" rel="noopener noreferrer">🔗 原链接</a>' : '') +
      '</div>' +
      '<p class="cd-note">视频体积较大，下载进度以浏览器下载管理器为准。</p>' +
      '</div>';
    bindImgFallback(box);
  }

  function renderResult(d) {
    if (!rootEl) return;
    lastData = d;
    lastTitle = (d && d.title) || '';
    $('#svErr', rootEl).hidden = true;
    const type = String((d && d.contentType) || '');
    const isImages = type.indexOf('图') > -1 || (Array.isArray(d.images) && d.images.length && !d.playUrl);
    if (isImages) renderImages(d);
    else renderVideo(d);
  }

  /* 无内联样式：图片加载失败只加类名；可放大的图统一在此绑一次 */
  function bindImgFallback(box) {
    box.querySelectorAll('img[data-fallback]').forEach(img => {
      img.addEventListener('error', () => img.classList.add('sv-img-fail'), { once: true });
    });
  }

  function openLightbox(src) {
    const lb = $('#svLightbox', rootEl);
    const im = $('#svLbImg', rootEl);
    im.src = src;
    im.classList.remove('sv-img-fail');
    lb.hidden = false;
  }

  function closeLightbox() {
    const lb = $('#svLightbox', rootEl);
    if (!lb) return;
    lb.hidden = true;
    $('#svLbImg', rootEl).removeAttribute('src');
  }

  function showErr(msg) {
    if (!rootEl) return;
    $('#svResult', rootEl).innerHTML = '';
    const errBox = $('#svErr', rootEl);
    $('#svErrTxt', rootEl).textContent = msg || '解析失败，请检查链接是否有效';
    errBox.hidden = false;
  }

  async function parse() {
    if (!HAS_API) {
      showErr('该工具需要联网服务支持，本地文件预览方式打不开');
      return;
    }
    const raw = $('#svInput', rootEl).value.trim();
    if (!raw) { LB.toast('请粘贴分享链接', 'info'); return; }
    const send = firstUrl(raw) || raw;
    if (!/^https?:\/\//i.test(send)) {
      LB.toast('没找到链接，请把 App 里复制的整段内容粘贴进来', 'err');
      return;
    }
    const my = ++seq;
    $('#svErr', rootEl).hidden = true;
    const btn = $('#svGo', rootEl);
    btn.disabled = true;
    const loadBox = $('#svResult', rootEl);
    loadBox.hidden = false;
    LB.ui.skeleton(loadBox, 3, 'card');
    try {
      const via = viaOf();
      const d = await apiPost('/api/shortvideo?via=' + via, { url: send }, 20000);
      if (my !== seq) return;
      renderResult(d);
      LB.toast('解析完成', 'ok');
    } catch (e) {
      if (my !== seq) return;
      loadBox.hidden = true;
      const msg = (e && e.message) || '解析失败，请检查链接是否有效';
      showErr(msg);
      LB.fail('聚合解析', msg, '确认链接未过期后点击重试');
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }

  /* 下载走 fetch + blob：代理地址是同源，但响应没有 Content-Disposition:attachment，
     直接用 <a download> 也拿不到文件，必须先转成 blob。 */
  async function downloadOne(url, filename, noteEl) {
    LB.toast('正在准备下载…', 'info');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      LB.img.download(blob, filename);
      if (noteEl) noteEl.textContent = '已下载：' + filename;
      LB.toast('已开始下载', 'ok');
    } catch (_) {
      LB.fail('下载', '获取文件失败', '可在播放器上长按 / 右键另存');
    }
  }

  function extOf(url, fallback) {
    const m = String(url || '').match(/\.([a-z0-9]{2,4})(?=\/|$)/i);
    return m ? m[1].toLowerCase() : fallback;
  }

  function onResultClick(e) {
    const zoom = e.target.closest('[data-zoom]');
    if (zoom) { openLightbox(zoom.getAttribute('src')); return; }

    const img = e.target.closest('.sv-images img');
    if (img) {
      const box = $('#svResult', rootEl);
      const imgs = Array.from(box.querySelectorAll('.sv-images img'));
      const i = imgs.indexOf(img);
      if (i < 0) return;
      downloadOne(imgs[i].getAttribute('src'), fileBase(lastTitle) + '-' + (i + 1) + '.jpg', null);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const card = btn.closest('.sv-card');
    if (!card) return;
    if (act === 'copy-title') {
      const t = $('.sv-title', card);
      LB.copyNow(t ? t.textContent.trim() : '', '标题已复制');
    } else if (act === 'download') {
      const v = $('.sv-video', card);
      if (v) downloadOne(v.getAttribute('src'), btn.getAttribute('data-name') || 'video.mp4', $('.cd-note', card));
    } else if (act === 'dl-music') {
      const m = lastData && lastData.music;
      if (m && m.url) {
        downloadOne(m.url, fileBase(m.title || lastTitle) + '.' + extOf(m.url, 'mp3'), $('.cd-note', card));
      }
    } else if (act === 'dl-all') {
      const list = Array.from(card.querySelectorAll('.sv-images img'));
      const note = $('.cd-note', card);
      if (note) note.textContent = '正在下载 ' + list.length + ' 张图片…';
      /* 逐张错开 400ms：同一时刻发起多个 blob 下载，移动端浏览器只会保留第一个 */
      list.forEach((im, i) => {
        setTimeout(() => {
          const isLast = i === list.length - 1;
          downloadOne(im.getAttribute('src'), fileBase(lastTitle) + '-' + (i + 1) + '.jpg', isLast ? note : null);
        }, i * 400);
      });
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>聚合解析</h1><p>支持抖音、快手、小红书、B站、微博等数十个平台，解析视频、图集、背景音乐</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec">' +
      '<textarea class="inp sv-inp" id="svInput" rows="4" placeholder="粘贴抖音 / 快手 / 小红书 / B站 / 微博等分享链接或口令" aria-label="分享链接"></textarea>' +
      '<button class="btn btn-main sv-go" id="svGo" type="button">🔍 解析</button>' +
      '<label class="pz-lab sv-via-row">解析通道<select class="inp" id="svVia" aria-label="解析通道">' +
      '<option value="auto">自动（主通道失败自动换备用）</option>' +
      '<option value="nf">备用通道 A</option>' +
      '<option value="xy">备用通道 B</option>' +
      '<option value="sk89">备用通道 C</option>' +
      '<option value="qx">备用通道 D</option>' +
      '</select></label>' +
      '<p class="cd-note">直接粘贴 App 里复制的整段内容即可，工具会自动找出其中的链接。</p>' +
      '</div>' +
      '<div class="card tool-sec" id="svErr" hidden><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">解析失败</p>' +
      '<p class="es-sub" id="svErrTxt"></p>' +
      '<button class="btn btn-main es-cta" id="svRetry" type="button">重新解析</button>' +
      '</div></div>' +
      '<div id="svResult" hidden></div>' +
      '<p class="cd-note">请仅解析自己有权使用的公开作品，下载内容不得用于二次传播或商用。</p>' +
      '</div>' +
      '<div class="sv-lightbox" id="svLightbox" hidden>' +
      '<button class="sv-lb-close" id="svLbClose" type="button" aria-label="关闭">✕</button>' +
      '<img id="svLbImg" alt="放大查看" />' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    /* Step 36 · 一：通道下拉回显本机选择，切换即存（存下拉当前值，
       不能回读 viaOf() —— 那读到的是切换前的旧值，选择永远存不上） */
    const viaSel = $('#svVia', root);
    viaSel.value = viaOf();
    viaSel.addEventListener('change', () => {
      /* Step 36 教训：必须存下拉当前值（不能回读 viaOf() 的旧值），
         非法值由 viaOf() 在下次读取时归一 */
      LB.storage.set(VIA_KEY, viaSel.value);
    });
    /* 结果区整棵子树都是动态生成的，用一次事件委托收口 */
    $('#svResult', root).addEventListener('click', onResultClick);
    $('#svGo', root).addEventListener('click', parse);
    $('#svRetry', root).addEventListener('click', () => {
      $('#svInput', rootEl).focus();
      parse();
    });
    $('#svLightbox', root).addEventListener('click', e => {
      if (e.target.closest('#svLbClose') || e.target === $('#svLightbox', rootEl)) closeLightbox();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    lastTitle = '';
    lastData = null;
    rootEl = null;
  }

  LB.router.register('shortvideo', { mount, unmount });
})();
