/* LiteBox v5 · functions/api/disaster.js — 灾害预警（GET /api/disaster?city=&page=）
 *
 * Step 28 · 四：第三方只在服务端调用，前端只见到 /api/disaster。
 * 密钥走 env.XIAOAPI_KEY。
 *
 * 【与任务书示例的差异（往更严的方向）】
 *   1) 上游业务错误（实测密钥错误也回 HTTP 200 + code:0 + msg）不透出上游 msg。
 *   2) city 限中文/字母与「市/县/区」等常见字符（≤12 字）、page 限 1~99 数字，
 *      两者都会拼进上游 URL，不允许任意值。
 *   3) icon 是政府官网（www.cneb.gov.cn）图片，任务书允许直接引用；
 *      但为满足「Network 只出现 /api/*」与前端零第三方域名两条硬要求，
 *      这里把 icon 转成同源素材代理地址（与 Step 26 头像/封面同一做法）。
 *   4) docpuburl 是用户点击才跳转的政府官网链接（与热榜搜索外链同类），
 *      保留绝对地址，但只接受 https。 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/cneb_yujing_api.php';

/* 素材统一转同源代理（只接受 https），并带上官网 Referer */
function viaProxy(u) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  return '/api/shortvideo-proxy?platform=cneb&url=' + encodeURIComponent(s);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const city = (url.searchParams.get('city') || '').trim();
  const pageRaw = (url.searchParams.get('page') || '1').trim();

  if (city && !/^[一-龥A-Za-z0-9]{1,12}$/.test(city)) return err('城市名格式不正确', 400);
  /* 纯数字且 ≤2 位：避免 '1.5'、'1e2' 这类经 parseInt 变成合法页码的写法透传给上游 */
  if (!/^\d{1,2}$/.test(pageRaw)) return err('页码不正确', 400);
  const page = parseInt(pageRaw, 10);
  if (page < 1 || page > 99) return err('页码不正确', 400);

  const token = env && env.XIAOAPI_KEY ? String(env.XIAOAPI_KEY) : '';
  if (!token) return err('服务未配置', 503);

  let upstream = API
    + '?key=' + encodeURIComponent(token)
    + '&page=' + encodeURIComponent(String(page));

  if (city) upstream += '&city=' + encodeURIComponent(city);

  let d = null;
  try {
    d = await fetchJSON(upstream, 12000);
  } catch (_) {
    return err('灾害预警服务暂时不可用', 502);
  }
  /* 实测密钥错误也回 code:0 —— 成功必须 code===200 且带 result */
  if (!d || d.code !== 200 || !d.result) {
    return err('未获取到预警信息', 404);
  }

  const v = d.result;
  return json({
    total: Number(v.sums) || 0,
    page: parseInt(v.page, 10) || page,
    list: (Array.isArray(v.datas) ? v.datas : []).map(x => {
      const link = String(x.docpuburl || '');
      return {
        title: x.doctitle || '',
        abstract: x.docabstract || '',
        pubTime: x.docpubtime || '',
        /* 政府官网外链：仅 https 保留（用户点击才跳转） */
        url: /^https:\/\//i.test(link) ? link : '',
        icon: viaProxy(x.icon),
        iconDesc: x.iconDesc || ''
      };
    })
  });
}
