/* LiteBox v5 · functions/api/ip.js — IP 归属地（GET /api/ip[?q=]）
   Step 17 重构：本机查询直接用 Cloudflare Pages Functions 的 request.cf
   （边缘节点自带地理信息，零第三方调用、零额外延迟）；
   指定 IP / 域名查询走第三方兜底（ipwho.is，支持域名解析）。 */
import { json, err, fetchJSON } from '../_utils.js';

/* ISO 国家代码 → 中文（本机 request.cf 与 ipwho.is 的 country_code 通用） */
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

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  /* 本机查询：直接用 Cloudflare 原生数据（request.cf），无需任何第三方 API */
  if (!q) {
    const cf = request.cf || {};
    const ip = request.headers.get('CF-Connecting-IP') || '';

    return json({
      ip,
      country: COUNTRY_CN[cf.country] || cf.country || '未知',
      region: cf.region || '',
      city: cf.city || '',
      timezone: cf.timezone || '',
      latitude: cf.latitude || '',
      longitude: cf.longitude || '',
      asn: cf.asn ? 'AS' + cf.asn : '',
      org: '',
      query: '本机'
    });
  }

  /* 指定 IP / 域名：走第三方兜底（ipwho.is，支持域名与 IPv6） */
  try {
    const d = await fetchJSON('https://ipwho.is/' + encodeURIComponent(q), 6000);
    if (d && d.success !== false && d.ip) {
      return json({
        ip: d.ip,
        country: COUNTRY_CN[d.country_code] || d.country || '',
        region: d.region || '',
        city: d.city || '',
        timezone: (d.timezone && d.timezone.id) || '',
        latitude: (d.latitude != null ? String(d.latitude) : '') || '',
        longitude: (d.longitude != null ? String(d.longitude) : '') || '',
        asn: d.connection && d.connection.asn ? 'AS' + d.connection.asn : '',
        org: (d.connection && (d.connection.org || d.connection.isp)) || '',
        query: q
      });
    }
  } catch (_) {}

  return err('暂时无法获取该 IP 的归属信息', 502);
}
