/* LiteBox v5 · tools/gongshang.js — 全国工商信息查询（Step 26 · 三 / Step 31 · 一）
 *
 * 只请求同源 /api/gongshang；界面上不出现任何第三方域名或来源标注。
 * 后端已把 <em> 高亮标签剥掉，前端只做转义渲染。
 *
 * Step 31 · 一：多结果（后端 code:300）不再是错误，而是弹 LB 现有 Sheet 组件，
 *   列出「公司名称 + 法定代表人 + 成立时间 + 状态」，点某一条后带
 *   ?select=<该条 select> 再查一次详情；Sheet 层预先写在工具 DOM 里
 *   （LB.ui.sheet.open(id) 要求文档中已存在该 .sheet-mask 节点）。
 *   网络请求同步改为走 LB.api.getJSON（红线：新代码统一走 LB.api）。
 *
 * 免责声明是任务书「必须」项，原文照抄在结果卡底部。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;
  let lastQuery = null;   /* 记住本轮关键词，选择层点击后复用 */

  function cell(label, value) {
    return '<div class="gs-cell"><small>' + esc(label) + '</small><b>' +
      (value ? esc(String(value)) : '—') + '</b></div>';
  }

  function render(d) {
    const box = $('#gsResult', rootEl);

    const head =
      '<h2 class="gs-name">' + esc(d.name || '') + '</h2>' +
      '<div class="gs-tags">' +
      (d.matchType ? '<span class="gs-badge">' + esc(d.matchType) + '</span>' : '') +
      (d.regStatus ? '<span class="gs-badge gs-status">' + esc(d.regStatus) + '</span>' : '') +
      (d.companyType ? '<span class="gs-badge">' + esc(d.companyType) + '</span>' : '') +
      '</div>' +
      (d.historyName ? '<p class="gs-history">曾用名：' + esc(d.historyName) + '</p>' : '');

    const base = '<div class="gs-grid">' +
      cell('法定代表人', d.legalPerson) +
      cell('注册资本', d.regCapital) +
      cell('成立日期', d.establishTime) +
      cell('经营状态', d.regStatus) +
      cell('企业类型', d.companyType) +
      cell('统一社会信用代码', d.creditCode) +
      (d.regNumber ? cell('工商注册号', d.regNumber) : '') +
      (d.industry ? cell('行业', d.industry) : '') +
      (d.base ? cell('所属地区', d.base) : '') +
      '</div>';

    const contact =
      (d.phone || d.email || d.address)
        ? '<div class="gs-grid">' +
          cell('联系电话', d.phone) +
          cell('联系邮箱', d.email) +
          cell('注册地址', d.address) +
          '</div>'
        : '';

    /* 经营范围默认收起：用 <details> 原生折叠，不写任何内联样式 */
    const scope = d.businessScope
      ? '<details class="gs-scope"><summary>经营范围</summary><p>' + esc(d.businessScope) + '</p></details>'
      : '';

    const abs = d.abstract ? '<p class="gs-abstract">' + esc(d.abstract) + '</p>' : '';

    box.innerHTML =
      '<div class="card tool-sec gs-card">' + head + base + '</div>' +
      (contact ? '<div class="card tool-sec gs-card"><h3 class="gs-h">联系方式</h3>' + contact + '</div>' : '') +
      (scope ? '<div class="card tool-sec gs-card">' + scope + '</div>' : '') +
      (abs ? '<div class="card tool-sec gs-card"><h3 class="gs-h">摘要</h3>' + abs + '</div>' : '') +
      '<p class="gs-disclaim">⚠️ 数据来自公开渠道，仅供参考。正式用途请以国家企业信用信息公示系统为准。</p>';
    box.hidden = false;
  }

  /* Step 31 · 一：多结果选择层内容（4 项：名称 / 法定代表人 / 成立时间 / 状态） */
  function renderPick(list) {
    $('#gsPickSum', rootEl).textContent = '找到 ' + list.length + ' 家相关企业，点击查看详细';
    $('#gsPickList', rootEl).innerHTML = list.map(x =>
      '<button class="gs-pick" type="button" data-sel="' + esc(String(x.select)) + '">' +
      '<b class="gs-pick-n">' + esc(x.name || '（未提供名称）') + '</b>' +
      '<span class="gs-pick-m">' +
      '<small>法定代表人</small><i>' + esc(x.legalPerson || '—') + '</i>' +
      '<small>成立时间</small><i>' + esc(x.establishTime || '—') + '</i>' +
      '<small>状态</small><i class="gs-pick-st">' + esc(x.regStatus || '—') + '</i>' +
      '</span>' +
      '<span class="gs-pick-go" aria-hidden="true">›</span>' +
      '</button>'
    ).join('');
    LB.ui.sheet.open('gsPickSheet');
  }

  /* 查详情：select 为空表示首轮（可能返回 300 多结果） */
  async function query(name, select) {
    let path = '/api/gongshang?name=' + encodeURIComponent(name);
    if (select !== undefined && select !== null && select !== '') path += '&select=' + encodeURIComponent(select);
    return LB.api.getJSON(path, { timeout: 15000 });
  }

  async function run() {
    if (!HAS_API) {
      const box = $('#gsResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const name = $('#gsName', rootEl).value.trim();
    if (!name) { LB.toast('请输入企业名称', 'info'); return; }
    const my = ++seq;
    lastQuery = name;
    const btn = $('#gsGo', rootEl);
    btn.disabled = true;
    const box = $('#gsResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await query(name);
      if (my !== seq) return;
      /* Step 31 · 一：code 300 = 多条匹配 → 弹选择层，不当错误处理 */
      if (d && d.code === 300 && Array.isArray(d.list) && d.list.length) {
        LB.ui.empty(box, {
          icon: '🏢',
          title: '匹配到 ' + d.list.length + ' 家相关企业',
          sub: '请选择要查看的那一家',
          ctaText: '重新选择',
          onCta: () => renderPick(d.list)
        });
        renderPick(d.list);
        return;
      }
      render(d || {});
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '未找到该企业信息';
      LB.ui.empty(box, {
        icon: '🏢',
        title: msg,
        sub: '建议输入企业全称，例如「阿里巴巴集团控股有限公司」',
        ctaText: '查询示例企业',
        onCta: () => { $('#gsName', rootEl).value = '阿里巴巴集团控股有限公司'; run(); }
      });
      LB.fail('工商查询', msg, '换全称或稍后重试');
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }

  /* 选择层里点了某条 → 带 select 再查一次详情 */
  async function pick(select) {
    if (!lastQuery) return;
    const my = ++seq;
    LB.ui.sheet.close();
    const btn = $('#gsGo', rootEl);
    btn.disabled = true;
    const box = $('#gsResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await query(lastQuery, select);
      if (my !== seq) return;
      if (d && d.code === 300) { renderPick(d.list); return; }   /* 上游仍回多条：继续选 */
      render(d || {});
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '详情获取失败，请稍后重试';
      LB.ui.empty(box, { icon: '🏢', title: msg, sub: '可以换个关键词，或重新从列表里选一家' });
      LB.fail('工商查询', msg, '重新选择或稍后重试');
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>工商信息查询</h1><p>查企业法人、注册资本、成立日期、经营状态、注册地址</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec gs-search">' +
      '<input class="inp" id="gsName" maxlength="60" placeholder="输入企业全称，如：阿里巴巴集团控股有限公司" aria-label="企业名称" />' +
      '<button class="btn btn-main" id="gsGo" type="button">🔍 查询</button>' +
      '</div>' +
      '<div id="gsResult" hidden></div>' +
      '</div>' +
      /* Step 31 · 一：多结果选择层（LB 现有 Sheet 组件，节点必须预先存在于文档中） */
      '<div class="sheet-mask" id="gsPickSheet" hidden>' +
      '<section class="sheet" role="dialog" aria-modal="true" aria-label="选择企业">' +
      '<header class="sheet-hd">' +
      '<div><h2>选择企业</h2><p id="gsPickSum">找到多家相关企业，请选择</p></div>' +
      '<button class="sheet-x" data-close type="button" aria-label="关闭">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
      '</button>' +
      '</header>' +
      '<div class="gs-picks" id="gsPickList"></div>' +
      '</section>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#gsGo', root).addEventListener('click', run);
    LB.enterSubmit($('#gsName', root), run);
    /* 选择层：事件委托读 data-sel，动态生成的条目也能响应 */
    $('#gsPickList', root).addEventListener('click', e => {
      const b = e.target.closest('.gs-pick');
      if (!b) return;
      const sel = b.getAttribute('data-sel');
      if (sel) pick(sel);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    /* 弹层开着时切走：交给 sheet.close() 摘掉 body.scroll-lock，
       否则页面会保持「禁止滚动」状态 */
    if (LB.ui.sheet.isOpen('gsPickSheet')) LB.ui.sheet.close();
    lastQuery = null;
    rootEl = null;
  }

  LB.router.register('gongshang', { mount, unmount });
})();
