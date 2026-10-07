/* LiteBox v5 · functions/api/wzrank.js — 王者荣耀战力查询（GET /api/wzrank?name=&type=）
 *
 * Step 26 · 一：第三方只在服务端调用，前端只见到 /api/wzrank。
 * 密钥只从 env.OVO1_KEY 读，绝不写死、不进日志、不进响应。
 *
 * 【与任务书示例的两处差异（都是往更严的方向）】
 *   1) 上游业务错误（实测回 {"code":505,"msg":"请求token不存在"} 等）时，
 *      不透出上游 msg —— 里面可能带计费/密钥提示等内部信息（Step 26 安全策略第 3 条）。
 *      统一映射成中文笼统文案；只有「查无此英雄」保留具体含义。
 *   2) 上游正常时也回 HTTP 200，所以必须按 body.code 判断，不能只看状态码。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/wzzl';
const TYPES = ['安卓-扣扣区', '安卓-微信区', '苹果-扣扣区', '苹果-微信区'];

/* 第三方素材（英雄头像走游戏 CDN）统一转同源代理地址：
   1) 验收要求「Network 里所有请求都是 /api/xxx」；
   2) 响应 JSON 里因此不含任何第三方域名。只接受 https，其它丢弃。 */
function viaProxy(u) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  let type = (url.searchParams.get('type') || '安卓-扣扣区').trim();
  /* 白名单收口：type 直接拼进上游 URL，不允许任意值 */
  if (TYPES.indexOf(type) < 0) type = TYPES[0];
  if (!name) return err('请输入英雄名称', 400);
  if (name.length > 20) return err('英雄名称过长', 400);

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API + '?token=' + encodeURIComponent(token) +
    '&name=' + encodeURIComponent(name) +
    '&type=' + encodeURIComponent(type) +
    '&mode=json';

  let d = null;
  try {
    d = await fetchJSON(upstream, 12000);
  } catch (_) {
    return err('战力查询服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) {
    /* 上游把「查无此人」和「服务/密钥问题」混在同一个 code 里，
       无法区分时统一按未找到处理，不透出上游原文 */
    return err('未找到该英雄的战力数据', 404);
  }

  const v = d.data;
  const num = x => { const n = Number(x); return isFinite(n) ? n : 0; };
  return json({
    hero: v['英雄'] || name,
    title: v['称号'] || '',
    platform: v['平台'] || '',
    /* 头像走同源素材代理：响应里不出现任何第三方绝对地址 */
    avatar: viaProxy(v['头像']),
    province: { name: (v['最低省标'] && v['最低省标']['省份']) || '', power: num(v['最低省标'] && v['最低省标']['战力']) },
    city: { name: (v['最低市标'] && v['最低市标']['城市']) || '', power: num(v['最低市标'] && v['最低市标']['战力']) },
    district: { name: (v['最低区标'] && v['最低区标']['地区']) || '', power: num(v['最低区标'] && v['最低区标']['战力']) },
    top10: num(v['国服前十']),
    top1: num(v['国服第一']),
    updated: v['更新时间'] || ''
  });
}
