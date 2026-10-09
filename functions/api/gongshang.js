/* LiteBox v5 · functions/api/gongshang.js — 全国工商信息查询（GET /api/gongshang?name=[&select=]）
 *
 * Step 29 · 二：key 缺失时不再只回抽象的「服务未配置」——
 * 响应体明确为 { code: 500, msg: '工商服务未配置' }（HTTP 仍 503），
 * 并打日志 [gongshang] keyLen= 便于在 CF Real-time logs 里确认环境变量是否生效。
 *
 * Step 31 · 一：支持上游 code:300 的多结果流程。
 *   用户反馈：搜「康龙化成」这类关键词，上游后台日志显示请求成功、返回 5 条匹配，
 *   但旧版只认 code===200，把 300 当失败（404 未找到该企业信息），前端就"查不了"。
 *   现在：
 *     · code 200 和 code 300 都算成功，其余（201 / 5xx 业务码）按查无处理；
 *     · 300 → 归一化成 { code:300, count, list:[{select,name,legalPerson,establishTime,regStatus}] }
 *       前端据此弹选择层，点某条后带 ?select=<该条 select> 再查一次；
 *     · 带 select 的请求原样透传给上游（上游文档：「当输入公司名称与法人手机号返回出
 *       多条工商信息时需使用 select 选择」，select 为 int，默认 0）；
 *     · 加了 select 上游仍回 300 时，直接用列表里对应那一条本地组装详情，
 *       不让用户卡死在选择层（array 元素本身就带 name/legalPersonName/… 主要字段）。
 *   日志按任务书原文：console.log('[gongshang] code=', data.code, 'count=', data.count)
 *
 * 【与任务书示例的差异（往更严方向）】
 *   上游业务错误实测统一回 HTTP 200 + {"code":505,"msg":"请求token不存在"}，
 *   按安全策略第 3 条不透出上游原文，统一归一化：
 *     · 无 key            → 503 { code:500, msg:'工商服务未配置' }
 *     · 上游异常 / 查无   → 404 未找到该企业信息（不暴露原因细节）
 *   企业名里的 <em> 高亮标签在这里就剥掉，前端不再接触。
 *   成功响应体额外带一个 code 字段（200/300），旧字段位置不变，前端照旧 d.name 取值。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/gongshang';

/* 上游一条企业记录 → 前端展示用的扁平结构（对象形态与数组元素形态都走这里） */
function flat(v) {
  const clean = s => String(s == null ? '' : s).replace(/<\/?em>/gi, '').trim();
  const raw = (v && v.raw) || {};
  return {
    name: clean(v && v.name),
    matchType: clean(v && v.matchType),
    historyName: clean(v && v.historyNames),
    legalPerson: clean(v && v.legalPersonName),
    regCapital: clean(v && v.regCapital),
    establishTime: (clean(v && v.estiblishTime).split(' ')[0] || ''),
    regStatus: clean(v && v.regStatus),
    companyType: clean(v && v.companyOrgType),
    creditCode: clean(v && (v.creditCode || v.xydm)),
    regNumber: clean(v && v.regNumber),
    phone: clean(v && (v.phoneNum || v.phone)),
    email: clean(v && (v.email || v.emails)),
    address: clean((v && v.address) || raw.regLocation),
    businessScope: clean(v && v.businessScope),
    base: clean(raw.base),
    industry: clean(raw.industry),
    abstract: clean(raw.abstractsBaseInfo)
  };
}

/* 多结果列表：只保留选择层要展示的四项 + 二次查询用的 select 值。
 * select 取上游给的 index（若有），否则用 1 起始的序号 —— 与任务书
 * 「点击某条后带 select=对应index（例如 select=1）」的例子一致。 */
function choices(arr) {
  return arr.slice(0, 10).map((v, i) => {
    const f = flat(v || {});
    const idx = Number(v && v.index);
    return {
      select: Number.isFinite(idx) && idx > 0 ? idx : (i + 1),
      name: f.name,
      legalPerson: f.legalPerson,
      establishTime: f.establishTime,
      regStatus: f.regStatus
    };
  });
}

/* 上游返回数组时取前 N 条；个别实例会把多条包成 { list: [...] } */
function asArray(d) {
  if (Array.isArray(d && d.data)) return d.data;
  if (d && d.data && Array.isArray(d.data.list)) return d.data.list;
  return null;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const message = (url.searchParams.get('name') || '').trim();
  if (!message) return err('请输入企业名称', 400);
  if (message.length > 60) return err('企业名称过长', 400);

  /* Step 31 · 一：select 为可选整数（1..N），非法值一律当作未选择 */
  const rawSelect = (url.searchParams.get('select') || '').trim();
  let selected = 0;
  if (rawSelect) {
    const n = Number(rawSelect);
    if (!Number.isInteger(n) || n < 1 || n > 999) return err('请选择有效的结果', 400);
    selected = n;
  }

  /* Step 29 · 二：只记长度，绝不记 token 本身 */
  console.log('[gongshang] keyLen=', ((env && env.OVO1_KEY) || '').length);
  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) {
    return json({ code: 500, msg: '工商服务未配置' }, 503);
  }

  const upstream = API + '?token=' + encodeURIComponent(token) +
    '&message=' + encodeURIComponent(message) +
    '&mode=json' +
    (selected ? '&select=' + selected : '');

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (e) {
    console.warn('[gongshang] fetch error:', e && e.message);
    return err('工商信息查询服务暂时不可用', 502);
  }

  /* 任务书原文日志：code / count 都按上游给的值打印 */
  const count = Number((d && d.count) || (d && d.data && d.data.total_count)) ||
    (asArray(d) ? asArray(d).length : 0);
  console.log('[gongshang] code=', d && d.code, 'count=', count);

  if (!d || (d.code !== 200 && d.code !== 300) || !d.data) {
    console.warn('[gongshang] upstream:', d && d.code, d && d.msg);
    return err('未找到该企业信息', 404);
  }

  const list = asArray(d);

  /* 单结果（上游直接给对象）—— 常见于精确匹配，也见于 code:300 但只命中一条 */
  if (!list) return json(Object.assign({ code: 200 }, flat(d.data)));

  /* 多结果：已经带了 select → 用选中那条组装详情，不再弹选择层（防死循环） */
  if (selected) {
    const pick = list[selected - 1] || list[0];
    console.log('[gongshang] select=', selected, 'of', list.length);
    return json(Object.assign({ code: 200 }, flat(pick || {})));
  }

  const items = choices(list);
  if (!items.length) return err('未找到该企业信息', 404);
  if (items.length === 1) return json(Object.assign({ code: 200 }, flat(list[0])));
  return json({ code: 300, count: items.length, list: items });
}
