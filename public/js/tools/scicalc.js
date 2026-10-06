/* LiteBox v5 · tools/scicalc.js — 计算器（Step 20 · A1：基础 / 科学双模式）
 *
 * 【基础模式】即算即显状态机：acc(累计值) + op(待运算符) + entry(正在输入的数)。
 *   5 + 3 = 8 → 再按 × 2 = 16（= 后按运算符自动把累计值当左操作数）。
 *   待运算的运算符按钮高亮（.on）。
 *
 * 【科学模式】表达式输入：顶部显示表达式、底部显示结果。
 *   沿用 Step 15 · A1 的设计——输入阶段只做字符白名单校验（sin( 这种未闭合
 *   状态一律放行、不报错），点「＝」才完整求值并自动补全缺失的右括号。
 *   ★ 求值用**递归下降解析器**（不用任务书示例的「白名单 + Function」方案）：
 *     那个方案把用户输入拼接成可执行代码（白名单形同虚设，有注入面）；
 *     递归下降把输入只当「数字 / 运算符 / 函数」三类 token 处理，从根上消除注入。
 *
 * 【历史】litebox_calc_history 最近 10 条，点击回填表达式（旧键 litebox_scicalc_hist 迁移）。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;
  const KEY = 'litebox_calc_history';
  const KEY_LEGACY = 'litebox_scicalc_hist';
  const HIST_MAX = 10;

  let rootEl = null;
  let hist = [];
  let mode = 'basic';   /* 'basic' | 'sci' */

  /* ================= 科学模式：解析器（沿用 Step 15 实现） ================= */

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

  /* 输入阶段的宽松校验：白名单从 FUNCS / CONSTS 真实名单生成 */
  const ALLOWED_CH = (() => {
    const s = new Set('0123456789+-*/%^().! \t\n×÷−√π');
    Object.keys(FUNCS).forEach(f => { for (const ch of f) s.add(ch); });
    s.add('e'); s.add('E');
    return s;
  })();

  function isPartialValid(expr) {
    for (const ch of String(expr)) if (!ALLOWED_CH.has(ch)) return false;
    return true;
  }

  /* 点「＝」时自动补全未闭合的右括号 */
  function autoClose(expr) {
    let open = 0;
    for (const ch of expr) {
      if (ch === '(') open++;
      else if (ch === ')') open--;
    }
    let out = expr;
    while (open > 0) { out += ')'; open--; }
    return out;
  }

  function tokenize(src) {
    const out = [];
    let i = 0;
    const s = String(src);
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '　') { i++; continue; }
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
      if (/[A-Za-zπ]/.test(ch)) {
        let j = i;
        while (j < s.length && /[A-Za-zπ]/.test(s[j])) j++;
        const name = s.slice(i, j);
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
      throw new Error('表达式包含不允许的字符：' + ch);
    }
    return out;
  }

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
        } else if (peek() && (peek().t === 'num' || peek().t === 'fn' || (peek().t === 'op' && peek().v === '('))) {
          /* 隐式乘法：2π、3(4+1)、2sin(30) 这类连写按乘法处理 */
          v *= parseUnary();
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
        if (peek() && peek().t === 'op' && peek().v === ')') throw new Error(t.name + ' 缺少参数');
        const arg = parseExpr();
        if (!eatOp(')')) throw new Error(t.name + ' 缺少右括号');
        return t.v(arg);
      }
      if (t.t === 'op' && t.v === '(') {
        p++;
        if (peek() && peek().t === 'op' && peek().v === ')') throw new Error('括号内缺少表达式');
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
    const r = Math.round(n * 1e10) / 1e10;
    if (Number.isInteger(r)) return String(r);
    return String(r);
  }

  /* ---------- 历史（两种模式共用，最近 10 条，点击回填） ---------- */

  function pushHist(expr, res) {
    const line = expr + ' = ' + res;
    if (hist[0] === line) return;
    hist.unshift(line);
    if (hist.length > HIST_MAX) hist.length = HIST_MAX;
    LB.storage.set(KEY, hist);
  }

  function renderHist() {
    const box = $('#scHist', rootEl);
    if (!box) return;
    if (!hist.length) {
      LB.ui.empty(box, {
        icon: '🧮',
        title: '还没有计算记录',
        sub: '算过的式子会自动留在这里，点一下即可回填'
      });
      return;
    }
    box.innerHTML = hist.slice(0, HIST_MAX).map(h => {
      const i = h.lastIndexOf(' = ');
      const e = h.slice(0, i), r = h.slice(i + 3);
      return '<button class="sc-h" type="button" data-e="' + LB.dom.esc(e) + '">' +
        '<span>' + LB.dom.esc(e) + '</span><b>' + LB.dom.esc(r) + '</b></button>';
    }).join('');
  }

  /* ================= 基础模式：即算状态机 ================= */

  const bc = { acc: null, op: null, entry: '', justEq: false };
  const OP_SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  function bcCalc(a, op, b) {
    let r;
    if (op === '+') r = a + b;
    else if (op === '-') r = a - b;
    else if (op === '*') r = a * b;
    else if (op === '/') r = b === 0 ? NaN : a / b;
    else r = b;
    return r;
  }

  function bcEntryVal() { return bc.entry !== '' ? parseFloat(bc.entry) : (bc.acc !== null ? bc.acc : 0); }

  function bcShow(text, isErr) {
    const out = $('#bcOut', rootEl);
    const sub = $('#bcSub', rootEl);
    if (out) {
      out.textContent = text;
      out.classList.toggle('err', !!isErr);
    }
    if (sub) sub.textContent = (bc.acc !== null && bc.op) ? (fmt(bc.acc) + ' ' + OP_SYM[bc.op]) : '';
    /* 待运算符高亮 */
    $$('.sc-pad-basic .sc-k', rootEl).forEach(b => {
      b.classList.toggle('on', !!bc.op && b.dataset.k === bc.op);
    });
  }

  function bcRender() {
    if (bc.entry !== '') bcShow(bc.entry);
    else if (bc.acc !== null) bcShow(fmt(bc.acc));
    else bcShow('0');
  }

  function bcDigit(d) {
    if (bc.justEq) { bc.acc = null; bc.op = null; bc.entry = ''; bc.justEq = false; }
    if (d === '.') {
      if (bc.entry.indexOf('.') > -1) return;
      bc.entry = (bc.entry || '0') + '.';
    } else {
      if (bc.entry.replace('-', '').replace('.', '').length >= 15) return;
      bc.entry = (bc.entry === '0') ? d : bc.entry + d;
    }
    bcRender();
  }

  function bcOp(op) {
    const cur = bcEntryVal();
    if (bc.op !== null && bc.entry !== '') {
      /* 连续运算：先把上一步算掉（5 + 3 再按 × → 先得 8） */
      const r = bcCalc(bc.acc, bc.op, cur);
      if (!isFinite(r)) { bcShow('错误', true); bcReset(); return; }
      bc.acc = r;
      bcShow(fmt(r));
    } else if (bc.acc === null) {
      bc.acc = cur;
    }
    bc.op = op;
    bc.entry = '';
    bc.justEq = false;
    bcRender();
  }

  function bcEq() {
    if (bc.op === null) {
      if (bc.entry !== '') { bc.acc = parseFloat(bc.entry); bc.entry = ''; }
      bc.justEq = true;
      bcRender();
      return;
    }
    const cur = bcEntryVal();
    const a = bc.acc;
    const r = bcCalc(a, bc.op, cur);
    if (!isFinite(r)) { bcShow('错误', true); LB.toast('除数不能为 0', 'err'); bcReset(); return; }
    const line = fmt(a) + ' ' + OP_SYM[bc.op] + ' ' + fmt(cur);
    bc.acc = r; bc.entry = ''; bc.op = null; bc.justEq = true;
    bcShow(fmt(r));
    pushHist(line, fmt(r));
    renderHist();
  }

  function bcPercent() {
    const v = bcEntryVal() / 100;
    if (bc.entry !== '' || bc.acc === null) bc.entry = String(v);
    else bc.acc = v;
    bcRender();
  }

  function bcNeg() {
    if (bc.entry !== '') {
      bc.entry = bc.entry.charAt(0) === '-' ? bc.entry.slice(1) : '-' + bc.entry;
    } else if (bc.acc !== null) {
      bc.entry = String(-bc.acc);
      bc.acc = null;
    } else {
      bc.entry = '-';
    }
    bcRender();
  }

  function bcBack() {
    if (bc.justEq) return;
    bc.entry = bc.entry.slice(0, -1);
    bcRender();
  }

  function bcReset() {
    bc.acc = null; bc.op = null; bc.entry = ''; bc.justEq = false;
    bcRender();
  }

  /* ================= 科学模式：表达式输入 ================= */

  function sciOnInput() {
    if (!rootEl) return;
    const v = $('#scExpr', rootEl).value;
    const out = $('#scOut', rootEl);
    if (!v.trim()) { out.textContent = '0'; out.classList.remove('err'); return; }
    if (!isPartialValid(v)) {
      out.textContent = '表达式包含不允许的字符';
      out.classList.add('err');
      return;
    }
    if (out.classList.contains('err')) out.textContent = '按 ＝ 计算';
    out.classList.remove('err');
  }

  function sciRun() {
    const inp = $('#scExpr', rootEl);
    const out = $('#scOut', rootEl);
    const raw = inp.value;
    if (!raw.trim()) { out.textContent = '0'; out.classList.remove('err'); return; }
    const expr = autoClose(raw);
    try {
      const v = evaluate(expr);
      if (expr !== raw) inp.value = expr;
      out.textContent = fmt(v);
      out.classList.remove('err');
      pushHist(expr, fmt(v));
    } catch (e) {
      const msg = (e && e.message) ? e.message : '表达式不合法';
      out.textContent = msg;
      out.classList.add('err');
      LB.toast(msg, 'err');
    }
    renderHist();
  }

  /* 按钮表：每项 [标签, 动作, 提示, 类名]（动作：字符串 = 追加文本，其它为指令） */
  const SCI_KEYS = [
    ['sin', 'sin(', 'sin(', 'fn'], ['cos', 'cos(', 'cos(', 'fn'], ['tan', 'tan(', 'tan(', 'fn'],
    ['(', '(', '左括号', 'op'], [')', ')', '右括号', 'op'],

    ['log', 'log(', 'log 常用对数', 'fn'], ['ln', 'ln(', 'ln 自然对数', 'fn'], ['√', '√(', '开方（自动补右括号）', 'op'],
    ['x²', '^2', '平方', 'op'], ['xʸ', '^', '幂运算', 'op'],

    ['π', 'π', '圆周率', 'fn'], ['e', 'e', '自然常数', 'fn'], ['!', '!', '阶乘', 'op'],
    ['%', '%', '取余', 'op'], ['C', 'clrExpr', '清空表达式', 'act'],

    ['7', '7', '', 'num'], ['8', '8', '', 'num'], ['9', '9', '', 'num'],
    ['÷', '÷', '除', 'op'], ['⌫', 'back', '退格', 'act'],

    ['4', '4', '', 'num'], ['5', '5', '', 'num'], ['6', '6', '', 'num'],
    ['×', '×', '乘', 'op'], ['AC', 'clear', '全部清空', 'act'],

    ['1', '1', '', 'num'], ['2', '2', '', 'num'], ['3', '3', '', 'num'],
    ['−', '−', '减', 'op'], ['=', '=', '计算', 'eq'],

    ['±', 'neg', '正负取反', 'act'], ['0', '0', '', 'num'], ['.', '.', '小数点', 'num'],
    ['+', '+', '加', 'op']
  ];

  /* 基础模式 4×5 键盘：[标签, 动作, 提示, 类名] */
  const BASIC_KEYS = [
    ['⌫', 'back', '退格', 'act'], ['AC', 'clear', '全部清空', 'act'], ['%', 'percent', '百分比', 'act'], ['÷', '/', '除', 'op'],
    ['7', '7', '', 'num'], ['8', '8', '', 'num'], ['9', '9', '', 'num'], ['×', '*', '乘', 'op'],
    ['4', '4', '', 'num'], ['5', '5', '', 'num'], ['6', '6', '', 'num'], ['−', '-', '减', 'op'],
    ['1', '1', '', 'num'], ['2', '2', '', 'num'], ['3', '3', '', 'num'], ['+', '+', '加', 'op'],
    ['±', 'neg', '正负取反', 'act'], ['0', '0', '', 'num'], ['.', '.', '小数点', 'num'], ['=', '=', '计算', 'eq']
  ];

  function keyHTML(list, cls) {
    return list.map(k => '<button class="sc-k sc-' + k[3] + '" type="button" data-k="' + LB.dom.esc(k[1]) + '"' +
      (k[2] ? ' title="' + LB.dom.esc(k[2]) + '"' : '') + ' aria-label="' + LB.dom.esc(k[0]) + '">' +
      LB.dom.esc(k[0]) + '</button>').join('');
  }

  function sciPress(k) {
    const inp = $('#scExpr', rootEl);
    const v = inp.value;
    if (k === '=') { sciRun(); return; }
    if (k === 'clear') { inp.value = ''; $('#scOut', rootEl).textContent = '0'; }
    else if (k === 'clrExpr') { inp.value = ''; }
    else if (k === 'back') { inp.value = v.slice(0, -1); }
    else if (k === 'neg') {
      const m = v.match(/(-?\d*\.?\d+)$/);
      if (m) inp.value = v.slice(0, v.length - m[1].length) + '(-' + m[1] + ')';
      else inp.value = v ? '-(' + v + ')' : '-';
    } else {
      inp.value = v + k;
    }
    sciOnInput();
  }

  /* ================= 视图 ================= */

  function setMode(m) {
    mode = m;
    $$('.calc-seg > button', rootEl).forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    const b = $('#scBasic', rootEl), s = $('#scSci', rootEl);
    if (b) b.hidden = m !== 'basic';
    if (s) s.hidden = m !== 'sci';
    try { LB.storage.set('litebox_calc_mode', m); } catch (_) {}
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>计算器</h1><p>基础四则与科学函数双模式，科学模式支持表达式与历史回填</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg calc-seg" role="tablist">' +
      '<button type="button" data-mode="basic" class="on">🧮 基础</button>' +
      '<button type="button" data-mode="sci">🔬 科学</button>' +
      '</div>' +

      /* —— 基础模式 —— */
      '<div class="card sc-screen" id="scBasic">' +
      '<div class="sc-sub mono" id="bcSub"></div>' +
      '<div class="sc-big mono" id="bcOut">0</div>' +
      '<div class="sc-pad sc-pad-basic">' + keyHTML(BASIC_KEYS, 'basic') + '</div>' +
      '</div>' +

      /* —— 科学模式 —— */
      '<div class="card sc-screen" id="scSci" hidden>' +
      '<input class="sc-expr mono" id="scExpr" type="text" inputmode="text" placeholder="输入表达式，如sin(π/2)" aria-label="表达式" spellcheck="false">' +
      '<div class="sc-out mono" id="scOut">0</div>' +
      '<div class="sc-pad sc-pad-sci">' + keyHTML(SCI_KEYS, 'sci') + '</div>' +
      '</div>' +

      '<div class="tool-sec">' +
      '<span class="tool-lab">计算记录（点击回填）</span>' +
      '<div class="sc-hists" id="scHist"></div>' +
      '</div>' +
      '<p class="cd-note">基础模式支持连续运算（5 + 3 = 8 后直接按 × 2 = 16）；科学模式支持 sin/cos/tan、' +
      'log(常用对数)/ln(自然对数)、√、阶乘、幂、π、e，输入 sin( 这类未闭合式子不会报错，按 ＝ 自动补全右括号并计算。' +
      '表达式由内置解析器逐字符求值，不做字符串拼接执行。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();

    /* 历史：新键优先，旧键迁移 */
    const saved = LB.storage.get(KEY, null);
    if (Array.isArray(saved)) hist = saved.filter(x => typeof x === 'string').slice(0, HIST_MAX);
    else {
      const legacy = LB.storage.get(KEY_LEGACY, []);
      hist = Array.isArray(legacy) ? legacy.filter(x => typeof x === 'string').slice(0, HIST_MAX) : [];
    }
    renderHist();

    /* 模式切换（记住上次选择） */
    $$('.calc-seg > button', root).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    const last = LB.storage.get('litebox_calc_mode', 'basic');
    setMode(last === 'sci' ? 'sci' : 'basic');

    /* —— 基础模式键盘 —— */
    $('.sc-pad-basic', root).addEventListener('click', e => {
      const btn = e.target.closest('.sc-k');
      if (!btn) return;
      const k = btn.dataset.k;
      if (k === '=') bcEq();
      else if (k === 'clear') bcReset();
      else if (k === 'back') bcBack();
      else if (k === 'neg') bcNeg();
      else if (k === 'percent') bcPercent();
      else if ('+-*/'.indexOf(k) > -1 && k.length === 1) bcOp(k);
      else bcDigit(k);
    });

    /* —— 科学模式键盘 + 键盘输入 —— */
    const inp = $('#scExpr', root);
    inp.addEventListener('input', sciOnInput);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sciRun(); }
    });
    $('.sc-pad-sci', root).addEventListener('click', e => {
      const btn = e.target.closest('.sc-k');
      if (!btn) return;
      sciPress(btn.dataset.k);
    });
    $('#scHist', root).addEventListener('click', e => {
      const b = e.target.closest('.sc-h');
      if (!b) return;
      /* 历史同时兼容两种模式：基础模式回填数值，科学模式回填表达式 */
      const expr = b.dataset.e;
      if (mode === 'basic') {
        const i = expr.lastIndexOf(' = ');
        const r = i > -1 ? expr.slice(i + 3) : expr;
        if (isFinite(+r)) { bc.acc = +r; bc.entry = ''; bc.op = null; bc.justEq = true; bcRender(); }
        return;
      }
      inp.value = expr;
      sciOnInput();
    });
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('scicalc', { mount, unmount });
})();
