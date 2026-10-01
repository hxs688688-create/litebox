import { json, proxyUpstream } from '../../_shared.js';
export async function onRequestPost({ request }) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 12 * 1024 * 1024) return json({ error: { message: '文件不能超过 10MB' } }, { status: 413 });
  return proxyUpstream(request, '/v1/audio/transcriptions', 'application/json, text/plain, */*');
}
