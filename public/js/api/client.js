/* LiteBox v5 · api/client.js — 统一 API 层（超时 / 错误 / 格式化） */
(() => {
  window.LB = window.LB || {};

  const DEFAULT_TIMEOUT = 8000;

  async function request(url, opts, method, body) {
    opts = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || DEFAULT_TIMEOUT);
    try {
      const init = { method: method, cache: 'no-store', signal: ctrl.signal };
      if (opts.headers) init.headers = Object.assign({}, opts.headers);
      if (method === 'POST' && body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      }
      const res = await fetch(url, init);
      if (!res.ok) return { ok: false, error: '请求失败：HTTP ' + res.status };
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (_) { data = text; } /* 非 JSON 按纯文本返回 */
      return { ok: true, data: data };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: '请求超时，请检查网络后重试' };
      return { ok: false, error: '网络连接失败' };
    } finally {
      clearTimeout(timer);
    }
  }

  LB.api = {
    /* 返回 { ok:true, data } 或 { ok:false, error:'中文错误信息' } */
    get(url, opts) { return request(url, opts, 'GET'); },
    post(url, body, opts) { return request(url, opts, 'POST', body); },
    /* 快捷方法：直接返回 data，失败时 throw Error(中文信息) */
    async getJSON(url, opts) {
      const r = await request(url, opts, 'GET');
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    async postJSON(url, body, opts) {
      const r = await request(url, opts, 'POST', body);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    }
  };
})();
