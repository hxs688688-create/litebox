/* LiteBox v5 · functions/api/shortvideo-proxy.js — 第三方素材代理
 *
 * 用途：把解析出来的视频 / 封面 / 头像 / 图集 / 背景音乐 / 游戏封面转成同源地址再交给浏览器，
 * 并补上平台要求的 Referer 与桌面 UA —— 实测不带这些头，CDN 直接 400 / 424。
 *
 * Step 26 · 二：默认 Referer 改为抖音站点（本工具主解析平台已换），
 * 并把 audio/* 加入 Content-Type 白名单，背景音乐才能下载。
 *
 * 与任务书示例的三处必要差异（都写进 Step 25 说明，本次沿用）：
 *   1) 转发并回传 Range：浏览器 <video> 拖动进度条一定会发 Range 请求，
 *      原样透传后上游回 206 + Content-Range，进度条可用；不透传就只能顺序播完。
 *   2) 不写 Content-Length：手动抄上游的 Content-Length 容易和实际流不一致
 *      （gzip、206 分段都会偏），交给运行时按实际字节数处理更安全。
 *   3) 不加 Access-Control-Allow-Origin：本代理只给同源页面用，
 *      加上等于把「任意 https 地址转发器」开放给所有网站，没必要冒这个风险。
 *
 * 防滥用：只允许 https、只放行 video / image / audio 三类响应，
 * 并拒绝回环/私网/裸 IP 目标，避免本函数被当成内网探测工具（SSRF）。
 */

/* 平台 → Referer（缺失或未知平台按抖音站点给，Step 26 主解析平台为抖音）
   Step 28 · 四：灾害预警的图标是政府官网图片，带上官网 Referer 提高兼容性
   Step 35 · 二：解析上游换成支持 50+ 平台的公益接口，补小红书站点；
   其余平台继续回落抖音（这两个站的 CDN 校验最严，回落值实测最稳） */
const REFERERS = {
  douyin: 'https://www.douyin.com/',
  kuaishou: 'https://www.kuaishou.com/',
  cneb: 'https://www.cneb.gov.cn/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  xhs: 'https://www.xiaohongshu.com/'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* 目标地址白名单：https + 公网主机名 */
function safeTarget(href) {
  let u;
  try { u = new URL(String(href || '')); } catch (_) { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return null;
  /* 裸 IP（含 IPv6 字面量）一律拒绝：正常素材域名不会长这样 */
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.indexOf(':') > -1) return null;
  /* 私网 / 链路本地段 */
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^127\./.test(h)) return null;
  /* 至少两级域名 */
  if (h.split('.').length < 2) return null;
  return u;
}

/* 只转发合法的 Range 头，避免把奇怪内容送进 fetch */
function rangeOf(request) {
  const r = request.headers.get('Range') || '';
  return /^bytes=\d*-\d*$/i.test(r) ? r : '';
}

function contentTypeAllowed(ct) {
  const c = String(ct || '').toLowerCase();
  return c.indexOf('video/') === 0 || c.indexOf('image/') === 0 || c.indexOf('audio/') === 0;
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = safeTarget(url.searchParams.get('url'));
  if (!target) return new Response('', { status: 400 });

  const platform = (url.searchParams.get('platform') || '').toLowerCase();
  const headers = {
    'User-Agent': UA,
    /* Step 26 · 二：未知 / 缺失平台回落到抖音站点，与文件头声明一致 */
    'Referer': REFERERS[platform] || REFERERS.douyin
  };
  const range = rangeOf(request);
  if (range) headers.Range = range;

  let r;
  try {
    r = await fetch(target.href, { headers: headers, redirect: 'follow' });
  } catch (_) {
    return new Response('', { status: 502 });
  }
  if (!r.ok && r.status !== 206) return new Response('', { status: r.status });

  const ct = r.headers.get('Content-Type') || '';
  if (!contentTypeAllowed(ct)) return new Response('', { status: 415 });

  const out = {
    'Content-Type': ct,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=600',
    /* 明确禁止其它站点嵌入复用 */
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Disposition': 'inline'
  };
  const cr = r.headers.get('Content-Range');
  if (cr) out['Content-Range'] = cr;

  return new Response(r.body, { status: r.status, headers: out });
}
