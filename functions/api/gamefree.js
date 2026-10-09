/* LiteBox v5 · functions/api/gamefree.js — 每日限免游戏汇总（GET /api/gamefree）
 *
 * Step 26 · 五：第三方只在服务端调用，前端只见到 /api/gamefree。
 * 密钥只从 env.OVO1_KEY 读。
 *
 * 上游业务错误实测回 HTTP 200 + {"code":505,...}，
 * 按安全策略不透出原文，统一归一化为中文笼统文案。
 * 封面图（游戏商店 CDN）转成同源素材代理地址，
 * 保证 Network 面板只有 /api/xxx、响应 JSON 里没有第三方域名。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/xijiayi';

function viaProxy(u) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s);
}

export async function onRequest({ request, env }) {
  if (request && request.method && request.method !== 'GET') return err('只支持 GET', 405);

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API + '?token=' + encodeURIComponent(token) +
    '&type=all&platform=all&mode=json';

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (_) {
    return err('限免信息服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) return err('限免信息暂时无法获取', 502);

  const v = d.data;
  const list = (v['正在免费'] || []).map(x => ({
    section: x['所属板块'] || '',
    name: x['游戏名称'] || '',
    status: x['状态描述'] || '',
    timeInfo: x['时间信息'] || '',
    priceInfo: x['价格与发行商'] || '',
    desc: x['游戏简介'] || '',
    cover: viaProxy(x['封面图片']),
    shop: x['商店'] || '',
    count: x['游戏数量'] || 0
  }));

  return json({
    total: v['总项目数'] || 0,
    free: v['免费数量'] || 0,
    list: list
  });
}
