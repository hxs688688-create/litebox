/* LiteBox v5 · tools/teleprompter.js — 提词器（匀速滚动演讲稿）
 * Step 20 · A2：手持弹幕拆分为独立工具 danmu，本文件只保留提词功能。
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
 */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  let scrollTimer = null;
  let running = false;
  let fsEl = null;           /* 全屏 overlay */
  let onKey = null;
  let onClick = null;
  let onFsChange = null;

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

  function startFs() {
    if (fsEl) return;
    if (!$('#tpText', rootEl).value.trim()) { LB.toast('先输入要提的文本', 'info'); return; }
    fsEl = stage();
    if (!fsEl) return;
    fsEl.classList.add('tp-fs');
    document.body.classList.add('tp-fs-lock');
    enterFullscreen(fsEl);
    /* 任务书：「退出：点击屏幕或按 ESC」。
       这里监听元素自身而不是 document —— 提词滚动时误触不应立刻退出。 */
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

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>提词器</h1><p>演讲直播录制视频的匀速滚动提词；手持弹幕已拆分为独立工具</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
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
      '<p class="cd-note">全屏后点击屏幕或按 Esc 退出；想要手机灯牌（手持弹幕）请使用「手持弹幕」工具。</p>' +
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
    running = false; scrollTimer = null; fsEl = null;
    onKey = null; onClick = null; onFsChange = null;

    $('#tpGo', root).addEventListener('click', () => (running ? stop() : start()));
    $('#tpTop', root).addEventListener('click', toTop);
    $('#tpFs', root).addEventListener('click', startFs);

    /* 三个滑块 + 镜像开关都实时生效：改值即重绘，不等点按钮 */
    [['#tpSpeed', '#tpSpeedV'], ['#tpSize', '#tpSizeV'], ['#tpLine', '#tpLineV']].forEach(pair => {
      $(pair[0], root).addEventListener('input', e => {
        $(pair[1], root).textContent = e.target.value;
        applyStageStyle();
      });
    });
    $('#tpMirror', root).addEventListener('change', applyStageStyle);
    $('#tpText', root).addEventListener('input', applyStageStyle);

    applyStageStyle();
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    /* ★ 两样都必须收：滚动定时器、全屏态。
       少清任何一样都会在离开页面后继续跑。 */
    if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
    running = false;
    stopFs();
    rootEl = null;
  }

  LB.router.register('teleprompter', { mount, unmount });
})();
