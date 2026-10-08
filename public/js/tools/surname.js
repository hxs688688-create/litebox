/* LiteBox v5 · tools/surname.js — 百家姓查询（姓氏 / 拼音 / 首字母搜索，点击复制，纯本地） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  /* 带声调字母 → 无声调（用于拼音匹配） */
  const TONE = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e', 'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o', 'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v' };
  const detone = p => p.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, c => TONE[c]);

  let rootEl = null;
  let db = null;

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>百家姓</h1><p>按传统《百家姓》序位查询，支持拼音与首字母</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec">' +
      '<input class="inp" id="snQ" maxlength="20" placeholder="输入姓氏 / 拼音 / 首字母，如：王、wang、w" />' +
      '<small class="sn-count" id="snCount"></small>' +
      '<div class="sn-grid" id="snGrid"></div>' +
      '</div>' +
      '</div>'
    );
  }

  /* 匹配规则：s 包含 kw；p（去声调后）包含 kw；去声调拼音首字母 === kw */
  function match(x, kw) {
    if (!kw) return true;
    const dp = detone(x.p);
    return x.s.indexOf(kw) > -1 || dp.indexOf(kw) > -1 || dp.charAt(0) === kw;
  }

  function render() {
    const kw = $('#snQ', rootEl).value.trim().toLowerCase();
    const list = db.filter(x => match(x, kw));
    $('#snCount', rootEl).textContent = kw ? '命中 ' + list.length + ' 个姓氏' : '共收录 ' + db.length + ' 个姓氏（传统《百家姓》序）';
    const grid = $('#snGrid', rootEl);
    if (!list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(grid, {
        icon: '🖌️',
        title: '没有找到匹配的姓氏',
        sub: '试试只输入姓氏里的一个字'
      });
      return;
    }
    grid.innerHTML = list.map(x =>
      '<button class="sn-card" type="button" data-s="' + esc(x.s) + '" aria-label="查询' + esc(x.s) + '姓">' +
      '<b>' + esc(x.s) + '</b>' +
      '<small>' + esc(x.p) + '</small>' +
      '<span>百家姓第 ' + x.r + ' 位</span>' +
      '</button>'
    ).join('');
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#snQ', root).addEventListener('input', render);
    $('#snGrid', root).addEventListener('click', e => {
      const card = e.target.closest('[data-s]');
      if (!card) return;
      const x = db.find(y => y.s === card.dataset.s);
      if (!x) return;
      LB.copyWithToast(x.s + '（' + x.p + '）· 百家姓第 ' + x.r + ' 位', '已复制「' + x.s + '」信息');
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.dict.load('surnames')
      .then(d => { db = d; render(); })
      .catch(() => LB.toast('姓氏数据加载失败', 'err'));
  }

  function unmount() { rootEl = null; }

  LB.router.register('surname', { mount, unmount });
})();
