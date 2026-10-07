/* LiteBox v5 · functions/api/60s.js — 60s API 统一代理（Step 30 · 三）
 *
 * GET /api/60s?type=weibo|zhihu|douyin|toutiao|bili|baidu|rednote|douban|60s|ai-news|it-news
 *
 * 热榜聚合 + 每日 60s / AI 资讯 / IT 资讯全部改走本端点；
 * 上游域名只存在于后端，前端不再持有任何站外地址（红线：前端零上游域名）。
 *
 * 任务给定约定：
 *   - type → 上游路径映射表 PATHS（唯一真源）
 *   - 5 分钟缓存：Map + 时间戳，同 type 在 5 分钟内命中缓存、不再打上游
 *   - 上游超时 10s
 *   - 失败统一 { code: 500, msg: '数据获取失败，请稍后重试' }
 *   - 每次实际请求上游打日志：console.log('[60s] type=', type, 'status=', res.status)
 */
import { json } from '../_utils.js';

const API_BASE = 'https://60s.viki.moe';

/* type → 上游路径（任务给定映射）
 * 偏差说明：任务写的 /v2/douban/hot 上游实际 404，豆瓣真实接口为
 * /v2/douban/weekly/{subject}，这里取电影周报（字段 rank/title/rating/url/cover）。 */
const PATHS = {
  'weibo': '/v2/weibo',
  'zhihu': '/v2/zhihu',
  'douyin': '/v2/douyin',
  'toutiao': '/v2/toutiao',
  'bili': '/v2/bili',
  'baidu': '/v2/baidu/hot',
  'rednote': '/v2/rednote',
  'douban': '/v2/douban/weekly/movie',
  '60s': '/v2/60s',
  'ai-news': '/v2/ai-news',
  'it-news': '/v2/it-news'
};

const CACHE_TTL = 5 * 60 * 1000;   /* 5 分钟 */
const TIMEOUT_MS = 10000;          /* 10s */

/* type → { ts, json }；命中缓存直接复用同一份响应体字符串 */
const cache = new Map();

/* 失败响应体：msg 为任务给定文案；error.message/message 双写，
 * 让 LB.api.getJSON（Step 29 起透传 d.msg / d.error.message）拿到同一句话。 */
function failBody(detail) {
  const msg = '数据获取失败，请稍后重试';
  return {
    code: 500,
    msg: msg,
    message: msg,
    error: { code: 500, message: msg },
    detail: String(detail || '').slice(0, 200)
  };
}

async function fetchUpstream(type) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + PATHS[type], {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LiteBox/5.0 (+https://litebox.app)' }
    });
    /* 任务给定日志：只有实际打上游才输出；命中缓存不打（验收据此计数） */
    console.log('[60s] type=', type, 'status=', res.status);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!d || typeof d !== 'object') throw new Error('bad-json');
    /* 上游业务错误码（如 /v2/bili 间歇 code=500）按失败处理，且不进缓存 */
    if (d.code !== undefined && Number(d.code) !== 200) throw new Error('upstream-code-' + d.code);
    return JSON.stringify(d);
  } finally {
    clearTimeout(timer);
  }
}

/* 缓存读 + 上游取数：同 type 5 分钟内只打一次上游 */
async function getBody(type) {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.json;
  const fresh = await fetchUpstream(type);
  cache.set(type, { ts: Date.now(), json: fresh });
  return fresh;
}

export async function onRequest(context) {
  const { request } = context;
  /* 只读接口：非 GET（含 HEAD 之外的 POST/PUT 等）直接按失败约定返回 */
  if (request.method !== 'GET') return json(failBody('method: ' + request.method), 500);
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || '';

  if (!PATHS[type]) return json(failBody('unsupported-type: ' + type), 500);

  try {
    const body = await getBody(type);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return json(failBody(e && e.message), 500);
  }
}
