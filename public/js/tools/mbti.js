/* LiteBox v5 · tools/mbti.js — MBTI 人格测试（12 题 / 16 型，纯本地无存储） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  /* 12 道题（每题一个维度：选 A 记左字母 E/S/T/J，选 B 记右字母 I/N/F/P） */
  const questions = [
    { dim: 'EI', text: '参加完一场热闹聚会后，你通常…', a: '感觉精力充沛，想继续聊', b: '感觉疲惫，想独处休息' },
    { dim: 'EI', text: '面对新环境，你更倾向于…', a: '主动打招呼、快速融入', b: '先观察、等别人来找你' },
    { dim: 'EI', text: '思考问题时，你更喜欢…', a: '边说边想，与人讨论', b: '先在心里想清楚再说' },
    { dim: 'SN', text: '接收信息时，你更信任…', a: '亲眼所见的具体事实', b: '直觉与整体感觉' },
    { dim: 'SN', text: '看一部电影后，你更容易记住…', a: '具体情节和画面细节', b: '电影给你的整体感受与隐喻' },
    { dim: 'SN', text: '做计划时，你更关注…', a: '眼前的可行步骤', b: '未来的各种可能性' },
    { dim: 'TF', text: '朋友向你倾诉烦恼时，你首先…', a: '帮他分析问题、找解决办法', b: '安慰他的情绪、表达共情' },
    { dim: 'TF', text: '做决定时，你更看重…', a: '逻辑与客观标准', b: '人情与个人价值观' },
    { dim: 'TF', text: '被批评时，你更容易…', a: '冷静想是否有道理', b: '先感到受伤，再理性分析' },
    { dim: 'JP', text: '你的日常更倾向于…', a: '提前安排、按计划执行', b: '随机应变、留有弹性' },
    { dim: 'JP', text: '面对未完成的任务，你…', a: '感到焦虑，想尽快做完', b: '能接受拖一拖，状态好时再做' },
    { dim: 'JP', text: '旅行时你更倾向于…', a: '提前订好行程与住宿', b: '到了再看、随遇而安' }
  ];

  /* 16 型描述表 */
  const types = {
    INTJ: ['建筑师', '独立思考、长远规划，善于把复杂问题系统化，倾向独自深耕。'],
    INTP: ['逻辑学家', '好奇、爱分析，喜欢探讨原理与可能性，对事物有独特视角。'],
    ENTJ: ['指挥官', '果断、有领导力，善于组织和推动目标落地。'],
    ENTP: ['辩论家', '思维敏捷、喜欢挑战常规，乐于探索新点子。'],
    INFJ: ['提倡者', '有理想、洞察人心，关注意义感与帮助他人。'],
    INFP: ['调停者', '温和、有内在价值体系，敏感细腻，追求真实。'],
    ENFJ: ['主人公', '善于感召他人，热心且有组织力，重视和谐。'],
    ENFP: ['竞选者', '热情、富有想象力，善于连接人与机会。'],
    ISTJ: ['物流师', '踏实、严谨，重视责任与秩序，可靠稳重。'],
    ISFJ: ['守卫者', '温和、细心，默默承担，重视承诺与人际关系。'],
    ESTJ: ['总经理', '务实、高效，善于建立规则并推动执行。'],
    ESFJ: ['执政官', '热心、照顾他人，善于营造温暖氛围。'],
    ISTP: ['鉴赏家', '冷静、动手能力强，喜欢拆解问题和实操。'],
    ISFP: ['探险家', '安静、审美好，活在当下，追求自由表达。'],
    ESTP: ['企业家', '精力充沛、善于应变，喜欢直接行动。'],
    ESFP: ['表演者', '活泼、感染力强，享受当下与人群。']
  };

  const DIMS = [
    { k: 'EI', a: 'E', b: 'I', an: '外向', bn: '内向' },
    { k: 'SN', a: 'S', b: 'N', an: '实感', bn: '直觉' },
    { k: 'TF', a: 'T', b: 'F', an: '思考', bn: '情感' },
    { k: 'JP', a: 'J', b: 'P', an: '判断', bn: '知觉' }
  ];

  let rootEl = null;
  let idx = 0;
  let answers = []; /* 'a' | 'b' | null */

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>MBTI 人格测试</h1><p>12 道题快测四维倾向，结果仅供娱乐参考</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="mbQuiz">' +
      '<div class="mb-top">' +
      '<div class="mb-bar"><i id="mbBarFill"></i></div>' +
      '<small id="mbStep">第 1 / 12 题</small>' +
      '</div>' +
      '<div class="card tool-sec">' +
      '<div class="mb-q" id="mbQ"></div>' +
      '<button class="mb-opt" id="mbA" type="button"></button>' +
      '<button class="mb-opt" id="mbB" type="button"></button>' +
      '</div>' +
      '<div class="mb-nav">' +
      '<button class="btn btn-ghost btn-sm" id="mbPrev" type="button">← 上一题</button>' +
      '<button class="btn btn-main" id="mbNext" type="button">下一题 →</button>' +
      '</div>' +
      '</div>' +
      '<div id="mbResult" hidden></div>' +
      '</div>'
    );
  }

  function renderQ() {
    const q = questions[idx];
    const answered = answers.filter(Boolean).length;
    $('#mbStep', rootEl).textContent = '第 ' + (idx + 1) + ' / ' + questions.length + ' 题';
    $('#mbBarFill', rootEl).style.width = (answered / questions.length * 100) + '%';
    $('#mbQ', rootEl).textContent = q.text;
    const a = $('#mbA', rootEl), b = $('#mbB', rootEl);
    a.textContent = 'A · ' + q.a;
    b.textContent = 'B · ' + q.b;
    a.classList.toggle('on', answers[idx] === 'a');
    b.classList.toggle('on', answers[idx] === 'b');
    const next = $('#mbNext', rootEl);
    next.disabled = !answers[idx];
    next.textContent = idx === questions.length - 1 ? '查看结果 🎉' : '下一题 →';
    $('#mbPrev', rootEl).disabled = idx === 0;
  }

  function showResult() {
    /* 每维 A 选择数（0-3），多数者定字母——无随机成分 */
    const cnt = { EI: 0, SN: 0, TF: 0, JP: 0 };
    questions.forEach((q, i) => { if (answers[i] === 'a') cnt[q.dim]++; });
    const type = DIMS.map(d => (cnt[d.k] >= 2 ? d.a : d.b)).join('');
    const info = types[type] || ['未知', ''];
    const desc = info[1];

    const rows = DIMS.map(d => {
      const aPct = Math.round(cnt[d.k] / 3 * 100);
      const bPct = 100 - aPct;
      return (
        '<div class="mb-dim">' +
        '<div class="mb-dim-hd"><b>' + d.a + ' · ' + d.an + '</b><span class="mb-dim-pcts"><i>' + aPct + '%</i><i>' + bPct + '%</i></span><b>' + d.bn + ' · ' + d.b + '</b></div>' +
        '<div class="mb-dim-bar"><i class="l" id="mbDim' + d.k + '"></i></div>' +
        '</div>'
      );
    }).join('');

    const quiz = $('#mbQuiz', rootEl);
    const res = $('#mbResult', rootEl);
    res.innerHTML =
      '<div class="card tool-sec mb-res-card">' +
      '<div class="mb-type">' + type + '</div>' +
      '<div class="mb-tname">' + info[0] + '</div>' +
      '<p class="mb-tdesc">' + desc + '</p>' +
      '</div>' +
      '<div class="card tool-sec mb-dims">' + rows + '</div>' +
      '<div class="mb-nav"><button class="btn btn-main" id="mbRetry" type="button">🔄 重新测试</button></div>';
    quiz.hidden = true;
    res.hidden = false;

    /* 维度条宽度（DOM API，左段 = A 选项占比） */
    DIMS.forEach(d => {
      const el = $('#mbDim' + d.k, rootEl);
      if (el) el.style.width = Math.round(cnt[d.k] / 3 * 100) + '%';
    });

    $('#mbRetry', rootEl).addEventListener('click', retry);
  }

  function retry() {
    idx = 0;
    answers = [];
    $('#mbResult', rootEl).hidden = true;
    $('#mbQuiz', rootEl).hidden = false;
    renderQ();
  }

  function mount(root) {
    rootEl = root;
    idx = 0;
    answers = [];
    root.innerHTML = html();
    $('#mbA', root).addEventListener('click', () => { answers[idx] = 'a'; renderQ(); });
    $('#mbB', root).addEventListener('click', () => { answers[idx] = 'b'; renderQ(); });
    $('#mbNext', root).addEventListener('click', () => {
      if (!answers[idx]) return;
      if (idx < questions.length - 1) { idx++; renderQ(); }
      else showResult();
    });
    $('#mbPrev', root).addEventListener('click', () => {
      if (idx > 0) { idx--; renderQ(); }
    });
    renderQ();
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('mbti', { mount, unmount });
})();
