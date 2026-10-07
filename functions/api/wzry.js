/* LiteBox v5 · functions/api/wzry.js — 王者荣耀英雄查询（GET /api/wzry?name=）
 *
 * Step 25 · 二：第三方只在服务端调用，前端只见到 /api/wzry。
 * 该接口按官方文档「免费 / 无需 KEY」，故不读取 env 密钥。
 *
 * 【为什么要先 JSON.parse 文本】
 *   实测英雄名查不到时，上游回的是 HTTP 200 + 纯文本「JSON解析失败」，
 *   用 fetchJSON 会在 JSON.parse 处抛错，前端就只能看到笼统的「服务不可用」。
 *   这里自己解析：解析不出来 / 缺「基本信息」一律按「未找到该英雄」404 处理。
 *
 * 【字段原样透传】
 *   上游结构（基本信息 / 技能信息 / 出装推荐 / 铭文推荐 / 英雄关系 / 版本信息 等）
 *   版本较固定，交给前端按需渲染；缺字段时前端有兜底，所以这里不做字段裁剪，
 *   只清掉明显无用的第三方署名文案，界面上不出现任何源域名。
 */
import { json, err, fetchText } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/wzry.php';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  if (!name) return err('请输入英雄名称', 400);
  if (name.length > 20) return err('英雄名称过长', 400);

  let text = '';
  try {
    text = await fetchText(API + '?msg=' + encodeURIComponent(name), 12000);
  } catch (_) {
    return err('查询服务暂时不可用，请稍后重试', 502);
  }

  let d = null;
  try { d = JSON.parse(text); } catch (_) { d = null; }

  /* 上游查不到时给的是非 JSON 文本，或 JSON 里没有基本信息 */
  if (!d || typeof d !== 'object' || !d['基本信息']) return err('未找到该英雄', 404);

  /* 清掉任何「慕名 / xiaoapi」署名字段，界面上不标注数据来源 */
  for (const k of Object.keys(d)) {
    if (/^(tips|source|author|from|copyright|msg)$/i.test(k)) delete d[k];
  }

  return json(d);
}
