/* LiteBox v5 · tools/truth_dare.js — 真心话大冒险（Step 13 · B5 从 party 拆出）
 *
 * 【题库扩充到各 50 条】原有 15 条全部保留在数组开头（顺序不变，
 *   老用户抽到的题还是那些），后面补足到 50 条。题目基调一致：
 *   轻量、可跳过、不涉及隐私拷问与饮酒惩罚 —— 聚会上谁都能接得住。
 *
 * 【抽题不重复的方式】
 *   原实现只记「上一题」（lastTruth / lastDare），避免连续两次同题。
 *   题库扩到 50 条后仍然沿用这个策略：50 条随机抽，重复感已经很低，
 *   再维护一个「已抽完」队列反而会在几十局后出现「题都抽完了」的空档。
 *
 * 【真心话 / 大冒险切换】
 *   原来是靠一个「切换」按钮在两种玩法间跳，拆成独立工具后用 .seg 两段
 *   控件更直观（复用 components.css 的 .seg，窄屏 5 个字也不会折行）。
 *
 * 【随机一律走 LB.rng】加密级随机，禁 Math.random。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  const TRUTH = [
    '你最近一次真正开心是什么时候？',
    '手机里最舍不得删的一张照片是什么？',
    '你最想立刻学会的一项技能是什么？',
    '今年最想完成的一件事是什么？',
    '在场谁最适合和你一起旅行？',
    '你最近偷偷期待的一件事是什么？',
    '你做过最冲动的一件事是什么？',
    '说一个别人很难发现的小习惯。',
    '最近一次哭是因为什么？',
    '你最想重来的一段时光是什么？',
    '如果明天不用上学/上班，你最想做什么？',
    '你最欣赏朋友身上的哪个优点？',
    '你最近循环最多的一首歌是什么？',
    '你有没有偷偷羡慕过在场的人？为什么？',
    '你最想对一年前的自己说一句什么？',
    '你手机相册里最多的是哪一类照片？',
    '最近一次撒谎是什么时候，说了什么？',
    '你有什么别人觉得奇怪、但你很享受的习惯？',
    '如果能实现一个超能力，你想要什么？',
    '你最怕别人发现你其实不懂什么？',
    '上一次被人误会，是因为什么事？',
    '你觉得自己最大的优点是什么？有证据吗？',
    '你最想感谢的一个人是谁，为什么没说出口？',
    '你偷偷关注过在场谁的社交账号？',
    '有没有一句别人夸你的话，你记到现在？',
    '你最近一次熬夜是在干什么？',
    '你最舍不得丢掉的一件旧东西是什么？',
    '你觉得自己哪方面最像家里人？',
    '如果人生能重启一次职业，你会选什么？',
    '你最不喜欢自己哪一点，试过改吗？',
    '上一次被人夸，你当时心里怎么想的？',
    '你最想和在场谁单独吃顿饭？',
    '你有没有偷偷给谁写过消息又删掉？',
    '你最近一次说「我没事」其实有事，是什么时候？',
    '你最想改掉的一个口头禅是什么？',
    '如果只剩最后一天，你最想和谁一起过？',
    '你觉得十年后的自己会变成什么样的人？',
    '你最尴尬的一次「拍马屁拍到马腿上」经历？',
    '你有什么一直想买但没买的东西？',
    '你最讨厌哪种聚会环节？',
    '上一次你觉得被理解，是在什么场合？',
    '你有一个从没告诉别人的小成就是什么？',
    '你最想向谁道歉，但一直没开口？',
    '你觉得自己最容易被误解的地方是什么？',
    '你最近一次紧张是什么时候，因为什么？',
    '如果你的生活是一部电影，片名会是什么？',
    '你最想对现在的自己说的一句提醒是什么？',
    '你有什么「其实没什么用但很快乐」的小爱好？',
    '你最想和谁交换一天人生？',
    '你最珍贵的一段回忆是什么？'
  ];

  const DARE = [
    '用方言介绍自己 20 秒。',
    '模仿一个熟悉的人物让大家猜。',
    '闭眼画一个表情让大家猜。',
    '用三个表情讲一个完整故事。',
    '给在场任意一人说出一个真诚优点。',
    '连续做 5 个夸张表情。',
    '用播音腔读一段公开内容。',
    '讲一个 30 秒冷笑话。',
    '用最萌的语气说一句最严肃的话。',
    '给左/右的人唱一句歌。',
    '闭眼指一个人，说出他最好的一个特点。',
    '用身体摆出一个字母。',
    '做 10 个开合跳。',
    '用英语说 3 句话介绍自己。',
    '模仿一个动物叫声，让大家猜。',
    '学机器人说话，直到下一轮结束。',
    '用三句话夸右边的人，不能重复用词。',
    '让左边的人帮你整理一次头发。',
    '背一段课文或歌词，让大家猜出处。',
    '做 5 个深蹲，同时数出来。',
    '用「特别开心」的语气念一遍购物清单。',
    '和大家玩一局石头剪刀布，输了再来一次。',
    '把手机壁纸给大家看 3 秒。',
    '用 20 秒讲清楚你最近在忙什么。',
    '模仿在场另一个人的坐姿，让人猜是谁。',
    '说一句只有你家人懂的口头禅并解释。',
    '用筷子夹弹珠，10 秒内夹起 3 颗。',
    '闭眼在纸上写下左边人的名字。',
    '把最近一次搜索记录念出来一条。',
    '用说唱的方式点一份外卖。',
    '给手机里的一位好友发一个表情包。',
    '用一分钟给大家讲一个你最喜欢的冷知识。',
    '把外套反穿直到下一轮。',
    '用左手写自己的名字，写完给大家看。',
    '让右边的人给你出一个下一轮的题目。',
    '连续说 5 个含「月」字的成语。',
    '表演一段无声电影里的惊喜表情。',
    '用三句话介绍今天的自己是什么天气。',
    '做一个自认为最好看的姿势并保持 5 秒。',
    '唱两句儿歌，跑调也要唱完。',
    '说一件今天发生的、让你笑出来的小事。',
    '让在场任意一人问你一个问题，必须立刻回答。',
    '用 10 秒记住桌上 5 样东西并背出来。',
    '把你的微信状态改成别人定的一句话。',
    '假装接受采访，回答「你最想感谢谁」。',
    '用气音说一段话，让大家猜内容。',
    '描述你心中的完美周末，限时 40 秒。',
    '和对面的人击掌三次并说「你今天真好看」。',
    '用身体比划一个成语让大家猜。',
    '选一个人，认真地对他说一句谢谢。'
  ];

  let rootEl = null;
  let alive = false;
  let kind = 'truth';
  let lastTruth = -1;
  let lastDare = -1;

  function pop(el) {
    if (!el) return;
    el.classList.remove('pt-pop');
    void el.offsetWidth;
    el.classList.add('pt-pop');
  }

  function drawQ() {
    const bank = kind === 'truth' ? TRUTH : DARE;
    const last = kind === 'truth' ? lastTruth : lastDare;
    let i;
    do { i = LB.rng.int(0, bank.length - 1); } while (bank.length > 1 && i === last);
    if (kind === 'truth') lastTruth = i; else lastDare = i;
    const el = $('#tdQText', rootEl);
    if (el) el.textContent = bank[i];
    pop($('#tdQ', rootEl));
    const cnt = $('#tdCount', rootEl);
    if (cnt) cnt.textContent = parseInt(cnt.textContent, 10) + 1;
  }

  function setKind(k) {
    if (k !== 'truth' && k !== 'dare') return;
    kind = k;
    $$('.seg > button', rootEl).forEach(b => b.classList.toggle('on', b.dataset.kind === k));
    const intro = $('#tdQText', rootEl);
    if (intro) {
      intro.textContent = k === 'truth'
        ? '点「抽一题」，诚实回答就好'
        : '点「抽一题」，勇敢接受挑战';
    }
    const btn = $('#tdDraw', rootEl);
    if (btn) btn.textContent = k === 'truth' ? '💬 抽一题' : '⚡ 抽一题';
  }

  function html() {
    return '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>真心话大冒险</h1><p>各 50 道题为一款，抽到哪题就说哪题</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="seg" id="tdSeg" role="group" aria-label="玩法切换">' +
      '<button type="button" class="on" data-kind="truth">💬 真心话</button>' +
      '<button type="button" data-kind="dare">⚡ 大冒险</button>' +
      '</div>' +
      '<div class="pt-qcard" id="tdQ"><p class="pt-q-text" id="tdQText">点「抽一题」，诚实回答就好</p></div>' +
      '<div class="pt-btns">' +
      '<button class="btn btn-main js-primary-submit" id="tdDraw" type="button">💬 抽一题</button>' +
      '<button class="btn btn-ghost" data-act="draw" type="button">🔥 换一个</button>' +
      '</div>' +
      '<p class="cd-note">本次已抽 <b id="tdCount">0</b> 题，连续两题不会重复。</p>' +
      '</div>' +
      '<p class="cd-note">所有题目都按「可以跳过」的原则设计，不强制饮酒、不涉及隐私拷问；不想答就换一个人抽。</p>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    kind = 'truth';
    lastTruth = -1;
    lastDare = -1;
    root.innerHTML = html();

    $('#tdSeg', root).addEventListener('click', e => {
      const b = e.target.closest('[data-kind]');
      if (b) setKind(b.dataset.kind);
    });
    $('#tdDraw', root).addEventListener('click', drawQ);
    root.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'draw') { drawQ(); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() {
    alive = false;
    rootEl = null;
  }

  LB.router.register('truth_dare', { mount, unmount });
})();
