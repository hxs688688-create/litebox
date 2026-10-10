/* LiteBox v5 · vendor/dict/noise-sources.js — 白噪音音源表（Step 13 · B4）
 *
 * 结构：[{ id, name, emoji, url, alt:[...], synth, loop }]
 *   · url      —— 主音源（免费可公开访问的 CDN 直链）
 *   · alt      —— 备用镜像，主源加载失败时按顺序重试
 *   · synth    —— 全部远端都失败时的 Web Audio 合成降级算法（white/pink/rain/ocean/fire/birds）
 *   · loop     —— 是否循环播放
 *
 * 选源口径（2026-10 实测）：
 *   · 任务书推荐的 Pixabay / soundjay / archive.org 在当前网络下全部不可达
 *     （403 / 404 / 连接失败），故改用 GitHub 开源静态站 + jsDelivr CDN 分发，
 *     三个镜像（cdn / fastly / gcore）交叉可用。
 *   · 每个文件都做过 Range 探测（206 + audio/*），并核对源仓库为 MIT 许可。
 *   · white（白噪音）不挂 CDN —— 合成的白噪与真实录音听感无差，且零延迟、离线可用。
 *
 * 加载方式：LB.dict.load('noiseSources')
 *   挂载名是驼峰、文件名含连字符，dict.js 的 FILE 表需加映射 noiseSources → noise-sources。
 *
 * ⚠ 红线：界面上不标注任何数据来源 —— 本文件只被 JS 消费，
 *   站点名/仓库名不得出现在 noise.js 渲染的任何文案里。 */
window.LB = window.LB || {};
window.LB.dict = window.LB.dict || {};

(function () {
  'use strict';

  /* 同一份文件在 jsDelivr 三个接入点上的地址，用于逐条 alt 展开 */
  function mirrors(path) {
    return [
      'https://fastly.jsdelivr.net/gh/' + path,
      'https://gcore.jsdelivr.net/gh/' + path
    ];
  }

  const OM = 'nwarwick/omambience@master/audio/';      /* MIT · 户外环境音 */
  const QF = 'Gary06868/QuietField@main/site/assets/'; /* MIT · 自然声景 */
  const AM = 'abhinandansharma/ambiently@main/demo/public/sounds/'; /* MIT · 环境循环音 */

  function item(id, emoji, name, repoPath, synth) {
    return {
      id: id,
      emoji: emoji,
      name: name,
      url: 'https://cdn.jsdelivr.net/gh/' + repoPath,
      alt: mirrors(repoPath),
      synth: synth || '',
      loop: true
    };
  }

  window.LB.dict.noiseSources = [
    /* 10 条，与任务书给的示例清单同构（雨声 / 海浪 / 森林 / 咖啡馆 / 篝火 /
       溪流 / 鸟鸣 / 夏夜虫鸣 / 火车 / 白噪音），落在「8–10 个」区间内。 */
    item('rain', '🌧️', '雨声', OM + 'rain.ogg', 'rain'),
    item('ocean', '🌊', '海浪', OM + 'waves.ogg', 'ocean'),
    item('river', '🏞️', '溪流', OM + 'stream.ogg', 'ocean'),
    item('cafe', '☕', '咖啡馆', OM + 'cafe.ogg', 'pink'),
    item('fire', '🔥', '篝火', OM + 'fire.ogg', 'fire'),
    item('forest', '🌲', '森林', QF + 'forest-rain.ogg', 'rain'),
    item('birds', '🐦', '鸟鸣', AM + 'meadow.m4a', 'birds'),
    item('night', '🌙', '夏夜虫鸣', AM + 'night.m4a', 'birds'),
    item('train', '🚂', '火车行驶', AM + 'train.m4a', 'ocean'),
    { id: 'white', emoji: '⚪', name: '白噪音', url: '', alt: [], synth: 'white', loop: true }
  ];
})();
