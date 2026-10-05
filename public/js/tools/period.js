/* LiteBox v5 · tools/period.js — 经期提醒（周期记录与日期估算，非医疗工具，本机保存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_period';
  const HIST_KEY = 'litebox_period_history';
  const REMIND_KEY = 'litebox_period_reminded_at';

  let rootEl = null;
  let hist = []; /* [{ id, start, cycle, days }] */

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  /* 用当日中午 12 点比较，避免时区 / 夏令时误差 */
  const noon = s => new Date(s + 'T12:00:00');
  const addDays = (s, n) => {
    const d = noon(s);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  function saveHist() { LB.storage.set(HIST_KEY, hist); }

  function render() {
    const start = $('#pdStart', rootEl).value;
    const out = $('#pdResult', rootEl);
    if (!start) { out.hidden = true; return; }
    let cycle = parseInt($('#pdCycle', rootEl).value, 10);
    let days = parseInt($('#pdDays', rootEl).value, 10);
    if (!(cycle >= 15 && cycle <= 60)) cycle = 28;
    if (!(days >= 1 && days <= 14)) days = 5;

    const elapsed = Math.max(0, Math.floor((noon(todayStr()) - noon(start)) / 86400000));
    const next = addDays(start, cycle);
    const toNext = Math.round((noon(next) - noon(todayStr())) / 86400000);

    /* 周期进度圆环（conic-gradient，DOM style API） */
    const pct = Math.max(0, Math.min(100, elapsed / cycle * 100));
    const ring = $('#pdRing', rootEl);
    ring.style.background = 'conic-gradient(var(--brand1) 0 ' + pct * 3.6 + 'deg, var(--brand2) ' + pct * 3.6 + 'deg ' + (pct + 5) * 3.6 + 'deg, var(--card2) ' + (pct + 5) * 3.6 + 'deg)';
    $('#pdDaysTxt', rootEl).textContent = elapsed + ' / ' + cycle + ' 天';
    $('#pdNextDate', rootEl).textContent = next;
    $('#pdNextGap', rootEl).textContent = toNext >= 0 ? '距下次 ' + toNext + ' 天' : '已逾期 ' + (-toNext) + ' 天';
    $('#pdElapsed', rootEl).textContent = elapsed + ' 天前开始 · 经期约 ' + days + ' 天';

    /* 未来 3 个周期 */
    $('#pdNext3', rootEl).innerHTML = [1, 2, 3].map(k => {
      const d = addDays(start, cycle * k);
      return '<div class="res-card"><div class="rc-lab">第 ' + k + ' 次估算</div><div class="rc-val">' + d + '</div></div>';
    }).join('');

    /* 历史记录列表 */
    const pdHist = $('#pdHist', rootEl);
    if (!hist.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(pdHist, {
        icon: '🌸',
        title: '暂无历史记录',
        sub: '保存后可在这里回看每次周期',
        ctaText: '保存本次记录',
        onCta: () => save()
      });
    } else {
      pdHist.innerHTML = hist.map(h =>
        '<div class="lg-row"><div class="lg-info"><b>' + esc(h.start) + '</b>' +
        '<small>周期 ' + h.cycle + ' 天 · 经期 ' + h.days + ' 天</small></div>' +
        '<button class="td-del" data-del="' + h.id + '" type="button" aria-label="删除">×</button>' +
        '</div>'
      ).join('');
    }

    out.hidden = false;
  }

  function save() {
    const start = $('#pdStart', rootEl).value;
    if (!start) { LB.toast('请选择最近一次开始日期', 'info'); return; }
    let cycle = parseInt($('#pdCycle', rootEl).value, 10);
    let days = parseInt($('#pdDays', rootEl).value, 10);
    if (!(cycle >= 15 && cycle <= 60)) { LB.toast('周期长度需在 15-60 天之间', 'info'); return; }
    if (!(days >= 1 && days <= 14)) { LB.toast('经期长度需在 1-14 天之间', 'info'); return; }
    const setting = {
      start,
      cycle,
      days,
      note: $('#pdNote', rootEl).value.trim(),
      remind: $('#pdRemind', rootEl).checked
    };
    LB.storage.set(KEY, setting);
    hist.unshift({ id: 'p' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36), start, cycle, days });
    hist = hist.slice(0, 24);
    saveHist();
    render();
    LB.toast('已保存并生成预测', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>经期提醒</h1><p>周期记录与下一次日期估算，数据仅保存在本机</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      /* Step 6A：数据来源诚信标注 —— 明确「只存本机、绝不上传」 */
      '<div class="src-note">数据仅保存在本机浏览器，绝不上传服务器。</div>' +
      '<div class="card tool-sec set-card">' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">最近一次开始日期<input class="inp" id="pdStart" type="date" /></label>' +
      '<label class="pz-lab">周期长度（天）<input class="inp" id="pdCycle" type="number" min="15" max="60" value="28" /></label>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">经期长度（天）<input class="inp" id="pdDays" type="number" min="1" max="14" value="5" /></label>' +
      '<label class="pz-lab">备注<input class="inp" id="pdNote" maxlength="20" placeholder="选填" /></label>' +
      '</div>' +
      '<label class="pd-remind"><input type="checkbox" id="pdRemind" /> 距离估算日期 3 天内时提醒我</label>' +
      '<button class="btn btn-main" id="pdGo" type="button">🌸 保存并生成预测</button>' +
      '</div>' +
      '<div id="pdResult" hidden>' +
      '<div class="card tool-sec set-card pd-top">' +
      '<div class="pd-ring-wrap">' +
      '<div class="pd-ring" id="pdRing"><div class="pd-hole"><b id="pdDaysTxt">0 / 28 天</b></div></div>' +
      '</div>' +
      '<div class="pd-next">' +
      '<span class="tool-lab">下一次估算</span>' +
      '<div class="pd-next-date" id="pdNextDate">—</div>' +
      '<div class="pd-next-gap" id="pdNextGap">—</div>' +
      '<div class="pd-elapsed" id="pdElapsed">—</div>' +
      '</div>' +
      '</div>' +
      '<div class="res-grid" id="pdNext3"></div>' +
      '</div>' +
      '<div class="lg-rows pd-hist" id="pdHist"></div>' +
      '<p class="cd-note">仅用于日常日期记录与估算，不是医疗工具。周期存在自然波动；如出现明显异常或持续不适，应咨询专业医护人员。数据保存在本设备浏览器中，历史最多保留 24 条。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">周期预测仅供参考，不构成医疗建议。如身体持续不适，请咨询医生。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, null);
    hist = (() => {
      const h = LB.storage.get(HIST_KEY, []);
      return Array.isArray(h) ? h.filter(x => x && typeof x.start === 'string') : [];
    })();
    if (saved && typeof saved.start === 'string') {
      $('#pdStart', root).value = saved.start;
      $('#pdCycle', root).value = saved.cycle;
      $('#pdDays', root).value = saved.days;
      $('#pdNote', root).value = saved.note || '';
      $('#pdRemind', root).checked = !!saved.remind;
      render();
    } else {
      $('#pdStart', root).value = todayStr();
    }
    $('#pdGo', root).addEventListener('click', save);
    $('#pdHist', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      hist = hist.filter(h => h.id !== del.dataset.del);
      saveHist();
      render();
      LB.toast('已删除历史', 'ok');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* 首次进入提醒：距下次 ≤3 且 ≥0，同一天只提醒一次 */
    if (saved && saved.remind) {
      const next = addDays(saved.start, saved.cycle);
      const gap = Math.round((noon(next) - noon(todayStr())) / 86400000);
      if (gap >= 0 && gap <= 3) {
        const last = LB.storage.get(REMIND_KEY, 0);
        const lastDay = last ? new Date(last) : null;
        const sameDay = lastDay && lastDay.getFullYear() === new Date().getFullYear() && lastDay.getMonth() === new Date().getMonth() && lastDay.getDate() === new Date().getDate();
        if (!sameDay) {
          LB.storage.set(REMIND_KEY, Date.now());
          setTimeout(() => LB.toast('经期提醒：距离估算日期还有 ' + gap + ' 天', 'info'), 300);
        }
      }
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('period', { mount, unmount });
})();
