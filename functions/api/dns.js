/* LiteBox v5 · functions/api/dns.js — DNS 查询（GET /api/dns?name=&type=）
   DoH 双源：阿里 → Google，JSON 响应直接透传 */
import { json, err, fetchJSON } from '../_utils.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const type = (url.searchParams.get('type') || 'A').trim().toUpperCase();
  if (!name) return err('缺少 name 参数', 400);

  /* 域名清理 */
  const cleanName = name.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

  /* DoH 源列表：阿里 → Google */
  const sources = [
    'https://dns.alidns.com/resolve?name=' + encodeURIComponent(cleanName) + '&type=' + encodeURIComponent(type),
    'https://dns.google/resolve?name=' + encodeURIComponent(cleanName) + '&type=' + encodeURIComponent(type)
  ];

  let lastErr = null;
  for (const src of sources) {
    try {
      const d = await fetchJSON(src, 6000);
      return json(d);
    } catch (e) {
      lastErr = e;
    }
  }
  return err(lastErr?.message || 'DNS 查询失败', 502);
}
