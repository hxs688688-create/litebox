/* LiteBox v5 · tools/notes.js — 便签本（6 色便签纸 + 本地保存，Ctrl/⌘+Enter 快速添加） */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const KEY = 'litebox_notes';
  /* 颜色以索引存储（0-5），实际色值只在 tokens.css（--note-c0 ~ --note-c5） */
  const N = 6;

  let rootEl = null;
  let notes = [];  /* [{ t, c, time }]，最新的在前 */
  let sel = 0;     /* 当前选中色索引 */

  const pad = n => String(n).padStart(2, '0');

  /* 时间格式：M月D日 HH:MM */
  function nowText() {
    const d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function save() { LB.storage.set(KEY, notes); }

  function render() {
    const grid = $('#ntGrid', rootEl);
    if (!notes.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(grid, {
        icon: '🗒️',
        title: '还没有便签',
        sub: '随手记一条，自动保存在本机',
        ctaText: '写一条便签',
        onCta: () => { const ta = $('#ntText', rootEl); if (ta) ta.focus(); }
      });
      return;
    }
    grid.innerHTML = notes.map((n, i) =>
      '<article class="note-card nct' + (+n.c || 0) + '">' +
      '<div class="nt-body">' + esc(n.t) + '</div>' +
      '<footer class="nt-foot">' +
      '<time>' + esc(n.time) + '</time>' +
      '<button class="nt-act" data-copy="' + i + '" type="button" aria-label="复制便签"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>' +
      '<button class="nt-act" data-del="' + i + '" type="button" aria-label="删除便签">×</button>' +
      '</footer>' +
      '</article>'
    ).join('');
  }

  function add() {
    const ta = $('#ntText', rootEl);
    const t = ta.value.trim();
    if (!t) { LB.toast('先写点什么吧', 'info'); return; }
    notes.unshift({ t, c: sel, time: nowText() });
    save();
    render();
    ta.value = '';
    LB.toast('已添加便签', 'ok');
  }

  function html() {
    const dots = Array.from({ length: N }, (_, i) =>
      '<button class="nt-dot nct' + i + (i === 0 ? ' on' : '') + '" data-c="' + i + '" type="button" aria-label="便签颜色 ' + (i + 1) + '"></button>'
    ).join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>便签本</h1><p>彩色便签随手记，自动本地保存，支持一键复制与删除</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card nt-editor">' +
      '<textarea class="inp nt-text" id="ntText" rows="3" placeholder="记点什么…（Ctrl/⌘+Enter 快速添加）"></textarea>' +
      '<div class="nt-row">' +
      '<div class="nt-palette" id="ntPal">' + dots + '</div>' +
      '<button class="btn btn-main btn-sm" id="ntAdd" type="button">＋ 添加</button>' +
      '</div>' +
      '</div>' +
      '<div class="nt-grid" id="ntGrid"></div>' +
      '<p class="cd-note">便签保存在本设备浏览器中，换行会原样保留；点圆点换颜色，再添加的便签使用新颜色。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    const saved = LB.storage.get(KEY, []);
    notes = Array.isArray(saved) ? saved.filter(n => n && typeof n.t === 'string') : [];
    sel = 0;
    render();

    $('#ntAdd', root).addEventListener('click', add);
    $('#ntText', root).addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); add(); }
    });
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { LB.hash.go('home'); return; }
      const dot = e.target.closest('.nt-dot');
      if (dot) {
        sel = +dot.dataset.c;
        $$('.nt-dot', rootEl).forEach(d => d.classList.toggle('on', d === dot));
        return;
      }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        LB.copyWithToast(notes[+cp.dataset.copy].t);
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        /* Step 10：删除二次确认（24px 图标小按钮不换文字，红色态提示，再点执行） */
        LB.confirm(del, () => {
          notes.splice(+del.dataset.del, 1);
          save();
          render();
          LB.toast('已删除', 'ok');
        }, 3000, { iconOnly: true });
      }
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('notes', { mount, unmount });
})();
