/* LiteBox v5 · functions/api/shortvideo.js — 聚合解析（GET / POST /api/shortvideo）
 *
 * Step 26 · 二：后端从上一版的免费解析接口整体换成新的聚合解析接口，
 * 输出字段也随之换成新契约（contentType / 统计数据 / 背景音乐 / 话题标签 / 作者扩展）。
 * 密钥只从 env.OVO1_KEY 读，绝不写死、不进日志、不进响应。
 *
 * 【与任务书示例的四处差异（都往更严方向，逐条有实测依据）】
 *   1) 示例用 fetchJSON：上游业务错误实测回 HTTP 200 + {"code":505,"msg":"…"}，
 *      fetchJSON 能拿到 body，但示例又把 d.message 原样 err() 出去。
 *      安全策略第 3 条要求「不返回上游原始消息」，所以这里统一归一化成中文笼统文案，
 *      只在「链接为空 / 过长」这类本地校验上给具体提示。
 *   2) 示例里 cover / images / avatar / music 直接透传上游绝对地址。
 *      这样浏览器 Network 会出现第三方 CDN 域名，且签名过期后图片必挂，
 *      所以统一转 /api/shortvideo-proxy（上一版已验证的必要做法）。
 *   3) 图集判定不只看 type：新接口「内容类型」是中文（视频 / 图集），
 *      这里同时兜底「有图片列表且无视频链接 → 图集」。
 *   4) 保留上一版的 MAX_INPUT 长度限制，防止把整段口令超长文本塞进上游 URL。
 */
import { json, err, fetchJSON } from '../_utils.js';

const API = 'https://api.ovo1.cc/api/analysis';
const MAX_INPUT = 1200;

/* 第三方资源 → 同源代理地址（只接受 https） */
function viaProxy(u) {
  const s = String(u || '');
  if (!/^https:\/\//i.test(s)) return '';
  return '/api/shortvideo-proxy?url=' + encodeURIComponent(s);
}

export async function onRequest({ request, env }) {
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

  const token = env && env.OVO1_KEY ? String(env.OVO1_KEY) : '';
  if (!token) return err('服务未配置', 503);

  const upstream = API + '?token=' + encodeURIComponent(token) +
    '&url=' + encodeURIComponent(rawUrl);

  let d = null;
  try {
    d = await fetchJSON(upstream, 15000);
  } catch (_) {
    return err('解析服务暂时不可用', 502);
  }
  if (!d || d.code !== 200 || !d.data) return err('解析失败，请检查链接是否有效', 502);

  const v = d.data;
  const ext = v['扩展信息'] || {};
  const stats = ext['统计数据'] || {};
  const authorExt = ext['作者扩展信息'] || {};
  const music = v['背景音乐'] || {};
  const who = v['作者信息'] || {};

  const type = v['内容类型'] || '';
  const images = (Array.isArray(v['图片列表']) ? v['图片列表'] : [])
    .map(viaProxy)
    .filter(Boolean);

  let videoUrl = '';
  let playUrl = '';
  if (type === '视频' || (!type && !images.length)) {
    videoUrl = ext['视频链接'] || ext['播放地址'] || '';
    playUrl = viaProxy(videoUrl);
  }

  /* 原作品页：只接受 https，且仅这一个字段允许是站外绝对地址
     （它是给「🔗 原链接」按钮用的目标，不是素材，浏览器不会自动加载它）。
     素材类地址一律走代理，响应 JSON 里不出现任何第三方 CDN。 */
  const sourceUrl = /^https:\/\//i.test(String(ext['分享链接'] || '')) ? ext['分享链接'] : '';

  return json({
    contentType: type || (images.length && !playUrl ? '图集' : '视频'),
    title: v['标题'] || '',
    author: {
      nickname: who['昵称'] || '',
      avatar: viaProxy(who['头像']),
      id: who['用户ID'] || ''
    },
    cover: viaProxy(v['封面图']),
    images: images,
    playUrl: playUrl,
    music: {
      title: music['音乐标题'] || '',
      author: music['音乐作者'] || '',
      url: viaProxy(music['音乐链接']),
      cover: viaProxy(music['音乐封面'])
    },
    workId: ext['作品ID'] || '',
    publishTime: ext['发布时间'] || '',
    sourceUrl: sourceUrl,
    stats: {
      likes: stats['点赞数'] || 0,
      comments: stats['评论数'] || 0,
      collects: stats['收藏数'] || 0,
      shares: stats['分享数'] || 0,
      plays: stats['播放数'] || 0
    },
    tags: Array.isArray(ext['话题标签']) ? ext['话题标签'] : [],
    authorExt: {
      douyinId: authorExt['抖音号'] || '',
      signature: authorExt['个性签名'] || '',
      fans: authorExt['粉丝数'] || 0,
      likes: authorExt['获赞总数'] || 0
    }
  });
}
