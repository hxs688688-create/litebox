/* LiteBox v5 · functions/api/gongshang.js — 全国工商信息查询（GET /api/gongshang?name=）
 *
 * Step 26 · 三：第三方只在服务端调用，前端只见到 /api/gongshang。
 * 密钥只从 env.OVO1_KEY2 读（工商信息专用，与通用 OVO1_KEY 分开）。
 *
 * 【与任务书示例的差异（往更严方向）】
 *   上游业务错误实测统一回 HTTP 200 + {"code":505,"msg":"请求token不存在"}，
 *   按安全策略第 3 条不透出上游原文，统一归一化：
 *     · 无 key            → 503 服务未配置
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

  const token = env && env.OVO1_KEY2 ? String(env.OVO1_KEY2) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API + '?token=' + encodeURIComponent(token) +
    '&message=' + encodeURIComponent(message) +
    '&mode=json';

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (_) {
    return err('工商信息查询服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) return err('未找到该企业信息', 404);

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
