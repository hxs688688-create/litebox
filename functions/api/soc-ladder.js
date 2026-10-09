/* LiteBox v5 · functions/api/soc-ladder.js — 手机 SoC 天梯（GET /api/soc-ladder）
 *
 * Step 12 · B2：从「静态数据」改为「每天从 GitHub 拉取 + 边缘缓存 24 小时」。
 * Step 13 · B7：缓存从 24 小时改为 **7 天** —— 芯片不是每天发布，日更无意义；
 *   同时支持 ?fresh=1 手动刷新（跳过读缓存、强制回源并覆盖写入），
 *   对应前端「检查更新」按钮。
 *
 * 【为什么要改造】
 *   原来天梯是打包在 public/vendor/dict/soc-ladder.js 里的静态表（62 款），
 *   芯片一年出好几代，静态表很快就过时。
 *
 * 【数据源实测（2026-10 复测，三条结论都影响实现）】
 *   1) 任务书给的 .../main/data.js **不存在**（404）。该仓库默认分支是 **master**，
 *      且 data.js 里只有图片路径，真正的天梯数据在 **index.js** 的 `var cpuData = [[...]]`。
 *      所以候选源把 master/index.js 放在第一位，main/data.js 保留在最后兜底。
 *   2) cpuData 是「二维表格」而不是列表：一行 = 一个性能档位（越靠前越快），
 *      一列 = 一个品牌/产品线。因此分数由**行号**换算，品牌由**列号**映射。
 *   3) 单元格里可能塞多款芯片（用 <br/> 分隔），还有 `MSM8225<br/>/8625` 这种
 *      被硬拆开的续行（以 `(` `/` `-` 开头），需要并回上一款。
 *
 * 【缓存策略（Step 13 · B7）】
 *   Cache API（caches.default）缓存 7 天（604800 秒）—— 7 天内所有请求都命中
 *   边缘缓存，不会重复打 GitHub（既省配额也快）。响应同时带
 *   Cache-Control: public, max-age=604800，前端/CDN 再兜一层。
 *   手动刷新：/api/soc-ladder?fresh=1 跳过读缓存强制回源，并把新结果覆盖写回。
 */
import { json } from '../_utils.js';

/* 缓存键：用一个不会真实请求的 host，纯做 key 用 */
const CACHE_KEY = 'https://cache.litebox/api/soc-ladder';
const CACHE_TTL = 604800;   /* 7 天（Step 13 · B7：芯片迭代按月不按天） */

/* 数据源候选。
   【实测结论（2026-10，直接决定了这份清单）】
     1) 任务书给的 .../main/data.js **不存在**（404）：该仓库默认分支是 **master**，
        且 data.js 里只有图片路径，真正的天梯数据在 **index.js** 的 `var cpuData = [[...]]`。
     2) raw.githubusercontent.com 在国内网络下**经常直接超时**（实测 7s 无响应），
        只挂它一个源等于「永远走兜底」。所以补了几个实测可用的镜像/代理，
        并且**全部并行发起、谁先成功用谁** —— 串行等 6 个源最坏要 36 秒。
     3) 镜像返回的是同一份 index.js（内容一致，只是字节数因换行符略有差异）。 */
const RAW = 'https://raw.githubusercontent.com/taxilng/Mobile_CPU_Ladder_Diagram';
const SOURCES = [
  'https://gh-proxy.com/' + RAW + '/master/index.js',        /* 实测 ~0.8s */
  'https://ghproxy.net/' + RAW + '/master/index.js',         /* 实测 ~1.9s */
  RAW + '/master/index.js',                                   /* 官方直链（海外最快） */
  'https://gcore.jsdelivr.net/gh/taxilng/Mobile_CPU_Ladder_Diagram@master/index.js',
  'https://cdn.jsdelivr.net/gh/taxilng/Mobile_CPU_Ladder_Diagram@master/index.js',
  RAW + '/main/index.js'                                      /* 任务书原文的 main 分支，兜底 */
];

/* cpuData 的列 → 品牌。列序取自源仓库 index.html 的表头
   （NVIDIA2/Google、骁龙S1..、骁龙2/4、骁龙6、骁龙7、骁龙8、三星、联发科7/8系、
     联发科9系、华为、苹果、Intel/紫光展锐）；
   注意 index.js 的 cpuData 行**不含**表头里那个 rowspan 装饰列，所以列号要整体前移一位。 */
const COLS = [
  'Google / NVIDIA', '高通骁龙', '高通骁龙', '高通骁龙', '高通骁龙', '高通骁龙',
  '三星', '联发科', '联发科', '华为', '苹果', 'Intel / 紫光展锐'
];

export async function onRequest({ request }) {
  /* caches.default 是 Cloudflare 专有 API；本地 dev / 单测环境下不存在，
     这里做空值守卫，退化成「每次都直连上游」而不是直接抛错。 */
  const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
  const cacheKey = new Request(CACHE_KEY, { method: 'GET' });

  /* Step 13 · B7：?fresh=1 = 前端「检查更新」按钮，跳过读缓存强制回源。
     普通访问仍然先命中缓存 —— 7 天内不打 GitHub。 */
  const wantFresh = new URL(request.url).searchParams.get('fresh') === '1';

  if (cache && !wantFresh) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (_) { /* 缓存读失败不影响主流程 */ }
  }

  let list = null;
  let source = 'fallback';

  /* 抓一个源（带超时 + 解析），失败返回 null */
  async function grab(src, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(src, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'LiteBox/5.0' },
        cf: { cacheTtl: CACHE_TTL }
      });
      if (!r.ok) return null;
      const parsed = parseLadderData(await r.text());
      return (parsed && parsed.length) ? parsed : null;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /* 谁先成功用谁：多个源**并行**发起，第一个解析成功的结果即采用。
     串行最坏 6 个源 × 6s = 36s；并行最坏只有 6s，正好卡在请求超时之内。 */
  function firstSuccess(promises) {
    return new Promise(function (resolve) {
      let pending = promises.length;
      let done = false;
      promises.forEach(function (p) {
        p.then(function (v) {
          pending--;
          if (!done && v) { done = true; resolve(v); }
          else if (pending === 0 && !done) { done = true; resolve(null); }
        });
      });
    });
  }

  list = await firstSuccess(SOURCES.map(function (s) { return grab(s, 6000); }));
  if (list) source = 'github';

  if (!list) list = getFallbackLadder();

  const body = JSON.stringify({
    list: list,
    source: source,
    count: list.length,
    updated: new Date().toISOString()
  });

  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + CACHE_TTL,
      'Access-Control-Allow-Origin': '*'
    }
  });

  if (cache && source === 'github') {
    /* 只有真正拿到远端数据才写缓存 —— 兜底数据不该被缓存 7 天，
       否则上游恢复后还要再等一周。 */
    try { await cache.put(cacheKey, response.clone()); } catch (_) {}
  } else if (cache && wantFresh) {
    /* 手动刷新但回源失败：任务书要求「清 Cache 再拉」，
       这里把旧缓存删掉，普通访问就不会再命中过期数据。 */
    try { await cache.delete(cacheKey); } catch (_) {}
  }
  return response;
}

/* ================================================================
 * 解析
 * ================================================================ */

/* 从 `var cpuData = [ ... ];` 里把最外层数组字面量抠出来。
   不能用 eval / new Function：Workers 里 CSP 会拦，而且不该执行远端代码。
   故手写一个带字符串状态机的括号匹配。 */
function extractArray(text, varName) {
  const at = text.indexOf(varName);
  if (at < 0) return null;
  const start = text.indexOf('[', at);
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/* 单元格 → 芯片名数组：拆 <br/>、并回续行、丢空值 */
function splitCell(cell) {
  const t = String(cell == null ? '' : cell)
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n');
  const out = [];
  t.split('\n').forEach(function (raw) {
    const p = raw.trim();
    if (!p) return;
    /* 以 ( / （ - 开头的片段是上一款被换行拆开的括号补充，并回去 */
    if (out.length && '(（/-'.indexOf(p[0]) >= 0) out[out.length - 1] += p;
    else out.push(p);
  });
  return out;
}

function parseLadderData(text) {
  if (!text) return null;

  /* 1) 先试标准 JSON（万一上游换成 JSON 接口） */
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j) && j.length) {
      /* 已经是 [{n,brand,score}] 就直接用 */
      if (typeof j[0] === 'object' && !Array.isArray(j[0])) {
        return j.filter(x => x && x.n).map(x => ({
          n: String(x.n), brand: x.brand || '其他',
          score: Number(x.score) || 0, year: x.year || ''
        }));
      }
      /* 二维数组也走下面的表格换算 */
      return fromGrid(j);
    }
  } catch (_) { /* 不是 JSON，继续 */ }

  /* 2) 从 JS 源码里抠数组字面量 */
  const arrText = extractArray(text, 'cpuData');
  if (!arrText) return null;

  let grid;
  try {
    /* 源文件用单引号；把每个单引号字符串转成合法 JSON 字符串后再 parse。
       （值里不含单引号，故逐段替换是安全的；用 JSON.stringify 转义也更稳） */
    const jsonish = arrText.replace(/'([^']*)'/g, function (_, s) { return JSON.stringify(s); });
    grid = JSON.parse(jsonish);
  } catch (_) {
    return null;
  }
  return fromGrid(grid);
}

/* 二维表格 → 扁平列表：行号决定分数，列号决定品牌 */
function fromGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) return null;
  const rows = grid.filter(r => Array.isArray(r));
  if (!rows.length) return null;

  const R = rows.length;
  const out = [];
  rows.forEach(function (row, ri) {
    /* 第 0 行最快 → 10000 分；最后一行 → 约 133 分（相对值，只用于横向比高低） */
    const score = Math.round(10000 * (R - ri) / R);
    row.forEach(function (cell, ci) {
      const brand = COLS[ci] || '其他';
      splitCell(cell).forEach(function (name) {
        out.push({ n: name, brand: brand, score: score, year: '' });
      });
    });
  });
  return out.length ? out : null;
}

/* ================================================================
 * 兜底：内置 TOP 50（上游不可达时至少还有一份可用的天梯）
 *   数据取自同一上游 2026-10 的快照，字段与解析结果完全一致。
 * ================================================================ */
function getFallbackLadder() {
  const RAW = [
    ['高通骁龙', '骁龙 8 Elite Gen5', 10000],
    ['联发科', '天玑 9500M', 10000],
    ['联发科', '天玑 9500', 10000],
    ['苹果', 'A19 Pro', 10000],
    ['高通骁龙', '骁龙8 Elite领先版', 9867],
    ['高通骁龙', '骁龙8 Elite', 9867],
    ['高通骁龙', '骁龙8 Elite(7核)', 9867],
    ['苹果', 'A19', 9867],
    ['高通骁龙', '骁龙8Gen5', 9733],
    ['联发科', '天玑9500s', 9733],
    ['联发科', '天玑9400+', 9733],
    ['联发科', '天玑9400', 9733],
    ['Intel / 紫光展锐', '玄戒 O1', 9733],
    ['联发科', '天玑9300+', 9467],
    ['联发科', '天玑9300', 9467],
    ['联发科', '天玑9400e', 9467],
    ['苹果', 'A18 Pro', 9467],
    ['高通骁龙', '骁龙8Gen3', 9333],
    ['高通骁龙', '骁龙8sGen4', 9333],
    ['苹果', 'A18', 9333],
    ['苹果', 'M1', 9333],
    ['联发科', '天玑8500', 9200],
    ['苹果', 'A17 Pro', 9200],
    ['高通骁龙', '骁龙8Gen2', 9067],
    ['联发科', '天玑8400', 9067],
    ['华为', '麒麟9030 Pro', 9067],
    ['苹果', 'A16', 9067],
    ['高通骁龙', '骁龙7+Gen3', 8933],
    ['高通骁龙', '骁龙8sGen3', 8933],
    ['三星', 'Exynos 2400', 8933],
    ['联发科', '天玑9200+', 8933],
    ['华为', '麒麟9030', 8933],
    ['苹果', 'A15', 8933],
    ['高通骁龙', '骁龙8+Gen1', 8800],
    ['联发科', '天玑9200', 8800],
    ['华为', '麒麟9030s', 8800],
    ['华为', '麒麟9020', 8800],
    ['苹果', 'A12Z/A12X', 8800],
    ['Google / NVIDIA', 'Google Tensor G4', 8667],
    ['高通骁龙', '骁龙7+Gen2', 8667],
    ['高通骁龙', '骁龙8Gen1', 8667],
    ['三星', 'Exynos 2200', 8667],
    ['联发科', '天玑8350', 8667],
    ['联发科', '天玑8300', 8667],
    ['联发科', '天玑9000', 8667],
    ['华为', '麒麟9010s', 8667],
    ['华为', '麒麟9010', 8667],
    ['华为', '麒麟8020', 8667],
    ['苹果', 'A14', 8667],
    ['Google / NVIDIA', 'Google Tensor G3', 8533]
  ];
  return RAW.map(r => ({ n: r[1], brand: r[0], score: r[2], year: '' }));
}
