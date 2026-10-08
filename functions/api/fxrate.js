/* LiteBox v5 · functions/api/fxrate.js — 汇率（GET /api/fxrate?base=，默认 CNY）
   双源容错：open.er-api.com（支持 CNY）→ frankfurter.app（不支持 CNY base） */
import { json, err, fetchJSON } from '../_utils.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const base = (url.searchParams.get('base') || 'CNY').toUpperCase();

  const sources = [
    'https://open.er-api.com/v6/latest/' + base,
    'https://api.frankfurter.app/latest?from=' + base
  ];

  let lastErr = null;
  for (const src of sources) {
    try {
      const d = await fetchJSON(src, 6000);
      if (!d.rates) throw new Error('接口返回异常');
      return json({
        base: d.base_code || d.base || base,
        rates: d.rates,
        time: d.time_last_update_utc || d.date || new Date().toISOString()
      });
    } catch (e) {
      lastErr = e;
    }
  }
  return err(lastErr?.message || '汇率获取失败', 502);
}
