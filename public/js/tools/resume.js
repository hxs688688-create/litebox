/* LiteBox v5 · tools/resume.js — 简历生成器
   8 套模板（.w33-r-* 前缀）+ 左编辑右 A4 预览（zoom 缩放适配）+ 实时渲染（debounce 200ms）
   数据存 litebox_resume33，模板选择存 litebox_resume33_style
   打印：window.print() + beforeprint/afterprint 清理内联缩放，打印 CSS 见 tools.css（A4、隐藏编辑器） */
(function () {
  'use strict';

  const { $, $$, esc, debounce } = LB.dom;
  const KEY = 'litebox_resume33';
  const KEY_STYLE = 'litebox_resume33_style';

  const TPLS = [
    { id: 'at',       name: '经典 ATS', desc: '通过筛选的标准格式' },
    { id: 'serif',    name: 'Harvard',  desc: '衬线学术风格' },
    { id: 'side',     name: '双栏技术', desc: '侧栏突出技能亮点' },
    { id: 'academic', name: '学术 CV',  desc: '大留白论文排版' },
    { id: 'product',  name: '产品运营', desc: '数据成果导向' },
    { id: 'minimal',  name: '极简',     desc: '少即是多的留白' },
    { id: 'compact',  name: '紧凑',     desc: '一页装下全部经历' },
    { id: 'creative', name: '创意',     desc: '彩色标题块设计' }
  ];

  const FIELDS = [
    { k: 'name',  lab: '姓名',             ph: '张三' },
    { k: 'role',  lab: '求职方向',         ph: '前端开发实习生' },
    { k: 'phone', lab: '电话',             ph: '138 0000 0000' },
    { k: 'email', lab: '邮箱',             ph: 'me@example.com' },
    { k: 'city',  lab: '城市',             ph: '北京' },
    { k: 'links', lab: 'GitHub / LinkedIn', ph: 'github.com/yourname' }
  ];

  const SECS = [
    { k: 'summary', t: '个人简介',        kind: 'p',  hint: '填写你的核心优势',       ph: '两三句话概括专业背景、核心能力与求职意向', rows: 3 },
    { k: 'edu',     t: '教育经历',        kind: 'ul', hint: '填写学校与专业',         ph: '一行一段：时间 · 学校 · 专业 · 学历', rows: 3 },
    { k: 'exp',     t: '工作 / 实习经历', kind: 'ul', hint: '填写工作与实习经历',     ph: '一行一段：时间 · 公司 · 岗位 · 关键成果', rows: 4 },
    { k: 'proj',    t: '项目经历',        kind: 'ul', hint: '填写项目经历',           ph: '一行一段：项目 · 角色 · 技术栈 · 产出', rows: 4 },
    { k: 'skills',  t: '技能',            kind: 'ul', hint: '填写你的技能',           ph: '一行一组：语言 / 框架 / 工具 / 证书等级', rows: 4 },
    { k: 'awards',  t: '荣誉 / 证书',     kind: 'ul', hint: '填写荣誉与证书',         ph: '一行一条：奖学金 · 竞赛获奖 · 证书', rows: 3 }
  ];

  const EXAMPLE = {
    name: '张同学',
    role: '前端开发实习生',
    phone: '138 0000 0000',
    email: 'zhangxx@example.com',
    city: '武汉',
    links: 'github.com/zhangxx',
    summary: '计算机相关专业本科生，具备前端开发、数据处理与产品协作经验。重视性能、可用性和用户体验，能够独立完成页面开发、联调与上线。',
    edu: '2023.09 - 2027.06 · 华中科技大学 · 计算机科学与技术 · 本科 · GPA 3.8/4.0',
    exp: '2025.07 - 2025.09 · XX 科技 · 前端实习生 · 负责活动页、组件开发与接口联调，推动首屏加载耗时下降 32%\n2024.09 - 2025.06 · 校园新媒体中心 · 主理人 · 负责选题、视觉和数据复盘，单篇最高阅读 1.2w',
    proj: '校园二手交易平台 · 独立开发 · React / Node.js · 完成商品发布、搜索、收藏和后台管理\n数据可视化平台 · Python / Pandas / ECharts · 将课程数据整理为可交互仪表盘',
    skills: 'JavaScript / TypeScript / HTML / CSS\nReact / Vue / Git / REST API\nPython / SQL / Excel\n英语 CET-6',
    awards: '一等奖学金 · 2024\n全国大学生英语竞赛 C 类二等奖\n优秀学生干部'
  };

  let rootEl = null;
  let alive = false;
  let state = {};
  let tpl = 'at';
  let paperEl = null;
  let scaleEl = null;
  let previewEl = null;
  let ro = null;
  let paperW = 794; /* 210mm ≈ 794px，mount 后以实测覆盖 */
  const objUrls = []; /* 统一追踪本工具产生的 blob URL，unmount 时 revoke */

  const debRender = debounce(render, 200);

  function lines(v) { return String(v || '').split(/\n+/).map(s => s.trim()).filter(Boolean); }

  /* ================= 预览渲染 ================= */

  function render() {
    if (!alive || !paperEl) return;
    paperEl.className = 'w33-r-paper w33-r-' + tpl;
    const contact = [state.city, state.phone, state.email, state.links]
      .map(s => String(s || '').trim()).filter(Boolean).join(' · ');
    let h = '<header>';
    h += '<h1>' + (esc(state.name) || '<span class="w33-r-hint">你的姓名</span>') + '</h1>';
    if (String(state.role || '').trim()) h += '<div class="r-role">' + esc(state.role) + '</div>';
    if (contact) h += '<div class="w33-r-contact">' + esc(contact) + '</div>';
    h += '</header>';
    SECS.forEach(s => {
      h += '<div class="w33-r-sec"><h3>' + s.t + '</h3>';
      if (s.kind === 'p') {
        h += String(state[s.k] || '').trim()
          ? '<p>' + esc(state[s.k]) + '</p>'
          : '<p class="w33-r-hint">' + s.hint + '</p>';
      } else {
        const arr = lines(state[s.k]);
        h += arr.length
          ? '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'
          : '<ul><li class="w33-r-hint">' + s.hint + '</li></ul>';
      }
      h += '</div>';
    });
    paperEl.innerHTML = h;
  }

  function fillForm() {
    FIELDS.forEach(f => { const el = $('[data-k="' + f.k + '"]', rootEl); if (el) el.value = state[f.k] || ''; });
    SECS.forEach(s => { const el = $('[data-k="' + s.k + '"]', rootEl); if (el) el.value = state[s.k] || ''; });
  }

  /* ================= 操作 ================= */

  function setTpl(id) {
    if (!TPLS.some(t => t.id === id)) return;
    tpl = id;
    LB.storage.set(KEY_STYLE, id);
    $$('.w33-r-tpl', rootEl).forEach(b => b.classList.toggle('on', b.dataset.tpl === id));
    render();
  }

  function save() {
    LB.storage.set(KEY, state);
    LB.toast('已保存到本机，刷新后仍在', 'ok');
  }

  function fillExample() {
    FIELDS.forEach(f => { state[f.k] = EXAMPLE[f.k]; });
    SECS.forEach(s => { state[s.k] = EXAMPLE[s.k]; });
    fillForm();
    render();
    LB.toast('已填入示例数据', 'info');
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    LB.img.download(blob, 'LiteBox-简历.json');
  }

  async function importJSON(file) {
    try {
      const obj = JSON.parse(await file.text());
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('bad json');
      let n = 0;
      FIELDS.forEach(f => { if (typeof obj[f.k] === 'string') { state[f.k] = obj[f.k]; n++; } });
      SECS.forEach(s => { if (typeof obj[s.k] === 'string') { state[s.k] = obj[s.k]; n++; } });
      if (!n) { LB.toast('文件里没有可识别的简历字段', 'warn'); return; }
      fillForm();
      render();
      LB.toast('导入成功，已恢复 ' + n + ' 个字段', 'ok');
    } catch (_) {
      LB.toast('JSON 解析失败，请检查文件内容', 'err');
    }
  }

  /* ================= 缩放适配与打印 ================= */

  function fitScale() {
    if (!alive || !previewEl || !scaleEl) return;
    const avail = previewEl.clientWidth - 28; /* 预览区左右内边距 */
    if (avail <= 0) return;
    const s = Math.min(1, avail / paperW);
    if (CSS.supports('zoom: 1')) {
      /* zoom 参与布局：缩放后不占多余宽度，无需高度修正 */
      scaleEl.style.zoom = s >= 0.999 ? '1' : String(Math.round(s * 1000) / 1000);
    } else {
      /* 降级：transform 缩放（老版 Firefox 等） */
      scaleEl.style.transformOrigin = 'top left';
      scaleEl.style.transform = s >= 0.999 ? '' : 'scale(' + s.toFixed(4) + ')';
    }
  }

  function onBeforePrint() {
    /* 内联缩放样式优先级高于打印 CSS（又不能用 !important），打印前手动移除 */
    if (scaleEl) { scaleEl.style.zoom = ''; scaleEl.style.transform = ''; }
  }
  function onAfterPrint() { fitScale(); }

  function doPrint() {
    onBeforePrint();
    try { window.print(); } finally { setTimeout(onAfterPrint, 400); }
  }

  /* ================= 页面结构 ================= */

  function html() {
    const tpls = TPLS.map(t =>
      '<button type="button" class="w33-r-tpl' + (t.id === tpl ? ' on' : '') + '" data-tpl="' + t.id + '">' +
      '<b>' + t.name + '</b><small>' + t.desc + '</small></button>'
    ).join('');
    const base = FIELDS.map(f =>
      '<div class="field"><label>' + f.lab + '</label>' +
      '<input class="inp" data-k="' + f.k + '" type="text" placeholder="' + f.ph + '" /></div>'
    ).join('');
    const areas = SECS.map(s =>
      '<div class="w33-r-section"><span class="tool-lab">' + s.t + '</span>' +
      '<textarea class="inp" data-k="' + s.k + '" rows="' + s.rows + '" placeholder="' + s.ph + '"></textarea></div>'
    ).join('');
    return '<div id="page-resume">' +
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>简历生成器</h1><p>8 套模板实时预览，支持 JSON 导入导出与 A4 打印 / PDF</p></div>' +
      '</div>' +
      '<div class="tool-body w33-r-layout">' +
      '<div class="w33-r-editor">' +
      '<div class="w33-r-tools">' +
      '<button class="btn btn-ghost btn-sm" id="rExample" type="button">✨ 示例</button>' +
      '<button class="btn btn-main btn-sm" id="rSave" type="button">💾 保存</button>' +
      '<button class="btn btn-ghost btn-sm" id="rExport" type="button">⬇️ 导出 JSON</button>' +
      '<label class="btn btn-ghost btn-sm" for="rImportFile">⬆️ 导入 JSON</label>' +
      '<input type="file" id="rImportFile" accept="application/json,.json" hidden />' +
      '<button class="btn btn-ghost btn-sm" id="rPrint" type="button">🖨️ 打印 / PDF</button>' +
      '</div>' +
      '<div class="w33-r-section"><span class="tool-lab">模板</span><div class="w33-r-tpls">' + tpls + '</div></div>' +
      '<div class="w33-r-section"><span class="tool-lab">基本信息</span><div class="w33-r-grid2">' + base + '</div></div>' +
      areas +
      '</div>' +
      '<div class="w33-r-preview" id="rPreview"><div class="w33-r-scale" id="rScale"><div class="w33-r-paper w33-r-' + tpl + '" id="rPaper"></div></div></div>' +
      '</div>' +
      '</div>';
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML = html();
    paperEl = $('#rPaper', root);
    scaleEl = $('#rScale', root);
    previewEl = $('#rPreview', root);

    const saved = LB.storage.get(KEY, null);
    FIELDS.forEach(f => { state[f.k] = saved && typeof saved[f.k] === 'string' ? saved[f.k] : EXAMPLE[f.k]; });
    SECS.forEach(s => { state[s.k] = saved && typeof saved[s.k] === 'string' ? saved[s.k] : EXAMPLE[s.k]; });
    const st = LB.storage.get(KEY_STYLE, 'at');
    tpl = TPLS.some(t => t.id === st) ? st : 'at';

    fillForm();
    $$('.w33-r-tpl', root).forEach(b => b.classList.toggle('on', b.dataset.tpl === tpl));

    $('#rExample', root).addEventListener('click', fillExample);
    $('#rSave', root).addEventListener('click', save);
    $('#rExport', root).addEventListener('click', exportJSON);
    $('#rImportFile', root).addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    });
    $('#rPrint', root).addEventListener('click', doPrint);

    root.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k || !(k in state)) return;
      state[k] = e.target.value;
      debRender();
    });
    root.addEventListener('click', e => {
      const tp = e.target.closest('[data-tpl]');
      if (tp) { setTpl(tp.dataset.tpl); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });

    render();
    paperW = paperEl.offsetWidth || 794;
    fitScale();
    ro = new ResizeObserver(debounce(fitScale, 120));
    ro.observe(previewEl);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
  }

  function unmount() {
    alive = false;
    if (ro) { ro.disconnect(); ro = null; }
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    objUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
    objUrls.length = 0;
    paperEl = scaleEl = previewEl = rootEl = null;
  }

  LB.router.register('resume', { mount, unmount });
})();
