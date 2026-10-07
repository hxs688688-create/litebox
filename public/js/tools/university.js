/* LiteBox v5 · tools/university.js — 全国高校查询（721 所，按省份 / 层次筛选）
 *
 * 【省份下拉为什么从数据里现取，而不是写死 31 个省】
 *   写死一份省份清单，一旦字典新增省份（或某省改名）就会出现「筛了却没有结果」。
 *   直接从数据里 distinct 出省份并按字典序排，永远与数据同步。
 *
 * 【官网链接的降级策略】
 *   字典里只有 165 所收录了官网域名（其余为省属院校，域名口径不统一，写错反而误导）。
 *   因此渲染时：有 site → 直连官网；没有 site → 退化成必应搜索「校名 官网」。
 *   这样每个条目都有可点的「官网」入口，且绝不给出错误域名。
 *
 * 【层次口径】985 ⊂ 211 ⊂ 双一流，字典里已按此把 level 数组写全，
 *   前端只做「是否包含该层次」的判断，不再自行推导，避免口径漂移。
 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  const LEVELS = ['全部', '985', '211', '双一流'];
  const MAX_SHOW = 120;

  let rootEl = null;
  let data = [];
  let loaded = false;
  let failed = false;
  let level = '全部';
  let province = '全部';

  function provinces() {
    const set = [];
    data.forEach(u => { if (set.indexOf(u.p) < 0) set.push(u.p); });
    set.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    return ['全部'].concat(set);
  }

  function renderProvinceSelect() {
    const sel = $('#uniProv', rootEl);
    const cur = province;
    sel.innerHTML = provinces().map(p => '<option value="' + esc(p) + '">' + (p === '全部' ? '全部省份' : esc(p)) + '</option>').join('');
    /* 数据重载后若原选中项仍在，保持选中；否则回落全部 */
    sel.value = provinces().indexOf(cur) >= 0 ? cur : '全部';
    province = sel.value;
  }

  function filter() {
    const q = String($('#uniIn', rootEl).value || '').trim().toLowerCase();
    let list = data;
    if (province !== '全部') list = list.filter(u => u.p === province);
    if (level !== '全部') list = list.filter(u => Array.isArray(u.level) && u.level.indexOf(level) >= 0);
    if (q) list = list.filter(u => (u.n + u.p + u.type).toLowerCase().indexOf(q) >= 0);
    /* 层次高的排前面：985 > 211 > 双一流 > 其它，同级按省份 */
    const rank = u => {
      const L = u.level || [];
      if (L.indexOf('985') >= 0) return 0;
      if (L.indexOf('211') >= 0) return 1;
      if (L.indexOf('双一流') >= 0) return 2;
      return 3;
    };
    return list.slice().sort((a, b) => rank(a) - rank(b) || a.p.localeCompare(b.p, 'zh-Hans-CN'));
  }

  function badge(lv) {
    const cls = lv === '985' ? 'lv985' : lv === '211' ? 'lv211' : 'lvsy';
    return '<span class="uni-badge ' + cls + '">' + esc(lv) + '</span>';
  }

  function siteHref(u) {
    if (u.site) return u.site;
    return 'https://www.bing.com/search?q=' + encodeURIComponent(u.n + ' 官网');
  }

  function render() {
    if (!rootEl) return;
    const box = $('#uniList', rootEl);
    const tip = $('#uniTip', rootEl);
    if (!loaded) { box.innerHTML = '<p class="cd-note">正在加载高校库…</p>'; tip.textContent = ''; return; }
    if (failed) { box.innerHTML = '<p class="cd-note">高校库加载失败，请刷新重试。</p>'; tip.textContent = ''; return; }
    const list = filter();
    tip.textContent = '高校库共 ' + data.length + ' 所 · 匹配 ' + list.length + ' 所' + (list.length > MAX_SHOW ? '（仅显示前 ' + MAX_SHOW + '）' : '');
    if (!list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '🎓',
        title: '没有符合条件的高校',
        sub: '试试换个关键词，或把筛选条件放宽'
      });
      return;
    }
    box.innerHTML = list.slice(0, MAX_SHOW).map(u =>
      '<div class="uni-item">' +
      '<div class="uni-main"><div class="uni-name">' + esc(u.n) + '</div>' +
      '<div class="uni-meta"><span>' + esc(u.p) + '</span><span class="uni-type">' + esc(u.type) + '</span>' +
      (Array.isArray(u.level) ? u.level.map(badge).join('') : '') + '</div></div>' +
      '<a class="uni-site btn btn-ghost btn-sm" href="' + esc(siteHref(u)) + '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="' + esc(u.n + ' 官网') + '">官网 ↗</a>' +
      '</div>'
    ).join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>高校查询</h1><p>全国高校信息查询，可按省份、985 / 211 / 双一流筛选</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="pc-bar">' +
      '<input class="inp" id="uniIn" type="search" placeholder="搜索校名，如：清华 / 师范 / 大学" aria-label="搜索高校">' +
      '<button class="btn btn-main js-primary-submit" id="uniGo" type="button">查询</button>' +
      '</div>' +
      '<div class="uni-filter">' +
      '<label class="pz-lab pp-way">省份<select class="inp" id="uniProv" aria-label="按省份筛选"></select></label>' +
      '<div class="hl-chips uni-chips" id="uniLevels"></div>' +
      '</div>' +
      '<p class="cd-note" id="uniTip"></p>' +
      '<div class="uni-list" id="uniList"></div>' +
      '<p class="cd-note">名单与层次以教育部及公开资料整理，仅供参考；报考请以官方最新公布为准。数据全部内置，不上传。</p>' +
      '</div>'
    );
  }

  function renderLevels() {
    $('#uniLevels', rootEl).innerHTML = LEVELS.map(l =>
      '<button class="chip' + (l === level ? ' on' : '') + '" data-lv="' + esc(l) + '" type="button">' + esc(l) + '</button>'
    ).join('');
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    failed = false;
    level = '全部';
    province = '全部';
    renderLevels();
    render();

    $('#uniIn', root).addEventListener('input', render);
    $('#uniGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; render(); });
    $('#uniProv', root).addEventListener('change', e => { province = e.target.value; render(); });
    $('#uniLevels', root).addEventListener('click', e => {
      const b = e.target.closest('[data-lv]');
      if (!b) return;
      level = b.dataset.lv;
      renderLevels();
      render();
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    if (!loaded) {
      LB.dict.load('universities')
        .then(d => {
          if (!rootEl) return;
          data = Array.isArray(d) ? d : [];
          loaded = true;
          failed = !data.length;
          renderProvinceSelect();
          render();
          if (failed) LB.toast('高校库为空', 'err');
        })
        .catch(() => {
          if (!rootEl) return;
          loaded = true; failed = true;
          render();
          LB.toast('高校库加载失败', 'err');
        });
    } else {
      renderProvinceSelect();
      render();
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('university', { mount, unmount });
})();
