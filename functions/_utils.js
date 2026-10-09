/* LiteBox v5 · functions/_utils.js — Functions 公共工具
   以 _ 开头的文件 Cloudflare Pages 不作为路由，仅作模块复用 */

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export function err(message, status = 500) {
  return json({ error: { message } }, status);
}

export async function fetchJSON(url, timeoutMs = 8000, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'LiteBox/5.0 (+https://litebox.app)',
        ...(options.headers || {})
      }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, timeoutMs = 8000, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'LiteBox/5.0 (+https://litebox.app)',
        ...(options.headers || {})
      }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

/* 多源容错：依次尝试 list 里的 URL，谁先成功用谁 */
export async function tryAll(urls, timeoutMs = 8000) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await fetchJSON(url, timeoutMs);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('全部数据源不可达');
}
