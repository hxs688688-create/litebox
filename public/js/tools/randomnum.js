/* LiteBox v5 · tools/randomnum.js — 随机数生成（crypto 安全随机） */
(function () {
  const { $, clamp } = LB.dom;
  let rootEl = null;
  let lastResult = [];

  /* crypto.getRandomValues 拒绝采样，取 [min, max] 闭区间无偏随机整数 */
  function randInt(min, max) {
    const range = max - min + 1;
    const limit = Math.floor(0x100000000 / range) * range;
    const buf = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return min + (x % range);
  }

  function generate(min, max, count, unique) {
    const range = max - min + 1;
    if (unique && count <= range && range <= 200000) {
      /* 范围 ≤ 20 万：Fisher-Yates 洗牌取前 N */
      const pool = new Array(range);
      for (let i = 0; i < range; i++) pool[i] = min + i;
      for (let i = range - 1; i > 0; i--) {
        const j = randInt(0, i);
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      return pool.slice(0, count);
    }
    /* 不重复且范围 > 20 万：Set 去重 */
    if (unique) {
      const set = new Set();
      while (set.size < count) set.add(randInt(min, max));
      return [...set];
    }
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = randInt(min, max);
    return out;
  }

  function run() {
    const min = parseInt($('#rnMin', rootEl).value, 10);
    const max = parseInt($('#rnMax', rootEl).value, 10);
    const count = clamp(parseInt($('#rnCount', rootEl).value, 10) || 1, 1, 1000);
    const unique = $('#rnUnique', rootEl).checked;
    const err = $('#rnErr', rootEl);
    const out = $('#rnOut', rootEl);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      err.textContent = '请输入最小值与最大值';
      err.hidden = false;
      return;
    }
    if (min > max) {
      err.textContent = '最小值不能大于最大值';
      err.hidden = false;
      return;
    }
    if (unique && count > (max - min + 1)) {
      err.textContent = '不重复抽取时，个数不能超过范围大小（' + (max - min + 1) + '）';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    lastResult = generate(min, max, count, unique);
    out.textContent = lastResult.join('、');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>随机数生成</h1><p>指定范围与个数，支持不重复抽取，安全随机</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">最小值</div><input class="inp" id="rnMin" type="number" value="1" inputmode="numeric"></div>' +
      '<div class="res-card"><div class="rc-lab">最大值</div><input class="inp" id="rnMax" type="number" value="100" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">个数（1–1000）</span>' +
      '<input class="inp" id="rnCount" type="number" min="1" max="1000" value="5" inputmode="numeric"></div>' +
      '<label class="check-row"><input type="checkbox" id="rnUnique" checked>不重复抽取</label>' +
      '<button class="btn btn-main" id="rnGo" type="button">生成</button>' +
      '<p class="tip-err" id="rnErr" hidden></p>' +
      '<div class="tool-sec"><span class="tool-lab">结果</span>' +
      '<div class="big-out" id="rnOut">—</div></div>' +
      '<button class="btn btn-ghost" id="rnCopy" type="button">复制结果</button>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#rnGo', root).addEventListener('click', run);
    $('#rnCopy', root).addEventListener('click', () => {
      if (!lastResult.length) { LB.toast('请先生成', 'info'); return; }
      LB.copyWithToast(lastResult.join('、'));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    run(); /* 默认参数先出一版 */
  }

  function unmount() { rootEl = null; lastResult = []; }

  LB.router.register('randomnum', { mount, unmount });
  /* 注册表内「随机数生成」的 id 是 rand，注册别名指向同一模块 */
  LB.router.register('rand', { mount, unmount });
})();
