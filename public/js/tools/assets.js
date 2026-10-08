/* LiteBox v5 · tools/assets.js — 物品资产记录（汇总 / 搜索筛选排序 / 状态循环 / 导出导入，本机保存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_assets';
  const CATS = ['数码', '衣物', '书籍', '家具', '美妆', '食品', '运动', '家电', '其他'];
  const ICONS = { 数码: '💻', 衣物: '👕', 书籍: '📚', 家具: '🛋️', 美妆: '💄', 食品: '🍎', 运动: '⚽', 家电: '🔌', 其他: '📦' };
  const STS = ['在用', '闲置', '已处理']; /* 状态循环顺序 */

  let rootEl = null;
  let items = [];
  let q = '';            /* 搜索词 */
  let stFilter = '全部';
  let sortBy = '最新';

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmtMoney = n => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function save() { LB.storage.set(KEY, items); }

  function normalize(o) {
    if (!o || typeof o !== 'object' || typeof o.name !== 'string' || !o.name.trim()) return null;
    const price = typeof o.price === 'number' ? o.price : parseFloat(o.price);
    return {
      id: typeof o.id === 'string' && o.id ? o.id : uid(),
      name: o.name.trim().slice(0, 40),
      price: Number.isFinite(price) ? price : 0,
      cat: CATS.indexOf(o.cat) > -1 ? o.cat : '其他',
      date: typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : todayStr(),
      status: STS.indexOf(o.status) > -1 ? o.status : '在用',
      note: typeof o.note === 'string' ? o.note.slice(0, 50) : ''
    };
  }

  function html() {
    const catOpts = CATS.map(c => '<option>' + c + '</option>').join('');
    const stOpts = ['全部'].concat(STS).map(s => '<option' + (s === '全部' ? ' selected' : '') + '>' + s + '</option>').join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>物品资产</h1><p>记录家中物品价值与使用状态，数据仅保存在本机</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="as-sums">' +
      '<div class="res-card"><div class="rc-lab">资产总值</div><div class="rc-val" id="asTotal">—</div></div>' +
      '<div class="res-card"><div class="rc-lab">物品总数</div><div class="rc-val" id="asCnt">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">在用</div><div class="rc-val" id="asUse">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">闲置</div><div class="rc-val" id="asIdle">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">已处理</div><div class="rc-val" id="asDone">0</div></div>' +
      '</div>' +
      '<div class="card tool-sec">' +
      '<div class="as-bar">' +
      '<input class="inp" id="asQ" maxlength="30" placeholder="搜索名称 / 分类 / 备注" />' +
      '<select class="inp" id="asStFilter" aria-label="状态筛选">' + stOpts + '</select>' +
      '<select class="inp" id="asSort" aria-label="排序方式">' +
      '<option selected>最新</option><option>价值最高</option><option>名称</option>' +
      '</select>' +
      '<button class="btn btn-ghost btn-sm" id="asExport" type="button">⬇️ 导出</button>' +
      '<button class="btn btn-ghost btn-sm" id="asImport" type="button">⬆️ 导入</button>' +
      '<input type="file" id="asFile" accept="application/json,.json" hidden />' +
      '<button class="btn btn-main btn-sm" id="asAddBtn" type="button">＋ 添加资产</button>' +
      '</div>' +
      '<div class="as-form" id="asForm" hidden>' +
      '<input class="inp" id="asName" maxlength="40" placeholder="物品名称" />' +
      '<input class="inp" id="asPrice" type="number" min="0" step="0.01" placeholder="购入价" />' +
      '<select class="inp" id="asCat" aria-label="分类">' + catOpts + '</select>' +
      '<input class="inp" id="asDate" type="date" aria-label="购入日期" />' +
      '<input class="inp" id="asNote" maxlength="50" placeholder="备注（可选）" />' +
      '<button class="btn btn-main" id="asSave" type="button">保存</button>' +
      '</div>' +
      '<div class="as-rows" id="asRows"></div>' +
      '</div>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">记录数据仅本机保存。</span></div>' +
      '</div>'
    );
  }

  function visibleList() {
    const kw = q.toLowerCase();
    let list = items.filter(a =>
      (!kw || a.name.toLowerCase().indexOf(kw) > -1 || a.cat.toLowerCase().indexOf(kw) > -1 || (a.note || '').toLowerCase().indexOf(kw) > -1) &&
      (stFilter === '全部' || a.status === stFilter)
    );
    if (sortBy === '最新') list = list.slice().sort((a, b) => (a.id < b.id ? 1 : -1));
    else if (sortBy === '价值最高') list = list.slice().sort((a, b) => b.price - a.price);
    else list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    return list;
  }

  function render() {
    /* 5 张汇总卡（总值 = 在用 + 闲置，不含已处理） */
    const sum = s => items.filter(a => a.status === s).reduce((t, a) => t + a.price, 0);
    $('#asTotal', rootEl).textContent = fmtMoney(sum('在用') + sum('闲置'));
    $('#asCnt', rootEl).textContent = String(items.length);
    $('#asUse', rootEl).textContent = String(items.filter(a => a.status === '在用').length);
    $('#asIdle', rootEl).textContent = String(items.filter(a => a.status === '闲置').length);
    $('#asDone', rootEl).textContent = String(items.filter(a => a.status === '已处理').length);

    const list = visibleList();
    const rows = $('#asRows', rootEl);
    if (!list.length) {
      /* Step 8：标准空状态（区分"一条都没有"与"筛选无结果"） */
      if (items.length) {
        LB.ui.empty(rows, {
          icon: '🏷️',
          title: '没有符合条件的结果',
          sub: '换个分类或状态筛选试试'
        });
      } else {
        LB.ui.empty(rows, {
          icon: '🏷️',
          title: '暂无资产记录',
          sub: '物品台账与价值统计，从第一件开始',
          ctaText: '添加资产',
          onCta: () => { const inp = $('#asName', rootEl); if (inp) inp.focus(); }
        });
      }
      return;
    }
    rows.innerHTML = list.map(a =>
      '<div class="as-row">' +
      '<span class="as-ic" aria-hidden="true">' + (ICONS[a.cat] || ICONS['其他']) + '</span>' +
      '<div class="as-info"><b>' + esc(a.name) + '</b>' +
      '<small>' + esc(a.cat) + ' · ' + esc(a.date) + (a.note ? ' · ' + esc(a.note) : '') + '</small></div>' +
      '<div class="as-val">' + fmtMoney(a.price) + '</div>' +
      '<span class="as-st s' + STS.indexOf(a.status) + '">' + a.status + '</span>' +
      '<div class="as-ops">' +
      '<button data-cycle="' + a.id + '" type="button" title="切换状态" aria-label="切换状态">🔄</button>' +
      '<button data-edit="' + a.id + '" type="button" title="编辑" aria-label="编辑">✏️</button>' +
      '<button data-del="' + a.id + '" type="button" title="删除" aria-label="删除">✕</button>' +
      '</div>' +
      '</div>'
    ).join('');
  }

  function add() {
    const name = $('#asName', rootEl).value.trim();
    if (!name) { LB.toast('请输入物品名称', 'info'); return; }
    const price = parseFloat($('#asPrice', rootEl).value);
    items.push({
      id: uid(),
      name: name.slice(0, 40),
      price: Number.isFinite(price) ? price : 0,
      cat: $('#asCat', rootEl).value,
      date: $('#asDate', rootEl).value || todayStr(),
      status: '在用',
      note: $('#asNote', rootEl).value.trim().slice(0, 50)
    });
    save();
    render();
    $('#asName', rootEl).value = '';
    $('#asPrice', rootEl).value = '';
    $('#asNote', rootEl).value = '';
    LB.toast('已添加「' + name + '」', 'ok');
  }

  /* 编辑：一次 prompt，格式「名称 | 价格」 */
  function edit(id) {
    const a = items.find(x => x.id === id);
    if (!a) return;
    const v = prompt('修改名称与价格（用 | 分隔）', a.name + ' | ' + a.price);
    if (v === null) return;
    const parts = v.split('|');
    const name = (parts[0] || '').trim();
    if (name) a.name = name.slice(0, 40);
    if (parts[1] !== undefined && parts[1].trim() !== '' && Number.isFinite(parseFloat(parts[1]))) a.price = parseFloat(parts[1]);
    save();
    render();
    LB.toast('已修改「' + a.name + '」', 'ok');
  }

  function cycle(id) {
    const a = items.find(x => x.id === id);
    if (!a) return;
    a.status = STS[(STS.indexOf(a.status) + 1) % STS.length];
    save();
    render();
    LB.toast('「' + a.name + '」→ ' + a.status, 'ok');
  }

  function exportJSON() {
    const d = new Date();
    const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'litebox-assets-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
    LB.toast('已导出 ' + items.length + ' 条资产', 'ok');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('bad');
        const next = arr.map(normalize).filter(Boolean);
        items = next;
        save();
        render();
        LB.toast('已导入 ' + items.length + ' 条资产', 'ok');
      } catch (_) {
        LB.toast('导入失败：文件不是有效的资产 JSON', 'err');
      }
    };
    reader.onerror = () => LB.toast('导入失败：文件读取错误', 'err');
    reader.readAsText(file);
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    items = Array.isArray(saved) ? saved.map(normalize).filter(Boolean) : [];
    $('#asDate', root).value = todayStr();
    render();

    $('#asQ', root).addEventListener('input', e => { q = e.target.value.trim(); render(); });
    $('#asStFilter', root).addEventListener('change', e => { stFilter = e.target.value; render(); });
    $('#asSort', root).addEventListener('change', e => { sortBy = e.target.value; render(); });
    $('#asAddBtn', root).addEventListener('click', () => {
      const f = $('#asForm', root);
      f.hidden = !f.hidden;
      if (!f.hidden) $('#asName', root).focus();
    });
    $('#asSave', root).addEventListener('click', add);
    $('#asExport', root).addEventListener('click', exportJSON);
    $('#asImport', root).addEventListener('click', () => $('#asFile', root).click());
    $('#asFile', root).addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });
    $('#asRows', root).addEventListener('click', e => {
      const c = e.target.closest('[data-cycle]');
      if (c) { cycle(c.dataset.cycle); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { edit(ed.dataset.edit); return; }
      const del = e.target.closest('[data-del]');
      if (del) {
        /* Step 10：删除二次确认（图标小按钮红色态提示） */
        LB.confirm(del, () => {
          const a = items.find(x => x.id === del.dataset.del);
          items = items.filter(x => x.id !== del.dataset.del);
          save();
          render();
          LB.toast('已删除「' + (a ? a.name : '') + '」', 'ok');
        }, 3000, { iconOnly: true });
      }
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('assets', { mount, unmount });
})();
