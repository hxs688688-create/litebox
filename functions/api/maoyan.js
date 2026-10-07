/* LiteBox v5 · functions/api/maoyan.js — 实时猫眼票房（GET /api/maoyan）
 *
 * Step 26 · 四：第三方只在服务端调用，前端只见到 /api/maoyan。
 *
 * 【与任务书示例的唯一差异（有实测依据，故在此说明）】
 *   示例里写的是「没有 env.OVO1_KEY 就直接 503 服务未配置」。
 *   实测该上游端点：
 *     · 不带 token          → code 200 + 51 条榜单（正常出数据）
 *     · 带任意错误 token    → code 505 请求token不存在
 *   也就是说这个接口本身是免密钥的，带错 token 反而会被拒。
 *   所以这里改成「配了 OVO1_KEY 就带上，没配就不带」，
 *   既满足「Token 只从环境变量读」，又保证用户还没去面板加新变量时工具可用。
 *   其余四个接口（战力 / 解析 / 工商 / 限免）实测必须要有效 token，保持示例的 503 门槛。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/maoyan';

export async function onRequest({ request, env }) {
  /* request 参数保留以便与同目录函数签名一致；本接口无查询参数 */
  if (request && request.method && request.method !== 'GET') return err('只支持 GET', 405);

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  const upstream = API + '?token=' + encodeURIComponent(token);

  let d = null;
  try {
    d = await fetchJSON(token ? upstream : API, 12000);
  } catch (_) {
    return err('票房服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) return err('票房数据暂时无法获取', 502);

  const v = d.data;
  return json({
    updated: v['更新时间'] || '',
    list: (v['榜单'] || []).map(x => ({
      rank: x['排名'] || 0,
      name: x['电影名称'] || '',
      info: x['上映信息'] || '',
      totalBox: x['总票房'] || '',
      boxRate: x['票房占比'] || '',
      sessions: x['排片场次'] || 0,
      sessionRate: x['排片占比'] || '',
      avgPeople: x['场均人次'] || '',
      occupancy: x['上座率'] || ''
    }))
  });
}
