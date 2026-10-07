/* LiteBox v5 · tools/scoreboard.js — 记分牌（聚会 / 桌游 / 运动比赛多人计分 + 全屏大字）
 *
 * 【存储结构】
 *   litebox_scoreboard = [{ id, name, score }]
 *   id 不用数组下标做 key：删除中间某个玩家后下标会整体前移，
 *   拿下标当身份会让「刚删的人」的操作打到别人身上。用自增uid 才稳。
 *
 * 【全屏为什么用自绘 overlay 而不是原生 Fullscreen API 直接放内容】
 *   1. iOS Safari 不支持 element.requestFullscreen，原生方案在手机上直接失效；
 *   2. 任务书要求「点击屏幕任意处退出」，而原生全屏只能靠 ESC / 退出按钮，
 *      点内容不会触发退出。
 *   所以照 deadpixel.js 的做法：overlay 铺满视口 + 尝试 requestFullscreen（失败静默），
 *   三重退出（点击 / ESC / fullscreenchange）保证 overlay 一定被摘掉。
 *
 * 【分数用整数还是浮点】
 *   用浮点存储（-0.5 这类半场比分也该能记），但显示时做「整数值不带小数点」的处理，
 *   否则会出现 3.0000000000000004 这种尾巴。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const KEY = 'litebox_scoreboard';

  let rootEl = null;
  let players = [];
  let uid = 1;              /* 自增 id，避免用下标当身份（见文件头说明） */
  let overlay = null;
  let onKey = null;
  let onFsChange = null;

  function esc(s) { return LB.dom.esc(s); }

  function load() {
    const v = LB.storage.get(KEY, []);
    if (!Array.isArray(v)) return [];
    /* 逐项校验：localStorage 里的数据可能被手改过，也可能是旧版本结构 */
    return v.filter(p => p && typeof p ==='object' && typeof p.name === 'string')
      .map(p => ({
        id: typeof p.id === 'number' ? p.id : uid++,
        name: String(p.name).slice(0, 12),
        score: Number.isFinite(+p.score) ? +p.score : 0
      }));
  }
  function save() { LB.storage.set(KEY, players); }

  /* 名字首字（取第一个可见字符，中英文都适用） */
  function initial(name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    /* 用Array.from 按码点切，避免 emoji / 生僻字被截成半个代理对 */
    return Array.from(s)[0].toUpperCase();
  }

  /* 分数显示：整数就不带小数点，非整数最多两位 */
  function fmtScore(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  }

  function sortByScore() {
    return players.slice().sort((a, b) => b.score - a.score);
  }

  function render() {
    const box = $('#sbList', rootEl);
    if (!players.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '🏆',
        title: '还没有玩家',
        sub: '输入名字点「＋ 添加」开始计分，分数自动保存本机',
        ctaText: '添加玩家',
        onCta: () => { const inp = $('#sbName', rootEl); if (inp) inp.focus(); }
      });
      $('#sbReset', rootEl).disabled = true;
      $('#sbFull', rootEl).disabled = true;
      return;
    }
    $('#sbReset', rootEl).disabled = false;
    $('#sbFull', rootEl).disabled = false;

    box.innerHTML = sortByScore().map(p => {
      const neg = p.score < 0;
      return '<div class="sb-row" data-id="' + p.id + '">' +
        '<div class="sb-av" aria-hidden="true">' + esc(initial(p.name)) + '</div>' +
        '<div class="sb-name" title="' + esc(p.name) + '">' + esc(p.name) + '</div>' +
        '<div class="sb-score' + (neg ? ' neg' : '') + '">' + fmtScore(p.score) + '</div>' +
        '<div class="sb-ops">' +
        '<button class="sb-op" type="button" data-act="dec1" data-id="' + p.id + '" aria-label="' + esc(p.name) + ' 减1">−1</button>' +
        '<button class="sb-op" type="button" data-act="inc1" data-id="' + p.id + '" aria-label="' + esc(p.name) + ' 加1">+1</button>' +
        '<button class="sb-op" type="button" data-act="inc5" data-id="' + p.id + '" aria-label="' + esc(p.name) + ' 加5">+5</button>' +
        '<button class="sb-op" type="button" data-act="dec5" data-id="' + p.id + '" aria-label="' + esc(p.name) + ' 减5">−5</button>' +
        '<button class="sb-op del" type="button" data-act="del" data-id="' + p.id + '" aria-label="删除 ' + esc(p.name) + '">×</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function addPlayer() {
    const inp = $('#sbName', rootEl);
    const name = String(inp.value || '').trim().slice(0, 12);
    if (!name) { LB.toast('先给玩家起个名字', 'info'); inp.focus(); return; }
    if (players.length >= 20) { LB.toast('最多 20 人', 'info'); return; }
    players.push({ id: uid++, name: name, score: 0 });
    inp.value = '';
    save(); render();
    inp.focus();
  }

  function bump(id, delta) {
    const p = players.find(x => x.id === id);
    if (!p) return;
    p.score = Math.round((p.score + delta) * 100) / 100;
    save(); render();
  }

  function removePlayer(id) {
    const p = players.find(x => x.id === id);
    if (!p) return;
    /* 名字是用户起的，删除前先回显出来，避免误删后不知道删了谁 */
    LB.toast('已删除 ' + p.name, 'info');
    players = players.filter(x => x.id !== id);
    save(); render();
  }

  /* 「重置全部」= 所有人的分数归零，玩家保留。
     逐个删玩家是每个玩家行上的「×」按钮的职责；
     如果这里也清空列表，下一局就得把20 个名字重打一遍，违背「重置」的字面意思。 */
  function resetAll() {
    if (!players.length) return;
    const n = players.length;
    players.forEach(p => { p.score = 0; });
    save(); render();
    LB.toast('已把 ' + n + ' 位玩家分数归零', 'info');
  }

  /* ---------- 全屏大字 ---------- */
  function buildOverlay() {
    const ov = document.createElement('div');
    ov.className = 'sb-fs';
    ov.setAttribute('role', 'button');
    ov.setAttribute('aria-label', '点击任意处退出全屏');
    return ov;
  }

  function paintOverlay() {
    if (!overlay) return;
    const arr = sortByScore();
    const maxAbs = arr.reduce((m, p) => Math.max(m, Math.abs(p.score)), 0);
    /* 分数跨度大时按比例缩字号，避免 1000 和 1 挤在同一行时 1 看不见 */
    overlay.innerHTML = '<div class="sb-fs-hint">点击任意处退出</div>' +
      '<div class="sb-fs-list">' +
      arr.map((p, i) => {
        /* 绝对值最大的用 15vw（任务书指定），其余按比例缩，小到 8vw 收底 */
        const ratio = maxAbs > 0 ? Math.abs(p.score) / maxAbs : 1;
        const fs = Math.max(8, Math.round(15 * (0.45 + 0.55 * ratio)));
        const lead = i === 0 ? ' sb-fs-lead' : '';
        return '<div class="sb-fs-row' + lead + '">' +
          '<div class="sb-fs-name">' + esc(p.name) + '</div>' +
          '<div class="sb-fs-score" style="font-size:' + fs + 'vw">' + fmtScore(p.score) + '</div>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  function startFullscreen() {
    if (overlay) return;
    if (!players.length) { LB.toast('先添加玩家', 'info'); return; }
    overlay = buildOverlay();
    paintOverlay();
    document.body.appendChild(overlay);
    overlay.addEventListener('click', stop);

    /* iOS Safari 无 requestFullscreen，静默降级为「仅铺满视口」，功能不受影响 */
    try {
      if (document.documentElement.requestFullscreen) {
        const p = document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) { /* 忽略：overlay 已铺满 */ }

    onKey = e => { if (e.key === 'Escape') { e.preventDefault(); stop(); } };
    onFsChange = () => { if (!document.fullscreenElement && overlay) stop(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
  }

  function stop() {
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (onFsChange) { document.removeEventListener('fullscreenchange', onFsChange); onFsChange = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    if (document.fullscreenElement && document.exitFullscreen) {
      try { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>记分牌</h1><p>聚会桌游、运动比赛多人计分，可全屏大字展示</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="sb-add">' +
      '<input class="inp" id="sbName" type="text" maxlength="12" placeholder="玩家名字" aria-label="玩家名字">' +
      '<button class="btn btn-main js-primary-submit" id="sbAdd" type="button">＋ 添加</button>' +
      '</div>' +
      '<p class="cd-note">回车快速添加。列表按分数从高到低自动排序，分数相同的按添加顺序。</p>' +
      '<div class="tool-sec">' +
      '<div class="sb-list" id="sbList"></div>' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="sbReset" type="button" disabled>重置全部</button>' +
      '<button class="btn btn-main" id="sbFull" type="button" disabled>📺 全屏显示</button>' +
      '</div>' +
      '<p class="cd-note">全屏后点击屏幕任意处即可退出，也可按 Esc。分数自动保存在本机浏览器。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    players = load();
    uid = players.reduce((m, p) => Math.max(m, p.id), 0) + 1;

    render();

    $('#sbAdd', root).addEventListener('click', addPlayer);
    $('#sbName', root).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addPlayer(); }
    });
    $('#sbList', root).addEventListener('click', e => {
      const b = e.target.closest('.sb-op');
      if (!b) return;
      const id = parseInt(b.dataset.id, 10);
      const act = b.dataset.act;
      if (act === 'del') removePlayer(id);
      else if (act === 'inc1') bump(id, 1);
      else if (act === 'inc5') bump(id, 5);
      else if (act === 'dec1') bump(id, -1);
      else if (act === 'dec5') bump(id, -5);
    });
    $('#sbReset', root).addEventListener('click', e => LB.confirm(e.currentTarget, resetAll));
    $('#sbFull', root).addEventListener('click', startFullscreen);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    /* ★ 必须 stop()：否则 overlay 留在 body 上，切工具后仍盖在页面上，
       而且它身上的 document 级监听会一直活着。 */
    stop();
    players = [];
    rootEl = null;
  }

  LB.router.register('scoreboard', { mount, unmount });
})();
