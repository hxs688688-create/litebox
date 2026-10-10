/* LiteBox v5 · functions/api/transcribe.js — 语音转文字（POST /api/transcribe，multipart/form-data）
   Cloudflare Workers AI whisper（@cf/openai/whisper，免费额度）；未启用 [ai] binding 时返回 503 */
import { json, err } from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('只支持 POST', 405);

  /* 若未配置 AI binding */
  if (!env || !env.AI) {
    return json({
      error: { message: '语音识别服务未配置（需要在 wrangler.toml 启用 [ai] binding）' }
    }, 503);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (_) {
    return err('请求体必须为 multipart/form-data', 400);
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') return err('缺少 file 字段', 400);
  if (file.size > 10 * 1024 * 1024) return err('音频不能超过 10MB', 400);

  try {
    const buf = await file.arrayBuffer();
    const bytes = [...new Uint8Array(buf)];

    /* Cloudflare Workers AI whisper */
    const result = await env.AI.run('@cf/openai/whisper', {
      audio: bytes
    });

    if (!result || !result.text) {
      return err('没有识别到文字', 502);
    }
    return json({ text: result.text });
  } catch (e) {
    return err(e.message || '语音识别失败', 502);
  }
}
