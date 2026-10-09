/* LiteBox v5 · tools/translate.js — 文本翻译（Step 28 · 二，接口换成同源 /api/translate）
   变更：语言列表扩到 15 种（含「自动检测」），单次上限 500 → 5000，
   删掉原第三方直连降级（前端不再出现任何第三方域名），对照模式取 dst。
   Step 6B-1 的「对照模式」与「翻译历史」（localStorage litebox_tr_history，最多 20 条）保留。
   实现取舍：请求走同源 POST 且自己读 body.error.message，后端「请输入要翻译的文本 /
   单次最多 5000 字符 / 源语言与目标语言相同」这类提示才能原样显示（LB.api 只给 HTTP 码）。 */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const MAX_LEN = 5000;
  const HIST_KEY = 'litebox_tr_history';
  const HIST_MAX = 20;

  /* 15 种语言（任务给定顺序，含 auto 自动检测） */
  const LANGS = [
    ['auto', '自动检测'],
    ['zh', '中文'],
    ['en', '英语'],
    ['ja', '日语'],
    ['ko', '韩语'],
    ['fr', '法语'],
    ['de', '德语'],
    ['es', '西班牙语'],
    ['ru', '俄语'],
    ['pt', '葡萄牙语'],
    ['it', '意大利语'],
    ['th', '泰语'],
    ['vi', '越南语'],
    ['ar', '阿拉伯语'],
    ['id', '印尼语']
  ];

  let rootEl = null;
  let seq = 0;
  let clearArmed = 0; /* 清空二次确认：点击后 4 秒内的第二次点击才生效 */
  let lastSrc = '';   /* 最近一次原文，供取消对照模式时重建结果 */

  /* 同源 POST：非 2xx 时把后端 error.message 抛出来 */
  async function apiPost(path, body, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    let r = null, text = '';
    try {
      r = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      text = await r.text();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '翻译超时，请稍后重试' : '网络连接失败，请检查网络后重试');
    } finally {
      clearTimeout(timer);
    }
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; }
    if (!r.ok) throw new Error((d && d.error && d.error.message) || '翻译服务暂时不可用');
    return d;
  }

  function langName(code) {
    const hit = LANGS.find(l => l[0] === code);
    return hit ? hit[1] : code;
  }

  function busy(on) {
    const btn = $('#trGo', rootEl);
    btn.disabled = on;
    btn.textContent = on ? '⏳ 翻译中…' : '🌐 翻译';
  }

  /* ---------- 历史记录 ---------- */

  function getHist() {
    const v = LB.storage.get(HIST_KEY, []);
    return Array.isArray(v) ? v : [];
  }

  function setHist(list) {
    LB.storage.set(HIST_KEY, list.slice(0, HIST_MAX));
  }

  /* 同源（源语言+原文+译文）不重复，重复的移到最前并更新时间 */
  function pushHist(item) {
    const list = getHist().filter(h => !(h.q === item.q && h.from === item.from && h.to === item.to));
    list.unshift(item);
    setHist(list);
    renderHist();
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return '今天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderHist() {
    const box = $('#trHistList', rootEl);
    if (!box) return;
    const list = getHist();
    if (!list.length) {
      box.innerHTML = '<div class="tr-hist-empty">还没有翻译记录，翻译一次就会自动出现在这里。</div>';
      return;
    }
    box.innerHTML = list.map((h, i) =>
      '<li class="tr-hist-item" data-hist="' + i + '">' +
      '<div class="tr-hist-meta"><b>' + esc(langName(h.from)) + ' → ' + esc(langName(h.to)) + '</b><span>' + esc(fmtTime(h.ts)) + '</span></div>' +
      '<div class="tr-hist-q">' + esc(h.q) + '</div>' +
      '<div class="tr-hist-a">' + esc(h.text) + '</div>' +
      '<div class="tr-hist-ops">' +
      '<button class="btn btn-ghost btn-sm" data-hcopy="' + i + '" type="button">📋 复制译文</button>' +
      '<span class="tr-hist-tip">点击整条可回填到输入框</span>' +
      '</div>' +
      '</li>'
    ).join('');
  }

  /* 点击历史条目 → 回填输入框 + 展示当时结果 */
  function fillFromHist(h) {
    $('#trFrom', rootEl).value = h.from;
    $('#trTo', rootEl).value = h.to;
    $('#trIn', rootEl).value = h.q;
    showResult(h.q, h.text);
    LB.toast('已回填到输入框，可直接重新翻译', 'info');
  }

  /* ---------- 结果渲染（对照模式） ---------- */

  function compareOn() {
    const el = $('#trCompare', rootEl);
    return !!(el && el.checked);
  }

  function showResult(src, text) {
    lastSrc = src;
    const box = $('#trOut', rootEl);
    box.textContent = compareOn() ? '【原文】\n' + src + '\n\n【译文】\n' + text : text;
    $('#trResult', rootEl).hidden = false;
  }

  async function run() {
    if (!HAS_API) { LB.toast('该工具需要联网服务支持', 'info'); return; }
    const q = $('#trIn', rootEl).value.trim();
    const from = $('#trFrom', rootEl).value;
    const to = $('#trTo', rootEl).value;
    if (!q) { LB.toast('请输入要翻译的文本', 'info'); return; }
    if (q.length > MAX_LEN) { LB.toast('单次最多 5000 字符，请分段翻译', 'warn'); return; }
    /* from=auto 时不做「同语言」判断，交给上游自动识别 */
    if (from !== 'auto' && from === to) { LB.toast('源语言与目标语言相同', 'info'); return; }

    const my = ++seq;
    busy(true);
    try {
      const d = await apiPost('/api/translate', { q: q, from: from, to: to }, 15000);
      if (my !== seq) return;
      /* 任务书：译文取 dst（后端已归一成 text 字段） */
      const text = (d && (d.text || d.dst)) || '';
      if (!text) throw new Error('empty');
      showResult(q, text);
      pushHist({ q: q, text: text, from: from, to: to, ts: Date.now() });
    } catch (e) {
      if (my !== seq) return;
      $('#trResult', rootEl).hidden = true;
      LB.toast((e && e.message) || '翻译服务暂时不可用', 'err');
    } finally {
      if (my === seq) busy(false);
    }
  }

  function swap() {
    const f = $('#trFrom', rootEl);
    const t = $('#trTo', rootEl);
    /* 反向翻译两端都必须有明确语言：auto 一侧补成中文 */
    const fv = f.value;
    const tv = t.value;
    f.value = tv === 'auto' ? 'zh' : tv;
    t.value = fv === 'auto' ? 'zh' : fv;
  }

  function copyOut() {
    const text = $('#trOut', rootEl).textContent;
    /* Step 5F：原来空结果时静默 return，点复制毫无反应；改为给出提示，
       与其余 20+ 个工具的交互保持一致（点复制必有反馈）。 */
    if (!text) { LB.toast('还没有译文，请先翻译', 'info'); return; }
    LB.copyWithToast(text, '已复制译文');
  }

  /* 清空历史：两段式确认（第一次点变文案，4 秒内再点才真清） */
  function clearHist(btn) {
    const now = Date.now();
    if (now - clearArmed > 4000 || !clearArmed) {
      clearArmed = now;
      btn.textContent = '确认清空？再点一次';
      btn.classList.add('tr-clear-armed');
      setTimeout(() => {
        if (Date.now() - clearArmed >= 4000) {
          clearArmed = 0;
          btn.textContent = '🗑 清空历史';
          btn.classList.remove('tr-clear-armed');
        }
      }, 4100);
      return;
    }
    clearArmed = 0;
    btn.textContent = '🗑 清空历史';
    btn.classList.remove('tr-clear-armed');
    setHist([]);
    renderHist();
    LB.toast('翻译历史已清空', 'info');
  }

  function langOpts(sel) {
    return LANGS.map(l => '<option value="' + l[0] + '"' + (l[0] === sel ? ' selected' : '') + '>' + l[1] + '</option>').join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本翻译</h1><p>15 种语言互译，支持自动检测语种</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tr-langs">' +
      '<select class="inp" id="trFrom">' + langOpts('auto') + '</select>' +
      '<button class="btn btn-ghost btn-sm" id="trSwap" type="button" aria-label="交换语言">⇄</button>' +
      '<select class="inp" id="trTo">' + langOpts('en') + '</select>' +
      '</div>' +
      '<label class="chk-row tr-cmp"><input type="checkbox" id="trCompare" /><span>对照模式（原文与译文上下显示）</span></label>' +
      '<textarea class="inp tr-in" id="trIn" rows="6" maxlength="5000" placeholder="输入要翻译的文本（单次 ≤ 5000 字符）"></textarea>' +
      '<button class="btn btn-main tr-go js-primary-submit" id="trGo" type="button">🌐 翻译</button>' +
      '<div class="card tool-sec tr-card" id="trResult" hidden>' +
      '<div class="tr-out" id="trOut"></div>' +
      '<button class="btn btn-ghost btn-sm" id="trCopy" type="button">📋 复制译文</button>' +
      '</div>' +
      '<div class="card tool-sec tr-hist" id="trHistory">' +
      '<div class="tr-hist-head"><h2>翻译历史</h2><button class="btn btn-ghost btn-sm" id="trClearHist" type="button">🗑 清空历史</button></div>' +
      '<ul class="tr-hist-list" id="trHistList"></ul>' +
      '</div>' +
      '<p class="cd-note">请勿提交身份证、银行卡等敏感信息；翻译历史只保存在本机浏览器</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    clearArmed = 0;
    root.innerHTML = html();
    $('#trGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#trSwap', root).addEventListener('click', swap);
    $('#trCopy', root).addEventListener('click', copyOut);
    $('#trIn', root).addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    });
    /* 取消勾选对照模式时立即去掉结果里的原文段 */
    $('#trCompare', root).addEventListener('change', e => {
      const box = $('#trOut', root);
      const t = box.textContent;
      if (e.target.checked) {
        const src = lastSrc || $('#trIn', root).value.trim();
        if (t && src && t.indexOf('【原文】') !== 0) box.textContent = '【原文】\n' + src + '\n\n【译文】\n' + t;
      } else if (t.indexOf('【原文】') === 0) {
        const i = t.indexOf('【译文】');
        box.textContent = i >= 0 ? t.slice(i + 5).replace(/^\n+/, '') : t;
      }
    });
    /* 历史列表事件委托：复制按钮优先（同步栈），其余为回填 */
    $('#trHistList', root).addEventListener('click', e => {
      const cp = e.target.closest('[data-hcopy]');
      if (cp) {
        e.stopPropagation();
        const h = getHist()[+cp.dataset.hcopy];
        if (!h) return;
        /* Step 6A 约束：复制必须同步调用，不能跨 await / .then / setTimeout */
        LB.copyNow(h.text, '已复制这条译文');
        return;
      }
      const li = e.target.closest('[data-hist]');
      if (!li) return;
      const item = getHist()[+li.dataset.hist];
      if (item) fillFromHist(item);
    });
    $('#trClearHist', root).addEventListener('click', e => clearHist(e.currentTarget));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    renderHist();
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    clearArmed = 0;
    lastSrc = '';
    rootEl = null;
  }

  LB.router.register('translate', { mount, unmount });
})();
