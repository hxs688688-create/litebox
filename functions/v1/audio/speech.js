import { proxyUpstream } from '../../_shared.js';
export async function onRequestPost({ request }) {
  return proxyUpstream(request, '/v1/audio/speech', 'audio/mpeg, application/octet-stream, */*');
}
