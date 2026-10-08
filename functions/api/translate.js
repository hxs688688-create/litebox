/* LiteBox v5 · functions/api/translate.js — 文本翻译（POST /api/translate）
 *
 * Step 28 · 二：数据源从 MyMemory 换成 xiaoapi.cn（密钥走 env.XIAOAPI_KEY，
 * 与 IP 查询同一把）。前端只见到 /api/translate，不再直连任何第三方。
 *
 * 【上游契约要点】
 *   1) 成功时 code === 0（不是 200），译文字段是 data.dst —— 与常见接口相反，容易踩坑。
 *   2) 实测密钥错误也回 HTTP 200 + {"code":0,"msg":"密钥错误","errcode":11002}，
 *      也就是说 code 单独不足以判定成功，必须同时要求 data.dst 存在。
 *   3) 参数名是 text（不是 q）。
 *
 * 【与任务书示例的一处差异（往更严的方向）】
 *   示例里 return err(d?.message || '翻译失败', 502) 会透出上游原文，
 *   按 Step 26 起持续生效的「错误信息归一化」改成固定中文文案。 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/translate.php';
const MAX_LEN = 5000;

/* 上游支持的 15 个语言代码（auto 仅用于源语言） */
const LANGS = ['auto', 'zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'th', 'vi', 'ar', 'id'];

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('只支持 POST', 405);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('请求体格式不正确', 400);
  }
  if (!body || typeof body !== 'object') return err('请求体格式不正确', 400);

  const text = String(body.q || '').trim();
  const from = String(body.from || 'auto');
  const to = String(body.to || 'zh');

  if (!text) return err('请输入要翻译的文本', 400);
  if (text.length > MAX_LEN) return err('单次最多 5000 字符', 400);
  if (from === to && from !== 'auto') return err('源语言与目标语言相同', 400);
  /* 语言代码白名单：from / to 会拼进上游 URL，不允许任意值 */
  if (LANGS.indexOf(from) < 0) return err('源语言不支持', 400);
  if (LANGS.indexOf(to) < 0 || to === 'auto') return err('目标语言不支持', 400);

  const token = env && env.XIAOAPI_KEY ? String(env.XIAOAPI_KEY) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API
    + '?key=' + encodeURIComponent(token)
    + '&text=' + encodeURIComponent(text)
    + '&from=' + encodeURIComponent(from)
    + '&to=' + encodeURIComponent(to)
    + '&type=auto';

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (_) {
    return err('翻译服务暂时不可用', 502);
  }
  const v = d && d.code === 0 ? d.data : null;
  if (!v || !v.dst) {
    /* 实测「密钥错误」也回 code:0，只靠 code 判定会把失败当成功 */
    return err('翻译失败，请稍后重试', 502);
  }
  return json({
    text: String(v.dst),
    src: v.src ? String(v.src) : text,
    from: v.from || from,
    to: v.to || to
  });
}
