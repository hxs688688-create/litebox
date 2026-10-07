/* LiteBox v5 · functions/api/ip.js — IP 归属地（GET /api/ip[?q=]）
 *
 * Step 28 修正 · 二：本机查询时优先暴露「IPv6 还是 IPv4」，并把另一条也带回来。
 *   用户设备普遍 IPv6 优先，CF-Connecting-IP 给到的是 IPv6 地址，
 *   上一版只显示这一条，用户以为「查错了」。现在：
 *     · 主结果仍是请求方真实出口 IP（q 指定时就是 q）；
 *     · 自动查询且出口是 IPv6 时，若 Cloudflare 提供了 CF-Connecting-IPv4，
 *       额外查一次 IPv4 归属，作为 ipv4Info 一并返回（查失败不影响主结果）；
 *     · 前端据此提示「这是您的 IPv6 出口地址」并给出可展开的 IPv4 归属。
 *
 * 安全（Step 26 前置策略，未变）：
 *   · key 只从 env.XIAOAPI_KEY 读，绝不写死、不进日志、不进响应、不进错误信息；
 *   · 上游异常统一回「IP 查询服务暂时不可用」，不透出上游原文；
 *   · 未配置 key → 503「服务未配置」；
 *   · 响应走 _utils.json()，Cache-Control: no-store。
 *
 * 与任务书示例保留的两处差异（往更严方向）：
 *   1) detail.country 实测是 ISO 两字码（CN / US），直接显示会变成「US」，
 *      所以继续做国家码 → 中文映射（已是中文时原样透传）；
 *   2) 示例的 IPv4 二次查询用 try/catch 吞掉即可，这里同样不让它影响主结果，
 *      但把「是否真的查到」体现在 ipv4 字段是否为空上，前端据此决定文案。
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

const isV6 = ip => String(ip).indexOf(':') > -1;

/* 上游 → 展示结构；查不到返回 null */
function pick(det, ip) {
  if (!det) return null;
  const rawCountry = String(det.country || '');
  return {
    ip: ip || '',
    country: COUNTRY_CN[rawCountry.toUpperCase()] || rawCountry,
    region: det.province || '',
    city: det.city || '',
    org: det.carrier || '',
    zone: det.zone || ''
  };
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length > 100) return err('查询内容过长', 400);

  const key = env && env.XIAOAPI_KEY ? String(env.XIAOAPI_KEY) : '';
  if (!key) return err('服务未配置', 503);

  /* 本机查询：只从 CF-Connecting-IP 取「谁的 IP」，不取任何地理字段 */
  const isAuto = !q;
  const targetIp = q || (request.headers.get('CF-Connecting-IP') || '');
  if (!targetIp) return err('无法识别本机出口 IP，请直接输入 IP 查询', 400);

  /* 出口是 IPv6 时，尽量再拿一条 IPv4（Cloudflare 免费版可能没有这个头） */
  const ipv4Header = isAuto && isV6(targetIp)
    ? (request.headers.get('CF-Connecting-IPv4') || '').trim() : '';

  const apiBase = API + '?key=' + encodeURIComponent(key) + '&ip=';

  let d = null;
  try {
    d = await fetchJSON(apiBase + encodeURIComponent(targetIp), 8000);
  } catch (_) {
    return err('IP 查询服务暂时不可用', 502);
  }
  /* 上游对「未配置 / 密钥错误 / 查无此 IP」都回 code:0 + msg，
     统一按查询失败处理，不把原文透出去 */
  if (!d || d.code !== 0 || !d.data) return err('未找到该 IP 的归属信息', 404);

  const main = pick(d.data.detail, d.data.ip || targetIp);

  /* IPv4 附带查询：失败静默，绝不影响主结果 */
  let ipv4Info = null;
  if (ipv4Header && ipv4Header !== targetIp) {
    try {
      const d4 = await fetchJSON(apiBase + encodeURIComponent(ipv4Header), 6000);
      if (d4 && d4.code === 0 && d4.data) ipv4Info = pick(d4.data.detail, ipv4Header);
    } catch (_) { /* 拿不到就只展示主结果 */ }
  }

  return json({
    ip: main.ip,
    version: d.data.version || (isV6(main.ip) ? 'IPv6' : 'IPv4'),
    isIpv6: isV6(main.ip),
    ipv4: ipv4Info ? ipv4Info.ip : '',
    ipv4Info: ipv4Info,
    country: main.country,
    region: main.region,
    city: main.city,
    org: main.org,
    zone: main.zone,
    query: q || '本机'
  });
}
