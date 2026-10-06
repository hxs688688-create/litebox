/* LiteBox v5 · tools/dice.js — 摇骰子（Step 19 · 四：CSS 3D 循环动画重构）
 *
 * 【方案】按任务书推荐的简化方案：纯 CSS 3D 立方体 + SVG 内嵌点阵面，
 *   不再加载 Three.js / dice.glb（去掉 ~600KB 资产与 WebGL 依赖，兼容性更好）。
 *
 * 【动画】点「摇一次」（或直接点骰盘）→ 5 颗骰子重放同一段翻滚动画
 *   （WAAPI 播放 CSS 3D 关键帧，2s，逐颗错开起跳），动画末帧直接落在
 *   随机点数对应的朝向上（fill:'forwards'），起翻→翻滚→定面全程平滑，
 *   「点击就循环播放」；结果反正随机，动画可以复用同一条轨迹。
 *
 * 【定面】立方体 6 面：f1 前 / f6 后 / f3 右 / f4 左 / f5 上 / f2 下
 *   （1-6、2-5、3-4 相对）。终态朝向按 rotateY(b) rotateX(a) 推导：
 *   1:(0,0) 2:(0,-90) 3:(-90,0) 4:(90,0) 5:(90,90) 6:(0,180)。
 *
 * 【清理】unmount 时 cancel 所有 WAAPI 动画与定时器，不泄漏。
 *
 * 【随机一律走 LB.rng】crypto 级随机，禁用 Math.random。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const KEY_DICE = 'litebox_dice_history';
  const DICE_N = 5;
  const ROLL_MS = 2000;         /* 翻滚动画时长 */
  const STAGGER = 80;           /* 逐颗起跳间隔 */

  /* 终态朝向：rotateY(b) rotateX(a)（推导见文件头注释）。
     注意 CSS 坐标 +Y 朝下：f5（视觉顶面）out = [0,-1,0]，f2（底面）out = [0,1,0]，
     因此 bring f2 到正面是 rotateX(90)、f5 是 rotateX(-90)，两者不能写反。 */
  const ORIENT = {
    1: { a: 0, b: 0 },
    2: { a: 90, b: 0 },
    3: { a: 0, b: -90 },
    4: { a: 0, b: 90 },
    5: { a: -90, b: 0 },
    6: { a: 180, b: 0 }
  };

  /* ---------- SVG 点阵面（内嵌，零网络请求） ---------- */

  const PIPS = {
    1: [[50, 50]],
    2: [[29, 29], [71, 71]],
    3: [[26, 26], [50, 50], [74, 74]],
    4: [[29, 29], [71, 29], [29, 71], [71, 71]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]]
  };

  function faceSVG(n) {
    const dots = (PIPS[n] || PIPS[1]).map(p =>
      '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="13"/>').join('');
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + dots + '</svg>';
  }

  /* ---------- 翻滚动画（WAAPI 播放关键帧，末帧 = 定面） ---------- */

  let rootEl = null;
  let alive = false;
  let rolling = false;
  let burstLeft = 0;
  let burstTimer = 0;
  let history = [];
  let anims = [];
  const rollTimers = [];

  function wait(ms) {
    return new Promise(res => { rollTimers.push(setTimeout(res, ms)); });
  }

  function cancelAnims() {
    anims.forEach(a => { try { a.cancel(); } catch (_) {} });
    anims = [];
  }

  function keyframes(val) {
    const o = ORIENT[val] || ORIENT[1];
    return [
      { transform: 'rotateY(0deg) rotateX(0deg) rotateZ(0deg) scale(1)' },
      { transform: 'rotateX(180deg) rotateY(90deg) rotateZ(45deg) scale(1.15)', offset: .15 },
      { transform: 'rotateX(360deg) rotateY(180deg) rotateZ(-90deg) scale(1.1)', offset: .3 },
      { transform: 'rotateX(540deg) rotateY(270deg) rotateZ(180deg) scale(1.2)', offset: .45 },
      { transform: 'rotateX(720deg) rotateY(360deg) rotateZ(90deg) scale(1.05)', offset: .6 },
      { transform: 'rotateX(900deg) rotateY(450deg) rotateZ(270deg) scale(1.08)', offset: .8 },
      /* 末帧 = 定面朝向。Y 用 720（2 整圈，从 80% 的 450deg 继续向前转），
         X 用 1080（3 整圈）；540 会多出半圈（540 = 360+180），落定的是对面点数。 */
      { transform: 'rotateY(' + (720 + o.b) + 'deg) rotateX(' + (1080 + o.a) + 'deg) rotateZ(360deg) scale(1)' }
    ];
  }

  function playTumble(vals) {
    cancelAnims();
    const cubes = $$('.dc3-cube', rootEl);
    cubes.forEach((el, i) => {
      if (!el.animate) return;
      anims.push(el.animate(keyframes(vals[i]), {
        duration: ROLL_MS,
        delay: i * STAGGER,
        easing: 'ease-in-out',
        fill: 'forwards'
      }));
    });
    return wait(ROLL_MS + (DICE_N - 1) * STAGGER);
  }

  /* ---------- 通用 ---------- */

  function pop(el) {
    if (!el) return;
    el.classList.remove('dc-pop');
    void el.offsetWidth;
    el.classList.add('dc-pop');
  }

  function haptic(pattern) {
    if (!navigator.vibrate) return;
    if (navigator.userActivation && navigator.userActivation.isActive === false) return;
    try { navigator.vibrate(pattern); } catch (_) {}
  }

  async function roll() {
    if (rolling || !alive) return;
    rolling = true;
    const stage = $('.dc-stage', rootEl);
    if (stage) stage.classList.add('busy');
    const vals = [];
    for (let i = 0; i < DICE_N; i++) vals.push(1 + LB.rng.int(0, 5));

    try {
      haptic([12, 40, 12, 40, 12]);
      await playTumble(vals);
      if (!alive) return;

      const sum = vals.reduce((a, b) => a + b, 0);
      const cnt = {};
      vals.forEach(v => cnt[v] = (cnt[v] || 0) + 1);
      const max = Math.max(...Object.values(cnt));
      let tip = '本轮总点数 ' + sum;
      if (max === 5) tip = '🎉 五个相同！豹子';
      else if (max === 4) tip = '🔥 四个相同！';
      else if (max === 3) tip = '✨ 三个相同！';
      const total = $('#dcTotal', rootEl);
      const tipEl = $('#dcTip', rootEl);
      if (total) total.textContent = sum;
      if (tipEl) { tipEl.textContent = tip; pop(tipEl); }

      history.unshift({ d: vals, total: sum });
      history = history.slice(0, 8);
      LB.storage.set(KEY_DICE, history);
      renderHist();
      haptic([16, 22, 32]);
    } finally {
      rolling = false;
      if (stage) stage.classList.remove('busy');
    }
  }

  function rollBurst() {
    if (burstLeft > 0 || !alive) return;
    burstLeft = 5;
    burstTimer = setInterval(() => {
      if (!alive) { clearInterval(burstTimer); burstLeft = 0; return; }
      if (!rolling) {
        roll();
        burstLeft--;
        if (burstLeft <= 0) clearInterval(burstTimer);
      }
    }, 300);
  }

  function renderHist() {
    const box = $('#dcHist', rootEl);
    if (!box) return;
    box.innerHTML = history.length
      ? history.map(h => '<div class="dc-hist-item"><span>' + h.d.join(' · ') + '</span><b>' + h.total + ' 点</b></div>').join('')
      : '<div class="dc-hist-item dc-hist-empty">还没有记录，摇一次试试</div>';
  }

  /* ---------- 页面 ---------- */

  function dieHTML() {
    let faces = '';
    for (let v = 1; v <= 6; v++) faces += '<i class="dc3-face dc3-f' + v + '">' + faceSVG(v) + '</i>';
    return '<span class="dc3-die"><span class="dc3-cube">' + faces + '</span></span>';
  }

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>摇骰子</h1><p>CSS 3D 骰子翻滚定面，点击骰盘即可循环播放</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="dc-stage is-fb" id="dcStage" title="点我摇一把">' +
      '<div class="dc-tray" id="dcTray">' + dieHTML() + dieHTML() + dieHTML() + dieHTML() + dieHTML() + '</div>' +
      '</div>' +
      '<div class="dc-out"><span class="dc-out-label">总点数</span><b class="dc-out-num" id="dcTotal">—</b></div>' +
      '<div class="dc-tip" id="dcTip">点「摇一次」或直接点骰盘，骰子翻滚后落定亮出点数</div>' +
      '<div class="dc-btns">' +
      '<button class="btn btn-main js-primary-submit" data-act="roll" type="button">🎲 摇一次</button>' +
      '<button class="btn btn-ghost" data-act="roll5" type="button">🔁 连摇 5 次</button>' +
      '<button class="btn btn-ghost" data-act="clearhist" type="button">↺ 清空记录</button>' +
      '</div>' +
      '<div class="dc-hist" id="dcHist"></div>' +
      '</div>' +
      '<p class="cd-note">骰子点数由浏览器加密级随机数生成；纯 CSS 3D 动画，无需 WebGL，所有设备同一体验。</p>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    rolling = false;
    burstLeft = 0;
    root.innerHTML = html();

    const h = LB.storage.get(KEY_DICE, []);
    history = Array.isArray(h)
      ? h.filter(x => x && Array.isArray(x.d) && x.d.length === DICE_N && typeof x.total === 'number').slice(0, 8)
      : [];
    renderHist();

    root.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (act) {
        const k = act.dataset.act;
        if (k === 'roll') roll();
        else if (k === 'roll5') rollBurst();
        else if (k === 'clearhist') LB.confirm(act, () => {
          history = [];
          LB.storage.set(KEY_DICE, history);
          renderHist();
        });
        return;
      }
      /* 点击骰盘 = 摇一把（循环播放动画） */
      if (e.target.closest('#dcTray')) { roll(); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    alive = false;
    rollTimers.forEach(clearTimeout);
    rollTimers.length = 0;
    clearInterval(burstTimer);
    burstTimer = 0;
    burstLeft = 0;
    rolling = false;
    cancelAnims();
    rootEl = null;
  }

  LB.router.register('dice', { mount, unmount });
})();
