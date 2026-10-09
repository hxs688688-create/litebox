/* LiteBox v5 · tools/ledger.js — 记账本（多账户 / 转账 / 时间筛选 / 分类统计 / 搜索 / 导出 CSV / 定期记账）
   Step 15 · A2：在原有「月度收支统计 + 分类」基础上补齐核心功能。

   数据结构（litebox_ledger）：
     { accounts: [{ id, name, icon }],
       records:  [{ id, ts, date, type:'expense'|'income'|'transfer',
                    amt, cat, account, targetAccount, note, repeat:'none'|'monthly',
                    fromId? }] }   ← fromId 指向定期记账的模板记录，用于防重复生成
   兼容：旧版本 litebox_ledger 是「记录数组」，首次加载时自动升级为对象格式（旧记录归到现金账户）。
   转账不计入收支统计，只调整两个账户的余额。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const KEY = 'litebox_ledger';

  const DEFAULT_ACCOUNTS = [
    { id: 'cash', name: '现金', icon: '💵' },
    { id: 'wechat', name: '微信', icon: '💚' },
    { id: 'alipay', name: '支付宝', icon: '💙' },
    { id: 'bank', name: '银行卡', icon: '🏦' }
  ];

  const CATS = {
    expense: ['餐饮', '交通', '购物', '娱乐', '学习', '住房', '医疗', '人情', '其他'],
    income: ['工资', '兼职', '理财', '红包', '其他'],
    transfer: ['转账']
  };

  const TYPES = [
    { v: 'expense', n: '支出' },
    { v: 'income', n: '收入' },
    { v: 'transfer', n: '转账' }
  ];

  const RANGES = [
    { v: 'week', n: '本周' },
    { v: 'month', n: '本月' },
    { v: 'year', n: '本年' },
    { v: 'all', n: '全部' },
    { v: 'custom', n: '自定义' }
  ];

  let rootEl = null;
  let data = { accounts: DEFAULT_ACCOUNTS.slice(), records: [] };
  let view = { range: 'month', from: '', to: '', q: '', account: '', cat: '', type: '' };
  let upgradedFrom = 0;   /* 本次加载升级了多少条旧记录（用于提示） */

  const pad = n => String(n).padStart(2, '0');
  const genId = () => 'r' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36);
  const fmtDateObj = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => fmtDateObj(new Date());
  const fmtMoney = n => '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function save() { LB.storage.set(KEY, data); }

  /* ================= 存储：加载 + 旧格式升级 ================= */

  function load() {
    upgradedFrom = 0;
    const raw = LB.storage.get(KEY, null);

    /* 旧格式：直接是记录数组 */
    if (Array.isArray(raw)) {
      const recs = raw
        .filter(r => r && typeof r.amt === 'number' && isFinite(r.amt))
        .map(r => ({
          id: r.id || genId(),
          ts: typeof r.ts === 'number' ? r.ts : Date.now(),
          date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : todayStr(),
          type: r.type === 'income' ? 'income' : 'expense',
          amt: Math.abs(r.amt),
          cat: r.cat || '其他',
          account: 'cash',            /* 旧记录没有账户概念，统一归到现金 */
          targetAccount: '',
          note: r.note || '',
          repeat: 'none'
        }));
      data = { accounts: DEFAULT_ACCOUNTS.slice(), records: recs };
      upgradedFrom = recs.length;
      save();
      return;
    }

    if (raw && typeof raw === 'object') {
      data = {
        accounts: (Array.isArray(raw.accounts) && raw.accounts.length)
          ? raw.accounts.filter(a => a && a.id && a.name)
          : DEFAULT_ACCOUNTS.slice(),
        records: Array.isArray(raw.records)
          ? raw.records.filter(r => r && typeof r.amt === 'number' && isFinite(r.amt))
          : []
      };
      /* 账户被删过但记录还引用着 → 补一个占位账户，避免余额凭空消失 */
      const ids = new Set(data.accounts.map(a => a.id));
      data.records.forEach(r => {
        [r.account, r.targetAccount].forEach(aid => {
          if (aid && !ids.has(aid)) {
            ids.add(aid);
            data.accounts.push({ id: aid, name: aid === 'cash' ? '现金' : '已删除账户', icon: '❓' });
          }
        });
      });
      return;
    }

    data = { accounts: DEFAULT_ACCOUNTS.slice(), records: [] };
  }

  /* 定期记账：把「每月重复」的模板补到今天为止（用 fromId 防重复生成） */
  function materializeRecurring() {
    const today = todayStr();
    const add = [];
    data.records.filter(r => r.repeat === 'monthly').forEach(tpl => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tpl.date || '');
      if (!m) return;
      let cy = +m[1], cm = +m[2];
      const day = +m[3];
      for (let guard = 0; guard < 240; guard++) {
        cm++;
        if (cm > 12) { cm = 1; cy++; }
        const dim = new Date(cy, cm, 0).getDate();   /* 当月天数，避免 31 号在小月溢出 */
        const ds = cy + '-' + pad(cm) + '-' + pad(Math.min(day, dim));
        if (ds > today) break;
        if (data.records.some(r => r.fromId === tpl.id && r.date === ds)) continue;
        if (add.some(r => r.fromId === tpl.id && r.date === ds)) continue;
        add.push({
          id: genId(), ts: Date.now(), date: ds, type: tpl.type, amt: tpl.amt,
          cat: tpl.cat, account: tpl.account, targetAccount: tpl.targetAccount || '',
          note: tpl.note, repeat: 'none', fromId: tpl.id
        });
      }
    });
    if (add.length) { data.records = add.concat(data.records); save(); }
    return add.length;
  }

  /* ================= 计算 ================= */

  function accountById(id) { return data.accounts.find(a => a.id === id) || null; }
  function accountName(id) { const a = accountById(id); return a ? a.name : '—'; }

  /* 时间范围边界（自定义用用户填的日期，其余按自然周期） */
  function rangeBounds() {
    const now = new Date();
    const t = todayStr();
    if (view.range === 'week') {
      const dow = (now.getDay() + 6) % 7;           /* 周一为一周起点 */
      const s = new Date(now); s.setDate(now.getDate() - dow);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return { from: fmtDateObj(s), to: fmtDateObj(e) };
    }
    if (view.range === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmtDateObj(s), to: fmtDateObj(e) };
    }
    if (view.range === 'year') {
      return { from: now.getFullYear() + '-01-01', to: now.getFullYear() + '-12-31' };
    }
    if (view.range === 'custom') return { from: view.from || '', to: view.to || '' };
    return { from: '', to: '' };                     /* 全部 */
  }

  const inRange = (r, b) => (!b.from || r.date >= b.from) && (!b.to || r.date <= b.to);

  function rangeLabel() {
    const r = RANGES.find(x => x.v === view.range);
    return r ? r.n : '本月';
  }

  /* 账户余额：收入 − 支出；转账从源账户扣、给目标账户加 */
  function balances() {
    const map = {};
    data.accounts.forEach(a => { map[a.id] = 0; });
    data.records.forEach(r => {
      if (r.type === 'income') map[r.account] = (map[r.account] || 0) + r.amt;
      else if (r.type === 'expense') map[r.account] = (map[r.account] || 0) - r.amt;
      else if (r.type === 'transfer') {
        map[r.account] = (map[r.account] || 0) - r.amt;
        if (r.targetAccount) map[r.targetAccount] = (map[r.targetAccount] || 0) + r.amt;
      }
    });
    return map;
  }

  function summarize(b) {
    let exp = 0, inc = 0;
    data.records.forEach(r => {
      if (!inRange(r, b)) return;
      if (r.type === 'income') inc += r.amt;
      else if (r.type === 'expense') exp += r.amt;
    });
    return { exp, inc, net: inc - exp };
  }

  /* 支出 Top 5 分类（按当前时间范围） */
  function topCats(b) {
    const m = {};
    data.records.forEach(r => {
      if (r.type !== 'expense' || !inRange(r, b)) return;
      m[r.cat] = (m[r.cat] || 0) + r.amt;
    });
    return Object.keys(m)
      .map(cat => ({ cat, amt: m[cat] }))
      .sort((a, b2) => b2.amt - a.amt)
      .slice(0, 5);
  }

  /* 列表：时间 + 账户 + 分类 + 类型 + 关键字 五重筛选 */
  function filtered() {
    const b = rangeBounds();
    const q = view.q.trim().toLowerCase();
    return data.records
      .filter(r => inRange(r, b))
      .filter(r => !view.account || r.account === view.account || r.targetAccount === view.account)
      .filter(r => !view.cat || r.cat === view.cat)
      .filter(r => !view.type || r.type === view.type)
      .filter(r => !q || String(r.note || '').toLowerCase().indexOf(q) >= 0 ||
                   String(r.cat || '').toLowerCase().indexOf(q) >= 0 ||
                   accountName(r.account).toLowerCase().indexOf(q) >= 0)
      .sort((a, b2) => String(b2.date).localeCompare(String(a.date)) || (b2.ts || 0) - (a.ts || 0));
  }

  /* ================= 渲染 ================= */

  function renderAccounts() {
    const bal = balances();
    const box = $('#lgAccts', rootEl);
    box.innerHTML = data.accounts.map(a =>
      '<div class="lg-acct">' +
      '<span class="lg-acct-ic" aria-hidden="true">' + esc(a.icon || '💳') + '</span>' +
      '<span class="lg-acct-name">' + esc(a.name) + '</span>' +
      '<b class="lg-acct-bal' + (bal[a.id] < 0 ? ' neg' : '') + '">' + fmtMoney(bal[a.id] || 0) + '</b>' +
      (DEFAULT_ACCOUNTS.some(d => d.id === a.id) ? '' :
        '<button class="td-del" data-delacct="' + esc(a.id) + '" type="button" aria-label="删除账户">×</button>') +
      '</div>'
    ).join('');
    const net = Object.keys(bal).reduce((s, k) => s + bal[k], 0);
    $('#lgNet', rootEl).textContent = fmtMoney(net);
    $('#lgNet', rootEl).classList.toggle('neg', net < 0);
  }

  function renderSummary() {
    const b = rangeBounds();
    const s = summarize(b);
    $('#lgExp', rootEl).textContent = fmtMoney(s.exp);
    $('#lgInc', rootEl).textContent = fmtMoney(s.inc);
    $('#lgNet2', rootEl).textContent = (s.net < 0 ? '-' : '') + fmtMoney(s.net);
    $('#lgNet2', rootEl).classList.toggle('neg', s.net < 0);
    $('#lgSumLab', rootEl).textContent = rangeLabel() + '收支';
  }

  function renderBars() {
    const b = rangeBounds();
    const list = topCats(b);
    const box = $('#lgBars', rootEl);
    $('#lgBarsLab', rootEl).textContent = rangeLabel() + '支出 Top 5 分类';
    if (!list.length) {
      box.innerHTML = '<p class="cd-note">这段时间还没有支出记录。</p>';
      return;
    }
    const max = Math.max.apply(null, list.map(x => x.amt)) || 1;
    const total = list.reduce((s, x) => s + x.amt, 0);
    box.innerHTML = list.map(x =>
      '<button class="lg-bar" type="button" data-barcat="' + esc(x.cat) + '">' +
      '<span class="lg-bar-name">' + esc(x.cat) + '</span>' +
      '<span class="lg-bar-track"><i class="lg-bar-fill"></i></span>' +
      '<span class="lg-bar-amt">' + fmtMoney(x.amt) + '<small>' + Math.round(x.amt / total * 100) + '%</small></span>' +
      '</button>'
    ).join('');
    /* 宽度用 DOM style API 写入（颜色/尺寸定义仍在 CSS） */
    $$('.lg-bar', box).forEach((el, i) => {
      el.querySelector('.lg-bar-fill').style.width = Math.max(2, list[i].amt / max * 100) + '%';
    });
  }

  function renderFilters() {
    const acct = $('#lgFAcct', rootEl);
    acct.innerHTML = '<option value="">全部账户</option>' +
      data.accounts.map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
    acct.value = view.account;

    const allCats = [];
    ['expense', 'income', 'transfer'].forEach(t => CATS[t].forEach(c => { if (allCats.indexOf(c) < 0) allCats.push(c); }));
    data.records.forEach(r => { if (r.cat && allCats.indexOf(r.cat) < 0) allCats.push(r.cat); });
    const cat = $('#lgFCat', rootEl);
    cat.innerHTML = '<option value="">全部分类</option>' +
      allCats.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    cat.value = view.cat;

    $('#lgFType', rootEl).value = view.type;

    /* 生效中的筛选（分类统计点击后会出现在这里，方便一键清掉） */
    const chips = [];
    if (view.cat) chips.push({ k: 'cat', t: '分类：' + view.cat });
    if (view.account) chips.push({ k: 'account', t: '账户：' + accountName(view.account) });
    if (view.type) chips.push({ k: 'type', t: '类型：' + (TYPES.find(x => x.v === view.type) || {}).n });
    if (view.q.trim()) chips.push({ k: 'q', t: '关键词：' + view.q.trim() });
    const bar = $('#lgFbar', rootEl);
    bar.hidden = !chips.length;
    bar.innerHTML = chips.map(c =>
      '<button class="chip on" type="button" data-clear="' + c.k + '">' + esc(c.t) + ' ✕</button>'
    ).join('') + '<button class="chip" type="button" data-clear="all">清空筛选</button>';
  }

  function renderList() {
    const list = $('#lgList', rootEl);
    const rows = filtered();
    if (!rows.length) {
      LB.ui.empty(list, {
        icon: '📒',
        title: data.records.length ? '没有符合条件的记录' : '还没有记录',
        sub: data.records.length ? '换个时间范围或清空筛选试试' : '选类型、填金额，记下第一笔收支',
        ctaText: data.records.length ? '清空筛选' : '记一笔',
        onCta: () => {
          if (data.records.length) { resetFilters(); }
          else { const inp = $('#lgAmt', rootEl); if (inp) inp.focus(); }
        }
      });
      return;
    }
    const shown = rows.slice(0, 300);
    list.innerHTML = shown.map(r => {
      const t = TYPES.find(x => x.v === r.type) || TYPES[0];
      let amtCls = 'neg', sign = '-', amtTxt = fmtMoney(r.amt), sub;
      if (r.type === 'income') { amtCls = 'pos'; sign = '+'; }
      else if (r.type === 'transfer') { amtCls = 'mv'; sign = '⇄'; }
      sub = esc(r.date) + ' · ' + esc(r.cat) + ' · ' + esc(accountName(r.account)) +
        (r.type === 'transfer' ? ' → ' + esc(accountName(r.targetAccount)) : '');
      return '<div class="lg-row">' +
        '<div class="lg-info"><b>' + esc(r.note || r.cat) + (r.repeat === 'monthly' ? ' <i class="lg-rep">每月</i>' : '') + '</b>' +
        '<small>' + sub + '</small></div>' +
        '<span class="lg-amt ' + amtCls + '">' + sign + amtTxt + '</span>' +
        '<button class="td-del" data-del="' + esc(r.id) + '" type="button" aria-label="删除">×</button>' +
        '</div>';
    }).join('') +
      (rows.length > shown.length ? '<p class="cd-note">共 ' + rows.length + ' 条，仅显示前 ' + shown.length + ' 条。</p>' : '');
  }

  function renderAll() {
    renderAccounts();
    renderSummary();
    renderBars();
    renderFilters();
    renderList();
  }

  /* ================= 交互 ================= */

  function syncCats() {
    const type = $('#lgType', rootEl).value;
    $('#lgCat', rootEl).innerHTML = CATS[type].map(c => '<option>' + c + '</option>').join('');
    /* 转账要选目标账户；分类固定为「转账」，禁用选择 */
    const isTf = type === 'transfer';
    $('#lgCat', rootEl).disabled = isTf;
    $('#lgTargetRow', rootEl).hidden = !isTf;
    $('#lgRepeatRow', rootEl).hidden = isTf;   /* 转账不做定期 */
    if (isTf) syncTargets();
  }

  function syncTargets() {
    const from = $('#lgAccount', rootEl).value;
    const sel = $('#lgTarget', rootEl);
    const keep = sel.value;
    sel.innerHTML = data.accounts
      .filter(a => a.id !== from)
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
    if (keep && keep !== from) sel.value = keep;
  }

  function syncAccounts() {
    const sel = $('#lgAccount', rootEl);
    const keep = sel.value;
    sel.innerHTML = data.accounts.map(a => '<option value="' + esc(a.id) + '">' + esc(a.icon || '') + ' ' + esc(a.name) + '</option>').join('');
    if (keep && accountById(keep)) sel.value = keep;
    syncTargets();
  }

  function add() {
    const amt = parseFloat($('#lgAmt', rootEl).value);
    if (!(amt > 0)) { LB.toast('请输入有效的金额', 'info'); return; }
    const type = $('#lgType', rootEl).value;
    const account = $('#lgAccount', rootEl).value;
    if (!account) { LB.toast('请先选择账户', 'info'); return; }
    let target = '';
    if (type === 'transfer') {
      target = $('#lgTarget', rootEl).value;
      if (!target) { LB.toast('请选择目标账户', 'info'); return; }
      if (target === account) { LB.toast('转出与转入账户不能相同', 'info'); return; }
    }
    data.records.unshift({
      id: genId(),
      ts: Date.now(),
      date: $('#lgDate', rootEl).value || todayStr(),
      type,
      amt: +amt.toFixed(2),
      cat: type === 'transfer' ? '转账' : $('#lgCat', rootEl).value,
      account,
      targetAccount: target,
      note: $('#lgNote', rootEl).value.trim(),
      repeat: (type !== 'transfer' && $('#lgRepeat', rootEl).checked) ? 'monthly' : 'none'
    });
    save();
    $('#lgAmt', rootEl).value = '';
    $('#lgNote', rootEl).value = '';
    renderAll();
    LB.toast(type === 'transfer' ? '已记录转账' : '已记一笔', 'ok');
  }

  function addAccount() {
    const name = window.prompt('新账户名称（如：招行信用卡 / 余额宝）', '');
    if (name === null) return;
    const n = name.trim();
    if (!n) { LB.toast('账户名不能为空', 'info'); return; }
    if (data.accounts.some(a => a.name === n)) { LB.toast('已存在同名账户', 'info'); return; }
    data.accounts.push({ id: 'u' + Date.now().toString(36), name: n, icon: '💳' });
    save();
    renderAll();
    syncAccounts();
    LB.toast('已添加账户：' + n, 'ok');
  }

  function delAccount(id) {
    const used = data.records.some(r => r.account === id || r.targetAccount === id);
    if (used) { LB.toast('该账户已有记录，不能删除', 'info'); return; }
    data.accounts = data.accounts.filter(a => a.id !== id);
    save();
    renderAll();
    syncAccounts();
    LB.toast('已删除账户', 'ok');
  }

  function resetFilters() {
    view.q = ''; view.account = ''; view.cat = ''; view.type = '';
    const q = $('#lgQ', rootEl);
    if (q) q.value = '';
    renderAll();
  }

  function setRange(v) {
    view.range = v;
    $$('#lgRange .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#lgCustom', rootEl).hidden = v !== 'custom';
    renderAll();
  }

  /* 导出 CSV：日期 / 类型 / 金额 / 分类 / 账户 / 备注（按当前筛选结果导出） */
  function exportCSV() {
    const rows = filtered();
    if (!rows.length) { LB.toast('当前没有可导出的记录', 'info'); return; }
    const lines = [['日期', '类型', '金额', '分类', '账户', '备注']];
    rows.forEach(r => {
      const typeName = (TYPES.find(x => x.v === r.type) || {}).n || r.type;
      const acct = accountName(r.account) + (r.type === 'transfer' ? ' → ' + accountName(r.targetAccount) : '');
      const amt = (r.type === 'expense' ? '-' : r.type === 'income' ? '' : '') + r.amt.toFixed(2);
      lines.push([r.date, typeName, amt, r.cat, acct, r.note || '']);
    });
    /* \uFEFF 让 Excel 正确识别 UTF-8；字段统一加引号并转义内部引号 */
    const csv = '\uFEFF' + lines.map(l => l.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    LB.img.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'litebox-ledger-' + todayStr() + '.csv');
    LB.toast('已导出 ' + rows.length + ' 条记录', 'ok');
  }

  /* ================= 视图 ================= */

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>记账本</h1><p>多账户 · 转账 · 分类统计 · 导出 CSV，数据只保存在本机</p></div>' +
      '</div>' +
      '<div class="tool-body">' +

      /* —— 账户余额 —— */
      '<div class="card tool-sec set-card">' +
      '<div class="lg-head"><span class="tool-lab">账户余额</span>' +
      '<button class="ql-btn" id="lgAddAcct" type="button">＋ 添加账户</button></div>' +
      '<div class="lg-accts" id="lgAccts"></div>' +
      '<div class="lg-net"><span>净资产</span><b id="lgNet">¥0.00</b></div>' +
      '</div>' +

      /* —— 时间筛选 —— */
      '<div class="seg seg-5" id="lgRange">' +
      RANGES.map(r => '<button class="seg-btn' + (r.v === 'month' ? ' on' : '') + '" data-v="' + r.v + '" type="button">' + r.n + '</button>').join('') +
      '</div>' +
      '<div class="pdf-form" id="lgCustom" hidden>' +
      '<label class="pz-lab">起始日期<input class="inp" id="lgFrom" type="date" /></label>' +
      '<label class="pz-lab">结束日期<input class="inp" id="lgTo" type="date" /></label>' +
      '</div>' +

      /* —— 概览 —— */
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab" id="lgSumLab">本月收支</div><div class="rc-val" id="lgNet2">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">支出</div><div class="rc-val" id="lgExp">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">收入</div><div class="rc-val" id="lgInc">¥0.00</div></div>' +
      '</div>' +

      /* —— 分类统计 —— */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab" id="lgBarsLab">本月支出 Top 5 分类</span>' +
      '<div class="lg-bars" id="lgBars"></div>' +
      '<p class="cd-note">点任意分类可筛选该分类的记录。</p>' +
      '</div>' +

      /* —— 记一笔 —— */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">记一笔</span>' +
      '<label class="pz-lab">金额（元）<input class="inp" id="lgAmt" type="number" min="0" step="0.01" placeholder="0.00" /></label>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">类型<select class="inp" id="lgType">' +
      TYPES.map(t => '<option value="' + t.v + '">' + t.n + '</option>').join('') +
      '</select></label>' +
      '<label class="pz-lab">分类<select class="inp" id="lgCat"></select></label>' +
      '</div>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">账户<select class="inp" id="lgAccount"></select></label>' +
      '<label class="pz-lab" id="lgTargetRow" hidden>转入账户<select class="inp" id="lgTarget"></select></label>' +
      '</div>' +
      '<label class="pz-lab">备注<input class="inp" id="lgNote" maxlength="30" placeholder="选填（如：午餐）" /></label>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">日期<input class="inp" id="lgDate" type="date" /></label>' +
      '<label class="chk-row" id="lgRepeatRow"><input type="checkbox" id="lgRepeat"><span>每月重复</span></label>' +
      '</div>' +
      '<button class="btn btn-main" id="lgAdd" type="button">＋ 记一笔</button>' +
      '</div>' +

      /* —— 筛选 + 列表 —— */
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">记录明细</span>' +
      '<div class="lg-filters">' +
      '<input class="inp" id="lgQ" type="search" maxlength="30" placeholder="搜索备注 / 分类 / 账户" />' +
      '<select class="inp" id="lgFType">' +
      '<option value="">全部类型</option>' +
      TYPES.map(t => '<option value="' + t.v + '">' + t.n + '</option>').join('') +
      '</select>' +
      '<select class="inp" id="lgFAcct"></select>' +
      '<select class="inp" id="lgFCat"></select>' +
      '</div>' +
      '<div class="hl-chips" id="lgFbar" hidden></div>' +
      '<div class="lg-rows" id="lgList"></div>' +
      '<div class="set-btns"><button class="btn btn-ghost" id="lgCsv" type="button">⬇️ 导出 CSV</button></div>' +
      '</div>' +

      '<p class="cd-note">余额为全部历史累计（收入 − 支出，转账只挪账户不计收支）；「本月」等时间范围只影响统计与明细列表。数据保存在本设备浏览器中。</p>' +
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">记录数据仅本机保存。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    view = { range: 'month', from: '', to: '', q: '', account: '', cat: '', type: '' };

    load();
    const added = materializeRecurring();

    $('#lgDate', root).value = todayStr();
    syncAccounts();
    syncCats();
    renderAll();

    /* —— 时间筛选 —— */
    $('#lgRange', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setRange(b.dataset.v);
    });
    $('#lgFrom', root).addEventListener('change', () => { view.from = $('#lgFrom', root).value; renderAll(); });
    $('#lgTo', root).addEventListener('change', () => { view.to = $('#lgTo', root).value; renderAll(); });

    /* —— 记账表单 —— */
    $('#lgType', root).addEventListener('change', syncCats);
    $('#lgAccount', root).addEventListener('change', syncTargets);
    $('#lgAdd', root).addEventListener('click', add);
    $('#lgAddAcct', root).addEventListener('click', addAccount);

    /* —— 分类统计点击 → 筛选 —— */
    $('#lgBars', root).addEventListener('click', e => {
      const b = e.target.closest('[data-barcat]');
      if (!b) return;
      view.cat = b.dataset.barcat;
      renderFilters();
      renderList();
    });

    /* —— 筛选 —— */
    $('#lgQ', root).addEventListener('input', e => { view.q = e.target.value; renderFilters(); renderList(); });
    $('#lgFType', root).addEventListener('change', e => { view.type = e.target.value; renderFilters(); renderList(); });
    $('#lgFAcct', root).addEventListener('change', e => { view.account = e.target.value; renderFilters(); renderList(); });
    $('#lgFCat', root).addEventListener('change', e => { view.cat = e.target.value; renderFilters(); renderList(); });
    $('#lgFbar', root).addEventListener('click', e => {
      const b = e.target.closest('[data-clear]');
      if (!b) return;
      const k = b.dataset.clear;
      if (k === 'all') { resetFilters(); return; }
      view[k] = '';
      if (k === 'q') $('#lgQ', root).value = '';
      renderAll();
    });

    /* —— 列表：删除记录 / 删除账户 —— */
    $('#lgList', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      LB.confirm(del, () => {
        data.records = data.records.filter(r => r.id !== del.dataset.del);
        save();
        renderAll();
        LB.toast('已删除', 'ok');
      }, 3000, { iconOnly: true });
    });
    $('#lgAccts', root).addEventListener('click', e => {
      const del = e.target.closest('[data-delacct]');
      if (!del) return;
      LB.confirm(del, () => delAccount(del.dataset.delacct), 3000, { iconOnly: true });
    });

    $('#lgCsv', root).addEventListener('click', exportCSV);

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    if (upgradedFrom) LB.toast('已把 ' + upgradedFrom + ' 条旧记录升级到多账户格式', 'info');
    if (added) LB.toast('定期记账自动补记了 ' + added + ' 笔', 'info');
  }

  function unmount() { rootEl = null; }

  LB.router.register('ledger', { mount, unmount });
})();
