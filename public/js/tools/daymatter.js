/* LiteBox v5 · tools/daymatter.js — 纪念日倒数（未来 / 今天 / 过去三态，本机保存，每天零点自动刷新） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_daymatter';

  let rootEl = null;
  let items = []; /* [{ n, d }] */
  let tick = null;
  let dayStr = '';

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  /* 天数差：本地 0 点对 0 点，round 抵消时区偏移 */
  function diffDays(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(d + 'T00:00:00');
    return Math.round((target - today) / 86400000);
  }

  function save() { LB.storage.set(KEY, items); }

  function render() {
    dayStr = todayStr();
    const grid = $('#dmGrid', rootEl);
    if (!items.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(grid, {
        icon: '⌛',
        title: '还没有添加纪念日',
        sub: '生日、考试、纪念日……输入名称和日期开始倒数',
        ctaText: '添加一个日子',
        onCta: () => { const inp = $('#dmName', rootEl); if (inp) inp.focus(); }
      });
      return;
    }
    grid.innerHTML = items.map((it, i) => {
      const diff = diffDays(it.d);
      let txt, cls;
      if (diff > 0) { txt = '还有 ' + diff + ' 天'; cls = 'dm-fut'; }
      else if (diff === 0) { txt = '就是今天'; cls = 'dm-tod'; }
      else { txt = '已 ' + (-diff) + ' 天'; cls = 'dm-past'; }
      return '<div class="dm-card">' +
        '<button class="td-del" data-del="' + i + '" type="button" aria-label="删除">×</button>' +
        '<div class="dm-name">' + esc(it.n) + '</div>' +
        '<div class="dm-date">' + esc(it.d) + '</div>' +
        '<div class="dm-days ' + cls + '">' + txt + '</div>' +
        '</div>';
    }).join('');
  }

  function add() {
    const name = $('#dmName', rootEl).value.trim();
    const date = $('#dmDate', rootEl).value;
    if (!name) { LB.toast('请输入名称', 'info'); return; }
    if (!date) { LB.toast('请选择日期', 'info'); return; }
    items.unshift({ n: name, d: date });
    save();
    $('#dmName', rootEl).value = '';
    render();
    LB.toast('已添加纪念日', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>纪念日倒数</h1><p>生日、考试、纪念日倒数与累计天数，本地保存多个日子</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="dmName" maxlength="24" placeholder="生日、考研、在一起…" />' +
      '<input class="inp" id="dmDate" type="date" />' +
      '<button class="btn btn-main" id="dmAdd" type="button">＋ 添加</button>' +
      '</div>' +
      '</div>' +
      '<div class="dm-grid" id="dmGrid"></div>' +
      '<p class="cd-note">数据保存在本设备浏览器中；每天零点自动刷新天数。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    items = Array.isArray(saved) ? saved.filter(it => it && typeof it.n === 'string' && typeof it.d === 'string') : [];
    render();
    $('#dmAdd', root).addEventListener('click', add);
    $('#dmGrid', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      /* Step 10：删除二次确认（图标小按钮红色态提示） */
      LB.confirm(del, () => {
        items.splice(+del.dataset.del, 1);
        save();
        render();
        LB.toast('已删除', 'ok');
      }, 3000, { iconOnly: true });
    });
    /* 每天零点自动更新：定时检查日期变化（跨天重渲染） */
    dayStr = todayStr();
    tick = setInterval(() => {
      if (todayStr() !== dayStr) render();
    }, 30000);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (tick) { clearInterval(tick); tick = null; }
    rootEl = null;
  }

  LB.router.register('daymatter', { mount, unmount });
})();
