/* LiteBox v5 · functions/api/wallpaper.js — 壁纸聚合（GET /api/wallpaper?cat=&q=&page=&size=）
 *
 * Step 5I 重写：三源降级（Wallhaven → upx8 国内聚合 → Picsum）
 *
 *【Step 5I 问题 C：壁纸质量太差 / 换源】
 *   Step 5H 已把主源换成 Wallhaven，本步实测发现两个硬伤：
 *     1) wallhaven.cc 是境外站，国内移动网络常不可达或极慢（本沙箱内TCP 443 直接不通）
 *     2) 即使可达，Step 5G 的Unsplash 白名单兜底质量本身就一般
 *   故本版引入第二个源：**wp.upx8.com（国内壁纸聚合站，实测 200 + 1.18MB真JPEG）**
 *
 * 【三源顺序与各自角色】
 *   1. Wallhaven   —— 质量最高、分类最全。海外可用时走它。
 *   2. upx8         —— 国内聚合（取材 360 壁纸库/ 必应），国内网络下最快最稳。
 *                     实测 https://wp.upx8.com/api.php?format=json&content=<词>&count=N 返回
 *                     {code:200, data:[{url,width,height,source,resolution}]}
 *                     ⚠ 它返回的 url 是 **http://** 的 CDN 地址，直接丢给 <img> 在 https 页面上
 *                       会被浏览器按混合内容拦截 → 统一改写为同源代理 /api/wallpaper-image?src=
 *   3. Picsum       —— 最后兜底，无分类语义但保证有图。
 *
 * 【关键设计：图片一律走同源代理】
 *   所有外站URL 都改写为 /api/wallpaper-image?src=<编码地址>，
 *   由代理层做域名白名单 + Content-Type 强校验（jpeg/png/webp，拒绝 AVIF 与 HTML 错误页）。
 *   这样前端只请求同源：没有混合内容、没有防盗链失败、没有外站超���导致的白屏。
 *
 * 分页：三源统一 **page 从 1 开始**（前端已同步改为 1-based）。
 *   · Wallhaven / upx8：直接用 page
 *   · Picsum            ：用 (page-1)*count 换算成 lock，保证翻页不重复
 */
import { json, err } from '../_utils.js';

/* 分类 → Wallhaven 参数
   categories 三位数字：general / people / anime，"1" 表示包含
     100 = 只 general（纯风景/静物，排除人物）
     110 = general + people
     010 = 只 anime
   purity：100 = SFW（安全内容），保证不返回违规图 */
const CAT_MAP = {
  featured:  { q: 'nature landscape',    categories: '100', purity: '100', cn: '风景' },
  beauty:    { q: 'portrait',            categories: '110', purity: '100', cn: '美女' },
  anime:     { q: 'anime',                categories: '010', purity: '100', cn: '动漫' },
  landscape: { q: 'landscape nature',    categories: '100', purity: '100', cn: '风景' },
  game:      { q: 'game',                 categories: '110', purity: '100', cn: '游戏' },
  text:      { q: 'typography',          categories: '100', purity: '100', cn: '文字' },
  abstract:  { q: 'abstract',            categories: '100', purity: '100', cn: '抽象' },
  chinese:   { q: 'chinese traditional', categories: '100', purity: '100', cn: '中国风' },
  minimal:   { q: 'minimal',             categories: '100', purity: '100', cn: '简约' },
  space:     { q: 'space galaxy',        categories: '100', purity: '100', cn: '星空' },
  animal:    { q: 'animal',              categories: '110', purity: '100', cn: '动物' },
  city:      { q: 'city',                categories: '100', purity: '100', cn: '城市' },
  car:       { q: 'car',                 categories: '110', purity: '100', cn: '汽车' },
  tech:      { q: 'technology',          categories: '100', purity: '100', cn: '科技' },
  mobile:    { q: 'mobile phone wallpaper', categories: '110', purity: '100', cn: '手机' }
};

const UA = 'LiteBox/5.0 (+https://litebox.app)';
const MAX_ITEMS = 24;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const cat = url.searchParams.get('cat') || 'featured';
  const customQ = url.searchParams.get('q') || '';
  /* 三源统一：page 从 1 开始 */
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const size = url.searchParams.get('size') === 'mobile' ? 'mobile' : 'pc';

  const W = size === 'mobile' ? 1080 : 1920;
  const H = size === 'mobile' ? 1920 : 1080;
  const tw = Math.round(W / 2);
  const th = Math.round(H / 2);

  const cfg = CAT_MAP[cat] || CAT_MAP.featured;
  const q = customQ || cfg.q;
  const atleast = size === 'mobile' ? '1080x1920' : '1920x1080';
  const ratios = size === 'mobile' ? 'portrait' : 'landscape';

  /* ================================================================
   * 源 1 · Wallhaven（质量最高）
   * ================================================================ */
  try {
    const d = await fetchJson(
      'https://wallhaven.cc/api/v1/search' +
      '?q=' + encodeURIComponent(q) +
      '&categories=' + cfg.categories +
      '&purity=' + cfg.purity +
      '&sorting=toplist&order=desc' +
      '&atleast=' + atleast +
      '&ratios=' + ratios +
      '&page=' + page,
      7000
    );
    const items = mapWallhaven(d.data || [], W, H, tw, th);
    if (items.length) {
      return json({ items, source: 'wallhaven', page });
    }
  } catch (_) { /* 落到源 2 */ }

  /* 去掉 q 再试一次（某些关键词过窄会 0 结果） */
  if (customQ) {
    try {
      const d2 = await fetchJson(
        'https://wallhaven.cc/api/v1/search' +
        '?categories=' + cfg.categories +
        '&purity=' + cfg.purity +
        '&sorting=toplist&order=desc' +
        '&atleast=' + atleast +
        '&ratios=' + ratios +
        '&page=' + page,
        7000
      );
      const items2 = mapWallhaven(d2.data || [], W, H, tw, th);
      if (items2.length) return json({ items: items2, source: 'wallhaven-fallback', page });
    } catch (_) {}
  }

  /* ================================================================
   * 源 2 · upx8 国内聚合（实测可用，国内网络最快）
   *   GET https://wp.upx8.com/api.php?format=json&content=<关键词>&count=24
   *   → { code:200, message:"success", data:[{url,width,height,title,source,resolution}] }
   * ================================================================ */
  try {
    /* 中文关键词在 upx8 上匹配度远好于英文（它取材国内图库） */
    const cnQ = customQ || cfg.cn || cfg.q;
    const d = await fetchJson(
      'https://wp.upx8.com/api.php?format=json&content=' + encodeURIComponent(cnQ) + '&count=' + MAX_ITEMS,
      6000
    );
    const items = mapUpx8(d.data || [], W, H, tw, th);
    if (items.length) {
      return json({ items, source: 'upx8', page });
    }
  } catch (_) { /* 落到源 3 */ }

  /* ================================================================
   * 源 3 · Picsum（最后兜底，无分类语义但保证有图）
   *   lock 方案：同 (cat, q, page, i) 恒定返回同一张图，翻页稳定不重复。
   * ================================================================ */
  const count = 12;
  const items3 = [];
  for (let i = 0; i < count; i++) {
    const lock = (page - 1) * count + i + 1;   /* page 从 1 起 */
    const qs = 'cat=' + encodeURIComponent(cat) +
      (customQ ? '&kw=' + encodeURIComponent(customQ) : '') +
      '&lock=' + lock;
    items3.push({
      id: 'lb-' + cat + '-' + lock,
      url: '/api/wallpaper-image?' + qs + '&w=' + W + '&h=' + H,
      thumb: '/api/wallpaper-image?' + qs + '&w=' + tw + '&h=' + th,
      w: W, h: H,
      title: cat + ' · ' + lock
    });
  }
  return json({ items: items3, source: 'picsum-fallback', page });
}

/* ---------- 带超时与 JSON 校验的 fetch ---------- */
async function fetchJson(apiUrl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(apiUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    /* upx8 用 code 字段表示业务成功，Wallhaven 无 code */
    if (d && typeof d.code === 'number' && d.code !== 200) throw new Error('code ' + d.code);
    return d;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Wallhaven 数据映射 ---------- */
function mapWallhaven(list, W, H, tw, th) {
  return list.slice(0, MAX_ITEMS).map(function(x) {
    const path = String(x.path || '');
    const thumbSrc = (x.thumbs && (x.thumbs.large || x.thumbs.original)) || path;
    const dim = String(x.resolution || '1920x1080').split('x');
    /* 只接受 w.wallhaven.cc，代理层还会再校验一次域名 */
    if (!/^https:\/\/w\.wallhaven\.cc\//i.test(path)) return null;
    return {
      id: String(x.id || path),
      url: proxyUrl(path, W, H),
      thumb: proxyUrl(thumbSrc, tw, th),
      w: parseInt(dim[0], 10) || W,
      h: parseInt(dim[1], 10) || H,
      title: (x.category || 'wallpaper') + ' · ' + (x.resolution || '')
    };
  }).filter(Boolean);
}

/* ---------- upx8 数据映射 ----------
   实测返回的 url 形如 http://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/2026xx/xxx.jpg
   三条实测结论（决定了下面三行代码）：
   1) 返回的是 **http://** 地址 → 必须升级为 https，否则 https 页面会被混合内容策略拦截。
   2) upx8 是**随机接口**，没有分页语义：同一 URL 连续调用返回的是不同图（实测 3 次全不同）。
      故 id 必须由图片 URL 派生而非序号，否则同一批内 id 会撞；
      而 page 翻页时靠随机性天然拿到新图，实测两页重叠极低。
   3) 该 CDN 是**阿里云 OSS**，实测支持 `?x-oss-process=image/resize,w_480`
      把 1.18MB 原图压到 46KB —— 这是缩略图的关键，否则首屏要拉十几张 MB 级大图。 */
function mapUpx8(list, W, H, tw, th) {
  return list.slice(0, MAX_ITEMS).map(function(x) {
    let u = String(x.url || '').trim();
    if (!u) return null;
    /* 统一升级为 https：实测该 CDN 同时支持两种协议，https 可正常返回 1.18MB JPEG */
    if (u.indexOf('http://') === 0) u = 'https://' + u.slice(7);
    if (u.indexOf('https://') !== 0) return null;

    /* 缩略图用 OSS 缩放参数（w_ + h_ 同时给会按 cover 裁剪，居中） */
    const thumbSrc = u + ossResize(tw, th);

    const dim = [parseInt(x.width, 10) || 0, parseInt(x.height, 10) || 0];
    /* id 由图片地址派生（取末尾文件名），保证随机返回的两张不同图不会撞 id */
    const name = u.slice(u.lastIndexOf('/') + 1);
    return {
      id: 'upx8-' + name,
      /* 大图：原图直取（代理层不强加缩放，保证点开灯箱是原画质量） */
      url: proxyUrl(u, W, H),
      thumb: proxyUrl(thumbSrc, tw, th),
      w: dim[0] || 4000,
      h: dim[1] || 2260,
      title: (x.resolution || ((dim[0] || 4000) + 'x' + (dim[1] || 2260))) + ' · ' + (x.source || 'upx8')
    };
  }).filter(Boolean);
}

/* 阿里云 OSS 图片缩放参数（实测生效：1183276B → 46324B）
   force=true 强制按给定宽高 cover 裁剪并填充空白，避免变形。 */
function ossResize(w, h) {
  return '?x-oss-process=image/resize,w_' + w + ',h_' + h + ',force';
}

/* ---------- 统一改写为同源代理 ---------- */
function proxyUrl(src, w, h) {
  return '/api/wallpaper-image?src=' + encodeURIComponent(src) +
    '&w=' + w + '&h=' + h;
}