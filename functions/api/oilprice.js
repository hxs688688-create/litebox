/* LiteBox v5 · functions/api/oilprice.js — 全国油价（GET /api/oilprice?dq=）
 *
 * Step 27 · 二：第三方只在服务端调用，前端只见到 /api/oilprice。
 * 密钥只从 env.OVO1_KEY 读，绝不写死、不进日志、不进响应。
 *
 * 【与任务书示例的一处差异（往更严的方向，沿用 Step 26 已定的安全策略）】
 *   dq 会拼进上游 URL，所以按 31 个省级行政区白名单收口（含「全国」= 不传 dq）；
 *   不在名单里的一律当「全国」处理，避免任意值透传给上游。
 *
 * 上游契约（与 Step 26 各 ovo1 接口一致）：业务错误也回 HTTP 200，
 * 必须按 body.code 判断（实测无 token 回 {"code":504,"msg":"缺少请求token参数"}），
 * 且不透出上游 msg。 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/youjia';

/* 任务书：下拉 34 个省（31 个大陆省级行政区 + 香港 / 澳门 / 台湾）；「全国」不传 dq */
const PROVINCES = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '香港', '澳门', '台湾'
];

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  let dq = (url.searchParams.get('dq') || '').trim();
  if (PROVINCES.indexOf(dq) < 0) dq = '';

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API
    + '?token=' + encodeURIComponent(token)
    + '&dq=' + encodeURIComponent(dq || '无')
    + '&mode=json';

  let d = null;
  try {
    d = await fetchJSON(upstream, 12000);
  } catch (_) {
    return err('油价查询服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) {
    return err('未查询到该省份的油价信息', 404);
  }

  const v = d.data;
  const mapFuel = (obj) => {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const key in obj) {
      const item = obj[key] || {};
      out[key] = {
        price: num(item['价格']),
        change: num(item['涨跌'])
      };
    }
    return out;
  };

  return json({
    province: v['省份'] || dq || '全国',
    gasoline: mapFuel(v['汽油']),
    diesel: mapFuel(v['柴油']),
    updated: v['更新时间'] || ''
  });
}
