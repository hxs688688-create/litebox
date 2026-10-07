/* LiteBox v5 · tools/ingredient.js — 配料表解读（自建添加剂库 + 四级安全色 + 配料排位解读）
   Step 6D：数据源从 vendor/dict/ingredients.js 换成自建 vendor/dict/additives.js */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  /* 四级安全：very 很安全(绿) / common 一般安全(蓝) / limit 限量摄入(黄) / worry 争议较大(红) */
  const SAFETY = {
    very: { n: '很安全', cls: 's0', lv: 0 },
    common: { n: '一般安全', cls: 's1', lv: 1 },
    limit: { n: '限量摄入', cls: 's2', lv: 2 },
    worry: { n: '争议较大', cls: 's3', lv: 3 }
  };
  /* 排序用：争议较大 > 限量摄入 > 一般安全 > 很安全 */
  const LV = { worry: 3, limit: 2, common: 1, very: 0 };

  const ALLERGENS = ['花生', '坚果', '芝麻', '大豆', '牛奶', '乳', '蛋', '小麦', '麸质', '鱼', '甲壳类', '虾', '蟹'];

  /* 包装 / 标签术语：识别不出也不计入"未收录" */
  const PACK_WORDS = ['净含量', '规格', '配料表', '营养成分表', '营养素参考值', '生产日期', '保质期', '保存条件', '贮藏',
    '生产商', '生产厂家', '经销商', '委托方', '被委托', '产地', '地址', '电话', '网址', '官网', '热线',
    '执行标准', '产品标准', '生产许可', '批号', '条形码', '合格', '食品生产许可证'];

  let rootEl = null;
  let db = null;        /* vendor/dict/additives.js */
  let loadErr = false;

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>配料表解读</h1><p>识别食品添加剂，标注四级安全度与配料排位</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec">' +
      '<textarea class="inp ing-input" id="igInput" rows="5" placeholder="例：小麦粉、白砂糖、苯甲酸钠、柠檬酸、阿斯巴甜（含苯丙氨酸）"></textarea>' +
      '<label class="chk-row ig-est"><input type="checkbox" id="igEstimate"><span>给个大概<i>（推测前 3 位配料的大致占比）</i></span></label>' +
      '<button class="btn btn-main js-primary-submit" id="igGo" type="button">🥣 解读配料表</button>' +
      '<p class="ig-count" id="igCount"></p>' +
      '</div>' +
      '<div id="igResult" hidden></div>' +
      '<div class="card tool-sec ig-disclaim">🧪 免责说明：本工具基于自建添加剂库与 GB 2760 等公开标准整理，仅供健康参考，不构成营养或医疗建议；个体差异请以专业意见与官方标注为准。</div>' +
      '</div>'
    );
  }

  /* 切分：[，,、；;（）()] 全部视为分隔符 */
  function splitSegs(raw) {
    return raw
      .split(/[，,、；;（）()]/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => !PACK_WORDS.some(w => s.indexOf(w) > -1));
  }

  /* 每段与 additives.n 做双向 includes 模糊匹配 */
  function matchOne(seg, list) {
    const kw = seg.toLowerCase();
    let best = null, bestScore = 0;
    for (const it of list) {
      const n = (it.n || '').toLowerCase();
      if (!n) continue;
      let s = 0;
      if (n === kw) s = 100;
      else if (n.indexOf(kw) === 0) s = 80;
      else if (n.indexOf(kw) > -1) s = 70;
      else if (kw.indexOf(n) === 0) s = 60;
      else if (kw.indexOf(n) > -1) s = 50;
      if (s > bestScore) { bestScore = s; best = it; }
    }
    return bestScore ? best : null;
  }

  function run() {
    if (loadErr) { LB.toast('添加剂库加载失败，请检查网络后刷新重试', 'err'); return; }
    if (!db) { LB.toast('添加剂库加载中，请稍候', 'info'); return; }
    const raw = $('#igInput', rootEl).value.trim();
    if (!raw) { LB.toast('请先粘贴配料表文字', 'info'); return; }

    const segs = splitSegs(raw);
    const rows = [];   /* { seg, hit } 保持出现顺序 —— 排位解读依赖顺序 */
    const seen = new Set();
    segs.forEach(seg => {
      const it = matchOne(seg, db);
      if (it) {
        if (!seen.has(it.n)) { seen.add(it.n); rows.push({ seg: seg, hit: it }); }
      } else {
        rows.push({ seg: seg, hit: null });
      }
    });

    const hits = rows.filter(r => r.hit);
    const miss = rows.filter(r => !r.hit);
    const alg = ALLERGENS.filter(a => raw.indexOf(a) > -1);
    const estimate = $('#igEstimate', rootEl).checked;

    /* 按安全等级降序（稳定排序，同级保持出现顺序） */
    const sorted = hits.slice().sort((a, b) => LV[b.hit.safety] - LV[a.hit.safety]);

    /* 提示条：按命中的最高等级生成 */
    const lv = hits.length ? Math.max.apply(null, hits.map(r => LV[r.hit.safety])) : -1;
    let tip;
    if (lv === 3) tip = '<div class="ig-tip lv3">⛔ 含 ' + hits.filter(r => LV[r.hit.safety] === 3).length + ' 项争议较大的配料，建议了解清楚后再决定是否购买</div>';
    else if (lv === 2) tip = '<div class="ig-tip lv2">⚠️ 含 ' + hits.filter(r => LV[r.hit.safety] === 2).length + ' 项需限量控制的配料，适量为宜</div>';
    else if (lv === 1) tip = '<div class="ig-tip lv1">✅ 未发现明显风险，含常规合规添加物</div>';
    else if (lv === 0) tip = '<div class="ig-tip lv0">✅ 识别到的配料安全等级都很低，可放心选择</div>';
    else tip = '<div class="ig-tip lv1">ℹ️ 未识别到库内成分，可检查文字是否为标准成分名</div>';

    /* 配料排位解读：前 3 位（勾选"给个大概"时给推测占比） */
    const top3 = rows.slice(0, 3);
    const EST = ['约 60% 以上', '约 20%–30%', '约 5%–10%'];
    const rankHtml =
      '<div class="ig-rank">' +
      '<div class="ig-rank-hd">📊 配料排位解读</div>' +
      '<p class="ig-rank-tip">配料表按<b>含量降序</b>排列，第一位是主要成分，含量通常最高。</p>' +
      '<ol class="ig-rank-list">' +
      top3.map((r, i) => {
        const nm = r.hit ? r.hit.n : r.seg;
        const pct = r.hit ? EST[i] : '无法推测';
        return '<li><b class="rk' + (i + 1) + '">第 ' + (i + 1) + ' 位</b>' +
          '<span class="rk-name' + (r.hit ? '' : ' unknown') + '">' + esc(nm) + (r.hit ? '' : '（未收录）') + '</span>' +
          (estimate ? '<span class="rk-pct">' + (r.hit ? pct : '—') + '</span>' : '') +
          '</li>';
      }).join('') +
      '</ol>' +
      (estimate ? '<p class="ig-rank-note">占比为按常规配方的<b>推测值</b>，非实测数据，仅供判断主次参考。</p>' : '') +
      '</div>';

    const listHtml = sorted.length
      ? '<div class="ig-list">' + sorted.map(r =>
        '<div class="ing-item">' +
        '<span class="ing-badge ' + SAFETY[r.hit.safety].cls + '">' + SAFETY[r.hit.safety].n + '</span>' +
        '<div class="ing-info"><b>' + esc(r.hit.n) + '</b>' +
        '<small>' + esc(r.hit.code && r.hit.code !== '—' ? r.hit.code : '无编号') + ' · ' + esc(r.hit.func) + '</small>' +
        '<p>' + esc(r.hit.note) + '</p></div>' +
        '</div>').join('') + '</div>'
      : '';

    /* 未收录项灰字显示 */
    const missHtml = miss.length
      ? '<div class="ig-miss"><span class="tool-lab">未收录（' + miss.length + '）</span>' +
        '<p class="ig-miss-list">' + miss.map(r => '<span class="unk">' + esc(r.seg) + '</span>').join('') + '</p></div>'
      : '';

    const cnt = [0, 0, 0, 0];
    hits.forEach(r => { cnt[LV[r.hit.safety]]++; });

    $('#igResult', rootEl).innerHTML =
      '<div class="card tool-sec">' +
      '<div class="ig-sums">' +
      '<div class="res-card"><div class="rc-lab">识别到的添加剂</div><div class="rc-val">' + hits.length + ' 项</div></div>' +
      '<div class="res-card"><div class="rc-lab">安全等级分布</div><div class="rc-val ig-dots">' +
      (cnt[3] ? '<i class="dot s3"></i>' + cnt[3] : '') +
      (cnt[2] ? '<i class="dot s2"></i>' + cnt[2] : '') +
      (cnt[1] ? '<i class="dot s1"></i>' + cnt[1] : '') +
      (cnt[0] ? '<i class="dot s0"></i>' + cnt[0] : '') +
      (!hits.length ? '—' : '') +
      '</div></div>' +
      '</div>' +
      tip +
      (alg.length ? '<div class="ig-tip alg">⚠️ 过敏原提示：配料中含「' + alg.map(esc).join('」「') + '」，相关过敏人群请谨慎选择</div>' : '') +
      rankHtml + listHtml + missHtml +
      '</div>';
    $('#igResult', rootEl).hidden = false;
  }

  function mount(root) {
    rootEl = root;
    loadErr = false;
    root.innerHTML = html();
    $('#igGo', root).addEventListener('click', run);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    LB.dict.load('additives')
      .then(d => {
        db = d;
        const el = $('#igCount', root);
        if (el) el.textContent = '添加剂库共收录 ' + d.length + ' 种，分防腐剂 / 甜味剂 / 色素 / 增味剂 / 增稠乳化 / 抗氧化 / 酸度调节 / 膨松等类';
      })
      .catch(() => { loadErr = true; LB.toast('添加剂库加载失败', 'err'); });
  }

  function unmount() { rootEl = null; db = null; }

  LB.router.register('ingredient', { mount, unmount });
})();
