/* LiteBox v5 · functions/api/ocr.js — 图片文字识别（POST /api/ocr，JSON { file }）
 *
 * Step 29 · 三：换成云萌阁 OCR，替换旧的 Workers AI 方案。
 *   · 鉴权：token 只从 env.YUNMGE_KEY 读，绝不写死、不进日志、不进响应；
 *   · 上游：GET https://api.yunmge.com/api/ocr?token=xxx&file=yyy，超时 10s；
 *   · 云萌阁只吃图片 URL，不吃 Base64，所以 Base64 走两步：
 *       方案 A —— 先直接把 data:image/...;base64,xxx 当 file 传上去（部分网关兼容）；
 *       方案 B —— A 失败时，后端先把图片上传到免费图床换成真实 URL，再拿 URL 请求云萌阁。
 *             图床候选：catbox.moe → telegra.ph，任一成功即采用。
 *   · URL 输入（http/https）跳过 A/B，直接查。
 *   · 响应结构透传上游：content 全文、paragraphs[].word 分段，code === 200 判成功。
 *
 * 错误文案与前端约定一致（三选一）：
 *   「Token 未配置，请联系管理员」→ 本文件回 { code:500, msg:'OCR 服务未配置' }，前端映射；
 *   「图片过大，请压缩后重试」→ 400；
 *   「识别失败，请换一张图试试」→ 502。
 */
import { json, err } from '../_utils.js';

const API = 'https://api.yunmge.com/api/ocr';
const CATBOX = 'https://catbox.moe/user/api.php';
const TELEGRAPH = 'https://telegra.ph/upload';

const TIMEOUT = 10000;                 /* spec：上游 10s */
const MAX_B64_CHARS = 7 * 1024 * 1024; /* 5MB 原图 base64 后约 6.9M 字符，留一点余量 */

/* GET 云萌阁；返回 { ok, data?, status? }，不抛异常 */
async function queryUpstream(token, fileValue) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const url = API + '?token=' + encodeURIComponent(token) +
      '&file=' + encodeURIComponent(fileValue);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LiteBox/5.0' } });
    const resText = await r.text();
    /* spec：打印云萌阁原始返回。日志绝不带 token —— 上游若回显参数也先剥掉 */
    console.log('[ocr] upstream=', String(resText || '').split(token).join('***').slice(0, 300));
    let d = null;
    try { d = JSON.parse(resText); } catch (_) { d = null; }
    if (d && d.code === 200 && d.data) return { ok: true, data: d.data };
    return { ok: false };
  } catch (_) {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/* data URI → 字节 */
function dataUriToBytes(dataUri) {
  const comma = dataUri.indexOf(',');
  if (comma < 0) return null;
  const head = dataUri.slice(0, comma);
  const mime = (head.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
  try {
    const bin = atob(dataUri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  } catch (_) {
    return null;
  }
}

/* 免费图床换真实 URL：catbox → telegra.ph，任一成功即返回 */
async function hostImage(bytes, mime) {
  const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' })[mime] || 'jpg';

  /* 候选 1：catbox（POST reqtype=fileupload + fileToUpload，成功时响应体就是 URL） */
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const fd = new FormData();
      fd.append('reqtype', 'fileupload');
      fd.append('fileToUpload', new File([bytes], 'lb.' + ext, { type: mime }));
      const r = await fetch(CATBOX, { method: 'POST', body: fd, signal: ctrl.signal });
      const t = (await r.text()).trim();
      if (r.ok && /^https?:\/\/\S+$/i.test(t)) return t;
    } finally { clearTimeout(timer); }
  } catch (_) { /* 换下一个候选 */ }

  /* 候选 2：telegra.ph（POST file 字段，成功时 [{ src: '/upload/xxx' }]） */
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const fd = new FormData();
      fd.append('file', new File([bytes], 'lb.' + ext, { type: mime }));
      const r = await fetch(TELEGRAPH, { method: 'POST', body: fd, signal: ctrl.signal });
      let arr = null;
      try { arr = await r.json(); } catch (_) { arr = null; }
      const src = Array.isArray(arr) && arr[0] && arr[0].src;
      if (src && /^\/upload\//.test(src)) return 'https://telegra.ph' + src;
    } finally { clearTimeout(timer); }
  } catch (_) { /* 两个图床都失败 */ }

  return '';
}

export async function onRequest({ request, env }) {
  /* spec：只允许 POST */
  if (request.method !== 'POST') return err('只支持 POST', 405);

  const token = env && env.YUNMGE_KEY ? String(env.YUNMGE_KEY) : '';
  if (!token) return json({ code: 500, msg: 'OCR 服务未配置' }, 503);

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  const file = String((body && body.file) || '').trim();
  if (!file) return err('请先选择图片', 400);
  if (file.length > MAX_B64_CHARS) return err('图片过大，请压缩后重试', 400);

  const isUrl = /^https?:\/\//i.test(file);
  const isData = /^data:image\//i.test(file);
  if (!isUrl && !isData) return err('图片格式不支持', 400);

  let data = null;

  if (isUrl) {
    const r1 = await queryUpstream(token, file);
    if (r1.ok) data = r1.data;
  } else {
    /* 方案 A：Base64 直接当 file 传（云萌阁多数网关其实不吃，失败就走 B） */
    const rA = await queryUpstream(token, file);
    if (rA.ok) {
      data = rA.data;
    } else {
      /* 方案 B：先换图床 URL 再查 */
      const img = dataUriToBytes(file);
      if (!img) return err('图片解码失败，请重新选择', 400);
      const hosted = await hostImage(img.bytes, img.mime);
      if (!hosted) return err('识别失败，请换一张图试试', 502);
      const rB = await queryUpstream(token, hosted);
      if (rB.ok) data = rB.data;
    }
  }

  if (!data) return err('识别失败，请换一张图试试', 502);

  /* 透传上游结构：content 全文、paragraphs[].word 分段 */
  const paragraphs = Array.isArray(data.paragraphs)
    ? data.paragraphs.map(p => String((p && p.word) || '')).filter(Boolean)
    : [];
  const content = String(data.content || paragraphs.join('\n'));
  return json({ code: 200, content, paragraphs });
}
