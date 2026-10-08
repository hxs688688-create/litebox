/* LiteBox v5 · functions/api/60s.js — 60s API 统一代理
 * （Step 30 · 三 多主机 + Step 30.1 修线上 403 + Step 32 缓存 1 分钟 + Step 33 并发择优）
 *
 * GET /api/60s?type=weibo|zhihu|douyin|toutiao|bili|baidu|rednote|douban|60s|ai-news|it-news …
 *
 * 热榜聚合 + 每日 60s / AI 资讯 / IT 资讯全部走本端点；
 * 上游域名只存在于后端，前端不持有任何站外地址（红线：前端零上游域名）。
 *
 * 任务给定约定（逐条保留）：
 *   - type → 上游路径映射表 PATHS（唯一真源）
 *   - 缓存：Map + 时间戳，同 type 命中缓存不再打上游（Step 32：1 分钟）
 *   - 上游超时 10s（单次请求的**总**预算，含所有主机）
 *   - 失败统一 { code: 500, msg: '数据获取失败，请稍后重试' }
 *   - 每次实际打上游都记日志 console.log('[60s] type=', type, 'status=', res.status)
 *
 * Step 30.1（线上 403）：Cloudflare 在 CF 边缘之间转发时会注入 cf-connecting-ip，
 *   主域名站点的 CDN 规则对该头直接回 403（error code: 1000）。所以保留任务给定的
 *   主域名做首选，后面挂若干**不在 Cloudflare 后面**的官方社区公共实例。
 *
 * Step 33 · 一（线上「热搜一直是前几天的热搜」的真实原因与解法）：
 *   现象：手机永远显示前一两天的热搜，无痕模式也一样，只有电脑是实时的。
 *   定位：不是浏览器缓存，而是**服务端选源**（无痕无效正好证明脏数据在服务端）。
 *   上一版按 HOSTS 顺序「第一台非空即成功」，谁回得快谁就成为 preferred，且失败才降权、
 *   「数据旧」完全不 penalise。实测各镜像更新速度差异很大（2026-10-08 逐台对比）：
 *     · /v2/60s     7se / crystelf / elysiayanyu / viki 全部 10-08，mizhoubaobei 10-07
 *     · /v2/ai-news crystelf 空 · 7se 空 · viki 空 · mizhoubaobei 有 3 条（10-06）
 *     · /v2/weibo   crystelf / 7se / elysiayanyu / viki 同内容，mizhoubaobei 签名不同（滞后）
 *   Cloudflare Pages Functions 是 **isolate 级隔离**：preferred / 缓存只活在当前进程，
 *   手机与电脑通常落在不同 isolate 上。手机那台冷启动先撞上「回包最快、数据最旧」的
 *   镜像，preferred 就此钉死在旧源 → 「只有电脑是实时的」。
 *   本版改法（不再赌运气）：
 *     1) **并发问核心镜像**（一次 3 台），而不是顺序试到第一台非空就停；
 *     2) **按新鲜度择优**：data 带日期的（60s / ai-news）取达标线之上且日期最大的；
 *        纯列表热搜取**内容签名重复最多**的（多数派）——个别镜像滞后时它自然落选；
 *     3) preferred 只由「证实新鲜的胜出者」设置；只有当**确实存在更新的源**时，
 *        落后的镜像才降权 10 分钟（全场都滞后时不惩罚唯一有内容的镜像，否则会把
 *        ai-news 这类镜像打死）；失败主机移到队尾（原冷却语义保留，只影响顺序不影响生死）；
 *     4) **两轮制**：核心 3 台已能定案就直接返回（常见耗时 0.3~0.8s）；
 *        只有「没有当日数据 / 两台内容不一致 / 有效源不足 2 台 / 全失败」时，
 *        才对剩余镜像补一轮仲裁，并在剩余预算内取最优；
 *     5) 增量收口：核心轮里一旦出现「不可能被超越」的数据（当日已到 / 多数派成立）
 *        立刻返回，不等最慢的一台。
 *   失败兜底：全源失败时用 5 分钟内且不过于陈旧的上一轮数据，「总比报错强」。
 */
import { json } from '../_utils.js';

/* 上游主机候选。任务给定的 Base URL 排在首位；其余为 60s API 官方文档「公共实例列表」
 * 中的实例，均已实测 11+ 个 type：字段结构与主域名一致（同日期 / 同农历 / 同条数），
 * 且站在 nginx / 腾讯云 EdgeOne 后面，不会因为 cf-connecting-ip 被拒。
 * 数组顺序 = 核心轮取样顺序（择优逻辑本身不依赖顺序）：
 *   · 前 CORE_COUNT 台是**常态并发**，挑「更新跟得上主域名」的实例；
 *   · 后面两台只在结论不可信时补一轮仲裁 —— 里面放了最快但**系统性滞后**的
 *     mizhoubaobei（实测 60s 榜停在昨天、weibo/zhihu 内容签名与多数派不一致，
 *     只有 ai-news 它有内容）。它在核心轮里既抢不到 preferred，也不拖慢收口。 */
const HOSTS = [
  'https://60s.viki.moe',          /* 任务给定主域名（Cloudflare 上，CF 内访问会被 403） */
  'https://60s.crystelf.top',      /* 社区实例 · nginx（实测与主域名逐字一致） */
  'https://60s.7se.cn',            /* 社区实例 · nginx（同上） */
  'https://60s.mizhoubaobei.top',  /* 社区实例 · TencentEdgeOne（最快但常滞后一天；ai-news 唯一有内容） */
  'https://api.elysiayanyu.top'    /* 社区实例 · TencentEdgeOne（较慢，ai-news 偶发空列表，靠空数据校验兜住） */
];

/* 核心轮并发台数：3 台足够形成「多数派」，又不会给公共镜像带去 5 倍请求量；
 * 结论不可信时再对剩下的补一轮仲裁。 */
const CORE_COUNT = 3;

/* 内容带日期、可直接判新旧的 type；其余为纯列表，走「签名多数派」。 */
const DATED_TYPES = ['60s', 'ai-news'];

/* Step 32 · 二：ai-news 备用路径（与主路径并发问，谁有效用谁）。
 * 实测（2026-10-08）：
 *   · /v2/ai-news 只有 mizhoubaobei 有内容（date 10-06），其余镜像 date 到 10-07 但 news 为空
 *   · 任务书写的是 /v2/ai_news（下划线），多数镜像对该路径直接 404；保留是为了
 *     万一某台只实现官方写法时仍能取到数据。404 回得快，不挤占 10s 预算。
 *   · 空数组会被空数据校验判为失败，所以「200 但空」不会污染择优结果。 */
const ALT_PATHS = {
  'ai-news': ['/v2/ai_news', '/v2/news/ai']
};

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
const CACHE_TTL = 60 * 1000;         /* Step 32：1 分钟 */
const TIMEOUT_MS = 10000;            /* 上游总超时 10s（任务约定，含所有主机） */
const HOST_BUDGET_MS = 6000;         /* 正常单主机预算（ai-news 在镜像上实测 ~5.2s，需容得下） */
const PROBE_BUDGET_MS = 3000;        /* 主域名在未证实新鲜前的短预算 */
const GRACE_AFTER_FIRST_MS = 1400;   /* 首包之后最多再等这么久做横向比较 */
const WAVE_MIN_LEFT_MS = 1200;       /* 补一轮仲裁的最低剩余预算 */
const WAVE_BUDGET_MS = 2600;         /* 仲裁轮的单主机预算（第一轮已经等过，不该再各等 6s） */
const STALE_MS = 10 * 60 * 1000;     /* 确实落后的镜像降权 10 分钟 */
const DOWN_MS = 10 * 60 * 1000;      /* 故障主机移到队尾 10 分钟（原 Step 30.1 冷却语义） */
const FALLBACK_MS = 5 * 60 * 1000;   /* 全源失败时可回退的旧数据时效 */
const FALLBACK_MAX_AGE_MS = 3 * 3600 * 1000; /* 旧数据最多兜 3 小时 */
const POLL_MS = 300;                 /* 增量收口的轮询间隔（等待回包 / 唤醒） */

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

/* 单主机预算。主域名是唯一「已知从 Cloudflare 内部会被 403」的一台，且 403 延迟不可控
 * （实测 0.9s ~ 13.3s）——并发模式下它拖满会让整轮收口变慢，所以在「被证实新鲜之前」
 * 只给 PROBE_BUDGET_MS；真成功过就恢复正常预算。镜像一律给满预算。 */
function hostBudget(host) {
  return (host === HOSTS[0] && host !== preferred) ? PROBE_BUDGET_MS : HOST_BUDGET_MS;
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

/* 一台主机：主路径与备用路径并发问（共用这一台的预算），任一有效即取，全失败回第一条错误 */
async function grabHost(host, type, budget) {
  const paths = [PATHS[type]].concat(ALT_PATHS[type] || []);
  const results = await Promise.all(paths.map(p => grab(host, type, p, budget)));
  const ok = results.find(r => r.state === 'ok');
  return ok || results[0];
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

/* 需要补一轮仲裁的情形：结论不可信（没有当日数据 / 签名不一致 / 有效源太少 / 全失败） */
function needsWidening(type, results, picked) {
  if (picked.state !== 'ok') return true;
  const okList = results.filter(r => r.state === 'ok');
  if (okList.length < 2) return true;             /* 孤源无从比较，正是本次事故形态 */
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
    const budget = Math.max(500, Math.min(hostBudget(h), cap || HOST_BUDGET_MS, deadline - Date.now()));
    return grabHost(h, type, budget).then(r => {
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

/* 多主机并发取数（Step 33 两轮制）：核心轮能定案就返回，结论不可信才补一轮仲裁 */
async function fetchUpstream(type) {
  const deadline = Date.now() + TIMEOUT_MS;   /* 单次请求的上游总预算（任务约定 10s） */
  const now = Date.now();
  cleanTimed(now);
  const order = hostOrder(now);
  const core = order.slice(0, CORE_COUNT);
  const rest = order.slice(CORE_COUNT);

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

/* 缓存读 + 上游取数：同 type 在 CACHE_TTL（1 分钟）内只打一次上游 */
async function getBody(type) {
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
  const fresh = await fetchUpstream(type);
  cache.set(type, { ts: Date.now(), json: fresh });
  return fresh;
}

export async function onRequest(context) {
  const { request } = context;
  /* 只读接口：非 GET（HEAD 之外的 POST/PUT 等）直接按失败约定返回 */
  if (request.method !== 'GET') return json(failBody('method: ' + request.method), 500);
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || '';

  if (!PATHS[type]) return json(failBody('unsupported-type: ' + type), 500);

  try {
    const body = await getBody(type);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return json(failBody(e && e.message), 500);
  }
}
