/* LiteBox v5 · functions/api/ocr.js — 图片文字识别（POST /api/ocr，JSON { file: data:image/... }）
 *
 * Step 33 · 三：修正 Step 32 的真实 bug —— 云萌阁**不解析 JSON body 里的 token**。
 *
 * 【实测证据（2026-10-08，沙箱直连上游，无有效 token）】
 *   · POST Content-Type: application/json  {token,file} → {code:504,'缺少请求token参数'}
 *     —— 504 语义按官方文档 = 「缺少请求token参数」，即服务端根本没读到 token 字段；
 *   · POST form-urlencoded  token=…          → {code:505,'请求token不存在'}
 *   · POST multipart/form-data token=…       → {code:505,'请求token不存在'}
 *     —— 505 = 读到了 token、只是值无效。504/505 的差异证明：token 必须用**表单**传，
 *        JSON 写法会把整个 body 当成未解析的载荷。所以 Step 32 即使密钥配对也永远失败。
 *
 * 【本轮改法（对齐官方文档 + 用户要求）】
 *   · 上游：POST https://api.yunmge.com/api/ocr，Content-Type 交给 FormData 自动生成 boundary；
 *     body = FormData{ token, file: 图片二进制 }（官方参数表：file「图片文件或链接，
 *     上传图片时使用 post」）；
 *   · 只做本地图片识别：前端传 data:image/... base64，这里解码成二进制上传。
 *     **不再接受图片 URL、也不再借图床转 URL**（用户明确要求），
 *     catbox / telegra.ph 两个外部依赖一并删除；
 *   · token 只从 env.YUNMGE_KEY 读，绝不写死、不进日志、不进响应；
 *   · 超时 10s；
 *   · 排查日志（任务书原文）：[ocr] YUNMGE_KEY length= / [ocr] sending POST to yunmge...；
 *     非 200 时**打印完整响应体**（token 打码），便于 CF 实时日志直接定位；
 *   · 成功：透传 data.content 全文、data.paragraphs[].word 分段。
 *
 * 错误文案（与前端一致，统一中文）：
 *   「OCR 服务未配置」→ 503（响应体 { code:500, msg }）
 *   「图片过大，请压缩后重试」→ 400
 *   「请上传本地图片」→ 400（只接受 data:image，URL 一律拒绝）
 *   「识别失败，请换一张图试试」→ 502
 */
import { json, err } from '../_utils.js';

const API = 'https://api.yunmge.com/api/ocr';

const TIMEOUT = 10000;                 /* spec：上游 10s */
const MAX_B64_CHARS = 7 * 1024 * 1024; /* 5MB 原图 base64 后约 6.9M 字符，留一点余量 */

/* 上游错误码 → 是否属于「密钥/额度」类问题（决定给用户看哪句中文）。
 * 官方状态码表：504 缺少token参数 / 505 token不存在 / 506 封禁 / 507 额度不足 /
 * 508 今日上限 / 509 IP白名单 / 510 无权访问 / 515 516 会员专属 / 519 今日上限 /
 * 520 禁用 / 521 余额不足 / 522 额度余额均不足 → 都是「配置侧」问题，不是图片问题。 */
const CONFIG_CODES = [504, 505, 506, 507, 508, 509, 510, 515, 516, 517, 519, 520, 521, 522];

/* POST 云萌阁（FormData 上传二进制）；返回 { ok, data?, code?, text? }，不抛异常。
 * 日志绝不带 token：上游若回显参数，先按 token 原文打码再截断。 */
async function queryUpstream(token, bytes, mime) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const fd = new FormData();
    fd.append('token', token);
    /* 官方参数表：file = 图片文件（post 上传）。第三参是文件名，部分网关按后缀判类型 */
    fd.append('file', new Blob([bytes], { type: mime }), 'image.' + (mime.split('/')[1] || 'jpg'));

    const r = await fetch(API, {
      method: 'POST',
      signal: ctrl.signal,
      body: fd,
      /* 不设 Content-Type：让运行时带上 multipart boundary；只补 UA */
      headers: { 'User-Agent': 'LiteBox/5.0 (+https://litebox.app)' }
    });
    const resText = await r.text();
    const masked = String(resText || '').split(token).join('***');
    console.log('[ocr] upstream status=', r.status);
    /* 任务书：非 200 打印完整响应体。200 时只留前 300 字符，避免长文本刷爆实时日志 */
    console.log(r.status === 200
      ? '[ocr] upstream raw= ' + masked.slice(0, 300)
      : '[ocr] upstream full response (HTTP ' + r.status + ')= ' + masked);

    let d = null;
    try { d = JSON.parse(resText); } catch (_) { d = null; }
    const code = d && d.code !== undefined ? Number(d.code) : NaN;

    if (r.ok && d && code === 200 && d.data) return { ok: true, data: d.data };
    return { ok: false, code: Number.isFinite(code) ? code : 0, text: masked.slice(0, 300) };
  } catch (e) {
    console.warn('[ocr] upstream fetch error:', (e && e.message) || e);
    return { ok: false, code: 0, text: 'fetch-error: ' + String((e && e.message) || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/* data URI → 字节。只接受 data:image/*，其它一律 null（URL 方案已按要求删除） */
function dataUriToBytes(dataUri) {
  const comma = dataUri.indexOf(',');
  if (comma < 0) return null;
  const head = dataUri.slice(0, comma);
  const mime = (head.match(/^data:([^;,]+)/) || [])[1] || '';
  if (!/^image\//i.test(mime)) return null;
  try {
    const bin = atob(dataUri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  } catch (_) {
    return null;
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('只支持 POST', 405);

  const token = env && env.YUNMGE_KEY ? String(env.YUNMGE_KEY) : '';
  /* 任务书：排查「变量没配 / 配错长度」的日志（只打长度，绝不打印 token 本体） */
  console.log('[ocr] YUNMGE_KEY length=', token.length);
  if (!token) return json({ code: 500, msg: 'OCR 服务未配置' }, 503);

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  const file = String((body && body.file) || '').trim();
  if (!file) return err('请先选择图片', 400);
  if (file.length > MAX_B64_CHARS) return err('图片过大，请压缩后重试', 400);
  /* 用户明确：只要本地图片识别，不要 URL。图片链接一律拒绝，不再走图床中转 */
  if (/^https?:\/\//i.test(file)) return err('请上传本地图片', 400);
  if (!/^data:image\//i.test(file)) return err('图片格式不支持', 400);

  const img = dataUriToBytes(file);
  if (!img) return err('图片解码失败，请重新选择', 400);
  /* 空文件上游必失败，先在本地挡掉 */
  if (!img.bytes.length) return err('图片内容为空，请重新选择', 400);

  console.log('[ocr] sending POST to yunmge...');
  const res = await queryUpstream(token, img.bytes, img.mime);

  if (!res.ok) {
    /* 配置类错误码（token 不存在 / 额度 / 白名单 / 会员专属…）单独报「未配置」，
       这样用户在 CF 日志和界面上都能立刻分辨「是我的 key 问题」还是「图片问题」 */
    if (CONFIG_CODES.indexOf(res.code) > -1) return err('OCR 服务未配置或额度不足', 503);
    return err('识别失败，请换一张图试试', 502);
  }

  const data = res.data;
  /* 透传上游结构：content 全文、paragraphs[].word 分段 */
  const paragraphs = Array.isArray(data.paragraphs)
    ? data.paragraphs.map(p => String((p && p.word) || '')).filter(Boolean)
    : [];
  const content = String(data.content || paragraphs.join('\n'));
  return json({ code: 200, content, paragraphs });
}
