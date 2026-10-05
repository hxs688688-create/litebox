/* LiteBox v5 · tools/party.js — Party Box Pro 聚会小游戏
   7 种玩法：摇骰子 / 比大小 / 转瓶子 / 真心话 / 大冒险 / 数字炸弹 / 谁是卧底
   玩家名单存 litebox_party_names（最多 24 人），骰子历史存 litebox_dice_history（最近 8 局）
   随机全部走 LB.rng（加密随机，禁 Math.random） */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const KEY_NAMES = 'litebox_party_names';
  const KEY_DICE = 'litebox_dice_history';

  const MODES = [
    { id: 'dice',   label: '🎲 摇骰子' },
    { id: 'versus', label: '⚔️ 比大小' },
    { id: 'bottle', label: '🍾 转瓶子' },
    { id: 'truth',  label: '💬 真心话' },
    { id: 'dare',   label: '⚡ 大冒险' },
    { id: 'bomb',   label: '💣 数字炸弹' },
    { id: 'spy',    label: '🕵️ 谁是卧底' }
  ];

  const TRUTH = [
    '你最近一次真正开心是什么时候？',
    '手机里最舍不得删的一张照片是什么？',
    '你最想立刻学会的一项技能是什么？',
    '今年最想完成的一件事是什么？',
    '在场谁最适合和你一起旅行？',
    '你最近偷偷期待的一件事是什么？',
    '你做过最冲动的一件事是什么？',
    '说一个别人很难发现的小习惯。',
    '最近一次哭是因为什么？',
    '你最想重来的一段时光是什么？',
    '如果明天不用上学/上班，你最想做什么？',
    '你最欣赏朋友身上的哪个优点？',
    '你最近循环最多的一首歌是什么？',
    '你有没有偷偷羡慕过在场的人？为什么？',
    '你最想对一年前的自己说一句什么？'
  ];

  const DARE = [
    '用方言介绍自己 20 秒。',
    '模仿一个熟悉的人物让大家猜。',
    '闭眼画一个表情让大家猜。',
    '用三个表情讲一个完整故事。',
    '给在场任意一人说出一个真诚优点。',
    '连续做 5 个夸张表情。',
    '用播音腔读一段公开内容。',
    '讲一个 30 秒冷笑话。',
    '用最萌的语气说一句最严肃的话。',
    '给左/右的人唱一句歌。',
    '闭眼指一个人，说出他最好的一个特点。',
    '用身体摆出一个字母。',
    '做 10 个开合跳。',
    '用英语说 3 句话介绍自己。',
    '模仿一个动物叫声，让大家猜。'
  ];

  const SPY_WORDS = [
    ['太阳', '月亮'],
    ['咖啡', '奶茶'],
    ['地铁', '公交'],
    ['篮球', '足球'],
    ['火锅', '串串'],
    ['海边', '雪山'],
    ['猫', '狗'],
    ['电影', '电视剧'],
    ['西瓜', '哈密瓜'],
    ['微信', 'QQ']
  ];

  let rootEl = null;
  let alive = false;
  let mode = 'dice';
  let rounds = 0;

  /* —— 摇骰子状态 —— */
  let history = [];
  let rolling = false;
  let burstLeft = 0;
  const rollTimers = [];
  let burstTimer = 0;

  /* —— 转瓶子状态 —— */
  let spinTotal = 0;
  let spinning = false;
  let spinTimer = 0;

  /* —— 数字炸弹状态 —— */
  let bLo = 1;
  let bHi = 100;
  let bBomb = LB.rng.int(1, 100);
  let bOver = false;
  let flashTimer = 0;

  /* —— 谁是卧底状态 —— */
  let uState = 'idle'; /* idle / ready / vote / done */
  let uPair = null;
  let uSpy = -1;
  let uWordTimer = 0;

  let lastTruth = -1;
  let lastDare = -1;

  function bump(n) {
    rounds += (n || 1);
    const el = $('#ptRounds', rootEl);
    if (el) el.textContent = rounds;
  }

  /* 通用 pop 动画（重复触发需先移除再强制 reflow） */
  function pop(el) {
    if (!el) return;
    el.classList.remove('pt-pop');
    void el.offsetWidth;
    el.classList.add('pt-pop');
  }

  /* ================= 玩家名单 ================= */

  function getNames() {
    const ta = $('#ptNames', rootEl);
    if (!ta) return [];
    return ta.value.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 24);
  }

  function updNamesCount() {
    const el = $('#ptNameCnt', rootEl);
    if (el) el.textContent = getNames().length;
  }

  function saveNames() {
    const ta = $('#ptNames', rootEl);
    if (!ta) return;
    const all = ta.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (all.length > 24) {
      all.length = 24;
      LB.toast('玩家最多 24 人，已自动截断', 'warn');
    }
    ta.value = all.join('\n');
    LB.storage.set(KEY_NAMES, all);
    updNamesCount();
    LB.toast('玩家名单已保存', 'ok');
  }

  function shuffleNames() {
    const ta = $('#ptNames', rootEl);
    if (!ta) return;
    const all = ta.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (all.length < 2) { LB.toast('至少需要 2 名玩家才能打乱', 'info'); return; }
    LB.rng.shuffle(all);
    ta.value = all.join('\n');
    updNamesCount();
    LB.toast('已打乱顺序，记得保存名单', 'info');
  }

  /* ================= 模式 1 · 摇骰子 ================= */

  function dieHTML() {
    let faces = '';
    /* 每面挂两个类：lb4-f{n}（3D 位置）+ lb4-f-s{n}（点阵显隐） */
    for (let f = 1; f <= 6; f++) faces += '<div class="lb4-die-face lb4-f' + f + ' lb4-f-s' + f + '">' + '<span></span>'.repeat(9) + '</div>';
    return '<div class="lb4-die-wrap"><div class="lb4-die">' + faces + '</div></div>';
  }

  async function roll() {
    if (rolling || !alive) return;
    rolling = true;
    const vals = Array.from({ length: 5 }, () => 1 + LB.rng.int(0, 5));
    const ds = $$('.lb4-die', rootEl);
    ds.forEach((d, i) => {
      d.classList.add('rolling');
      rollTimers.push(setTimeout(() => {
        /* 结束位姿：与 CSS 面定义对应 —— f2=rotateX(-90°) 位于底面、f5=rotateX(90°) 位于顶面、
           f3=rotateY(90°) 位于右面、f4=rotateY(-90°) 位于左面；
           需反向旋转才能把目标面转到正面朝上（任务给定的 orient 符号与面定义相反，已修正） */
        const orient = {
          1: 'rotateX(0) rotateY(0)',
          2: 'rotateX(90deg)',
          3: 'rotateY(-90deg)',
          4: 'rotateY(90deg)',
          5: 'rotateX(-90deg)',
          6: 'rotateY(180deg)'
        };
        d.style.transform = orient[vals[i]];
      }, 1120 + i * 20));
    });
    rollTimers.push(setTimeout(() => {
      rolling = false;
      if (!alive) return;
      ds.forEach(d => d.classList.remove('rolling'));
      const sum = vals.reduce((a, b) => a + b, 0);
      /* 判断有无特殊组合 */
      const cnt = {};
      vals.forEach(v => cnt[v] = (cnt[v] || 0) + 1);
      const max = Math.max(...Object.values(cnt));
      let tip = '本轮总点数 ' + sum;
      if (max === 5) tip = '🎉 五个相同！豹子';
      else if (max === 4) tip = '🔥 四个相同！';
      else if (max === 3) tip = '✨ 三个相同！';
      const total = $('#ptDiceTotal', rootEl);
      const tipEl = $('#ptDiceTip', rootEl);
      if (total) total.textContent = sum;
      if (tipEl) { tipEl.textContent = tip; pop(tipEl); }
      /* 加入历史（最新在前，最多 8 局） */
      history.unshift({ d: vals, total: sum });
      history = history.slice(0, 8);
      LB.storage.set(KEY_DICE, history);
      renderHist();
      bump();
      /* 触感 */
      if (navigator.vibrate) try { navigator.vibrate([16, 22, 32]); } catch (_) {}
    }, 1400));
  }

  function renderHist() {
    const box = $('#ptHist', rootEl);
    if (!box) return;
    box.innerHTML = history.length
      ? history.map(h => '<div class="pt-hist-item"><span>' + h.d.join(' · ') + '</span><b>' + h.total + ' 点</b></div>').join('')
      : '<div class="pt-hist-item pt-hist-empty">还没有记录，摇一次试试</div>';
  }

  /* 连摇 5 次：每 300ms 触发一次 roll（roll 动画期间由 rolling 锁自动等待，逐轮完整播放） */
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

  /* ================= 模式 2 · 比大小 ================= */

  function versusGo() {
    const names = getNames();
    const a = LB.rng.int(1, 100);
    const b = LB.rng.int(1, 100);
    const nA = names[0] || '玩家 A';
    const nB = names[1] || '玩家 B';
    const elA = $('#ptVsA .pt-vs-num', rootEl);
    const elB = $('#ptVsB .pt-vs-num', rootEl);
    if (elA) elA.textContent = a;
    if (elB) elB.textContent = b;
    const sideA = $('#ptVsA', rootEl);
    const sideB = $('#ptVsB', rootEl);
    if (sideA) sideA.classList.toggle('win', a > b);
    if (sideB) sideB.classList.toggle('win', b > a);
    const tip = $('#ptVsTip', rootEl);
    if (tip) {
      tip.textContent = a === b ? '🤝 平局，再来一局！' : '🏆 ' + (a > b ? nA : nB) + ' 获胜！';
      pop(tip);
    }
    bump();
  }

  /* ================= 模式 3 · 转瓶子 ================= */

  function spinBottle() {
    if (spinning || !alive) return;
    const names = getNames();
    if (names.length < 2) { LB.toast('先在玩家名单里填好至少 2 名玩家', 'info'); return; }
    spinning = true;
    spinTotal += 360 * LB.rng.int(2, 4) + LB.rng.int(1, 359); /* 累积角度保证始终顺时针 */
    const el = $('#ptBottle', rootEl);
    if (el) el.style.transform = 'rotate(' + spinTotal + 'deg)';
    const tip = $('#ptBottleTip', rootEl);
    if (tip) tip.textContent = '瓶子转动中…';
    spinTimer = setTimeout(() => {
      spinning = false;
      if (!alive) return;
      const list = getNames();
      if (!list.length) return;
      const seg = 360 / list.length;
      const deg = ((spinTotal % 360) + 360) % 360;
      const idx = Math.floor(deg / seg) % list.length;
      const t2 = $('#ptBottleTip', rootEl);
      if (t2) { t2.textContent = '🍾 瓶口指向：' + list[idx]; pop(t2); }
      bump();
    }, 2200);
  }

  /* ================= 模式 4/5 · 真心话 / 大冒险 ================= */

  function drawQ(kind) {
    const bank = kind === 'truth' ? TRUTH : DARE;
    const last = kind === 'truth' ? lastTruth : lastDare;
    let i;
    do { i = LB.rng.int(0, bank.length - 1); } while (bank.length > 1 && i === last);
    if (kind === 'truth') lastTruth = i; else lastDare = i;
    const el = $('#ptQText', rootEl);
    if (el) el.textContent = bank[i];
    pop($('#ptQ', rootEl));
    bump();
  }

  /* ================= 模式 6 · 数字炸弹 ================= */

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
  }

  function bombReset() {
    const loInp = $('#ptBombLo', rootEl);
    const hiInp = $('#ptBombHi', rootEl);
    if (!loInp || !hiInp) return;
    const lo = Math.max(1, Math.min(100, parseInt(loInp.value, 10) || 1));
    const hi = Math.max(1, Math.min(100, parseInt(hiInp.value, 10) || 100));
    if (lo >= hi) { LB.toast('起点必须小于终点', 'warn'); return; }
    bLo = lo; bHi = hi; bOver = false;
    bBomb = LB.rng.int(lo, hi);
    renderBomb();
    const tip = $('#ptBombTip', rootEl);
    if (tip) tip.textContent = '炸弹已布置在 ' + lo + ' - ' + hi + ' 之间，轮流点数字吧';
  }

  function bombPick(btn) {
    if (bOver || btn.disabled) return;
    const n = parseInt(btn.dataset.n, 10);
    if (!(n >= bLo && n <= bHi)) return;
    bump();
    const tip = $('#ptBombTip', rootEl);
    if (n === bBomb) {
      bOver = true;
      flashBoom();
      if (tip) { tip.textContent = '💥 BOOM！炸弹是 ' + n + '，本局结束'; pop(tip); }
      renderBomb();
    } else if (n < bBomb) {
      bLo = n + 1;
      if (tip) tip.textContent = '😅 ' + n + ' 比炸弹小，下限抬到 ' + bLo;
      renderBomb();
    } else {
      bHi = n - 1;
      if (tip) tip.textContent = '😅 ' + n + ' 比炸弹大，上限压到 ' + bHi;
      renderBomb();
    }
  }

  function flashBoom() {
    const f = document.createElement('div');
    f.className = 'pt-flash';
    document.body.appendChild(f);
    flashTimer = setTimeout(() => { f.remove(); }, 600);
  }

  /* ================= 模式 7 · 谁是卧底 ================= */

  function spyStart() {
    const names = getNames();
    if (names.length < 4) { LB.toast('谁是卧底需要 4 名以上玩家，先在上方名单里加人', 'warn'); return; }
    uPair = SPY_WORDS[LB.rng.int(0, SPY_WORDS.length - 1)];
    uSpy = LB.rng.int(0, names.length - 1);
    uState = 'ready';
    bump();
    renderSpy();
  }

  function spyShow(btn) {
    if (uState !== 'ready' || !uPair) return;
    const i = parseInt(btn.dataset.i, 10);
    const wordEl = $('#ptSpyWord', rootEl);
    const txt = $('#ptSpyWordText', rootEl);
    const sub = $('#ptSpyWordSub', rootEl);
    if (!wordEl || !txt) return;
    txt.textContent = i === uSpy ? uPair[1] : uPair[0];
    if (sub) sub.textContent = '是你的词（2 秒后自动隐藏，别让别人看到）';
    wordEl.hidden = false;
    pop(wordEl);
    clearTimeout(uWordTimer);
    uWordTimer = setTimeout(() => {
      if (!alive) return;
      const w = $('#ptSpyWord', rootEl);
      if (w) w.hidden = true;
    }, 2000);
  }

  function spyVote() { uState = 'vote'; renderSpy(); }

  function spyReveal() { uState = 'done'; renderSpy(); }

  function renderSpy() {
    const st = $('#ptSpyStatus', rootEl);
    const pl = $('#ptSpyPlayers', rootEl);
    const bt = $('#ptSpyBtns', rootEl);
    const wd = $('#ptSpyWord', rootEl);
    if (!st || !pl || !bt) return;
    const names = getNames();
    if (uState === 'idle') {
      st.textContent = names.length >= 4 ? '人齐了，点「开始游戏」发词' : '需要 4 名以上玩家：先在上方名单里填好名字';
      pl.innerHTML = '';
      if (wd) wd.hidden = true;
      bt.innerHTML = '<button class="btn btn-main" data-act="spystart" type="button">🎭 开始游戏</button>';
    } else if (uState === 'ready') {
      st.textContent = '词已发好：依次点击名字查看自己的词（2 秒后自动隐藏）';
      pl.innerHTML = names.map((n, i) =>
        '<button type="button" class="pt-spy-p" data-act="spyplayer" data-i="' + i + '">' + esc(n) + '</button>'
      ).join('');
      bt.innerHTML = '<button class="btn btn-main" data-act="spyvote" type="button">✅ 完成传阅，开始投票</button>';
    } else if (uState === 'vote') {
      st.textContent = '完成传阅，开始投票！讨论后指认你认为的卧底';
      pl.innerHTML = '';
      if (wd) wd.hidden = true;
      bt.innerHTML =
        '<button class="btn btn-main" data-act="spyreveal" type="button">🕵️ 揭晓答案</button>' +
        '<button class="btn btn-ghost" data-act="spystart" type="button">🔄 再来一局</button>';
    } else {
      const civ = uPair ? uPair[0] : '';
      const und = uPair ? uPair[1] : '';
      st.textContent = '🕵️ 卧底是：' + (names[uSpy] || '？');
      pl.innerHTML = '';
      if (wd) {
        wd.hidden = false;
        const txt = $('#ptSpyWordText', rootEl);
        const sub = $('#ptSpyWordSub', rootEl);
        if (txt) txt.textContent = '平民词「' + civ + '」 · 卧底词「' + und + '」';
        if (sub) sub.textContent = '卧底拿到的词与大家不同，讨论里最容易露馅';
      }
      bt.innerHTML = '<button class="btn btn-main" data-act="spystart" type="button">🔄 再来一局</button>';
    }
  }

  /* ================= 舞台渲染 ================= */

  function stageHTML() {
    if (mode === 'dice') {
      let dice = '';
      for (let i = 0; i < 5; i++) dice += dieHTML();
      return '<div class="lb4-dice-stage">' + dice + '</div>' +
        '<div class="pt-dice-out"><span class="pt-dice-total">总点数 <b id="ptDiceTotal">—</b></span></div>' +
        '<div class="pt-tip" id="ptDiceTip">点「摇一次」开出 5 颗骰子</div>' +
        '<div class="pt-btns">' +
        '<button class="btn btn-main" data-act="roll" type="button">🎲 摇一次</button>' +
        '<button class="btn btn-ghost" data-act="roll5" type="button">🔁 连摇 5 次</button>' +
        '<button class="btn btn-ghost" data-act="clearhist" type="button">↺ 清空记录</button>' +
        '</div>' +
        '<div class="pt-hist" id="ptHist"></div>';
    }
    if (mode === 'versus') {
      const names = getNames();
      return '<div class="pt-versus">' +
        '<div class="pt-vs-side" id="ptVsA"><span class="pt-vs-name">' + esc(names[0] || '玩家 A') + '</span><b class="pt-vs-num">?</b></div>' +
        '<div class="pt-vs-mid">VS</div>' +
        '<div class="pt-vs-side" id="ptVsB"><span class="pt-vs-name">' + esc(names[1] || '玩家 B') + '</span><b class="pt-vs-num">?</b></div>' +
        '</div>' +
        '<div class="pt-tip" id="ptVsTip">两边各随机 1 - 100，点数大的一方获胜</div>' +
        '<div class="pt-btns"><button class="btn btn-main" data-act="vsgo" type="button">⚔️ 开始比大小</button></div>';
    }
    if (mode === 'bottle') {
      return '<div class="pt-bottle-stage"><span class="pt-bottle" id="ptBottle">🍾</span></div>' +
        '<div class="pt-tip" id="ptBottleTip">点「开始转」，瓶口指向谁就由谁来接受挑战</div>' +
        '<div class="pt-btns"><button class="btn btn-main" data-act="spin" type="button">🍾 开始转</button></div>';
    }
    if (mode === 'truth' || mode === 'dare') {
      const isT = mode === 'truth';
      return '<div class="pt-qcard" id="ptQ"><p class="pt-q-text" id="ptQText">' +
        (isT ? '点「抽一题」，诚实回答就好' : '点「抽一题」，勇敢接受挑战') + '</p></div>' +
        '<div class="pt-btns">' +
        '<button class="btn btn-main" data-act="draw" type="button">' + (isT ? '💬 抽一题' : '⚡ 抽一题') + '</button>' +
        '<button class="btn btn-ghost" data-act="draw" type="button">🔥 换一个</button>' +
        '<button class="btn btn-ghost" data-act="swap" type="button">↔️ 切换' + (isT ? '大冒险' : '真心话') + '</button>' +
        '</div>';
    }
    if (mode === 'bomb') {
      return '<div class="pt-bomb-set">' +
        '<label class="pz-lab">起点<input class="inp" id="ptBombLo" type="number" min="1" max="100" value="' + bLo + '" /></label>' +
        '<label class="pz-lab">终点<input class="inp" id="ptBombHi" type="number" min="1" max="100" value="' + bHi + '" /></label>' +
        '<button class="btn btn-ghost btn-sm" data-act="bombreset" type="button">💣 重新布置</button>' +
        '</div>' +
        '<div class="pt-bomb-range" id="ptBombRange">当前范围：' + bLo + ' - ' + bHi + '</div>' +
        '<div class="pt-bomb-grid" id="ptBombGrid">' + bombGridHTML() + '</div>' +
        '<div class="pt-tip" id="ptBombTip">轮流点一个数字，踩中炸弹的人接受惩罚</div>';
    }
    /* 谁是卧底 */
    return '<div class="pt-spy-status" id="ptSpyStatus"></div>' +
      '<div class="pt-spy-players" id="ptSpyPlayers"></div>' +
      '<div class="pt-spy-word" id="ptSpyWord" hidden><b id="ptSpyWordText"></b><small id="ptSpyWordSub"></small></div>' +
      '<div class="pt-btns" id="ptSpyBtns"></div>';
  }

  function renderStage() {
    const st = $('#ptStage', rootEl);
    if (!st) return;
    st.innerHTML = stageHTML();
    if (mode === 'dice') renderHist();
    else if (mode === 'bomb') renderBomb();
    else if (mode === 'spy') renderSpy();
  }

  function setMode(m) {
    if (!MODES.some(x => x.id === m) || m === mode) return;
    mode = m;
    $$('.pt-chip', rootEl).forEach(c => c.classList.toggle('on', c.dataset.mode === m));
    renderStage();
  }

  /* ================= 页面结构 ================= */

  function html() {
    const chips = MODES.map(m =>
      '<button type="button" class="pt-chip' + (m.id === mode ? ' on' : '') + '" data-mode="' + m.id + '">' + m.label + '</button>'
    ).join('');
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>Party Box Pro</h1><p class="pt-sub">7 种聚会玩法 · <span class="pt-rounds">本局 <b id="ptRounds">0</b> 局</span></p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="pt-chips" id="ptChips">' + chips + '</div>' +
      '<details class="card tool-sec set-card pt-names-card" open>' +
      '<summary>👥 玩家名单（<b id="ptNameCnt">0</b> 人）</summary>' +
      '<textarea class="inp" id="ptNames" rows="5" maxlength="400" placeholder="每行一个玩家名，最多 24 人&#10;小明&#10;小红&#10;小刚"></textarea>' +
      '<div class="pt-names-btns">' +
      '<button class="btn btn-main btn-sm" id="ptSaveNames" type="button">💾 保存名单</button>' +
      '<button class="btn btn-ghost btn-sm" id="ptShuffleNames" type="button">🔀 打乱</button>' +
      '</div>' +
      '</details>' +
      '<div class="card tool-sec set-card" id="ptStage"></div>' +
      '<p class="cd-note">默认加入「可以跳过」的轻量挑战，不强制饮酒；可按你们的聚会规则调整。</p>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();

    const saved = LB.storage.get(KEY_NAMES, []);
    if (Array.isArray(saved) && saved.length) $('#ptNames', root).value = saved.slice(0, 24).join('\n');
    const h = LB.storage.get(KEY_DICE, []);
    history = Array.isArray(h)
      ? h.filter(x => x && Array.isArray(x.d) && x.d.length === 5 && typeof x.total === 'number').slice(0, 8)
      : [];
    updNamesCount();

    $('#ptChips', root).addEventListener('click', e => {
      const c = e.target.closest('[data-mode]');
      if (c) setMode(c.dataset.mode);
    });
    $('#ptSaveNames', root).addEventListener('click', saveNames);
    $('#ptShuffleNames', root).addEventListener('click', shuffleNames);
    $('#ptNames', root).addEventListener('input', updNamesCount);
    $('#ptStage', root).addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'roll') roll();
      else if (act === 'roll5') rollBurst();
      else if (act === 'clearhist') { LB.confirm(b, () => { history = []; LB.storage.set(KEY_DICE, history); renderHist(); }); }
      else if (act === 'vsgo') versusGo();
      else if (act === 'spin') spinBottle();
      else if (act === 'draw') drawQ(mode === 'truth' ? 'truth' : 'dare');
      else if (act === 'swap') setMode(mode === 'truth' ? 'dare' : 'truth');
      else if (act === 'bombreset') bombReset();
      else if (act === 'num') bombPick(b);
      else if (act === 'spystart') spyStart();
      else if (act === 'spyplayer') spyShow(b);
      else if (act === 'spyvote') spyVote();
      else if (act === 'spyreveal') spyReveal();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    renderStage();
  }

  function unmount() {
    alive = false;
    rollTimers.forEach(clearTimeout);
    rollTimers.length = 0;
    clearInterval(burstTimer);
    clearTimeout(spinTimer);
    clearTimeout(uWordTimer);
    clearTimeout(flashTimer);
    burstLeft = 0;
    rolling = false;
    spinning = false;
    const fl = document.querySelector('.pt-flash');
    if (fl) fl.remove();
    rootEl = null;
  }

  LB.router.register('party', { mount, unmount });
})();
