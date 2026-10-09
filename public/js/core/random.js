/* LiteBox v5 · core/random.js — 加密安全随机工具（LB.rng），随机类工具统一走此模块，禁用 Math.random */
(() => {
  window.LB = window.LB || {};

  const buf = new Uint32Array(1);

  LB.rng = {
    /* [0, 1) 的加密随机浮点数 */
    float() {
      crypto.getRandomValues(buf);
      return buf[0] / 4294967296; /* 2^32 */
    },

    /* [min, max] 闭区间内的随机整数 */
    int(min, max) {
      return min + Math.floor(this.float() * (max - min + 1));
    },

    /* Fisher-Yates 洗牌（原地修改并返回该数组） */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    }
  };
})();
