/* LiteBox v5 · tools/teleprompter.js — 提词器（匀速滚动演讲稿 + 手持弹幕）
 *
 * 【滚动位置为什么不能只靠 scrollPos 累加】
 *   任务书示例是 `scrollPos += speed; container.scrollTop = scrollPos;`。
 *   但 scrollTop 是可写也可读的属性，一旦发生用户手动滚动、布局变化、
 *   或内容高度被浏览器修正（图片加载/字体回退），scrollTop 会被浏览器改掉，
 *   而 scrollPos 还在旧值 —— 于是下一次赋值会把画面「拽回」旧位置，
 *   表现就是滚到接近末尾时反复卡住、stop() 永远不触发。
 *   所以每次都从 container.scrollTop 实际值继续累加，只把 speed 作为增量。
 *
 * 【定时器必须留句柄】
 *   setInterval 的句柄不存下来，unmount 时就没法 clearInterval。
 *   一旦不清，切到其它工具页后提词仍在后台每秒跑 30 次回调，
 *   既浪费又会在访问已卸载节点时报错。
 *
 * 【弹幕用 CSS animation 而非 JS 定时器】
 *   任务书要求横向滚动用 @keyframes danmuScroll。CSS 动画由合成器线程驱动，
 *   即使元素已被移除浏览器也会自动回收，不存在泄漏问题。
 *   但要通过 el.remove() 摘掉节点，且「新增弹幕」时重启动画让新弹幕从头进。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  let rootEl = null;

  let mode = 'prompter';     /* prompter | danmu */
  let scrollTimer = null;
  let running = false;
  let fsEl = null;           /* 全屏 overlay */
  let onKey = null;
  let onClick = null;
  let onFsChange = null;
  let danmuSeq = 0;
  let danmuTimers = [];      /* 弹幕自动移除的 setTimeout 句柄 */

  /* ---------- 提词模式 ---------- */
  function speed() { return parseInt($('#tpSpeed', rootEl).value, 10); }

  function stage() { return $('#tpStage', rootEl); }

  function scrollOnce() {
    const c = stage();
    if (!c) return;
    /* 语速滑块 1-20 映射到每次 0.5-6px，1 太慢 20 太快 */
    const step = 0.5 + speed() * 0.28;
    c.scrollTop += step;
    if (c.scrollTop >= c.scrollHeight - c.clientHeight - 1) {
      stop();
      LB.toast('已滚到末尾', 'info');
    }
  }

  function start() {
    if (running) return;
    const c = stage();
    if (!c) return;
    const txt = $('#tpText', rootEl).value;
    if (!txt.trim()) { LB.toast('先输入要提的文本', 'info'); return; }
    running = true;
    /* 从当前实际位置起滚：用户可能已经手动拖到中间了 */
    c.scrollTop = c.scrollTop;
    scrollTimer = setInterval(scrollOnce, 30);
    syncBtn();
  }

  function stop() {
    if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
    running = false;
    syncBtn();
  }

  function syncBtn() {
    const b = $('#tpGo', rootEl);
    if (!b) return;
    b.textContent = running ? '⏸ 暂停' : '▶开始';
    b.classList.toggle('btn-ghost', running);
  }

  function toTop() {
    stop();
    const c = stage();
    if (c) c.scrollTop = 0;
  }

  /* ---------- 弹幕模式 ---------- */
  function addDanmu() {
    const inp = $('#dmText', rootEl);
    const txt = String(inp.value || '').trim().slice(0, 50);
    if (!txt) { LB.toast('先输入弹幕内容', 'info'); return; }
    const color = $('#dmColor', rootEl).value;
    const dur = parseInt($('#dmSpeed', rootEl).value, 10);
    const track = $('#dmTrack', rootEl);
    if (!track) return;

    const el = document.createElement('div');
    el.className = 'dm-item';
    el.textContent = txt;
    el.style.color = color;
    /* 速度滑块 5-30 → 时长 12s-4s，越大越快 */
    el.style.setProperty('--dur', (14 - dur * 0.32).toFixed(2) + 's');
    /* 上下错开，避免所有弹幕挤在同一条视线上（弹幕不能互相遮挡） */
    el.style.top = (8 + (danmuSeq % 4) * 20) + '%';
    danmuSeq++;
    track.appendChild(el);

    /* 动画是 infinite（任务书要求），跑完2 个周期就摘节点：
       既保证完整滚过两轮，又不让 DOM 随按发射次数无限膨胀 */
    const cycle = 14 - dur * 0.32;
    const t = setTimeout(() => {
      el.remove();
      danmuTimers = danmuTimers.filter(x => x !== t);
    }, cycle * 2000 + 400);
    danmuTimers.push(t);
    inp.value = '';
  }

  function clearDanmu() {
    const track = $('#dmTrack', rootEl);
    if (track) track.innerHTML = '';
    danmuTimers.forEach(t => clearTimeout(t));
    danmuTimers = [];
  }

  /* ---------- 全屏 ---------- */
  function enterFullscreen(el) {
    if (!el) return;
    /* iOS Safari 不支持 element.requestFullscreen，静默降级为铺满视口 */
    try {
      if (el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (_) { /* 忽略：CSS 已让它铺满 */ }
  }

  function startFs(kind) {
    if (fsEl) return;
    const c = stage();
    if (kind === 'prompter') {
      if (!$('#tpText', rootEl).value.trim()) { LB.toast('先输入要提的文本', 'info'); return; }
      fsEl = c;
      fsEl.classList.add('tp-fs');
    } else {
      fsEl = $('#dmStage', rootEl);
      if (!fsEl) return;
      fsEl.classList.add('tp-fs');
    }
    document.body.classList.add('tp-fs-lock');
    enterFullscreen(fsEl);
    /* 任务书：「退出：点击屏幕或按 ESC」。
       这里监听元素自身而不是 document —— 因为弹幕模式下用户要连续点/划，
       挂到 document 会让误触立刻退出，反而不好用。 */
    onClick = () => stopFs();
    fsEl.addEventListener('click', onClick);
    onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); stopFs(); }
    };
    onFsChange = () => { if (!document.fullscreenElement && fsEl) stopFs(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
  }

  function stopFs() {
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (onFsChange) { document.removeEventListener('fullscreenchange', onFsChange); onFsChange = null; }
    /* ★ 三个出口（点击 / ESC / fullscreenchange）最终都汇到这里，
       摘节点时必须连元素上的 click 监听一起摘，否则重复绑定会越攒越多 */
    if (fsEl && onClick) { fsEl.removeEventListener('click', onClick); }
    onClick = null;
    document.body.classList.remove('tp-fs-lock');
    if (fsEl) { fsEl.classList.remove('tp-fs'); fsEl = null; }
    if (document.fullscreenElement && document.exitFullscreen) {
      try { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
  }

  /* ---------- 模式切换 ---------- */
  function setMode(m) {
    if (mode === m) return;
    /* 切换前先收尾：定时器 / 全屏 / 弹幕定时器一个都不能漏 */
    stop();
    stopFs();
    clearDanmu();
    mode = m;
    $$('.tp-mode', rootEl).forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#tpPane', rootEl).hidden = m !== 'prompter';
    $('#dmPane', rootEl).hidden = m !== 'danmu';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>提词器</h1><p>演讲直播滚动提词，含手持弹幕模式</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2">' +
      '<button class="tp-mode on" data-m="prompter" type="button">📜 提词模式</button>' +
      '<button class="tp-mode" data-m="danmu" type="button">🎉 弹幕模式</button>' +
      '</div>' +

      /* ---------- 提词模式 ---------- */
      '<div id="tpPane">' +
      '<textarea class="inp mono" id="tpText" rows="6" placeholder="把演讲稿粘进来，全屏后匀速滚动。&#10;建议每句话之间空一行，滚到某句时刚好停顿。" spellcheck="false"></textarea>' +
      '<div class="tp-stage" id="tpStage" aria-live="off"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="tpGo" type="button">▶ 开始</button>' +
      '<button class="btn btn-ghost" id="tpTop" type="button">↑ 回到开头</button>' +
      '<button class="btn btn-ghost" id="tpFs" type="button">📺 全屏</button>' +
      '</div>' +
      '<div class="tp-sliders">' +
      '<label class="tp-lab">语速 <output id="tpSpeedV">5</output>' +
      '<input type="range" id="tpSpeed" min="1" max="20" step="1" value="5"></label>' +
      '<label class="tp-lab">字号 <output id="tpSizeV">48</output> px' +
      '<input type="range" id="tpSize" min="24" max="120" step="2" value="48"></label>' +
      '<label class="tp-lab">行距 <output id="tpLineV">1.6</output>' +
      '<input type="range" id="tpLine" min="1" max="3" step="0.1" value="1.6"></label>' +
      '</div>' +
      '<label class="chk-row"><input type="checkbox" id="tpMirror"><span>镜像显示（摄像镜头反字用）</span></label>' +
      '</div>' +

      /* ---------- 弹幕模式 ---------- */
      '<div id="dmPane" hidden>' +
      '<div class="dm-stage" id="dmStage"><div class="dm-track" id="dmTrack"></div></div>' +
      '<div class="dm-add">' +
      '<input class="inp" id="dmText" type="text" maxlength="50" placeholder="输入弹幕（最多 50 字）" aria-label="弹幕内容">' +
      '<input class="inp dm-color" id="dmColor" type="color" value="#ffffff" aria-label="弹幕颜色">' +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="dmGo" type="button">🚀 发射</button>' +
      '<button class="btn btn-ghost" id="dmClear" type="button">清空</button>' +
      '<button class="btn btn-ghost" id="dmFs" type="button">📺 全屏</button>' +
      '</div>' +
      '<label class="tp-lab">滚动速度 <output id="dmSpeedV">15</output>' +
      '<input type="range" id="dmSpeed" min="5" max="30" step="1" value="15"></label>' +
      '</div>' +

      '<p class="cd-note">提词模式全屏后按 Esc 退出；弹幕模式会把弹幕铺满屏幕横滚，适合聚会 / 直播现场互动。</p>' +
      '</div>'
    );
  }

  /* 提词舞台的样式全部靠 CSS 变量下发，滑块改的是变量而不是重排 DOM */
  function applyStageStyle() {
    const c = stage();
    if (!c) return;
    c.style.setProperty('--tp-size', $('#tpSize', rootEl).value + 'px');
    c.style.setProperty('--tp-line', $('#tpLine', rootEl).value);
    c.style.setProperty('--tp-mirror', $('#tpMirror', rootEl).checked ? 'scaleX(-1)' : 'none');
    /* 走 textContent 而不是 innerHTML：天然防注入，且配合 CSS white-space:pre-wrap
       保留原始换行（innerHTML 塞转义后的文本会把 \n 吃掉，段落全挤成一行）。 */
    const txt = $('#tpText', rootEl).value;
    if (!txt) {
      c.innerHTML = '<span class="tp-ph">在上方输入文本后，这里会显示提词内容</span>';
      return;
    }
    c.textContent = txt;
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    mode = 'prompter';
    running = false; scrollTimer = null; fsEl = null;
    onKey = null; onClick = null; onFsChange = null;
    danmuSeq = 0; danmuTimers = [];

    $$('.tp-mode', root).forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
    $('#tpGo', root).addEventListener('click', () => (running ? stop() : start()));
    $('#tpTop', root).addEventListener('click', toTop);
    $('#tpFs', root).addEventListener('click', () => startFs('prompter'));
    $('#dmGo', root).addEventListener('click', addDanmu);
    $('#dmClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearDanmu));
    $('#dmFs', root).addEventListener('click', () => startFs('danmu'));
    $('#dmText', root).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addDanmu(); }
    });

    /* 三个滑块 + 镜像开关都实时生效：改值即重绘，不等点按钮 */
    [['#tpSpeed', '#tpSpeedV'], ['#tpSize', '#tpSizeV'], ['#tpLine', '#tpLineV']].forEach(pair => {
      $(pair[0], root).addEventListener('input', e => {
        $(pair[1], root).textContent = e.target.value;
        applyStageStyle();
      });
    });
    $('#dmSpeed', root).addEventListener('input', e => { $('#dmSpeedV', root).textContent = e.target.value; });
    $('#tpMirror', root).addEventListener('change', applyStageStyle);
    $('#tpText', root).addEventListener('input', applyStageStyle);

    applyStageStyle();
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    /* ★ 三样都必须收：滚动定时器、全屏态、弹幕移除定时器。
       少清任何一样都会在离开页面后继续跑。 */
    if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
    running = false;
    stopFs();
    danmuTimers.forEach(t => clearTimeout(t));
    danmuTimers = [];
    rootEl = null;
  }

  LB.router.register('teleprompter', { mount, unmount });
})();
