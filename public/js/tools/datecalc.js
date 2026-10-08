/* LiteBox v5 · tools/datecalc.js — 日期计算器（两日期间隔 / 日期推算，UTC 中午防夏令时） */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const DAY = 86400000;
  let rootEl = null;

  const noon = dateStr => new Date(dateStr + 'T12:00:00'); /* UTC 中午时间，避免夏令时干扰 */
  const fmtInput = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  /* 2026年10月2日 · 周五（间隔副文字） */
  const fmtShort = d => d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WEEK[d.getDay()];
  /* 2027 年 1 月 1 日 · 周五（推算大号） */
  const fmtBig = d => d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 周' + WEEK[d.getDay()];

  function calcGap() {
    const a = $('#dcA', rootEl).value, b = $('#dcB', rootEl).value;
    if (!a || !b) { $('#dcGapBig', rootEl).textContent = '—'; $('#dcGapSub', rootEl).textContent = '请选择两个日期'; return; }
    const days = Math.round((noon(b) - noon(a)) / DAY);
    $('#dcGapBig', rootEl).textContent = days + ' 天';
    const weeks = (days / 7).toFixed(1);
    $('#dcGapSub', rootEl).textContent =
      fmtShort(noon(a)) + ' → ' + fmtShort(noon(b)) + '，约 ' + weeks + ' 周';
  }

  function calcOffset() {
    const base = $('#dcBase', rootEl).value;
    const off = parseInt($('#dcOff', rootEl).value, 10);
    if (!base || isNaN(off)) { $('#dcOffBig', rootEl).textContent = '—'; $('#dcOffSub', rootEl).textContent = '请选择基准日期并填写偏移天数'; return; }
    const d = new Date(noon(base).getTime() + off * DAY);
    $('#dcOffBig', rootEl).textContent = fmtBig(d);
    $('#dcOffSub', rootEl).textContent = '基准日期 ' + (off >= 0 ? '+ ' : '- ') + Math.abs(off) + ' 天';
  }

  function switchMode(v) {
    $$('#dcSeg .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#dcGapPane', rootEl).hidden = v !== 'gap';
    $('#dcOffPane', rootEl).hidden = v !== 'offset';
  }

  function html() {
    const today = new Date();
    const plus90 = new Date(today.getTime() + 90 * DAY);
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>日期计算器</h1><p>两个日期间隔天数、日期推算与星期查询</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" id="dcSeg">' +
      '<button class="seg-btn on" data-v="gap" type="button">两个日期间隔</button>' +
      '<button class="seg-btn" data-v="offset" type="button">日期推算</button>' +
      '</div>' +
      '<div class="tool-sec" id="dcGapPane">' +
      '<div class="dc-row">' +
      '<label class="tool-lab">起始日期<input class="inp" id="dcA" type="date" value="' + fmtInput(today) + '" /></label>' +
      '<label class="tool-lab">结束日期<input class="inp" id="dcB" type="date" value="' + fmtInput(plus90) + '" /></label>' +
      '</div>' +
      '<div class="dc-result"><span class="dc-big" id="dcGapBig">—</span><span class="dc-sub" id="dcGapSub"></span></div>' +
      '</div>' +
      '<div class="tool-sec" id="dcOffPane" hidden>' +
      '<div class="dc-row">' +
      '<label class="tool-lab">基准日期<input class="inp" id="dcBase" type="date" value="' + fmtInput(today) + '" /></label>' +
      '<label class="tool-lab">偏移天数（可为负）<input class="inp" id="dcOff" type="number" step="1" value="100" /></label>' +
      '</div>' +
      '<div class="dc-result"><span class="dc-big" id="dcOffBig">—</span><span class="dc-sub" id="dcOffSub"></span></div>' +
      '</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    calcGap();
    calcOffset();
    $('#dcSeg', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) switchMode(b.dataset.v);
    });
    ['dcA', 'dcB'].forEach(id => $('#' + id, root).addEventListener('input', calcGap));
    ['dcBase', 'dcOff'].forEach(id => $('#' + id, root).addEventListener('input', calcOffset));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('datecalc', { mount, unmount });
})();
