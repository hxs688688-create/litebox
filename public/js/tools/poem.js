/* LiteBox v5 · tools/poem.js — 古诗词查询（搜索 × 作者 chip 筛选 + 随机一首，按需加载诗库） */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  let rootEl = null;
  let poems = null;
  const CHIPS = ['全部', '李白', '杜甫', '苏轼', '王维', '杜牧', '白居易', '杨万里', '李清照'];
  let curChip = '全部';
  let randomOne = null; /* 随机模式：仅显示这一首 */

  /* 搜索词命中：题目 / 作者 / 正文 / 注释 */
  function hit(p, q) {
    if (!q) return true;
    return p.t.includes(q) || p.a.includes(q) || p.b.includes(q) || (p.n && p.n.includes(q));
  }

  function card(p) {
    return (
      '<article class="dict-card">' +
      '<header><h3>' + esc(p.t) + '</h3>' +
      '<span class="dc-meta">' + esc(p.d) + ' · ' + esc(p.a) + ' · ' + esc(p.c) + '</span></header>' +
      '<pre class="dc-body">' + esc(p.b) + '</pre>' +
      (p.n ? '<p class="dc-note">' + esc(p.n) + '</p>' : '') +
      '</article>'
    );
  }

  function render() {
    const q = $('#pmQ', rootEl).value.trim();
    let list = randomOne ? [randomOne] : poems.filter(p => (curChip === '全部' || p.a === curChip) && hit(p, q));
    const pmList = $('#pmList', rootEl);
    if (!list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(pmList, {
        icon: '📜',
        title: '没有找到匹配的诗词',
        sub: '换个关键词，或按作者筛选试试'
      });
    } else {
      pmList.innerHTML = list.map(card).join('');
    }
    $('#pmStat', rootEl).textContent = randomOne
      ? '随机：《' + randomOne.t + '》· ' + randomOne.a
      : '共 ' + list.length + ' 首';
    $('#pmStat', rootEl).className = 'jst' + (list.length ? ' ok' : ' err');
  }

  function ensureDict(runFn) {
    if (poems) { runFn(); return; }
    $('#pmStat', rootEl).textContent = '诗库加载中…';
    LB.dict.load('poems').then(d => {
      poems = d;
      runFn();
    }).catch(() => {
      $('#pmStat', rootEl).textContent = '⚠️ 诗库加载失败，请刷新重试';
      $('#pmStat', rootEl).className = 'jst err';
    });
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>古诗词查询</h1><p>中小学必背古诗词，按题目 / 作者 / 名句检索</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><input class="inp" id="pmQ" type="search" placeholder="搜索题目、作者、名句、注释…" /></div>' +
      '<div class="chip-bar" id="pmChips">' +
      CHIPS.map((c, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-a="' + c + '" type="button">' + c + '</button>').join('') +
      '</div>' +
      '<div id="pmList" class="dict-list"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="pmRand" type="button">🎲 随机来一首</button>' +
      '</div>' +
      '<div class="jst" id="pmStat">诗库加载中…</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#pmQ', root).addEventListener('input', () => { randomOne = null; ensureDict(render); });
    $('#pmChips', root).addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      curChip = b.dataset.a;
      $$('#pmChips .chip', root).forEach(x => x.classList.toggle('on', x === b));
      randomOne = null;
      ensureDict(render);
    });
    $('#pmRand', root).addEventListener('click', () => ensureDict(() => {
      randomOne = poems[Math.floor(Math.random() * poems.length)];
      render();
    }));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    ensureDict(render);
  }

  function unmount() { rootEl = null; poems = null; randomOne = null; curChip = '全部'; }

  LB.router.register('poem', { mount, unmount });
})();
