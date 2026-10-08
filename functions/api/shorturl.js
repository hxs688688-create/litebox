/* LiteBox v5 · functions/api/shorturl.js — 短网址生成（GET /api/shorturl?url=）
   Step 14：国内短链 API 多源容错。
   说明：部分国内短链服务未返回 CORS 头，浏览器直连会被拦截，
   故统一走同源 Functions 代理（服务端请求无同源限制），前端按序回退。 */
import { json, err } from '../_utils.js';

const TIMEOUT = 10000;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = (url.searchParams.get('url') || '').trim();

  if (!target) return err('缺少 url 参数', 400);
  if (!/^https?:\/\//i.test(target)) return err('url 必须以 http:// 或 https:// 开头', 400);
  if (target.length > 2000) return err('链接过长', 400);

  const short = await generate(target);
  if (!short) return err('短链接生成失败，请稍后重试', 502);

  return json({ short });
}

async function generate(target) {
  const enc = encodeURIComponent(target);

  /* 1) suol.cc（返回 JSON：{ code:200, s_url:"..." }） */
  const suol = await fetchText('https://api.suol.cc/v1/dwz_free.php?url=' + enc + '&suol_type=1');
  if (suol) {
    const v = parseJson(suol);
    const s = (v && (v.s_url || v.url)) || '';
    if (isShort(s)) return s.trim();
  }

  /* 2) xiaoqi.icofun.cn（返回 JSON：{ code:1000, data:{ url:"..." } }） */
  const xq = await fetchText('https://xiaoqi.icofun.cn/API/dwz.php?url=' + enc);
  if (xq) {
    const v = parseJson(xq);
    const s = (v && ((v.data && v.data.url) || v.url || v.short)) || '';
    if (isShort(s)) return s.trim();
  }

  /* 3) is.gd（JSON） */
  const isgd = await fetchText('https://is.gd/create.php?format=json&url=' + enc);
  if (isgd) {
    const v = parseJson(isgd);
    const s = (v && v.shorturl) || '';
    if (isShort(s)) return s.trim();
  }

  /* 4) tinyurl（纯文本） */
  const tiny = await fetchText('https://tinyurl.com/api-create.php?url=' + enc);
  if (isShort(tiny)) return tiny.trim();

  return '';
}

function isShort(s) {
  return typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LiteBox/5.0 (+https://litebox.app)' }
    });
    if (!r.ok) return '';
    return await r.text();
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}
