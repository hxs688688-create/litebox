/* LiteBox v5 · tools/idiom.js — 成语查询（搜索 + 随机一个，按需加载成语库） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  let rootEl = null;
  let idioms = null;
  let randomOne = null; /* 随机模式：仅显示这一条 */

  /* 搜索词命中：成语 / 拼音 / 释义 / 例句 */
  function hit(it, q) {
    if (!q) return true;
    return it.w.includes(q) || it.p.includes(q) || it.m.includes(q) || (it.s && it.s.includes(q));
  }

  function card(it) {
    return (
      '<article class="dict-card">' +
      '<header><h3>' + esc(it.w) + '</h3>' +
      '<span class="dc-meta">' + esc(it.p) + '</span></header>' +
      '<p class="dc-body"><b>释义</b>' + esc(it.m) + '</p>' +
      (it.s ? '<p class="dc-body"><b>例句</b>' + esc(it.s) + '</p>' : '') +
      (it.syn ? '<p class="dc-note"><b>近义</b>' + esc(it.syn) + '</p>' : '') +
      '</article>'
    );
  }

  function render() {
    const q = $('#idQ', rootEl).value.trim();
    const list = randomOne ? [randomOne] : idioms.filter(it => hit(it, q));
    const idList = $('#idList', rootEl);
    if (!list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(idList, {
        icon: '🀄',
        title: '没有找到匹配的成语',
        sub: '换个关键词，或点「随机一条」看看'
      });
    } else {
      idList.innerHTML = list.map(card).join('');
    }
    $('#idStat', rootEl).textContent = randomOne
      ? '随机：' + randomOne.w
      : '共 ' + list.length + ' 条';
    $('#idStat', rootEl).className = 'jst' + (list.length ? ' ok' : ' err');
  }

  function ensureDict(runFn) {
    if (idioms) { runFn(); return; }
    $('#idStat', rootEl).textContent = '成语库加载中…';
    LB.dict.load('idioms').then(d => {
      idioms = d;
      runFn();
    }).catch(() => {
      $('#idStat', rootEl).textContent = '⚠️ 成语库加载失败，请刷新重试';
      $('#idStat', rootEl).className = 'jst err';
    });
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>成语查询</h1><p>常用成语释义 / 拼音 / 例句 / 近义，支持随机抽查</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tool-sec"><input class="inp" id="idQ" type="search" placeholder="搜索成语、拼音、释义、例句…" /></div>' +
      '<div id="idList" class="dict-list"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main" id="idRand" type="button">🎲 随机来一个</button>' +
      '</div>' +
      '<div class="jst" id="idStat">成语库加载中…</div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#idQ', root).addEventListener('input', () => { randomOne = null; ensureDict(render); });
    $('#idRand', root).addEventListener('click', () => ensureDict(() => {
      randomOne = idioms[Math.floor(Math.random() * idioms.length)];
      render();
    }));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    ensureDict(render);
  }

  function unmount() { rootEl = null; idioms = null; randomOne = null; }

  LB.router.register('idiom', { mount, unmount });
})();
