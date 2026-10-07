/* LiteBox v5 · functions/api/60s.js — 60s API 统一代理（Step 30 · 三 + Step 30.1 多主机回退）
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
 *
 * Step 30.1（线上 403 修复 · 只做多主机回退，其余约定不变）：
 *   线上部署后所有请求返回 detail:"HTTP 403"。定位结论：Cloudflare 在自己
 *   边缘节点之间转发请求时会强制注入 cf-connecting-ip 头，而主域名站点的
 *   CDN 规则对该头直接回 403（error code: 1000）。本项目 Functions 跑在
 *   Cloudflare 上，因此「CF → 主域名」这一跳 100% 被拒，与访客量、缓存无关。
 *   （对照实验：裸请求 200；只加 cf-ray / cf-visitor 仍 200；只加
 *    cf-connecting-ip 即 403，且换成任意 IP 值结果相同。）
 *   处理方式：保留任务给定的主域名作为首选，后面挂若干**不在 Cloudflare
 *   后面**的官方社区公共实例做回退，逐台试到成功为止。
 *   速度保障：① 单次请求的**总**上游预算仍是 10s（任务约定不变），
 *   ② 每台主机最长只占 6s，保证预算内还有余量回退；
 *   ③ 失败主机进入 10 分钟冷却，并把「上次成功的主机」提到队首，
 *   所以只有第一次会白等一趟主域名，之后直接命中可用源。
 */
import { json } from '../_utils.js';

/* 上游主机候选（顺序即优先级，与 functions/api/movie-rank.js 的 HOSTS_60S 同一套实例）。
 * 任务给定的 Base URL 保持第一位；其余为 60s API 官方文档「公共实例列表」中的实例，
 * 均已实测 11 个 type：数据与主域名逐字一致（同日期 / 同农历 / 同条数），
 * 且站在 nginx / 腾讯云 EdgeOne 后面，不会因为 cf-connecting-ip 被拒。
 * 顺序按实测延迟排（mizhoubaobei / crystelf / 7se 亚秒级，elysiayanyu 较慢）。 */
const HOSTS = [
  'https://60s.viki.moe',        /* 任务给定主域名（Cloudflare 上，CF 内访问会被 403） */
  'https://60s.mizhoubaobei.top', /* 社区实例 · TencentEdgeOne */
  'https://60s.crystelf.top',     /* 社区实例 · nginx */
  'https://60s.7se.cn',           /* 社区实例 · nginx */
  'https://api.elysiayanyu.top'   /* 社区实例 · TencentEdgeOne（ai-news 偶发空列表，靠下方空数据校验兜住） */
];

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
const TIMEOUT_MS = 10000;          /* 上游总超时 10s（任务约定，含所有主机） */
const HOST_BUDGET_MS = 6000;       /* 正常单主机预算（镜像里最慢的 ai-news 实测 ~5.2s，需容得下） */
const PROBE_BUDGET_MS = 3000;      /* 主域名在未证实可用前的短预算 */
const HOST_DOWN_MS = 10 * 60 * 1000; /* 失败主机冷却 10 分钟，避免每次都白等 */

/* type → { ts, json }；命中缓存直接复用同一份响应体字符串 */
const cache = new Map();
/* host → 冷却到期时间戳（仅故障主机有记录） */
const hostDown = new Map();
/* 本 isolate 内上一次真正成功的主机；null = 还没有任何主机被证实可用 */
let preferred = null;

/* 主机尝试顺序：未冷却的在前（preferred 提到最前），已冷却的垫底兜底。
 * 全部冷却时仍然全试一遍 —— 宁可慢，不可直接判死。 */
function hostOrder(now) {
  const alive = [];
  const cooled = [];
  for (const h of HOSTS) {
    if ((hostDown.get(h) || 0) > now) cooled.push(h);
    else alive.push(h);
  }
  if (preferred && alive.length > 1) {
    const i = alive.indexOf(preferred);
    if (i > 0) alive.unshift(alive.splice(i, 1)[0]);
  }
  return alive.concat(cooled);
}

/* 单主机预算。主域名是唯一「已知从 Cloudflare 内部会被 403」的一台，它的 403
 * 延迟还不可控（实测 0.9s ~ 13.3s）——若按 6s 等它，冷 isolate 的第一个用户可能
 * 把整趟 10s 预算耗在一个注定失败的请求上，后面真正的镜像就没时间了。
 * 所以：主域名在「被证实可用之前」只给 PROBE_BUDGET_MS；一旦它真成功过
 * （部署到非 CF 环境、或上游规则放宽）就恢复正常预算。镜像一律给满预算，
 * 因为 ai-news 这类接口在镜像上本身就要 4~5s，压短会误伤。 */
function hostBudget(host) {
  return (host === HOSTS[0] && host !== preferred) ? PROBE_BUDGET_MS : HOST_BUDGET_MS;
}

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

/* 打一台主机：任何失败（非 2xx / 非 JSON / 业务码≠200 / 超时 / 网络异常）
 * 都抛错，交给上层换下一台。 */
async function tryHost(host, type, budget) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budget);
  try {
    const res = await fetch(host + PATHS[type], {
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
    /* 空数据也按失败处理并换源：个别镜像会返回 code:200 但 data 为空数组
     * （实测 api.elysiayanyu.top 的 ai-news），否则前端照样是「数据获取失败」。 */
    if (isEmptyPayload(d)) throw new Error('empty-payload');
    return JSON.stringify(d);
  } finally {
    clearTimeout(timer);
  }
}

/* data 为空数组 / 空对象 / news 列表为空 → 视为无内容 */
function isEmptyPayload(d) {
  if (!('data' in d)) return false;           /* 无 data 字段的形态不猜，交给上层解析 */
  const x = d.data;
  if (Array.isArray(x)) return x.length === 0;
  if (x && typeof x === 'object') {
    if (Array.isArray(x.news)) return x.news.length === 0;
    return Object.keys(x).length === 0;
  }
  return x === null || x === undefined || x === '';
}

/* 多主机回退取数：总预算 TIMEOUT_MS，单台最多 hostBudget(host) */
async function fetchUpstream(type) {
  const deadline = Date.now() + TIMEOUT_MS;
  const order = hostOrder(Date.now());
  let lastErr = 'no-upstream-host';
  for (const host of order) {
    const left = deadline - Date.now();
    if (left <= 0) { lastErr = 'budget-exhausted: ' + lastErr; break; }
    try {
      const body = await tryHost(host, type, Math.min(left, hostBudget(host)));
      preferred = host;          /* 成功即记为首选，下次不再白等故障源 */
      hostDown.delete(host);
      return body;
    } catch (e) {
      lastErr = (e && e.message) || String(e);
      hostDown.set(host, Date.now() + HOST_DOWN_MS);
    }
  }
  throw new Error(lastErr);
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
