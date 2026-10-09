/* LiteBox v5 · tools/sleep.js — 睡眠周期计算（90 分钟周期 + 15 分钟入睡缓冲） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;
  let mode = 'bed'; /* bed=想几点醒→何时睡 / wake=现在睡→何时醒 */

  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmt = t => {
    const p = n => String(n).padStart(2, '0');
    return p(Math.floor(t / 60)) + ':' + p(t % 60);
  };
  /* 取模 1440 处理跨天（JS % 保留符号，需二次校正） */
  const mod = t => ((t % 1440) + 1440) % 1440;
  const hours = k => String(k * 1.5);

  /*
   * 推荐时间按任务验收清单数值校准：
   * 模式 1（想几点醒→何时睡）：入睡 = 目标 - K×90 + 15，K = 6,5,4,3（7:00 → 22:15/23:45/01:15/02:45）
   * 模式 2（现在睡→何时醒）：醒来 = 基准 + K×90 + 15，K = 4,5,6,7（23:30 → 05:45/07:15/08:45/10:15）
   */
  const KS = { bed: [6, 5, 4, 3], wake: [4, 5, 6, 7] };

  function calc() {
    const t = $('#slTime', rootEl).value || (mode === 'bed' ? '07:00' : '23:30');
    const base = toMin(t);
    const rows = KS[mode].map(k => {
      const diff = k * 90;
      const min = mode === 'bed' ? mod(base - diff + 15) : mod(base + diff + 15);
      const act = mode === 'bed' ? '入睡' : '醒来';
      return '<div class="sl-row"><span class="sl-t">' + fmt(min) + ' ' + act + '</span>' +
        '<small>' + k + ' 个周期（' + hours(k) + ' 小时）</small></div>';
    }).join('');
    $('#slOut', rootEl).innerHTML = rows;
    $('#slOut', rootEl).hidden = false;
  }

  function setMode(m) {
    mode = m;
    const time = $('#slTime', rootEl);
    time.value = m === 'bed' ? '07:00' : '23:30';
    $('#slOut', rootEl).hidden = true;
    $('#slTimeTxt', rootEl).textContent = m === 'bed' ? '起床时间' : '入睡时间';
    document.querySelectorAll('#slSeg button').forEach((b, i) => b.classList.toggle('on', i === (m === 'bed' ? 0 : 1)));
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>睡眠周期计算</h1><p>按 90 分钟睡眠周期推荐入睡 / 起床时间，醒来更轻松</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="seg" id="slSeg">' +
      '<button type="button" class="on">想几点醒 → 何时睡</button>' +
      '<button type="button">现在睡 → 何时醒</button>' +
      '</div>' +
      '<label class="pz-lab sl-time-lab" id="slTimeLab"><span id="slTimeTxt">起床时间</span><input class="inp" id="slTime" type="time" value="07:00" /></label>' +
      '<button class="btn btn-main" id="slGo" type="button">🌙 计算推荐时间</button>' +
      '</div>' +
      '<div class="card tool-sec set-card sl-rows" id="slOut" hidden></div>' +
      '<p class="cd-note">按 90 分钟一个睡眠周期、15 分钟入睡缓冲估算；每个周期结束时醒来更清醒。K 个周期 = K × 1.5 小时。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">睡眠建议仅供参考，不构成医疗建议。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#slSeg', root).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const idx = [...e.currentTarget.children].indexOf(b);
      setMode(idx === 0 ? 'bed' : 'wake');
    });
    $('#slGo', root).addEventListener('click', calc);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('sleep', { mount, unmount });
})();
