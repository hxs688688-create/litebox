/* LiteBox v5 · functions/api/goldprice.js — 实时金价（GET /api/goldprice）
 *
 * Step 28 · 一：第三方只在服务端调用，前端只见到 /api/goldprice。
 * 密钥只从 env.XUNJINLU_KEY 读，绝不写死、不进日志、不进响应。
 *
 * 【与任务书示例的差异（都是往更严的方向，沿用 Step 26/27 已定的安全策略）】
 *   1) 上游业务错误不透出上游 msg（实测密钥错误回 {"code":0,"msg":"密钥错误"}，
 *      HTTP 仍是 200），统一映射成固定中文文案。
 *   2) 按任务书不返回 charts 字段（里面全是 eastmoney.com 图 URL，会暴露上游）。
 *   3) 逐字段白名单输出，不整体透传。 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.xunjinlu.fun/api/jinjia/v1.php';

export async function onRequest({ request, env }) {
  const token = env && env.XUNJINLU_KEY ? String(env.XUNJINLU_KEY) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API + '?key=' + encodeURIComponent(token);

  let d = null;
  try {
    d = await fetchJSON(upstream, 12000);
  } catch (_) {
    return err('金价服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) {
    return err('金价数据暂时无法获取', 502);
  }

  const v = d.data;
  return json({
    updateTime: v.update_time || '',
    shops: (Array.isArray(v.shops) ? v.shops : []).map(x => ({
      name: x.name || '',
      retail: x.retail_price == null ? '' : String(x.retail_price),
      exchange: x.exchange_price == null ? '' : String(x.exchange_price),
      time: x.update_time || ''
    })),
    futures: (Array.isArray(v.futures) ? v.futures : []).map(x => ({
      name: x.name || '',
      tradePrice: x.trade_price == null ? '' : String(x.trade_price),
      tradeUnit: x.trade_unit || '',
      convertPrice: x.convert_price == null ? '' : String(x.convert_price),
      time: x.update_time || ''
    }))
    /* charts 字段按任务书丢弃：URL 全在 eastmoney.com，会暴露上游 */
  });
}
