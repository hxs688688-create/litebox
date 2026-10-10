/* LiteBox v5 · core/hash.js — Hash 路由原语 */
(() => {
  window.LB = window.LB || {};
  LB.hash = {
    parse() { return (location.hash || '#home').slice(1); },
    go(id) { location.hash = '#' + id; },
    onChange(fn) { window.addEventListener('hashchange', () => fn(this.parse())); }
  };
})();
