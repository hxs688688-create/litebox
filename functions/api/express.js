/* LiteBox v5 · functions/api/express.js — 快递查询（GET /api/express?number=&mobile=）
 *
 * Step 27 · 一：第三方只在服务端调用，前端只见到 /api/express。
 * 该数据源免密钥（实测无 token 即可用），因此本文件不读 env，
 * 也就没有任何密钥会进 URL、日志或响应。
 *
 * 【与任务书示例的两处差异（都是往更严的方向，沿用 Step 26 已定的安全策略）】
 *   1) 上游业务错误（实测回 {"code":100,"msg":"无法识别快递公司…"}）时不透出上游 msg，
 *      统一映射成中文固定文案 —— Step 26「错误信息归一化、不回显上游原文」同样适用本步。
 *   2) 上游正常响应里带 ip / exec_time 等内部字段，这里逐字段挑白名单输出，绝不整体透传。
 *   3) 单号做格式白名单（字母数字与短横线，6~40 位）：number 会拼进上游 URL，不允许任意值。
 *
 * 隐私：手机后四位只用于本次上游查询，不进日志、不进响应、不出现在任何返回字段里。 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://ministe.top/kd.php';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const number = (url.searchParams.get('number') || '').trim();
  const mobile = (url.searchParams.get('mobile') || '').trim();

  if (!number) return err('请输入快递单号', 400);
  if (!/^[A-Za-z0-9-]{6,40}$/.test(number)) return err('快递单号格式不正确', 400);
  if (!mobile) return err('请输入手机后四位', 400);
  if (!/^\d{4}$/.test(mobile)) return err('手机后四位必须是 4 位数字', 400);

  const upstream = API
    + '?number=' + encodeURIComponent(number)
    + '&mobile=' + encodeURIComponent(mobile);

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (_) {
    return err('快递查询服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) {
    /* 上游把「单号不存在」「无法识别快递公司」「需要补全信息」混在同一个 code 里，
       统一按未查询到处理，不透出上游原文 */
    return err('未查询到物流信息，请检查单号与手机后四位是否正确', 404);
  }

  const v = d.data;
  return json({
    company: v.company || '',
    com: v.com || '',
    no: v.no || number,
    state: v.state || '0',
    list: (Array.isArray(v.list) ? v.list : []).map(x => ({
      time: x.time || '',
      context: x.context || '',
      location: x.location || ''
    }))
  });
}
