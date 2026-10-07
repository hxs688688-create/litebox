/* LiteBox v5 · functions/api/archive.js — 网页快照（GET /api/archive?url=）
   双源：web.archive.org availability + Arquivo.pt timemap（JSONL），结果合并 */
import { json, err, fetchJSON, fetchText } from '../_utils.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  let target = (url.searchParams.get('url') || '').trim();
  if (!target) return err('缺少 url 参数', 400);
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  /* 清理 query 和 hash（archive.org 匹配不友好） */
  try {
    const u = new URL(target);
    u.search = '';
    u.hash = '';
    target = u.href;
  } catch (_) {}

  const items = [];

  /* 源 1：web.archive.org availability */
  try {
    const d = await fetchJSON(
      'https://archive.org/wayback/available?url=' + encodeURIComponent(target),
      6000
    );
    const c = d?.archived_snapshots?.closest;
    if (c && c.timestamp && c.url) {
      items.push({
        timestamp: c.timestamp,
        url: c.url,
        source: 'web.archive.org'
      });
    }
  } catch (_) {}

  /* 源 2：Arquivo.pt timemap（返回 JSONL 格式） */
  try {
    const text = await fetchText(
      'https://arquivo.pt/wayback/timemap/json/' + encodeURIComponent(target),
      8000
    );
    const lines = text.split(/\r?\n/).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      try {
        const x = JSON.parse(line);
        if (x && x.timestamp && x.uri) parsed.push(x);
      } catch (_) {}
    }
    /* 取最后 12 条 */
    for (const x of parsed.slice(-12).reverse()) {
      items.push({
        timestamp: String(x.timestamp),
        url: 'https://arquivo.pt/wayback/' + x.timestamp + '/' + x.uri,
        source: 'arquivo.pt'
      });
    }
  } catch (_) {}

  return json({ items });
}
