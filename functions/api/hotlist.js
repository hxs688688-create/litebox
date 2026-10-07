/* LiteBox v5 · functions/api/hotlist.js — 热榜聚合（GET /api/hotlist?board=）
   60s API 多镜像：Promise.any 并发请求，谁先返回有效数据用谁，单源超时 3.5s */
import { json, err, fetchJSON } from '../_utils.js';

const HOSTS = [
  'https://60s.viki.moe',
  'https://60s.crystelf.top',
  'https://api.elysiayanyu.top',
  'https://60s.7se.cn',
  'https://60s.mizhoubaobei.top',
  'https://api.cczo.cc/60s'
];

const PATHS = {
  weibo: '/v2/weibo',
  zhihu: '/v2/zhihu',
  douyin: '/v2/douyin',
  toutiao: '/v2/toutiao',
  bili: '/v2/bili',
  baidu: '/v2/baidu/hot'
  /* Step 26 · 四：movie（豆瓣一周口碑榜）board 已移除，票房改由独立工具承载 */
};

function parseList(d) {
  const list = Array.isArray(d) ? d
    : (d && Array.isArray(d.data)) ? d.data
    : (d && Array.isArray(d.list)) ? d.list
    : [];
  return list.map(x => ({
    title: x.title || x.name || x.keyword || x.word || x.show_name || '',
    url: x.link || x.url || x.murl || x.mobile_url || '',
    hot: x.hot_value || x.hot || x.heat || x.score || x.num || ''
  })).filter(x => x.title).slice(0, 50);
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const board = url.searchParams.get('board') || 'weibo';
  const path = PATHS[board];
  if (!path) return err('不支持的热榜类型', 400);

  /* 并发请求所有 host，谁先返回有效数据就用谁 */
  const tasks = HOSTS.map(async host => {
    const d = await fetchJSON(host + path, 3500);
    const items = parseList(d);
    if (!items.length) throw new Error('empty');
    return items;
  });

  try {
    const items = await Promise.any(tasks);
    return json({ data: items });
  } catch (_) {
    return err('热榜暂时无法获取，请稍后重试', 502);
  }
}
