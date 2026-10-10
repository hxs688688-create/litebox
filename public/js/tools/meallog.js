/* LiteBox v5 · tools/meallog.js — 伙食记录（餐次 / 满意度 / 预算进度 / 近 7 天柱状图，本机保存）
   Step 15 · A3：接入卡路里库 —— 输入食物名实时匹配食物库，命中即按份量自动带出热量；
   未命中只记花费不计热量。记录里带 kcal 的条目会被 calorie.js 的「今日摄入」汇总（见 A3.3）。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_meals';
  const BUDGET_KEY = 'litebox_meal_budget';
  const MEALS = ['早餐', '午餐', '晚餐', '零食', '饮料'];
  const MAX_SUG = 8;

  let rootEl = null;
  let records = []; /* [{ id, ts, date, meal, food, amt, rate, note, kcal, grams, unit, foodCat, fromCalorie }] */
  let meal = '午餐';
  let rate = 3;

  let foods = [];          /* 卡路里库（懒加载） */
  let foodsReady = false;
  let matched = null;      /* 当前匹配到的食物条目 */
  let sugIndex = -1;       /* 键盘上下键选中的建议项 */

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmtMoney = n => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r1 = n => Math.round(n * 10) / 10;
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function save() { LB.storage.set(KEY, records); }

  /* ================= 卡路里库匹配 ================= */

  function loadFoods() {
    if (foodsReady) return Promise.resolve();
    return LB.dict.load('foods').then(d => {
      foods = Array.isArray(d) ? d : [];
      foodsReady = true;
    }).catch(() => { foodsReady = true; });
  }

  function exactFood(q) {
    const s = String(q).trim().toLowerCase();
    if (!s) return null;
    return foods.find(f => f.n.toLowerCase() === s) || null;
  }

  function suggest(q) {
    const s = String(q).trim().toLowerCase();
    if (!s) return [];
    const starts = [], contains = [];
    for (const f of foods) {
      const n = f.n.toLowerCase();
      if (n === s) continue;
      if (n.indexOf(s) === 0) starts.push(f);
      else if (n.indexOf(s) > -1) contains.push(f);
      if (starts.length >= MAX_SUG) break;
    }
    return starts.concat(contains).slice(0, MAX_SUG);
  }

  function setMatched(f) {
    matched = f || null;
    const row = $('#mlPortionRow', rootEl);
    const prev = $('#mlKcalPrev', rootEl);
    if (!matched) {
      row.hidden = true;
      prev.textContent = '';
      return;
    }
    row.hidden = false;
    const unit = matched.unit.indexOf('ml') >= 0 ? 'ml' : 'g';
    $('#mlGramsLab', rootEl).textContent = '份量（' + unit + '）';
    updateKcalPreview();
  }

  function currentGrams() {
    const v = parseFloat($('#mlGrams', rootEl).value);
    return v > 0 ? v : 100;
  }

  function updateKcalPreview() {
    const prev = $('#mlKcalPrev', rootEl);
    if (!matched) { prev.textContent = ''; return; }
    const g = currentGrams();
    const k = matched.kcal * g / 100;
    prev.textContent = '≈ ' + r1(k) + ' kcal（' + matched.kcal + ' kcal / ' + matched.unit + '）';
  }

  function renderSug(list) {
    const box = $('#mlSug', rootEl);
    if (!list.length) { box.hidden = true; box.innerHTML = ''; sugIndex = -1; return; }
    box.hidden = false;
    box.innerHTML = list.map((f, i) =>
      '<button class="ml-sug-item' + (i === sugIndex ? ' on' : '') + '" type="button" data-sug="' + i + '">' +
      '<span class="ml-sug-n">' + esc(f.n) + '</span>' +
      '<span class="ml-sug-k">' + f.kcal + ' kcal/' + esc(f.unit) + '</span>' +
      '</button>'
    ).join('');
  }

  function onFoodInput() {
    const q = $('#mlFood', rootEl).value;
    sugIndex = -1;
    const ex = exactFood(q);
    setMatched(ex);
    renderSug(suggest(q));
  }

  function pickSug(i) {
    const list = suggest($('#mlFood', rootEl).value);
    const f = list[i];
    if (!f) return;
    $('#mlFood', rootEl).value = f.n;
    setMatched(f);
    renderSug([]);
  }

  /* ================= 渲染 ================= */

  function render() {
    const today = todayStr();
    const ym = today.slice(0, 7);
    let todaySum = 0, monthSum = 0, monthCnt = 0, todayKcal = 0;
    records.forEach(r => {
      if (r.date === today) {
        todaySum += r.amt || 0;
        if (typeof r.kcal === 'number' && isFinite(r.kcal)) todayKcal += r.kcal;
      }
      if (typeof r.date === 'string' && r.date.startsWith(ym)) { monthSum += r.amt || 0; monthCnt++; }
    });
    $('#mlToday', rootEl).textContent = fmtMoney(todaySum);
    $('#mlKcal', rootEl).textContent = r1(todayKcal) + ' kcal';
    $('#mlMonth', rootEl).textContent = fmtMoney(monthSum);
    $('#mlCnt', rootEl).textContent = String(monthCnt);

    /* 本月预算进度条（预算 ≥ 1 时显示） */
    const budget = LB.storage.get(BUDGET_KEY, 0);
    const barWrap = $('#mlBudgetBar', rootEl);
    if (budget >= 1) {
      barWrap.hidden = false;
      const pct = (monthSum / budget) * 100;
      $('#mlBudgetFill', rootEl).style.width = Math.max(0, Math.min(100, pct)) + '%';
      $('#mlBudgetTxt', rootEl).textContent = fmtMoney(monthSum) + ' / ' + fmtMoney(budget) + '（' + Math.round(pct) + '%）';
    } else {
      barWrap.hidden = true;
    }
    $('#mlBudgetVal', rootEl).textContent = budget >= 1 ? fmtMoney(budget) : '未设置';

    /* 近 7 天柱状图 */
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      days.push({ ds, sum: records.filter(r => r.date === ds).reduce((s, r) => s + (r.amt || 0), 0), week: WEEK[d.getDay()], isToday: i === 0 });
    }
    const max = Math.max(...days.map(d => d.sum), 1);
    $('#mlBars', rootEl).innerHTML = days.map(d =>
      '<div class="ml-col' + (d.isToday ? ' now' : '') + '">' +
      '<small class="ml-col-amt">' + (d.sum > 0 ? fmtMoney(d.sum) : '') + '</small>' +
      '<div class="ml-col-area"><div class="ml-col-bar"></div></div>' +
      '<small class="ml-col-wk">' + d.week + '</small>' +
      '</div>'
    ).join('');
    /* 柱高按当天花费 / 7 天内最大值比例（DOM style API） */
    [...$('#mlBars', rootEl).querySelectorAll('.ml-col')].forEach((col, i) => {
      col.querySelector('.ml-col-bar').style.height = Math.max(days[i].sum > 0 ? 8 : 3, days[i].sum / max * 100) + '%';
    });

    /* 明细列表（倒序） */
    const mlList = $('#mlList', rootEl);
    if (!records.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(mlList, {
        icon: '🍱',
        title: '还没有记录',
        sub: '记下这顿吃了什么、花了多少',
        ctaText: '记一笔',
        onCta: () => { const inp = $('#mlFood', rootEl); if (inp) inp.focus(); }
      });
    } else {
      mlList.innerHTML = records.slice(0, 200).map(r => {
        const kcalTxt = (typeof r.kcal === 'number' && isFinite(r.kcal))
          ? ' · ' + r.kcal + ' kcal' + (r.grams ? '（' + r.grams + (r.unit || 'g') + '）' : '')
          : '';
        const amtTxt = r.amt > 0 ? fmtMoney(r.amt) : '—';
        return '<div class="ml-row">' +
          '<div class="lg-info"><b>' + esc(r.food || r.meal) + (r.fromCalorie ? ' <i class="lg-rep">来自热量记录</i>' : '') + '</b>' +
          '<small>' + esc(r.date) + ' · ' + esc(r.meal) + ' · ' + '★'.repeat(Math.max(1, Math.min(5, r.rate || 3))) + kcalTxt + '</small>' +
          (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</div>' +
          '<span class="ml-amt">' + amtTxt + '</span>' +
          '<button class="td-del" data-del="' + r.id + '" type="button" aria-label="删除">×</button>' +
          '</div>';
      }).join('');
    }
  }

  /* ================= 交互 ================= */

  function add() {
    const food = $('#mlFood', rootEl).value.trim();
    if (!food) { LB.toast('请输入吃了什么', 'info'); return; }
    const amtRaw = parseFloat($('#mlAmt', rootEl).value);
    const amt = amtRaw > 0 ? +amtRaw.toFixed(2) : 0;
    const grams = matched ? currentGrams() : null;
    const kcal = matched ? r1(matched.kcal * grams / 100) : null;
    if (!(amt > 0) && !(kcal > 0)) {
      LB.toast('请填写花费；或输入食物库里能匹配到的食物名以记录热量', 'info');
      return;
    }
    records.unshift({
      id: 'm' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36),
      ts: Date.now(),
      date: $('#mlDate', rootEl).value || todayStr(),
      meal,
      food,
      amt,
      rate,
      note: $('#mlNote', rootEl).value.trim(),
      kcal,
      grams,
      unit: matched ? (matched.unit.indexOf('ml') >= 0 ? 'ml' : 'g') : null,
      foodCat: matched ? matched.cat : '',
      fromCalorie: false
    });
    save();
    $('#mlFood', rootEl).value = '';
    $('#mlAmt', rootEl).value = '';
    $('#mlNote', rootEl).value = '';
    setMatched(null);
    renderSug([]);
    render();
    LB.toast(kcal ? '已记录（≈ ' + kcal + ' kcal）' : '已记录这顿（' + meal + '）', 'ok');
  }

  function setBudget() {
    const v = window.prompt('设置本月预算（元）', LB.storage.get(BUDGET_KEY, '') || '');
    if (v === null) return; /* 取消 */
    const n = parseFloat(v);
    if (!(n >= 0)) { LB.toast('请输入有效数字', 'info'); return; }
    LB.storage.set(BUDGET_KEY, n);
    render();
    LB.toast(n >= 1 ? '预算已设为 ' + fmtMoney(n) : '预算已清除', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>伙食记录</h1><p>记录每顿吃了什么花了多少，输入食物名自动带出热量</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="ml-top-row"><button class="ql-btn" id="mlClearAll" type="button">清空全部</button></div>' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">今日伙食</div><div class="rc-val" id="mlToday">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">今日摄入</div><div class="rc-val" id="mlKcal">0 kcal</div></div>' +
      '<div class="res-card"><div class="rc-lab">本月伙食</div><div class="rc-val" id="mlMonth">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">本月记录</div><div class="rc-val" id="mlCnt">0</div></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">记一笔</span>' +
      '<div class="ml-chip-row" id="mlMealChips">' + MEALS.map(m => '<button type="button" class="chip' + (m === meal ? ' on' : '') + '" data-m="' + m + '">记' + m + '</button>').join('') + '</div>' +
      '<div class="ml-chip-row" id="mlRateChips">' + [1, 2, 3, 4, 5].map(n => '<button type="button" class="chip' + (n === rate ? ' on' : '') + '" data-rate="' + n + '">' + '★'.repeat(n) + '</button>').join('') + '</div>' +
      '<div class="ml-food-wrap">' +
      '<input class="inp" id="mlFood" maxlength="24" placeholder="吃了什么（如：牛肉面）" autocomplete="off" />' +
      '<div class="ml-sug" id="mlSug" hidden></div>' +
      '</div>' +
      '<div class="lt-row" id="mlPortionRow" hidden>' +
      '<label class="pz-lab"><span id="mlGramsLab">份量（g）</span><input class="inp" id="mlGrams" type="number" min="1" max="3000" step="1" value="100" /></label>' +
      '<span class="ml-kcal-prev" id="mlKcalPrev"></span>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="mlAmt" type="number" min="0" step="0.01" placeholder="花费（元，可留空）" />' +
      '<input class="inp" id="mlNote" maxlength="30" placeholder="备注（选填）" />' +
      '</div>' +
      '<label class="pz-lab">日期<input class="inp" id="mlDate" type="date" /></label>' +
      '<button class="btn btn-main" id="mlAdd" type="button">🍽 记录这顿</button>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<div class="ml-budget-row">' +
      '<span class="tool-lab">本月预算：<b id="mlBudgetVal">未设置</b></span>' +
      '<button class="ql-btn" id="mlSetBudget" type="button">设置预算</button>' +
      '</div>' +
      '<div id="mlBudgetBar" hidden>' +
      '<div class="wt-bar"><div class="wt-fill" id="mlBudgetFill"></div></div>' +
      '<div class="wt-pct-row"><small>本月进度</small><small id="mlBudgetTxt"></small></div>' +
      '</div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">近 7 天伙食</span>' +
      '<div class="ml-bars" id="mlBars"></div>' +
      '</div>' +
      '<div class="ml-rows" id="mlList"></div>' +
      '<p class="cd-note">输入食物名会实时匹配热量库：命中后按份量自动带出热量（可留空花费）；没命中就只记花费。' +
      '这里记下的热量会计入「卡路里查询」的今日摄入。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">记录数据仅本机保存，不构成营养或健康建议。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    records = Array.isArray(saved) ? saved.filter(r => r && typeof r.amt === 'number') : [];
    meal = '午餐'; rate = 3; matched = null; sugIndex = -1;
    $('#mlDate', root).value = todayStr();
    render();

    /* 食物名：实时匹配 + 建议列表 */
    const foodInp = $('#mlFood', root);
    foodInp.addEventListener('input', onFoodInput);
    foodInp.addEventListener('focus', onFoodInput);
    foodInp.addEventListener('blur', () => setTimeout(() => renderSug([]), 150));
    foodInp.addEventListener('keydown', e => {
      const list = suggest(foodInp.value);
      if (e.key === 'ArrowDown' && list.length) {
        e.preventDefault();
        sugIndex = (sugIndex + 1) % list.length;
        renderSug(list);
      } else if (e.key === 'ArrowUp' && list.length) {
        e.preventDefault();
        sugIndex = sugIndex <= 0 ? list.length - 1 : sugIndex - 1;
        renderSug(list);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sugIndex >= 0) pickSug(sugIndex);
        else add();
      } else if (e.key === 'Escape') {
        renderSug([]);
      }
    });
    $('#mlSug', root).addEventListener('mousedown', e => {
      const b = e.target.closest('[data-sug]');
      if (!b) return;
      e.preventDefault();           /* 防止 blur 先触发把列表收掉 */
      pickSug(+b.dataset.sug);
    });
    $('#mlGrams', root).addEventListener('input', updateKcalPreview);

    $('#mlMealChips', root).addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      meal = b.dataset.m || b.textContent;
      [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
    });
    $('#mlRateChips', root).addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      rate = +b.dataset.rate;
      [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
    });
    $('#mlAdd', root).addEventListener('click', add);
    $('#mlSetBudget', root).addEventListener('click', setBudget);
    $('#mlClearAll', root).addEventListener('click', e => {
      if (!records.length) { LB.toast('暂无记录', 'info'); return; }
      LB.confirm(e.currentTarget, () => {
        records = [];
        save();
        render();
        LB.toast('已清空全部记录', 'ok');
      });
    });
    $('#mlList', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      /* Step 10：删除二次确认（图标小按钮红色态提示） */
      LB.confirm(del, () => {
        records = records.filter(r => r.id !== del.dataset.del);
        save();
        render();
        LB.toast('已删除', 'ok');
      }, 3000, { iconOnly: true });
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* 卡路里库懒加载：加载好之后，已经输入的名字再匹配一次 */
    loadFoods().then(() => {
      if (!rootEl) return;
      if ($('#mlFood', rootEl).value.trim()) onFoodInput();
    });
  }

  function unmount() {
    rootEl = null;
    matched = null;
    sugIndex = -1;
  }

  LB.router.register('meallog', { mount, unmount });
})();
