/* LiteBox v5 · tools/postcode.js — 邮编查询（省/市/区 → 邮政编码，纯本地数据）
 *
 * 【搜索为什么要分词匹配而不是字符串 includes】
 *   用户搜「北京 东城」时，中间的空格是分隔意图；
 *   搜「浦东」时又不该要求用户打全称。
 *   所以做法是：把查询串按空白切成若干词，每个词都要能在
 *   「省 + 市 + 区」的拼接串里找到（子串匹配，容忍用户只打一部分）。
 *   这样「北京东城」「北京 东城」「东城」三种写法都能命中。
 *
 * 【排序：完全匹配优先】
 *   搜「东城」时不该把「东城区」排在「南城区」后面才发现不匹配 ——
 *   完全包含查询词的结果排前面，部分匹配的排后面。
 *
 * 【复制必须用 LB.copyNow 同步调用】
 *   任务书「关键提醒」第1 条。copyNow 在 onclick 的同步栈里执行，
 *   不能 await、不能 setTimeout，否则用户手势过期、复制会静默失败。
 */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let data = [];
  let loaded = false;   /* 词库是否已加载成功 */
  let failed = false;   /* 加载失败（与「加载中」区分，否则两者都渲染成空列表） */

  function search(q) {
    const words = String(q).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hit = [];
    for (let i = 0; i < data.length; i++) {
      const it = data[i];
      /* ★ 匹配用「去掉空格的拼接串」，不是 '省 市 区' 带空格的形式。
         带空格时「北京东城」这种不带空格的输入永远匹配不上 ——
         '北京 北京 东城区'.indexOf('北京东城') 是 -1（省市之间夹着空格），
         而用户就是这么打字的。去掉空格后 '北京北京东城区'.includes('北京东城') 成立。 */
      const hay = (it.p + it.c + it.d).replace(/\s/g, '').toLowerCase();
      /* 每个词都要在拼接串里出现 */
      let all = true;
      for (let w = 0; w < words.length; w++) {
        if (hay.indexOf(words[w]) < 0) { all = false; break; }
      }
      if (!all) continue;
      /* 打分：完全等于查询串的排最前，其次按拼接串短的排前面 */
      const joined = it.p + it.c + it.d;
      const exact = joined === words.join('') ? 1000 : 0;
      hit.push({ it: it, score: exact - hay.length });
    }
    hit.sort((a, b) => b.score - a.score);
    /* 上限 80条：一次渲染上千行会明显卡顿 */
    return hit.slice(0, 80).map(x => x.it);
  }

  /* mode:'loading' | 'failed' | 'idle' | 'none' | 'hit'
     ★ 必须把「还没输入」和「输入了但没匹配到」分开：
       两者都是 list 为空，但语义完全相反 ——
       前者是正常初始态（该提示有多少数据、引导怎么搜），
       后者才是真正的「没找到」。混成一个提示会让用户以为数据坏了。 */
  function render(list, mode) {
    const box = $('#pcList', rootEl);
    const tip = $('#pcTip', rootEl);
    if (mode === 'loading') {
      box.innerHTML = '<p class="cd-note">正在加载邮编库…</p>';
      tip.textContent = '';
      return;
    }
    if (mode === 'failed') {
      box.innerHTML = '<p class="cd-note">邮编库加载失败，请刷新重试。</p>';
      tip.textContent = '';
      return;
    }
    if (mode === 'idle') {
      tip.textContent = '邮编库共 ' + data.length + ' 条数据';
      box.innerHTML = '<p class="cd-note">输入关键词开始查询，例如「北京 东城」「浦东」「杭州 西湖」。' +
        '支持只输入部分名称，命中结果按匹配度排序。</p>';
      return;
    }
    if (mode === 'none') {
      tip.textContent = '邮编库共 ' + data.length + ' 条数据 · 匹配 0 条';
      box.innerHTML = '<p class="cd-note">没找到匹配的区县。试试只输入「北京」「浦东」这样的关键词。</p>';
      return;
    }
    tip.textContent = '共 ' + data.length + ' 条数据 · 匹配 ' + list.length + ' 条' + (list.length >= 80 ? '（仅显示前 80）' : '');
    box.innerHTML = list.map(it =>
      '<div class="res-card pc-item" data-code="' + it.code + '">' +
      '<div class="pc-place"><span class="pc-p">' + LB.dom.esc(it.p) + '</span>' +
      '<span class="pc-c">' + LB.dom.esc(it.c) + '</span>' +
      '<span class="pc-d">' + LB.dom.esc(it.d) + '</span></div>' +
      '<div class="pc-code mono">' + it.code + '</div>' +
      '<button class="pc-copy btn btn-ghost" type="button" data-code="' + it.code + '" ' +
      'aria-label="复制邮编 ' + it.code + '">📋 复制</button>' +
      '</div>').join('');
  }

  function onInput() {
    if (!loaded) return;
    const q = $('#pcIn', rootEl).value;
    if (!q.trim()) { render([], 'idle'); return; }
    const hit = search(q);
    render(hit, hit.length ? 'hit' : 'none');
  }

  function copyCode(code, btn) {
    /* ★ 必须同步调用：不能 await、不能包 setTimeout */
    const okc = LB.copyNow(code, '邮编 ' + code + ' 已复制');
    if (!okc) LB.toast('复制失败，请长按邮编手动复制', 'err');
    else if (btn) {
      const old = btn.textContent;
      btn.textContent = '✓ 已复制';
      setTimeout(() => { btn.textContent = old; }, 1200);
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>邮编查询</h1><p>输入省市或区县名，查邮政编码，本地数据不上传</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="pc-bar">' +
      '<input class="inp" id="pcIn" type="search" placeholder="如：北京 东城 / 浦东 / 杭州西湖" aria-label="搜索省市或区县">' +
      '<button class="btn btn-main js-primary-submit" id="pcGo" type="button">查询</button>' +
      '</div>' +
      '<p class="cd-note" id="pcTip"></p>' +
      '<div class="pc-list" id="pcList"></div>' +
      '<p class="cd-note">邮编库共收录大陆各省市主要区县，可在上面输入关键词查询。' +
      '结果仅供参考，邮政业务请以官方公布为准。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    failed = false;
    render([], 'loading');

    $('#pcIn', root).addEventListener('input', onInput);
    /*主按钮：与input 的实时搜索等价，供 Ctrl+Enter 与鼠标点击走同一条路径 */
    $('#pcGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; onInput(); });
    $('#pcList', root).addEventListener('click', e => {
      const b = e.target.closest('.pc-copy');
      if (b) { copyCode(b.dataset.code, b); return; }
    });
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });

    if (!loaded) {
      LB.dict.load('postcodes')
        .then(d => {
          if (!rootEl) return;                /* 用户已切走 */
          data = Array.isArray(d) ? d : [];
          loaded = true;
          failed = false;
          /* 挂载时若已经输入了内容，直接出结果 */
          onInput();
          if (!data.length) { failed = true; render([], 'failed'); }
        })
        .catch(() => {
          if (!rootEl) return;
          loaded = true;
          failed = true;
          render([], 'failed');
          LB.toast('邮编库加载失败', 'err');
        });
    } else {
      onInput();
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('postcode', { mount, unmount });
})();
