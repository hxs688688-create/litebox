/* LiteBox v5 · functions/api/ip.js — 本机公网 IP（GET /api/ip[?q=]）
 *
 * Step 29 · 一：返回访问者的真实 IP，而不是 Cloudflare 出口 IP。
 *   上一版只读 CF-Connecting-IP；这里按任务书补全真实 IP 头链：
 *     CF-Connecting-IP → X-Forwarded-For 第一段 → X-Real-IP
 *   并把 realIp 显式作为 ?ip= 参数传给上游（上游若按调用方出口反查，
 *   查到的会是 CF 节点，所以归属地一律以传入的 ip 为准）。
 *   响应体按任务书保持 { code: 200, ip: 'xxx', ... } 结构；
 *   归属地信息仍然返回（前端默认折叠），查不到归属地不影响 IP 本身。
 *
 * 安全（未变）：
 *   · key 只从 env.XIAOAPI_KEY 读，绝不写死、不进日志、不进响应；
 *   · 上游异常统一回中文提示，不透出上游原文；
 *   · 响应走 _utils.json()，Cache-Control: no-store。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://xiaoapi.cn/v1/ip.php';

/* ISO 国家代码 → 中文 */
const COUNTRY_CN = {
  CN: '中国', US: '美国', JP: '日本', SG: '新加坡',
  HK: '中国香港', TW: '中国台湾', MO: '中国澳门', KR: '韩国',
  GB: '英国', DE: '德国', CA: '加拿大', AU: '澳大利亚',
  FR: '法国', NL: '荷兰', IN: '印度', RU: '俄罗斯',
  VN: '越南', TH: '泰国', MY: '马来西亚', ID: '印度尼西亚',
  IT: '意大利', ES: '西班牙', PH: '菲律宾', BR: '巴西',
  MX: '墨西哥', AE: '阿联酋', SA: '沙特阿拉伯', CH: '瑞士',
  SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰',
  PL: '波兰', UA: '乌克兰', TR: '土耳其', NZ: '新西兰',
  AR: '阿根廷', ZA: '南非', EG: '埃及'
};

const isV6 = ip => String(ip).indexOf(':') > -1;

/* 上游 → 展示结构；查不到返回 null */
function pick(det, ip) {
  if (!det) return null;
  const rawCountry = String(det.country || '');
  return {
    ip: ip || '',
    country: COUNTRY_CN[rawCountry.toUpperCase()] || rawCountry,
    region: det.province || '',
    city: det.city || '',
    org: det.carrier || '',
    zone: det.zone || ''
  };
}

/* Step 29 · 一：真实 IP 头链（任务书原文顺序） */
function getRealIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    request.headers.get('X-Real-IP') ||
    ''
  ).trim();
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length > 100) return err('查询内容过长', 400);

  const key = env && env.XIAOAPI_KEY ? String(env.XIAOAPI_KEY) : '';
  if (!key) return err('服务未配置', 503);

  /* 本机查询：realIp 就是访问者的公网出口 IP（手机流量 / WiFi 两次应不同） */
  const isAuto = !q;
  const realIp = isAuto ? getRealIp(request) : '';
  if (isAuto) console.log('[ip] realIp=', realIp);
  const targetIp = q || realIp;
  if (!targetIp) return err('无法识别本机出口 IP，请直接输入 IP 查询', 400);

  /* 出口是 IPv6 时，尽量再拿一条 IPv4（Cloudflare 免费版可能没有这个头） */
  const ipv4Header = isAuto && isV6(targetIp)
    ? (request.headers.get('CF-Connecting-IPv4') || '').trim() : '';

  const apiBase = API + '?key=' + encodeURIComponent(key) + '&ip=';

  /* 归属地查询失败不影响 IP 本身返回：整段包在 try 里降级为「只有 IP」 */
  let main = null, version = isV6(targetIp) ? 'IPv6' : 'IPv4', ipv4Info = null;
  let d = null;
  try {
    d = await fetchJSON(apiBase + encodeURIComponent(targetIp), 8000);
  } catch (_) {
    d = null;
  }
  if (d && d.code === 0 && d.data) {
    /* 上游偶尔回显它自己看到的来源 IP（可能是 CF 节点），
       展示一律以我们显式传入的 targetIp 为准，保证是访问者真实 IP */
    main = pick(d.data.detail, targetIp);
    version = d.data.version || version;
    if (ipv4Header && ipv4Header !== targetIp) {
      try {
        const d4 = await fetchJSON(apiBase + encodeURIComponent(ipv4Header), 6000);
        if (d4 && d4.code === 0 && d4.data) ipv4Info = pick(d4.data.detail, ipv4Header);
      } catch (_) { /* 拿不到就只展示主结果 */ }
    }
  }

  const geo = main || { country: '', region: '', city: '', org: '', zone: '' };
  return json({
    code: 200,
    ip: targetIp,
    version: version,
    isIpv6: isV6(targetIp),
    ipv4: ipv4Info ? ipv4Info.ip : '',
    ipv4Info: ipv4Info,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    org: geo.org,
    zone: geo.zone,
    hasGeo: !!main,
    query: q || '本机'
  });
}
