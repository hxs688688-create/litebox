/* LiteBox v5 · tools/stats.js — 统计计算器（均值/中位数/样本方差/标准差，debounce 200ms） */
(function () {
  'use strict';

  const { $, debounce } = LB.dom;
  let rootEl = null;

  const IDS = ['stN', 'stSum', 'stMean', 'stMed', 'stStd', 'stVar', 'stMM', 'stRange'];

  /* 按 [\s,，;；]+ 分割并过滤 NaN */
  function parse(text) {
    return String(text).split(/[\s,，;；]+/).filter(Boolean).map(parseFloat).filter(x => !isNaN(x));
  }

  function calc() {
    /* Step 9：debounce 延迟回调守卫 —— 切走后 rootEl 为 null，不得再读已卸载 DOM */
    if (!rootEl || !document.body.contains(rootEl)) return;
    const nums = parse($('#stIn', rootEl).value);
    const n = nums.length;
    const put = (id, v) => { $('#' + id, rootEl).textContent = v; };
    const stat = $('#stStat', rootEl);

    if (n === 0) {
      IDS.forEach(id => put(id, '—'));
      stat.textContent = '输入数据后自动计算';
      stat.className = 'jst';
      return;
    }

    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const sorted = [...nums].sort((a, b) => a - b);
    const med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const max = sorted[n - 1], min = sorted[0];

    put('stN', String(n));
    put('stSum', fmt(sum));
    put('stMean', fmt(mean));
    put('stMed', fmt(med));
    put('stMM', fmt(max) + ' / ' + fmt(min));
    put('stRange', fmt(max - min));

    if (n === 1) {
      put('stStd', '—'); put('stVar', '—');
      stat.textContent = '⚠️ 只有 1 个数据，样本方差需至少 2 个';
      stat.className = 'jst warn';
      return;
    }
    const variance = nums.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1); /* 样本方差除以 n-1 */
    put('stVar', fmt(variance));
    put('stStd', fmt(Math.sqrt(variance)));
    stat.textContent = '✓ 已计算 ' + n + ' 个数据';
    stat.className = 'jst ok';
  }

  const fmt = x => Number.isInteger(x) ? String(x) : String(+x.toFixed(6));

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>统计计算器</h1><p>均值 / 中位数 / 样本方差 / 标准差，粘贴即算</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><span class="tool-lab">数据（空格 / 逗号 / 分号分隔）</span>' +
      '<textarea class="inp" id="stIn" rows="4" placeholder="85 90 78 92 88" spellcheck="false"></textarea></div>' +
      '<div class="st-grid">' +
      '<div class="st-card"><span class="st-num" id="stN">—</span><span class="st-lab">个数 n</span></div>' +
      '<div class="st-card"><span class="st-num" id="stSum">—</span><span class="st-lab">总和</span></div>' +
      '<div class="st-card"><span class="st-num" id="stMean">—</span><span class="st-lab">均值</span></div>' +
      '<div class="st-card"><span class="st-num" id="stMed">—</span><span class="st-lab">中位数</span></div>' +
      '<div class="st-card"><span class="st-num" id="stStd">—</span><span class="st-lab">标准差（样本）</span></div>' +
      '<div class="st-card"><span class="st-num" id="stVar">—</span><span class="st-lab">方差（样本）</span></div>' +
      '<div class="st-card"><span class="st-num" id="stMM">—</span><span class="st-lab">最大 / 最小</span></div>' +
      '<div class="st-card"><span class="st-num" id="stRange">—</span><span class="st-lab">极差</span></div>' +
      '</div>' +
      '<div class="jst" id="stStat">输入数据后自动计算</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#stIn', root).addEventListener('input', debounce(calc, 200));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('stats', { mount, unmount });
})();
