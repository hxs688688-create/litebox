/* LiteBox v5 · functions/api/60s.js — 60s API 统一代理
 * （Step 30 · 三 多主机 + Step 30.1 修线上 403 + Step 32 缓存 1 分钟 + Step 33 并发择优
 *   + Step 34 去 CF 化源队列 / ai-news 按日期取数 / CF 边缘缓存）
 *
 * GET /api/60s?type=weibo|zhihu|douyin|toutiao|bili|baidu|rednote|douban|60s|ai-news|it-news …
 * （批量端点见 functions/api/60s-multi.js，复用本文件的 getBody / fetchUpstream）
 *
 * 热榜聚合 + 每日 60s / AI 资讯 / IT 资讯全部走本端点；
 * 上游域名只存在于后端，前端不持有任何站外地址（红线：前端零上游域名）。
 *
 * 任务给定约定（逐条保留）：
 *   - type → 上游路径映射表 PATHS（唯一真源）
 *   - 缓存：Map + 时间戳，同 type 命中缓存不再打上游（1 分钟）
 *   - 上游超时 10s（单次请求的**总**预算，含所有主机）
 *   - 失败统一 { code: 500, msg: '数据获取失败，请稍后重试' }
 *   - 每次实际打上游都记日志 console.log('[60s] type=', type, 'status=', res.status)
 *
 * Step 34 · 一（用户实测：60s API 一经过 Cloudflare 就超时/很慢）：
 *   根因实测（2026-10-08）：主域名 60s.viki.moe 本身就架在 Cloudflare 上。
 *   CF Pages Function 出站 fetch 另一个 CF 代理站点时，请求不走出站网络而是内部
 *   环回，cf-connecting-ip 暴露 → 目标防护规则直接 403（error 1000），且延迟
 *   不可控（0.9s ~ 13.3s）。Step 33 把它留在核心轮做 3s 探测，等于每次回源都
 *   白白陪跑 1/3 的并发，拖慢收口。
 *   本版改法（回应「能不能不经过 Cloudflare」——不破「前端零上游域名」红线的版本）：
 *     1) **源队列去 CF 化**：核心 3 台换成全部不在 Cloudflare 后面的官方社区镜像
 *        （crystelf / 7se / mizhoubaobei，站在 nginx / EdgeOne 后面），Functions
 *        出站访问完全正常；实测 0.17 ~ 0.63s 回包，超时根源直接消失；
 *     2) 60s.viki.moe 从源队列删除（在 CF Functions 里它永远 403，留着只会
 *        浪费仲裁预算；其它 4 台全挂的概率远低于它抢救成功的概率）；
 *     3) **CF Cache API 边缘缓存**（s-maxage 45s）：命中缓存不再看 isolate 脸色
 *        （isolate Map 缓存是进程级的，手机 / 电脑常落在不同 isolate 上，谁冷谁
 *        全量回源）。边缘缓存跨 isolate 共享，冷启动也能 50ms 内返回；
 *     4) 缓存 key 只用归一化 URL（?type=…），前端 &_t= 防缓存参数不参与 ——
 *        防的还是浏览器/旧边缘行为，边缘缓存 key 归我们控制。
 *
 * Step 34 · 二（AI 资讯一直「获取失败」的真因）：
 *   60s API 的 /v2/ai-news **默认查「昨天」的资讯**（上游模块里
 *   yesterday = Date.now() - 24h），数据源 ai-bot.cn/daily-ai-news 并不是每天
 *   都发布（实测 2026-10-07 就没有条目，日期从 10-08 直接跳到 10-06）→
 *   「昨天」永远空列表 → 前端判「获取失败」。这不是镜像差异，主域名一样空。
 *   上游其实支持 ?date=YYYY-MM-DD 与 ?all 两个参数（同一开源代码，5 台镜像一致）。
 *   本版改法：
 *     1) ai-news 主路径带 ?date=<今天>，直接拿当天条目（date 字段=今天，
 *        新鲜度判定即刻通过，秒收口）；
 *     2) 主路径为空时降级 ?all（全量），在响应内取「最新日期」的一组后再参与
 *        择优 —— 上游某天真的没发，也能给出最近一天的内容；
 *     3) 三个路径**串行**尝试（主路径通常一发命中），避免每台镜像都白拉
 *        几百 KB 的全量列表。
 */
import { json } from '../_utils.js';

/* 上游主机候选（Step 34：源队列去 CF 化）。
 * 全部为 60s API 官方文档「公共实例列表」中的实例，**均不在 Cloudflare 后面**
 * （nginx / 腾讯云 EdgeOne），CF Pages Function 出站访问不存在 cf-connecting-ip
 * 被拒的问题；已逐台实测 11+ 个 type 字段结构与主域名一致。
 * 实测（2026-10-08）回包速度：7se 0.17s · mizhoubaobei 0.22s · crystelf 0.63s
 * · elysiayanyu 1.1s（且它家的 it-news 偶发空列表，靠空数据校验兜住）。
 * 数组顺序 = 核心轮取样顺序（择优逻辑本身不依赖顺序）：
 *   · 前 CORE_COUNT 台是**常态并发**，挑「更新跟得上」的实例；
 *   · 后面一台只在结论不可信时补一轮仲裁。
 * 注：任务给定的主域名 60s.viki.moe 本身在 Cloudflare 上，Functions 出站访问
 * 恒 403（error 1000，见头部注释 Step 34 · 一），留在队列里只会浪费仲裁预算，
 * 故 Step 34 起删除；若日后迁移出 CF 运行时可原样加回。 */
const HOSTS = [
  'https://60s.crystelf.top',      /* 社区实例 · nginx（实测与主域名逐字一致） */
  'https://60s.7se.cn',            /* 社区实例 · nginx（同上，最快） */
  'https://60s.mizhoubaobei.top',  /* 社区实例 · TencentEdgeOne（快；个别榜单偶发滞后，多数派逻辑兜住） */
  'https://api.elysiayanyu.top'    /* 社区实例 · TencentEdgeOne（较慢，ai-news/it-news 偶发空列表，空数据校验兜住） */
];

/* 核心轮并发台数：3 台足够形成「多数派」，又不会给公共镜像带去 5 倍请求量；
 * 结论不可信时再对剩下的补一轮仲裁。 */
const CORE_COUNT = 3;

/* 内容带日期、可直接判新旧的 type；其余为纯列表，走「签名多数派」。 */
const DATED_TYPES = ['60s', 'ai-news'];

/* Step 34 · 二：ai-news 路径改为**按请求时刻动态生成**。
 * 实测（2026-10-08，5 台镜像行为一致）：
 *   · /v2/ai-news（不带参数）= 查「昨天」，数据源 ai-bot.cn 并非每天发布，
 *     昨天没发就一直空（这就是「AI资讯获取失败」的真因，与镜像无关）；
 *   · /v2/ai-news?date=YYYY-MM-DD = 查指定日期，有内容时返回该日条目；
 *   · /v2/ai-news?all = 全量（几百 KB），按 date 分组后取最新一组即可兜底。
 * 串行降级（主路径 → 昨天默认 → 全量）：主路径通常一发命中，避免每台镜像都拉全量。
 * /v2/ai_news（下划线）多数镜像 404，实测无用，移除。 */
function aiNewsPaths(now) {
  return [
    '/v2/ai-news?date=' + shanghaiDate(now),
    '/v2/ai-news',
    '/v2/ai-news?all'
  ];
}

/* type → 本次请求要问的路径组（ai-news 动态；其余静态）。
 * grabHost 对 ai-news 串行降级，对其它 type 保持「主路径 + 备用路径并发」。 */
const STATIC_ALT_PATHS = {};

/* type → 上游路径（任务给定映射）
 * 偏差说明：任务写的 /v2/douban/hot 上游实际 404，豆瓣真实接口为
 * /v2/douban/weekly/{subject}，这里取电影周报（字段 rank/title/rating/url/cover）。
 * Step 31 · 热榜扩展：60s API 实际提供的榜单全部搬进映射表（26 个 type），
 * 逐个在 5 台主机上实测过；已知不可用的不搬（/v2/dongchedi 恒空数组、
 * /v2/maoyan/realtime/* 在镜像上 code 500、/v2/netease/list、/v2/baidu/movie|variety 404）。 */
const PATHS = {
  'weibo': '/v2/weibo',
  'zhihu': '/v2/zhihu',
  'douyin': '/v2/douyin',
  'toutiao': '/v2/toutiao',
  'bili': '/v2/bili',
  'baidu': '/v2/baidu/hot',
  'rednote': '/v2/rednote',
  'douban': '/v2/douban/weekly/movie',
  '60s': '/v2/60s',
  'ai-news': '/v2/ai-news',
  'it-news': '/v2/it-news',
  /* —— Step 31 新增榜单 —— */
  'baidu-realtime': '/v2/baidu/realtime',
  'tieba': '/v2/baidu/tieba',
  'teleplay': '/v2/baidu/teleplay',
  'quark': '/v2/quark',
  'hackernews': '/v2/hacker-news/top',
  'hackernews-best': '/v2/hacker-news/best',
  'ithome-rank': '/v2/it-news/rank',
  'douban-tv': '/v2/douban/weekly/tv_chinese',
  'douban-tv-global': '/v2/douban/weekly/tv_global',
  'douban-show': '/v2/douban/weekly/show_chinese',
  'douban-show-global': '/v2/douban/weekly/show_global',
  'ncm-heat': '/v2/ncm-rank/3778678',
  'ncm-rise': '/v2/ncm-rank/19723756',
  'ncm-new': '/v2/ncm-rank/3779629',
  'ncm-original': '/v2/ncm-rank/2884035',
  'ncm-acg': '/v2/ncm-rank/71385702'
};

/* Step 32 · 一：缓存 1 分钟。手机与电脑常落在不同 isolate，长 TTL 会把一端的
 * 新鲜数据在另一端继续当作「最新」；1 分钟既挡住预加载的重复请求，又压小端间差异。 */
const CACHE_TTL = 60 * 1000;         /* isolate 内缓存：1 分钟 */
const TIMEOUT_MS = 10000;            /* 上游总超时 10s（任务约定，含所有主机） */
const HOST_BUDGET_MS = 6000;         /* 单主机预算（ai-news 在镜像上实测 ~5.2s，需容得下） */
const GRACE_AFTER_FIRST_MS = 1400;   /* 首包之后最多再等这么久做横向比较 */
const WAVE_MIN_LEFT_MS = 1200;       /* 补一轮仲裁的最低剩余预算 */
const WAVE_BUDGET_MS = 2600;         /* 仲裁轮的单主机预算（第一轮已经等过，不该再各等 6s） */
const STALE_MS = 10 * 60 * 1000;     /* 确实落后的镜像降权 10 分钟 */
const DOWN_MS = 10 * 60 * 1000;      /* 故障主机移到队尾 10 分钟（原 Step 30.1 冷却语义） */
const FALLBACK_MS = 5 * 60 * 1000;   /* 全源失败时可回退的旧数据时效 */
const FALLBACK_MAX_AGE_MS = 3 * 3600 * 1000; /* 旧数据最多兜 3 小时 */
const POLL_MS = 300;                 /* 增量收口的轮询间隔（等待回包 / 唤醒） */
/* Step 34 · 三：CF Cache API 边缘缓存（跨 isolate 共享）。
 * 比 isolate 缓存（60s）略短：isolate 活着时优先用进程内缓存；isolate 冷启动时
 * 45s 内还能吃到边缘缓存，不必全量回源。客户端响应仍 no-store（下拉刷新要真请求）。 */
const EDGE_TTL_S = 45;

/* type → { ts, json }；命中缓存直接复用同一份响应体字符串 */
const cache = new Map();
/* type → 上一轮择优结果（命中缓存时打日志用，不再打上游） */
const chosen = new Map();
/* host → 降权到期时间戳（存在更新的源而它没有 → 核心轮不再问它） */
const staleUntil = new Map();
/* host → 冷却到期时间戳（故障主机；只影响顺序，不再据此判死） */
const hostDown = new Map();
/* host → 「本轮被证明是少数派」到期时间戳（内容和大家都不一样；同样只影响取舍顺序） */
const hostOutlier = new Map();
/* type → { entry, at }：本轮未胜出但有效的数据，留给「全源失败」兜底 */
const fallback = new Map();
/* 本 isolate 内上一次「证实新鲜」的主机；null = 还没有主机被证实可用 */
let preferred = null;

/* 失败响应体：msg 为任务给定文案；error.message / message 双写，
 * 让 LB.api.getJSON（Step 29 起透传 d.msg / d.error.message）拿到同一句话。 */
function failBody(detail) {
  const msg = '数据获取失败，请稍后重试';
  return {
    code: 500,
    msg: msg,
    message: msg,
    error: { code: 500, message: msg },
    detail: String(detail || '').slice(0, 200)
  };
}

/* ==== Step 33 · 新鲜度判定 ==== */

/* 东八区「某天」的 YYYY-MM-DD（与上游 data.date 口径一致；固定 UTC+8，不受运行环境影响） */
function shanghaiDate(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/* 带日期 type 的达标线：上游自身有更新延迟，允许差 1 天；
 * 只有 1 台有内容时放宽到 3 天，避免 ai-news 这类全站都在补数据的接口被误杀。 */
function dateCutoff(witnessCount, now) {
  const days = witnessCount >= 2 ? 1 : 3;
  return shanghaiDate(now - days * 86400000);
}

/* 「昨天」：带日期 type 只要拿到昨天或今天的数据就认为已经是当前能拿到的最新，
 * 不必再为「也许某台有今天」去多等一两秒（热搜榜单分钟级更新，资讯类按天更新）。 */
function yesterdayDate(now) {
  return shanghaiDate(now - 86400000);
}

/* 列表条数：60s / ai-news 是 {date, news:[]}，热榜类是数组，个别是 {list:[]} */
function listLen(d) {
  if (!d || typeof d !== 'object' || !('data' in d)) return 0;
  const x = d.data;
  if (Array.isArray(x)) return x.length;
  if (x && typeof x === 'object') {
    if (Array.isArray(x.news)) return x.news.length;
    if (Array.isArray(x.list)) return x.list.length;
    return Object.keys(x).length;
  }
  return 0;
}

/* data 为空数组 / 空对象 / news 列表为空 → 视为无内容（Step 32 约定不变） */
function isEmptyPayload(d) {
  if (!('data' in d)) return false;           /* 无 data 字段的形态不猜，交给上层 */
  const x = d.data;
  if (Array.isArray(x)) return x.length === 0;
  if (x && typeof x === 'object') {
    if (Array.isArray(x.news)) return x.news.length === 0;
    return Object.keys(x).length === 0;
  }
  return x === null || x === undefined || x === '';
}

/* 比对时要忽略的字段：数值（热度 / 点赞 / 评分人数各镜像各自实时抓取，天然不同）
 * 与时间戳类（api_updated / updated_at 每台刷新时刻不同）。
 * 实测（2026-10-08）：/v2/douban/weekly/movie 五台的 rating_count 全不一样，
 * 去掉数值后 5/5 同签名；/v2/bili 去掉数值后 crystelf / 7se / elysiayanyu 同签名，
 * mizhoubaobei 因列表顺序不同而签名不同 —— 正是「多数派」要挑出来的那种落选。 */
const VOLATILE_KEY = /api_updated|updated_at|created_at|updated|created|exec_time|tips|share_url|^update/i;

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (typeof v[k] === 'number' || VOLATILE_KEY.test(k)) continue;
      o[k] = canonical(v[k]);
    }
    return o;
  }
  if (typeof v === 'number') return null;
  /* URL 只留「资源本体（path）」：实测 /v2/douyin 的 cover 各家镜像是同一张图，
   * 但 CDN 主机与签名参数都不同（p9-sign…?signature=x vs p3-sign…?signature=y），
   * 按整串比对会把内容完全一致的镜像判成两个签名（agree=1，白补一轮仲裁）。
   * path 才是资源身份；榜单条目的 link 同理（query 全是跟踪参数）。 */
  if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
    try { return new URL(v).pathname; } catch (_) { return v.split(/[?#]/)[0]; }
  }
  return v;
}

/* 内容签名：同一榜单在不同镜像上内容一致 → 同一签名，用于「多数派」判定 */
function signatureOf(d) {
  const payload = (d && typeof d === 'object' && 'data' in d) ? canonical(d.data) : canonical(d);
  let h = 5381;
  const s = JSON.stringify(payload).slice(0, 30000);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '-' + s.length;
}

/* 多数派强度（同一签名的最大重复次数）与签名本身 */
function topCount(list) {
  const counts = new Map();
  for (const r of list) counts.set(r.sig, (counts.get(r.sig) || 0) + 1);
  let top = 0;
  counts.forEach(c => { if (c > top) top = c; });
  return top;
}

function majoritySig(list) {
  const counts = new Map();
  for (const r of list) counts.set(r.sig, (counts.get(r.sig) || 0) + 1);
  let key = list.length ? list[0].sig : '';
  let top = 0;
  counts.forEach((c, k) => { if (c > top) { top = c; key = k; } });
  return key;
}

/* 是否带日期的 type */
function isDated(type) { return DATED_TYPES.indexOf(type) > -1; }

/* 取一台主机一个路径。约定不变：只有真正打上游才打 '[60s] type= … status='；
 * ai-news 额外打上游状态与原始返回前 300 字符（先取 text 才能看到「200 但 news 为空」）。 */
async function grab(host, type, path, budget) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budget);
  const startedAt = Date.now();
  try {
    const res = await fetch(host + path, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LiteBox/5.0 (+https://litebox.app)' }
    });
    console.log('[60s] type=', type, 'status=', res.status);
    const text = await res.text();
    if (type === 'ai-news') {
      console.log('[60s] ai-news upstream status=', res.status);
      console.log('[60s] ai-news raw=', String(text).slice(0, 300));
    }
    if (!res.ok) return { state: 'failed', host: host, path: path, err: 'HTTP ' + res.status };
    let d = null;
    try { d = JSON.parse(text); } catch (_) { d = null; }
    if (!d || typeof d !== 'object') return { state: 'failed', host: host, path: path, err: 'bad-json' };
    /* 上游业务错误码（如 /v2/bili 间歇 code=500）按失败处理，且不进缓存 */
    if (d.code !== undefined && Number(d.code) !== 200) {
      return { state: 'failed', host: host, path: path, err: 'upstream-code-' + d.code };
    }
    /* Step 34 · 二：?all 的全量响应收敛成「最新日期的一组」再参与择优 ——
     * 上游按日期发布，全量列表里最新的一组才是「当前能给到的最新内容」；
     * 收敛后 data.date 与 date 路径同形态，新鲜度判定 / 签名比对照常工作。 */
    if (/[?&]all\b/.test(path) && d.data && typeof d.data === 'object' && Array.isArray(d.data.news)) {
      const byDate = new Map();
      for (const n of d.data.news) {
        const dt = String((n && n.date) || '');
        if (!dt) continue;
        if (!byDate.has(dt)) byDate.set(dt, []);
        byDate.get(dt).push(n);
      }
      let bestDate = '';
      byDate.forEach((_, k) => { if (k > bestDate) bestDate = k; });
      const bestList = byDate.get(bestDate) || [];
      d = { code: d.code, message: d.message, data: { date: bestDate, news: bestList } };
      console.log('[60s] ai-news all-path collapsed date=', bestDate, 'items=', bestList.length);
    }
    /* 空数据按失败处理（换源）：个别镜像会 code:200 但 data 为空数组 */
    if (isEmptyPayload(d)) return { state: 'failed', host: host, path: path, err: 'empty-payload' };
    const body = JSON.stringify(d);
    return {
      state: 'ok',
      host: host,
      path: path,
      body: body,
      date: (d.data && typeof d.data === 'object' && d.data.date) ? String(d.data.date) : '',
      len: listLen(d),
      sig: signatureOf(d),
      elapsed: Date.now() - startedAt,
      ts: Date.now()
    };
  } catch (e) {
    return { state: 'failed', host: host, path: path, err: (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/* 一台主机取数。
 * 普通类型：主路径 + 备用路径**并发**问（共用这一台的预算），任一有效即取；
 * ai-news（Step 34）：三档路径**串行**降级 —— 主路径 ?date=今天 通常一发命中，
 * 命中就不再拉几百 KB 的 ?all 全量；每档用「当前剩余预算」，总和不超过本轮 deadline。 */
async function grabHost(host, type, budget, deadline) {
  const isAi = type === 'ai-news';
  const paths = isAi
    ? aiNewsPaths(Date.now())
    : [PATHS[type]].concat(STATIC_ALT_PATHS[type] || []);
  if (!isAi) {
    const results = await Promise.all(paths.map(p => grab(host, type, p, budget)));
    const ok = results.find(r => r.state === 'ok');
    return ok || results[0];
  }
  let first = null;
  for (const p of paths) {
    const left = Math.max(800, (deadline || (Date.now() + budget)) - Date.now());
    const r = await grab(host, type, p, Math.min(budget, left));
    if (r.state === 'ok') return r;
    if (!first) first = r;
    if (Date.now() >= (deadline || 0)) break;
  }
  return first || { state: 'failed', host: host, path: paths[0], err: 'no-attempt' };
}

/* 从若干有效响应里选最优。
 * 带日期：日期最新优先；纯列表：先避开「刚被证明是少数派」的镜像（没有多数派可比时，
 * 这是唯一可用的新旧线索 —— 上次落单的镜像这次大概率还是落单的旧源），
 * 再按条数多、回包快。 */
function bestOf(pool, dated, now) {
  return pool.slice().sort((a, b) => {
    if (dated && a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (!dated) {
      const oa = (hostOutlier.get(a.host) || 0) > now ? 1 : 0;
      const ob = (hostOutlier.get(b.host) || 0) > now ? 1 : 0;
      if (oa !== ob) return oa - ob;
    }
    if (a.len !== b.len) return b.len - a.len;
    return a.elapsed - b.elapsed;
  })[0];
}

/* 择优：带日期 type 用「达标线之上取最新日期」，纯列表 type 用「签名多数派」；
 * 达标线之下的有效数据降级为 stale（可兜底，但不算成功源）。 */
function decide(type, responses, now) {
  const okList = responses.filter(r => r.state === 'ok');
  const failList = responses.filter(r => r.state !== 'ok');
  const dated = isDated(type);
  if (!okList.length) {
    const err = failList.length ? (failList[0].err || 'upstream-error') : 'no-upstream-host';
    return { state: 'failed', err: err, winner: null, fresh: [], stale: [], fails: failList, top: 0 };
  }
  const cutoff = dateCutoff(okList.length, now);
  const fresh = okList.filter(r => !dated || (r.date && r.date >= cutoff));
  const stale = okList.filter(r => fresh.indexOf(r) === -1);
  if (!fresh.length) {
    return { state: 'stale', winner: bestOf(stale, dated, now), fresh: [], stale: stale, fails: failList, top: 0 };
  }
  let pool = fresh;
  let top = fresh.length;
  if (dated) {
    const bestDate = fresh.reduce((m, r) => (r.date > m ? r.date : m), fresh[0].date);
    pool = fresh.filter(r => r.date === bestDate);
  } else {
    top = topCount(fresh);
    const key = majoritySig(fresh);
    /* 有 ≥2 票时，落单的那几台记入少数派名单（10 分钟），供没有多数派时参考 */
    if (top >= 2) {
      for (const r of fresh) if (r.sig !== key) hostOutlier.set(r.host, now + STALE_MS);
      pool = fresh.filter(r => r.sig === key);
    }
  }
  return { state: 'ok', winner: bestOf(pool, dated, now), fresh: fresh, stale: stale, fails: failList, top: top };
}

/* 核心轮里「可以现在就定案」的条件：已经拿到不可能被超越的数据 */
function commitable(type, results, now, settledAll, firstOkAt, deadline) {
  const okList = results.filter(r => r.state === 'ok');
  if (settledAll || Date.now() >= deadline) return true;
  if (!okList.length) return false;
  if (isDated(type)) {
    /* 拿到今天或昨天的数据即刻收口；更旧则最多等 GRACE（可能还有更快的源没回包） */
    const floor = yesterdayDate(Date.now());
    if (okList.some(r => r.date && r.date >= floor)) return true;
  } else if (okList.length >= 2 && topCount(okList) >= 2) {
    return true;                                  /* 多数派已成立 */
  }
  return !!firstOkAt && Date.now() - firstOkAt >= GRACE_AFTER_FIRST_MS;
}

/* 需要补一轮仲裁的情形：结论不可信（没有当日数据 / 签名不一致 / 有效源太少 / 全失败）。
 * Step 34：带日期类型「已经拿到**今天**的数据」时不再仲裁 —— 日期是最强的新鲜证据
 * （孤源今天的数据 > 三台昨天的数据），不必为凑「多台见证」白等慢镜像 3~5s；
 * 只有数据一律不是今天（滞后）时才扩大搜索找更新的源。 */
function needsWidening(type, results, picked) {
  if (picked.state !== 'ok') return true;
  const okList = results.filter(r => r.state === 'ok');
  if (okList.length < 2) {
    if (isDated(type)) {
      const today = shanghaiDate(Date.now());
      return !okList.some(r => r.date === today);   /* 孤源但已是今天 → 免仲裁 */
    }
    return true;                                    /* 孤源无从比较，正是本次事故形态 */
  }
  if (isDated(type)) {
    /* 已经拿到今天/昨天的数据就无需再问；只有一律比昨天更旧时才仲裁 */
    const floor = yesterdayDate(Date.now());
    return !okList.some(r => r.date && r.date >= floor);
  }
  return picked.top < 2;                          /* 两台内容不一致，需要第三票 */
}

/* 过期记录清理（与 LB.cache 的 clean() 同理，别在内存里留着旧条目） */
function cleanTimed(now) {
  staleUntil.forEach((until, host) => { if (until <= now) staleUntil.delete(host); });
  hostDown.forEach((until, host) => { if (until <= now) hostDown.delete(host); });
  hostOutlier.forEach((until, host) => { if (until <= now) hostOutlier.delete(host); });
}

/* 问源顺序：证实新鲜的 preferred 提到队首，故障 / 降权的移到队尾。
 * 「旧数据」不判死，只是不再优先——下次它若变新鲜，仍会被多数派逻辑选中。 */
function hostOrder(now) {
  const list = HOSTS.slice();
  const rank = h => (preferred === h ? 0 : ((hostDown.get(h) || 0) > now ? 3 : ((staleUntil.get(h) || 0) > now ? 2 : 1)));
  list.sort((a, b) => rank(a) - rank(b) || HOSTS.indexOf(a) - HOSTS.indexOf(b));
  return list;
}

/* 并发问一批主机，边回包边判断能否定案（增量收口，不等最慢的一台）。
 * cap 用于区分「核心轮（给满预算）」与「仲裁轮（第一轮已经等过，不该再各等 6s）」。 */
async function raceWave(type, list, now, deadline, cap) {
  const results = [];
  let wake = null;
  let settledAll = false;
  let firstOkAt = 0;
  const wakeUp = () => { const w = wake; wake = null; if (w) w(); };
  const inflight = list.map(h => {
    const budget = Math.max(500, Math.min(cap || HOST_BUDGET_MS, deadline - Date.now()));
    return grabHost(h, type, budget, deadline).then(r => {
      results.push(r);
      if (r.state === 'ok' && !firstOkAt) firstOkAt = Date.now();
      /* 提前收口后，这一台可能还在回包 —— 它的故障也要记下来，否则下次又白等 */
      if (r.state !== 'ok' && isHostFailure(r.err)) hostDown.set(h, Date.now() + DOWN_MS);
      wakeUp();
    });
  });
  Promise.allSettled(inflight).then(() => { settledAll = true; wakeUp(); });
  while (!commitable(type, results, now, settledAll, firstOkAt, deadline)) {
    await new Promise(res => { wake = res; setTimeout(res, POLL_MS); });
  }
  return { results: results, settled: settledAll, asked: list.length };
}

/* 把未胜出的有效数据存成兜底（镜像集体滞后 / 超预算时不至于给用户报错） */
function keepFallback(type, picked, winner) {
  const dated = isDated(type);
  const pool = [];
  for (const r of (picked.fresh || [])) if (r.body !== winner.body) pool.push(r);
  for (const r of (picked.stale || [])) if (r.body !== winner.body) pool.push(r);
  if (!pool.length) return;
  const best = bestOf(pool, dated, Date.now());
  const prev = fallback.get(type);
  if (!prev || best.ts >= prev.entry.ts) fallback.set(type, { entry: best, at: Date.now() });
}

/* 是否算「这一台主机本身有问题」（值得移到队尾）：
 * 网络异常 / 超时 / 非 JSON / 5xx / 403（cf-connecting-ip 被拒）。
 * 而 empty-payload 与 404 只是**这条路径**在该台没内容
 * （实测 ai-news 只有 mizhoubaobei 有数据），据此降级会把真正新鲜的镜像挤到队尾，
 * 反而复现本次事故，所以不算故障。 */
function isHostFailure(err) {
  const e = String(err || '');
  if (e === 'empty-payload') return false;
  if (e === 'HTTP 404' || e.indexOf('upstream-code-404') === 0) return false;
  return true;
}
function markStaleHosts(list, now) {
  for (const r of list) if (r && r.host) staleUntil.set(r.host, now + STALE_MS);
}

/* 多主机并发取数（Step 33 两轮制）：核心轮能定案就返回，结论不可信才补一轮仲裁。
 * opts.shallow = true 时跳过仲裁轮（批量端点用：一次请求几十个 subrequest，
 * CF 免费版每请求上限 50，宁可接受「孤源/少数派」也不爆预算）。 */
async function fetchUpstream(type, opts) {
  const shallow = !!(opts && opts.shallow);
  const deadline = Date.now() + TIMEOUT_MS;   /* 单次请求的上游总预算（任务约定 10s） */
  const now = Date.now();
  cleanTimed(now);
  const order = hostOrder(now);
  const core = order.slice(0, CORE_COUNT);
  const rest = shallow ? [] : order.slice(CORE_COUNT);

  let wave = await raceWave(type, core, now, deadline);
  let results = wave.results;
  let picked = decide(type, results, now);

  if (rest.length && needsWidening(type, results, picked) && deadline - Date.now() > WAVE_MIN_LEFT_MS) {
    console.log('[60s] widen type=', type, 'reason=', picked.state === 'ok' ? 'unconfirmed' : picked.state);
    const wave2 = await raceWave(type, rest, now, deadline, picked.winner ? WAVE_BUDGET_MS : 0);
    results = results.concat(wave2.results);
    picked = decide(type, results, now);
  }

  if (picked.winner) {
    const winner = picked.winner;
    /* preferred 只由达标数据设置；落后镜像只有在「确实存在更新的源」时才降权 ——
     * 全场都滞后（state==='stale'）时不惩罚唯一有内容的镜像，否则 ai-news 会被打死。 */
    if (picked.state === 'stale') {
      console.log('[60s] all-behind type=', type, 'best=', winner.date || '-');
    } else {
      preferred = winner.host;
      staleUntil.delete(winner.host);
      if (picked.stale.length) markStaleHosts(picked.stale, Date.now());
    }
    keepFallback(type, picked, winner);
    chosen.set(type, { host: winner.host, path: winner.path, date: winner.date, elapsed: winner.elapsed });
    console.log('[60s] decided type=', type,
      'host=', String(winner.host).replace(/^https:\/\//, ''),
      'path=', winner.path,
      'date=', winner.date || '-',
      'items=', winner.len,
      'ms=', winner.elapsed,
      'verdict=', picked.state === 'ok' ? 'fresh' : picked.state,
      'witnesses=', (picked.fresh.length + picked.stale.length) + '/' + results.length,
      'agree=', picked.top || '-',
      picked.state === 'ok' && isDated(type) && winner.date < yesterdayDate(Date.now()) ? 'lagging' : '');
    return winner.body;
  }

  /* 全部失败 → 用 5 分钟内（且不过于陈旧）的旧数据兜底 */
  const fb = fallback.get(type);
  if (fb && Date.now() - fb.at <= FALLBACK_MS) {
    const e = fb.entry;
    const tooOld = e.date && isDated(type)
      ? (shanghaiDate(Date.now()) > e.date && Date.now() - e.ts > FALLBACK_MAX_AGE_MS)
      : (Date.now() - e.ts > FALLBACK_MAX_AGE_MS);
    if (!tooOld) {
      console.log('[60s] serve fallback type=', type, 'host=', String(e.host).replace(/^https:\/\//, ''), 'date=', e.date || '-');
      return e.body;
    }
    fallback.delete(type);
  }
  throw new Error(picked.err || 'no-upstream-host');
}

/* 缓存读 + 上游取数：同 type 在 CACHE_TTL（1 分钟）内只打一次上游。
 * opts 透传给 fetchUpstream（批量端点用 shallow）。 */
async function getBody(type, opts) {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    const c = chosen.get(type);
    if (c) {
      console.log('[60s] cache hit type=', type,
        'host=', String(c.host).replace(/^https:\/\//, ''),
        'date=', c.date || '-',
        'age=', Math.round((Date.now() - hit.ts) / 1000) + 's');
    }
    return hit.json;
  }
  /* 任务给定日志：这次是真的回源取数（而不是命中缓存） */
  console.log('[60s] fetch fresh, type=', type);
  const fresh = await fetchUpstream(type, opts);
  cache.set(type, { ts: Date.now(), json: fresh });
  return fresh;
}

/* 归一化缓存 key：只保留 type 参数 —— 前端 &_t= 防缓存参数不参与边缘缓存 key
 * （防的是浏览器/旧边缘行为；边缘缓存的 key 由本文件控制，归一化后同一 type
 * 在任何 query 变体下都命中同一份缓存）。 */
function normCacheUrl(rawUrl, type) {
  const u = new URL(rawUrl);
  u.search = '?type=' + encodeURIComponent(type);
  u.hash = '';
  return u.toString();
}

/* Step 34 · 三：CF Cache API 边缘缓存（跨 isolate 共享）。
 * 返回给客户端的仍带 no-store（下拉刷新必须真请求），放进边缘缓存的是
 * 带 s-maxage 的副本 —— Pages Functions 的 isolate 命中率不可控，边缘缓存
 * 让「手机端冷启动」也能 50ms 内吃到上一轮的数据。 */
async function edgeGet(cacheKey) {
  try {
    const hit = await caches.default.match(cacheKey);
    if (!hit) return null;
    return await hit.text();
  } catch (_) {
    return null;   /* 本地 dev / 运行时不支持 Cache API 时静默降级 */
  }
}

function edgePut(context, cacheKey, body) {
  try {
    const resp = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=' + EDGE_TTL_S
      }
    });
    const p = caches.default.put(cacheKey, resp);
    if (context && context.waitUntil) context.waitUntil(p);
  } catch (_) { /* 同上：不支持就退化为 isolate 缓存 */ }
}

/* 供 60s-multi.js 复用：type 白名单、按类型取数、统一失败体 */
export { getBody, failBody, shanghaiDate };
export function isSupportedType(t) { return !!PATHS[t]; }

export async function onRequest(context) {
  const { request } = context;
  /* 只读接口：非 GET（HEAD 之外的 POST/PUT 等）直接按失败约定返回 */
  if (request.method !== 'GET') return json(failBody('method: ' + request.method), 500);
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || '';

  if (!PATHS[type]) return json(failBody('unsupported-type: ' + type), 500);

  /* 边缘缓存读：key = 归一化 URL（剥掉 _t 等防缓存参数） */
  const cacheKey = new Request(normCacheUrl(request.url, type), { method: 'GET' });
  const edgeBody = await edgeGet(cacheKey);
  if (edgeBody !== null) {
    console.log('[60s] edge hit type=', type);
    return new Response(edgeBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  try {
    const body = await getBody(type);
    edgePut(context, cacheKey, body);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return json(failBody(e && e.message), 500);
  }
}
