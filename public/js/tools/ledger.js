/* LiteBox v5 · tools/ledger.js — 记账本（收入/支出分类记录，月度汇总，本机保存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_ledger';
  const CATS = {
    expense: ['餐饮', '交通', '购物', '娱乐', '学习', '住房', '其他'],
    income: ['工资', '兼职', '理财', '其他']
  };

  let rootEl = null;
  let records = []; /* [{ id, ts, amt, type, cat, note, date }] */

  const pad = n => String(n).padStart(2, '0');
  const fmtMoney = n => '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const thisMonth = () => todayStr().slice(0, 7);

  function save() { LB.storage.set(KEY, records); }

  function renderSummary() {
    const ym = thisMonth();
    let exp = 0, inc = 0;
    records.forEach(r => {
      if (typeof r.date === 'string' && r.date.startsWith(ym)) {
        if (r.type === 'income') inc += r.amt;
        else exp += r.amt;
      }
    });
    $('#lgExp', rootEl).textContent = fmtMoney(exp);
    $('#lgInc', rootEl).textContent = fmtMoney(inc);
    $('#lgCnt', rootEl).textContent = String(records.length);
  }

  function renderList() {
    const shown = records.slice(0, 100); /* 最多显示 100 条防卡顿 */
    const list = $('#lgList', rootEl);
    if (!shown.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(list, {
        icon: '📒',
        title: '还没有记录',
        sub: '选类型、填金额，记下第一笔收支',
        ctaText: '记一笔',
        onCta: () => { const inp = $('#lgAmt', rootEl); if (inp) inp.focus(); }
      });
      return;
    }
    list.innerHTML = shown.map(r => {
      const neg = r.type !== 'income';
      return '<div class="lg-row">' +
        '<div class="lg-info"><b>' + esc(r.note || r.cat) + '</b><small>' + esc(r.date) + ' · ' + esc(r.cat) + '</small></div>' +
        '<span class="lg-amt ' + (neg ? 'neg' : 'pos') + '">' + (neg ? '-' : '+') + fmtMoney(r.amt) + '</span>' +
        '<button class="td-del" data-del="' + r.id + '" type="button" aria-label="删除">×</button>' +
        '</div>';
    }).join('');
  }

  function syncCats() {
    const type = $('#lgType', rootEl).value;
    $('#lgCat', rootEl).innerHTML = CATS[type].map(c => '<option>' + c + '</option>').join('');
  }

  function add() {
    const amt = parseFloat($('#lgAmt', rootEl).value);
    if (!(amt > 0)) { LB.toast('请输入有效的金额', 'info'); return; }
    const type = $('#lgType', rootEl).value;
    records.unshift({
      id: 'r' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36),
      ts: Date.now(),
      amt: +amt.toFixed(2),
      type,
      cat: $('#lgCat', rootEl).value,
      note: $('#lgNote', rootEl).value.trim(),
      date: $('#lgDate', rootEl).value || todayStr()
    });
    save();
    $('#lgAmt', rootEl).value = '';
    $('#lgNote', rootEl).value = '';
    renderSummary();
    renderList();
    LB.toast('已记一笔', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>记账本</h1><p>收入 / 支出 / 分类 / 月度统计，数据只保存在本机</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">本月支出</div><div class="rc-val" id="lgExp">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">本月收入</div><div class="rc-val" id="lgInc">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">记录笔数</div><div class="rc-val" id="lgCnt">0</div></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<label class="pz-lab">金额（元）<input class="inp" id="lgAmt" type="number" min="0" step="0.01" placeholder="0.00" /></label>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">类型<select class="inp" id="lgType"><option value="expense">支出</option><option value="income">收入</option></select></label>' +
      '<label class="pz-lab">分类<select class="inp" id="lgCat"></select></label>' +
      '</div>' +
      '<label class="pz-lab">备注<input class="inp" id="lgNote" maxlength="30" placeholder="选填（如：午餐）" /></label>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">日期<input class="inp" id="lgDate" type="date" /></label>' +
      '<button class="btn btn-main" id="lgAdd" type="button">＋ 记一笔</button>' +
      '</div>' +
      '</div>' +
      '<div class="lg-rows" id="lgList"></div>' +
      '<p class="cd-note">仅统计本月（' + thisMonth() + '）收支；记录保存在本设备浏览器中，最多展示最近 100 条。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">记录数据仅本机保存。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    records = Array.isArray(saved) ? saved.filter(r => r && typeof r.amt === 'number') : [];
    $('#lgDate', root).value = todayStr();
    syncCats();
    renderSummary();
    renderList();

    $('#lgType', root).addEventListener('change', syncCats);
    $('#lgAdd', root).addEventListener('click', add);
    $('#lgList', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      /* Step 10：删除二次确认（图标小按钮红色态提示） */
      LB.confirm(del, () => {
        records = records.filter(r => r.id !== del.dataset.del);
        save();
        renderSummary();
        renderList();
        LB.toast('已删除', 'ok');
      }, 3000, { iconOnly: true });
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('ledger', { mount, unmount });
})();
