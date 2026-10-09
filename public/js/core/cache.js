/* LiteBox v5 · core/cache.js — 异步结果内存缓存（Step 9 新增）
 *
 * 目标：修复「切走再切回就重发一遍请求」的浪费（iplookup 重发 3 次、
 * wallpaper 单次进入约 29 个图片请求，切回再发一遍）。
 *
 * 用法：
 *   const data = await LB.cache('iplookup:self', 3 * 60 * 1000, () => doFetch());
 *   - 命中未过期 → 直接返回上次数据，fetcher 不执行；
 *   - 并发调用同 key → 共享同一个 Promise（不会重复发）；
 *   - fetcher 失败 → 该 key 立即失效，下次重试。
 * 仅内存缓存（刷新即清），不写 localStorage —— 数据新鲜度由各调用方的 TTL 决定。
 */
(function() {
  window.LB = window.LB || {};

  const store = new Map();   /* key → { promise, ts, data } */

  /**
   * 缓存异步结果
   * @param key     唯一缓存键
   * @param ttl     有效期毫秒
   * @param fetcher 返回 Promise 的函数
   */
  LB.cache = async function(key, ttl, fetcher) {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.ts < ttl) {
      return hit.data || await hit.promise;   /* 命中未过期 */
    }
    const promise = Promise.resolve().then(fetcher).then(data => {
      store.set(key, { ts: Date.now(), data, promise: null });
      return data;
    }).catch(err => {
      store.delete(key);
      throw err;
    });
    store.set(key, { ts: now, data: null, promise });
    return promise;
  };

  /* 清缓存：无 prefix 全清；有 prefix 按前缀清（如 LB.cache.clear('wallpaper:')） */
  LB.cache.clear = function(prefix) {
    if (!prefix) return store.clear();
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  };
})();
