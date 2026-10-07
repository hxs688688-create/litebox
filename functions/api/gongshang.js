/* LiteBox v5 · functions/api/gongshang.js — 全国工商信息查询（GET /api/gongshang?name=）
 *
 * Step 28 修正 · 四：改用通用 OVO1_KEY —— 用户确认 ovo1 侧只有一个 token，
 * 上一版读的是并不存在的 env.OVO1_KEY2，所以线上一直回「服务未配置」。
 * 环境变量最终清单：XIAOAPI_KEY / OVO1_KEY / XUNJINLU_KEY（不再有 OVO1_KEY2）。
 * 按任务书加了 console.warn 日志（只记 code / msg，绝不记 token）。
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

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) return err('服务未配置', 503);

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
