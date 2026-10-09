/* LiteBox v5 · functions/api/wzzl.js — 王者荣耀战力查询（GET /api/wzzl?name=&lei=）
 *
 * Step 35.1 · 主备双通道（用户实测千寻 wzzlpro 在其部署上报「接口不可用」后重做）。
 *
 * 【主通道 · 千寻 wzzlpro】文档 https://api.lvxiaodong.com/doc/wzzlpro，免密钥：
 *   GET api.lvxiaodong.com/api/wzzlpro?hero=&type=（aqq/awx/iqq/iwx）
 *   成功返回 {code:200,data:{Top10,Top100,city[],county[],province[],hero_type,
 *   name,photo,platform,updatetime}}，county/city/province 是升序 {loc,val} 数组。
 *   四格映射（与妖狐版展示语义一致）：
 *     最低=county[0]（全国县区最低门槛）· 中等=city[0]（地级市最低）
 *     最高=province 末位（全国最高省级）· 国标=Top10（国服前十守门员）
 *   tiers 三行用同批条目 loc；Top100 进 extra；hero_type 当称号；photo=gtimg 直载。
 *
 * 【为什么需要备用通道】2026-10-09 沙箱实测：wzzlpro 的 GET 在火山 CDN 全国 10 个
 *   边缘节点全部返回 Go 网关裸 404，而**同一网关**的 dypro 完全正常（成功响应都能
 *   拿到）；POST wzzlpro 报 980201「请求方法错误」也证明网关路由存在 —— 即千寻的
 *   **战力上游服务自身故障**，代码侧无法绕过（curl / WebFetch 双通道、XFF、
 *   浏览器头、路径变体全部验证）。因此：
 *
 * 【备通道 · 妖狐 v6（Step 33/34 已验证的完整实现原样回收）】用户在 Cloudflare
 *   已配好 YAOHUD_KEY 且在线调试可用。主通道失败时**自动**切妖狐（若 env.YAOHUD_KEY
 *   配置了），前端无感；千寻恢复后自然回到主通道。密钥仍只从 env 读、不进日志。
 *
 * 【兼容】对外参数仍是 name/lei；旧短码 qq/wx/pqq/pwx 与中文大区自动映射
 *   （千寻 aqq/awx/iqq/iwx、妖狐 qq/wx/pqq/pwx 各取所需）。
 *
 * 【边缘缓存】成功响应按归一化 key 进 CF Cache API 存 10 分钟 —— 主备通道切换
 *   期间热门英雄集中查询不会把两边都打爆，二次查询毫秒级回包。
 *
 * 【错误分档】参数 400 / 主备全失败 → 502（文案说明两条通道状态，界面可读）。
 */
import { json, err } from '../_utils.js';

const QX_API = 'https://api.lvxiaodong.com/api/wzzlpro';
const YHH_API = 'https://api.yaohud.cn/api/v6/wzzl';
const UPSTREAM_TIMEOUT_MS = 8000;
const EDGE_TTL_S = 600;

/* 对外类型 = 千寻短码；旧短码 / 中文一并兼容（缓存里的旧 JS 仍可能发旧值） */
const TYPES = ['aqq', 'awx', 'iqq', 'iwx'];
const TYPE_ALIAS = {
  'aqq': 'aqq', 'awx': 'awx', 'iqq': 'iqq', 'iwx': 'iwx',
  'qq': 'aqq', 'wx': 'awx', 'pqq': 'iqq', 'pwx': 'iwx',
  '安卓qq': 'aqq', '安卓wx': 'awx', '苹果qq': 'iqq', '苹果wx': 'iwx',
  '安卓微信': 'awx', '苹果微信': 'iwx', '安卓QQ': 'aqq', '苹果QQ': 'iqq'
};
const TYPE_LABEL = { 'aqq': '安卓QQ', 'awx': '安卓微信', 'iqq': '苹果QQ', 'iwx': '苹果微信' };
/* 妖狐用旧短码 */
const YHH_TYPE = { 'aqq': 'qq', 'awx': 'wx', 'iqq': 'pqq', 'iwx': 'pwx' };

function num(v) {
  return Math.round(Number(String(v === null || v === undefined ? '' : v).replace(/[^\d.-]/g, ''))) || 0;
}

/* 千寻 {loc,val} 数组按位置取条目（i 为 -1 表示升序末位 = 最高门槛） */
function entryAt(list, i) {
  if (!Array.isArray(list) || !list.length) return null;
  const e = list[i < 0 ? list.length - 1 : i];
  if (!e || typeof e !== 'object') return null;
  return { loc: String(e.loc || '').trim(), val: num(e.val) };
}

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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

async function fetchRaw(url, budgetMs, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    const headers = Object.assign({}, BROWSER_HEADERS, cookie ? { 'Cookie': cookie } : {}, {
      'Referer': url.indexOf('lvxiaodong') > -1 ? 'https://api.lvxiaodong.com/' : 'https://api.yaohud.cn/'
    });
    const res = await fetch(url, { signal: ctrl.signal, headers: headers, redirect: 'follow' });
    return { status: res.status, text: String((await res.text()) || ''), sc: res.headers.get('set-cookie') || '', ct: res.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, text: '', sc: '', ct: '', error: (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/* ============ 主通道 · 千寻 wzzlpro ============ */
async function fetchQx(hero, type) {
  const r = await fetchRaw(QX_API + '?hero=' + encodeURIComponent(hero) + '&type=' + encodeURIComponent(type), UPSTREAM_TIMEOUT_MS, '');
  console.log('[wzzl] qx status=', r.status, r.error || '');
  if (r.status === 0 || r.error) return { fail: '网络/超时' };
  let d = null;
  try { d = JSON.parse(r.text); } catch (_) { d = null; }
  /* 裸 404（Go 网关）或非 JSON：千寻战力服务自身异常 */
  if (!d) return { fail: '千寻战力服务无响应（裸 ' + r.status + '）' };
  if (Number(d.code) !== 200 || !d.data || typeof d.data !== 'object') {
    return { fail: '千寻业务失败: ' + (d.code || '-') + ' ' + String(d.message || d.msg || '').slice(0, 40) };
  }
  const v = d.data;
  const county = entryAt(v.county, 0);
  const city = entryAt(v.city, 0);
  const prov = entryAt(v.province, -1);
  const extra = [];
  if (num(v.Top100)) extra.push({ k: '全国第100名', v: String(num(v.Top100)) });
  return {
    via: 'qx',
    result: {
      code: 200,
      hero: String(v.name || hero),
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
      extra: extra
    }
  };
}

/* ============ 备通道 · 妖狐 v6（Step 33/34 完整加固实现回收） ============ */
/* 上游在阿里云 ESA 边缘后面：先带浏览器头请求，若被挑战则带下发的 acw_tc /
 * cdn_sec_tc 通行 cookie 重试一次 —— acw_tc 是服务端下发即带即过的类型 */
function wafCookieFrom(setCookie) {
  const pairs = String(setCookie || '').split(/,(?=[^;]+?=)/).map(s => s.trim());
  const keep = [];
  for (const p of pairs) {
    const kv = p.split(';')[0];
    if (/^(acw_tc|cdn_sec_tc|server_session[^=]*)=/i.test(kv)) keep.push(kv);
  }
  return keep.join('; ');
}
function looksChallenged(r) {
  if (!r || r.error) return true;
  if (r.status === 0 || r.status >= 500) return true;
  if (/text\/html/i.test(r.ct) && !/application\/json/i.test(r.ct)) return true;
  try { JSON.parse(r.text); return false; } catch (_) { return true; }
}
/* 文档字段缺失时的兜底候选键 */
const PATTERNS = {
  hero: ['name', '英雄', '英雄名', 'hero'],
  pic: ['pic', '图片', '头像', 'image', 'icon', 'photo'],
  powerMin: ['lowest', '最低', '最低战力', 'min'],
  powerMid: ['medium', '中等', '中等战力', 'avg'],
  powerMax: ['highest', '最高', '最高战力', 'max'],
  national: ['guobiao', '国标', '国服', 'national'],
  area: ['lowestname', '地区', '区域', '战区', '城市', '省份', 'area', 'region'],
  updated: ['time', '更新时间', 'update', 'updatetime']
};
function pick(obj, names) {
  const keys = Object.keys(obj);
  for (const n of names) {
    const hit = keys.find(k => k.toLowerCase() === n.toLowerCase());
    if (hit !== undefined && obj[hit] !== null && obj[hit] !== '') return obj[hit];
  }
  for (const n of names) {
    const hit = keys.find(k => k.toLowerCase().indexOf(n.toLowerCase()) > -1);
    if (hit !== undefined && obj[hit] !== null && obj[hit] !== '') return obj[hit];
  }
  return '';
}
function powerOf(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object') return Number(v['战力'] || v.power || v.value || 0) || 0;
  return num(v);
}
function yhhTierRows(v) {
  const rows = [];
  const push = (label, place, val) => {
    const p = String(place || '').trim();
    if (p) rows.push({ k: label + '所在', v: p + (powerOf(val) ? '（' + Math.round(powerOf(val)) + '）' : '') });
  };
  push('最低门槛', v.lowestname, v.lowest);
  push('中等门槛', v.mediumname, v.medium);
  push('最高门槛', v.highestname, v.highest);
  return rows;
}
function yhhExtraRows(v) {
  const used = new Set();
  Object.keys(PATTERNS).forEach(group => {
    const hit = pick(v, PATTERNS[group]);
    if (hit !== '') used.add(String(hit));
  });
  ['lowestname', 'mediumname', 'highestname'].forEach(k => {
    if (v[k] !== undefined && v[k] !== null) used.add(String(v[k]));
  });
  const rows = [];
  for (const k of Object.keys(v)) {
    const val = v[k];
    if (val === null || val === undefined || val === '') continue;
    if (typeof val === 'object') continue;
    if (used.has(String(val))) continue;
    if (/key|token|ip|clientIP|exec_time|tips|来源|remark|lowestname|mediumname|highestname/i.test(k)) continue;
    rows.push({ k: String(k), v: String(val).slice(0, 60) });
    if (rows.length >= 6) break;
  }
  return rows;
}
async function fetchYhh(hero, yhhType, key) {
  const upstream = YHH_API + '?key=' + encodeURIComponent(key) +
    '&name=' + encodeURIComponent(hero) + '&lei=' + encodeURIComponent(yhhType);
  let r = await fetchRaw(upstream, 6000, '');
  console.log('[wzzl] yhh status=', r.status, r.error || '');
  if (looksChallenged(r) && r.status !== 0) {
    const cookie = wafCookieFrom(r.sc);
    if (cookie) {
      const r2 = await fetchRaw(upstream, 4000, cookie);
      if (!looksChallenged(r2)) r = r2;
      console.log('[wzzl] yhh retry status=', r2.status);
    }
  }
  if (looksChallenged(r)) return { fail: r.status === 0 ? '网络/超时' : '妖狐防护拦截/非JSON' };
  let d = null;
  try { d = JSON.parse(r.text); } catch (_) { d = null; }
  if (!d) return { fail: '妖狐非JSON' };
  if (Number(d.code) !== 200 || !d.data) {
    const msg = String((d && d.msg) || '');
    if (/密钥|key|token/i.test(msg) || Number(d.code) === 403) return { fail: '妖狐密钥校验失败' };
    return { fail: '妖狐查无数据: ' + msg.slice(0, 40) };
  }
  let v = d.data;
  if (Array.isArray(v)) v = v[0] || {};
  if (Array.isArray(v.data)) v = v.data[0] || {};
  if (typeof v !== 'object' || v === null) v = {};
  const has = k => v[k] !== undefined && v[k] !== null && v[k] !== '';
  const tiers = yhhTierRows(v);
  const areaFromTier = tiers.length ? tiers[0].v.replace(/（.*）$/, '') : '';
  return {
    via: 'yhh',
    result: {
      code: 200,
      hero: has('name') ? String(v.name) : String(pick(v, PATTERNS.hero) || hero),
      title: String(pick(v, ['称号', '头衔', 'alias', 'title']) || ''),
      platform: TYPE_LABEL[Object.keys(YHH_TYPE).find(k => YHH_TYPE[k] === yhhType)] || '',
      pic: picUrl(has('pic') ? v.pic : pick(v, PATTERNS.pic)),
      power: {
        min: has('lowest') ? powerOf(v.lowest) : powerOf(pick(v, PATTERNS.powerMin)),
        mid: has('medium') ? powerOf(v.medium) : powerOf(pick(v, PATTERNS.powerMid)),
        max: has('highest') ? powerOf(v.highest) : powerOf(pick(v, PATTERNS.powerMax)),
        national: has('guobiao') ? powerOf(v.guobiao) : powerOf(pick(v, PATTERNS.national))
      },
      area: has('lowestname') ? String(v.lowestname) : (String(pick(v, PATTERNS.area) || '') || areaFromTier),
      updated: has('time') ? String(v.time) : String(pick(v, PATTERNS.updated) || ''),
      tiers: tiers,
      extra: yhhExtraRows(v)
    }
  };
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
  const { request, env } = context;
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

  /* ① 主通道：千寻 wzzlpro（免密钥） */
  const qx = await fetchQx(name, type);

  /* ② 备通道：主通道失败且配置了 YAOHUD_KEY 时自动切妖狐 */
  let yhh = null;
  const key = env && env.YAOHUD_KEY ? String(env.YAOHUD_KEY).trim() : '';
  if (qx.fail && key) {
    console.log('[wzzl] qx failed (', qx.fail, ') → fallback to yaohu');
    yhh = await fetchYhh(name, YHH_TYPE[type], key);
  }

  const hit = qx.via === 'qx' ? qx : (yhh && yhh.via === 'yhh' ? yhh : null);
  if (!hit) {
    /* 主备全失败：文案说明两条通道状态，用户/维护者都能定位 */
    if (!key) {
      console.warn('[wzzl] all channels failed:', qx.fail, '(no YAOHUD_KEY for fallback)');
      return err('战力服务主通道暂不可用（接口方故障），请稍后再试', 502);
    }
    console.warn('[wzzl] all channels failed: qx=', qx.fail, ' yhh=', yhh && yhh.fail);
    return err('战力查询失败：主通道与备用通道均不可用，请稍后再试', 502);
  }

  console.log('[wzzl] served by', hit.via);
  /* 只缓存成功结果；失败不缓存，任一通道恢复后立即可用 */
  edgePut(context, cacheKey, JSON.stringify(hit.result));

  return json(hit.result);
}
