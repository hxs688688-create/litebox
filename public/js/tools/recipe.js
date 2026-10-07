/* LiteBox v5 · tools/recipe.js — 菜谱查询（200 道家常菜，按菜名 / 主料 / 分类检索）
 *
 * 【检索为什么要同时匹配「菜名 + 主料 + 分类」】
 *   用户搜「西红柿」时想找的是「西红柿炒鸡蛋」，但菜名里可能只写「番茄」；
 *   搜「鸡」时又希望把「宫保鸡丁 / 可乐鸡翅 / 口水鸡」全带出来。
 *   所以把 菜名 + 主料 + 分类 拼成一个检索串做子串匹配，
 *   既覆盖「按食材找菜」，也覆盖「按菜名找菜」。
 *
 * 【展开详情用内联手风琴而不是弹层】
 *   步骤文本较长，弹层在 375px 手机上要么挤要么要滚动两层；
 *   直接在卡片内展开，用户视线不跳走，也天然支持同时对比多道菜。
 *   steps 里的换行靠 CSS 的 white-space:pre-line 还原，不手动拆 <br>。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const CATS = ['全部', '家常菜', '肉类', '素菜', '汤', '面食', '早餐', '甜点'];
  const MAX_SHOW = 120;

  let rootEl = null;
  let data = [];
  let loaded = false;
  let cat = '全部';
  const openSet = new Set();  /* 已展开的菜名，切筛选后按名保留 */

  function renderCats() {
    $('#rcChips', rootEl).innerHTML = CATS.map(c =>
      '<button class="chip' + (c === cat ? ' on' : '') + '" data-cat="' + esc(c) + '" type="button">' + esc(c) + '</button>'
    ).join('');
  }

  function filter() {
    const q = String($('#rcIn', rootEl).value || '').trim().toLowerCase();
    let list = cat === '全部' ? data : data.filter(r => r.cat === cat);
    if (q) {
      list = list.filter(r => {
        const hay = (r.n + ' ' + (r.main || []).join(' ') + ' ' + r.cat).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    return list;
  }

  function cardHtml(r) {
    const open = openSet.has(r.n);
    const mains = (r.main || []).map(m => '<span class="rc-tag">' + esc(m) + '</span>').join('');
    const ing = (r.ing || []).map(i => '<li>' + esc(i) + '</li>').join('');
    return '<article class="rc-card' + (open ? ' open' : '') + '" data-n="' + esc(r.n) + '">' +
      '<button class="rc-head" type="button" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="rc-title"><b>' + esc(r.n) + '</b><small class="rc-cat">' + esc(r.cat) + '</small></span>' +
      '<span class="rc-mains">' + mains + '</span>' +
      '<span class="rc-arrow" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="rc-detail"' + (open ? '' : ' hidden') + '>' +
      '<div class="rc-sec"><span class="tool-lab">食材</span><ul class="rc-ing">' + ing + '</ul></div>' +
      '<div class="rc-sec"><span class="tool-lab">做法</span><p class="rc-steps">' + esc(r.steps || '') + '</p></div>' +
      (r.tip ? '<div class="rc-tip">💡 ' + esc(r.tip) + '</div>' : '') +
      '</div></article>';
  }

  function render() {
    if (!rootEl) return;
    const box = $('#rcList', rootEl);
    const tip = $('#rcTip', rootEl);
    if (!loaded) { box.innerHTML = '<p class="cd-note">正在加载菜谱库…</p>'; tip.textContent = ''; return; }
    const list = filter();
    tip.textContent = '菜谱库共 ' + data.length + ' 道 · 匹配 ' + list.length + ' 道' + (list.length > MAX_SHOW ? '（仅显示前 ' + MAX_SHOW + '）' : '');
    if (!list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '🍳',
        title: '没找到匹配的菜',
        sub: '试试搜「西红柿」「鸡」「豆腐」这样的食材关键词'
      });
      return;
    }
    box.innerHTML = list.slice(0, MAX_SHOW).map(cardHtml).join('');
  }

  function toggle(name) {
    const card = $('[data-n="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]', rootEl);
    if (!card) return;
    const head = card.querySelector('.rc-head');
    const detail = card.querySelector('.rc-detail');
    const nowOpen = !card.classList.contains('open');
    card.classList.toggle('open', nowOpen);
    if (head) head.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
    if (detail) detail.hidden = !nowOpen;
    if (nowOpen) openSet.add(name); else openSet.delete(name);
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>菜谱查询</h1><p>200 道家常菜谱，按菜名或食材检索，含做法步骤</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="pc-bar">' +
      '<input class="inp" id="rcIn" type="search" placeholder="搜索菜名或食材，如：西红柿 / 鸡 / 豆腐" aria-label="搜索菜谱">' +
      '<button class="btn btn-main js-primary-submit" id="rcGo" type="button">查询</button>' +
      '</div>' +
      '<div class="hl-chips" id="rcChips"></div>' +
      '<p class="cd-note" id="rcTip"></p>' +
      '<div class="rc-grid" id="rcList"></div>' +
      '<p class="cd-note">点击菜卡展开食材与做法。用量为 2-3 人份参考，可按口味增减。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    cat = '全部';
    openSet.clear();
    renderCats();
    render();

    $('#rcIn', root).addEventListener('input', render);
    $('#rcGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; render(); });
    $('#rcChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      cat = b.dataset.cat;
      renderCats();
      render();
    });
    $('#rcList', root).addEventListener('click', e => {
      const head = e.target.closest('.rc-head');
      if (!head) return;
      const card = head.closest('[data-n]');
      if (card) toggle(card.dataset.n);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    if (!loaded) {
      LB.dict.load('recipes')
        .then(d => {
          if (!rootEl) return;
          data = Array.isArray(d) ? d : [];
          loaded = true;
          render();
        })
        .catch(() => {
          if (!rootEl) return;
          loaded = true;
          render();
          LB.toast('菜谱库加载失败', 'err');
        });
    } else {
      render();
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('recipe', { mount, unmount });
})();
