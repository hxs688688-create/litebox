/* LiteBox v5 · tools/horoscope.js — 星座运势（Step 25 · 三）
 *
 * 只请求同源 /api/horoscope；后端已删掉上游的署名字段，界面上不出现任何数据来源。
 *
 * 【默认选中当前日期对应星座】
 *   按任务书给的日期表判断。注意摩羯座跨 1 月：12/22–1/19，
 *   所以不能用「start<=today<=end」直接比，1 月那几天属于摩羯座。
 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  const SIGNS = [
    { name: '白羊座', emoji: '♈', date: '3.21-4.19', start: [3, 21], end: [4, 19] },
    { name: '金牛座', emoji: '♉', date: '4.20-5.20', start: [4, 20], end: [5, 20] },
    { name: '双子座', emoji: '♊', date: '5.21-6.21', start: [5, 21], end: [6, 21] },
    { name: '巨蟹座', emoji: '♋', date: '6.22-7.22', start: [6, 22], end: [7, 22] },
    { name: '狮子座', emoji: '♌', date: '7.23-8.22', start: [7, 23], end: [8, 22] },
    { name: '处女座', emoji: '♍', date: '8.23-9.22', start: [8, 23], end: [9, 22] },
    { name: '天秤座', emoji: '♎', date: '9.23-10.23', start: [9, 23], end: [10, 23] },
    { name: '天蝎座', emoji: '♏', date: '10.24-11.22', start: [10, 24], end: [11, 22] },
    { name: '射手座', emoji: '♐', date: '11.23-12.21', start: [11, 23], end: [12, 21] },
    { name: '摩羯座', emoji: '♑', date: '12.22-1.19', start: [12, 22], end: [1, 19] },
    { name: '水瓶座', emoji: '♒', date: '1.20-2.18', start: [1, 20], end: [2, 18] },
    { name: '双鱼座', emoji: '♓', date: '2.19-3.20', start: [2, 19], end: [3, 20] }
  ];

  let rootEl = null;
  let seq = 0;
  let cur = '';

  /* 只需要判断「今天落在哪个日期区间」 */
  function within(sign, m, d) {
    const [sm, sd] = sign.start;
    const [em, ed] = sign.end;
    const v = m * 100 + d;
    /* 不跨年的区间（白羊…射手）；摩羯跨 1 月，单独处理 */
    if (sm <= em) return v >= sm * 100 + sd && v <= em * 100 + ed;
    return v >= sm * 100 + sd || v <= em * 100 + ed;
  }

  function todaySign() {
    const now = new Date();
    const m = now.getMonth() + 1, d = now.getDate();
    const hit = SIGNS.find(s => within(s, m, d));
    return hit ? hit.name : SIGNS[0].name;
  }

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    let r = null, text = '';
    try {
      r = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '查询超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '查询服务暂时不可用');
    return d;
  }

  function textOf(v) { return String(v == null ? '' : v).trim(); }

  /* 五行卡片共用一个结构，缺字段的卡片直接不渲染，避免出现空白格 */
  function card(title, icon, body) {
    const t = textOf(body);
    if (!t) return '';
    return '<div class="card tool-sec hs-card">' +
      '<h3 class="hs-card-t"><span aria-hidden="true">' + icon + '</span>' + esc(title) + '</h3>' +
      '<p class="hs-card-b">' + esc(t) + '</p></div>';
  }

  function render(d, sign) {
    const box = $('#hsResult', rootEl);
    const lucky = [];
    if (textOf(d.direction)) lucky.push(['贵人方位', d.direction]);
    if (textOf(d.friends)) lucky.push(['贵人星座', d.friends]);
    if (d.numbers != null && textOf(d.numbers) !== '') lucky.push(['幸运数字', d.numbers]);
    if (textOf(d.lucklyColor)) lucky.push(['幸运颜色', d.lucklyColor]);

    let html =
      '<div class="hs-head">' +
      '<b class="hs-title">' + esc(sign.emoji + ' ' + sign.name) + '</b>' +
      '<span class="hs-date">' + esc(sign.date) + '</span>' +
      '<span class="hs-today">今日</span>' +
      '</div>';

    html += card('综合运势', '🌟', d.contentAll);
    html += card('事业运', '💼', d.contentCareer);
    html += card('财运', '💰', d.contentFortune);
    html += card('爱情运', '❤️', d.contentLove);

    if (lucky.length) {
      html += '<div class="card tool-sec hs-card hs-lucky">' +
        '<h3 class="hs-card-t"><span aria-hidden="true">🧭</span>幸运信息</h3>' +
        '<div class="hs-lucky-grid">' +
        lucky.map(x => '<div class="hs-lucky-cell"><small>' + esc(x[0]) + '</small><b>' + esc(String(x[1])) + '</b></div>').join('') +
        '</div></div>';
    }

    html += '<p class="cd-note hs-disclaim">内容含虚构成分，仅供娱乐参考。</p>';
    box.innerHTML = html;
    box.hidden = false;
  }

  function showBusy() {
    const box = $('#hsResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
  }

  function showErr(msg) {
    const box = $('#hsResult', rootEl);
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '🔮',
      title: msg || '暂时无法获取运势',
      sub: '可能是网络或查询服务临时不可用',
      ctaText: '重新查询',
      onCta: () => load(cur)
    });
  }

  async function load(name) {
    const sign = SIGNS.find(s => s.name === name);
    if (!sign) return;
    if (!HAS_API) {
      const box = $('#hsResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    cur = name;
    $$('#hsGrid .hs-cell', rootEl).forEach(c => {
      c.classList.toggle('on', c.getAttribute('data-s') === name);
    });
    const my = ++seq;
    showBusy();
    try {
      const d = await apiGet('/api/horoscope?sign=' + encodeURIComponent(name), 12000);
      if (my !== seq) return;
      render(d, sign);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '暂时无法获取运势';
      showErr(msg);
      LB.fail('星座运势', msg, '稍后点重试再看');
    }
  }

  function gridHtml() {
    return SIGNS.map(s =>
      '<button class="hs-cell" data-s="' + esc(s.name) + '" type="button" aria-label="' + esc(s.name + ' 今日运势') + '">' +
      '<span class="hs-emoji" aria-hidden="true">' + esc(s.emoji) + '</span>' +
      '<b class="hs-name">' + esc(s.name) + '</b>' +
      '<small class="hs-range">' + esc(s.date) + '</small>' +
      '</button>'
    ).join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>星座运势</h1><p>12 星座今日运势：综合、事业、财运、爱情、贵人方位</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="hs-grid" id="hsGrid">' + gridHtml() + '</div>' +
      '<div id="hsResult" hidden></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#hsGrid', root).addEventListener('click', e => {
      const c = e.target.closest('[data-s]');
      if (c) load(c.getAttribute('data-s'));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    load(todaySign()); /* 打开即显示当前日期对应星座 */
  }

  function unmount() {
    seq++;
    cur = '';
    rootEl = null;
  }

  LB.router.register('horoscope', { mount, unmount });
})();
