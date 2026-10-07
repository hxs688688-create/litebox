/* LiteBox v5 · functions/api/ocr.js — 图片文字识别（POST /api/ocr，multipart/form-data）
   Cloudflare Workers AI 视觉模型；未启用 [ai] binding 时返回 503
 *
 * Step 12 · B3：换模型
 *   原主模型 llava-1.5-7b-hf 的 OCR 效果差（爱输出 "The image contains: ..." 这类描述，
 *   中文长文更是频繁漏字）。改为：
 *     1) @cf/unum/uform-gen2-qwen-500m —— 专做图生文的 Qwen 小模型，OCR 场景更准、更快
 *     2) @cf/meta/llama-3.2-11b-vision-instruct —— 备用（uform 维护下线 / 临时故障时自动降级）
 *
 * 【语言参数】
 *   前端会带 lang=zh|en|mix（识别语言下拉）。prompt 随语言变：
 *   指定「只提中文」时模型不会把图中英文也塞进来，反之亦然；
 *   mix 则中英都提。不传时按 mix 处理，与旧行为兼容。
 *
 * 【为什么 prompt 里反复强调「不要解释 / 不要 markdown / 不要代码块」】
 *   这类图生文模型默认输出是「描述这张图」，而且习惯用 markdown 包装答案。
 *   任务要的是**纯文字**，故显式禁止，并要求逐行还原排版。
 */
import { json, err } from '../_utils.js';

/* 视觉模型候选链：按顺序尝试，第一个成功的即采用。
   uform-gen2 放第一位（OCR 效果明显更好）；llama-3.2-11b-vision 兜底。 */
const MODELS = [
  '@cf/unum/uform-gen2-qwen-500m',
  '@cf/meta/llama-3.2-11b-vision-instruct'
];

/* 任务要求「只返回文字内容本身」——模型默认爱输出解释性前缀，
   所以 prompt 里显式禁止解释、markdown、代码块，并要求逐行还原排版。 */
const PROMPTS = {
  zh: '只提取图片中的所有中文文字，不要任何解释、不要 markdown、不要代码块。按原顺序逐行输出。' +
      '如果图片里没有文字，只输出 NO_TEXT。',
  en: 'Extract ONLY the text visible in this image. Output the text itself, nothing else. ' +
      'Do not add any explanation, description, translation or commentary. ' +
      'Do not use markdown, code blocks or bullet points. Preserve line breaks. ' +
      'If there is no text, output exactly: NO_TEXT',
  mix: '只提取图片中的所有文字（中文和英文都要），不要任何解释、不要 markdown、不要代码块。' +
       '按原顺序逐行输出。如果图片里没有文字，只输出 NO_TEXT。'
};

const MAX_BYTES = 8 * 1024 * 1024;   /* 8MB 上限（前端已先压到 1600px，正常远低于此） */
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

  /* 识别语言：zh / en / mix（缺省 mix） */
  const langRaw = String(formData.get('lang') || 'mix');
  const lang = PROMPTS[langRaw] ? langRaw : 'mix';
  const PROMPT = PROMPTS[lang];

  let bytes;
  try {
    const buf = await file.arrayBuffer();
    bytes = [...new Uint8Array(buf)];
  } catch (_) {
    return err('图片读取失败', 400);
  }

  /* 依次尝试候选模型：uform-gen2 不可用时自动降级到 llama-3.2-vision */
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const result = await env.AI.run(model, {
        image: bytes,
        prompt: PROMPT,
        max_tokens: MAX_TOKENS
      });

      /* uform-gen2 返回 description；llama-3.2-vision 返回 response */
      const text = (result && (result.description || result.response || result.text)) || '';
      if (!text) { lastErr = new Error('没有识别到文字'); continue; }

      const clean = text.trim();
      /* 模型明确说图里没字时，按「无文字」返回，让前端给友好提示而不是空白结果 */
      if (/^NO_TEXT$/i.test(clean) || clean.length < 2) {
        return json({ text: '', empty: true, model: model, lang: lang });
      }
      return json({ text: clean, model: model, lang: lang });
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
