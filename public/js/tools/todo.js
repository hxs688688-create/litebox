/* LiteBox v5 · tools/todo.js — 待办清单（本地保存，勾选完成、清除已完成，事件委托） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_todos';

  let rootEl = null;
  let todos = [];  /* [{ text, done }]，最新添加的在最上 */

  function save() { LB.storage.set(KEY, todos); }

  function render() {
    const list = $('#tdList', rootEl);
    if (!todos.length) {
      /* Step 8：标准空状态（图标 + 标题 + CTA 引导添加） */
      LB.ui.empty(list, {
        icon: '📝',
        title: '还没有待办',
        sub: '想到什么记下来，勾选即完成，数据只存本机',
        ctaText: '添加一条',
        onCta: () => { const inp = $('#tdInp', rootEl); if (inp) inp.focus(); }
      });
    } else {
      list.innerHTML = todos.map((t, i) =>
        '<li class="td-item">' +
        '<input type="checkbox" data-i="' + i + '"' + (t.done ? ' checked' : '') + ' aria-label="标记完成" />' +
        '<span' + (t.done ? ' class="done"' : '') + '>' + esc(t.text) + '</span>' +
        '<button class="td-del" data-del="' + i + '" type="button" aria-label="删除">×</button>' +
        '</li>'
      ).join('');
    }

    const doneN = todos.filter(t => t.done).length;
    const btn = $('#tdClear', rootEl);
    btn.hidden = doneN === 0; /* 有已完成项时才显示 */
    btn.textContent = '🧹 清除已完成（' + doneN + ' 条）· 剩余 ' + (todos.length - doneN) + ' 条';
  }

  function add() {
    const inp = $('#tdInp', rootEl);
    const t = inp.value.trim();
    if (!t) { LB.toast('先输入要做什么', 'info'); return; }
    todos.unshift({ text: t, done: false }); /* 新项置顶 */
    save();
    render();
    inp.value = '';
    inp.focus();
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>待办清单</h1><p>轻量待办事项，勾选完成、一键清理，本地保存</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card td-form">' +
      '<input class="inp" id="tdInp" maxlength="60" placeholder="要做什么？回车快速添加" />' +
      '<button class="btn btn-main js-primary-submit" id="tdAdd" type="button">添加</button>' +
      '</div>' +
      '<ul class="td-list" id="tdList"></ul>' +
      '<button class="btn btn-ghost td-clear" id="tdClear" type="button" hidden></button>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    const saved = LB.storage.get(KEY, []);
    todos = Array.isArray(saved) ? saved.filter(t => t && typeof t.text === 'string') : [];
    render();

    $('#tdAdd', root).addEventListener('click', add);
    $('#tdInp', root).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); add(); }
    });
    /* checkbox 勾选：事件委托 */
    $('#tdList', root).addEventListener('change', e => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      todos[+cb.dataset.i].done = cb.checked;
      save();
      render();
    });
    /* 删除：事件委托 */
    $('#tdList', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      /* Step 10：删除二次确认（图标小按钮红色态提示） */
      LB.confirm(del, () => {
        todos.splice(+del.dataset.del, 1);
        save();
        render();
      }, 3000, { iconOnly: true });
    });
    $('#tdClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => {
      todos = todos.filter(t => !t.done);
      save();
      render();
      LB.toast('已清除已完成', 'ok');
    }));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('todo', { mount, unmount });
})();
