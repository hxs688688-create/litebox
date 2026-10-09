/* LiteBox v5 · functions/api/shortvideo.js — 聚合解析（GET / POST /api/shortvideo）
 *
 * Step 36 · 一：升级为「主备双通道」，一个失效可自动切另一个（用户需求）：
 *   主通道 fetchQx —— 千寻 dypro（免密钥，50+ 平台）；
 *   备通道 fetchSk89 —— 月下独酌 jhjx.php（需密钥，抖音/快手/小红书/B站/微博/
 *     今日头条/皮皮搞笑/皮皮虾/最右 9 平台），密钥只从 env.SK89_KEY 读，
 *     未配置时自动跳过（不报「未配置」错误，静默按单通道运行）。
 *   调度：?via=main 只走主通道 / ?via=backup 只走备通道 / 缺省 auto（主→备）。
 *
 * 【主通道真实结构】dypro 底层是开源项目 ucmao/media-parser（失败响应 _tip 自报
 *   家门），真实成功结构（2026-10-09 实测 v.douyin.com 短链 + 开源 README 双重印证）：
 *   {"retcode":200,"retdesc":"成功","succ":true,"data":{
 *     video_id, platform:"抖音"(中文名), title, desc,
 *     video_url, video_list[](仅多视频), audio_url, cover_url,
 *     author:{nickname, author_id, avatar},
 *     image_list[](字符串 或 {url, live_photo_url}), subtitles[]}}
 *   注意：成功响应**没有顶层 code 字段**、没有 statistics / hashtags / extra /
 *   music 对象 / type 字段 —— Step 35 首版按文档示例映射的 data.url / author.name /
 *   extra.* 全部落空，这就是「只出标题、匿名作者、没有视频」的根因（用户实测抓到）。
 *
 * 【备通道映射策略】sk89 成功响应暂无法实测（密钥由用户自行申请配置），
 *   按聚合类接口惯例做**宽容映射**：能从响应里挖出视频地址或图集即算成功，
 *   字段名按 video_url/url/play_url、images/image_list、cover/cover_url、
 *   author.name/nickname 等主流命名逐一尝试 —— 与下方主通道的旧文档兜底同一思路。
 *
 * 【新字段 → 前端契约映射】前端 tools/shortvideo.js 零改动：
 *   data.video_url            → playUrl（无水印主链接，走同源代理）
 *   data.image_list           → images（字符串取自身；实况对象取 .url 封面帧）
 *   data.cover_url            → cover
 *   data.author.nickname/id/avatar → author 三件套
 *   data.audio_url            → music.url（上游只给纯音频地址，前端自动显示「背景音乐」）
 *   data.video_id             → workId；author_id → authorExt.douyinId
 *   真实结构没有统计数据 / 话题标签：stats 全 0（前端自动隐藏统计区）、tags 空数组、
 *   sourceUrl 用用户解析的那条分享链接（https 时）。
 *
 * 【平台判定】备通道上游不给 platform 字段，从分享链接域名推断（guessPlat）；
 *   主通道 platform 是中文名，先过 PLAT_ALIAS 转代理 Referer 键。
 *   响应 JSON 除 sourceUrl 外零第三方 CDN（素材全部走 /api/shortvideo-proxy）。
 *
 * 【报错文案】上游 retdesc/message 属纯用户引导（无链接/密钥字样且 ≤80 字）时透传，
 *   否则退回笼统文案 —— 不返回上游原始调试信息（安全策略第 3 条）。
 */
import { json, err, fetchJSON } from '../_utils.js';

const QX_API = 'https://api.lvxiaodong.com/api/dypro';
const SK89_API = 'https://api.sk89.cn/api/jhjx.php';
const MAX_INPUT = 1200;

/* 上游 platform 名 → shortvideo-proxy 的 Referer 键（中文 / 英文都收） */
const PLAT_ALIAS = {
  '抖音': 'douyin', 'douyin': 'douyin',
  '快手': 'kuaishou', 'kuaishou': 'kuaishou',
  '小红书': 'xiaohongshu', 'xhs': 'xiaohongshu', 'xiaohongshu': 'xiaohongshu',
  '中国教育电视台': 'cneb', 'cneb': 'cneb',
  '哔哩哔哩': 'bilibili', 'b站': 'bilibili', 'bilibili': 'bilibili',
  '微博': 'weibo', 'weibo': 'weibo',
  '今日头条': 'toutiao', 'toutiao': 'toutiao',
  '皮皮搞笑': 'pipigx', '皮皮虾': 'pipixia', '最右': 'zuiyou'
};

/* 从分享链接域名推断平台（备通道用；猜不出回落 douyin，与 Step 26 口径一致） */
function guessPlat(target) {
  const s = String(target || '').toLowerCase();
  if (/douyin\.com|iesdouyin\.com/.test(s)) return 'douyin';
  if (/kuaishou\.com|ksapp\.com|chenzhongtech/.test(s)) return 'kuaishou';
  if (/xiaohongshu\.com|xhslink\.com/.test(s)) return 'xiaohongshu';
  if (/bilibili\.com|b23\.tv/.test(s)) return 'bilibili';
  if (/weibo\.com|weibo\.cn/.test(s)) return 'weibo';
  if (/toutiao\.com/.test(s)) return 'toutiao';
  return 'douyin';
}

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
function imageList(v, plat) {
  const raw = Array.isArray(v.image_list) ? v.image_list
    : Array.isArray(v.images) ? v.images : [];   /* 旧文档示例字段兜底 */
  return raw.map(x => {
    if (typeof x === 'string') return viaProxy(x, plat);
    if (x && typeof x === 'object' && x.url) return viaProxy(x.url, plat);
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

/* {name} / [{name}] 两种形态统一成字符串数组（容错字符串数组） */
function tagList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => String((x && x.name) || x || '').replace(/^#/, '').trim()).filter(Boolean);
}

/* ================================================================
 * 主通道 · 千寻 dypro
 * 成功 → { data: 前端契约 JSON }；失败 → null（原因写日志，交备通道兜底）
 * ================================================================ */
async function fetchQx(target) {
  /* 实测解析耗时数秒（要拉作品元数据），上游预算 15s */
  let d = null;
  try {
    d = await fetchJSON(QX_API + '?url=' + encodeURIComponent(target), 15000, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://api.lvxiaodong.com/'
      }
    });
  } catch (e) {
    console.warn('[shortvideo] qx network fail:', String(e && e.message).slice(0, 60));
    return null;
  }

  /* 成功判定（兼容三种包裹形态）：
   *   真实：{"retcode":200,"succ":true,"data":{…}}   ← 无 code 字段
   *   文档：{"code":200,"msg":"解析成功","data":{…}}  ← 兜底 */
  const v = (d && d.data && typeof d.data === 'object') ? d.data : null;
  const ok = v && (d.succ === true || Number(d.retcode) === 200 || Number(d.code) === 200);
  if (!ok) {
    console.warn('[shortvideo] qx upstream failed:',
      d && (d.error_code || d.retcode || d.code),
      String((d && (d.retdesc || d.msg)) || '').slice(0, 80));
    return null;
  }

  const platRaw = String(firstOf(v, ['platform']) || d.platform || '');
  const plat = PLAT_ALIAS[platRaw] || PLAT_ALIAS[String(platRaw).toLowerCase()] || guessPlat(target);
  const who = (v.author && typeof v.author === 'object') ? v.author : {};
  const music = (v.music && typeof v.music === 'object') ? v.music : {};
  const ext = (v.extra && typeof v.extra === 'object') ? v.extra : {};
  const stats = (ext.statistics && typeof ext.statistics === 'object') ? ext.statistics : {};

  const images = imageList(v, plat);

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

  return {
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
  };
}

/* ================================================================
 * 备通道 · 月下独酌 jhjx.php（X-API-Key 头，密钥 env.SK89_KEY）
 * 无有效密钥无法实测成功结构 → 宽容映射：能挖出视频或图集即算成功；
 * 字段名按聚合类接口主流命名逐一尝试（与主通道旧文档兜底同一思路）。
 * 成功 → { data: 前端契约 JSON }；失败 → null。
 * ================================================================ */
function pickArr(v) {
  for (const k of ['images', 'image_list', 'img_urls', 'pics', 'images_url']) {
    if (Array.isArray(v[k]) && v[k].length) return v[k];
  }
  return [];
}

async function fetchSk89(target, key) {
  let d = null;
  try {
    d = await fetchJSON(SK89_API + '?url=' + encodeURIComponent(target), 15000, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-API-Key': key
      }
    });
  } catch (e) {
    console.warn('[shortvideo] sk89 network fail:', String(e && e.message).slice(0, 60));
    return null;
  }

  const v = (d && d.data && typeof d.data === 'object') ? d.data : (d || {});
  const okByCode = Number(d && d.code) === 200 || (d && d.status === 'success');
  /* 宽容成功判定：业务码成功，或者能从响应里挖出至少一个素材 */
  const mainUrl = String(firstOf(v, ['video_url', 'url', 'play_url', 'videoUrl', 'playUrl']) || '');
  const hasMedia = !!mainUrl || pickArr(v).length > 0;
  if (!okByCode && !hasMedia) {
    console.warn('[shortvideo] sk89 upstream failed:',
      d && (d.code || d.error),
      String((d && (d.message || d.msg)) || '').slice(0, 80));
    return null;
  }

  const plat = guessPlat(target);
  const who = (v.author && typeof v.author === 'object') ? v.author : {};
  const music = (v.music && typeof v.music === 'object') ? v.music : {};
  const images = pickArr(v).map(x => {
    if (typeof x === 'string') return viaProxy(x, plat);
    if (x && typeof x === 'object' && x.url) return viaProxy(x.url, plat);
    return '';
  }).filter(Boolean);

  const playUrl = mainUrl ? viaProxy(mainUrl, plat) : '';
  /* 作者可能是对象（name/nickname），也可能是纯字符串 */
  const nick = String(firstOf(who, ['nickname', 'name']) ||
    (typeof v.author === 'string' ? v.author : '') ||
    firstOf(v, ['nickname']) || '');
  const musicUrl = String(firstOf(v, ['audio_url', 'music_url']) || music.url || '');

  return {
    contentType: !playUrl && images.length ? '图集' : '视频',
    title: String(firstOf(v, ['title', 'desc', 'content']) || ''),
    author: {
      nickname: nick,
      avatar: viaProxy(firstOf(who, ['avatar', 'head', 'headimgurl']), plat),
      id: String(firstOf(who, ['author_id', 'id', 'uid']) || '')
    },
    cover: viaProxy(firstOf(v, ['cover_url', 'cover', 'pic', 'thumbnail']), plat),
    images: images,
    playUrl: playUrl,
    music: {
      title: String(music.title || ''),
      author: String(music.author || ''),
      url: viaProxy(musicUrl, plat),
      cover: viaProxy(music.cover, plat)
    },
    workId: String(firstOf(v, ['video_id', 'aweme_id', 'id']) || ''),
    publishTime: '',
    sourceUrl: /^https:\/\//i.test(target) ? target : '',
    stats: { likes: 0, comments: 0, collects: 0, shares: 0, plays: 0 },
    tags: [],
    authorExt: { douyinId: '', signature: '', fans: 0, likes: 0 }
  };
}

export async function onRequest({ request, env }) {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') return err('只支持 GET / POST', 405);

  const inUrl = new URL(request.url);
  let rawUrl = '';
  if (method === 'GET') {
    rawUrl = inUrl.searchParams.get('url') || '';
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

  /* 通道选择：main=只主 / backup=只备 / auto（缺省）主失败切备。
     前端下拉「主通道不可用时自动换备用」即 auto，不暴露任何上游名字 */
  const via = (inUrl.searchParams.get('via') || '').toLowerCase();

  if (via !== 'backup') {
    const qx = await fetchQx(target);
    if (qx) return json(qx);
  }
  if (via !== 'main') {
    const key = env && env.SK89_KEY ? String(env.SK89_KEY) : '';
    if (key) {
      const sk = await fetchSk89(target, key);
      if (sk) return json(sk);
    } else if (via === 'backup') {
      return err('备用通道未配置，请先在环境变量配置密钥', 503);
    }
  }

  return err('解析失败，请检查链接是否有效', 502);
}
