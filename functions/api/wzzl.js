/* LiteBox v5 · functions/api/wzzl.js — 王者荣耀战力查询（GET /api/wzzl?name=&lei=）
 *
 * Step 35 · 一：上游整体换成千寻 API（api.lvxiaodong.com）的「王者荣耀战力查询（2）」，
 *   文档 https://api.lvxiaodong.com/doc/wzzlpro —— **免密钥**，部署侧不再需要
 *   配置 YAOHUD_KEY（妖狐 v6 需要密钥且按 QPS 计费，公益接口对工具箱更合适）。
 *
 * 【四格战力怎么映射】新接口返回的不是「四档战力」而是三份**升序**数组
 *   （county 县区 / city 地级市 / province 省份，每项 {loc, val}）加 Top10 / Top100
 *   （全国第十 / 第一百名战力）。按榜单常识取位，展示语义与妖狐版完全一致：
 *     最低战力 = county[0]        （全国最容易上榜的县区门槛）
 *     中等战力 = city[0]          （地级市最低门槛）
 *     最高战力 = province 末位    （全国最高的省级门槛）
 *     国标战力 = Top10            （国服前十守门员）
 *   三档所在地区 tiers 用同一批条目的 loc（各地不同，一档一行）；
 *   Top100 进 extra、英雄职业（hero_type）当称号展示，不编数据。
 *
 * 【兼容】对外参数仍是 name/lei（前端请求地址不变）；旧短码 qq/wx/pqq/pwx 与
 *   中文大区自动映射到新接口的 aqq/awx/iqq/iwx —— 手机上还缓存着 5.10.0 旧 JS
 *   的用户不会因为这次换接口全线失败。
 *
 * 【边缘缓存】上游限 QPS 1.667，战力数据分钟级更新：成功响应按归一化 key
 *   进 CF Cache API 存 10 分钟，热门英雄集中查询不打爆上游，二次查询毫秒级回包。
 *
 * 【错误分档】（用户在界面直接可读）
 *   · 参数缺失 / 大区不合法            → 400
 *   · 上游业务失败（查无英雄等）        → 404「未找到该英雄的战力数据」
 *   · 上游裸 404 / 非 JSON（接口方故障）→ 502「战力服务上游暂不可用」
 *   · 网络 / 超时                      → 502「战力查询服务暂时不可用」
 *
 * 【图片域名】photo 固定是 game.gtimg.cn，允许前端直载（Step 32 明示例外：
 *   图片不是 API 请求）；万一换成其它 https 域名统一转 /api/shortvideo-proxy。
 */
import { json, err } from '../_utils.js';

const API = 'https://api.lvxiaodong.com/api/wzzlpro';
const UPSTREAM_TIMEOUT_MS = 8000;
const EDGE_TTL_S = 600;

/* 对外类型（新接口文档取值）；旧短码 / 中文一并兼容（缓存里的旧 JS 仍可能发旧值） */
const TYPES = ['aqq', 'awx', 'iqq', 'iwx'];
const TYPE_ALIAS = {
  'aqq': 'aqq', 'awx': 'awx', 'iqq': 'iqq', 'iwx': 'iwx',
  'qq': 'aqq', 'wx': 'awx', 'pqq': 'iqq', 'pwx': 'iwx',
  '安卓qq': 'aqq', '安卓wx': 'awx', '苹果qq': 'iqq', '苹果wx': 'iwx',
  '安卓微信': 'awx', '苹果微信': 'iwx', '安卓QQ': 'aqq', '苹果QQ': 'iqq'
};
/* 上游 platform 只是短码，界面要的是中文大区名 */
const TYPE_LABEL = { 'aqq': '安卓QQ', 'awx': '安卓微信', 'iqq': '苹果QQ', 'iwx': '苹果微信' };

/* 「13859」→ 13859；字符串数字 / 数字统一成整数，脏值记 0（前端显示 —） */
function num(v) {
  return Math.round(Number(String(v === null || v === undefined ? '' : v).replace(/[^\d.-]/g, ''))) || 0;
}

/* 从 {loc,val} 数组按位置取条目（i 为 -1 表示升序末位 = 最高门槛） */
function entryAt(list, i) {
  if (!Array.isArray(list) || !list.length) return null;
  const e = list[i < 0 ? list.length - 1 : i];
  if (!e || typeof e !== 'object') return null;
  return { loc: String(e.loc || '').trim(), val: num(e.val) };
}

/* 三档门槛各在哪个区服（与妖狐版「最低/中等/最高在三个不同地区」的展示形态一致） */
function tierRow(label, e) {
  if (!e || !e.loc) return null;
  return { k: label + '所在', v: e.loc + (e.val ? '（' + e.val + '）' : '') };
}

/* 图片地址：gtimg 允许直载（Step 32 例外），其它 https 走同源代理，非 https 丢弃 */
function picUrl(u) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  if (/^https:\/\/game\.gtimg\.cn\//i.test(s)) return s;
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s);
}

/* 上游请求带浏览器特征头：公益接口前面同样可能有边缘防护，伪装成正常调用方零成本 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://api.lvxiaodong.com/',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

async function fetchUpstream(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: BROWSER_HEADERS, redirect: 'follow' });
    return { status: res.status, text: String((await res.text()) || ''), ct: res.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, text: '', ct: '', error: (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/* CF Cache API 边缘缓存（跨 isolate 共享）：本地 dev / 运行时不支持时静默降级 */
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
  } catch (_) { /* 同上：不支持就退化为无缓存 */ }
}

export async function onRequest(context) {
  const { request, env } = context;
  void env; /* Step 35 起免密钥：不再读任何环境变量（保留解构形状，调用方无需感知） */

  if (request.method !== 'GET') return err('只支持 GET', 405);

  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || url.searchParams.get('hero') || '').trim();
  const rawType = (url.searchParams.get('lei') || url.searchParams.get('type') || '').trim();
  const type = TYPE_ALIAS[rawType] || TYPE_ALIAS[rawType.toLowerCase()] || '';

  if (!name) return err('请输入英雄名称', 400);
  if (name.length > 20) return err('英雄名称过长', 400);
  if (TYPES.indexOf(type) < 0) return err('平台选项不正确', 400);

  /* 归一化缓存 key：大区统一成小写短码，杜绝同义参数（qq / aqq / 安卓QQ）各存一份 */
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '?name=' + encodeURIComponent(name) + '&lei=' + encodeURIComponent(type);
  cacheUrl.hash = '';
  const cacheKey = cacheUrl.toString();

  const cached = await edgeGet(cacheKey);
  if (cached) {
    console.log('[wzzl] edge cache hit:', name, type);
    return new Response(cached, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  console.log('[wzzl] name=', name, 'type=', type);
  const upstream = API + '?hero=' + encodeURIComponent(name) + '&type=' + encodeURIComponent(type);

  const r = await fetchUpstream(upstream);
  console.log('[wzzl] upstream status=', r.status, 'content-type=', r.ct || '-', r.error || '');
  if (r.status === 0) {
    console.warn('[wzzl] upstream timeout/error:', r.error);
    return err('战力查询服务暂时不可用', 502);
  }

  const body = r.text;
  console.log('[wzzl] upstream raw=', body.slice(0, 300));

  let d = null;
  try { d = JSON.parse(body); } catch (_) { d = null; }

  /* 上游裸 404（Go 网关 "404 page not found"）或非 JSON：接口方服务异常，不是查询姿势问题 */
  if (!d) {
    console.warn('[wzzl] upstream non-JSON response (HTTP ' + r.status + ')');
    return err('战力服务上游暂不可用（接口方故障），请稍后再试', 502);
  }
  if (Number(d.code) !== 200 || !d.data || typeof d.data !== 'object') {
    console.warn('[wzzl] upstream returned:', d && d.code, d && (d.message || d.msg));
    return err('未找到该英雄的战力数据', 404);
  }

  const v = d.data;
  const county = entryAt(v.county, 0);   /* 县区升序首位 = 全国最低门槛 */
  const city = entryAt(v.city, 0);       /* 地级市升序首位 = 市级门槛 */
  const prov = entryAt(v.province, -1);  /* 省份升序末位 = 全国最高省级门槛 */

  const result = {
    code: 200,
    hero: String(v.name || name),
    title: String(v.hero_type || ''),
    platform: TYPE_LABEL[type] || type,
    pic: picUrl(v.photo),
    power: {
      min: county ? county.val : 0,
      mid: city ? city.val : 0,
      max: prov ? prov.val : 0,
      national: num(v.Top10)
    },
    area: county ? county.loc : '',
    updated: String(v.updatetime || ''),
    tiers: [tierRow('最低门槛', county), tierRow('中等门槛', city), tierRow('最高门槛', prov)].filter(Boolean),
    /* Top100 四格里没位置，进 extra 备查 */
    extra: num(v.Top100) ? [{ k: '全国第100名', v: String(num(v.Top100)) }] : []
  };

  /* 只缓存成功结果；失败不缓存，接口方恢复后立即可用。
     context.waitUntil 让缓存写入不阻塞响应（与 60s.js 的做法一致） */
  edgePut(context, cacheKey, JSON.stringify(result));

  return json(result);
}
