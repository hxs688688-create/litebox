/* LiteBox v5 · tools/wheel.js — 随机点名转盘（canvas 扇形 + easeOutQuart 旋转 + 指针反推索引） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY_NAMES = 'litebox_wheel_names';
  const KEY_HIST = 'litebox_wheel_hist';
  const CX = 210, CY = 210, R = 202;
  const TAU = Math.PI * 2;

  let rootEl = null;
  let canvas = null;
  let ctx = null;
  let names = [];        /* 解析后的名单 */
  let hist = [];         /* 抽中历史，最新在前，最多 24 条 */
  let currentRot = 0;    /* 当前累计旋转角（弧度） */
  let spinning = false;
  let rafId = 0;

  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };

  /* 按 换行/逗号/顿号/分号/Tab 分割 + trim + 去重 */
  function parseNames(text) {
    return [...new Set(text.split(/[\n,，、;；\t]+/).map(s => s.trim()).filter(Boolean))];
  }

  function saveNames() { LB.storage.set(KEY_NAMES, names); }
  function saveHist() { LB.storage.set(KEY_HIST, hist.slice(0, 24)); }

  /* 名字超过 8 字截断加省略号 */
  const shortName = n => n.length > 8 ? n.slice(0, 7) + '…' : n;
  const fontSize = n => Math.min(17, Math.max(12, R / Math.max(6, n) + 8));

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, 420, 420);
    const N = names.length;

    if (N < 2) {
      /* 虚线圆 + 提示文字（颜色读 token，不硬编码） */
      const css = getComputedStyle(document.documentElement);
      const dim = css.getPropertyValue('--fg3').trim();
      ctx.save();
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = dim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = dim;
      ctx.font = '600 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(N === 0 ? '请在右侧输入名单' : '名单至少需要 2 人', CX, CY);
      ctx.restore();
      return;
    }

    const step = TAU / N;
    for (let i = 0; i < N; i++) {
      const a0 = i * step + currentRot;
      const a1 = a0 + step;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, a0, a1);
      ctx.closePath();
      /* HSL 相邻明暗交替（转盘扇形为数据可视化绘制色，按 N 动态生成） */
      ctx.fillStyle = i % 2 === 0
        ? 'hsl(' + (i * 360 / N) + ', 72%, 58%)'
        : 'hsl(' + (i * 360 / N) + ', 70%, 46%)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* 名字：旋转到扇形中线，右对齐 */
    const fs = fontSize(N);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.font = 'bold ' + fs + 'px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(i * step + currentRot + step / 2);
      ctx.fillText(shortName(names[i]), R - 16, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function renderHist() {
    $('#whHist', rootEl).innerHTML = hist.map((n, i) =>
      '<div class="wh-hist-item"><b>' + (hist.length - i) + '</b><span>' + esc(n) + '</span></div>'
    ).join('');
    $('#whHistLab', rootEl).textContent = '抽中历史（' + hist.length + ' 条）';
  }

  /* 指针（12 点方向）反推扇形索引 */
  function pickIndex() {
    const deg = (currentRot * 180 / Math.PI) % 360;
    const pointerAng = ((270 - deg) % 360 + 360) % 360;
    return Math.floor(pointerAng / (360 / names.length)) % names.length;
  }

  function finishSpin() {
    spinning = false;
    const name = names[pickIndex()];
    $('#whResult', rootEl).textContent = '🎉 抽中：' + name;
    LB.toast('🎉 抽中了 ' + name + '！', 'ok');
    hist.unshift(name);
    hist = hist.slice(0, 24);
    saveHist();
    renderHist();
    if ($('#whRemove', rootEl).checked) {
      names.splice(names.indexOf(name), 1);
      $('#whNames', rootEl).value = names.join('\n');
      saveNames();
      draw();
    }
  }

  function spin() {
    if (spinning) return;
    if (names.length < 2) { LB.toast('请先在右侧输入名单（至少 2 人）', 'info'); return; }
    spinning = true;
    $('#whResult', rootEl).textContent = '';
    const startRot = currentRot;
    const delta = (5 + LB.rng.float() * 3) * TAU + LB.rng.float() * TAU; /* 5~8 圈 + 随机角度 */
    const dur = 4200 + LB.rng.float() * 900;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4); /* easeOutQuart */
      currentRot = startRot + delta * e;
      draw();
      if (p < 1) rafId = requestAnimationFrame(step);
      else finishSpin();
    };
    rafId = requestAnimationFrame(step);
  }

  function shuffleNames() {
    if (names.length < 2) { LB.toast('名单至少需要 2 人', 'info'); return; }
    LB.rng.shuffle(names);
    $('#whNames', rootEl).value = names.join('\n');
    saveNames();
    draw();
    LB.toast('已打乱顺序', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>随机点名转盘</h1><p>课堂点名、抽签决定，转盘动画抽取，支持抽后移除</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-cols">' +
      '<div class="tool-sec">' +
      '<div class="wh-stage">' +
      '<canvas id="whCanvas" width="420" height="420"></canvas>' +
      '<span class="wh-pointer"></span>' +
      '<button class="wh-go js-primary-submit" id="whGo" type="button">GO</button>' +
      '</div>' +
      '<div class="wh-result" id="whResult"></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">名单（每行一个，也可用逗号 / 顿号分隔）</span>' +
      '<textarea class="inp mono-area" id="whNames" rows="9" placeholder="张三&#10;李四&#10;王五"></textarea>' +
      '<div class="wh-tools">' +
      '<label class="chk-row"><input type="checkbox" id="whRemove" /> 抽中后移出名单</label>' +
      '<button class="btn btn-ghost btn-sm" id="whShuffle" type="button">🔀 打乱</button>' +
      '</div>' +
      '<span class="tool-lab" id="whHistLab">抽中历史（0 条）</span>' +
      '<div class="wh-hist" id="whHist"></div>' +
      '<button class="btn btn-ghost btn-sm" id="whClearHist" type="button">清空历史</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">转盘由加密随机数决定落点，公平公正；名单与历史保存在本设备浏览器中。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    canvas = $('#whCanvas', root);
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    const savedNames = LB.storage.get(KEY_NAMES, []);
    names = Array.isArray(savedNames) ? savedNames.filter(n => typeof n === 'string') : [];
    const savedHist = LB.storage.get(KEY_HIST, []);
    hist = Array.isArray(savedHist) ? savedHist.filter(n => typeof n === 'string') : [];
    if (names.length) $('#whNames', root).value = names.join('\n');
    draw();
    renderHist();

    /* 名单变化：debounce 400ms 解析保存重绘
       Step 9：延迟回调必须先守卫 —— 用户切走后 rootEl 已置 null，
       400ms 内触发会读已卸载的 DOM（全站唯一真实崩溃点）。 */
    $('#whNames', root).addEventListener('input', LB.dom.debounce(() => {
      if (!rootEl || !document.body.contains(rootEl)) return;
      names = parseNames($('#whNames', rootEl).value);
      saveNames();
      draw();
    }, 400));

    $('#whGo', root).addEventListener('click', spin);
    $('#whShuffle', root).addEventListener('click', shuffleNames);
    $('#whClearHist', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => {
      hist = [];
      saveHist();
      renderHist();
      LB.toast('历史已清空', 'ok');
    }));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (rafId) cancelAnimationFrame(rafId); /* 切走后动画必须停止 */
    rafId = 0;
    ctx = null;
    canvas = null;
    rootEl = null;
  }

  LB.router.register('wheel', { mount, unmount });
})();
