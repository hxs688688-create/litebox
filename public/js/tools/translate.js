/* LiteBox v5 · tools/translate.js — 文本翻译（同源 POST 优先 → MyMemory 直连降级）
   Step 6B-1：新增「对照模式」与「翻译历史」（localStorage litebox_tr_history，最多 20 条） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const MAX_LEN = 500;
  const HIST_KEY = 'litebox_tr_history';
  const HIST_MAX = 20;

  /* 12 种语言（任务给定顺序） */
  const LANGS = [
    ['zh-CN', '中文'], ['en', '英语'], ['ja', '日语'], ['ko', '韩语'],
    ['fr', '法语'], ['de', '德语'], ['es', '西班牙语'], ['ru', '俄语'],
    ['pt', '葡萄牙语'], ['it', '意大利语'], ['th', '泰语'], ['vi', '越南语']
  ];

  let rootEl = null;
  let seq = 0;
  let clearArmed = 0; /* 清空二次确认：点击后 4 秒内的第二次点击才生效 */

  /* 同源优先，直连降级（POST 版） */
  async function tryAPIPost(path, body, fallbackFn) {
    if (!HAS_API) {
      if (fallbackFn) return fallbackFn();
      throw new Error('服务暂时不可用');
    }
    try {
      return await LB.api.postJSON(path, body, { timeout: 6000 });
    } catch (_) {
      if (fallbackFn) return fallbackFn();
      throw new Error('服务暂时不可用');
    }
  }

  async function directJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* MyMemory 降级：responseStatus !== 200 或译文为空 → throw；返回与同源一致的 { text } 结构 */
  async function viaMyMemory(q, from, to) {
    const d = await directJSON('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) + '&langpair=' + encodeURIComponent(from + '|' + to));
    const t = d && d.responseData && d.responseData.translatedText;
    if (!d || d.responseStatus !== 200 || !t) throw new Error('mymemory-failed');
    return { text: t, from: from, to: to };
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

  function showResult(src, text) {
    const box = $('#trOut', rootEl);
    if ($('#trCompare', rootEl) && $('#trCompare', rootEl).checked) {
      box.textContent = '【原文】\n' + src + '\n\n【译文】\n' + text;
    } else {
      box.textContent = text;
    }
    $('#trResult', rootEl).hidden = false;
  }

  async function run() {
    const q = $('#trIn', rootEl).value.trim();
    const from = $('#trFrom', rootEl).value;
    const to = $('#trTo', rootEl).value;
    if (!q) { LB.toast('请输入要翻译的文本', 'info'); return; }
    if (q.length > MAX_LEN) { LB.toast('单次最多 500 字符，请分段翻译', 'warn'); return; }
    if (from === to) { LB.toast('源语言与目标语言相同', 'info'); return; }

    const my = ++seq;
    busy(true);
    try {
      const d = await tryAPIPost('/api/translate', { q: q, from: from, to: to }, () => viaMyMemory(q, from, to));
      if (my !== seq) return;
      const text = (d && (d.text || (d.responseData && d.responseData.translatedText))) || '';
      if (!text) throw new Error('empty');
      showResult(q, text);
      pushHist({ q: q, text: text, from: from, to: to, ts: Date.now() });
    } catch (e) {
      if (my !== seq) return;
      $('#trResult', rootEl).hidden = true;
      LB.toast('免费翻译接口有频率限制，请稍后重试', 'err');
    } finally {
      if (my === seq) busy(false);
    }
  }

  function swap() {
    const f = $('#trFrom', rootEl);
    const t = $('#trTo', rootEl);
    const tmp = f.value;
    f.value = t.value;
    t.value = tmp;
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
      '<div><h1>文本翻译</h1><p>12 种语言互译，支持中英日韩法德西俄等</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="tr-langs">' +
      '<select class="inp" id="trFrom">' + langOpts('zh-CN') + '</select>' +
      '<button class="btn btn-ghost btn-sm" id="trSwap" type="button" aria-label="交换语言">⇄</button>' +
      '<select class="inp" id="trTo">' + langOpts('en') + '</select>' +
      '</div>' +
      '<label class="chk-row tr-cmp"><input type="checkbox" id="trCompare" /><span>对照模式（原文与译文上下显示）</span></label>' +
      '<textarea class="inp tr-in" id="trIn" rows="6" maxlength="800" placeholder="输入要翻译的文本（单次 ≤ 500 字符）"></textarea>' +
      '<button class="btn btn-main tr-go js-primary-submit" id="trGo" type="button">🌐 翻译</button>' +
      '<div class="card tool-sec tr-card" id="trResult" hidden>' +
      '<div class="tr-out" id="trOut"></div>' +
      '<button class="btn btn-ghost btn-sm" id="trCopy" type="button">📋 复制译文</button>' +
      '</div>' +
      '<div class="card tool-sec tr-hist" id="trHistory">' +
      '<div class="tr-hist-head"><h2>翻译历史</h2><button class="btn btn-ghost btn-sm" id="trClearHist" type="button">🗑 清空历史</button></div>' +
      '<ul class="tr-hist-list" id="trHistList"></ul>' +
      '</div>' +
      '<p class="cd-note">翻译服务由第三方提供，请勿提交敏感信息；历史记录只保存在本机浏览器</p>' +
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
      const src = $('#trIn', root).value.trim();
      const t = box.textContent;
      if (e.target.checked) {
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
    rootEl = null;
  }

  LB.router.register('translate', { mount, unmount });
})();
