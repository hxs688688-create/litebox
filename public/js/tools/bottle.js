/* LiteBox v5 · tools/bottle.js — 转瓶子（Step 13 · B5 从 party 拆出）
 *
 * 【保留原实现，动画优化两点】
 *   1) 角度累积：spinTotal 一直往上加，不做归一化。
 *      若每次把角度写回 0~360，CSS 过渡会「倒回去」—— 看着像逆时针转。
 *      累积值让浏览器始终沿同一方向插值，转完自然停在目标扇区。
 *   2) 收尾曲线用 cubic-bezier(.12,.78,.18,1)：前段快、末段拖长，
 *      像真瓶子减速，比 linear 停在最后一格要可信。
 *
 * 【名单存自己的 key】
 *   原来四个玩法共用 litebox_party_names，拆分后各自独立：
 *   本工具用 litebox_bottle_names，骰子用 litebox_dice_names，互不干扰。
 *
 * 【瓶口指向谁】
 *   名字按录入顺序均匀排在圆周上，第 i 人的「罗盘角」（0=正上，顺时针）= i*(360/n)。
 *   🍾 emoji（Noto）瓶口原生朝左上 = 罗盘 315°，所以 CSS 里先给一个 rotate(45deg)
 *   的静止基准角 BASE，让「未旋转时瓶口正对第 1 人」。这样旋转 spinTotal 度后，
 *   瓶口罗盘角恰好等于 spinTotal，落点 = round(spinTotal / 每格)。
 *   少了这个基准角，视觉指向和结算会差半格到一格（截图实测发现过）。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const KEY_NAMES = 'litebox_bottle_names';
  const MAX_NAMES = 24;
  /* 🍾（Noto）瓶口原生朝左上 = 罗盘 315°；补 45° 基准后 0 圈即正对第 1 人 */
  const BASE = 45;

  let rootEl = null;
  let alive = false;
  let spinTotal = 0;
  let spinning = false;
  let spinTimer = 0;
  let lastIdx = -1;

  function getNames() {
    const ta = $('#btNames', rootEl);
    if (!ta) return [];
    return ta.value.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, MAX_NAMES);
  }

  function updCount() {
    const el = $('#btNameCnt', rootEl);
    if (el) el.textContent = getNames().length;
  }

  function saveNames() {
    const ta = $('#btNames', rootEl);
    if (!ta) return;
    const all = ta.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (all.length > MAX_NAMES) {
      all.length = MAX_NAMES;
      LB.toast('玩家最多 ' + MAX_NAMES + ' 人，已自动截断', 'warn');
    }
    ta.value = all.join('\n');
    LB.storage.set(KEY_NAMES, all);
    updCount();
    renderSeat();
    LB.toast('玩家名单已保存', 'ok');
  }

  function shuffleNames() {
    const ta = $('#btNames', rootEl);
    if (!ta) return;
    const all = ta.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (all.length < 2) { LB.toast('至少需要 2 名玩家才能打乱', 'info'); return; }
    LB.rng.shuffle(all);
    ta.value = all.join('\n');
    updCount();
    renderSeat();
    LB.toast('已打乱顺序，记得保存名单', 'info');
  }

  /* 座位环：把名字按圆周排一圈，视觉上直接看懂「瓶口指向谁」 */
  function renderSeat() {
    const ring = $('#btRing', rootEl);
    if (!ring) return;
    const names = getNames();
    if (names.length < 2) {
      ring.innerHTML = '<span class="bt-seat-empty">填好 2 名以上玩家，这里会显示座位</span>';
      return;
    }
    const R = 42; /* 百分比半径（容器是正方形） */
    ring.innerHTML = names.map((n, i) =>
      '<span class="bt-seat' + (i === lastIdx ? ' on' : '') + '" data-i="' + i + '">' + esc(n) + '</span>'
    ).join('');
    /* 红线「禁内联样式」指 HTML 字符串里的 style="..."；节点建好后由 JS
       下发定值坐标是项目既有做法（同 cpu_ladder 的 .cpu-fill 宽度）。 */
    $$('.bt-seat', ring).forEach((el, i) => {
      const ang = (i / names.length) * Math.PI * 2 - Math.PI / 2;
      el.style.left = (50 + R * Math.cos(ang)).toFixed(2) + '%';
      el.style.top = (50 + R * Math.sin(ang)).toFixed(2) + '%';
    });
  }

  function spin() {
    if (spinning || !alive) return;
    const names = getNames();
    if (names.length < 2) { LB.toast('先在玩家名单里填好至少 2 名玩家', 'info'); return; }

    spinning = true;
    lastIdx = -1;
    renderSeat();
    /* 2~4 圈 + 随机落点，累积角度保证始终顺时针；BASE 是静止基准角，
       抵消 emoji 瓶口朝左上的 315°，让 0 度时瓶口正对第 1 人 */
    spinTotal += 360 * LB.rng.int(2, 4) + LB.rng.int(1, 359);
    const el = $('#btBottle', rootEl);
    if (el) el.style.transform = 'rotate(' + (BASE + spinTotal) + 'deg)';
    const tip = $('#btTip', rootEl);
    if (tip) tip.textContent = '瓶子转动中…';
    const go = $('#btGo', rootEl);
    if (go) go.disabled = true;

    spinTimer = setTimeout(() => {
      spinning = false;
      if (!alive) return;
      if (go) go.disabled = false;
      const list = getNames();
      if (!list.length) return;
      const seg = 360 / list.length;
      /* 瓶口罗盘角 = 315（emoji 原生）+ BASE(45) + spinTotal ≡ spinTotal */
      const bearing = ((spinTotal % 360) + 360) % 360;
      lastIdx = Math.round(bearing / seg) % list.length;
      const t2 = $('#btTip', rootEl);
      if (t2) {
        t2.textContent = '🍾 瓶口指向：' + list[lastIdx];
        t2.classList.remove('bt-pop');
        void t2.offsetWidth;
        t2.classList.add('bt-pop');
      }
      renderSeat();
      if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.isActive !== false)) {
        try { navigator.vibrate([16, 22, 32]); } catch (_) {}
      }
    }, 2200);
  }

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>转瓶子</h1><p>填好玩家名单，瓶口指向谁就由谁来接受挑战</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="bt-stage"><div class="bt-ring" id="btRing"></div>' +
      '<span class="bt-bottle" id="btBottle" aria-hidden="true">🍾</span></div>' +
      '<div class="bt-tip" id="btTip">点「开始转」，瓶口指向谁就轮到谁</div>' +
      '<div class="bt-btns">' +
      '<button class="btn btn-main js-primary-submit" id="btGo" type="button">🍾 开始转</button>' +
      '<button class="btn btn-ghost" id="btAgain" type="button">🔁 再转一次</button>' +
      '</div>' +
      '</div>' +
      '<details class="card tool-sec set-card set-details" open>' +
      '<summary>👥 玩家名单（<b id="btNameCnt">0</b> 人）</summary>' +
      '<textarea class="inp" id="btNames" rows="5" maxlength="400" placeholder="每行一个玩家名，最多 24 人&#10;小明&#10;小红&#10;小刚"></textarea>' +
      '<div class="bt-btns">' +
      '<button class="btn btn-main btn-sm" id="btSave" type="button">💾 保存名单</button>' +
      '<button class="btn btn-ghost btn-sm" id="btShuffle" type="button">🔀 打乱</button>' +
      '</div>' +
      '<p class="cd-note">名单按顺序均匀排在圆周上，第 1 人在正上方；瓶子图形默认指向正上方。</p>' +
      '</details>' +
      '<p class="cd-note">默认加入「可以跳过」的轻量挑战，不强制饮酒；可按你们的聚会规则调整。</p>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    spinning = false;
    lastIdx = -1;
    spinTotal = 0;
    root.innerHTML = html();

    const saved = LB.storage.get(KEY_NAMES, []);
    if (Array.isArray(saved) && saved.length) {
      $('#btNames', root).value = saved.slice(0, MAX_NAMES).join('\n');
    }
    updCount();
    renderSeat();

    $('#btGo', root).addEventListener('click', spin);
    $('#btAgain', root).addEventListener('click', spin);
    $('#btSave', root).addEventListener('click', saveNames);
    $('#btShuffle', root).addEventListener('click', shuffleNames);
    $('#btNames', root).addEventListener('input', updCount);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    alive = false;
    clearTimeout(spinTimer);
    spinTimer = 0;
    spinning = false;
    rootEl = null;
  }

  LB.router.register('bottle', { mount, unmount });
})();
