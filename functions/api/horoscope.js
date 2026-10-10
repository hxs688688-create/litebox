/* LiteBox v5 · functions/api/horoscope.js — 星座运势（GET /api/horoscope?sign=）
 *
 * Step 25 · 三：第三方只在服务端调用，前端只见到 /api/horoscope。
 * 该接口按官方文档「免费 / 无需 KEY」，故不读取 env 密钥。
 *
 * 【必须删掉 tips】
 *   上游在正常返回里带一句 tips:"慕名API：http://xiaoapi.cn"，
 *   那是数据源署名。红线要求「界面上不标注数据来源」，所以这一层直接删除，
 *   不交给前端处理，免得以后新增渲染点漏掉。
 *
 * 【星座名可带「座」也可不带】
 *   实测两种写法都返回同一份数据（constellation 恒为不带「座」的短名），
 *   前端统一传全称，这里再按短名回一份给前端做标题。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/zs_xzys.php';

/* 白名单：只放行 12 星座，避免把任意字符串塞给第三方 */
const SIGNS = ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
  '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'];

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const sign = (url.searchParams.get('sign') || '').trim();
  if (!sign) return err('请选择星座', 400);

  const norm = sign.endsWith('座') ? sign : sign + '座';
  if (SIGNS.indexOf(norm) < 0) return err('请选择有效的星座', 400);

  try {
    const d = await fetchJSON(API + '?msg=' + encodeURIComponent(norm), 12000);
    if (!d || d.code !== 200) return err((d && d.msg) || '查询失败，请稍后重试', 502);
    delete d.tips;
    return json(d);
  } catch (_) {
    return err('查询服务暂时不可用，请稍后重试', 502);
  }
}
