/* LiteBox v5 · tools/brainteaser.js — 脑筋急转弯（Step 18）
 *
 * 【数据】vendor/dict/brainteasers.js（LB.dict.load('brainteasers')），
 *   第一批内置 50 条，追加批次直接补数组，本工具零改动。
 *
 * 【交互】大卡片先出题后看答案（避免一进来就被剧透）；上一题 / 下一题
 *   顺序翻；「随机一题」只在没看过的题里抽，全部看完自动清空 seen
 *   开启新一轮（保证随机基本不重复）。
 *
 * 【进度】litebox_brainteaser_seen = [题号…]（JSON 数组，LB.storage）。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  const KEY_SEEN = 'litebox_brainteaser_seen';
  let rootEl = null;
  let alive = false;
  let list = [];
  let idx = 0;
  let shown = false;        /* 当前题是否已亮答案 */
  let seen = new Set();

  function saveSeen() {
    LB.storage.set(KEY_SEEN, Array.from(seen));
  }

  function pickUnseen() {
    const rest = [];
    for (let i = 0; i < list.length; i++) if (!seen.has(i)) rest.push(i);
    if (!rest.length) {           /* 一轮看完：清空重新开始 */
      seen.clear();
      saveSeen();
      return LB.rng.int(0, list.length - 1);
    }
    return rest[LB.rng.int(0, rest.length - 1)];
  }

  function render() {
    const card = $('#btCard', rootEl);
    const it = list[idx];
    if (!card || !it) return;
    $('#btQ', rootEl).innerHTML = esc(it.q);
    $('#btA', rootEl).innerHTML = esc(it.a);
    const ans = $('#btAnswer', rootEl);
    ans.hidden = !shown;
    $('#btReveal', rootEl).hidden = shown;
    const cnt = $('#btCount', rootEl);
    if (cnt) cnt.textContent = '已看 ' + seen.size + ' 题 / 共 ' + list.length + ' 题';
    const pos = $('#btPos', rootEl);
    if (pos) pos.textContent = '第 ' + (idx + 1) + ' 题';
    card.classList.remove('bt-pop');
    void card.offsetWidth;
    card.classList.add('bt-pop');
  }

  function go(delta) {
    if (!list.length) return;
    idx = (idx + delta + list.length) % list.length;
    shown = seen.has(idx);        /* 看过的题直接亮答案，没看过先藏住 */
    if (shown) seen.add(idx);
    render();
  }

  function randomOne() {
    if (!list.length) return;
    idx = pickUnseen();
    shown = false;
    seen.add(idx);
    saveSeen();
    render();
  }

  function reveal() {
    shown = true;
    if (!seen.has(idx)) { seen.add(idx); saveSeen(); }
    render();
  }

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>脑筋急转弯</h1><p>先自己想，再看答案；随机一题只出没看过的</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="bt-card" id="btCard">' +
      '<span class="bt-pos" id="btPos">第 1 题</span>' +
      '<p class="bt-q" id="btQ">加载中…</p>' +
      '<div class="bt-answer" id="btAnswer" hidden><span class="bt-a-lab">答案</span><b id="btA"></b></div>' +
      '<p class="bt-count" id="btCount"></p>' +
      '</div>' +
      '<button class="btn btn-main" id="btReveal" type="button">👀 看答案</button>' +
      '<div class="bt-btns">' +
      '<button class="btn btn-ghost" id="btPrev" type="button">← 上一题</button>' +
      '<button class="btn btn-ghost" id="btRandom" type="button">🎲 随机一题</button>' +
      '<button class="btn btn-ghost" id="btNext" type="button">下一题 →</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">「随机一题」只在没看过的题里抽；一轮全部看完后自动开启新一轮。</p>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    shown = false;
    idx = 0;
    root.innerHTML = html();

    const raw = LB.storage.get(KEY_SEEN, []);
    seen = new Set(Array.isArray(raw) ? raw.filter(n => Number.isInteger(n) && n >= 0) : []);

    LB.dict.load('brainteasers').then(d => {
      if (!alive) return;
      list = Array.isArray(d) ? d : [];
      if (!list.length) {
        LB.ui.empty($('#btCard', rootEl), { icon: '🤔', title: '题库是空的', sub: '等下一批题目更新吧' });
        $('#btReveal', rootEl).disabled = true;
        return;
      }
      render();
    }).catch(() => {
      if (!alive) return;
      LB.ui.empty($('#btCard', rootEl), { icon: '⚠️', title: '题库加载失败', sub: '请检查网络后重进本工具' });
    });

    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { LB.hash.go('home'); return; }
      if (e.target.closest('#btReveal')) reveal();
      else if (e.target.closest('#btPrev')) go(-1);
      else if (e.target.closest('#btNext')) go(1);
      else if (e.target.closest('#btRandom')) randomOne();
    });
  }

  function unmount() {
    alive = false;
    rootEl = null;
    list = [];
    seen = new Set();
  }

  LB.router.register('brainteaser', { mount, unmount });
})();
