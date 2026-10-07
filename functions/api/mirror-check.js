/* LiteBox v5 · functions/api/mirror-check.js — 镜像可用性检测（GET /api/mirror-check?url=）
   HEAD 请求避免拉大文件；白名单防 SSRF；超时 5 秒 */
import { json, err } from '../_utils.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) return err('缺少 url 参数', 400);

  /* 只允许检查白名单域名，防止 SSRF */
  const allowedHosts = [
    'ghfast.top', 'gh-proxy.com', 'ghproxy.net', 'ghproxy.cc',
    'github.moeyy.xyz', 'slink.ltd', 'gh-proxy.org',
    'cdn.jsdelivr.net', 'docker.1ms.run', 'registry.npmmirror.com'
  ];

  let hostname;
  try {
    hostname = new URL(target).hostname;
  } catch (_) {
    return err('URL 格式不正确', 400);
  }
  if (!allowedHosts.some(h => hostname.endsWith(h))) {
    return err('不允许检查该域名', 403);
  }

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(target, {
      method: 'HEAD',   /* 用 HEAD 避免下载大文件 */
      signal: ctrl.signal,
      redirect: 'follow'
    });
    const ms = Date.now() - t0;
    return json({ ok: r.ok, ms, status: r.status });
  } catch (e) {
    return json({ ok: false, ms: Date.now() - t0, status: 0, error: e.message });
  } finally {
    clearTimeout(timer);
  }
}
