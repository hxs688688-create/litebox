/* LiteBox v5 · functions/api/ip.js — IP 归属地（GET /api/ip[?q=]）
 *
 * Step 26 · 六：按用户明确要求，本接口整体改走加密钥的 IP 查询服务，
 * 不再使用 Cloudflare request.cf 的地理字段（cf.country / cf.city / cf.latitude 等）。
 * CF-Connecting-IP 头保留，只用于「本机查询」时取请求方的 IP —— 那是身份标识，不是地理信息。
 *
 * 安全（Step 26 前置策略）：
 *   · key 只从 env.XIAOAPI_KEY 读，绝不写死、不进日志、不进响应、不进错误信息；
 *   · 上游异常统一回「IP 查询服务暂时不可用」，不透出上游原文（里面可能含域名 / 计费提示）；
 *   · 未配置 key → 503「服务未配置」，不解释原因；
 *   · 响应走 _utils.json()，其 Cache-Control 是 no-store（每次查询对象可能不同）。
 *
 * 与任务书示例的一处差异（往更严方向）：
 *   示例把 detail.country 原样返回。实测该字段是 ISO 两字码（CN / US），
 *   直接显示会变成「US」而不是验收要求的「美国」，
 *   所以这里保留 Step 17 起的国家码 → 中文映射（已是中文时原样透传）。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/ip.php';

/* ISO 国家代码 → 中文 */
const COUNTRY_CN = {
  CN: '中国', US: '美国', JP: '日本', SG: '新加坡',
  HK: '中国香港', TW: '中国台湾', MO: '中国澳门', KR: '韩国',
  GB: '英国', DE: '德国', CA: '加拿大', AU: '澳大利亚',
  FR: '法国', NL: '荷兰', IN: '印度', RU: '俄罗斯',
  VN: '越南', TH: '泰国', MY: '马来西亚', ID: '印度尼西亚',
  IT: '意大利', ES: '西班牙', PH: '菲律宾', BR: '巴西',
  MX: '墨西哥', AE: '阿联酋', SA: '沙特阿拉伯', CH: '瑞士',
  SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰',
  PL: '波兰', UA: '乌克兰', TR: '土耳其', NZ: '新西兰',
  AR: '阿根廷', ZA: '南非', EG: '埃及'
};

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length > 100) return err('查询内容过长', 400);

  const key = env && env.XIAOAPI_KEY ? String(env.XIAOAPI_KEY) : '';
  if (!key) return err('服务未配置', 503);

  /* 本机查询：只从 CF-Connecting-IP 取「谁的 IP」，不取任何地理字段 */
  const targetIp = q || (request.headers.get('CF-Connecting-IP') || '');
  if (!targetIp) return err('无法识别本机出口 IP，请直接输入 IP 查询', 400);

  const upstream = API + '?key=' + encodeURIComponent(key) +
    '&ip=' + encodeURIComponent(targetIp);

  let d = null;
  try {
    d = await fetchJSON(upstream, 8000);
  } catch (_) {
    return err('IP 查询服务暂时不可用', 502);
  }
  /* 上游对「未配置 / 密钥错误 / 查无此 IP」都回 code:0 + msg，
     统一按查询失败处理，不把原文透出去 */
  if (!d || d.code !== 0 || !d.data) return err('未找到该 IP 的归属信息', 404);

  const v = d.data;
  const det = v.detail || {};
  const rawCountry = String(det.country || '');
  return json({
    ip: v.ip || targetIp || '',
    version: v.version || '',
    country: COUNTRY_CN[rawCountry.toUpperCase()] || rawCountry,
    region: det.province || '',
    city: det.city || '',
    org: det.carrier || '',
    zone: det.zone || '',
    query: q || '本机'
  });
}
