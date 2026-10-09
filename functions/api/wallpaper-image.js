/* LiteBox v5 · functions/api/wallpaper.js — 壁纸图片代理（Step 5G 新增 / Step 5H 扩展）
 *
 * 为什么需要代理：
 *   1) loremflickr 已彻底失效——实测任何 URL 形式都返回 HTTP 401 + HTML 页面（89KB HTML，非图片），
 *      Step 5D-2 换的"主源"实际上一直不可用，这是壁纸只显示灰黑占位图的直接原因。
 *   2) source.unsplash.com/random 实测 503，也不可用。
 *   3) images.unsplash.com 直链与 picsum.photos 实测可用（HTTP 200 + 合法 JPEG），
 *      但国内直连不稳定，故统一由本代理转发，前端只请求同源 /api/wallpaper-image。
 *
 * Step 5H 新增 ·两种取图模式：
 *   A) ?src=<编码后的 Wallhaven 图片地址>  → Wallhaven 高清壁纸（主源）
 *      src 参数只接受 w.wallhaven.cc 单一域名的 https 地址（白名单），
 *      防止本代理被当作任意 URL 抓取器（SSRF）。
 *   B) ?cat=&kw=&lock=&w=&h=（无 src）      → Step 5G 的 Unsplash 分类白名单（兜底）
 *      Unsplash 失败再退 Picsum。
 *
 * 所有模式都经过同一道 tryFetch 强校验：Content-Type 必须是 jpeg/png/webp，
 * 否则视为失败（AVIF 会被拒——微信 X5 与旧 iOS WebView 不支持）。
 *
 * 缓存：命中上游缓存头则透传，其余按参数做 1 天强缓存。
 */

import { err } from '../_utils.js';

/* Step 5I 扩展：src 参数唯一允许的域名白名单（防 SSRF）
   —— 只允许这三个壁纸源的图片 CDN，不接受任意 URL，
      本代理绝不能被当成"任意 URL 抓取器"使用。

   ⚠ upx8 的 CDN 实测有**两个**域名（2026-10实测 7 个分类共 168 张全覆盖）：
       cdn-hsyq-static.shanhutech.cn        主站
       cdn-hsyq-static-bak.shanhutech.cn   备份站（upx8 会随机下发，只列主站会整类 400）
     这里精确枚举而非用后缀通配，避免把 *.shanhutech.cn 整片域放开。 */
const ALLOW_HOSTS = [
  'w.wallhaven.cc',                          /* 源 1 · Wallhaven 图片 CDN */
  'cdn-hsyq-static.shanhutech.cn',           /* 源 2 · upx8 主站*/
  'cdn-hsyq-static-bak.shanhutech.cn',      /* 源 2 · upx8 备份站 */
  'picsum.photos'                            /* 源 3 · Picsum */
];

/* 精确匹配（小写比较），不解析端口 —— 端口变化视为不同主机 */
function hostAllowed(host) {
  const h = String(host || '').toLowerCase();
  for (let i = 0; i < ALLOW_HOSTS.length; i++) {
    if (h === ALLOW_HOSTS[i]) return true;
  }
  return false;
}

/* 分类 → Unsplash 图片 ID 白名单（每类若干张，实测全部 200）
   同一分类内用 lock 取模轮换，翻页不重复。 */
const CAT_UNSPLASH = {
  featured: [
    'photo-1500530855697-b586d89ba3ee',
    'photo-1441974231531-c6227db76b6e',
    'photo-1470770841072-f978cf4d019e',
    'photo-1493246507139-91e8fad9978e'
  ],
  beauty: [
    'photo-1494790108377-be9c29b29330',
    'photo-1517841905240-472988babdf9',
    'photo-1534528741775-53994a69daeb',
    'photo-1524504388940-b1c1722653e1'
  ],
  anime: [
    'photo-1578632767115-351597cf2477',
    'photo-1614728263952-84ea256f9679',
    'photo-1607602132700-068258431c6c',
    'photo-1561214115-f2f134cc4912'
  ],
  landscape: [
    'photo-1506744038136-46273834b3fb',
    'photo-1433086966358-54859d0ed716',
    'photo-1470071459604-3b5ec3a7fe05',
    'photo-1426604966848-d7adac402bff'
  ],
  game: [
    'photo-1511512578047-dfb367046420',
    'photo-1493711662062-fa541adb3fc8',
    'photo-1550745165-9bc0b252726f',
    'photo-1538481199705-c710c4e965fc'
  ],
  text: [
    'photo-1503676260728-1c00da094a0b',
    'photo-1455390582262-044cdead277a',
    'photo-1484480974693-6ca0a78fb36b',
    'photo-1456324504439-367cee3b3c32'
  ],
  abstract: [
    'photo-1550859492-d5da9d8e45f3',
    'photo-1557682250-33bd709cbe85',
    'photo-1541701494587-cb58502866ab',
    'photo-1550747528-cdb45925b3f7'
  ],
  chinese: [
    'photo-1508804185872-d7badad00f7d',
    'photo-1528164344705-47542687000d',
    'photo-1547981609-4b6bfe67ca0b',
    'photo-1531983412531-1f49a365ffed'
  ],
  minimal: [
    'photo-1497215728101-856f4ea42174',
    'photo-1513694203232-719a280e022f',
    'photo-1494438639946-1ebd1d20bf85',
    'photo-1517971129774-8a2b38fa128e'
  ],
  space: [
    'photo-1419242902214-272b3f66ee7a',
    'photo-1444703686981-a3abbc4d4fe3',
    'photo-1462331940025-496dfbfc7564',
    'photo-1502134249126-9f3755a50d78'
  ],
  animal: [
    'photo-1425082661705-1834bfd09dca',
    'photo-1560807707-8cc77767d783',
    'photo-1546182990-dffeafbe841d',
    'photo-1474511320723-9a56873867b5'
  ],
  city: [
    'photo-1449824913935-59a10b8d2000',
    'photo-1477959858617-67f85cf4f1df',
    'photo-1480714378408-67cf0d13bc1b',
    'photo-1444723121867-7a241cacace9'
  ],
  car: [
    'photo-1503376780353-7e6692767b70',
    'photo-1494976388531-d1058494cdd8',
    'photo-1553440569-bcc63803a83d',
    'photo-1502877338535-766e1452684a'
  ],
  tech: [
    'photo-1518770660439-4636190af475',
    'photo-1526374965328-7f61d4dc18c5',
    'photo-1550751827-4bd374c3f58b',
    'photo-1526374965328-7f61d4dc18c5'
  ],
  mobile: [
    'photo-1511707171634-5f897ff02aa9',
    'photo-1512941937669-90a1b58e7e9c',
    'photo-1512446816042-444d641267d4',
    'photo-1491933382434-500287f9b54b'
  ]
};

/* 搜索词 → 分类猜测（q 参数优先于 cat） */
const KW_CAT = {
  nature: 'landscape', landscape: 'landscape', mountain: 'landscape', forest: 'landscape',
  beauty: 'beauty', portrait: 'beauty', girl: 'beauty', woman: 'beauty', man: 'beauty',
  anime: 'anime', manga: 'anime', cartoon: 'anime',
  game: 'game', gaming: 'game',
  text: 'text', typography: 'text', quote: 'text',
  abstract: 'abstract', texture: 'abstract', gradient: 'abstract',
  china: 'chinese', chinese: 'chinese', traditional: 'chinese',
  minimal: 'minimal', simple: 'minimal', white: 'minimal',
  space: 'space', galaxy: 'space', star: 'space', universe: 'space',
  animal: 'animal', wildlife: 'animal', cat: 'animal', dog: 'animal', bird: 'animal',
  city: 'city', urban: 'city', street: 'city', night: 'city',
  car: 'car', auto: 'car', vehicle: 'car',
  tech: 'tech', technology: 'tech', computer: 'tech', code: 'tech'
};

function guessCat(cat, q) {
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    for (const k of Object.keys(KW_CAT)) {
      if (kw.includes(k)) return KW_CAT[k];
    }
  }
  return CAT_UNSPLASH[cat] ? cat : 'featured';
}

/* Picsum 的 seed：同 seed 恒定返回同一图，保证翻页稳定 */
function picsumSeed(cat, q, lock) {
  return encodeURIComponent('lb-' + (q ? q + '-' : '') + cat + '-' + lock);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  const kw = url.searchParams.get('kw') || '';
  const cat = url.searchParams.get('cat') || 'featured';
  const lock = Math.max(1, parseInt(url.searchParams.get('lock') || '1', 10) || 1);
  const w = Math.min(2400, Math.max(64, parseInt(url.searchParams.get('w') || '1080', 10) || 1080));
  const h = Math.min(2400, Math.max(64, parseInt(url.searchParams.get('h') || '1080', 10) || 1080));
  const src = url.searchParams.get('src') || '';

  const UA = 'LiteBox/5.0 (+https://litebox.app)';

  /* ================================================================
   * 模式 A · 外站图片代理（Step 5I：Wallhaven / upx8 / Picsum 共用）
   * ================================================================ */
  if (src) {
    /* 白名单校验：必须是 https + 允许的域名，否则直接拒绝。
       这是本代理不被滥用于任意 URL 抓取的关键。 */
    let target;
    try { target = new URL(src); } catch (_) { return err('非法图片地址', 400); }
    if (target.protocol !== 'https:' || !hostAllowed(target.hostname)) {
      return err('图片域名不被允许', 400);
    }

    const got = await tryFetch(target.href, UA, 10000, w, h);
    if (got) return imageResponse(got, request, 86400);

    /* 这张图挂了 → 退到 Unsplash 分类白名单，保证卡片不是空白 */
    return fallbackUnsplash(cat, kw, lock, w, h, request, UA);
  }

  /* ================================================================
   * 模式 B · 无 src：Unsplash 分类白名单（Step 5G 兜底链）
   * ================================================================ */
  return fallbackUnsplash(cat, kw, lock, w, h, request, UA);
}

/* Unsplash 分类白名单 → Picsum，两级降级 */
async function fallbackUnsplash(cat, kw, lock, w, h, request, UA) {
  /* fm=jpg 强制 JPEG：实测不加时上游按 Accept 协商返回 AVIF，
     而微信 X5 / 旧 iOS WebView 不支持 AVIF，会再次变成"加载不出来"。 */
  const c = guessCat(cat, kw);
  const pool = CAT_UNSPLASH[c] || CAT_UNSPLASH.featured;
  const id = pool[(lock - 1) % pool.length];
  const unsplashUrl =
    'https://images.unsplash.com/' + id +
    '?auto=format&fm=jpg&fit=crop&w=' + w + '&h=' + h + '&q=80';

  const got = await tryFetch(unsplashUrl, UA, 6000);
  if (got) return imageResponse(got, request, 86400);

  /* ---- Picsum 兜底（无分类语义，但保证有图） ---- */
  const picsumUrl = 'https://picsum.photos/seed/' + picsumSeed(c, kw, lock) + '/' + w + '/' + h;
  const got2 = await tryFetch(picsumUrl, UA, 8000);
  if (got2) return imageResponse(got2, request, 3600);

  return err('所有壁纸源均不可用，请稍后重试', 502);
}

/* 拉取并校验确实是图片（避免把 401 的 HTML 页面当图片返回，那正是旧 bug 的表现）
   w/h：仅对「支持缩放参数的源」生效——
     · picsum.photos/seed/<s>/<w>/<h> 本身就是路径参数（原有逻辑）
     · images.unsplash.com/?w=&h=    本身就是 query 参数（原有逻辑）
     · upx8 的 shanhutech CDN **不带任何缩放参数**，只能原图直取；
       故传null 时不追加任何参数，实测该 CDN 直接返回原图（1.18MB JPEG）。
     · w.wallhaven.cc/full/wa/ha/xxx.jpg 同理，原图直取。 */
async function tryFetch(target, ua, timeoutMs, resizeW, resizeH) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(target, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': ua, 'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*' }
    });
    clearTimeout(timer);
    if (!r.ok) return null;

    /* 关键校验：Content-Type 必须是图片，否则上游（如已失效的 loremflickr）返回的
       HTML 错误页会被当成图片发出，前端就会一直显示灰黑占位图。 */
    const ct = (r.headers.get('Content-Type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return null;

    /* 只接受 JPEG / PNG / WebP：AVIF 虽属 image/*，但微信 X5 与旧 iOS WebView 不支持，
       强行下发会再次表现为"图片加载不出来"，故在此降级到下一源。 */
    if (!/image\/(jpeg|png|webp)/.test(ct)) return null;

    const buf = await r.arrayBuffer();
    /* 体积过小的多半是 1x1 占位或错误响应 */
    if (!buf || buf.byteLength < 1024) return null;

    return { buf, ct };
  } catch (_) {
    clearTimeout(timer);
    return null;
  }
}

function imageResponse(got, request, maxAge) {
  /* 图片是不可变资源（url 含 lock 决定内容），可长缓存 */
  return new Response(got.buf, {
    status: 200,
    headers: {
      'Content-Type': got.ct,
      'Cache-Control': 'public, max-age=' + maxAge,
      'Access-Control-Allow-Origin': '*',
      'X-LiteBox-Source': got.ct
    }
  });
}
