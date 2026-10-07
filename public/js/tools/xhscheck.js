/* LiteBox v5 · tools/xhscheck.js — 小红书文案检测器
   检测广告法极限词 / 疑似医疗用语 / 诱导性用语 / 虚假宣传 / 平台禁忌，
   给出替换建议，支持一键替换与排版检查（字数 / emoji 密度 / 话题标签数）。
   数据源：vendor/dict/sensitive-words.js，纯本地不联网。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;

  /* 分类 → 展示色key（对应 CSS .xhs-hit-a ~ .xhs-hit-e） */
  const CAT_CLS = { '绝对化': 'a', '医疗用语': 'b', '诱导': 'c', '虚假宣传': 'd', '平台禁忌': 'e' };
  const CAT_ORDER = ['绝对化', '医疗用语', '诱导', '虚假宣传', '平台禁忌'];

  const MAX_LEN = 1000;      /* 小红书正文上限 */
  const EMOJI_MIN = 5, EMOJI_MAX = 15;
  const TAG_MIN = 5, TAG_MAX = 8;

  let rootEl = null;
  let dict = [];
  let loadErr = false;
  let lastText = '';
  let lastHits = [];

  /* ---------- 词库 ---------- */
  function notReady() {
    if (loadErr) { LB.toast('敏感词库加载失败，请检查网络后刷新重试', 'err'); return true; }
    if (!dict.length) { LB.toast('敏感词库加载中，请稍候', 'info'); return true; }
    return false;
  }

  /* ---------- 检测 ----------
     单字词需检查前后是否也是汉字，避免「最」误伤「最初」「最后」 */
  function scan(text) {
    const hits = [];
    const words = dict;
    for (let i = 0; i < words.length; i++) {
      const w = words[i].w;
      if (!w) continue;
      let idx = 0;
      while ((idx = text.indexOf(w, idx)) !== -1) {
        const before = text[idx - 1] || '';
        const after = text[idx + w.length] || '';
        /* 单字词的边界检查：像「最」这类极限词单字收录，但只要任一侧紧邻汉字，
           它就多半是某个更长词的一部分（最初 / 最好 / 最低），
           应交给词库里的多字词去命中，避免误伤。 */
        if (w.length === 1 && (/[一-龥]/.test(before) || /[一-龥]/.test(after))) {
          idx += 1;
          continue;
        }
        hits.push({ w: w, cat: words[i].cat, alt: words[i].alt, pos: idx, len: w.length });
        idx += w.length;
      }
    }
    /* 重叠去重：「最好」与「最」都会命中同一段，保留更长的（信息量更大、替换更准确） */
    hits.sort((a, b) => a.pos - b.pos || b.len - a.len);
    const out = [];
    let end = -1;
    for (const h of hits) {
      if (h.pos >= end) { out.push(h); end = h.pos + h.len; }
    }
    return out;
  }

  /* ---------- 高亮 ---------- */
  function renderHighlight(text, hits) {
    if (!hits.length) return esc(text);
    /* 按位置从后往前拼接，避免位置偏移；不先esc 整段再插标签（那样位置会错） */
    let html = '';
    let cur = 0;
    hits.forEach(h => {
      html += esc(text.slice(cur, h.pos));
      const cls = 'xhs-hit-' + (CAT_CLS[h.cat] || 'e');
      html += '<mark class="' + cls + '" data-w="' + esc(h.w) + '">' + esc(h.w) + '</mark>';
      cur = h.pos + h.len;
    });
    html += esc(text.slice(cur));
    return html;
  }

  /* ---------- 一键替换：从后往前，避免位置偏移 ---------- */
  function replaceAll(text, hits) {
    let out = text;
    const sorted = hits.slice().sort((a, b) => b.pos - a.pos);
    sorted.forEach(h => {
      if (h.alt === '（删除）' || h.alt === '（需有资质才能标注）') {
        out = out.slice(0, h.pos) + out.slice(h.pos + h.len);
      } else {
        out = out.slice(0, h.pos) + h.alt + out.slice(h.pos + h.len);
      }
    });
    /* 替换后可能留下多余空格，做一次轻量收拾 */
    return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([，。！？、,.!?])/g, '$1');
  }

  /* 单条替换（从后往前替换该词的所有命中位置） */
  function replaceWord(text, w, alt) {
    const hits = lastHits.filter(h => h.w === w);
    if (!hits.length) return text;
    let out = text;
    hits.slice().sort((a, b) => b.pos - a.pos).forEach(h => {
      if (alt === '（删除）' || alt === '（需有资质才能标注）') {
        out = out.slice(0, h.pos) + out.slice(h.pos + h.len);
      } else {
        out = out.slice(0, h.pos) + alt + out.slice(h.pos + h.len);
      }
    });
    return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([，。！？、,.!?])/g, '$1');
  }

  /* ---------- emoji / 标签统计 ---------- */
  function countEmoji(text) {
    /* 覆盖常见表情符号区段：Miscellaneous Symbols、Emoticons、Transport、旗帜 */
    const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
    const m = text.match(re);
    return m ? m.length : 0;
  }
  function countTags(text) {
    const m = text.match(/#[^\s#@]{1,20}/g);
    return m ? m.length : 0;
  }

  /* ---------- UI ---------- */
  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>小红书文案检测</h1><p>敏感词 / 极限词 / 违禁词自查，附替换建议与排版检查</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec">' +
      '<textarea class="inp xhs-input" id="xhIn" rows="10" placeholder="粘贴要发布的小红书文案…"></textarea>' +
      '<div class="set-btns xhs-acts">' +
      '<button class="btn btn-main js-primary-submit" id="xhGo" type="button">🔍 开始检测</button>' +
      '<button class="btn btn-ghost" id="xhSample" type="button">示例</button>' +
      '<button class="btn btn-ghost" id="xhCopy" type="button">📋 复制结果</button>' +
      '</div>' +
      '<p class="xhs-count" id="xhCount"></p>' +
      '</div>' +
      '<div id="xhResult" hidden></div>' +
      '<div class="card tool-sec xhs-disclaim">⚖️ 检测结果基于本地敏感词库（广告法极限词、医疗用语、诱导用语、虚假宣传、平台禁忌五类），仅供参考；发布前请自行确认平台最新规则与《广告法》要求。</div>' +
      '</div>'
    );
  }

  const SAMPLE = '这是我用过最好的产品，能治愈一切问题。🎉🎉🎉\n限时抢购！加微信领优惠，手慢无～\n#好物分享 #日常 #推荐';

  function run() {
    if (notReady()) return;
    const text = $('#xhIn', rootEl).value;
    if (!text.trim()) { LB.toast('请先粘贴要检测的文案', 'info'); return; }
    lastText = text;
    lastHits = scan(text);

    /* 汇总：按分类统计 */
    const byCat = {};
    lastHits.forEach(h => { byCat[h.cat] = (byCat[h.cat] || 0) + 1; });
    const catList = CAT_ORDER.filter(c => byCat[c]).map(c => ({ c: c, n: byCat[c] }));

    /* 排版检查 */
    const len = text.replace(/\s/g, '').length;
    const emo = countEmoji(text);
    const tags = countTags(text);
    const layout = [];
    if (len > MAX_LEN) layout.push({ lv: 'err', t: '字数 ' + len + ' 字，已超过小红书正文上限 ' + MAX_LEN + ' 字，需精简 ' + (len - MAX_LEN) + ' 字' });
    else if (len > MAX_LEN * 0.9) layout.push({ lv: 'warn', t: '字数 ' + len + ' 字，接近上限 ' + MAX_LEN + ' 字' });
    else layout.push({ lv: 'ok', t: '字数 ' + len + ' 字，在 ' + MAX_LEN + ' 字上限内' });

    if (emo < EMOJI_MIN) layout.push({ lv: 'warn', t: 'emoji ' + emo + ' 个，偏少，建议 ' + EMOJI_MIN + '-' + EMOJI_MAX + ' 个' });
    else if (emo > EMOJI_MAX) layout.push({ lv: 'warn', t: 'emoji ' + emo + ' 个，偏多，建议 ' + EMOJI_MIN + '-' + EMOJI_MAX + ' 个' });
    else layout.push({ lv: 'ok', t: 'emoji ' + emo + ' 个，在建议区间内' });

    if (tags < TAG_MIN) layout.push({ lv: 'warn', t: '话题标签 ' + tags + ' 个，偏少，建议 ' + TAG_MIN + '-' + TAG_MAX + ' 个' });
    else if (tags > TAG_MAX) layout.push({ lv: 'warn', t: '话题标签 ' + tags + ' 个，偏多，建议 ' + TAG_MIN + '-' + TAG_MAX + ' 个' });
    else layout.push({ lv: 'ok', t: '话题标签 ' + tags + ' 个，在建议区间内' });

    /* 命中列表（按分类分组，同类按位置） */
    const groups = CAT_ORDER.filter(c => byCat[c]).map(c => {
      const items = lastHits.filter(h => h.cat === c);
      return '<div class="xhs-grp">' +
        '<div class="xhs-grp-hd"><span class="xhs-cat xhs-hit-' + CAT_CLS[c] + '">' + esc(c) + '</span>' +
        '<b>' + items.length + ' 处</b>' +
        '<button class="btn btn-ghost btn-sm xhs-rep-grp" data-w="' + esc(items[0].w) + '" type="button">替换全部「' + esc(items[0].w) + '」</button>' +
        '</div>' +
        '<div class="xhs-hl">' + renderHighlight(text, items) + '</div>' +
        '<div class="xhs-items">' + items.map(h =>
          '<div class="xhs-item">' +
          '<b class="xhs-w xhs-hit-' + CAT_CLS[h.cat] + '">' + esc(h.w) + '</b>' +
          '<span class="xhs-alt">' + (h.alt.indexOf('（删除') === 0 || h.alt.indexOf('（用') === 0 || h.alt.indexOf('（需') === 0
            ? '<i class="del">' + esc(h.alt) + '</i>' : '建议改为「' + esc(h.alt) + '」') + '</span>' +
          '<button class="btn btn-ghost btn-sm xhs-rep" data-w="' + esc(h.w) + '" type="button">一键替换</button>' +
          '</div>').join('') + '</div>' +
        '</div>';
    }).join('');

    $('#xhResult', rootEl).innerHTML =
      '<div class="card tool-sec">' +
      '<div class="xhs-sum ' + (lastHits.length ? 'has' : 'clean') + '">' +
      '<div class="rc-lab">检测结果</div>' +
      '<div class="xhs-sum-n">' + lastHits.length + ' 处命中 · 分 ' + catList.length + ' 类</div>' +
      (catList.length ? '<div class="xhs-cats">' + catList.map(x =>
        '<span class="xhs-cat xhs-hit-' + CAT_CLS[x.c] + '">' + esc(x.c) + ' ' + x.n + '</span>').join('') + '</div>' : '') +
      (lastHits.length ? '' : '<div class="xhs-clean-tip">✅ 未发现敏感词，文案可以发布</div>') +
      '</div>' +
      (groups ? '<div class="xhs-groups">' + groups + '</div>' : '') +
      '<div class="xhs-layout"><div class="xhs-layout-hd">📐 排版检查</div>' +
      layout.map(l => '<div class="xhs-lay l-' + l.lv + '">' +
        '<span class="lay-ic">' + (l.lv === 'ok' ? '✓' : '!') + '</span>' + esc(l.t) + '</div>').join('') +
      '</div>' +
      (lastHits.length ? '<div class="set-btns xhs-rep-all"><button class="btn btn-main" id="xhRepAll" type="button">✨ 一键替换全部（' + lastHits.length + ' 处）</button></div>' : '') +
      '</div>';
    $('#xhResult', rootEl).hidden = false;
  }

  function mount(root) {
    rootEl = root;
    loadErr = false;
    lastText = ''; lastHits = [];
    root.innerHTML = html();

    $('#xhGo', root).addEventListener('click', run);
    $('#xhSample', root).addEventListener('click', () => {
      $('#xhIn', root).value = SAMPLE;
      LB.toast('已填入示例文案', 'info');
    });
    /* ★ 复制严格用LB.copyNow 同步调用：处理器不加 async、不用 setTimeout */
    $('#xhCopy', root).addEventListener('click', () => {
      const el = $('#xhIn', root);
      const t = el && el.value ? el.value : '';
      if (!t) { LB.toast('没有可复制的文案', 'err'); return; }
      LB.copyNow(t, '已复制文案');
    });
    $('#xhResult', root).addEventListener('click', e => {
      const all = e.target.closest('#xhRepAll');
      if (all) {
        if (!lastHits.length) { LB.toast('没有需要替换的词', 'info'); return; }
        $('#xhIn', root).value = replaceAll(lastText, lastHits);
        LB.toast('已替换 ' + lastHits.length + ' 处，可重新检测确认', 'ok');
        run();
        return;
      }
      const one = e.target.closest('.xhs-rep');
      if (one) {
        const w = one.getAttribute('data-w');
        const item = lastHits.find(h => h.w === w);
        if (!item) { LB.toast('未找到该词', 'info'); return; }
        $('#xhIn', root).value = replaceWord(lastText, w, item.alt);
        LB.toast('已替换「' + w + '」', 'ok');
        run();
        return;
      }
      const grp = e.target.closest('.xhs-rep-grp');
      if (grp) {
        const w = grp.getAttribute('data-w');
        const item = lastHits.find(h => h.w === w);
        if (!item) { LB.toast('未找到该词', 'info'); return; }
        $('#xhIn', root).value = replaceWord(lastText, w, item.alt);
        LB.toast('已替换「' + w + '」的全部命中', 'ok');
        run();
      }
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* 注意：load() 的参数是「挂载名」，须用驼峰 sensitiveWords；
       core/dict.js 里的 FILE 映射会把它转成文件名 sensitive-words.js。
       若误传 'sensitive-words'，脚本能加载但取 window.LB.dict['sensitive-words'] 会得到 undefined。 */
    LB.dict.load('sensitiveWords')
      .then(d => {
        dict = d || [];
        const el = $('#xhCount', root);
        if (el) el.textContent = '敏感词库共收录 ' + dict.length + ' 条，覆盖绝对化 / 医疗用语 / 诱导 / 虚假宣传 / 平台禁忌五类';
      })
      .catch(() => { loadErr = true; LB.toast('敏感词库加载失败', 'err'); });
  }

  function unmount() { rootEl = null; dict = []; lastText = ''; lastHits = []; }

  LB.router.register('xhscheck', { mount, unmount });
})();
