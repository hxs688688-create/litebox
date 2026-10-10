/* LiteBox v5 · functions/api/shortvideo.js — 聚合解析（GET / POST /api/shortvideo）
 *
 * Step 38 · 备用链升级为「主 + 备×3」（新增 BugPk 公益聚合接口，免密钥）：
 *   主通道 fetchQx —— 千寻 dypro（免密钥，50+ 平台）；
 *   备用链（按序尝试）：
 *     ① fetchBugPk —— BugPk short_videos（免密钥，20+ 平台，2026-10-10 实测）；
 *     ② fetchXy —— 小宇API spjx.php（env.XIAOYU_KEY，B站/抖音/快手/小红书等）；
 *     ③ fetchSk89 —— 月下独酌 jhjx.php（env.SK89_KEY，9 平台）。
 *   调度：?via=main 只走主通道 / ?via=backup 跳过主通道走完整备用链 /
 *   ?via=xy|sk89|nf 点名单个备用通道（未配密钥 503 明确指引）/
 *   缺省 auto（主 → BugPk → 小宇 → 月下独酌）。任一通道失败自动试下一个。
 *   前端下拉：自动 / 仅主通道 / 备用通道A（=小宇）/ 备用通道B（=月下独酌），
 *   BugPk 免密钥始终在链里，不做单独入口（界面上不标注数据来源）。
 *
 * Step 38.1 · 备用链再扩「备用通道 C」——南风API（api.nfiii.com，用户指定）：
 *   其计费系统开源（github kanghua-li/NanFengAPI，OpenApiController.java），
 *   开放网关为 GET/POST /open/v1/id/{interfaceId}?key=<密钥>&<业务参数透传>，
 *   用户给的 /interface/info/1 → interfaceId=1 =【聚合】短视频解析
 *   （抖音、小红书、豆包、即梦、最右、哔哩哔哩、皮皮虾、皮皮搞笑、汽水音乐等）。
 *   调用：https://api.nfiii.com/open/v1/id/1?key=<NFIII_KEY>&url=<分享链接>。
 *   ⚠ 网关必须带 key（缺失 401「接口密钥不能为空」），且密钥 IP 白名单为空时
 *   返回 200 + 固定文案 {"code":403,"message":"当前服务暂不可用"} —— 成功判定
 *   必须排除该形态。上游返回体经网关透传、结构未公开实测（密钥由用户配置），
 *   按聚合类接口惯例宽容映射：success===true / code===200 且能挖出视频或图集
 *   即成功；字段候选 video/video_url/url、images/image_list、cover/cover_url、
 *   title/desc。失败 / 未配密钥 → null 走下一通道。
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
 * 【BugPk short_videos 真实结构（2026-10-10 实测即梦分享链 + 官方文档双重印证）】
 *   GET https://api.bugpk.com/api/short_videos?url=<分享链接>（公开/免费，GET/POST）
 *   成功 {"code":200,"msg":"解析成功","platform":"jimeng"(英文平台名),"data":{
 *     type:"video", title, desc, author:{name,id,avatar}(对象，文档示例写
 *     字符串但实测是对象 —— 两种形态都兼容), cover, url(无水印直链),
 *     quality, duration, extra:{aweme_id, create_time, statistics:{
 *     play_count, like_count, share_count}}}, cache_*}
 *   失败：空 url {"code":400,...} / 链接无效 {"code":400,"msg":"链接格式错误…"}
 *   / 解析失败 {"code":0,"msg":"解析失败！"} —— 成功只认 code===200 且能挖出素材。
 *   文档文档页需带 X-Requested-With 头才能取到（SPA 动态渲染），请求本身无此要求。
 *   上游 music{} 只有作者信息没有音频直链 → 音乐位给空（前端自动隐藏）。
 *
 * 【小宇 spjx.php 结构（官方返回示例，2026-10-09 抓取）】
 *   {"code":0,"msg":"success","data":{
 *     status:"success", type:"video"|"image",
 *     title, media_url(视频=字符串直链 / 图集=字符串数组),
 *     cover, livephotos[]}}
 *   ⚠ 文档示例 code=0，而状态码表又写 200 成功、实测失败返回 403 ——
 *   成功判定必须宽容：code===0 || code===200 || data.status==='success'。
 *   上游没有 author / music / 统计 / 话题字段 → 契约相应位置给空值
 *   （前端对空作者 / 空音乐 / 全 0 统计都有既有空态，零改动）。
 *   livephotos（实况）前端无渲染位，丢弃（与主通道 live_photo_url 同口径）。
 *
 * 【备通道映射策略】月下独酌成功响应暂无法实测（密钥由用户自行申请配置），
 *   按聚合类接口惯例做**宽容映射**：能从响应里挖出视频地址或图集即算成功，
 *   字段名按 video_url/url/play_url、images/image_list、cover/cover_url、
 *   author.name/nickname 等主流命名逐一尝试 —— 与主通道的旧文档兜底同一思路。
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
 * 【平台判定】小宇 / 月下独酌上游不给 platform 字段，从分享链接域名推断
 *   （guessPlat）；主通道 platform 是中文名，先过 PLAT_ALIAS 转代理 Referer 键。
 *   响应 JSON 除 sourceUrl 外零第三方 CDN（素材全部走 /api/shortvideo-proxy）。
 *
 * 【报错文案】上游 retdesc/message 属纯用户引导（无链接/密钥字样且 ≤80 字）时透传，
 *   否则退回笼统文案 —— 不返回上游原始调试信息（安全策略第 3 条）。
 */
import { json, err, fetchJSON } from '../_utils.js';

const QX_API = 'https://api.lvxiaodong.com/api/dypro';
const BUGPK_API = 'https://api.bugpk.com/api/short_videos';
const NF_API = 'https://api.nfiii.com/open/v1/id/1';
const XY_API = 'https://api.xiaoyu17love.top/API/spjx.php';
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
  'jimeng': 'douyin', '即梦': 'douyin', '豆包': 'douyin',
  '西瓜视频': 'toutiao', '微视': 'douyin', 'youtube': 'bilibili', 'tiktok': 'douyin',
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
 * 备用链 ① · BugPk short_videos（免密钥，2026-10-10 实测接入）
 * 真实结构见文件头。成功 → 前端契约 JSON；失败 → null（原因写日志）。
 * 成功判定从严：code===200 且能挖出视频直链或图集（失败态有 code 400 / 0）。
 * ================================================================ */
async function fetchBugPk(target) {
  let d = null;
  try {
    d = await fetchJSON(BUGPK_API + '?url=' + encodeURIComponent(target), 15000, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://api.bugpk.com/'
      }
    });
  } catch (e) {
    console.warn('[shortvideo] bugpk network fail:', String(e && e.message).slice(0, 60));
    return null;
  }

  const v = (d && d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? d.data : null;
  /* 宽容取素材（防上游字段摇摆），但业务码必须成功 */
  const mainUrl = String(firstOf(v, ['url', 'video_url', 'play_url']) || '');
  const rawImgs = Array.isArray(v && v.images) ? v.images
    : Array.isArray(v && v.image_list) ? v.image_list : [];
  const ok = v && Number(d.code) === 200 && (!!mainUrl || rawImgs.length > 0);
  if (!ok) {
    console.warn('[shortvideo] bugpk upstream failed:',
      d && d.code,
      String((d && (d.msg || d.message)) || '').slice(0, 80));
    return null;
  }

  /* 上游顶层 platform 是英文键名（如 jimeng），先过别名表再按域名猜 */
  const platRaw = String(d.platform || '');
  const plat = PLAT_ALIAS[platRaw] || PLAT_ALIAS[platRaw.toLowerCase()] || guessPlat(target);

  /* 作者：实测是对象 {name,id,avatar}，文档示例写的是字符串 —— 两种形态都兼容 */
  const who = (v.author && typeof v.author === 'object') ? v.author : {};
  const nick = String(firstOf(who, ['nickname', 'name']) ||
    (typeof v.author === 'string' ? v.author : '') || '');

  const images = rawImgs.map(x => {
    if (typeof x === 'string') return viaProxy(x, plat);
    if (x && typeof x === 'object' && x.url) return viaProxy(x.url, plat);
    return '';
  }).filter(Boolean);
  const playUrl = mainUrl ? viaProxy(mainUrl, plat) : '';

  const ext = (v.extra && typeof v.extra === 'object') ? v.extra : {};
  const stats = (ext.statistics && typeof ext.statistics === 'object') ? ext.statistics : {};
  const music = (v.music && typeof v.music === 'object') ? v.music : {};

  return {
    contentType: !playUrl && images.length ? '图集' : '视频',
    title: String(firstOf(v, ['title', 'desc']) || ''),
    author: {
      nickname: nick,
      avatar: viaProxy(who.avatar, plat),
      id: String(firstOf(who, ['author_id', 'id', 'uid']) || '')
    },
    cover: viaProxy(firstOf(v, ['cover', 'cover_url']), plat),
    images: images,
    playUrl: playUrl,
    music: {
      title: '',
      author: String(music.author || ''),
      url: '',
      cover: viaProxy(music.avatar, plat)
    },
    workId: String(ext.aweme_id || ''),
    publishTime: String(ext.create_time || ''),
    sourceUrl: /^https:\/\//i.test(target) ? target : '',
    stats: {
      likes: statNum(stats.like_count),
      comments: 0,
      collects: 0,
      shares: statNum(stats.share_count),
      plays: statNum(stats.play_count)
    },
    tags: [],
    authorExt: { douyinId: String(firstOf(who, ['id', 'uid']) || ''), signature: '', fans: 0, likes: 0 }
  };
}

/* ================================================================
 * 备用链 ② · 南风API 开放网关（Step 38.1，用户指定，密钥 env.NFIII_KEY）
 * 网关 GET /open/v1/id/1?key=&url=（透传上游）。成功 → 前端契约 JSON；
 * 失败 / 未配密钥 → null（原因写日志）。
 * ================================================================ */
async function fetchNf(target, key) {
  let d = null;
  try {
    d = await fetchJSON(NF_API + '?key=' + encodeURIComponent(key) +
      '&url=' + encodeURIComponent(target), 15000, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://api.nfiii.com/'
      }
    });
  } catch (e) {
    console.warn('[shortvideo] nf network fail:', String(e && e.message).slice(0, 60));
    return null;
  }

  /* 网关透传体 + 网关自身错误体两种包裹都兼容：
   *   上游：{success:true,data:{title,cover,video,images}} 或 {code:200,...}
   *   网关：{code:403,message:"当前服务暂不可用"}（key 无 IP 白名单时的固定返回）
   *        {code:-1,...} / HTTP 401（缺 key 不会发生——没配就不调用） */
  const v = (d && d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? d.data
    : (d && typeof d === 'object' ? d : {});
  if (Number(d && d.code) === 403 || Number(d && d.code) === -1) {
    console.warn('[shortvideo] nf gateway failed:', String((d && (d.message || d.error)) || '').slice(0, 80));
    return null;
  }
  /* 宽容取素材（透传上游字段名未知，按主流命名逐一尝试） */
  const mainUrl = String(firstOf(v, ['video', 'video_url', 'url', 'play_url', 'videoUrl', 'playUrl']) || '');
  const rawImgs = Array.isArray(v.images) ? v.images
    : Array.isArray(v.image_list) ? v.image_list : [];
  const ok = (d && (d.success === true || Number(d.code) === 200)) && (!!mainUrl || rawImgs.length > 0);
  if (!ok) {
    console.warn('[shortvideo] nf upstream failed:',
      d && (d.code || d.success),
      String((d && (d.message || d.msg || d.error)) || '').slice(0, 80));
    return null;
  }

  const plat = guessPlat(target);
  const who = (v.author && typeof v.author === 'object') ? v.author : {};
  const nick = String(firstOf(who, ['nickname', 'name']) ||
    (typeof v.author === 'string' ? v.author : '') || '');

  const images = rawImgs.map(x => {
    if (typeof x === 'string') return viaProxy(x, plat);
    if (x && typeof x === 'object' && x.url) return viaProxy(x.url, plat);
    return '';
  }).filter(Boolean);
  const playUrl = mainUrl ? viaProxy(mainUrl, plat) : '';

  return {
    contentType: !playUrl && images.length ? '图集' : '视频',
    title: String(firstOf(v, ['title', 'desc', 'content']) || ''),
    author: {
      nickname: nick,
      avatar: viaProxy(who.avatar, plat),
      id: String(firstOf(who, ['author_id', 'id', 'uid']) || '')
    },
    cover: viaProxy(firstOf(v, ['cover', 'cover_url', 'pic']), plat),
    images: images,
    playUrl: playUrl,
    music: { title: '', author: '', url: '', cover: '' },
    workId: '',
    publishTime: '',
    sourceUrl: /^https:\/\//i.test(target) ? target : '',
    stats: { likes: 0, comments: 0, collects: 0, shares: 0, plays: 0 },
    tags: [],
    authorExt: { douyinId: '', signature: '', fans: 0, likes: 0 }
  };
}

/* ================================================================
 * 备用链 ③ · 小宇API spjx.php（apikey query 参数，密钥 env.XIAOYU_KEY）
 * 官方结构见文件头。成功 → 前端契约 JSON；失败 → null（原因写日志）。
 * ================================================================ */
async function fetchXy(target, key) {
  let d = null;
  try {
    d = await fetchJSON(XY_API + '?apikey=' + encodeURIComponent(key) +
      '&url=' + encodeURIComponent(target), 15000, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://api.xiaoyu17love.top/'
      }
    });
  } catch (e) {
    console.warn('[shortvideo] xy network fail:', String(e && e.message).slice(0, 60));
    return null;
  }

  const v = (d && d.data && typeof d.data === 'object') ? d.data : null;
  /* ⚠ 文档示例 code=0、状态码表写 200、实测失败 403 —— 宽容判定三者其一 */
  const ok = v && (Number(d.code) === 0 || Number(d.code) === 200 || d.data.status === 'success');
  if (!ok) {
    console.warn('[shortvideo] xy upstream failed:',
      d && d.code,
      String((d && (d.msg || d.message)) || '').slice(0, 80));
    return null;
  }
  if (v.status && v.status !== 'success') {
    console.warn('[shortvideo] xy status:', String(v.status).slice(0, 40));
    return null;
  }

  const plat = guessPlat(target);
  /* media_url：视频=字符串直链，图集=字符串数组 —— 按数据形态分流（不轻信 type） */
  const mu = v.media_url;
  let mainUrl = '';
  let images = [];
  if (Array.isArray(mu)) {
    images = mu.map(x => {
      const u = (typeof x === 'string') ? x : (x && typeof x === 'object' && x.url) ? x.url : '';
      return viaProxy(u, plat);
    }).filter(Boolean);
  } else if (typeof mu === 'string' && mu) {
    mainUrl = mu;
  }

  return {
    contentType: !mainUrl && images.length ? '图集' : '视频',
    title: String(v.title || ''),
    author: { nickname: '', avatar: '', id: '' },
    cover: viaProxy(v.cover, plat),
    images: images,
    playUrl: viaProxy(mainUrl, plat),
    music: { title: '', author: '', url: '', cover: '' },
    workId: '',
    publishTime: '',
    sourceUrl: /^https:\/\//i.test(target) ? target : '',
    stats: { likes: 0, comments: 0, collects: 0, shares: 0, plays: 0 },
    tags: [],
    authorExt: { douyinId: '', signature: '', fans: 0, likes: 0 }
  };
}

/* ================================================================
 * 备用链 ④ · 月下独酌 jhjx.php（X-API-Key 头，密钥 env.SK89_KEY）
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

  /* 通道选择：main=只主 / backup=跳过主直走备用链 / xy|sk89|nf=点名单个备用通道 /
     auto（缺省）主失败依次切备。前端下拉不暴露任何上游名字 */
  const via = (inUrl.searchParams.get('via') || '').toLowerCase();

  /* 点名单个备用通道：未配对应密钥时 503 明确指引，不静默回落 */
  if (via === 'xy' || via === 'sk89' || via === 'nf') {
    const conf = {
      'xy': ['XIAOYU_KEY', k => fetchXy(target, k)],
      'sk89': ['SK89_KEY', k => fetchSk89(target, k)],
      'nf': ['NFIII_KEY', k => fetchNf(target, k)]
    }[via];
    const key = env && env[conf[0]] ? String(env[conf[0]]).trim() : '';
    if (!key) return err('该备用通道未配置密钥，请先在环境变量配置后使用', 503);
    const r = await conf[1](key);
    return r ? json(r) : err('解析失败，请检查链接是否有效', 502);
  }

  if (via !== 'backup') {
    const qx = await fetchQx(target);
    if (qx) return json(qx);
  }
  if (via !== 'main') {
    /* 备用链：BugPk（免密钥，恒启用）→ 南风（NFIII_KEY）→ 小宇（XIAOYU_KEY）
       → 月下独酌（SK89_KEY），配置了密钥才启用后三档 */
    const bugpk = await fetchBugPk(target);
    if (bugpk) return json(bugpk);
    const nfKey = env && env.NFIII_KEY ? String(env.NFIII_KEY).trim() : '';
    if (nfKey) {
      const nf = await fetchNf(target, nfKey);
      if (nf) return json(nf);
    }
    const xyKey = env && env.XIAOYU_KEY ? String(env.XIAOYU_KEY).trim() : '';
    if (xyKey) {
      const xy = await fetchXy(target, xyKey);
      if (xy) return json(xy);
    }
    const skKey = env && env.SK89_KEY ? String(env.SK89_KEY).trim() : '';
    if (skKey) {
      const sk = await fetchSk89(target, skKey);
      if (sk) return json(sk);
    }
  }

  return err('解析失败，请检查链接是否有效', 502);
}
