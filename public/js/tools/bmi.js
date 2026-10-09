/* LiteBox v5 · tools/bmi.js — BMI 体重指数（中国标准分级 + 健康体重范围参考） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  /* 中国标准分级（任务规格）：<18.5 偏瘦 / 18.5-23.9 正常 / 24-27.9 超重 / ≥28 肥胖 */
  const LEVELS = [
    { max: 18.5, name: '偏瘦', cls: 'bm-thin' },
    { max: 24, name: '正常', cls: 'bm-okp' },
    { max: 28, name: '超重', cls: 'bm-over' },
    { max: Infinity, name: '肥胖', cls: 'bm-fat' }
  ];

  function calc() {
    const hIn = $('#bmH', rootEl).value;
    const wIn = $('#bmW', rootEl).value;
    const h = parseFloat(hIn);
    const w = parseFloat(wIn);
    const out = $('#bmOut', rootEl);
    /* 身高 50-250cm、体重 10-300kg */
    const ok = h >= 50 && h <= 250 && w >= 10 && w <= 300;
    if (!ok) { out.hidden = true; return; }

    const m2 = (h / 100) * (h / 100);
    const bmi = w / m2;
    const lv = LEVELS.find(l => bmi < l.max) || LEVELS[LEVELS.length - 1];
    /* 健康体重范围：18.5 ~ 23.9 对应的体重区间 */
    const lo = 18.5 * m2;
    const hi = 23.9 * m2;

    $('#bmVal', rootEl).textContent = bmi.toFixed(1);
    const pill = $('#bmLv', rootEl);
    pill.textContent = lv.name;
    pill.className = 'bm-pill ' + lv.cls;
    $('#bmRange', rootEl).textContent = '你的健康体重范围约 ' + lo.toFixed(1) + ' ~ ' + hi.toFixed(1) + ' kg';
    out.hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>BMI 体重指数</h1><p>输入身高体重即算 BMI，按中国标准分级</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="cd-form-row">' +
      '<label class="pz-lab">身高（cm）<input class="inp" id="bmH" type="number" min="50" max="250" step="0.1" placeholder="170" /></label>' +
      '<label class="pz-lab">体重（kg）<input class="inp" id="bmW" type="number" min="10" max="300" step="0.1" placeholder="60" /></label>' +
      '</div>' +
      '</div>' +
      '<div class="card tool-sec set-card bm-out" id="bmOut" hidden>' +
      '<div class="bm-big" id="bmVal">0.0</div>' +
      '<div class="bm-pill" id="bmLv"></div>' +
      '<div class="bm-range" id="bmRange"></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">BMI 分级参考（中国标准）</span>' +
      '<div class="bm-bar"></div>' +
      '<div class="bm-scale">' +
      '<span><b class="bm-dot bm-dot-thin"></b>偏瘦 &lt;18.5</span>' +
      '<span><b class="bm-dot bm-dot-ok"></b>正常 18.5-23.9</span>' +
      '<span><b class="bm-dot bm-dot-warn"></b>超重 24-27.9</span>' +
      '<span><b class="bm-dot bm-dot-fat"></b>肥胖 ≥28</span>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">BMI = 体重(kg) ÷ 身高²(m²)；分级采用中国成人标准，仅供健康参考，不作为医学诊断依据。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#bmH', root).addEventListener('input', calc);
    $('#bmW', root).addEventListener('input', calc);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('bmi', { mount, unmount });
})();
