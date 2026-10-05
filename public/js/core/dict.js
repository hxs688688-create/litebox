/* LiteBox v5 · core/dict.js — 字典按需加载器（vendor/dict/{name}.js，Promise 缓存防重复注入） */
(function () {
  'use strict';

  window.LB = window.LB || {};
  const pend = {}; /* name → Promise，避免重复注入 <script> */

  /* 挂载 key → 字典文件名（zhS2T 与 zhT2S 同文件，T2S 由文件内联生成；
     sensitive-words 文件挂载名是 sensitiveWords，文件名含连字符，故需映射。
     wordsCET4 同理：挂载名是驼峰，文件名是 words-cet4.js）。
     不写进这张表的话 load('wordsCET4') 会去找 vendor/dict/wordsCET4.js → 404。
     Step 6I 同理：socLadder → soc-ladder.js、historyToday → history-today.js。 */
  const FILE = { pinyin: 'pinyin-dict', zhS2T: 'zhconv-dict', zhT2S: 'zhconv-dict', poems: 'poems', idioms: 'idioms', sensitiveWords: 'sensitive-words', wordsCET4: 'words-cet4', socLadder: 'soc-ladder', historyToday: 'history-today' };

  /**
   * 加载 vendor/dict/{file}.js
   * 字典文件内部挂载 window.LB.dict[name]，onload 后取出 resolve。
   * 已加载 / 加载中均直接返回缓存的 Promise。
   */
  LB.dict = {
    load(name) {
      if (window.LB.dict && window.LB.dict[name]) return Promise.resolve(window.LB.dict[name]);
      if (pend[name]) return pend[name];
      pend[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/dict/' + (FILE[name] || name) + '.js';
        s.onload = () => {
          s.remove();
          const d = window.LB.dict && window.LB.dict[name];
          if (d) resolve(d);
          else { delete pend[name]; reject(new Error('字典加载失败: ' + name)); }
        };
        s.onerror = () => { s.remove(); delete pend[name]; reject(new Error('字典加载失败: ' + name)); };
        document.head.appendChild(s);
      });
      return pend[name];
    }
  };
})();
