/* LiteBox v5 · tools/group.js — 课堂随机分组（LB.rng 洗牌，分成 N 组 / 每组 N 人双模式） */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  let rootEl = null;
  let mode = 'count'; /* count: 分成 N 组 | size: 每组 N 人 */

  /* 解析名单：按行 split + trim + 过滤空 */
  function parse(text) {
    return text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }

  function setMode(v) {
    mode = v;
    $$('#grSeg .seg-btn', rootEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const num = $('#grNum', rootEl);
    if (v === 'count') {
      $('#grNumLab', rootEl).textContent = '组数（2–20）';
      num.value = 4;
      num.min = 2; num.max = 20;
    } else {
      $('#grNumLab', rootEl).textContent = '每组人数（2–30）';
      num.value = 5;
      num.min = 2; num.max = 30;
    }
  }

  function run() {
    const names = parse($('#grText', rootEl).value);
    if (names.length < 2) { LB.toast('请输入至少 2 个名字', 'info'); return; }

    const shuffled = LB.rng.shuffle(names.slice());
    const raw = parseInt($('#grNum', rootEl).value, 10) || 0;
    let groups = [];

    if (mode === 'count') {
      const n = Math.min(20, Math.max(2, raw, Math.min(2, shuffled.length)));
      const k = Math.min(n, shuffled.length); /* 组数不超过人数，避免空组 */
      for (let i = 0; i < k; i++) groups.push([]);
      shuffled.forEach((name, i) => groups[i % k].push(name)); /* 轮转均分，如 10 人 3 组 → 4/3/3 */
    } else {
      const n = Math.min(30, Math.max(2, raw));
      for (let i = 0; i < shuffled.length; i += n) groups.push(shuffled.slice(i, i + n));
    }

    $('#grGrid', rootEl).innerHTML = groups.map((g, i) =>
      '<div class="gp-card">' +
      '<h3>第 ' + (i + 1) + ' 组 · ' + g.length + ' 人</h3>' +
      g.map(m => '<div class="gp-mem">' + esc(m) + '</div>').join('') +
      '</div>'
    ).join('');
    LB.toast('已随机分组完成', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>课堂随机分组</h1><p>名单一键随机分成若干组，课堂活动、小组作业必备</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">名单（每行一个名字）</span>' +
      '<textarea class="inp mono-area" id="grText" rows="6" placeholder="张三&#10;李四&#10;王五&#10;赵六"></textarea>' +
      '<div class="seg" id="grSeg">' +
      '<button class="seg-btn on" data-v="count" type="button">分成 N 组</button>' +
      '<button class="seg-btn" data-v="size" type="button">每组 N 人</button>' +
      '</div>' +
      '<div class="gp-count-row">' +
      '<label class="pz-lab"><span id="grNumLab">组数（2–20）</span><input class="inp" id="grNum" type="number" min="2" max="20" value="4" /></label>' +
      '</div>' +
      '<button class="btn btn-main" id="grGo" type="button">🎲 开始随机分组</button>' +
      '</div>' +
      '<div class="gp-grid" id="grGrid"></div>' +
      '<p class="cd-note">分组由加密随机数洗牌决定，每人被分到的机会均等；每次点击都重新洗牌。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#grSeg', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) setMode(b.dataset.v);
    });
    $('#grGo', root).addEventListener('click', run);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('group', { mount, unmount });
})();
