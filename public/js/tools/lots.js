/* LiteBox v5 · tools/lots.js — 随机抽签（LB.rng 洗牌，不重复 / 可重复双模式，历史本地保存） */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const KEY_HIST = 'litebox_lot_hist';

  let rootEl = null;
  let hist = []; /* [{ v, time }]，最新在前，最多存 20 条 */

  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };

  /* 解析名单：按 换行/逗号/顿号/分号/Tab 分割 + trim + 过滤空 */
  function parse(text) {
    return text.split(/[\n,，、;；\t]+/).map(s => s.trim()).filter(Boolean);
  }

  function saveHist() { LB.storage.set(KEY_HIST, hist.slice(0, 20)); }

  function renderHist() {
    $('#ltHist', rootEl).innerHTML = hist.slice(0, 8).map(h =>
      '<div class="lot-hist-item"><span>' + esc(h.v) + '</span><small>' + esc(h.time) + '</small></div>'
    ).join('');
    $('#ltHistLab', rootEl).textContent = '历史记录（' + Math.min(hist.length, 8) + ' 条）';
  }

  function run() {
    const list = parse($('#ltText', rootEl).value);
    if (!list.length) { LB.toast('请输入候选名单（每行一个）', 'info'); return; }

    let n = Math.min(50, Math.max(1, parseInt($('#ltNum', rootEl).value, 10) || 1));
    const unique = $('#ltUnique', rootEl).checked;
    let picks = [];

    if (unique) {
      if (n > list.length) {
        n = list.length;
        $('#ltNum', rootEl).value = n;
        LB.toast('名单只有 ' + list.length + ' 项，已自动调整数量', 'info');
      }
      picks = LB.rng.shuffle(list.slice()).slice(0, n); /* 洗牌后取前 N 个 */
    } else {
      for (let i = 0; i < n; i++) picks.push(list[LB.rng.int(0, list.length - 1)]); /* 可重复 */
    }

    /* 结果药丸：pop 动画，delay 逐项 +40ms（DOM API 设置，非内联 style 属性） */
    $('#ltResult', rootEl).innerHTML = picks.map(p =>
      '<span class="lot-pill">' + esc(p) + '</span>'
    ).join('');
    $$('.lot-pill', rootEl).forEach((el, i) => { el.style.animationDelay = (i * 40) + 'ms'; });

    hist.unshift({ v: picks.join(' / '), time: nowText() });
    hist = hist.slice(0, 20);
    saveHist();
    renderHist();
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>随机抽签</h1><p>输入名单抽 1 或多签，不重复抽取，带历史记录</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">候选名单（每行一个，也可用逗号 / 顿号分隔）</span>' +
      '<textarea class="inp mono-area" id="ltText" rows="6" maxlength="2000" placeholder="张三, 李四、王五&#10;赵六"></textarea>' +
      '<div class="lt-row">' +
      '<label class="pz-lab">抽取数量<input class="inp" id="ltNum" type="number" min="1" max="50" value="1" /></label>' +
      '<label class="chk-row"><input type="checkbox" id="ltUnique" checked /> 不重复抽取</label>' +
      '<button class="btn btn-main" id="ltGo" type="button">🎰 抽签</button>' +
      '</div>' +
      '</div>' +
      '<div class="lot-result" id="ltResult"></div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab" id="ltHistLab">历史记录（0 条）</span>' +
      '<div class="lot-hist" id="ltHist"></div>' +
      '</div>' +
      '<p class="cd-note">抽取由加密随机数驱动，公平公正；历史最多保存 20 条，仅存于本设备浏览器。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const saved = LB.storage.get(KEY_HIST, []);
    hist = Array.isArray(saved) ? saved.filter(h => h && typeof h.v === 'string') : [];
    renderHist();
    $('#ltGo', root).addEventListener('click', run);
    /* Ctrl/⌘+Enter 快速抽签 */
    $('#ltText', root).addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('lots', { mount, unmount });
})();
