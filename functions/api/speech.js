/* LiteBox v5 · functions/api/speech.js — 文字转语音（POST /api/speech）
   两段式：配置 TTS_ENDPOINT 环境变量则转发自部署 TTS；否则 Google Translate TTS 兜底（免费、单次 200 字符） */
import { err } from '../_utils.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('只支持 POST', 405);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('请求体格式不正确', 400);
  }

  const input = String(body.input || '').trim();
  if (!input) return err('缺少 input 参数', 400);
  if (input.length > 200) return err('单次最多 200 字符（前端会自动分段）', 400);

  /* 模式 1：转发到自定义 TTS 服务（如果配置了 TTS_ENDPOINT） */
  if (env && env.TTS_ENDPOINT) {
    try {
      const r = await fetch(env.TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.ok) {
        return new Response(r.body, {
          headers: {
            'Content-Type': r.headers.get('Content-Type') || 'audio/mpeg',
            'Cache-Control': 'no-store'
          }
        });
      }
    } catch (_) {}
  }

  /* 模式 2：Google Translate TTS 兜底 */
  try {
    const lang = (body.voice || '').startsWith('en') ? 'en'
              : (body.voice || '').startsWith('ja') ? 'ja'
              : (body.voice || '').startsWith('ko') ? 'ko'
              : 'zh-CN';

    const ttsUrl = 'https://translate.google.com/translate_tts?' +
      'ie=UTF-8&client=tw-ob&tl=' + lang + '&q=' + encodeURIComponent(input);

    const r = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LiteBox/5.0)',
        'Referer': 'https://translate.google.com/'
      }
    });
    if (!r.ok) throw new Error('TTS HTTP ' + r.status);
    const buf = await r.arrayBuffer();
    if (!buf.byteLength) throw new Error('返回空音频');

    return new Response(buf, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return err(e.message || '语音合成服务暂时不可用', 502);
  }
}
