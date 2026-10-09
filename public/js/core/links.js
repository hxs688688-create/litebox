/* LiteBox v5 · core/links.js — 工具链路互推（Step 6E 新增）
 *
 * 目标：让 97 个工具的产出能直接流转到下一个工具，形成"用完一个顺手用下一个"的闭环。
 * Step 6A 解决了"分享出去"（对外传播），本模块解决"站内流转"（对内导流）。
 *
 * 【为什么用router 统一注入，而不是逐个工具改 mount】
 *   1. 零侵入：不必改动 textscan / ocr / stt / translate / fxrate 这 5 个文件的 mount，
 *      也就不会碰到各自已有的业务逻辑（ocr 和 stt 都已经有"送入文本处理"按钮了）。
 *   2. 不漏工具：router._mountTool 统一调用，天然覆盖 mount 与 refresh 两个分支。
 *      实测有 10 个工具（stt / tts / rec / fileinfo 等）连 .tool-head 都没有，
 *      逐个改 mount 极易漏掉，而本模块走 share.js 已验证过的 _ensureHead 兜底。
 *   3. 幂等安全：inject 内部先查已存在则跳过，故 refresh 重复调用无副作用。
 *
 * 【种子数据（seed）协议】
 *   流转的数据先写进 localStorage 的约定 key，再跳到目标工具；
 *   目标工具 mount 时读出→ 回填输入框 → 立即 remove（消费型种子必须清理，
 *   否则下次进工具会重复回填）。这与 csvtab.js 现有的 litebox_csv_seed 完全同构。
 *   key 命名沿用 litebox_{target}_seed。
 *
 * 【手势栈约束 —— 全站硬规则】
 *   种子写入与跳转必须在 click 处理器内**同步**完成，绝不 await。
 *   若把LB.storage.set 挪进 Promise 回调里，国产浏览器的用户手势会过期。
 *   （复制同理，必须用 LB.copyNow，见 core/clipboard.js 的「copySync 纯同步不变量」）
 */
(function () {
  'use strict';
  window.LB = window.LB || {};

  /* 转义查询串用的最小编码（encodeURIComponent 已足够，但显式保留可读性） */
  const enc = encodeURIComponent;

  /* 把 textarea / div 的结果读成纯文本
     —— 三个源工具里 translate 与 fxrate 的结果是 div（textContent），
        其余是 textarea（value），这里统一收口，避免调用方各写一遍判断。 */
  function readOut(sel, root) {
    const el = sel && root.querySelector(sel);
    if (!el) return '';
    /*textarea 用 value，div 用 textContent；两者都兜一层 trim */
    const v = ('value' in el) ? el.value : el.textContent;
    return String(v == null ? '' : v).trim();
  }

  /* 把 fxrate 的 "1,234.56 USD" 解析成纯数字 "1234.56"
     —— 目标 rmb 工具只吃数字，带单位/千分位会直接算错。
     任务书示例给的是 $('#exAmt').value，但 fxrate 实际结构里不存在该 id，
     且结果是带币种单位的字符串，故按实际结构解析。 */
  function stripUnit(s) {
    return String(s == null ? '' : s)
      .replace(/[^\d.,\-]/g, '')  /* 去掉字母、空格、货币符号 */
      .replace(/,/g, '');         /* 去掉千分位 */
  }

  /* 转表格：首行做表头，行为数据行。csvtab 期望的是 CSV 文本。 */
  function toCSV(title, text) {
    const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
    return title + '\n' + lines.join('\n');
  }

  LB.links = {
    /* ---------- 链路配置 ----------
       每条：to=目标工具 id / seedKey=种子 key（空则不传数据，纯跳转）
             text=按钮文案 / get=从当前工具读结果 / map=结果映射
       ★ to 必须是 registry 里真实存在的 id，注意三个易混：
         texttool（一键清理排版）≠ textstats（文本统计）
         textconvert（文本互转）  ≠ tsconv（时间戳转换）
         image64（图片 Base64）   ≠ b64（文本 Base64）                */
    routes: {
      textscan: [
        { to: 'csvtab', seedKey: 'litebox_csv_seed', text: '转入表格工具',
          get: r => readOut('#tsOut', r), map: v => toCSV('提取结果', v) },
        { to: 'textstats', seedKey: 'litebox_text_seed', text: '查看统计',
          get: r => readOut('#tsOut', r), map: v => v }
      ],
      ocr: [
        { to: 'textconvert', seedKey: 'litebox_tc_seed', text: '送入文本处理',
          get: r => readOut('#ocrOut', r), map: v => v },
        { to: 'texttool', seedKey: 'litebox_tt_seed', text: '清理排版',
          get: r => readOut('#ocrOut', r), map: v => v },
        { to: 'csvtab', seedKey: 'litebox_csv_seed', text: '转表格',
          get: r => readOut('#ocrOut', r), map: v => toCSV('OCR结果', v) },
        { to: 'textstats', seedKey: 'litebox_text_seed', text: '文本统计',
          get: r => readOut('#ocrOut', r), map: v => v }
      ],
      stt: [
        { to: 'textconvert', seedKey: 'litebox_tc_seed', text: '送入文本处理',
          get: r => readOut('#sttOut', r), map: v => v },
        { to: 'texttool', seedKey: 'litebox_tt_seed', text: '清理排版',
          get: r => readOut('#sttOut', r), map: v => v },
        { to: 'textstats', seedKey: 'litebox_text_seed', text: '文本统计',
          get: r => readOut('#sttOut', r), map: v => v }
      ],
      translate: [
        { to: 'textstats', seedKey: 'litebox_text_seed', text: '译文统计',
          get: r => readOut('#trOut', r), map: v => v },
        { to: 'textconvert', seedKey: 'litebox_tc_seed', text: '送入文本处理',
          get: r => readOut('#trOut', r), map: v => v }
      ],
      fxrate: [
        { to: 'rmb', seedKey: 'litebox_rmb_seed', text: '转大写金额',
          get: r => stripUnit(readOut('#fxOut', r)), map: v => v },
        { to: 'textstats', seedKey: 'litebox_text_seed', text: '结果统计',
          get: r => readOut('#fxOut', r), map: v => v }
      ]
    },

    /* 特殊流转：目标工具无法用种子回填（PDF 工具是多tab 混合、无单一输入框），
       只能跳转 + 提示用户手动上传。放在 routes 外避免误走通用分支。 */
    specials: {
      idphoto: [
        { to: 'pdf', text: '导出 PDF', hint: '请在 PDF 工具箱中手动上传刚生成的证件照' }
      ]
    },

    /* ---------- 注入链路按钮栏 ---------- */
    inject(root, toolId) {
      if (!root || !toolId) return;

      const routes = (this.routes[toolId] || []).concat(this.specials[toolId] || []);
      if (!routes.length) return;

      /* 幂等：router 的 mount / refresh 两个分支都会调到这里 */
      if (root.querySelector('.lb-link-bar')) return;

      const bar = document.createElement('div');
      bar.className = 'lb-link-bar';
      /* 用 CSS 类控制样式，不写内联 style（禁 !important，也避免样式散落） */

      routes.forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost btn-sm lb-link-btn';
        btn.type = 'button';
        btn.textContent = r.text;
        btn.dataset.linkTo = r.to;

        /* 全程同步：读结果 → 写种子 → 跳转，绝不 await */
        btn.addEventListener('click', () => {
          /* 1. 特殊流转：只跳转 + 提示 */
          if (r.hint) {
            LB.toast(r.hint, 'info');
            LB.hash.go(r.to);
            return;
          }

          /* 2. 同步取结果（保持在用户手势栈内） */
          const raw = typeof r.get === 'function' ? r.get(root) : '';
          if (!raw) { LB.toast('还没有可流转的结果', 'err'); return; }

          const data = typeof r.map === 'function' ? r.map(raw) : raw;
          if (data === '' || data == null) { LB.toast('结果为空，无法流转', 'err'); return; }

          /* 3. 写种子 → 跳转（连续同步语句，手势不中断） */
          if (r.seedKey) LB.storage.set(r.seedKey, data);
          LB.hash.go(r.to);
        });

        bar.appendChild(btn);
      });

      /* 挂到结果区之后：优先 .tool-sec（结果区块），退回 .card，再退回 root */
      const host = root.querySelector('.tool-body') || root.querySelector('.card') || root;
      host.appendChild(bar);
    }
  };
})();
