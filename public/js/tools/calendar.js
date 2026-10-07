/* LiteBox v5 · tools/calendar.js — 万年历（公农历对照 / 节气 / 节日 / 干支纪日，农历数据按需加载） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  const pad = n => String(n).padStart(2, '0');
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  let rootEl = null;
  let vy = 0, vm = 0;   /* 当前查看的公历年 / 月 */
  let sel = null;        /* 选中日期 { y, m, d } */
  let today = null;      /* 进入时的今天 */

  const D = () => LB.dict.lunar; /* ready() 之后才允许触达 */

  function isToday(y, m, d) {
    return today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d;
  }

  /* 干支日（照任务公式：1900-01-31 起算，i=(days+40)%60） */
  function dayGZ(y, m, d) {
    const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
    const i = (days + 40) % 60;
    return D().gan[i % 10] + D().zhi[i % 12];
  }

  /* 某天的节日（公历 + 农历，可同日并存） */
  function festOf(y, m, d, lu) {
    const ff = D().fixedFest[pad(m) + '-' + pad(d)];
    const lf = lu.isLeap ? '' : D().lunarFest[lu.month + '-' + lu.day];
    return [ff, lf].filter(Boolean).join(' · ');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>万年历</h1><p>公农历对照 · 节气节日 · 干支纪日</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec">' +
      '<div class="cl-nav">' +
      '<button class="cl-nav-btn" id="clPrev" type="button" aria-label="上个月">‹</button>' +
      '<div class="cl-nav-mid"><b id="clTitle">—</b><small id="clLunarTitle"></small></div>' +
      '<button class="cl-nav-btn" id="clNext" type="button" aria-label="下个月">›</button>' +
      '</div>' +
      '<div class="cl-week">' + WEEK.map(w => '<span>' + w + '</span>').join('') + '</div>' +
      '<div class="cl-grid" id="clGrid"></div>' +
      '<div class="cl-today-wrap"><button class="btn btn-ghost btn-sm" id="clToday" type="button">📍 回到今天</button></div>' +
      '</div>' +
      '<div class="card tool-sec cl-detail" id="clDetail" hidden></div>' +
      '</div>'
    );
  }

  function renderDetail() {
    if (!sel) return;
    const lu = LB.lunar.solarToLunar(new Date(sel.y, sel.m - 1, sel.d));
    const term = LB.lunar.solarTerm(sel.y, sel.m, sel.d);
    const fest = festOf(sel.y, sel.m, sel.d, lu);
    const wk = '星期' + WEEK[new Date(sel.y, sel.m - 1, sel.d).getDay()];
    const row = (k, v) => '<div class="cl-row"><span>' + k + '</span><b>' + v + '</b></div>';
    $('#clDetail', rootEl).innerHTML =
      '<div class="cl-big">' + sel.y + ' 年 ' + sel.m + ' 月 ' + sel.d + ' 日 · ' + wk + '</div>' +
      row('农历', (lu.isLeap ? '闰' : '') + lu.gz + '年 ' + LB.lunar.monthCn(lu) + LB.lunar.dayCn(lu)) +
      row('生肖', lu.animal) +
      row('节气', term || '—') +
      row('节日', fest || '—') +
      row('干支日', dayGZ(sel.y, sel.m, sel.d));
    $('#clDetail', rootEl).hidden = false;
  }

  function render() {
    if (!LB.dict.lunar) return; /* 数据未就绪时由 ready 回调再触发 */
    const mb = LB.lunar.buildMonth(vy, vm);
    $('#clTitle', rootEl).textContent = vy + '年' + vm + '月';
    $('#clLunarTitle', rootEl).textContent = '农历 ' + mb.firstLunar.gz + '年 ' + LB.lunar.monthCn(mb.firstLunar);

    /* 格内文字优先级：节气 > 公历节日 > 农历节日 > 农历初一（月份名）> 农历日 */
    $('#clGrid', rootEl).innerHTML =
      Array(mb.firstWeekday).fill('<div class="cl-pad"></div>').join('') +
      mb.days.map(o => {
        const lu = o.lunar;
        let sub = o.term, cls = 'cl-term';
        if (!sub) {
          const ff = D().fixedFest[pad(vm) + '-' + pad(o.d)];
          if (ff) { sub = ff; cls = 'cl-fest'; }
        }
        if (!sub) {
          const lf = lu.isLeap ? '' : D().lunarFest[lu.month + '-' + lu.day];
          if (lf) { sub = lf; cls = 'cl-fest'; }
        }
        if (!sub && lu.day === 1) { sub = LB.lunar.monthCn(lu); cls = 'cl-lm'; }
        if (!sub) { sub = LB.lunar.dayCn(lu); cls = 'cl-ld'; }
        const now = isToday(vy, vm, o.d) ? ' now' : '';
        const s = sel && sel.y === vy && sel.m === vm && sel.d === o.d ? ' sel' : '';
        return '<button class="cl-cell' + now + s + '" type="button" data-d="' + o.d + '" aria-label="' + vy + '年' + vm + '月' + o.d + '日">' +
          '<b class="cl-day">' + o.d + '</b><small class="cl-sub ' + cls + '">' + sub + '</small></button>';
      }).join('');
    renderDetail();
  }

  function go(dy, dm) {
    vm += dm;
    vy += dy;
    if (vm < 1) { vm = 12; vy--; }
    if (vm > 12) { vm = 1; vy++; }
    render();
  }

  function mount(root) {
    rootEl = root;
    today = new Date();
    vy = today.getFullYear();
    vm = today.getMonth() + 1;
    sel = { y: vy, m: vm, d: today.getDate() };
    root.innerHTML = html();

    $('#clPrev', root).addEventListener('click', () => go(0, -1));
    $('#clNext', root).addEventListener('click', () => go(0, 1));
    $('#clGrid', root).addEventListener('click', e => {
      const c = e.target.closest('[data-d]');
      if (!c) return;
      sel = { y: vy, m: vm, d: +c.dataset.d };
      render();
    });
    $('#clToday', root).addEventListener('click', () => {
      today = new Date();
      vy = today.getFullYear();
      vm = today.getMonth() + 1;
      sel = { y: vy, m: vm, d: today.getDate() };
      render();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* 农历数据按需加载完成后渲染 */
    LB.lunar.ready().then(render).catch(() => LB.toast('农历数据加载失败', 'err'));
  }

  function unmount() { rootEl = null; }

  LB.router.register('calendar', { mount, unmount });
})();
