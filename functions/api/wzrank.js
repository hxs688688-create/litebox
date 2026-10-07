/* LiteBox v5 · functions/api/wzrank.js — 王者荣耀战力查询（GET /api/wzrank?name=[&type=]）
 *
 * Step 28 修正 · 三：type 不再有默认值。
 *   上一版默认「安卓-扣扣区」，实测该写法不是接口认可的格式，直接查会失败。
 *   现在：不传 type 就不拼给上游（让上游按默认区返回）；传了才拼，
 *   且值必须是前端下拉给出的那几个（白名单，避免把任意字符串塞进上游 URL）。
 *   另外按任务书加了 console.warn 日志（只记 code / msg，绝不记 token）。
 *
 * 密钥只从 env.OVO1_KEY 读，绝不写死、不进日志、不进响应。
 *
 * 【与任务书示例保留的两处差异（都是往更严的方向）】
 *   1) 上游业务错误（实测回 {"code":505,"msg":"请求token不存在"} 等）时，
 *      不透出上游 msg —— 里面可能带计费/密钥提示等内部信息（Step 26 安全策略第 3 条）。
 *      统一映射成中文笼统文案；只有「查无此英雄」保留具体含义。
 *   2) 上游正常时也回 HTTP 200，所以必须按 body.code 判断，不能只看状态码。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/wzzl';

/* 前端下拉可选项（任务书 · 三）：默认（自动）= 空值不传 type */
const TYPES = ['安卓QQ', '安卓微信', 'iOS QQ', 'iOS 微信'];
/* 旧版写死过的区服名，仍放行，避免历史链接直接坏掉 */
const LEGACY_TYPES = ['安卓-扣扣区', '安卓-微信区', '苹果-扣扣区', '苹果-微信区'];
/* 任务书要求先在浏览器试不同 type 才知道哪个能用，所以白名单之外再放一条
   「短、且只含汉字/字母/数字/空格/+-」的兜底规则，防止真实值被卡死；
   目的只是不让任意字符串（含 & = ? # 等）拼进上游 URL。 */
const TYPE_SAFE = /^[一-龥A-Za-z0-9 +-]{1,20}$/;

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
  const type = (url.searchParams.get('type') || '').trim();
  /* type 会拼进上游 URL，所以只放行下拉项 / 旧区服名 / 短且无 URL 元字符的值
     （任务书要求用户实测哪种 type 有效，太严的白名单会让试验直接 400） */
  if (type && TYPES.indexOf(type) < 0 && LEGACY_TYPES.indexOf(type) < 0 && !TYPE_SAFE.test(type)) {
    return err('平台选项不正确', 400);
  }
  if (!name) return err('请输入英雄名称', 400);
  if (name.length > 20) return err('英雄名称过长', 400);

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) return err('服务未配置', 503);

  let upstream = API + '?token=' + encodeURIComponent(token) +
    '&name=' + encodeURIComponent(name) +
    '&mode=json';
  if (type) upstream += '&type=' + encodeURIComponent(type);

  let d = null;
  try {
    d = await fetchJSON(upstream, 12000);
  } catch (e) {
    console.warn('[wzrank] fetch error:', e && e.message);
    return err('战力查询服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) {
    /* 上游把「查无此人」和「服务/密钥问题」混在同一个 code 里，
       无法区分时统一按未找到处理，不透出上游原文；细节只进日志 */
    console.warn('[wzrank] upstream returned:', d && d.code, d && d.msg);
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
