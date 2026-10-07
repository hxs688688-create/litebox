/* LiteBox v5 · tools/medbox.js — 药品信息查询（自建本地药品库，纯离线，非医疗建议）
   Step 6D：从 OpenFDA（美国，中文药查不到）改为自建库 vendor/dict/drugs.js */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  let rootEl = null;
  let db = null;         /* vendor/dict/drugs.js */
  let loadErr = false;

  /* 本库为「按需加载」，未加载完时先给提示而不是静默无结果 */
  function notReady() {
    if (loadErr) { LB.toast('药品库加载失败，请检查网络后刷新重试', 'err'); return true; }
    if (!db) { LB.toast('药品库加载中，请稍候', 'info'); return true; }
    return false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>药品信息查询</h1><p>查询常用药品的用途、用法与警示</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      /* Step 6D：顶部橙色警示条（任务书指定文案，位置在查询框之上） */
      '<div class="src-note warn">数据仅供健康参考，用药请遵医嘱。孕妇、儿童、慢性病患者请咨询医师或药师。</div>' +
      '<div class="card tool-sec">' +
      '<div class="mb-form">' +
      '<input class="inp" id="mbName" maxlength="30" placeholder="输入药品名或商品名，如：布洛芬 / 芬必得" />' +
      '<button class="btn btn-main js-primary-submit" id="mbGo" type="button">💊 查询药品</button>' +
      '</div>' +
      '<p class="mb-tip" id="mbCount"></p>' +
      '</div>' +
      '<div id="mbResult" hidden></div>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">药品信息仅供参考，用药请遵医嘱。</span></div>' +
      '</div>'
    );
  }

  /* 匹配：通用名 n 与商品名 brand 双向 includes；先精确再模糊，结果按匹配度排序 */
  function findAll(q) {
    const kw = String(q || '').trim();
    if (!kw) return [];
    const list = db || [];
    const score = it => {
      const n = it.n || '', b = it.brand || '';
      if (n === kw) return 100;
      if (b === kw) return 95;
      if (b.split(/[\/、\s]+/).some(x => x && x === kw)) return 90;
      if (n.indexOf(kw) === 0) return 80;          /* 输入是通用名前缀，如「布洛芬缓释」 */
      if (n.indexOf(kw) > -1) return 70;             /* 通用名包含输入，如「布洛芬」→「布洛芬缓释胶囊」 */
      if (b.indexOf(kw) > -1) return 60;             /* 商品名包含输入，如「芬必得」 */
      if (kw.indexOf(n) > -1) return 50;             /* 输入比通用名更长，如「对乙酰氨基酚片」 */
      return 0;
    };
    return list
      .map(it => ({ it: it, s: score(it) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.it);
  }

  function card(d) {
    return (
      '<div class="card tool-sec mb-card">' +
      '<div class="mb-card-hd"><b>' + esc(d.n) + '</b>' +
      '<span class="mb-tag">' + esc(d.cat) + '</span>' +
      '<span class="mb-tag otc">' + esc(d.otc || 'OTC') + '</span></div>' +
      '<div class="mb-row"><span>商品名</span><p>' + esc(d.brand && d.brand !== '—' ? d.brand : '—') + '</p></div>' +
      '<div class="mb-row"><span>用途</span><p>' + esc(d.use || '—') + '</p></div>' +
      '<div class="mb-row"><span>用法</span><p>' + esc(d.dose || '—') + '</p></div>' +
      '<div class="mb-row warnrow"><span>警示</span><p>' + esc(d.warn || '—') + '</p></div>' +
      '</div>'
    );
  }

  function notFound(name) {
    return (
      '<div class="card tool-sec mb-card">' +
      '<div class="mb-nf">未收录该药品。</div>' +
      '<p class="mb-nf-d">可以：</p>' +
      '<ul class="mb-nf-list">' +
      '<li>输入<b>通用名</b>或常见<b>商品名</b>再试</li>' +
      '<li>查看国家药监局官方数据：<a href="https://www.nmpa.gov.cn/zwfwqjd/index.html" target="_blank" rel="noopener">nmpa.gov.cn</a></li>' +
      '</ul>' +
      '<p class="mb-nf-d">你查询的是「' + esc(name) + '」。</p>' +
      '</div>'
    );
  }

  function run() {
    if (notReady()) return;
    const name = $('#mbName', rootEl).value.trim();
    if (!name) { LB.toast('请先输入药品名', 'info'); return; }
    const out = $('#mbResult', rootEl);
    out.hidden = false;
    const hits = findAll(name);
    if (!hits.length) { out.innerHTML = notFound(name); return; }
    /* 命中多条时只展示最相关的 3 条，避免「布洛芬」把整类药都列出来 */
    const show = hits.slice(0, 3);
    out.innerHTML = show.map(card).join('') +
      (hits.length > show.length ? '<p class="mb-more">另有 ' + (hits.length - show.length) + ' 条相关结果，可输入更完整的药名缩小范围</p>' : '');
  }

  function mount(root) {
    rootEl = root;
    loadErr = false;
    root.innerHTML = html();
    $('#mbGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#mbName', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.dict.load('drugs')
      .then(d => {
        db = d;
        const el = $('#mbCount', root);
        if (el) el.textContent = '本地药品库共收录 ' + d.length + ' 种常用药，支持通用名与商品名模糊检索，完全离线可用';
      })
      .catch(() => { loadErr = true; LB.toast('药品库加载失败', 'err'); });
  }

  function unmount() { rootEl = null; db = null; }

  LB.router.register('medbox', { mount, unmount });
})();
