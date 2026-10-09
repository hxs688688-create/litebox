/* LiteBox v5 · functions/api/shortvideo.js — 聚合解析（GET / POST /api/shortvideo）
 *
 * Step 35 · 二：上游从 ovo1（需 OVO1_KEY）整体换成千寻 API 的
 *   「聚合去水印解析 · 千寻公益版」（文档 https://api.lvxiaodong.com/doc/dypro）——
 *   **免密钥**，部署侧不再需要配置任何环境变量。输出契约与 Step 26 版完全一致，
 *   前端 tools/shortvideo.js 一行不用改。
 *
 * 【上游有两种响应结构，都要认】实测：
 *   成功 {"code":200,"msg":"解析成功","data":{…},"platform":"douyin"}
 *   失败 {"retcode":400,"retdesc":"提取媒体内容失败…","succ":false,"data":null,
 *         "error_code":"MEDIA_NOT_FOUND"}
 *
 * 【新字段 → 旧契约映射】
 *   data.url                    → playUrl（无水印主链接，走同源代理）
 *   data.author.name/id/avatar  → author.nickname/id/avatar
 *   data.author.id              → authorExt.douyinId（前端「ID xxx」徽标）
 *   data.extra.statistics.digg_count / comment_count / collect_count /
 *         share_count / play_count → stats.likes / comments / collects / shares / plays
 *   data.extra.hashtags[{name}] → tags（字符串数组）
 *   data.extra.aweme_id         → workId
 *   data.extra.share_url        → sourceUrl（仅 https；响应里唯一站外绝对地址）
 *   data.title 缺失时回退 data.desc；video_backup（多清晰度）/ live_photo（实况）
 *   前端没有对应渲染位，丢弃。
 *
 * 【素材域名红线】封面 / 头像 / 图集 / 视频 / 音乐统一转 /api/shortvideo-proxy
 *   同源代理（Step 26 实测：第三方 CDN 直链需要平台 Referer 且签名会过期），
 *   platform 随上游取值传给代理挑 Referer；响应 JSON 里不出现任何第三方 CDN。
 *
 * 【报错文案】上游 retdesc 是面向用户的引导文案（不含链接 / 密钥字样且不超长）时
 *   透传给界面，否则退回笼统文案 —— 不返回上游原始调试信息（安全策略第 3 条）。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.lvxiaodong.com/api/dypro';
const MAX_INPUT = 1200;

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

/* {name} / [{name}] 两种形态统一成字符串数组（hashtags 文档是对象数组，容错字符串数组） */
function tagList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => String((x && x.name) || x || '').replace(/^#/, '').trim()).filter(Boolean);
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

  /* 双结构判定：成功=有 data 且 (succ===true 或 code/retcode===200)；其余按失败处理 */
  const v = (d && d.data && typeof d.data === 'object') ? d.data : null;
  const ok = v && (d.succ === true || Number(d.code) === 200 || Number(d.retcode) === 200);
  if (!ok) {
    console.warn('[shortvideo] upstream failed:',
      d && (d.error_code || d.code || d.retcode),
      String((d && (d.retdesc || d.msg)) || '').slice(0, 80));
    return err(friendlyMsg(d && (d.retdesc || d.msg)) || '解析失败，请检查链接是否有效', 502);
  }

  const plat = String(d.platform || v.platform || 'douyin').toLowerCase();
  const who = (v.author && typeof v.author === 'object') ? v.author : {};
  const music = (v.music && typeof v.music === 'object') ? v.music : {};
  const ext = (v.extra && typeof v.extra === 'object') ? v.extra : {};
  const stats = (ext.statistics && typeof ext.statistics === 'object') ? ext.statistics : {};

  const images = (Array.isArray(v.images) ? v.images : [])
    .map(u => viaProxy(u, plat))
    .filter(Boolean);

  const type = String(v.type || '').toLowerCase();
  const mainUrl = String(v.url || '');
  /* 视频判定：type 是 video，或没有图集却有主链接；图集作品一般 url 为空 */
  const playUrl = (!type || type.indexOf('video') > -1 || (!images.length && mainUrl))
    ? viaProxy(mainUrl, plat)
    : '';

  /* 原作品页：只接受 https，且仅这一个字段允许是站外绝对地址
     （它是给「🔗 原链接」按钮用的目标，不是素材，浏览器不会自动加载它）。 */
  const shareRaw = String(ext.share_url || '');
  const sourceUrl = /^https:\/\//i.test(shareRaw) ? shareRaw : '';

  return json({
    contentType: images.length && !playUrl ? '图集' : '视频',
    title: String(v.title || v.desc || ''),
    author: {
      nickname: String(who.name || ''),
      avatar: viaProxy(who.avatar, plat),
      id: String(who.id || '')
    },
    cover: viaProxy(v.cover, plat),
    images: images,
    playUrl: playUrl,
    music: {
      title: String(music.title || ''),
      author: String(music.author || ''),
      url: viaProxy(music.url, plat),
      cover: viaProxy(music.cover, plat)
    },
    workId: String(ext.aweme_id || v.video_id || ''),
    publishTime: String(ext.create_time || ''),
    sourceUrl: sourceUrl,
    stats: {
      likes: statNum(stats.digg_count),
      comments: statNum(stats.comment_count),
      collects: statNum(stats.collect_count),
      shares: statNum(stats.share_count),
      plays: statNum(stats.play_count)
    },
    tags: tagList(ext.hashtags).slice(0, 12),
    authorExt: {
      douyinId: String(who.id || ''),
      signature: '',
      fans: 0,
      likes: 0
    }
  });
}
