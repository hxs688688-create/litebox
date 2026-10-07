/* LiteBox v5 · tools/relative.js — 亲戚关系计算器
   逐步组合关系链（如「爸爸的姐姐的儿子」），查表得出称呼。
   ★ 查找四步：去空格 → 按「的」拆分并拼回 → 查表 → 反向替换兜底。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  /* ================================================================
   * RELATION_MAP：key = 关系链（用「的」连接），value = { r: 称呼, d: 说明 }
   * 共 100+ 条，覆盖父系/母系/姻亲/堂表/长辈/同辈/晚辈/配偶/组合高频场景。
   * ================================================================ */
  const RELATION_MAP = {
    /* ---------- 父母 / 直系长辈 ---------- */
    '爸爸': { r: '爸爸', d: '父亲' },
    '爸爸的爸爸': { r: '爷爷', d: '父亲的父亲' },
    '爸爸的妈妈': { r: '奶奶', d: '父亲的母亲' },
    '爸爸的哥哥': { r: '伯父', d: '父亲的哥哥' },
    '爸爸的弟弟': { r: '叔父', d: '父亲的弟弟' },
    '爸爸的姐姐': { r: '姑姑', d: '父亲的姐姐' },
    '爸爸的妹妹': { r: '姑姑', d: '父亲的妹妹' },
    '爸爸的儿子': { r: '兄弟', d: '父亲的儿子（不含自己）' },
    '爸爸的女儿': { r: '姐妹', d: '父亲的女儿（不含自己）' },
    '爸爸的爸爸的儿子': { r: '叔叔 / 伯伯', d: '父亲的兄弟（按长幼）' },
    '爸爸的爸爸的女儿': { r: '姑姑', d: '父亲的姐妹' },
    '爸爸的妈妈的儿子': { r: '舅舅 / 姨丈', d: '父亲的舅舅（母亲那边的兄弟）' },
    '爸爸的妈妈的女儿': { r: '姨妈', d: '父亲的姨妈' },
    '妈妈': { r: '妈妈', d: '母亲' },
    '妈妈的爸爸': { r: '外公', d: '母亲的父亲' },
    '妈妈的妈妈': { r: '外婆', d: '母亲的母亲' },
    '妈妈的哥哥': { r: '舅舅', d: '母亲的哥哥' },
    '妈妈的弟弟': { r: '舅舅', d: '母亲的弟弟' },
    '妈妈的姐姐': { r: '姨妈', d: '母亲的姐姐' },
    '妈妈的妹妹': { r: '姨妈', d: '母亲的妹妹' },
    '妈妈的儿子': { r: '兄弟', d: '母亲的儿子（不含自己）' },
    '妈妈的女儿': { r: '姐妹', d: '母亲的女儿（不含自己）' },
    '妈妈的爸爸的儿子': { r: '舅舅 / 姨丈', d: '母亲的舅舅（按长幼）' },
    '妈妈的爸爸的女儿': { r: '姨妈 / 小姨', d: '母亲的姨妈' },
    '妈妈的妈妈的儿子': { r: '舅舅 / 姨丈', d: '母亲的舅舅' },
    '妈妈的妈妈的女儿': { r: '姨妈 / 小姨', d: '母亲的姨妈' },

    /* ---------- 兄弟姐妹 ---------- */
    '哥哥': { r: '哥哥', d: '同辈年长男' },
    '弟弟': { r: '弟弟', d: '同辈年幼男' },
    '姐姐': { r: '姐姐', d: '同辈年长女' },
    '妹妹': { r: '妹妹', d: '同辈年幼女' },
    '姐姐的丈夫': { r: '姐夫', d: '姐姐的配偶' },
    '妹妹的丈夫': { r: '妹夫', d: '妹妹的配偶' },
    '哥哥的妻子': { r: '嫂子', d: '哥哥的配偶' },
    '弟弟的妻子': { r: '弟媳', d: '弟弟的配偶' },
    '哥哥的孩子': { r: '侄子 / 侄女', d: '哥哥的子女' },
    '弟弟的孩子': { r: '侄子 / 侄女', d: '弟弟的子女' },
    '姐姐的孩子': { r: '外甥 / 外甥女', d: '姐姐的子女' },
    '妹妹的孩子': { r: '外甥 / 外甥女', d: '妹妹的子女' },

    /* ---------- 堂表亲（最常用组合） ---------- */
    '爸爸的哥哥的儿子': { r: '堂哥 / 堂弟', d: '伯父的儿子' },
    '爸爸的哥哥的女儿': { r: '堂姐 / 堂妹', d: '伯父的女儿' },
    '爸爸的弟弟的儿子': { r: '堂哥 / 堂弟', d: '叔父的儿子' },
    '爸爸的弟弟的女儿': { r: '堂姐 / 堂妹', d: '叔父的女儿' },
    '爸爸的姐姐的儿子': { r: '表哥 / 表弟', d: '姑姑的儿子' },
    '爸爸的姐姐的女儿': { r: '表姐 / 表妹', d: '姑姑的女儿' },
    '爸爸的妹妹的儿子': { r: '表哥 / 表弟', d: '姑姑的儿子' },
    '爸爸的妹妹的女儿': { r: '表姐 / 表妹', d: '姑姑的女儿' },
    '妈妈的哥哥的儿子': { r: '表哥 / 表弟', d: '舅舅的儿子' },
    '妈妈的哥哥的女儿': { r: '表姐 / 表妹', d: '舅舅的女儿' },
    '妈妈的弟弟的儿子': { r: '表哥 / 表弟', d: '舅舅的儿子' },
    '妈妈的弟弟的女儿': { r: '表姐 / 表妹', d: '舅舅的女儿' },
    '妈妈的姐姐的儿子': { r: '表哥 / 表弟', d: '姨妈的儿子' },
    '妈妈的姐姐的女儿': { r: '表姐 / 表妹', d: '姨妈的女儿' },
    '妈妈的妹妹的儿子': { r: '表哥 / 表弟', d: '姨妈的儿子' },
    '妈妈的妹妹的女儿': { r: '表姐 / 表妹', d: '姨妈的女儿' },
    '表哥': { r: '表哥', d: '姑舅姨家的儿子' },
    '表姐': { r: '表姐', d: '姑舅姨家的女儿' },
    '堂哥': { r: '堂哥', d: '伯叔家的儿子' },
    '堂姐': { r: '堂姐', d: '伯叔家的女儿' },

    /* ---------- 配偶 / 姻亲 ---------- */
    '老公': { r: '老公', d: '丈夫' },
    '老婆': { r: '老婆', d: '妻子' },
    '老公的妈妈': { r: '婆婆', d: '丈夫的母亲' },
    '老公的爸爸': { r: '公公', d: '丈夫的父亲' },
    '老公的哥哥': { r: '大伯子 / 大叔子', d: '丈夫的哥哥 / 弟弟' },
    '老公的弟弟': { r: '小叔子', d: '丈夫的弟弟' },
    '老公的姐姐': { r: '大姑姐', d: '丈夫的姐姐' },
    '老公的妹妹': { r: '小姑', d: '丈夫的妹妹' },
    '老婆的妈妈': { r: '岳母', d: '妻子的母亲' },
    '老婆的爸爸': { r: '岳父', d: '妻子的父亲' },
    '老婆的哥哥': { r: '大舅子', d: '妻子的哥哥' },
    '老婆的弟弟': { r: '小舅子', d: '妻子的弟弟' },
    '老婆的姐姐': { r: '大姨姐', d: '妻子的姐姐' },
    '老婆的妹妹': { r: '小姨', d: '妻子的妹妹' },
    '婆婆的妈妈': { r: '婆婆的妈', d: '婆母的母亲（曾外祖母辈）' },
    '婆婆的爸爸': { r: '公公（称呼随地域）', d: '公公的父亲' },
    '爷爷的妈妈': { r: '太奶奶', d: '祖母的母亲' },
    '爷爷的爸爸': { r: '太爷爷', d: '祖父的父亲' },
    '奶奶的妈妈': { r: '太姥姥', d: '外祖母的母亲' },
    '奶奶的爸爸': { r: '太姥爷', d: '外祖父的父亲' },
    '外公的妈妈': { r: '太姥姥', d: '外祖母的母亲' },
    '外公的爸爸': { r: '太姥爷', d: '外祖父的父亲' },
    '嫂子的爸爸': { r: '亲家公', d: '嫂子之父（双方父母互称亲家）' },
    '嫂子的妈妈': { r: '亲家母', d: '嫂子之母' },
    '嫂子的孩子': { r: '侄子 / 侄女', d: '哥哥的子女' },

    /* ---------- 晚辈 ---------- */
    '儿子': { r: '儿子', d: '男孩' },
    '女儿': { r: '女儿', d: '女孩' },
    '儿子的老婆': { r: '儿媳', d: '儿子的配偶' },
    '儿子的孩子': { r: '孙子 / 孙女', d: '儿子的子女' },
    '女儿的老公': { r: '女婿', d: '女儿的配偶' },
    '女儿的孩子': { r: '外孙 / 外孙女', d: '女儿的子女' },
    '孙子的老婆': { r: '孙媳', d: '孙子的配偶' },
    '外孙的老婆': { r: '外孙媳', d: '外孙的配偶' },
    '孙女的丈夫': { r: '孙女婿', d: '孙女的配偶' },
    '爸爸的爸爸的爸爸': { r: '太爷爷', d: '祖父的父亲' },

    /* ---------- 其他高频 ---------- */
    '堂哥的老婆': { r: '堂嫂', d: '堂兄的配偶' },
    '表哥的老婆': { r: '表嫂', d: '表兄的配偶' },
    '表姐的老公': { r: '表姐夫', d: '表姊的配偶' },
    '舅舅的儿子': { r: '表哥 / 表弟', d: '舅舅的子女（男）' },
    '姨妈的儿子': { r: '表哥 / 表弟', d: '姨妈的子女（男）' },
    '哥哥的爸爸': { r: '爸爸', d: '哥哥的父亲（与自己的父亲同一人）' },
    '哥哥的妈妈': { r: '妈妈', d: '哥哥的母亲（与自己的母亲同一人）' },
    '姐姐的爸爸': { r: '爸爸', d: '姐姐的父亲' },
    '姐姐的妈妈': { r: '妈妈', d: '姐姐的母亲' }
  };

  /* 反向替换补充：首末段语义冲突时的固定结论
     （任务书示例「儿子的妈妈」：儿子的母亲按男性视角即自己的配偶） */
  const REVERSE_EXTRA = {
    '儿子的妈妈': { r: '老婆', d: '儿子的母亲（按男性视角即自己的配偶）' },
    '儿子的爸爸': { r: '自己', d: '儿子的父亲即自己' },
    '女儿的妈妈': { r: '老婆', d: '女儿的母亲（按男性视角即自己的配偶）' },
    '女儿的爸爸': { r: '自己', d: '女儿的父亲即自己' }
  };

  /* 反向替换兜底：把末段的亲属后缀回退一层再查
     例如「爸爸的哥哥的妈妈」→「爸爸的哥哥」 */
  const REVERSE_RULES = [
    [/(.*)的妈妈$/, '$1'],
    [/(.*)的爸爸$/, '$1'],
    [/(.*)的儿子$/, '$1'],
    [/(.*)的女儿$/, '$1'],
    [/(.*)的妻子$/, '$1'],
    [/(.*)的丈夫$/, '$1'],
    [/(.*)的老公$/, '$1'],
    [/(.*)的老婆$/, '$1'],
    [/(.*)的哥哥$/, '$1'],
    [/(.*)的弟弟$/, '$1'],
    [/(.*)的姐姐$/, '$1'],
    [/(.*)的妹妹$/, '$1']
  ];

  /* 配偶别名：反向替换后需要归一化 */
  const SPOUSE_ALIAS = { '丈夫': '老公', '妻子': '老婆', '先生': '老公', '太太': '老婆', '媳妇': '老婆' };

  const CHIPS = ['爸爸', '妈妈', '哥哥', '姐姐', '弟弟', '妹妹', '老公', '老婆', '儿子', '女儿', '爷爷', '奶奶', '外公', '外婆', '舅舅', '姨妈', '叔叔', '姑姑', '伯父', '叔父'];

  const QUICK = [
    { n: '爸爸的姐姐的儿子', t: '爸爸 → 姑姑 → 儿子' },
    { n: '妈妈的哥哥的女儿', t: '妈妈 → 舅舅 → 女儿' },
    { n: '老公的妈妈', t: '老公 → 婆婆' },
    { n: '爸爸的妈妈的女儿', t: '爸爸 → 奶奶 → 女儿' },
    { n: '妈妈的哥哥的儿子', t: '妈妈 → 舅舅 → 儿子' },
    { n: '老婆的爸爸', t: '老婆 → 岳父' }
  ];

  let rootEl = null;
  let chain = [];   /* 已选择的关系链，如 ['爸爸', '姐姐', '儿子'] */

  function chainText() {
    return chain.join('的');
  }

  /* 四步查找：空格/「的」统一拆分 → 直接查表 → 固定反向结论 → 配偶别名归一 → 末段后缀回退 */
  function lookup(raw) {
    const q = String(raw || '').replace(/\s+/g, '');
    if (!q) return null;
    const parts = q.split('的').filter(Boolean);
    const joined = parts.join('的');

    /* ① 直接查表 */
    if (RELATION_MAP[joined]) return { hit: RELATION_MAP[joined], how: '直接匹配' };

    /* ② 首末段语义冲突的固定结论（如「儿子的妈妈」→「老婆」） */
    if (REVERSE_EXTRA[joined]) {
      return { hit: REVERSE_EXTRA[joined], how: '反向替换（' + joined + ' → ' + REVERSE_EXTRA[joined].r + '）' };
    }

    /* ③ 配偶别名归一后重查：把每段里的「丈夫/妻子/先生/太太/媳妇」换成「老公/老婆」
           必须早于末段回退，否则「丈夫的妈妈」会被截成「老公」而丢掉后半段 */
    const aliasParts = parts.map(p => SPOUSE_ALIAS[p] || p);
    const aliasJoined = aliasParts.join('的');
    if (aliasJoined !== joined) {
      if (RELATION_MAP[aliasJoined]) {
        const from = parts.filter((p, i) => aliasParts[i] !== p).join('、');
        return { hit: RELATION_MAP[aliasJoined], how: '配偶归一（' + from + ' → ' + aliasParts.filter((p, i) => p !== parts[i]).join('、') + '）' };
      }
      if (REVERSE_EXTRA[aliasJoined]) {
        const from = parts.filter((p, i) => aliasParts[i] !== p).join('、');
        return { hit: REVERSE_EXTRA[aliasJoined], how: '配偶归一 + 反向替换（' + from + '）' };
      }
    }

    /* ④ 末段亲属后缀回退一层再查（如「爸爸的哥哥的妈妈」→「爸爸的哥哥」） */
    for (const [re] of REVERSE_RULES) {
      const m = joined.match(re);
      if (m && m[1] && m[1] !== joined) {
        if (RELATION_MAP[m[1]]) return { hit: RELATION_MAP[m[1]], how: '反向替换（' + joined + ' → ' + m[1] + '）' };
        const m2 = aliasJoined.match(re);
        if (m2 && m2[1] && m2[1] !== aliasJoined && RELATION_MAP[m2[1]]) {
          return { hit: RELATION_MAP[m2[1]], how: '配偶归一 + 反向替换（' + aliasJoined + ' → ' + m2[1] + '）' };
        }
      }
    }

    return null;
  }

  function render() {
    const txt = chainText();
    $('#relIn', rootEl).value = txt;
    const box = $('#relResult', rootEl);
    const steps = $('#relSteps', rootEl);
    if (chain.length) {
      steps.hidden = false;
      steps.innerHTML = chain.map((c, i) =>
        '<button class="rel-step" data-step="' + i + '" type="button">' + esc(c) + '</button>'
      ).join('<span class="rel-arrow">→</span>');
    } else {
      steps.hidden = true;
      steps.innerHTML = '';
    }

    if (!txt) { box.hidden = true; return; }

    const r = lookup(txt);
    if (r) {
      box.hidden = false;
      box.className = 'rel-result ok';
      box.innerHTML =
        '<div class="rel-big">' + esc(r.hit.r) + '</div>' +
        '<div class="rel-desc">' + esc(r.hit.d) + '</div>' +
        '<div class="rel-how">关系链：' + esc(txt) + ' · ' + esc(r.how) + '</div>';
    } else {
      box.hidden = false;
      box.className = 'rel-result warn';
      box.innerHTML =
        '<div class="rel-big small">暂时无法识别这个关系</div>' +
        '<div class="rel-desc">请尝试更常见的组合，例如「爸爸的姐姐的儿子」「老公的妈妈」</div>' +
        '<div class="rel-how">关系链：' + esc(txt) + '</div>';
    }
  }

  function addChip(v) {
    chain.push(v);
    if (chain.length > 5) chain = chain.slice(-5); /* 最多 5 级，超长无意义 */
    render();
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>亲戚关系计算器</h1><p>逐步组合关系链，自动得出称呼与说明</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="rel-input-row">' +
      '<input class="inp" id="relIn" placeholder="例如：爸爸的姐姐的儿子" />' +
      '<button class="btn btn-main js-primary-submit" id="relGo" type="button">🔍 算一下</button>' +
      '</div>' +
      '<div class="rel-steps" id="relSteps" hidden></div>' +
      '<div class="rel-result" id="relResult" hidden></div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">点标签追加关系（用「的」自动连接）</span>' +
      '<div class="hl-chips" id="relChips">' +
      CHIPS.map(c => '<button class="chip" data-c="' + esc(c) + '" type="button">' + esc(c) + '</button>').join('') +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost btn-sm" id="relUndo" type="button">↩ 撤销一步</button>' +
      '<button class="btn btn-ghost btn-sm" id="relClear" type="button">清空</button>' +
      '<button class="btn btn-ghost btn-sm" id="relCopy" type="button">📋 复制关系链</button>' +
      '</div>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">常用组合</span>' +
      '<div class="rel-quick">' +
      QUICK.map((q, i) => '<button class="rel-quick-item" data-q="' + i + '" type="button">' +
        '<b>' + esc(q.n) + '</b><span>' + esc(q.t) + '</span></button>').join('') +
      '</div>' +
      '</div>' +
      '<p class="cd-note">称呼存在地域差异（如「伯父 / 大爷」「叔父 / 叔叔」），本工具以通用书面称呼为准，实际使用请按当地习惯。共收录 ' + Object.keys(RELATION_MAP).length + ' 条关系映射，全部离线计算。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    chain = [];
    root.innerHTML = html();

    /* chips 追加（用「的」连接） */
    $('#relChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (b) addChip(b.getAttribute('data-c'));
    });
    /* 常用组合直接填入 */
    root.querySelector('.rel-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      const q = QUICK[+b.getAttribute('data-q')];
      if (!q) return;
      chain = q.n.split('的');
      render();
    });
    /* 点击步骤可回到该级（保留到所点的那一级） */
    $('#relSteps', root).addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const i = +b.getAttribute('data-step');
      chain = chain.slice(0, Math.min(i + 1, chain.length));
      render();
    });
    $('#relGo', root).addEventListener('click', () => {
      const v = $('#relIn', root).value.trim();
      /* 「的」与空格都算分隔符：「爸爸 姐姐 儿子」「爸爸的姐姐 儿子」都能拆开 */
      chain = v ? v.split(/[的\s]+/).filter(Boolean) : [];
      render();
    });
    $('#relIn', root).addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      $('#relGo', root).click();
    });
    $('#relUndo', root).addEventListener('click', () => { chain.pop(); render(); });
    $('#relClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, () => { chain = []; render(); }));
    $('#relCopy', root).addEventListener('click', () => {
      const txt = chainText();
      if (!txt) { LB.toast('还没有关系链', 'info'); return; }
      const r = lookup(txt);
      LB.copyNow(r ? txt + ' → ' + r.hit.r : txt, '已复制关系链与称呼');
    });

    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    render();
  }

  function unmount() { rootEl = null; chain = []; }

  LB.router.register('relative', { mount, unmount });
})();
