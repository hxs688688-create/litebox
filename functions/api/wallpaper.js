/* LiteBox v5 · functions/api/wallpaper.js — 壁纸聚合（GET /api/wallpaper?cat=&q=&page=&size=）
 *
 * Step 11 · B1：主源换为 wp.upx8.com
 *   降级链：upx8（国内聚合，最快最稳）→ Wallhaven（海外，质量高）→ Picsum（保底有图）
 *
 * 【为什么 upx8 提为主源】
 *   Wallhaven 是境外站，国内移动网络常不可达或极慢；upx8 取材国内图库，
 *   国内网络下首字节明显更快。海外用户走不到源 1 时会自动落到 Wallhaven。
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
 * 分页：三源统一 **page 从 1 开始**（前端已同步为 1-based）。
 */
import { json } from '../_utils.js';

/* 分类 → Wallhaven 参数（源 2 使用）
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

/* upx8 的 category 取值（源 1 使用）。
   接口只认这几种英文类目，本项目的 15 个分类按语义就近映射；
   没命中的（文字 / 国风 / 简约 / 科技 / 手机）统一落到 nature。 */
const UPX8_CAT = {
  featured: 'nature', nature: 'nature', anime: 'anime',
  game: 'game', animal: 'animal', city: 'city',
  abstract: 'abstract', space: 'space', car: 'car',
  beauty: 'girl', sport: 'sport'
};

const UA = 'LiteBox/5.0';
const MAX_ITEMS = 24;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const cat = url.searchParams.get('cat') || 'featured';
  const customQ = url.searchParams.get('q') || '';
  /* 三源统一：page 从 1 开始 */
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const size = url.searchParams.get('size') === 'mobile' ? 'mobile' : 'pc';

  const cfg = CAT_MAP[cat] || CAT_MAP.featured;
  const atleast = size === 'mobile' ? '1080x1920' : '1920x1080';
  const ratios = size === 'mobile' ? 'portrait' : 'landscape';

  /* ================================================================
   * 源 1 · upx8 国内聚合（Step 11 · B1 提为主源）
   * ================================================================ */
  try {
    const items = await tryUpx8(cat, page, size);
    if (items.length) return json({ items, source: 'upx8', page });
  } catch (_) { /* 落到源 2 */ }

  /* ================================================================
   * 源 2 · Wallhaven（海外，质量最高）
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
  } catch (_) { /* 落到源 2b */ }

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
   * 源 3 · Picsum（最后兜底，无分类语义但保证有图）
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
 * 源 1 · upx8
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
