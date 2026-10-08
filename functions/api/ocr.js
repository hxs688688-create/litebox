/* LiteBox v5 · functions/api/ocr.js — 图片文字识别（POST /api/ocr，JSON { file }）
 *
 * Step 32 · 三：OCR 从「浏览器本地 WASM 识别」改回云端（用户结论：之前判断有误，
 *   云萌阁支持 POST 传本地图片）。vendor/paddleocr/ 整个目录已删除，项目体积回落。
 *
 * 约定：
 *   · 只接受 POST；请求体 { file }，file = data:image/...;base64,xxx 或 http(s) 图片地址；
 *   · token 只从 env.YUNMGE_KEY 读，绝不写死、不进日志、不进响应；
 *   · 上游：POST https://api.yunmge.com/api/ocr，body 按任务书 demo（send_curl）格式
 *     { token: <YUNMGE_KEY>, file: <图片数据> }，Content-Type: application/json，超时 10s；
 *   · 日志打印云萌阁原始返回（前 300 字符，token 出现即打码），方便排查；
 *   · 返回结构透传：data.content 全文、data.paragraphs[].word 分段。
 *
 * 兜底（保留 Step 29 的实测经验）：
 *   部分网关对 Base64 直传会拒，因此主路径失败后，后端把图片临时换成图床 URL
 *   （catbox → telegra.ph）再 POST 一次。图床只在需要时走，前端永远只看到同源 /api/ocr。
 *
 * 错误文案（与前端一致，统一中文）：
 *   「OCR 服务未配置」→ 503（响应体 { code:500, msg }）
 *   「图片过大，请压缩后重试」→ 400
 *   「识别失败，请换一张图试试」→ 502
 */
import { json, err } from '../_utils.js';

const API = 'https://api.yunmge.com/api/ocr';
const CATBOX = 'https://catbox.moe/user/api.php';
const TELEGRAPH = 'https://telegra.ph/upload';

const TIMEOUT = 10000;                 /* spec：上游 10s */
const MAX_B64_CHARS = 7 * 1024 * 1024; /* 5MB 原图 base64 后约 6.9M 字符，留一点余量 */

/* POST 云萌阁；返回 { ok, data? }，不抛异常。日志绝不带 token。 */
async function queryUpstream(token, fileValue) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(API, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LiteBox/5.0 (+https://litebox.app)'
      },
      /* 任务书 demo 格式：{ token, file } */
      body: JSON.stringify({ token: token, file: fileValue })
    });
    const resText = await r.text();
    console.log('[ocr] upstream status=', r.status);
    console.log('[ocr] upstream raw=', String(resText || '').split(token).join('***').slice(0, 300));
    let d = null;
    try { d = JSON.parse(resText); } catch (_) { d = null; }
    if (!r.ok) return { ok: false };
    /* 云萌阁业务码：code === 200 为成功（与 Step 29 实测一致） */
    if (d && Number(d.code) === 200 && d.data) return { ok: true, data: d.data };
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

/* 兜底用：Base64 → 临时图床 URL（catbox → telegra.ph） */
async function hostImage(bytes, mime) {
  const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' })[mime] || 'jpg';

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

  /* 主路径：图片数据直接 POST 给云萌阁 */
  const first = await queryUpstream(token, file);
  if (first.ok) {
    data = first.data;
  } else if (isData) {
    /* 兜底：Base64 直传被拒时，临时换图床 URL 再 POST（前端不感知） */
    const img = dataUriToBytes(file);
    if (!img) return err('图片解码失败，请重新选择', 400);
    const hosted = await hostImage(img.bytes, img.mime);
    if (hosted) {
      const second = await queryUpstream(token, hosted);
      if (second.ok) data = second.data;
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
