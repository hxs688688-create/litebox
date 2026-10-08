/* LiteBox v5 · tools/subscriptions.js — 订阅管理（每月固定 / 年支出 / 续费提醒，本机保存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY = 'litebox_subscriptions';
  const CYCLES = [['monthly', '每月'], ['yearly', '每年'], ['weekly', '每周'], ['once', '一次性']];

  let rootEl = null;
  let subs = []; /* [{ id, name, price, cycle, date, category, remind }] */

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmtMoney = n => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  /* 下一次续费日（按任务规格实现；monthly 月末进位时回退到进位所在月最后一天） */
  function nextRenewal(dateStr, cycle) {
    const start = new Date(dateStr + 'T12:00:00');
    const now = new Date(); now.setHours(12, 0, 0, 0);
    if (cycle === 'weekly') {
      const days = Math.ceil((now - start) / 86400000 / 7);
      return new Date(start.getTime() + days * 7 * 86400000);
    }
    if (cycle === 'monthly') {
      let d = new Date(start);
      while (d < now) {
        d = new Date(d.getFullYear(), d.getMonth() + 1, start.getDate());
        /* 若目标月份没有 start.getDate()，Date 会自动进位到下个月，需回退 */
        if (d.getDate() !== start.getDate()) d = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      }
      return d;
    }
    if (cycle === 'yearly') {
      let d = new Date(start);
      while (d < now) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
      return d;
    }
    return start; /* once */
  }

  /* 折算每月成本：once 不计入 */
  function perMonth(price, cycle) {
    if (cycle === 'monthly') return price;
    if (cycle === 'yearly') return price / 12;
    if (cycle === 'weekly') return price * 52 / 12;
    return 0;
  }
  const cycleLabel = c => (CYCLES.find(x => x[0] === c) || ['', c])[1];

  function save() { LB.storage.set(KEY, subs); }

  function render() {
    /* 汇总 */
    let monthlySum = 0, soon = 0;
    const now = new Date(); now.setHours(12, 0, 0, 0);
    subs.forEach(s => {
      monthlySum += perMonth(s.price, s.cycle);
      if (s.cycle !== 'once') {
        const days = Math.ceil((nextRenewal(s.date, s.cycle) - now) / 86400000);
        if (days >= 0 && days <= 30) soon++;
      }
    });
    $('#sbMonth', rootEl).textContent = fmtMoney(monthlySum);
    $('#sbYear', rootEl).textContent = fmtMoney(monthlySum * 12);
    $('#sbSoon', rootEl).textContent = String(soon);

    /* 列表 */
    const sbList = $('#sbList', rootEl);
    if (!subs.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(sbList, {
        icon: '🔔',
        title: '还没有订阅',
        sub: '录入会员 / 软件 / 流媒体，自动算每月成本和续费日',
        ctaText: '添加一个订阅',
        onCta: () => { const inp = $('#sbName', rootEl); if (inp) inp.focus(); }
      });
    } else {
      sbList.innerHTML = subs.map(s => {
      const renewal = nextRenewal(s.date, s.cycle);
      const days = Math.ceil((renewal - now) / 86400000);
      const renewTxt = days === 0 ? '今天续费' : days < 0 ? '已过期' : days + ' 天后续费';
      const pm = perMonth(s.price, s.cycle);
      const monthlyOnly = s.cycle === 'monthly' || s.cycle === 'once';
      return '<div class="sub-row">' +
        '<span class="sub-ic">' + esc((s.name || '?').trim().charAt(0).toUpperCase()) + '</span>' +
        '<div class="sub-info">' +
        '<b>' + esc(s.name) + '</b>' +
        '<small>' + esc(s.category || '未分类') + ' · ' + cycleLabel(s.cycle) + ' · ' + esc(s.date) + '</small>' +
        '<small class="sub-renew' + (days >= 0 && days <= 7 ? ' soon' : '') + '">' + (s.cycle === 'once' && days < 0 ? '已过期' : renewTxt + (s.cycle !== 'once' ? '（' + fmtDate(renewal) + '）' : '')) + '</small>' +
        '</div>' +
        '<div class="sub-amt"><b>' + fmtMoney(s.price) + '</b>' +
        (monthlyOnly ? '' : '<small>约 ' + fmtMoney(pm) + '/月</small>') +
        '</div>' +
        '<button class="td-del" data-del="' + s.id + '" type="button" aria-label="删除">×</button>' +
        '</div>';
      }).join('');
    }
  }

  function add() {
    const name = $('#sbName', rootEl).value.trim();
    const price = parseFloat($('#sbPrice', rootEl).value);
    if (!name) { LB.toast('请输入订阅名称', 'info'); return; }
    if (!(price > 0)) { LB.toast('请输入有效的价格', 'info'); return; }
    subs.unshift({
      id: 's' + Date.now().toString(36) + Math.floor(performance.now() % 1e6).toString(36),
      name,
      price: +price.toFixed(2),
      cycle: $('#sbCycle', rootEl).value,
      date: $('#sbDate', rootEl).value || todayStr(),
      category: $('#sbCat', rootEl).value.trim(),
      remind: Math.max(0, parseInt($('#sbRemind', rootEl).value, 10) || 0)
    });
    save();
    $('#sbName', rootEl).value = '';
    $('#sbPrice', rootEl).value = '';
    render();
    LB.toast('已添加订阅', 'ok');
  }

  function html() {
    const cycleOpts = CYCLES.map(c => '<option value="' + c[0] + '">' + c[1] + '</option>').join('');
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>订阅管理</h1><p>管理会员、软件和流媒体订阅，自动计算月度 / 年度成本与续费日期</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">每月固定</div><div class="rc-val" id="sbMonth">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">预计年支出</div><div class="rc-val" id="sbYear">¥0.00</div></div>' +
      '<div class="res-card"><div class="rc-lab">近 30 天续费</div><div class="rc-val" id="sbSoon">0</div></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">添加订阅</span>' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="sbName" maxlength="20" placeholder="订阅名称（如：Netflix）" />' +
      '<input class="inp" id="sbPrice" type="number" min="0" step="0.01" placeholder="价格（元）" />' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">周期<select class="inp" id="sbCycle">' + cycleOpts + '</select></label>' +
      '<label class="pz-lab">开始日期<input class="inp" id="sbDate" type="date" /></label>' +
      '</div>' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="sbCat" maxlength="12" placeholder="分类（如：流媒体 / 软件）" />' +
      '<label class="pz-lab">提前提醒（天）<input class="inp" id="sbRemind" type="number" min="0" max="30" value="3" /></label>' +
      '</div>' +
      '<button class="btn btn-main" id="sbAdd" type="button">＋ 添加订阅</button>' +
      '</div>' +
      '<div class="sub-rows" id="sbList"></div>' +
      '<p class="cd-note">每月固定 = 每月项合计 + 年费 ÷ 12 + 周费 × 52 ÷ 12（一次性不计入）；7 天内的续费日红色高亮；数据保存在本设备浏览器中。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">记录数据仅本机保存。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    subs = Array.isArray(saved) ? saved.filter(s => s && typeof s.name === 'string') : [];
    $('#sbDate', root).value = todayStr();
    render();
    $('#sbAdd', root).addEventListener('click', add);
    $('#sbList', root).addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      /* Step 10：删除二次确认（图标小按钮红色态提示） */
      LB.confirm(del, () => {
        subs = subs.filter(s => s.id !== del.dataset.del);
        save();
        render();
        LB.toast('已删除', 'ok');
      }, 3000, { iconOnly: true });
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('subscriptions', { mount, unmount });
})();
