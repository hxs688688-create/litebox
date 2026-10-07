/* LiteBox v5 · functions/api/gongshang.js — 全国工商信息查询（GET /api/gongshang?name=）
 *
 * Step 29 · 二：key 缺失时不再只回抽象的「服务未配置」——
 * 响应体明确为 { code: 500, msg: '工商服务未配置' }（HTTP 仍 503），
 * 并打日志 [gongshang] keyLen= 便于在 CF Real-time logs 里确认环境变量是否生效。
 *
 * 【与任务书示例的差异（往更严方向）】
 *   上游业务错误实测统一回 HTTP 200 + {"code":505,"msg":"请求token不存在"}，
 *   按安全策略第 3 条不透出上游原文，统一归一化：
 *     · 无 key            → 503 { code:500, msg:'工商服务未配置' }
 *     · 上游异常 / 查无   → 404 未找到该企业信息（不暴露原因细节）
 *   企业名里的 <em> 高亮标签在这里就剥掉，前端不再接触。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/gongshang';

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const message = (url.searchParams.get('name') || '').trim();
  if (!message) return err('请输入企业名称', 400);
  if (message.length > 60) return err('企业名称过长', 400);

  /* Step 29 · 二：只记长度，绝不记 token 本身 */
  console.log('[gongshang] keyLen=', ((env && env.OVO1_KEY) || '').length);
  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) {
    return json({ code: 500, msg: '工商服务未配置' }, 503);
  }

  const upstream = API + '?token=' + encodeURIComponent(token) +
    '&message=' + encodeURIComponent(message) +
    '&mode=json';

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (e) {
    console.warn('[gongshang] fetch error:', e && e.message);
    return err('工商信息查询服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) {
    console.warn('[gongshang] upstream:', d && d.code, d && d.msg);
    return err('未找到该企业信息', 404);
  }

  const v = d.data;
  const clean = s => String(s == null ? '' : s).replace(/<\/?em>/gi, '').trim();
  return json({
    name: clean(v.name),
    matchType: clean(v.matchType),
    historyName: clean(v.historyNames),
    legalPerson: clean(v.legalPersonName),
    regCapital: clean(v.regCapital),
    establishTime: clean(v.estiblishTime).split(' ')[0] || '',
    regStatus: clean(v.regStatus),
    companyType: clean(v.companyOrgType),
    creditCode: clean(v.creditCode),
    regNumber: clean(v.regNumber),
    phone: clean(v.phoneNum),
    email: clean(v.email),
    address: clean(v.address || (v.raw && v.raw.regLocation)),
    businessScope: clean(v.businessScope),
    base: clean(v.raw && v.raw.base),
    industry: clean(v.raw && v.raw.industry),
    abstract: clean(v.raw && v.raw.abstractsBaseInfo)
  });
}
