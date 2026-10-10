/* LiteBox v5 · functions/api/wallpaper.js — 壁纸聚合（GET /api/wallpaper?cat=&q=&page=&size=）
 *
 * Step 36 · 三：主源换为 4KDesk（api.sk89.cn 4k.php，4K 桌面站，用户指定为主源）：
 *   降级链：4KDesk（4K 高清，国内可达）→ upx8（国内聚合）→ Wallhaven（海外）→ Picsum（保底）
 *
 * 【4KDesk 接口实测（2026-10-09）】
 *   ① 推荐流：GET 4k.php（无参数）
 *      → { code:200, data:{ recommended:[{ id, title, url(详情页), resolution:"3840x2160", thumbnail }] } }
 *   ② 搜索流：GET 4k.php?action=search&keyword=<中文词>&page=<n>
 *      → { code:200, data:{ keyword, page, total, results:[同上结构] } }
 *   ③ 详情流：GET 4k.php?action=detail&url=<详情页>（⚠ 用 id= 会 500，必须 url=）
 *      → { code:200, data:{ title, image_url(大图), resolution:"3840x2160PX", tags[] } }
 *   列表接口只给 thumbnail（901×507 实测），大图要从详情流按需换 ——
 *   因此列表项透传 detail（详情页地址），前端灯箱打开时再调 detail 模式换原图。
 *
 * 【为什么 size=mobile 跳过 4KDesk】该站全是 16:9 桌面横图，竖屏手机全屏体验差，
 *   手机尺寸继续走 upx8 / Wallhaven（有 portrait 筛选）。
 *
 * 【detail 防SSRF】detail 参数只接受 https://www.4kdesk.com/ 域名的详情页，
 *   其它一律 400 —— 详情模式绝不能被当成任意 URL 抓取器。
 *
 * 【upx8 接口实测（2026-10 复测 category 形式）】
 *   GET https://wp.upx8.com/api.php?format=json&category=nature&count=10
 *   → { code:200, message:"success", count:10,
 *       data:[{ url, width:0, height:0, title:"", source:"birdpaper", resolution:"1920x1080" }] }
 *   三条必须处理的事实：
 *     1) url 是 **http://** 的 CDN 地址（cdn-hsyq-static.shanhutech.cn），
 *        https 页面上直连会被混合内容策略拦掉 → 统一升级 https 并改写为同源代理。
 *     2) width / height 实测恒为 0，尺寸信息只在 resolution 字符串里 → 用它兜底。
 *     3) title 实测恒为空字符串 → 退到 resolution，否则整屏卡片都叫"壁纸"。
 *
 * 【关键设计：图片一律走同源代理】
 *   所有外站 URL 都改写为 /api/wallpaper-image?src=<编码地址>，
 *   由代理层做域名白名单 + Content-Type 强校验（jpeg/png/webp，拒绝 AVIF 与 HTML 错误页）。
 *   这样前端只请求同源：没有混合内容、没有防盗链失败、没有外站超时导致的白屏。
 *
 * 分页：各源统一 **page 从 1 开始**（前端已同步为 1-based）。
 */
import { json } from '../_utils.js';

/* 分类 → Wallhaven 参数（源 3 使用）
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

/* upx8 的 category 取值（源 2 使用）。
   接口只认这几种英文类目，本项目的 15 个分类按语义就近映射；
   没命中的（文字 / 国风 / 简约 / 科技 / 手机）统一落到 nature。 */
const UPX8_CAT = {
  featured: 'nature', nature: 'nature', anime: 'anime',
  game: 'game', animal: 'animal', city: 'city',
  abstract: 'abstract', space: 'space', car: 'car',
  beauty: 'girl', sport: 'sport'
};

/* 4KDesk 搜索关键词微调（源 1 使用）：分类中文词直接可搜（总 3500+ 图），
   少数分类在站内命中太少的换近义词，实测结果更丰富 */
const D4K_KW = {
  featured: '风景',
  beauty: '美女',
  anime: '动漫',
  landscape: '风景',
  game: '游戏',
  text: '文字',
  abstract: '抽象',
  chinese: '中国风',
  minimal: '简约',
  space: '星空',
  animal: '动物',
  city: '城市',
  car: '汽车',
  tech: '科技'
};

const UA = 'LiteBox/5.0';
const MAX_ITEMS = 24;
const D4K_API = 'https://api.sk89.cn/api/4k.php';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const cat = url.searchParams.get('cat') || 'featured';
  const customQ = url.searchParams.get('q') || '';
  /* 各源统一：page 从 1 开始 */
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const size = url.searchParams.get('size') === 'mobile' ? 'mobile' : 'pc';
  /* Step 36 · 三：灯箱按需换大图模式 —— ?detail=<4kdesk 详情页>
     返回单条 items（前端拿到 items[0].url 替换灯箱 src） */
  const detail = url.searchParams.get('detail') || '';

  /* ================================================================
   * 灯箱大图模式 · 4KDesk 详情流（只放行本站详情页，防 SSRF）
   * ================================================================ */
  if (detail) {
    if (!/^https:\/\/www\.4kdesk\.com\/[\w\-./]+$/i.test(detail)) {
      return json({ items: [], source: 'desk4k-detail', page });
    }
    try {
      const d = await fetchJson(
        D4K_API + '?action=detail&url=' + encodeURIComponent(detail), 8000);
      const v = (d && d.data) || {};
      const big = String(v.image_url || '');
      if (!/^https:\/\/c\.53326\.com\//i.test(big)) {
        return json({ items: [], source: 'desk4k-detail', page });
      }
      const dim = String(v.resolution || '').replace(/PX/i, '').split('x');
      const one = {
        id: String(v.id || detail),
        url: proxyUrl(big),
        thumb: proxyUrl(big),
        w: parseInt(dim[0], 10) || 3840,
        h: parseInt(dim[1], 10) || 2160,
        title: String(v.title || ''),
        detail: detail
      };
      return json({ items: [one], source: 'desk4k-detail', page });
    } catch (_) {
      /* 详情流失败：返回空 items，前端保持列表给的缩略图地址不动 */
      return json({ items: [], source: 'desk4k-detail', page });
    }
  }

  const cfg = CAT_MAP[cat] || CAT_MAP.featured;
  const atleast = size === 'mobile' ? '1080x1920' : '1920x1080';
  const ratios = size === 'mobile' ? 'portrait' : 'landscape';

  /* ================================================================
   * 源 1 · 4KDesk（Step 36 · 三 提为主源；手机尺寸跳过，见文件头说明）
   * ================================================================ */
  if (size !== 'mobile') {
    try {
      const items = await tryDesk4k(cat, customQ, page);
      if (items.length) return json({ items, source: 'desk4k', page });
    } catch (_) { /* 落到源 2 */ }
  }

  /* ================================================================
   * 源 2 · upx8 国内聚合（Step 11 · B1 曾为主源）
   * ================================================================ */
  try {
    const items = await tryUpx8(cat, page, size);
    if (items.length) return json({ items, source: 'upx8', page });
  } catch (_) { /* 落到源 3 */ }

  /* ================================================================
   * 源 3 · Wallhaven（海外，质量最高）
   * ================================================================ */
  try {
    const d = await fetchJson(
      'https://wallhaven.cc/api/v1/search' +
      '?q=' + encodeURIComponent(customQ || cfg.q) +
      '&categories=' + cfg.categories +
      '&purity=' + cfg.purity +
      '&sorting=toplist&order=desc' +
      '&atleast=' + atleast +
      '&ratios=' + ratios +
      '&page=' + page,
      7000
    );
    const items = mapWallhaven(d.data || []);
    if (items.length) return json({ items, source: 'wallhaven', page });
  } catch (_) { /* 落到源 3b */ }

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
      const items2 = mapWallhaven(d2.data || []);
      if (items2.length) return json({ items: items2, source: 'wallhaven-fallback', page });
    } catch (_) {}
  }

  /* ================================================================
   * 源 4 · Picsum（最后兜底，无分类语义但保证有图）
   *   lock 方案：同 (cat, q, page, i) 恒定返回同一张图，翻页稳定不重复。
   * ================================================================ */
  const W = size === 'mobile' ? 1080 : 1920;
  const H = size === 'mobile' ? 1920 : 1080;
  const tw = Math.round(W / 2);
  const th = Math.round(H / 2);
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

/* ================================================================
 * 源 1 · 4KDesk（Step 36 · 三 提为主源）
 *   page=1 且 featured 且无自定义搜索词 → 推荐流（无参数，站方编辑推荐）
 *   其余 → 搜索流（keyword = 自定义词 || 分类中文词，page 翻页）
 *   列表只给 thumbnail（901×507），卡片够用；灯箱大图由前端拿 detail
 *   （详情页地址）再调 detail 模式按需换，见文件头「详情流」。
 * ================================================================ */
async function tryDesk4k(cat, q, page) {
  const useRecommend = page === 1 && cat === 'featured' && !q;
  const apiUrl = useRecommend
    ? D4K_API
    : D4K_API + '?action=search&keyword=' +
      encodeURIComponent(q || D4K_KW[cat] || '风景') + '&page=' + page;

  const d = await fetchJson(apiUrl, 8000);
  if (!d || d.code !== 200 || !d.data) throw new Error('desk4k code ' + (d && d.code));

  const list = useRecommend
    ? (d.data.recommended || [])
    : (d.data.results || []);

  return list.slice(0, MAX_ITEMS).map(function (x) {
    const thumb = String(x.thumbnail || '').trim();
    if (!/^https:\/\/c\.53326\.com\//i.test(thumb)) return null; /* 代理白名单内才可用 */
    const page0 = String(x.url || '');
    const dim = String(x.resolution || '').split('x');
    return {
      id: 'd4k-' + (x.id || page0),
      /* 灯箱初图与卡片先用缩略图（列表接口没有原图地址），打开灯箱后按需换 detail 大图 */
      url: proxyUrl(thumb),
      thumb: proxyUrl(thumb),
      w: parseInt(dim[0], 10) || 3840,
      h: parseInt(dim[1], 10) || 2160,
      title: String(x.title || '4K 壁纸'),
      /* 详情页地址透传给前端：openLightbox 拿它换 4K 原图 */
      detail: /^https:\/\/www\.4kdesk\.com\//i.test(page0) ? page0 : ''
    };
  }).filter(Boolean);
}

/* ================================================================
 * 源 2 · upx8
 *   GET https://wp.upx8.com/api.php?format=json&category=<类目>&count=10
 * ================================================================ */
async function tryUpx8(cat, page, size) {
  const category = UPX8_CAT[cat] || 'nature';
  const count = 10;
  const url = 'https://wp.upx8.com/api.php?format=json&category=' +
    encodeURIComponent(category) + '&count=' + count;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let d;
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LiteBox/5.0', 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error('upx8 HTTP ' + r.status);
    d = await r.json();
  } finally {
    clearTimeout(timer);
  }
  if (d && typeof d.code === 'number' && d.code !== 200) throw new Error('upx8 code ' + d.code);

  const W = size === 'mobile' ? 1080 : 1920;
  const H = size === 'mobile' ? 1920 : 1080;
  const tw = Math.round(W / 2);
  const th = Math.round(H / 2);

  return (d.data || []).map(function (x) {
    let u = String(x.url || '').trim();
    if (!u) return null;
    /* 1) 统一升级为 https：实测该 CDN 同时支持两种协议，https 可正常返回原图。
          不升级的话，https 页面里这些 http 图会被混合内容策略直接拦掉。 */
    if (u.indexOf('http://') === 0) u = 'https://' + u.slice(7);
    if (u.indexOf('https://') !== 0) return null;

    /* 2) 尺寸：width/height 实测恒为 0，退回 resolution 字符串（"1920x1080"） */
    const dim = String(x.resolution || '').split('x');
    const dw = parseInt(dim[0], 10) || x.width || 1920;
    const dh = parseInt(dim[1], 10) || x.height || 1080;

    /* 3) 缩略图走阿里云 OSS 缩放：原图约 1.18MB，压到 ~46KB 才能让首屏快起来 */
    const thumbSrc = u + ossResize(tw, th);

    return {
      id: 'upx8-' + Date.now() + '-' + Math.random(),
      /* 大图原图直取（代理层不强加缩放，点开灯箱是原画质量） */
      url: proxyUrl(u, W, H),
      thumb: proxyUrl(thumbSrc, tw, th),
      w: dw,
      h: dh,
      /* 任务书写的是 x.title || '壁纸'；实测该接口 title 恒为空，
         全部卡片会显示成同一个词，故在 title 为空时退到 resolution。 */
      title: x.title || x.resolution || '壁纸'
    };
  }).filter(Boolean);
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
function mapWallhaven(list) {
  return list.slice(0, MAX_ITEMS).map(function (x) {
    const path = String(x.path || '');
    const thumbSrc = (x.thumbs && (x.thumbs.large || x.thumbs.original)) || path;
    const dim = String(x.resolution || '1920x1080').split('x');
    /* 只接受 w.wallhaven.cc，代理层还会再校验一次域名 */
    if (!/^https:\/\/w\.wallhaven\.cc\//i.test(path)) return null;
    return {
      id: String(x.id || path),
      url: proxyUrl(path, 1920, 1080),
      thumb: proxyUrl(thumbSrc, 960, 540),
      w: parseInt(dim[0], 10) || 1920,
      h: parseInt(dim[1], 10) || 1080,
      title: (x.category || 'wallpaper') + ' · ' + (x.resolution || '')
    };
  }).filter(Boolean);
}

/* 阿里云 OSS 图片缩放参数（实测生效：1183276B → 46324B）
   force=true 强制按给定宽高 cover 裁剪并填充空白，避免变形。 */
function ossResize(w, h) {
  return '?x-oss-process=image/resize,w_' + w + ',h_' + h + ',force';
}

/* ---------- 统一改写为同源代理 ----------
   w/h 只作为「这张 src 拉取失败时，代理层兜底图」的尺寸依据，
   代理取 src 时一律原图直取（upx8 / Wallhaven 的 CDN 都不支持缩放参数）。 */
function proxyUrl(src, w, h) {
  return '/api/wallpaper-image?src=' + encodeURIComponent(src) +
    (w ? '&w=' + w + '&h=' + h : '');
}
