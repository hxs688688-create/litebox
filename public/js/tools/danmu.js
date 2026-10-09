/* LiteBox v5 · tools/danmu.js — 手持弹幕（Step 20 · A2：自 teleprompter 拆分为独立工具）
 *
 * 【定位】手机变灯牌：一句话、超大字、可滚动可静止，接机 / 应援 / 表白。
 *
 * 【结构】主设置页（文字 / 9 配色 / 方向 / 速度 / 粗细 / 特效 / 镜像 / 横竖排 / 预览）
 *   + 全屏容器 #danmu-fullscreen-container（文字显示层 + 默认隐藏的工具栏）。
 *
 * 【全屏交互】
 *   · 点「全屏播放」→ 整个容器进入全屏（requestFullscreen，webkit 兜底），只显示大字；
 *   · 点击屏幕 → 工具栏淡入，3 秒无操作自动隐藏；再次点击 → 立即隐藏；
 *   · 工具栏返回按钮 → 退出全屏（ESC / fullscreenchange 同步收尾）；
 *   · 全屏中可调字号 / 快速换色 / 滚动方向 / 速度；
 *   · 屏幕常亮：navigator.wakeLock（支持时），退出释放。
 *
 * 【配色】9 方案全部来自 tokens.css 的 --dm-bg-系列 与 --dm-fg-系列 语义变量，
 *   自定义方案由颜色选择器写入活动变量 --dm-bg / --dm-fg，零硬编码色。
 *
 * 【动画】CSS keyframes（合成器线程驱动）：横排 translateX 左/右滚，
 *   竖排（writing-mode:vertical-rl）translateY 上下滚；速度 1-10 → 单趟 2-20s。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const KEY = 'litebox_danmu';
  const MAX_LEN = 200;

  /* 9 配色方案：[id, 名称, 底色变量, 字色变量]（自定义单独处理） */
  const SCHEMES = [
    { v: 'classic', n: '经典', bg: '--dm-bg-classic', fg: '--dm-fg-classic' },
    { v: 'invert', n: '反白', bg: '--dm-bg-invert', fg: '--dm-fg-invert' },
    { v: 'green', n: '荧光绿', bg: '--dm-bg-green', fg: '--dm-fg-green' },
    { v: 'pink', n: '霓虹粉', bg: '--dm-bg-pink', fg: '--dm-fg-pink' },
    { v: 'ice', n: '冰蓝', bg: '--dm-bg-ice', fg: '--dm-fg-ice' },
    { v: 'yellow', n: '亮黄', bg: '--dm-bg-yellow', fg: '--dm-fg-yellow' },
    { v: 'redgold', n: '红金', bg: '--dm-bg-redgold', fg: '--dm-fg-redgold' },
    { v: 'sea', n: '海蓝', bg: '--dm-bg-sea', fg: '--dm-fg-sea' },
    { v: 'custom', n: '自定义', bg: '--dm-bg', fg: '--dm-fg' }
  ];
  /* 全屏工具栏的 5 个快速配色 */
  const QUICK = ['classic', 'green', 'pink', 'ice', 'yellow'];
  const DIRS = [['left', '⬅ 左滚'], ['right', '右滚 ➡'], ['none', '⏺ 不滚动']];
  const WEIGHTS = [['600', '标准'], ['800', '粗'], ['900', '极粗']];
  const EFFECTS = [['none', '无'], ['stroke', '描边'], ['neon', '霓虹'], ['gradient', '渐变'], ['beat', '节拍']];

  /* 速度 1-10 → 单趟秒数（越快越短） */
  function durOf(sp) { return 22 - Math.min(10, Math.max(1, sp)) * 2; }

  let rootEl = null;
  let st = {
    text: '', scheme: 'classic', dir: 'left', speed: 5, weight: '900',
    effect: 'none', mirror: false, vertical: false, size: 96,
    customBg: '#000000', customFg: '#ffffff'
  };

  /* 屏幕常亮 */
  let wakeLock = null;
  let onWakeRelease = null;
  async function requestWake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        wakeLock = await navigator.wakeLock.request('screen');
        onWakeRelease = () => { wakeLock = null; };
        wakeLock.addEventListener('release', onWakeRelease);
      }
    } catch (_) { /* 不支持或被拒：静默跳过 */ }
  }
  function releaseWake() {
    if (wakeLock) {
      if (onWakeRelease) wakeLock.removeEventListener('release', onWakeRelease);
      try { wakeLock.release(); } catch (_) {}
      wakeLock = null; onWakeRelease = null;
    }
  }

  /* ---------- 样式应用：全部走 CSS 变量与 class ---------- */

  function applyScheme() {
    const s = SCHEMES.find(x => x.v === st.scheme) || SCHEMES[0];
    const cs = getComputedStyle(document.documentElement);
    let bg = cs.getPropertyValue(s.bg).trim() || '#000000';
    let fg = cs.getPropertyValue(s.fg).trim() || '#ffffff';
    if (st.scheme === 'custom') {
      bg = st.customBg; fg = st.customFg;
    }
    /* 变量挂在工具页根上：预览舞台与全屏舞台同时继承 */
    rootEl.style.setProperty('--dm-bg', bg);
    rootEl.style.setProperty('--dm-fg', fg);
    $$('.dm-scheme .chip', rootEl).forEach(c => c.classList.toggle('on', c.dataset.s === st.scheme));
    $$('.dm-fs-c', rootEl).forEach(c => c.classList.toggle('on', c.dataset.q === st.scheme));
  }

  function applyStyle() {
    applyScheme();
    if (rootEl) {
      rootEl.style.setProperty('--dm-size', st.size + 'px');
      rootEl.style.setProperty('--dm-dur', durOf(st.speed) + 's');
      rootEl.style.setProperty('--dm-weight', st.weight);
    }
    $$('.danmu-stage', rootEl).forEach(stage => {
      stage.classList.toggle('dm-vertical', st.vertical);
      stage.classList.toggle('dm-mirror', st.mirror);
      EFFECTS.forEach(e => stage.classList.toggle('fx-' + e[0], st.effect === e[0]));
    });
    /* 控件同步 */
    $$('.dm-dir .chip', rootEl).forEach(c => c.classList.toggle('on', c.dataset.d === st.dir));
    $$('.dm-weight .chip', rootEl).forEach(c => c.classList.toggle('on', c.dataset.w === st.weight));
    $$('.dm-fx .chip', rootEl).forEach(c => c.classList.toggle('on', c.dataset.fx === st.effect));
    $$('.dm-vdir .chip', rootEl).forEach(c => c.classList.toggle('on', c.dataset.v === (st.vertical ? 'v' : 'h')));
    const mirror = $('#dmMirror', rootEl); if (mirror) mirror.checked = st.mirror;
    const spd = $('#dmSpeed', rootEl);
    if (spd) { spd.value = String(st.speed); const o = $('#dmSpeedV', rootEl); if (o) o.textContent = st.speed; }
    const size = $('#dmFsSize', rootEl);
    if (size) { size.value = String(st.size); const o = $('#dmFsSizeV', rootEl); if (o) o.textContent = st.size; }
    /* 内容 */
    $$('.danmu-content', rootEl).forEach(box => {
      box.textContent = st.text || '在这里输入弹幕内容';
      box.classList.toggle('dm-empty', !st.text);
    });
    restart();
    save();
  }

  /* 短文本不滚动直接居中；长文本才走滚动动画（预览与全屏两个舞台都处理） */
  function restart() {
    $$('.danmu-stage', rootEl).forEach(stage => {
      const tr = stage.querySelector('.danmu-content');
      if (!tr) return;
      tr.classList.remove('dm-scroll', 'dm-scroll-l', 'dm-scroll-r', 'dm-noscroll');
      if (st.dir === 'none') { stage.classList.add('dm-center'); tr.classList.add('dm-noscroll'); return; }
      void tr.offsetWidth;
      const fits = tr.offsetWidth <= stage.clientWidth - 40 && tr.offsetHeight <= stage.clientHeight - 40;
      if (fits) { stage.classList.add('dm-center'); tr.classList.add('dm-noscroll'); return; }
      stage.classList.remove('dm-center');
      tr.classList.add('dm-scroll', st.dir === 'right' ? 'dm-scroll-r' : 'dm-scroll-l');
    });
  }

  function setText(t) {
    st.text = String(t || '').slice(0, MAX_LEN);
    const ta = $('#dmTextArea', rootEl);
    if (ta && ta.value !== st.text) ta.value = st.text;
    const n = $('#dmCount', rootEl);
    if (n) n.textContent = st.text.length + '/' + MAX_LEN;
    applyStyle();
  }

  function save() { try { LB.storage.set(KEY, st); } catch (_) {} }
  function load() {
    try {
      const s = LB.storage.get(KEY, null);
      if (s && typeof s === 'object') st = Object.assign(st, s);
    } catch (_) {}
  }

  /* ---------- 全屏 ---------- */

  let fsOn = false;
  let barTimer = null;

  function fsContainer() { return $('#danmu-fullscreen-container', rootEl); }

  function showBar() {
    const bar = $('#dmFsBar', rootEl);
    if (!bar) return;
    bar.classList.add('show');
    if (barTimer) clearTimeout(barTimer);
    barTimer = setTimeout(hideBar, 3000);
  }
  function hideBar() {
    const bar = $('#dmFsBar', rootEl);
    if (bar) bar.classList.remove('show');
    if (barTimer) { clearTimeout(barTimer); barTimer = null; }
  }

  async function enterFullscreen() {
    const el = fsContainer();
    if (!el) return;
    if (!st.text.trim()) { LB.toast('先输入弹幕文字', 'info'); return; }
    el.hidden = false;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (_) { /* WebView 不支持：CSS 已让容器铺满视口 */ }
    fsOn = true;
    applyStyle();
    restart();
    showBar();
    requestWake();
  }

  async function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
    const el = fsContainer();
    if (el) el.hidden = true;
    fsOn = false;
    hideBar();
    releaseWake();
  }

  function onFsChange() {
    /* ESC 或系统手势退出全屏时同步收尾 */
    if (!document.fullscreenElement && fsOn) {
      fsOn = false;
      const el = fsContainer();
      if (el) el.hidden = true;
      hideBar();
      releaseWake();
    }
  }

  /* 全屏内点击：工具栏显示 ↔ 立即隐藏 */
  function onStageClick(e) {
    if (!fsOn) return;
    if (e.target.closest('#dmFsBar')) return;   /* 工具栏内点击不切换 */
    const bar = $('#dmFsBar', rootEl);
    if (bar && bar.classList.contains('show')) hideBar();
    else showBar();
  }

  /* ---------- 视图 ---------- */

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>手持弹幕</h1><p>手机变灯牌，全屏大字滚动，接机、应援、表白神器</p></div>' +
      '</div>' +
      '<div class="tool-body">' +

      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">弹幕文字</span>' +
      '<textarea class="inp" id="dmTextArea" rows="3" maxlength="200" placeholder="输入要展示的文字，如：一路平安" aria-label="弹幕文字"></textarea>' +
      '<div class="dm-text-meta"><b id="dmCount">0/200</b>' +
      '<button class="btn btn-ghost btn-sm" id="dmClear" type="button">清空</button></div>' +

      '<span class="tool-lab">配色方案</span>' +
      '<div class="dm-scheme hl-chips">' +
      SCHEMES.map(s => '<button class="chip' + (s.v === st.scheme ? ' on' : '') + '" data-s="' + s.v + '" type="button">' + s.n + '</button>').join('') +
      '</div>' +
      '<div class="dm-custom" id="dmCustom">' +
      '<label class="dm-lab">底色<input id="dmBgColor" type="color" value="' + st.customBg + '" aria-label="自定义底色"></label>' +
      '<label class="dm-lab">字色<input id="dmFgColor" type="color" value="' + st.customFg + '" aria-label="自定义字色"></label>' +
      '</div>' +

      '<div class="dm-grid">' +
      '<span class="tool-lab">滚动方向</span>' +
      '<div class="seg dm-dir">' + DIRS.map(d => '<button class="chip' + (st.dir === d[0] ? ' on' : '') + '" data-d="' + d[0] + '" type="button">' + d[1] + '</button>').join('') + '</div>' +
      '<label class="dm-lab">滚动速度 <output id="dmSpeedV">' + st.speed + '</output>' +
      '<input type="range" id="dmSpeed" min="1" max="10" step="1" value="' + st.speed + '"></label>' +
      '<span class="tool-lab">字体粗细</span>' +
      '<div class="seg dm-weight">' + WEIGHTS.map(w => '<button class="chip' + (st.weight === w[0] ? ' on' : '') + '" data-w="' + w[0] + '" type="button">' + w[1] + '</button>').join('') + '</div>' +
      '<span class="tool-lab">特效</span>' +
      '<div class="seg dm-fx">' + EFFECTS.map(e2 => '<button class="chip' + (st.effect === e2[0] ? ' on' : '') + '" data-fx="' + e2[0] + '" type="button">' + e2[1] + '</button>').join('') + '</div>' +
      '<span class="tool-lab">文字方向</span>' +
      '<div class="seg dm-vdir">' +
      '<button class="chip' + (!st.vertical ? ' on' : '') + '" data-v="h" type="button">➡ 横排</button>' +
      '<button class="chip' + (st.vertical ? ' on' : '') + '" data-v="v" type="button">⬇ 竖排</button>' +
      '</div>' +
      '<label class="chk-row"><input type="checkbox" id="dmMirror"' + (st.mirror ? ' checked' : '') + '><span>镜像翻转（对着镜子 / 车窗用）</span></label>' +
      '</div>' +
      '</div>' +

      /* —— 预览 —— */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">预览</span>' +
      '<div class="danmu-stage pos-middle" id="dmPreview">' +
      '<div class="danmu-content dm-empty">在这里输入弹幕内容</div>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="dmGo" type="button">▶️ 全屏播放</button>' +
      '</div>' +
      '</div>' +

      /* —— 全屏容器（文字层 + 隐藏工具栏） —— */
      '<div id="danmu-fullscreen-container" hidden>' +
      '<div class="danmu-stage pos-middle" id="dmStage">' +
      '<div class="danmu-content dm-empty">在这里输入弹幕内容</div>' +
      '</div>' +
      '<div class="dm-fs-bar" id="dmFsBar">' +
      '<button class="dm-fs-btn" id="dmFsBack" type="button">← 返回</button>' +
      '<div class="dm-fs-row">' +
      '<label class="dm-lab">字号 <output id="dmFsSizeV">' + st.size + '</output>' +
      '<input type="range" id="dmFsSize" min="40" max="260" step="4" value="' + st.size + '"></label>' +
      '</div>' +
      '<div class="dm-fs-row dm-fs-colors">' +
      QUICK.map(v => {
        const s = SCHEMES.find(x => x.v === v);
        return '<button class="dm-fs-c dm-c-' + v + '" data-q="' + v + '" type="button" aria-label="' + s.n + '">字</button>';
      }).join('') +
      '<button class="dm-fs-c dm-c-custom" data-q="custom" type="button" aria-label="自定义">D</button>' +
      '</div>' +
      '<div class="dm-fs-row">' +
      '<div class="seg dm-dir">' + DIRS.map(d => '<button class="chip' + (st.dir === d[0] ? ' on' : '') + '" data-d="' + d[0] + '" type="button">' + d[1] + '</button>').join('') + '</div>' +
      '</div>' +
      '<div class="dm-fs-row">' +
      '<label class="dm-lab">速度 <output id="dmFsSpeedV">' + st.speed + '</output>' +
      '<input type="range" id="dmFsSpeed" min="1" max="10" step="1" value="' + st.speed + '"></label>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '<p class="cd-note">全屏后只显示大字：点击屏幕唤出工具栏，3 秒无操作自动隐藏，再点立即隐藏；' +
      '返回按钮退出全屏。播放期间保持屏幕常亮（支持的设备）。颜色 / 方向 / 速度设置保存在本机。</p>' +
      '</div>'
    );
  }

  function bind(root) {
    const ta = $('#dmTextArea', rootEl);
    ta.addEventListener('input', () => setText(ta.value));
    $('#dmClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => setText('')));

    /* 配色 */
    $$('.dm-scheme .chip', root).forEach(c => c.addEventListener('click', () => {
      st.scheme = c.dataset.s;
      $('#dmCustom', root).hidden = st.scheme !== 'custom';
      applyStyle();
    }));
    $('#dmCustom', root).hidden = st.scheme !== 'custom';
    $('#dmBgColor', root).addEventListener('input', e => { st.customBg = e.target.value; if (st.scheme !== 'custom') st.scheme = 'custom'; applyStyle(); });
    $('#dmFgColor', root).addEventListener('input', e => { st.customFg = e.target.value; if (st.scheme !== 'custom') st.scheme = 'custom'; applyStyle(); });

    /* 方向 / 速度 / 粗细 / 特效 / 横竖 / 镜像（两处 .dm-dir 同步） */
    $$('.dm-dir .chip', root).forEach(c => c.addEventListener('click', () => { st.dir = c.dataset.d; applyStyle(); }));
    $('#dmSpeed', root).addEventListener('input', e => { st.speed = +e.target.value; applyStyle(); });
    $$('.dm-weight .chip', root).forEach(c => c.addEventListener('click', () => { st.weight = c.dataset.w; applyStyle(); }));
    $$('.dm-fx .chip', root).forEach(c => c.addEventListener('click', () => { st.effect = c.dataset.fx; applyStyle(); }));
    $$('.dm-vdir .chip', root).forEach(c => c.addEventListener('click', () => { st.vertical = c.dataset.v === 'v'; applyStyle(); }));
    $('#dmMirror', root).addEventListener('change', e => { st.mirror = e.target.checked; applyStyle(); });

    $('#dmGo', root).addEventListener('click', enterFullscreen);

    /* —— 全屏容器交互 —— */
    const cont = fsContainer();
    cont.addEventListener('click', onStageClick);
    $('#dmFsBack', root).addEventListener('click', exitFullscreen);
    $('#dmFsSize', root).addEventListener('input', e => { st.size = +e.target.value; $('#dmFsSizeV', root).textContent = st.size; applyStyle(); showBar(); });
    $('#dmFsSpeed', root).addEventListener('input', e => { st.speed = +e.target.value; $('#dmFsSpeedV', root).textContent = st.speed; applyStyle(); showBar(); });
    $$('.dm-fs-c', root).forEach(b => b.addEventListener('click', () => { st.scheme = b.dataset.q; applyStyle(); showBar(); }));
    $$('#dmFsBar .dm-dir .chip', root).forEach(c => c.addEventListener('click', () => { st.dir = c.dataset.d; applyStyle(); showBar(); }));

    document.addEventListener('fullscreenchange', onFsChange);
  }

  function mount(root) {
    rootEl = root;
    load();
    root.innerHTML = html();
    bind(root);
    const ta = $('#dmTextArea', rootEl);
    ta.value = st.text;
    $('#dmCount', rootEl).textContent = st.text.length + '/' + MAX_LEN;
    applyStyle();
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    document.removeEventListener('fullscreenchange', onFsChange);
    exitFullscreen();
    if (barTimer) { clearTimeout(barTimer); barTimer = null; }
    releaseWake();
    rootEl = null;
  }

  LB.router.register('danmu', { mount, unmount });
})();
