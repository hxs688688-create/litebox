/* LiteBox v5 · tools/bomb.js — 数字炸弹（Step 13 · B5 从 party 拆出）
 *
 * 【保留现有实现】玩法与判定逻辑与原 party 完全一致：
 *   1..100 布一个雷 → 玩家轮流点数字 → 每点一次把区间收紧到雷的另一侧 →
 *   踩中的人接受惩罚。随机走 LB.rng（加密级，禁 Math.random）。
 *
 * 【样式复用】.pt-bomb-* / .pt-num* / .pt-flash 这套类在拆分后仍被本工具
 *   使用，保留在 tools.css 的「聚会小游戏共用件」区块里，不再新造一套
 *   bm-* 前缀 —— 拆工具是拆页面与注册，不是把每条 CSS 重写一遍。
 *
 * 【为什么没有把雷写进 storage】
 *   刷新页面 = 重新开局。原实现也是如此；把雷点持久化反而会让
 *   「换个手机打开页面」时答案已经躺在本地数据里。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  let rootEl = null;
  let alive = false;
  let bLo = 1;
  let bHi = 100;
  let bBomb = 1;
  let bOver = false;
  let picks = 0;
  let flashTimer = 0;

  /* 通用 pop 动画（重复触发需先移除再强制 reflow） */
  function pop(el) {
    if (!el) return;
    el.classList.remove('pt-pop');
    void el.offsetWidth;
    el.classList.add('pt-pop');
  }

  function bombGridHTML() {
    let h = '';
    for (let n = 1; n <= 100; n++) {
      const dead = bOver || n < bLo || n > bHi;
      const boom = bOver && n === bBomb;
      h += '<button type="button" class="pt-num' + (dead ? ' pt-num-dead' : '') + (boom ? ' pt-num-boom' : '') +
        '" data-act="num" data-n="' + n + '"' + (dead ? ' disabled' : '') + '>' + n + '</button>';
    }
    return h;
  }

  function renderBomb() {
    const grid = $('#ptBombGrid', rootEl);
    if (grid) grid.innerHTML = bombGridHTML();
    const range = $('#ptBombRange', rootEl);
    if (range) range.textContent = '当前范围：' + bLo + ' - ' + bHi;
    const cnt = $('#ptBombPicks', rootEl);
    if (cnt) cnt.textContent = picks;
  }

  function bombReset() {
    const loInp = $('#ptBombLo', rootEl);
    const hiInp = $('#ptBombHi', rootEl);
    if (!loInp || !hiInp) return;
    const lo = Math.max(1, Math.min(100, parseInt(loInp.value, 10) || 1));
    const hi = Math.max(1, Math.min(100, parseInt(hiInp.value, 10) || 100));
    if (lo >= hi) { LB.toast('起点必须小于终点', 'warn'); return; }
    loInp.value = lo; hiInp.value = hi;
    bLo = lo; bHi = hi; bOver = false; picks = 0;
    bBomb = LB.rng.int(lo, hi);
    renderBomb();
    const tip = $('#ptBombTip', rootEl);
    if (tip) { tip.textContent = '炸弹已布置在 ' + lo + ' - ' + hi + ' 之间，轮流点数字吧'; pop(tip); }
  }

  function bombPick(btn) {
    if (bOver || btn.disabled || !alive) return;
    const n = parseInt(btn.dataset.n, 10);
    if (!(n >= bLo && n <= bHi)) return;
    picks++;
    const tip = $('#ptBombTip', rootEl);
    if (n === bBomb) {
      bOver = true;
      flashBoom();
      if (tip) { tip.textContent = '💥 BOOM！炸弹是 ' + n + '，本局结束（共猜 ' + picks + ' 次）'; pop(tip); }
      renderBomb();
      haptic([40, 60, 40]);
    } else if (n < bBomb) {
      bLo = n + 1;
      if (tip) tip.textContent = '😅 ' + n + ' 比炸弹小，下限抬到 ' + bLo;
      renderBomb();
      haptic([12]);
    } else {
      bHi = n - 1;
      if (tip) tip.textContent = '😅 ' + n + ' 比炸弹大，上限压到 ' + bHi;
      renderBomb();
      haptic([12]);
    }
  }

  /* 触感反馈：只在用户手势仍有效时调用，否则 Chrome 会往控制台打警告 */
  function haptic(pattern) {
    if (!navigator.vibrate) return;
    if (navigator.userActivation && navigator.userActivation.isActive === false) return;
    try { navigator.vibrate(pattern); } catch (_) {}
  }

  function flashBoom() {
    const f = document.createElement('div');
    f.className = 'pt-flash';
    document.body.appendChild(f);
    flashTimer = setTimeout(() => { f.remove(); }, 600);
  }

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>数字炸弹</h1><p>1 到 100 里藏一个数，轮流点，踩中的人接受惩罚</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="pt-bomb-set">' +
      '<label class="pz-lab">起点<input class="inp" id="ptBombLo" type="number" min="1" max="100" value="1" /></label>' +
      '<label class="pz-lab">终点<input class="inp" id="ptBombHi" type="number" min="1" max="100" value="100" /></label>' +
      '<button class="btn btn-ghost btn-sm js-primary-submit" data-act="bombreset" type="button">💣 重新布置</button>' +
      '</div>' +
      '<div class="pt-bomb-range" id="ptBombRange">当前范围：1 - 100</div>' +
      '<div class="pt-bomb-grid" id="ptBombGrid"></div>' +
      '<div class="pt-tip" id="ptBombTip">轮流点一个数字，踩中炸弹的人接受惩罚</div>' +
      '<p class="cd-note">本局已猜 <b id="ptBombPicks">0</b> 次。区间每次会向炸弹收紧，范围剩 1 个数时必炸。</p>' +
      '</div>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    bLo = 1; bHi = 100; bOver = false; picks = 0;
    bBomb = LB.rng.int(bLo, bHi);
    root.innerHTML = html();
    renderBomb();

    root.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (act) {
        const k = act.dataset.act;
        if (k === 'bombreset') bombReset();
        else if (k === 'num') bombPick(act);
        return;
      }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    alive = false;
    clearTimeout(flashTimer);
    flashTimer = 0;
    /* 爆炸红光是挂在 body 上的覆盖层，页面切走时必须收掉 */
    $$('.pt-flash').forEach(n => n.remove());
    rootEl = null;
  }

  LB.router.register('bomb', { mount, unmount });
})();
