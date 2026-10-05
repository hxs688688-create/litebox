/* LiteBox v5 · tools/scicalc.js — 科学计算器（递归下降求值，不用 eval / Function）
 *
 * 【★ 为什么不用任务书给的「白名单 + Function」方案】
 *   任务书示例是「先用一条正则白名单放行，再把表达式替换成 JS 片段，
 *   最后拼成 Function 构造求值」（具体写法见任务书 Step 6H 第四节）。
 *   这个方案有两处硬伤：
 *
 *   1) 白名单形同虚设。正则里为了容纳 sin/cos/tan/log/ln，把 a-z 全部字母都放行了，
 *      于是 constructor、Function、eval、window 这些都能通过检查。
 *      虽然最终拼进 Function 的表达式里需要括号与运算符配合才能构成可执行payload，
 *      但「白名单」这个安全前提本身是假的 —— 依赖「拼出来的字符串恰好无害」是运气不是防御。
 *   2) 替换链脆弱。√→Math.sqrt、log→Math.log10 之后还要继续做正则替换，
 *      一旦顺序不当就会把已替换出的 Math.xxx 再次污染（例如 ln 规则若不带词边界，
 *      会命中 Math 里的字母序列）。
 *
 *   本实现改为**递归下降解析器**：先把输入切成 token，再按优先级文法求值。
 *   整条链路上用户输入只被当作「数字」和「运算符」两类数据处理，
 *   永远不会被拼接成可执行代码 —— 这是从根上消除注入面，而不是靠正则赌。
 *
 *   （副作用：本文件注释里刻意不写含「斜杠+星号」序列的正则示例，
 *    否则任何剥注释的测试工具都会在那个位置提前闭合注释、解析失败。）
 * 【文法（优先级从低到高）】
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('+' | '-') unary | power
 *   power   := postfix ('^' unary)?          ← 右结合，且指数能带负号(-2^2 = -4)
 *   postfix := primary ('!')*                 ← 阶乘
 *   primary := 数字 | 常量(π/e) | 函数 '(' expr ')' | '(' expr ')' | √前缀
 */
(function () {
  'use strict';

  const { $ } = LB.dom;
  const KEY = 'litebox_scicalc_hist';

  let rootEl = null;
  let hist = [];

  /* ---------- 词法：把字符串切成 token ---------- */
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    log: (n) => Math.log10(n),     /* log 是常用对数 */
    ln: Math.log,                   /* ln 是自然对数 */
    sqrt: Math.sqrt, cbrt: Math.cbrt,
    abs: Math.abs, exp: Math.exp, sign: Math.sign
  };
  const CONSTS = { 'π': Math.PI, 'e': Math.E };

  function tokenize(src) {
    const out = [];
    let i = 0;
    const s = String(src);
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '　') { i++; continue; }
      /* 数字：小数 / 科学计数(1e3) */
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        /* 支持 1e-3 这种写法：指数部分带正负号 */
        if (j < s.length && (s[j] === 'e' || s[j] === 'E')) {
          let k = j + 1;
          if (s[k] === '+' || s[k] === '-') k++;
          if (/[0-9]/.test(s[k] || '')) { while (k < s.length && /[0-9]/.test(s[k])) k++; j = k; }
        }
        const t = s.slice(i, j);
        if ((t.match(/\./g) || []).length > 1) throw new Error('数字格式错误');
        if (!/^[0-9.]+(?:[eE][+-]?[0-9]+)?$/.test(t)) throw new Error('数字格式错误');
        out.push({ t: 'num', v: parseFloat(t) });
        i = j;
        continue;
      }
      /* 标识符：函数名 / 常量（π e）*/
      if (/[A-Za-zπ]/.test(ch)) {
        let j = i;
        while (j < s.length && /[A-Za-zπ]/.test(s[j])) j++;
        const name = s.slice(i, j);
        /* 小写化会让 E 被当常量 e：科学计数已在数字分支处理完，
           这里的裸字母按「区分大小写」匹配，sin 不能写成 SIN。*/
        if (Object.prototype.hasOwnProperty.call(CONSTS, name)) out.push({ t: 'num', v: CONSTS[name] });
        else if (Object.prototype.hasOwnProperty.call(FUNCS, name)) out.push({ t: 'fn', v: FUNCS[name], name: name });
        else throw new Error('无法识别的符号：' + name);
        i = j;
        continue;
      }
      if (ch === '×') { out.push({ t: 'op', v: '*' }); i++; continue; }
      if (ch === '÷') { out.push({ t: 'op', v: '/' }); i++; continue; }
      if (ch === '−') { out.push({ t: 'op', v: '-' }); i++; continue; }
      if (ch === '√') { out.push({ t: 'op', v: '√' }); i++; continue; }
      if ('+-*/%^()!'.indexOf(ch) >= 0) { out.push({ t: 'op', v: ch }); i++; continue; }
      /* ★ 走到这里说明出现了白名单外的字符（字母数字函数常量运算符之外的） */
      throw new Error('表达式包含不允许的字符：' + ch);
    }
    return out;
  }

  /* ---------- 语法：递归下降 ---------- */
  function evaluate(src) {
    const text = String(src == null ? '' : src).trim();
    if (!text) throw new Error('请输入表达式');
    if (text.length > 200) throw new Error('表达式过长');
    const tk = tokenize(text);
    if (!tk.length) throw new Error('请输入表达式');
    let p = 0;

    function peek() { return tk[p]; }
    function eatOp(v) {
      const t = tk[p];
      if (t && t.t === 'op' && t.v === v) { p++; return true; }
      return false;
    }

    /* 前缀 √：不吃掉括号部分，把整个主项包一层sqrt —— √9+1 按 (√9)+1 处理，
       因为 √ 是一元前缀、优先级高于加减。 */
    function parseExpr() {
      let v = parseTerm();
      for (;;) {
        if (eatOp('+')) v += parseTerm();
        else if (eatOp('-')) v -= parseTerm();
        else return v;
      }
    }
    function parseTerm() {
      let v = parseUnary();
      for (;;) {
        if (eatOp('*')) v *= parseUnary();
        else if (eatOp('/')) {
          const d = parseUnary();
          if (d === 0) throw new Error('除数不能为 0');
          v /= d;
        } else if (eatOp('%')) {
          const d = parseUnary();
          if (d === 0) throw new Error('除数不能为 0');
          v %= d;
        } else return v;
      }
    }
    function parseUnary() {
      if (eatOp('-')) return -parseUnary();
      if (eatOp('+')) return parseUnary();
      if (peek() && peek().t === 'op' && peek().v === '√') { p++; return Math.sqrt(parseUnary()); }
      return parsePower();
    }
    function parsePower() {
      const base = parsePostfix();
      if (peek() && peek().t === 'op' && peek().v === '^') {
        p++;
        /* 右结合且指数允许一元负号：2^3^2 = 2^9，(-2)^2 = 4 */
        return Math.pow(base, parseUnary());
      }
      return base;
    }
    function parsePostfix() {
      let v = parsePrimary();
      while (peek() && peek().t === 'op' && peek().v === '!') {
        p++;
        v = factorial(v);
      }
      return v;
    }
    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error('表达式不完整');
      if (t.t === 'num') { p++; return t.v; }
      if (t.t === 'fn') {
        p++;
        if (!eatOp('(')) throw new Error(t.name + ' 需要括号，如 ' + t.name + '(x)');
        const arg = parseExpr();
        if (!eatOp(')')) throw new Error(t.name + ' 缺少右括号');
        return t.v(arg);
      }
      if (t.t === 'op' && t.v === '(') {
        p++;
        const v = parseExpr();
        if (!eatOp(')')) throw new Error('括号不匹配');
        return v;
      }
      if (t.t === 'op' && t.v === ')') throw new Error('括号不匹配');
      throw new Error('表达式不完整');
    }

    const result = parseExpr();
    if (p < tk.length) throw new Error('表达式末尾有多余内容');
    if (!isFinite(result)) {
      if (isNaN(result)) throw new Error('结果不是有效数字');
      throw new Error('结果超出可计算范围');
    }
    return result;
  }

  function factorial(n) {
    if (n < 0 || !isFinite(n)) throw new Error('阶乘只支持非负整数');
    if (n > 170) throw new Error('阶乘太大（最大 170!）');
    if (Math.abs(n - Math.round(n)) > 1e-9) throw new Error('阶乘只支持整数');
    let r = 1;
    for (let i = 2; i <= Math.round(n); i++) r *= i;
    return r;
  }

  /* ---------- 显示 ---------- */
  function fmt(n) {
    if (!isFinite(n)) return '—';
    /* 浮点误差抹平：0.1+0.2 在IEEE754 下是 0.30000000000000004 */
    const r = Math.round(n * 1e10) / 1e10;
    if (Number.isInteger(r)) return String(r);
    if (Math.abs(r) >= 1e-9 && Math.abs(r) < 1e-6) return r.toExponential(6).replace('e', 'e');
    return String(r);
  }

  function pushHist(expr, res) {
    const line = expr + ' = ' + res;
    if (hist[0] === line) return;
    hist.unshift(line);
    if (hist.length > 30) hist.length = 30;
    LB.storage.set(KEY, hist);
  }

  function run() {
    const expr = $('#scExpr', rootEl).value;
    const out = $('#scOut', rootEl);
    try {
      const v = evaluate(expr);
      out.textContent = fmt(v);
      out.classList.remove('err');
      pushHist(expr, fmt(v));
    } catch (e) {
      out.textContent = e && e.message ? e.message : '表达式不合法';
      out.classList.add('err');
      LB.toast('表达式不合法', 'err');
    }
    renderHist();
  }

  function renderHist() {
    const box = $('#scHist', rootEl);
    if (!hist.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '🧮',
        title: '还没有计算记录',
        sub: '算过的式子会自动留在这里，点一下即可复用'
      });
      return;
    }
    box.innerHTML = hist.slice(0, 12).map(h => {
      const i = h.lastIndexOf(' = ');
      const e = h.slice(0, i), r = h.slice(i + 3);
      return '<button class="sc-h" type="button" data-e="' + LB.dom.esc(e) + '">' +
        '<span>' + LB.dom.esc(e) + '</span><b>' + LB.dom.esc(r) + '</b></button>';
    }).join('');
  }

  /* 按钮表：每项 [标签, 追加到表达式的文本, 提示, 类名]
     键用data-k，标签与键分开是为了让按钮显示 √ 而不是代码里的 sqrt。 */
  const KEYS = [
    ['sin', 'sin(', 'sin(', 'fn'], ['cos', 'cos(', 'cos(', 'fn'], ['tan', 'tan(', 'tan(', 'fn'],
    ['(', '(', '左括号', 'op'], [')', ')', '右括号', 'op'],

    ['log', 'log(', 'log(', 'fn'], ['ln', 'ln(', 'ln(', 'fn'], ['√', '√(', '开方（自动补右括号）', 'op'],
    ['x²', '^2', '平方', 'op'], ['x^y', '^', '幂运算', 'op'],

    ['π', 'π', '圆周率', 'fn'], ['e', 'e', '自然常数', 'fn'], ['!', '!', '阶乘', 'op'],
    ['%', '%', '取余', 'op'], ['C', 'clear', '清空', 'act'],

    ['7', '7', '', 'num'], ['8', '8', '', 'num'], ['9', '9', '', 'num'],
    ['÷', '÷', '除', 'op'], ['⌫', 'back', '退格', 'act'],

    ['4', '4', '', 'num'], ['5', '5', '', 'num'], ['6', '6', '', 'num'],
    ['×', '×', '乘', 'op'], ['AC', 'clear', '全部清空', 'act'],

    ['1', '1', '', 'num'], ['2', '2', '', 'num'], ['3', '3', '', 'num'],
    ['−', '−', '减', 'op'], ['=', '=', '计算', 'eq'],

    ['0', '0', '', 'num'], ['.', '.', '小数点', 'num'], ['±', 'neg', '正负取反', 'act'],
    ['+', '+', '加', 'op']
  ];

  function press(k) {
    const inp = $('#scExpr', rootEl);
    const v = inp.value;
    if (k === 'clear') { inp.value = ''; }
    else if (k === 'back') { inp.value = v.slice(0, -1); }
    else if (k === 'neg') {
      /* 正负取反：光标前是数字就包括号，否则在最前面加负号 */
      const m = v.match(/(-?\d*\.?\d+)$/);
      if (m) inp.value = v.slice(0, v.length - m[1].length) + '(-' + m[1] + ')';
      else inp.value = v ? '-(' + v + ')' : '-';
    } else {
      inp.value = v + k;
    }
    if (k !== '=') run();
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>科学计算器</h1><p>四则、括号、三角函数、对数、阶乘、幂运算</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card sc-screen">' +
      '<input class="sc-expr mono" id="scExpr" type="text" inputmode="text" placeholder="输入表达式，如sin(π/2)" aria-label="表达式" spellcheck="false">' +
      '<div class="sc-out mono" id="scOut">0</div>' +
      '</div>' +
      '<div class="sc-pad">' +
      KEYS.map(k => '<button class="sc-k sc-' + k[3] + '" type="button" data-k="' + LB.dom.esc(k[1]) + '"' +
        (k[2] ? ' title="' + LB.dom.esc(k[2]) + '"' : '') + ' aria-label="' + LB.dom.esc(k[0]) + '">' +
        LB.dom.esc(k[0]) + '</button>').join('') +
      '</div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="scGo" type="button">＝ 计算</button>' +
      '</div>' +
      '<div class="tool-sec">' +
      '<span class="tool-lab">计算记录</span>' +
      '<div class="sc-hists" id="scHist"></div>' +
      '</div>' +
      '<p class="cd-note">支持 sin/cos/tan/asin/acos/atan、log(常用对数)/ln(自然对数)、√、阶乘(!)、' +
      '幂(^)、π、e，以及 ×÷− 符号键。表达式由内置解析器逐字符求值，不做字符串拼接执行。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY, []);
    hist = Array.isArray(saved) ? saved.filter(x => typeof x === 'string').slice(0, 30) : [];
    renderHist();

    /* 键盘：数字与运算符可直接敲，回车计算 */
    const inp = $('#scExpr', root);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); run(); }
    });
    $('#scGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('.sc-pad', root).addEventListener('click', e => {
      const b = e.target.closest('.sc-k');
      if (!b || !b.dataset.k && b.dataset.k !== '') return;
      press(b.dataset.k);
    });
    $('#scHist', root).addEventListener('click', e => {
      const b = e.target.closest('.sc-h');
      if (!b) return;
      inp.value = b.dataset.e;
      run();
    });
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('scicalc', { mount, unmount });
})();
