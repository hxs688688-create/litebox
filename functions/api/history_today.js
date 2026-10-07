/* LiteBox v5 · functions/api/history_today.js — 历史上的今天（GET /api/history_today）
 *
 * Step 28 · 三：数据源从本地字典换成 xiaoapi.cn（密钥走 env.XIAOAPI_KEY）。
 * 参数：action=today|date|search；date=MMdd；q=搜索词（仅 search）。
 *
 * 【与任务书示例的差异（往更严的方向，沿用 Step 26/27 已定的安全策略）】
 *   1) 上游业务错误（实测密钥错误也回 HTTP 200 + code:0 + msg）不透出上游 msg，
 *      统一映射成固定中文文案。
 *   2) action / date 会拼进上游 URL：action 白名单 today|date|search，
 *      date 必须 4 位数字，q 限 50 字 —— 非法值直接 400，不透传。 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/history_today.php';
const ACTIONS = ['today', 'date', 'search'];

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = (url.searchParams.get('action') || 'today').trim();
  const date = (url.searchParams.get('date') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();

  if (ACTIONS.indexOf(action) < 0) return err('不支持的查询类型', 400);
  if (date && !/^\d{4}$/.test(date)) return err('日期格式不正确', 400);
  if (action === 'date' && !date) return err('请提供日期', 400);
  if (q.length > 50) return err('搜索词过长', 400);

  const token = env && env.XIAOAPI_KEY ? String(env.XIAOAPI_KEY) : '';
  if (!token) return err('服务未配置', 503);

  let upstream = API
    + '?key=' + encodeURIComponent(token)
    + '&action=' + encodeURIComponent(action);

  if (date) upstream += '&date=' + encodeURIComponent(date);
  if (q && action === 'search') upstream += '&q=' + encodeURIComponent(q);

  let d = null;
  try {
    d = await fetchJSON(upstream, 12000);
  } catch (_) {
    return err('历史查询服务暂时不可用', 502);
  }
  /* 实测密钥错误也回 code:0 —— 成功必须是 code===200 且带 data */
  if (!d || d.code !== 200 || !d.data) {
    return err('未获取到历史事件', 404);
  }

  const v = d.data;
  return json({
    date: v.date || '',
    dateCn: v.date_cn || '',
    total: Number(v.total) || 0,
    events: (Array.isArray(v.events) ? v.events : []).map(x => ({
      year: Number(x.year) || 0,
      title: x.title || '',
      desc: x.desc || '',
      category: x.category || ''
    }))
  });
}
