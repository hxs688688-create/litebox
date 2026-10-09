/* LiteBox v5 · functions/api/60s-multi.js — 60s 数据批量端点（Step 34 · 三）
 *
 * GET /api/60s-multi?types=weibo,zhihu,…&_t=…
 *   → { code: 200, data: { weibo: <上游原始 data>, … }, failed: ['xxx', …] }
 *
 * 【为什么要有它】热榜聚合有 24 个榜单，上一版前端预加载是「串行一次一个」，
 * 每个请求都要独立走一次 网络往返 + 后端择优，冷启动时 24 榜要 20s+ 才全部就位，
 * 这就是「热搜/资讯加载都好慢」的主力之一。批量端点一次请求并行取 N 个 type，
 * 前端 3 批（8 个/批）就能把全部榜单喂进缓存。
 *
 * 契约与红线：
 *   - 与 /api/60s 同一套上游与择优逻辑（import getBody / failBody / isSupportedType），
 *     前端仍只看到同源 /api/60s-multi，**上游域名依旧零暴露**；
 *   - shallow=true：批量模式跳过仲裁轮 —— CF 免费版每请求 subrequest 上限 50，
 *     10 type × 3 主机 = 30 已接近红线，不能再补仲裁（预加载宁快勿全，单榜
 *     精确性由用户点开时的 /api/60s 单请求兜底）；
 *   - 上限 10 个 type / 请求：30 个 subrequest 留足余量（边缘缓存命中时不耗 subrequest）；
 *   - 边缘缓存同样适用（key 含完整 types 串，剥 _t），45s 内重复批量预加载零回源；
 *   - 单个 type 失败不影响整批：进 failed 数组，前端按「无数据」跳过该榜。
 */
import { json } from '../_utils.js';
import { getBody, failBody, isSupportedType } from './60s.js';

const MAX_TYPES = 10;
const EDGE_TTL_S = 45;

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET') return json(failBody('method: ' + request.method), 500);

  const url = new URL(request.url);
  const requested = (url.searchParams.get('types') || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  /* 去重 + 白名单过滤 + 截断：未知 type 直接当失败返回，不让它混进取数流程 */
  const seen = new Set();
  const wanted = [];
  for (const t of requested) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (wanted.length >= MAX_TYPES) break;
    wanted.push(t);
  }
  if (!wanted.length) return json(failBody('missing-types'), 400);
  const unknown = wanted.filter(t => !isSupportedType(t));
  const valid = wanted.filter(t => isSupportedType(t));

  /* 边缘缓存读：key = 路径 + 归一化 types（顺序无关 → 排序后做 key），剥 _t */
  const sortedValid = valid.slice().sort();
  const keyUrl = new URL(request.url);
  keyUrl.search = '?types=' + encodeURIComponent(sortedValid.join(','));
  const cacheKey = new Request(keyUrl.toString(), { method: 'GET' });
  let edgeBody = null;
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) edgeBody = await hit.text();
  } catch (_) { edgeBody = null; }
  if (edgeBody !== null) {
    console.log('[60s-multi] edge hit types=', sortedValid.join(','));
    return new Response(edgeBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  const startedAt = Date.now();
  const data = {};
  const failed = unknown.slice();
  await Promise.all(valid.map(t =>
    getBody(t, { shallow: true })
      .then(body => {
        try { data[t] = JSON.parse(body); } catch (_) { failed.push(t); }
      })
      .catch(() => { failed.push(t); })
  ));
  console.log('[60s-multi] done types=', valid.join(','), 'ok=', Object.keys(data).length,
    'failed=', failed.length, 'ms=', Date.now() - startedAt);

  const body = JSON.stringify({ code: 200, data: data, failed: failed });
  try {
    const resp = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=' + EDGE_TTL_S
      }
    });
    const p = caches.default.put(cacheKey, resp);
    if (context.waitUntil) context.waitUntil(p);
  } catch (_) { /* 不支持 Cache API 时静默降级 */ }

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
