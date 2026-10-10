/* LiteBox v5 · core/storage.js — 安全本地存储（localStorage 不可用时内存兜底） */
(() => {
  window.LB = window.LB || {};
  LB.storage = (() => {
    const mem = new Map();
    const real = (() => { try { const k='__t__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return localStorage; } catch(_) { return null; } })();
    return {
      get(k, def = null) { try { const v = real ? real.getItem(k) : mem.get(k); return v == null ? def : JSON.parse(v); } catch(_) { return def; } },
      set(k, v) { const s = JSON.stringify(v); real ? real.setItem(k, s) : mem.set(k, s); },
      remove(k) { real ? real.removeItem(k) : mem.delete(k); },
      keys() { return real ? Object.keys(real) : [...mem.keys()]; }
    };
  })();
})();
