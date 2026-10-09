/* LiteBox v5 · functions/api/movie-rank.js — 影视榜单（GET /api/movie-rank?type=boxoffice|douban&genre=11）
   Step 16 · A5。两套榜单、多源容错：

   实时票房（type=boxoffice）：
     源 1 猫眼专业版  https://piaofang.maoyan.com/dashboard-ajax/movie
           ★ 注意：任务书给的 `dashboard-ajax`（无 /movie）实测直接 403，正确的端点是
             `dashboard-ajax/movie`，且必须带移动端 UA + Referer。
     源 2 60s 电影板块 https://60s.viki.moe/v2/douban/weekly/movie（豆瓣一周口碑榜，非票房）
     源 3 豆瓣 chart   https://movie.douban.com/j/chart/top_list（口碑榜，非票房）
     —— 后两个源只是「猫眼不可用时别让页面空着」，返回时会带上 source 让前端如实标注。

   豆瓣高分（type=douban）：
     豆瓣 chart top_list，按类型 genre 取（11=剧情 / 24=喜剧 / 5=动作 / 13=爱情 / 22=悬疑）
     源 2 60s 电影板块兜底。

   统一返回：{ items: [{ rank, title, hot, url, sub, type }], source, note } */
import { json, err, fetchJSON } from '../_utils.js';

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HOSTS_60S = [
  'https://60s.viki.moe',
  'https://60s.crystelf.top',
  'https://api.elysiayanyu.top',
  'https://60s.7se.cn',
  'https://60s.mizhoubaobei.top'
];

/* 豆瓣电影类型码（与任务书一致，另补几个常用的） */
const GENRES = {
  11: '剧情', 24: '喜剧', 5: '动作', 13: '爱情', 22: '悬疑',
  19: '战争', 17: '科幻', 25: '动画', 10: '纪录', 8: '惊悚'
};

/* 带缓存头的 JSON 响应（_utils.json 固定 no-store，热榜需要边缘缓存 10 分钟） */
function jsonCached(data, maxAge) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + maxAge,
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'boxoffice';
  if (type === 'boxoffice') return boxoffice();
  if (type === 'douban') return douban(url.searchParams.get('genre') || '11');
  return err('不支持的榜单类型（type 应为 boxoffice 或 douban）', 400);
}

/* ---------------- 实时票房 ---------------- */

async function boxoffice() {
  /* 源 1：猫眼专业版实时票房 */
  const maoyan = await fetchMaoyan();
  if (maoyan && maoyan.length) {
    return jsonCached({ items: maoyan, source: 'maoyan', note: '' }, 600);
  }
  /* 源 2 / 3：猫眼不可用时的口碑榜兜底（明确标注不是票房） */
  const weekly = await fetch60sMovie();
  if (weekly && weekly.length) {
    return jsonCached({
      items: weekly, source: '60s',
      note: '实时票房接口暂时不可用，以下为豆瓣一周口碑榜'
    }, 600);
  }
  const chart = await fetchDoubanChart('11');
  if (chart && chart.length) {
    return jsonCached({
      items: chart, source: 'douban',
      note: '实时票房接口暂时不可用，以下为豆瓣剧情片口碑榜'
    }, 600);
  }
  return err('影视榜单暂时无法获取，请稍后重试', 502);
}

async function fetchMaoyan() {
  try {
    const d = await fetchJSON('https://piaofang.maoyan.com/dashboard-ajax/movie', 8000, {
      headers: { 'User-Agent': UA_MOBILE, 'Referer': 'https://piaofang.maoyan.com/dashboard' }
    });
    const list = (d && d.movieList && Array.isArray(d.movieList.list)) ? d.movieList.list : [];
    return list.slice(0, 30).map((x, i) => {
      const info = x.movieInfo || {};
      const unit = x.boxSplitUnit || {};
      const box = (unit.num != null && unit.unit) ? (unit.num + unit.unit) : '';
      const bits = [];
      if (x.boxRate) bits.push('占比 ' + x.boxRate);
      if (x.avgShowView) bits.push('排片 ' + x.avgShowView + '%');
      if (x.avgSeatView) bits.push('上座 ' + x.avgSeatView);
      if (info.releaseInfo) bits.push(info.releaseInfo);
      return {
        rank: i + 1,
        title: info.movieName || '',
        hot: box,
        url: info.movieId ? 'https://piaofang.maoyan.com/movie/' + info.movieId : '',
        sub: bits.join(' · '),
        type: 'now_showing'
      };
    }).filter(x => x.title);
  } catch (_) {
    return null;
  }
}

/* ---------------- 豆瓣高分 ---------------- */

async function douban(genre) {
  const g = GENRES[genre] ? genre : '11';
  const chart = await fetchDoubanChart(g);
  if (chart && chart.length) {
    return jsonCached({
      items: chart, source: 'douban',
      note: '豆瓣「' + GENRES[g] + '」高分榜'
    }, 600);
  }
  const weekly = await fetch60sMovie();
  if (weekly && weekly.length) {
    return jsonCached({
      items: weekly, source: '60s',
      note: '豆瓣接口暂时不可用，以下为豆瓣一周口碑榜'
    }, 600);
  }
  return err('豆瓣榜单暂时无法获取，请稍后重试', 502);
}

async function fetchDoubanChart(genre) {
  try {
    const url = 'https://movie.douban.com/j/chart/top_list?type=' + encodeURIComponent(genre) +
      '&interval_id=100:90&action=&start=0&limit=30';
    const d = await fetchJSON(url, 8000, {
      headers: { 'User-Agent': UA_DESKTOP, 'Referer': 'https://movie.douban.com/' }
    });
    const list = Array.isArray(d) ? d : [];
    return list.map((x, i) => {
      const rating = Array.isArray(x.rating) ? x.rating[0] : x.rating;
      const types = Array.isArray(x.types) ? x.types.slice(0, 3).join('/') : '';
      const regions = Array.isArray(x.regions) ? x.regions.slice(0, 2).join('/') : '';
      const sub = [types, regions, x.release_date].filter(Boolean).join(' · ');
      return {
        rank: x.rank || (i + 1),
        title: x.title || '',
        hot: rating ? (rating + '分') : '',
        url: x.url || (x.id ? 'https://movie.douban.com/subject/' + x.id + '/' : ''),
        sub: sub,
        type: 'douban'
      };
    }).filter(x => x.title);
  } catch (_) {
    return null;
  }
}

/* 60s 电影板块：/v2/douban/weekly/movie
   ★ 任务书给的 /v2/movie 实测 404（60s 要求 Base URL 后带具体版本路径），这里用真实存在的那个。 */
async function fetch60sMovie() {
  for (const host of HOSTS_60S) {
    try {
      const d = await fetchJSON(host + '/v2/douban/weekly/movie', 4000);
      const list = (d && Array.isArray(d.data)) ? d.data : [];
      if (!list.length) continue;
      return list.slice(0, 30).map((x, i) => {
        const bits = [];
        if (x.rating_count) bits.push(x.rating_count + '人评');
        if (x.good_rate != null) bits.push('好评 ' + x.good_rate + '%');
        return {
          rank: x.rank || (i + 1),
          title: x.title || '',
          hot: x.rating != null ? (x.rating + '分') : '',
          url: x.id ? 'https://movie.douban.com/subject/' + x.id + '/' : '',
          sub: bits.join(' · '),
          type: 'douban_weekly'
        };
      }).filter(x => x.title);
    } catch (_) { /* 换下一个镜像 */ }
  }
  return null;
}
