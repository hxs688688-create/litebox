/* LiteBox v5 · functions/api/wzzl.js — 王者荣耀战力查询（GET /api/wzzl?name=&lei=）
 *
 * Step 32 · 四：战力接口从 ovo1.cc（wzrank）换成妖狐 API
 *   GET https://api.yaohud.cn/api/v6/wzzl?key=xxx&name=yyy&lei=zzz
 *   · key  只从 env.YAOHUD_KEY 读，绝不写死、不进日志、不进响应；
 *   · lei  白名单：安卓qq / 安卓wx / 苹果qq / 苹果wx（前端下拉四选一，必有值）；
 *   · 上游超时 10s；
 *   · 日志：console.log('[wzzl] name=', name, 'lei=', lei) + 上游原始返回（key 打码，截 300）。
 *
 * 缺密钥时按任务书返回 { code: 500, msg: '战力服务未配置' }（HTTP 503）。
 *
 * 【容错解析】上游 data 的字段名未公开（沙箱里无 key 只能验到 403 形态），
 *   所以这里不猜死字段：按「候选键名模式」从 data 里挑值（英雄名 / 平台 / 战力
 *   最低·中等·最高·国标 / 地区 / 更新时间 / pic），挑不到的原样进 extra 列表，
 *   前端把 extra 当补充行渲染——schema 变了也只是少几行，不会白屏。
 *
 * 【图片域名】pic 允许前端直载 game.gtimg.cn（Step 32 明示例外：图片不是 API 请求）；
 *   其它 https 域名统一转 /api/shortvideo-proxy 同源代理，非 https 丢弃。
 */
import { json, err, fetchText } from '../_utils.js';

const API = 'https://api.yaohud.cn/api/v6/wzzl';
const TIMEOUT = 10000;                    /* spec：上游 10s */
const LEIS = ['安卓qq', '安卓wx', '苹果qq', '苹果wx'];

/* 候选键名模式（忽略大小写；先精确后模糊，命中即用） */
const PATTERNS = {
  hero:      ['英雄', '英雄名', '英雄名称', 'name', 'hero'],
  title:     ['称号', '头衔', 'alias', 'title'],
  platform:  ['平台', '区服', '服务器', '所在区', '大区', 'platform', 'lei'],
  pic:       ['pic', '图片', '头像', 'image', 'icon', 'photo'],
  powerMin:  ['最低', '最低战力', '最低门槛', 'min'],
  powerMid:  ['中等', '中等战力', '平均', '平均战力', 'avg'],
  powerMax:  ['最高', '最高战力', 'max'],
  national:  ['国标', '国服', '国服战力', '国旗', 'national'],
  area:      ['地区', '区域', '战区', '所在地', '城市', '省份', 'area', 'region'],
  updated:   ['更新时间', '更新日期', '时间', 'update', 'updatetime', 'time']
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

/* 战力值可能是 {战力: n, 省份/城市: s} 这种嵌套对象：取数字，名字留给地区兜底 */
function powerOf(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object') return Number(v['战力'] || v.power || v.value || 0) || 0;
  return Number(v) || 0;
}

/* 只把标量（字符串/数字）透出来当补充行，避免整棵对象 JSON 糊到界面上 */
function extraRows(v) {
  const used = new Set();
  Object.keys(PATTERNS).forEach(group => {
    const hit = pick(v, PATTERNS[group]);
    if (hit !== '') used.add(hit);
  });
  const rows = [];
  for (const k of Object.keys(v)) {
    const val = v[k];
    if (val === null || val === undefined || val === '') continue;
    if (typeof val === 'object') continue;
    if (used.has(val)) continue;
    if (/key|token|ip|clientIP|exec_time|tips|来源|remark/i.test(k)) continue;
    rows.push({ k: String(k), v: String(val).slice(0, 60) });
    if (rows.length >= 8) break;
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

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return err('只支持 GET', 405);

  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const lei = (url.searchParams.get('lei') || '').trim();

  if (!name) return err('请输入英雄名称', 400);
  if (name.length > 20) return err('英雄名称过长', 400);
  if (LEIS.indexOf(lei) < 0) return err('平台选项不正确', 400);

  const key = env && env.YAOHUD_KEY ? String(env.YAOHUD_KEY) : '';
  /* spec：缺 key 返回 { code:500, msg:'战力服务未配置' }；HTTP 503 让前端能区分「未配置」 */
  if (!key) return json({ code: 500, msg: '战力服务未配置' }, 503);

  /* spec：排查日志 */
  console.log('[wzzl] name=', name, 'lei=', lei);

  const upstream = API + '?key=' + encodeURIComponent(key) +
    '&name=' + encodeURIComponent(name) +
    '&lei=' + encodeURIComponent(lei);

  let text = '';
  try {
    text = await fetchText(upstream, TIMEOUT);
  } catch (e) {
    console.warn('[wzzl] fetch error:', (e && e.message) || e);
    return err('战力查询服务暂时不可用', 502);
  }
  console.log('[wzzl] upstream raw=', String(text || '').split(key).join('***').slice(0, 300));

  let d = null;
  try { d = JSON.parse(text); } catch (_) { d = null; }
  if (!d) return err('战力查询服务暂时不可用', 502);
  if (Number(d.code) !== 200 || !d.data) {
    /* 上游把「查无此人」和「密钥问题」都塞在 msg 里；只按含义映射，不透出原文 */
    console.warn('[wzzl] upstream returned:', d && d.code, d && d.msg);
    const msg = String((d && d.msg) || '');
    if (/密钥|key|token/i.test(msg) || Number(d.code) === 403) return err('战力服务未配置', 503);
    return err('未找到该英雄的战力数据', 404);
  }

  let v = d.data;
  if (Array.isArray(v)) v = v[0] || {};
  if (Array.isArray(v.data)) v = v.data[0] || {};
  if (typeof v !== 'object' || v === null) v = {};

  return json({
    code: 200,
    hero: String(pick(v, PATTERNS.hero) || name),
    title: String(pick(v, PATTERNS.title) || ''),
    platform: String(pick(v, PATTERNS.platform) || ''),
    pic: picUrl(pick(v, PATTERNS.pic)),
    power: {
      min: powerOf(pick(v, PATTERNS.powerMin)),
      mid: powerOf(pick(v, PATTERNS.powerMid)),
      max: powerOf(pick(v, PATTERNS.powerMax)),
      national: powerOf(pick(v, PATTERNS.national))
    },
    area: String(pick(v, PATTERNS.area) || ''),
    updated: String(pick(v, PATTERNS.updated) || ''),
    extra: extraRows(v)
  });
}
