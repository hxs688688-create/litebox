/* LiteBox v5 · functions/api/wzzl.js — 王者荣耀战力查询（GET /api/wzzl?name=&lei=）
 *
 * Step 33 · 四：修正 Step 32 战力「换了 API 就不能用」的两个真实 bug。
 *
 * 【bug 1 · 字段名全靠猜，一个没命中】
 *   官方文档（https://api.yaohud.cn/doc/42）给出的 data 结构是**确定**的：
 *     { name, platform, pic,
 *       lowest + lowestname, medium + mediumname, highest + highestname,
 *       guobiao, time }
 *   Step 32 的 PATTERNS 找的是「最低/最高/国标/max/national」这类猜测键名，
 *   lowest / medium / highest / guobiao / time 一个都不在候选表里 →
 *   四格战力全部渲染成「—」、地区空白，界面上看就是「不能用」。
 *   现在按文档精确取值，**保留**容错兜底（万一妖狐改字段，仍走模式匹配 + extra，不白屏）。
 *
 * 【bug 2 · lei 传了中文，上游只认短码】
 *   文档调试表单：参数名 lei，占位符 `qq/wx/pqq/pwx`；name 占位符「瑶/西施」。
 *   Step 32 直接把「安卓qq / 安卓wx / 苹果qq / 苹果wx」发出去，上游拿不到合法大区。
 *   现在：前端下拉发短码（qq/wx/pqq/pwx），后端再做一次归一映射，
 *   **同时兼容中文旧值** —— 避免用户手上还缓存着 5.7.0 的旧 JS 时再次全线失败。
 *
 * Step 34 · 四（线上仍失败的排查加固）：上游 api.yaohud.cn 走**阿里云 ESA 边缘**
 * （响应头 Server: ESA，带 acw_tc / cdn_sec_tc WAF cookie —— 阿里云 WAF 特征）。
 * CF Pages Function 的出站请求是「海外 IP + 非浏览器指纹 + 无 cookie」，三种特征
 * 撞在一起容易被边缘防护挑战（返回 HTML 挑战页或非 200，解析不出 JSON 就报
 * 「暂时不可用」）。另外环境变量值**首尾带空格/换行**（从后台复制 key 的常见事故）
 * 也会被上游判「密钥不正确」。本轮四项加固：
 *   1) env.YAOHUD_KEY 先 trim（空格/换行污染不再致命），日志照旧只打长度；
 *   2) 上游请求带完整浏览器特征头（Chrome UA / Referer: api.yaohud.cn / Accept JSON），
 *      大幅降低被边缘防护按「非浏览器流量」挑战的概率；
 *   3) 第一次响应若是挑战/非 JSON，自动带上响应 Set-Cookie 里的 acw_tc /
 *      cdn_sec_tc 重试一次（阿里云 WAF 的 acw_tc 是服务端下发的通行 cookie，
 *      带上即过；真正 JS 计算型的 acw_sc__v2 挑战重试也救不了，但那类挑战
 *      对这个纯 GET API 本来就少见）；
 *   4) 报错文案**按真实原因分档**，用户在界面上就能判断该做什么：
 *      · env 没有 key            → 「战力服务未配置」（503）
 *      · 上游明说密钥不正确      → 「上游密钥校验失败…检查 YAOHUD_KEY 后重新部署」（503）
 *      · 返回是 HTML 挑战页      → 「上游接口防护拦截，请稍后重试」（502）
 *      · 网络/超时               → 「战力查询服务暂时不可用」（502）
 *      · 查无英雄                → 「未找到该英雄的战力数据」（404）
 *
 * 其余契约不变：key 只从 env.YAOHUD_KEY 读、不进日志、不进响应；上游总预算 10s；
 *   缺 key → { code:500, msg:'战力服务未配置' }（HTTP 503）；
 *   日志按任务书：[wzzl] YAOHUD_KEY length= / [wzzl] name= … lei= / 上游原始返回（key 打码，截 300）。
 *
 * 【图片域名】pic 允许前端直载 game.gtimg.cn（Step 32 明示例外：图片不是 API 请求）；
 *   其它 https 域名统一转 /api/shortvideo-proxy 同源代理，非 https 丢弃。
 */
import { json, err } from '../_utils.js';

const API = 'https://api.yaohud.cn/api/v6/wzzl';
/* 上游总预算 10s（spec 不变）：首轮 6s + WAF cookie 重试 4s */

/* 前端发短码；中文旧值一并兼容（缓存里的旧 JS 仍可能发中文） */
const LEIS = ['qq', 'wx', 'pqq', 'pwx'];
const LEI_ALIAS = {
  'qq': 'qq', 'wx': 'wx', 'pqq': 'pqq', 'pwx': 'pwx',
  '安卓qq': 'qq', '安卓wx': 'wx', '苹果qq': 'pqq', '苹果wx': 'pwx',
  '安卓微信': 'wx', '苹果微信': 'pwx', '安卓QQ': 'qq', '苹果QQ': 'pqq'
};
/* 上游 platform 缺失时，用短码补一个人类可读的中文大区名（界面展示用，不编数据） */
const LEI_LABEL = { 'qq': '安卓QQ', 'wx': '安卓微信', 'pqq': '苹果QQ', 'pwx': '苹果微信' };

/* 候选键名模式（忽略大小写；先精确后模糊，命中即用）—— 仅作文档字段缺失时的兜底 */
const PATTERNS = {
  hero:      ['name', '英雄', '英雄名', '英雄名称', 'hero'],
  platform:  ['platform', '平台', '区服', '服务器', '所在区', '大区', 'lei'],
  pic:       ['pic', '图片', '头像', 'image', 'icon', 'photo'],
  powerMin:  ['lowest', '最低', '最低战力', '最低门槛', 'min'],
  powerMid:  ['medium', '中等', '中等战力', '平均', '平均战力', 'avg'],
  powerMax:  ['highest', '最高', '最高战力', 'max'],
  national:  ['guobiao', '国标', '国服', '国服战力', '国旗', 'national'],
  area:      ['lowestname', '地区', '区域', '战区', '所在地', '城市', '省份', 'area', 'region'],
  updated:   ['time', '更新时间', '更新日期', 'update', 'updatetime']
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

/* 文档里 lowest/medium/highest/guobiao 是字符串数字（示例 "3237"）；
   也兼容 {战力:n} 嵌套形态与非数字 */
function powerOf(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object') return Number(v['战力'] || v.power || v.value || 0) || 0;
  return Number(String(v).replace(/[^\d.-]/g, '')) || 0;
}

/* 每档战力对应的地区名（文档：lowestname/mediumname/highestname 是**不同的**地区，
   萝北县 / 德宏州 / 台湾省），所以这里一档一行，不合并成单一「地区」 */
function tierRows(v) {
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

/* 已被结构化字段用掉的值不再重复进 extra；密钥/统计类噪声字段一律过滤 */
function extraRows(v) {
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

/* 图片地址：gtimg 允许直载（Step 32 例外），其它 https 走同源代理，非 https 丢弃 */
function picUrl(u) {
  const s = String(u || '');
  if (!/^https?:\/\//i.test(s)) return '';
  if (/^https:\/\/game\.gtimg\.cn\//i.test(s)) return s;
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s);
}

/* Step 34 · 四：浏览器特征头。上游在阿里云 ESA 边缘后面（WAF），
 * 纯「LiteBox/x.x」UA + 无 Referer 的海外机器请求更容易被挑战；
 * 带齐 Chrome UA / Referer / Accept / Accept-Language 伪装成正常 API 调用方。 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://api.yaohud.cn/',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

/* 单次上游请求：返回 { status, text, setCookie, contentType }，超时不抛异常按空处理 */
async function fetchUpstreamOnce(url, budgetMs, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    const headers = Object.assign({}, BROWSER_HEADERS);
    if (cookie) headers['Cookie'] = cookie;
    const res = await fetch(url, { signal: ctrl.signal, headers: headers, redirect: 'follow' });
    const text = await res.text();
    return {
      status: res.status,
      text: String(text || ''),
      setCookie: res.headers.get('set-cookie') || '',
      contentType: res.headers.get('content-type') || ''
    };
  } catch (e) {
    return { status: 0, text: '', setCookie: '', contentType: '',
      error: (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/* 从 Set-Cookie 里捞出阿里云 WAF 的通行 cookie（acw_tc / cdn_sec_tc / server_session）。
 * acw_tc 是服务端下发的通行 cookie —— 第一次请求被「记录挑战」时带上它重试即可通过。 */
function wafCookieFrom(setCookie) {
  const pairs = String(setCookie || '').split(/,(?=[^;]+?=)/).map(s => s.trim());
  const keep = [];
  for (const p of pairs) {
    const kv = p.split(';')[0];
    if (/^(acw_tc|cdn_sec_tc|server_session[^=]*)=/i.test(kv)) keep.push(kv);
  }
  return keep.join('; ');
}

/* 是否「看起来像被上游边缘防护挑战」：非 JSON 的 HTML/JS 挑战页、5xx 网关页。
 * 关键特征：Content-Type 是 text/html 而 API 本该回 application/json。 */
function looksChallenged(r) {
  if (!r || r.error) return true;
  if (r.status === 0 || r.status >= 500) return true;
  if (/text\/html/i.test(r.contentType) && !/application\/json/i.test(r.contentType)) return true;
  try { JSON.parse(r.text); return false; } catch (_) { return true; }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return err('只支持 GET', 405);

  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const rawLei = (url.searchParams.get('lei') || '').trim();
  const lei = LEI_ALIAS[rawLei] || LEI_ALIAS[rawLei.toLowerCase()] || '';

  if (!name) return err('请输入英雄名称', 400);
  if (name.length > 20) return err('英雄名称过长', 400);
  if (LEIS.indexOf(lei) < 0) return err('平台选项不正确', 400);

  /* Step 34：trim —— Cloudflare 后台复制的 key 值带首尾空格/换行时，
   * 上游会判「密钥不正确」；trim 掉这类污染，日志照旧只打长度。 */
  const key = env && env.YAOHUD_KEY ? String(env.YAOHUD_KEY).trim() : '';
  /* 任务书：排查「变量没配 / 配错」的日志（只打长度，绝不打印 key 本体） */
  console.log('[wzzl] YAOHUD_KEY length=', key.length);
  /* spec：缺 key 返回 { code:500, msg:'战力服务未配置' }；HTTP 503 让前端能区分「未配置」 */
  if (!key) return json({ code: 500, msg: '战力服务未配置' }, 503);

  /* spec：排查日志（打印归一后的短码，便于对照上游文档） */
  console.log('[wzzl] name=', name, 'lei=', lei);

  const upstream = API + '?key=' + encodeURIComponent(key) +
    '&name=' + encodeURIComponent(name) +
    '&lei=' + encodeURIComponent(lei);

  /* 上游总预算仍 10s：首轮 6s，挑战重试 4s（大多数正常响应 1s 内回包） */
  let r = await fetchUpstreamOnce(upstream, 6000, '');
  if (r.error) console.warn('[wzzl] fetch error:', r.error);
  console.log('[wzzl] upstream status=', r.status, 'content-type=', r.contentType || '-');

  if (looksChallenged(r) && r.status !== 0) {
    /* 带上 WAF 下发的通行 cookie 重试一次 */
    const cookie = wafCookieFrom(r.setCookie);
    if (cookie) console.log('[wzzl] waf cookie retry, cookie keys=',
      cookie.split(';').map(s => s.split('=')[0]).join(','));
    const r2 = await fetchUpstreamOnce(upstream, 4000, cookie);
    if (!looksChallenged(r2) || (r2.status === 200 && !r2.error)) r = r2;
    console.log('[wzzl] retry status=', r2.status, 'content-type=', r2.contentType || '-');
  }

  /* 两次都是非 JSON（HTML 挑战页 / 网关错误）→ 按防护拦截报错，别再往下解析 */
  if (looksChallenged(r)) {
    if (r.status === 0) {
      console.warn('[wzzl] upstream timeout/error:', r.error);
      return err('战力查询服务暂时不可用', 502);
    }
    console.warn('[wzzl] upstream challenge page (HTTP ' + r.status + '), body head=',
      String(r.text || '').replace(key, '***').slice(0, 200));
    return err('上游接口防护拦截，请稍后重试', 502);
  }

  const text = r.text;
  console.log('[wzzl] upstream raw=', String(text || '').split(key).join('***').slice(0, 300));

  let d = null;
  try { d = JSON.parse(text); } catch (_) { d = null; }
  if (!d) return err('战力查询服务暂时不可用', 502);
  if (Number(d.code) !== 200 || !d.data) {
    /* 上游把「查无此人」和「密钥问题」都塞在 msg 里；只按含义映射，不透出原文 */
    console.warn('[wzzl] upstream returned:', d && d.code, d && d.msg);
    const msg = String((d && d.msg) || '');
    if (/密钥|key|token/i.test(msg) || Number(d.code) === 403) {
      /* Step 34：明说是「上游校验没过」，并给出修复动作 —— 用户界面直接可读 */
      return err('上游密钥校验失败：请检查 Cloudflare 环境变量 YAOHUD_KEY 的值是否完整（首尾勿带空格换行），保存后需重新部署一次', 503);
    }
    return err('未找到该英雄的战力数据', 404);
  }

  let v = d.data;
  if (Array.isArray(v)) v = v[0] || {};
  if (Array.isArray(v.data)) v = v.data[0] || {};
  if (typeof v !== 'object' || v === null) v = {};

  /* 文档字段优先精确取；取不到再走 PATTERNS 兜底 */
  const has = k => v[k] !== undefined && v[k] !== null && v[k] !== '';
  const hero = has('name') ? String(v.name) : String(pick(v, PATTERNS.hero) || name);
  const platform = has('platform') ? String(v.platform) : String(pick(v, PATTERNS.platform) || '');

  const tiers = tierRows(v);
  const areaFromTier = tiers.length ? tiers[0].v.replace(/（.*）$/, '') : '';

  return json({
    code: 200,
    hero: hero || name,
    title: String(pick(v, ['称号', '头衔', 'alias', 'title']) || ''),
    platform: platform || (LEI_LABEL[lei] || ''),
    pic: picUrl(has('pic') ? v.pic : pick(v, PATTERNS.pic)),
    power: {
      min: has('lowest') ? powerOf(v.lowest) : powerOf(pick(v, PATTERNS.powerMin)),
      mid: has('medium') ? powerOf(v.medium) : powerOf(pick(v, PATTERNS.powerMid)),
      max: has('highest') ? powerOf(v.highest) : powerOf(pick(v, PATTERNS.powerMax)),
      national: has('guobiao') ? powerOf(v.guobiao) : powerOf(pick(v, PATTERNS.national))
    },
    /* 地区 = 最低门槛所在地区（文档 lowestname）；三档地区各不相同，逐档行进 tiers */
    area: has('lowestname') ? String(v.lowestname) : (String(pick(v, PATTERNS.area) || '') || areaFromTier),
    updated: has('time') ? String(v.time) : String(pick(v, PATTERNS.updated) || ''),
    tiers: tiers,
    extra: extraRows(v)
  });
}
