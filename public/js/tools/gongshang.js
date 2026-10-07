/* LiteBox v5 · tools/gongshang.js — 全国工商信息查询（Step 26 · 三）
 *
 * 只请求同源 /api/gongshang；界面上不出现任何第三方域名或来源标注。
 * 后端已把 <em> 高亮标签剥掉，前端只做转义渲染。
 *
 * 免责声明是任务书「必须」项，原文照抄在结果卡底部。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let seq = 0;

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    let r = null, text = '';
    try {
      r = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '查询超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '查询服务暂时不可用');
    return d;
  }

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
    const btn = $('#gsGo', rootEl);
    btn.disabled = true;
    const box = $('#gsResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await apiGet('/api/gongshang?name=' + encodeURIComponent(name), 15000);
      if (my !== seq) return;
      render(d);
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
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#gsGo', root).addEventListener('click', run);
    LB.enterSubmit($('#gsName', root), run);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    rootEl = null;
  }

  LB.router.register('gongshang', { mount, unmount });
})();
