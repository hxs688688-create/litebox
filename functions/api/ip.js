/* LiteBox v5 · functions/api/ip.js — IP 归属地（GET /api/ip[?q=]）
   双源容错：ipwho.is（IPv6 友好）→ ip-api.com（中文返回好） */
import { json, err, fetchJSON } from '../_utils.js';

const COUNTRY_CN = {
  'United States': '美国', 'China': '中国', 'Japan': '日本',
  'Singapore': '新加坡', 'Hong Kong': '中国香港', 'Taiwan': '中国台湾',
  'South Korea': '韩国', 'United Kingdom': '英国', 'Germany': '德国',
  'Canada': '加拿大', 'Australia': '澳大利亚', 'France': '法国',
  'Netherlands': '荷兰', 'India': '印度', 'Russia': '俄罗斯',
  'Vietnam': '越南', 'Thailand': '泰国', 'Malaysia': '马来西亚',
  'Indonesia': '印度尼西亚', 'Italy': '意大利', 'Spain': '西班牙'
};

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  /* 若未指定 q，取请求方 IP（Cloudflare 自动注入 CF-Connecting-IP 头） */
  const targetIP = q || request.headers.get('CF-Connecting-IP') || '';

  try {
    let data;
    /* 尝试 1：ipwho.is */
    try {
      const d = await fetchJSON('https://ipwho.is/' + encodeURIComponent(targetIP), 6000);
      if (d && d.success !== false && d.ip) {
        data = {
          ip: d.ip,
          country: COUNTRY_CN[d.country] || d.country || '',
          region: d.region || '',
          city: d.city || '',
          org: d.connection?.org || d.connection?.isp || '',
          asn: d.connection?.asn ? 'AS' + d.connection.asn : '',
          timezone: d.timezone?.id || '',
          query: q || '本机',
          source: 'IPWHO'
        };
      }
    } catch (_) {}

    /* 尝试 2：ip-api.com（仅 http，Cloudflare Workers 支持） */
    if (!data) {
      try {
        const d = await fetchJSON('http://ip-api.com/json/' + encodeURIComponent(targetIP) + '?lang=zh-CN', 6000);
        if (d && d.status === 'success') {
          data = {
            ip: d.query,
            country: d.country || '',
            region: d.regionName || '',
            city: d.city || '',
            org: d.org || d.isp || '',
            asn: d.as || '',
            timezone: d.timezone || '',
            query: q || '本机',
            source: 'IPAPI'
          };
        }
      } catch (_) {}
    }

    if (!data) return err('暂时无法获取该 IP 的归属信息', 502);
    return json(data);
  } catch (e) {
    return err(e.message || 'IP 查询失败', 502);
  }
}
