/* LiteBox v5 · functions/api/translate.js — 文本翻译（POST /api/translate）
   MyMemory 免费接口（每日配额约 5000 字/天），失败时返回友好错误 */
import { json, err, fetchJSON } from '../_utils.js';

export async function onRequest({ request }) {
  if (request.method !== 'POST') return err('只支持 POST', 405);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('请求体格式不正确', 400);
  }

  const q = String(body.q || '').trim();
  const from = String(body.from || 'zh-CN');
  const to = String(body.to || 'en');

  if (!q) return err('缺少 q 参数', 400);
  if (q.length > 500) return err('单次最多 500 字符', 400);
  if (from === to) return err('源语言与目标语言不能相同', 400);

  try {
    const d = await fetchJSON(
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(q) + '&langpair=' + from + '|' + to,
      10000
    );
    if (d.responseStatus !== 200 || !d.responseData) {
      return err(d.responseDetails || '翻译接口未返回译文', 502);
    }
    return json({
      text: d.responseData.translatedText,
      from,
      to
    });
  } catch (e) {
    return err(e.message || '翻译服务暂时不可用', 502);
  }
}
