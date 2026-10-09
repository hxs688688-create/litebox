/* LiteBox v5 · functions/api/shortvideo.js — 聚合解析（GET / POST /api/shortvideo）
 *
 * Step 35.1 · 按「上游真实成功响应」重写字段映射（Step 35 按千寻文档示例对接，
 *   但文档示例与实际服务返回**不一致**，线上只出标题 —— 用户实测抓到）。
 *
 * 【上游是谁】千寻 dypro 底层是开源项目 ucmao/media-parser（失败响应的 _tip 自报
 *   家门），真实成功结构（2026-10-09 实测 v.douyin.com 短链 + 开源 README 双重印证）：
 *   {"retcode":200,"retdesc":"成功","succ":true,"data":{
 *     video_id, platform:"抖音"(中文名), title, desc,
 *     video_url, video_list[](仅多视频), audio_url, cover_url,
 *     author:{nickname, author_id, avatar},
 *     image_list[](字符串 或 {url, live_photo_url}), subtitles[]}}
 *   注意：成功响应**没有顶层 code 字段**、没有 statistics / hashtags / extra /
 *   music 对象 / type 字段 —— 上一轮映射的 data.url / author.name / extra.* 全部
 *   落空，这就是「只出标题、匿名作者、没有视频」的根因。
 *
 * 【新字段 → 前端契约映射】前端 tools/shortvideo.js 零改动：
 *   data.video_url            → playUrl（无水印主链接，走同源代理）
 *   data.image_list           → images（字符串取自身；实况对象取 .url 封面帧，
 *                               live_photo_url 实况视频前端无渲染位，丢弃）
 *   data.cover_url            → cover
 *   data.author.nickname/id/avatar → author 三件套（id 用 author_id）
 *   data.audio_url            → music.url（上游只给纯音频地址，无标题/封面，
 *                               前端 musicHtml 对空标题自动显示「背景音乐」）
 *   data.video_id             → workId；author_id → authorExt.douyinId
 *   真实结构没有统计数据 / 话题标签 / share_url：stats 全 0（前端自动隐藏统计区）、
 *   tags 空数组、sourceUrl 用用户解析的那条分享链接（https 时）。
 *
 * 【判定与容错】成功 = data 存在且 (succ===true 或 retcode/code===200)；
 *   视频优先：video_url 有值即视频（真实结构无 type 字段，不再依赖它）；
 *   兼容旧文档字段（url/cover/images/extra）作为兜底候选，防接口方再改回示例结构。
 *
 * 【素材域名红线】封面 / 头像 / 图集 / 视频 / 音频统一转 /api/shortvideo-proxy
 *   同源代理；platform 传代理挑 Referer —— 上游 platform 是中文名（「抖音」），
 *   先过 PLAT_ALIAS 转英文键，未收录平台回落 douyin；响应 JSON 除 sourceUrl 外
 *   零第三方 CDN。
 *
 * 【报错文案】上游 retdesc 属纯用户引导（无链接/密钥字样且 ≤80 字）时透传界面，
 *   否则退回笼统文案 —— 不返回上游原始调试信息（安全策略第 3 条）。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.lvxiaodong.com/api/dypro';
const MAX_INPUT = 1200;

/* 上游 platform 中文名 → shortvideo-proxy 的 Referer 键 */
const PLAT_ALIAS = {
  '抖音': 'douyin', 'douyin': 'douyin',
  '快手': 'kuaishou', 'kuaishou': 'kuaishou',
  '小红书': 'xiaohongshu', 'xhs': 'xiaohongshu',
  '中国教育电视台': 'cneb', 'cneb': 'cneb'
};

/* 第三方资源 → 同源代理地址（只接受 https）；platform 帮代理挑对 Referer */
function viaProxy(u, platform) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s) +
    (platform ? '&platform=' + encodeURIComponent(platform) : '');
}

/* 上游失败文案：像「提取媒体内容失败，请检查链接或稍后重试」这种纯用户引导可以透传；
 * 一旦出现链接 / 密钥 / 签名等字样或超长，退回笼统文案，不透出原始调试信息 */
function friendlyMsg(desc) {
  const s = String(desc || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 80) return '';
  if (/https?:\/\/|api|key|token|sign|secret|ip[=:：\s]/i.test(s)) return '';
  return s;
}

/* image_list 元素两种形态：字符串（普通图集）/ {url, live_photo_url}（实况图，
 * url 是封面帧、live_photo_url 是实况视频——前端无实况渲染位，取封面帧即可） */
function imageList(v) {
  const raw = Array.isArray(v.image_list) ? v.image_list
    : Array.isArray(v.images) ? v.images : [];   /* 旧文档示例字段兜底 */
  return raw.map(x => {
    if (typeof x === 'string') return viaProxy(x, v.__plat);
    if (x && typeof x === 'object' && x.url) return viaProxy(x.url, v.__plat);
    return '';
  }).filter(Boolean);
}

/* 字段候选表：真实结构优先，旧文档示例字段兜底（防接口方在两种结构间摇摆） */
function firstOf(obj, keys) {
  for (const k of keys) {
    const val = obj ? obj[k] : '';
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return '';
}

function statNum(v) {
  const n = Number(v);
  return isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export async function onRequest({ request }) {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') return err('只支持 GET / POST', 405);

  let rawUrl = '';
  if (method === 'GET') {
    rawUrl = new URL(request.url).searchParams.get('url') || '';
  } else {
    const body = await request.json().catch(() => ({}));
    rawUrl = body.url || '';
  }
  rawUrl = String(rawUrl).trim();
  if (!rawUrl) return err('请粘贴分享链接', 400);
  if (rawUrl.length > MAX_INPUT) return err('粘贴内容过长，只保留分享链接那一段再试', 400);

  /* dypro 收整段分享文本也能自己挑出链接，但仍传首个 URL，口径与旧版一致 */
  const m = rawUrl.match(/https?:\/\/[^\s，,、"'<>]+/i);
  const target = m ? m[0] : rawUrl;

  /* 实测解析耗时数秒（要拉作品元数据），上游预算 15s */
  let d = null;
  try {
    d = await fetchJSON(API + '?url=' + encodeURIComponent(target), 15000, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://api.lvxiaodong.com/'
      }
    });
  } catch (_) {
    return err('解析服务暂时不可用', 502);
  }

  /* 成功判定（兼容三种包裹形态）：
   *   真实：{"retcode":200,"succ":true,"data":{…}}   ← 无 code 字段
   *   文档：{"code":200,"msg":"解析成功","data":{…}}  ← 兜底 */
  const v = (d && d.data && typeof d.data === 'object') ? d.data : null;
  const ok = v && (d.succ === true || Number(d.retcode) === 200 || Number(d.code) === 200);
  if (!ok) {
    console.warn('[shortvideo] upstream failed:',
      d && (d.error_code || d.retcode || d.code),
      String((d && (d.retdesc || d.msg)) || '').slice(0, 80));
    return err(friendlyMsg(d && (d.retdesc || d.msg)) || '解析失败，请检查链接是否有效', 502);
  }

  const platRaw = String(firstOf(v, ['platform']) || d.platform || '');
  const plat = PLAT_ALIAS[platRaw] || PLAT_ALIAS[platRaw.toLowerCase()] || 'douyin';
  v.__plat = plat; /* imageList() 里复用 */

  const who = (v.author && typeof v.author === 'object') ? v.author : {};
  const music = (v.music && typeof v.music === 'object') ? v.music : {};
  const ext = (v.extra && typeof v.extra === 'object') ? v.extra : {};
  const stats = (ext.statistics && typeof ext.statistics === 'object') ? ext.statistics : {};

  const images = imageList(v);

  /* 视频：video_url（真实）→ url（旧文档兜底）；有视频地址一律视频优先 */
  const mainUrl = String(firstOf(v, ['video_url', 'url', 'play_url']) || '');
  const playUrl = mainUrl ? viaProxy(mainUrl, plat) : '';

  /* 音乐：真实结构只有纯地址 audio_url；旧文档 music{} 对象兜底 */
  const musicUrl = String(firstOf(v, ['audio_url']) || music.url || '');

  /* 原作品页：真实结构没有 share_url，用用户解析的那条分享链接（仅 https）；
     它是给「🔗 原链接」按钮用的目标，不是素材，允许是站外绝对地址 */
  const shareRaw = String(ext.share_url || '');
  const sourceUrl = /^https:\/\//i.test(shareRaw) ? shareRaw
    : (/^https:\/\//i.test(target) ? target : '');

  return json({
    contentType: !playUrl && images.length ? '图集' : '视频',
    title: String(firstOf(v, ['title', 'desc']) || ''),
    author: {
      nickname: String(firstOf(who, ['nickname', 'name']) || ''),
      avatar: viaProxy(who.avatar, plat),
      id: String(firstOf(who, ['author_id', 'id']) || '')
    },
    cover: viaProxy(firstOf(v, ['cover_url', 'cover']), plat),
    images: images,
    playUrl: playUrl,
    music: {
      title: String(music.title || ''),
      author: String(music.author || ''),
      url: viaProxy(musicUrl, plat),
      cover: viaProxy(music.cover, plat)
    },
    workId: String(firstOf(v, ['video_id', 'aweme_id']) || ext.aweme_id || ''),
    publishTime: String(ext.create_time || ''),
    sourceUrl: sourceUrl,
    /* 真实结构无统计数据：全 0，前端 statsHtml 会自动整块隐藏 */
    stats: {
      likes: statNum(stats.digg_count),
      comments: statNum(stats.comment_count),
      collects: statNum(stats.collect_count),
      shares: statNum(stats.share_count),
      plays: statNum(stats.play_count)
    },
    tags: tagList(ext.hashtags).slice(0, 12),
    authorExt: {
      douyinId: String(firstOf(who, ['author_id', 'id']) || ''),
      signature: '',
      fans: 0,
      likes: 0
    }
  });
}

/* {name} / [{name}] 两种形态统一成字符串数组（容错字符串数组） */
function tagList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => String((x && x.name) || x || '').replace(/^#/, '').trim()).filter(Boolean);
}
