/* LiteBox v5 · tools/water.js — 喝水记录（每日杯数 / 毫升 / 目标进度，按天本机保存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const GOAL_KEY = 'litebox_water_goal';
  const CUPS = [150, 200, 250, 300, 500];

  let rootEl = null;
  let tick = null;
  let dayStr = '';

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  /* 每日记录按真实日期切 key：litebox_water_YYYY-MM-DD */
  const dayKey = () => 'litebox_water_' + todayStr();

  function loadDay() {
    const rec = LB.storage.get(dayKey(), []);
    return Array.isArray(rec) ? rec.filter(r => r && typeof r.ml === 'number') : [];
  }

  function render() {
    dayStr = todayStr();
    const goal = LB.storage.get(GOAL_KEY, 2000);
    const rec = loadDay();
    const ml = rec.reduce((s, r) => s + r.ml, 0);

    $('#wtCups', rootEl).textContent = String(rec.length);
    $('#wtMl', rootEl).textContent = ml + ' ml';
    $('#wtGoal', rootEl).textContent = goal + ' ml';

    /* 进度条：超 100% 显示满 + 绿色 */
    const pct = goal > 0 ? (ml / goal) * 100 : 0;
    const fill = $('#wtFill', rootEl);
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    fill.classList.toggle('full', pct >= 100);
    $('#wtPct', rootEl).textContent = Math.round(pct) + '%';

    const wtList = $('#wtList', rootEl);
    if (!rec.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(wtList, {
        icon: '💧',
        title: '今天还没喝',
        sub: '点击「喝一杯」记录每一杯，向目标进度前进',
        ctaText: '记一杯',
        onCta: () => drink()
      });
    } else {
      wtList.innerHTML = rec.slice().reverse().map(r =>
        '<div class="wt-row"><span>' + esc(r.time) + '</span><b>' + r.ml + ' ml</b></div>'
      ).join('');
    }
  }

  function drink() {
    const cup = parseInt($('#wtCup', rootEl).value, 10) || 200;
    const d = new Date();
    const rec = loadDay();
    rec.push({ time: pad(d.getHours()) + ':' + pad(d.getMinutes()), ml: cup });
    LB.storage.set(dayKey(), rec);
    render();
    LB.toast('已记录一杯 (' + cup + ' ml)', 'ok');
  }

  function reset() {
    LB.storage.set(dayKey(), []);
    render();
    LB.toast('今日记录已重置', 'ok');
  }

  function html() {
    const opts = CUPS.map(c => '<option value="' + c + '"' + (c === 200 ? ' selected' : '') + '>' + c + ' ml</option>').join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>喝水记录</h1><p>每日饮水目标与杯数记录，轻量追踪习惯</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">今日杯数</div><div class="rc-val" id="wtCups">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">今日毫升</div><div class="rc-val" id="wtMl">0 ml</div></div>' +
      '<div class="res-card"><div class="rc-lab">目标</div><div class="rc-val" id="wtGoal">2000 ml</div></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<div class="wt-bar"><div class="wt-fill" id="wtFill"></div></div>' +
      '<div class="wt-pct-row"><small>今日进度</small><small id="wtPct">0%</small></div>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">每杯容量<select class="inp" id="wtCup">' + opts + '</select></label>' +
      '<button class="btn btn-main" id="wtGo" type="button">💧 喝一杯</button>' +
      '<button class="btn" id="wtReset" type="button">今天重置</button>' +
      '</div>' +
      '</div>' +
      '<div class="wt-rows" id="wtList"></div>' +
      '<p class="cd-note">记录按日期保存在本设备浏览器中（目标默认 2000 ml），跨天自动开始新一天的记录。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    render();
    $('#wtGo', root).addEventListener('click', drink);
    $('#wtReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, reset));
    /* 页面开着跨零点时自动切新一天 */
    dayStr = todayStr();
    tick = setInterval(() => { if (todayStr() !== dayStr) render(); }, 30000);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (tick) { clearInterval(tick); tick = null; }
    rootEl = null;
  }

  LB.router.register('water', { mount, unmount });
})();
