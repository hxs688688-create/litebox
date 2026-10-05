/* LiteBox v5 · tools/calorie.js — 卡路里查询（238 种食物 + 一日饮食记录）
 *
 * 【份量换算：统一以「每 100g / 100ml」为基准】
 *   字典里每条都带 unit（100g 或 100ml），营养值都是「每 100 单位」。
 *   用户输入的是实际份量（g 或 ml），所以乘一个 factor = 份量 / 100 即可。
 *   液体用 ml、固体用 g，界面上按 unit 显示对应后缀，避免让用户困惑。
 *
 * 【跨天自动清空但历史保留】
 *   记录结构是 [{ date, items: [...] }]，按日期分组存进 localStorage。
 *   界面只读「今天」那组 —— 于是跨天（date 变了）自然就是空列表，
 *   而历史日期的那组数据仍在存储里，随时可查。
 *
 * 【复制用 LB.copyNow 同步调用】
 *   任务书关键提醒第 1 条。copyNow 必须在 onclick 同步栈里跑，
 *   不能 await、不能 setTimeout，否则国产浏览器手势过期、复制静默失败。
 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  const LOG_KEY = 'litebox_calorie_log';
  const GOAL_KEY = 'litebox_calorie_goal';
  const DEFAULT_GOAL = 2000;

  /* 分类 chips：全部 + 字典里出现的 9 个分类 */
  const CATS = ['全部', '主食', '肉类', '水产', '蛋奶', '蔬菜', '水果', '饮料', '零食', '快餐'];

  let rootEl = null;
  let foods = [];
  let loaded = false;
  let tab = 'search';
  let cat = '全部';
  let log = [];          /* [{ date, items:[{name,grams,kcal,protein,fat,carb}] }] */

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const r1 = n => Math.round(n * 10) / 10;

  /* ---------- 存储 ---------- */
  function loadLog() {
    const raw = LB.storage.get(LOG_KEY, []);
    log = Array.isArray(raw) ? raw.filter(x => x && typeof x.date === 'string' && Array.isArray(x.items)) : [];
  }
  function saveLog() { LB.storage.set(LOG_KEY, log); }

  function todayItems() {
    const d = todayStr();
    const box = log.find(x => x.date === d);
    return box ? box.items : [];
  }
  function pushItem(item) {
    const d = todayStr();
    let box = log.find(x => x.date === d);
    if (!box) { box = { date: d, items: [] }; log.unshift(box); }
    box.items.push(item);
    /* 只保留最近 180 天，避免 localStorage 无限膨胀 */
    log.sort((a, b) => b.date.localeCompare(a.date));
    if (log.length > 180) log = log.slice(0, 180);
    saveLog();
  }

  /* ---------- 查询 ---------- */
  function search(q) {
    const words = String(q).trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = cat === '全部' ? foods : foods.filter(f => f.cat === cat);
    if (!words.length) return list.slice(0, 60);
    const hit = [];
    for (const f of list) {
      const hay = (f.n + f.cat).toLowerCase();
      let all = true;
      for (const w of words) { if (hay.indexOf(w) < 0) { all = false; break; } }
      if (all) hit.push(f);
    }
    return hit.slice(0, 80);
  }

  function renderCats() {
    $('#calCats', rootEl).innerHTML = CATS.map(c =>
      '<button class="chip' + (c === cat ? ' on' : '') + '" data-cat="' + esc(c) + '" type="button">' + esc(c) + '</button>'
    ).join('');
  }

  function renderList() {
    const box = $('#calList', rootEl);
    const tip = $('#calTip', rootEl);
    if (!loaded) { box.innerHTML = '<p class="cd-note">正在加载食物库…</p>'; tip.textContent = ''; return; }
    const q = $('#calIn', rootEl).value;
    const list = search(q);
    if (!q.trim() && cat === '全部') {
      tip.textContent = '食物库共 ' + foods.length + ' 种 · 显示前 60 种';
    } else {
      tip.textContent = '共 ' + foods.length + ' 种 · 匹配 ' + list.length + ' 种' + (list.length >= 80 ? '（仅显示前 80）' : '');
    }
    if (!list.length) {
      box.innerHTML = '<p class="cd-note">没找到匹配的食物。试试只输入「鸡」「蛋」「米饭」这样的关键词。</p>';
      return;
    }
    box.innerHTML = list.map(f =>
      '<button class="cal-item" type="button" data-n="' + esc(f.n) + '">' +
      '<span class="cal-name">' + esc(f.n) + '</span>' +
      '<span class="cal-cat">' + esc(f.cat) + '</span>' +
      '<span class="cal-kcal"><b>' + f.kcal + '</b> kcal/' + esc(f.unit) + '</span>' +
      '<span class="cal-macros">蛋白 ' + f.protein + 'g · 脂肪 ' + f.fat + 'g · 碳水 ' + f.carb + 'g</span>' +
      '</button>'
    ).join('');
  }

  /* ---------- 份量弹窗 ---------- */
  let modal = null;
  function closeModal() {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    modal = null;
    document.removeEventListener('keydown', onModalKey);
  }
  function onModalKey(e) { if (e.key === 'Escape') closeModal(); }

  function openPortion(f) {
    closeModal();
    const unitSuffix = f.unit.indexOf('ml') >= 0 ? 'ml' : 'g';
    const layer = document.createElement('div');
    layer.className = 'cal-mask';
    layer.innerHTML =
      '<div class="cal-modal" role="dialog" aria-modal="true" aria-label="输入份量">' +
      '<div class="cal-modal-hd"><b>' + esc(f.n) + '</b><small>' + f.kcal + ' kcal / ' + esc(f.unit) + '</small></div>' +
      '<div class="cal-quick">' + [50, 100, 150, 200, 250].map(g =>
        '<button class="chip" type="button" data-g="' + g + '">' + g + unitSuffix + '</button>').join('') + '</div>' +
      '<label class="cal-portion-lab">份量（' + unitSuffix + '）' +
      '<input class="inp" id="calPortion" type="number" min="1" max="3000" step="1" value="100" inputmode="decimal" aria-label="份量"></label>' +
      '<p class="cd-note" id="calPreview"></p>' +
      '<div class="cal-modal-ft">' +
      '<button class="btn btn-ghost" id="calCancel" type="button">取消</button>' +
      '<button class="btn btn-main" id="calAdd" type="button">加入记录</button>' +
      '</div></div>';
    rootEl.appendChild(layer);
    modal = layer;
    document.addEventListener('keydown', onModalKey);

    const input = $('#calPortion', layer);
    const preview = $('#calPreview', layer);
    const updPreview = () => {
      const g = parseFloat(input.value);
      if (!(g > 0)) { preview.textContent = '请输入大于 0 的份量'; return; }
      const k = f.kcal * g / 100;
      preview.textContent = '约 ' + r1(k) + ' kcal · 蛋白 ' + r1(f.protein * g / 100) + 'g · 脂肪 ' + r1(f.fat * g / 100) + 'g · 碳水 ' + r1(f.carb * g / 100) + 'g';
    };
    updPreview();
    input.addEventListener('input', updPreview);

    layer.addEventListener('click', e => {
      if (e.target === layer) { closeModal(); return; }
      const qk = e.target.closest('[data-g]');
      if (qk) { input.value = qk.dataset.g; updPreview(); return; }
      if (e.target.closest('#calCancel')) { closeModal(); return; }
      if (e.target.closest('#calAdd')) {
        const g = parseFloat(input.value);
        if (!(g > 0)) { LB.toast('请输入有效的份量', 'info'); return; }
        pushItem({
          name: f.n,
          grams: r1(g),
          unit: unitSuffix,
          kcal: r1(f.kcal * g / 100),
          protein: r1(f.protein * g / 100),
          fat: r1(f.fat * g / 100),
          carb: r1(f.carb * g / 100)
        });
        closeModal();
        LB.toast('已加入今日记录', 'ok');
        renderLog();
      }
    });
    setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 80);
  }

  /* ---------- 记录页 ---------- */
  function goal() {
    const g = LB.storage.get(GOAL_KEY, DEFAULT_GOAL);
    return (typeof g === 'number' && g > 0) ? g : DEFAULT_GOAL;
  }

  function renderLog() {
    if (!rootEl) return;
    const items = todayItems();
    let kcal = 0, pro = 0, fat = 0, carb = 0;
    items.forEach(it => { kcal += it.kcal; pro += it.protein; fat += it.fat; carb += it.carb; });
    const g = goal();
    $('#calKcal', rootEl).textContent = r1(kcal);
    $('#calLeft', rootEl).textContent = r1(Math.max(0, g - kcal));
    $('#calPro', rootEl).textContent = r1(pro) + ' g';
    $('#calFatCarb', rootEl).textContent = r1(fat) + ' / ' + r1(carb) + ' g';

    $('#calGoalVal', rootEl).textContent = g + ' kcal';
    const pct = g > 0 ? kcal / g * 100 : 0;
    const fill = $('#calFill', rootEl);
    fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    fill.classList.toggle('full', pct >= 100);
    $('#calPct', rootEl).textContent = r1(kcal) + ' / ' + g + ' kcal（' + Math.round(pct) + '%）';

    const rows = $('#calRows', rootEl);
    if (!items.length) {
      rows.innerHTML = '<p class="td-empty">今天还没有记录，去「查询」里搜个食物加进来吧～</p>';
      return;
    }
    rows.innerHTML = items.map((it, i) =>
      '<div class="ml-row">' +
      '<div class="lg-info"><b>' + esc(it.name) + '</b>' +
      '<small>' + it.grams + (it.unit || 'g') + ' · 蛋白 ' + it.protein + 'g · 脂肪 ' + it.fat + 'g · 碳水 ' + it.carb + 'g</small></div>' +
      '<span class="ml-amt">' + it.kcal + ' kcal</span>' +
      '<button class="td-del" data-del="' + i + '" type="button" aria-label="删除">×</button>' +
      '</div>'
    ).join('');
  }

  function setGoal() {
    const v = window.prompt('设置每日热量目标（kcal）', String(goal()));
    if (v === null) return;
    const n = parseFloat(v);
    if (!(n >= 500 && n <= 10000)) { LB.toast('请输入 500 - 10000 之间的数字', 'info'); return; }
    LB.storage.set(GOAL_KEY, n);
    renderLog();
    LB.toast('目标已设为 ' + n + ' kcal', 'ok');
  }

  /* 复制今日总结：必须同步调用 LB.copyNow */
  function copySummary() {
    const items = todayItems();
    if (!items.length) { LB.toast('今天还没有记录', 'info'); return; }
    let kcal = 0, pro = 0, fat = 0, carb = 0;
    items.forEach(it => { kcal += it.kcal; pro += it.protein; fat += it.fat; carb += it.carb; });
    const lines = [todayStr() + ' 饮食记录（目标 ' + goal() + ' kcal）'];
    items.forEach(it => lines.push('· ' + it.name + ' ' + it.grams + (it.unit || 'g') + ' — ' + it.kcal + ' kcal'));
    lines.push('合计：' + r1(kcal) + ' kcal ｜ 蛋白 ' + r1(pro) + 'g ｜ 脂肪 ' + r1(fat) + 'g ｜ 碳水 ' + r1(carb) + 'g');
    const txt = lines.join('\n');
    if (!LB.copyNow(txt, '今日总结已复制')) LB.toast('复制失败，请手动选中复制', 'err');
  }

  /* ---------- tab 切换 ---------- */
  function switchTab(t) {
    tab = t;
    $$('.cal-tab', rootEl).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#calSearch', rootEl).hidden = t !== 'search';
    $('#calLog', rootEl).hidden = t !== 'log';
    if (t === 'log') renderLog();
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>卡路里查询</h1><p>200+ 常见食物热量查询，可记录一日饮食总计</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2">' +
      '<button class="cal-tab on" data-tab="search" type="button">🔍 查询</button>' +
      '<button class="cal-tab" data-tab="log" type="button">📝 饮食记录</button>' +
      '</div>' +
      '<div id="calSearch">' +
      '<div class="pc-bar">' +
      '<input class="inp" id="calIn" type="search" placeholder="搜索食物，如：鸡蛋 / 米饭 / 苹果" aria-label="搜索食物">' +
      '<button class="btn btn-main js-primary-submit" id="calGo" type="button">查询</button>' +
      '</div>' +
      '<div class="hl-chips" id="calCats"></div>' +
      '<p class="cd-note" id="calTip"></p>' +
      '<div class="cal-list" id="calList"></div>' +
      '</div>' +
      '<div id="calLog" hidden>' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">今日热量</div><div class="rc-val" id="calKcal">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">还可摄入</div><div class="rc-val" id="calLeft">2000</div></div>' +
      '<div class="res-card"><div class="rc-lab">蛋白质</div><div class="rc-val" id="calPro">0 g</div></div>' +
      '<div class="res-card"><div class="rc-lab">脂肪 / 碳水</div><div class="rc-val" id="calFatCarb">0 / 0 g</div></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<div class="ml-budget-row">' +
      '<span class="tool-lab">每日热量目标：<b id="calGoalVal">2000 kcal</b></span>' +
      '<button class="ql-btn" id="calSetGoal" type="button">设置目标</button>' +
      '</div>' +
      '<div class="wt-bar"><div class="wt-fill" id="calFill"></div></div>' +
      '<div class="wt-pct-row"><small>今日进度</small><small id="calPct"></small></div>' +
      '</div>' +
      '<div class="ml-rows" id="calRows"></div>' +
      '<div class="set-btns"><button class="btn btn-ghost" id="calCopy" type="button">📋 复制今日总结</button></div>' +
      '<p class="cd-note">记录只保存在本设备浏览器；跨天后自动开始新的一天，历史记录仍会保留。热量与营养为参考值。</p>' +
      '</div>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">食物热量数据仅供参考，不同来源可能有差异。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    loadLog();
    tab = 'search';
    cat = '全部';
    renderCats();

    $('#calIn', root).addEventListener('input', renderList);
    $('#calGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; renderList(); });
    $('#calCats', root).addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      cat = b.dataset.cat;
      renderCats();
      renderList();
    });
    $('#calList', root).addEventListener('click', e => {
      const it = e.target.closest('[data-n]');
      if (!it) return;
      const f = foods.find(x => x.n === it.dataset.n);
      if (f) openPortion(f);
    });
    $('#calLog', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      /* Step 10：删除二次确认（图标小按钮红色态提示） */
      LB.confirm(del, () => {
        const d = todayStr();
        const box = log.find(x => x.date === d);
        if (box) { box.items.splice(parseInt(del.dataset.del, 10), 1); saveLog(); }
        renderLog();
        LB.toast('已删除', 'ok');
      }, 3000, { iconOnly: true });
    });
    $('#calSetGoal', root).addEventListener('click', setGoal);
    $('#calCopy', root).addEventListener('click', copySummary);
    root.addEventListener('click', e => {
      const t = e.target.closest('.cal-tab');
      if (t) { switchTab(t.dataset.tab); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });

    if (!loaded) {
      renderList();
      LB.dict.load('foods')
        .then(d => {
          if (!rootEl) return;
          foods = Array.isArray(d) ? d : [];
          loaded = true;
          renderList();
          renderLog();
          if (!foods.length) LB.toast('食物库为空', 'err');
        })
        .catch(() => { if (rootEl) { loaded = true; LB.toast('食物库加载失败', 'err'); renderList(); } });
    } else {
      renderList();
      renderLog();
    }
  }

  function unmount() {
    closeModal();
    rootEl = null;
  }

  LB.router.register('calorie', { mount, unmount });
})();
