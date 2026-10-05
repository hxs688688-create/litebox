/* LiteBox v5 · tools/today_history.js — 历史上的今天（366 天索引，时间轴展示）
 *
 * 【日期推进为什么固定用闰年 2000 年做基准】
 *   字典里有 02-29。若用普通年份的 Date 推进，2 月 28 日的「后一天」会变成 3 月 1 日，
 *   2 月 29 日永远到不了。固定基准年为闰年（2000），就能在 02-28 ↔ 02-29 ↔ 03-01 之间正常来回。
 *
 * 【切换日期用 Date 的加减，而不是自己拼月份】
 *   跨月、跨年（12-31 → 01-01）的进位交给 Date 处理，避免手写模运算出错。
 *
 * 【无数据日期必须明确提示】
 *   「暂无记录」和「加载失败」是两回事，不能都渲染成空白。
 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  /* 用闰年做基准，保证 02-29 可到达 */
  const BASE_YEAR = 2000;

  let rootEl = null;
  let data = {};
  let loaded = false;
  let cur = null;   /* 当前查看的 Date（基准年） */

  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function todayBase() {
    const n = new Date();
    return new Date(BASE_YEAR, n.getMonth(), n.getDate());
  }

  function isToday() {
    const t = todayBase();
    return cur && cur.getMonth() === t.getMonth() && cur.getDate() === t.getDate();
  }

  function shift(delta) {
    cur = new Date(BASE_YEAR, cur.getMonth(), cur.getDate() + delta);
    render();
  }

  function goToday() { cur = todayBase(); render(); }

  function randomDay() {
    const start = new Date(BASE_YEAR, 0, 1).getTime();
    const end = new Date(BASE_YEAR + 1, 0, 1).getTime();
    cur = new Date(start + Math.floor(Math.random() * (end - start)));
    render();
    LB.toast('随机到了 ' + (cur.getMonth() + 1) + ' 月 ' + cur.getDate() + ' 日', 'info');
  }

  function render() {
    if (!rootEl) return;
    const k = keyOf(cur);
    $('#thDate', rootEl).textContent = (cur.getMonth() + 1) + ' 月 ' + cur.getDate() + ' 日';
    const tag = $('#thToday', rootEl);
    tag.hidden = !isToday();

    const box = $('#thList', rootEl);
    if (!loaded) { box.innerHTML = '<p class="cd-note">正在加载历史数据…</p>'; return; }
    const list = data[k];
    if (!Array.isArray(list) || !list.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '📅',
        title: '这一天暂无记录',
        sub: '试试「前一天 / 后一天」或「随机一天」'
      });
      return;
    }
    /* 按年份升序排，时间轴从早到晚 */
    const sorted = list.slice().sort((a, b) => a.y - b.y);
    box.innerHTML = sorted.map(it =>
      '<div class="th-item">' +
      '<div class="th-year">' + (it.y < 0 ? '公元前 ' + Math.abs(it.y) + ' 年' : it.y + ' 年') + '</div>' +
      '<div class="th-ev">' + esc(it.e) + '</div>' +
      '</div>'
    ).join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>历史今日</h1><p>每天查看历史上今天发生的大事，本地数据</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card th-head">' +
      '<div class="th-nav">' +
      '<button class="btn btn-ghost btn-sm" id="thPrev" type="button">‹ 前一天</button>' +
      '<div class="th-cur"><span class="th-lab">今天：</span><b id="thDate"></b><span class="th-tag" id="thToday" hidden>今天</span></div>' +
      '<button class="btn btn-ghost btn-sm" id="thNext" type="button">后一天 ›</button>' +
      '</div>' +
      '<div class="th-acts">' +
      '<button class="btn btn-main btn-sm js-primary-submit" id="thRandom" type="button">🎲 随机一天</button>' +
      '<button class="btn btn-ghost btn-sm" id="thTodayBtn" type="button">回到今天</button>' +
      '</div>' +
      '</div>' +
      '<div class="th-list" id="thList"></div>' +
      '<p class="cd-note">📌 数据整理自公开历史资料，仅供学习参考。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    cur = todayBase();
    render();

    $('#thPrev', root).addEventListener('click', () => shift(-1));
    $('#thNext', root).addEventListener('click', () => shift(1));
    $('#thRandom', root).addEventListener('click', randomDay);
    $('#thTodayBtn', root).addEventListener('click', goToday);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    if (!loaded) {
      LB.dict.load('historyToday')
        .then(d => {
          if (!rootEl) return;
          data = (d && typeof d === 'object') ? d : {};
          loaded = true;
          render();
        })
        .catch(() => {
          if (!rootEl) return;
          loaded = true;
          render();
          LB.toast('历史数据加载失败', 'err');
        });
    } else {
      render();
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('today_history', { mount, unmount });
})();
