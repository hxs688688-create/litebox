/* LiteBox v5 · functions/api/ocr.js — 图片文字识别（POST /api/ocr，multipart/form-data）
   Cloudflare Workers AI 视觉模型（llava-1.5-7b-hf，免费额度）；未启用 [ai] binding 时返回 503

   架构参照 Step 4C 的 transcribe.js：同款 multipart 解析 + env.AI 守卫 + 统一 json/err。 */
import { json, err } from '../_utils.js';

/* 视觉模型候选链：按顺序尝试，第一个成功的即采用。
   llava-1.5-7b 是当前Workers AI 上最稳的图像理解模型；
   uform-gen2-qwen-500m 作为备选（若 llava 因维护下线可自动切换）。 */
const MODELS = [
  '@cf/llava-hf/llava-1.5-7b-hf',
  '@cf/unum/uform-gen2-qwen-500m'
];

/* 任务要求「只返回文字内容本身」——llava 默认爱输出 "The image contains: ..." 这类前缀，
   所以 prompt 里显式禁止解释、markdown、代码块，并要求逐行还原排版。 */
const PROMPT =
  'Transcribe all text visible in this image. ' +
  'Output ONLY the text content itself, exactly as it appears. ' +
  'Do not add any explanation, description, translation or commentary. ' +
  'Do not use markdown formatting, code blocks or bullet points. ' +
  'Preserve line breaks. If there is no text in the image, output exactly: NO_TEXT';

const MAX_BYTES = 8 * 1024 * 1024;   /* 8MB 上限（spec 要求） */
const MAX_TOKENS = 1024;              /* spec 要求 */

export async function onRequest({ request, env }) {
  /* spec：只支持 POST */
  if (request.method !== 'POST') return err('只支持 POST', 405);

  /* 若未配置 AI binding */
  if (!env || !env.AI) {
    return json({
      error: { message: 'OCR 服务未配置（需要在 wrangler.toml 启用 [ai] binding）' }
    }, 503);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (_) {
    return err('请求体必须为 multipart/form-data', 400);
  }

  /* spec：字段名为 image */
  const file = formData.get('image');
  if (!file || typeof file === 'string') return err('缺少 image 字段', 400);
  if (file.size > MAX_BYTES) {
    return err('图片不能超过 ' + (MAX_BYTES / 1048576) + 'MB', 400);
  }
  if (file.type && file.type.indexOf('image/') !== 0) {
    return err('请上传图片文件（不支持 ' + file.type + '）', 400);
  }

  let bytes;
  try {
    const buf = await file.arrayBuffer();
    bytes = [...new Uint8Array(buf)];
  } catch (_) {
    return err('图片读取失败', 400);
  }

  /* 依次尝试候选模型：llava 不可用时（模型下线 / 临时故障）自动降级到下一个 */
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const result = await env.AI.run(model, {
        image: bytes,
        prompt: PROMPT,
        max_tokens: MAX_TOKENS
      });

      const text = (result && (result.description || result.response || result.text)) || '';
      if (!text) { lastErr = new Error('没有识别到文字'); continue; }

      /* 模型明确说图里没字时，按「无文字」返回，让前端给友好提示而不是空白结果 */
      const clean = text.trim();
      if (/^NO_TEXT$/i.test(clean) || clean.length < 2) {
        return json({ text: '', empty: true, model: model });
      }
      return json({ text: clean, model: model });
    } catch (e) {
      lastErr = e;
    }
  }

  /* 全部候选模型都失败 */
  const msg = lastErr && lastErr.message ? lastErr.message : 'OCR 识别失败';
  /* 余额/额度类错误给出可操作提示 */
  if (/quota|limit|billing|credit|exhaust/i.test(msg)) {
    return err('Workers AI 免费额度已用尽，请稍后再试或改用其他工具。' + msg, 429);
  }
  return err(msg, 502);
}
