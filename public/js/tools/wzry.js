/* LiteBox v5 · tools/wzry.js — 王者荣耀英雄查询（Step 25 · 二）
 *
 * 只请求同源 /api/wzry，第三方地址与署名都不出现在前端 / 界面上。
 *
 * 【为什么自己写 apiGet】
 *   LB.api 在 HTTP 非 2xx 时只给「请求失败：HTTP 404」，会把后端精心给的
 *   「未找到该英雄」丢掉。这里按 ocr.js 的既有写法读一次 body.error.message。
 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  /* 热门英雄快捷入口（任务书给定 8 个） */
  const HOT = ['李白', '韩信', '妲己', '鲁班七号', '貂蝉', '后羿', '王昭君', '诸葛亮'];

  /* 基本信息里要展示的四个星级维度（键名与后端字段完全一致） */
  const STARS = [['生存能力', '生存'], ['攻击伤害', '攻击'], ['技能掌控', '技能'], ['操作难度', '难度']];

  /* 技能信息数组：第 0 项是被动（键名「被动」），其余是 1/2/3 技能（键名「名称」） */
  const SKILL_LABELS = ['被动', '一技能', '二技能', '三技能'];

  let rootEl = null;
  let seq = 0;
  let lastName = '';

  async function apiGet(path, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
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

  /* 技能描述里的 <br> 需要变成真换行：
     先整体 esc（防注入），再把转义出来的 &lt;br&gt; 还原成 <br> ——
     顺序不能反，否则就是直接 innerHTML 未转义内容。 */
  function skillDesc(text) {
    return esc(text).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  }

  /* ★★★★☆ → 实心/空心两段，便于用变量配色（不写内联样式） */
  function starsHtml(v) {
    const s = String(v || '');
    if (!s) return '';
    const filled = (s.match(/★/g) || []).length;
    const empty = (s.match(/☆/g) || []).length;
    if (!filled && !empty) return '<span class="wz-plain">' + esc(s) + '</span>';
    return '<span class="wz-stars">' +
      '<b class="wz-star-on">' + '★'.repeat(filled) + '</b>' +
      '<i class="wz-star-off">' + '☆'.repeat(empty) + '</i>' +
      '</span>';
  }

  function relationList(obj) {
    if (!obj || typeof obj !== 'object') return '';
    const items = Object.keys(obj).map(k => obj[k]);
    if (!items.length) return '';
    return '<ul class="wz-rel">' + items.map(t => {
      const s = String(t || '');
      const i = s.indexOf('：');
      /* 有的条目是「鬼谷子：说明」，有的是纯说明文字，都兼容 */
      return i > 0 && i < 20
        ? '<li><b>' + esc(s.slice(0, i)) + '</b>' + esc(s.slice(i + 1)) + '</li>'
        : '<li>' + esc(s) + '</li>';
    }).join('') + '</ul>';
  }

  function section(title, inner) {
    if (!inner) return '';
    return '<div class="card tool-sec wz-sec">' +
      (title ? '<h2 class="wz-h">' + esc(title) + '</h2>' : '') + inner + '</div>';
  }

  function render(d) {
    const box = $('#wzResult', rootEl);
    const base = d['基本信息'] || {};
    const rel = d['英雄关系'] || {};
    const build = d['出装推荐'] || {};
    const runes = d['铭文推荐'] || {};
    const ver = d['版本信息'] || {};

    /* 基本信息卡 */
    let head = '<div class="wz-name"><b>' + esc(base['英雄名称'] || lastName || '') + '</b>' +
      (base['英雄称号'] ? '<i>「' + esc(base['英雄称号']) + '」</i>' : '') +
      (base['英雄类型'] ? '<span class="wz-badge">' + esc(base['英雄类型']) + '</span>' : '') +
      '</div>';
    head += '<div class="wz-rate">' + STARS.map(kv =>
      '<div class="wz-rate-row"><small>' + kv[1] + '</small>' + starsHtml(base[kv[0]]) + '</div>'
    ).join('') + '</div>';

    /* 技能 */
    const skills = Array.isArray(d['技能信息']) ? d['技能信息'] : [];
    let skillHtml = '';
    skills.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const isPassive = !!s['被动'];
      const nm = isPassive ? s['被动'] : s['名称'];
      const meta = [];
      if (s['冷却时间']) meta.push('CD ' + s['冷却时间'] + ' 秒');
      if (s['消耗']) meta.push('消耗 ' + s['消耗']);
      skillHtml += '<div class="wz-skill">' +
        '<div class="wz-skill-top"><span class="wz-skill-kind">' +
        esc(SKILL_LABELS[i] || ('技能' + i)) + '</span>' +
        '<b class="wz-skill-name">' + esc(nm || '') + '</b>' +
        (meta.length ? '<small class="wz-skill-meta">' + esc(meta.join(' · ')) + '</small>' : '') +
        '</div>' +
        (s['描述'] ? '<p class="wz-skill-desc">' + skillDesc(s['描述']) + '</p>' : '') +
        (s['提示'] ? '<p class="wz-skill-tip">💡 ' + esc(s['提示']) + '</p>' : '') +
        '</div>';
    });

    /* 出装：顺风 / 逆风 */
    let buildHtml = '';
    [['顺风出装', '顺风'], ['逆风出装', '逆风']].forEach(kv => {
      const arr = Array.isArray(build[kv[0]]) ? build[kv[0]] : [];
      if (!arr.length) return;
      buildHtml += '<div class="wz-build-row"><small>' + kv[1] + '</small><div class="wz-items">' +
        arr.map(x => '<span class="wz-item">' + esc(x) + '</span>').join('') + '</div></div>';
    });

    /* 铭文：红 / 绿 / 蓝（色团类名交给 CSS，颜色全部走 tokens 变量） */
    let runeHtml = '';
    [['红色铭文', '红', 'wz-rune-r'], ['绿色铭文', '绿', 'wz-rune-g'], ['蓝色铭文', '蓝', 'wz-rune-b']].forEach(kv => {
      const v = runes[kv[0]];
      if (!v) return;
      runeHtml += '<div class="wz-rune ' + kv[2] + '"><small>' + kv[1] + '</small><b>' + esc(String(v)) + '</b></div>';
    });

    /* 进阶技巧：使用 / 对抗 / 团战 */
    let tipHtml = '';
    [['使用技巧', '怎么用'], ['对抗技巧', '怎么打'], ['团战思路', '团战']].forEach(kv => {
      const v = d[kv[0]];
      if (!v || typeof v !== 'string') return;
      tipHtml += '<div class="wz-tip"><small>' + kv[1] + '</small><p>' + esc(v) + '</p></div>';
    });

    /* 英雄关系 */
    let relHtml = '';
    [['最佳搭档', '🤝 最佳搭档'], ['克制', '⚔️ 他克制'], ['被克制', '🛡️ 克制他']].forEach(kv => {
      const inner = relationList(rel[kv[0]]);
      if (!inner) return;
      relHtml += '<div class="wz-rel-wrap"><small>' + kv[1] + '</small>' + inner + '</div>';
    });

    /* 版本信息 */
    let verHtml = '';
    if (ver['更新时间'] || ver['更新提示']) {
      verHtml = '<div class="wz-ver">' +
        (ver['更新时间'] ? '<small>数据更新 ' + esc(String(ver['更新时间'])) + '</small>' : '') +
        (ver['更新提示'] ? '<p>' + esc(String(ver['更新提示'])) + '</p>' : '') + '</div>';
    }

    box.innerHTML =
      section('基本信息', head) +
      section('技能', skillHtml) +
      section('出装推荐', buildHtml) +
      section('铭文推荐', runeHtml) +
      section('进阶技巧', tipHtml) +
      section('英雄关系', relHtml) +
      (verHtml ? section('版本信息', verHtml) : '');
    box.hidden = false;
  }

  function showErr(msg) {
    const box = $('#wzResult', rootEl);
    box.innerHTML = '';
    box.hidden = false;
    LB.ui.empty(box, {
      icon: '🔎',
      title: msg || '未找到该英雄',
      sub: '可以试试英雄名全称，或点下方热门英雄快捷查询',
      ctaText: '查询热门英雄',
      onCta: () => { $('#wzName', rootEl).value = HOT[0]; run(); }
    });
  }

  async function run(nameArg) {
    if (!HAS_API) {
      const box = $('#wzResult', rootEl);
      box.hidden = false;
      LB.ui.empty(box, { icon: '🌐', title: '该工具需要联网服务支持', sub: '本地文件预览方式打不开' });
      return;
    }
    const name = String(nameArg || $('#wzName', rootEl).value || '').trim();
    if (!name) { LB.toast('请输入英雄名称', 'info'); return; }
    $('#wzName', rootEl).value = name;
    lastName = name;
    const my = ++seq;
    $$('#wzChips .chip', rootEl).forEach(c => c.classList.toggle('on', c.getAttribute('data-n') === name));
    const btn = $('#wzGo', rootEl);
    btn.disabled = true;
    const box = $('#wzResult', rootEl);
    box.hidden = false;
    LB.ui.skeleton(box, 3, 'card');
    try {
      const d = await apiGet('/api/wzry?name=' + encodeURIComponent(name), 12000);
      if (my !== seq) return;
      render(d);
    } catch (e) {
      if (my !== seq) return;
      const msg = (e && e.message) || '未找到该英雄';
      showErr(msg);
      LB.fail('英雄查询', msg, '换个英雄名或稍后重试');
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>王者荣耀英雄查询</h1><p>查询英雄的出装、技能、铭文、对线技巧</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec wz-search">' +
      '<input class="inp" id="wzName" maxlength="20" placeholder="输入英雄名称，例如：李白" aria-label="英雄名称" />' +
      '<button class="btn btn-main" id="wzGo" type="button">🔍 查询</button>' +
      '</div>' +
      '<div class="hl-chips" id="wzChips">' +
      HOT.map(n => '<button class="chip" data-n="' + esc(n) + '" type="button">' + esc(n) + '</button>').join('') +
      '</div>' +
      '<div id="wzResult" hidden></div>' +
      '<p class="cd-note">英雄数据为公开攻略整理，游戏版本更新后可能与实际略有出入。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#wzGo', root).addEventListener('click', () => run());
    LB.enterSubmit($('#wzName', root), () => run());
    $('#wzChips', root).addEventListener('click', e => {
      const c = e.target.closest('[data-n]');
      if (c) run(c.getAttribute('data-n'));
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    seq++;
    lastName = '';
    rootEl = null;
  }

  LB.router.register('wzry', { mount, unmount });
})();
