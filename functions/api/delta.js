/* LiteBox v5 · functions/api/delta.js — 三角洲行动每日密码（GET /api/delta）
 *
 * Step 36 · 二（新工具）：上游公开免密钥接口返回当日所有密码门数据：
 *   {"status":"success","update_date":"10月09日",
 *    "data":[{"name":"零号大坝","password":"2129","location":"…位置说明…",
 *             "image":"https://img.71acg.net/sykb~bbs/pc/xxx",
 *             "images":["…", "…"]}]}
 *
 * 【图片同源红线】截图床 img.71acg.net 实测带 / 不带 Referer 都直接 200
 *   （2026-10-09 实测 image/jpeg），但为满足「前端零第三方域名」红线，
 *   统一转 /api/shortvideo-proxy 同源代理（未知平台回落抖音 Referer 实测可达）。
 *
 * 【边缘缓存】数据每日更新一次，边缘缓存 30 分钟：跨 isolate 复用，
 *   午夜上游刷新后最多延迟半小时可见；只缓存成功结果，失败立即重试上游。
 */

import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.sk89.cn/api/mm.php';
const EDGE_TTL_S = 1800; /* 30 分钟 */

/* 第三方截图 → 同源代理地址（只接受 https） */
function viaProxy(u) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s);
}

/* ============ 边缘缓存（跨 isolate 共享，不支持时静默降级） ============ */
async function edgeGet(cacheKey) {
  try {
    const hit = await caches.default.match(cacheKey);
    return hit ? await hit.text() : null;
  } catch (_) { return null; }
}
function edgePut(context, cacheKey, body) {
  try {
    const p = caches.default.put(cacheKey, new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=' + EDGE_TTL_S
      }
    }));
    if (context && context.waitUntil) context.waitUntil(p);
  } catch (_) { /* 本地 dev / 运行时不支持 Cache API 时静默降级 */ }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET') return err('只支持 GET', 405);

  /* 无用户参数，缓存 key 固定（一个站一份当日数据） */
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.hash = '';
  const cacheKey = cacheUrl.toString();

  const cached = await edgeGet(cacheKey);
  if (cached) return new Response(cached, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

  let d = null;
  try {
    d = await fetchJSON(API, 12000, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://api.sk89.cn/' }
    });
  } catch (e) {
    console.warn('[delta] upstream network fail:', String(e && e.message).slice(0, 60));
    return err('密码服务暂时不可用，请稍后重试', 502);
  }

  if (!d || d.status !== 'success' || !Array.isArray(d.data) || !d.data.length) {
    console.warn('[delta] upstream bad shape:',
      d && d.status, Array.isArray(d && d.data) ? d.data.length : typeof (d && d.data));
    return err('今日密码暂时无法获取，请稍后重试', 502);
  }

  const items = d.data.map(x => ({
    name: String((x && x.name) || '').trim(),
    password: String((x && x.password) || '').trim(),
    location: String((x && x.location) || '').trim(),
    image: viaProxy(x && x.image),
    images: (Array.isArray(x && x.images) ? x.images : [])
      .map(img => viaProxy(img)).filter(Boolean)
  })).filter(x => x.name && x.password);

  if (!items.length) return err('今日密码暂时无法获取，请稍后重试', 502);

  const result = {
    updateDate: String(d.update_date || ''),
    timestamp: String(d.timestamp || ''),
    count: items.length,
    items: items
  };

  /* 只缓存成功结果；失败不缓存 */
  edgePut(context, cacheKey, JSON.stringify(result));
  return json(result);
}
