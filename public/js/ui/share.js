/* LiteBox v5 · ui/share.js — 全站分享（Step 6A 新增）
 *
 * 目标：92 个工具此前零传播出口 —— 这是增长最大短板。
 * 本模块在每个工具页 head 右侧注入一个分享图标按钮。
 *
 * 【分享链路优先级】
 *   1. navigator.share（Web Share API）
 *      移动端 Android Chrome / iOS Safari 会拉起系统分享面板（微信 / QQ / 短信 / 邮件…）。
 *      ★ 注意：**桌面 Chrome / Edge 也实现了 navigator.share**，
 *        所以不能只靠"有没有 navigator.share"来判断是不是移动端——
 *        桌面弹出的系统面板体验其实也可以，但用户往往期待"复制链接"。
 *        这里的做法：先尝试 Web Share，失败（拒绝/不支持）再降级复制。
 *        实践中桌面点分享会直接弹系统面板，这与主流网站行为一致。
 *   2. 复制链接降级
 *      Web Share 不可用或抛错时，用 LB.copyNow 复制链接。
 *      ★ 必须是 copyNow（同步）而不是 LB.copy —— 见 core/clipboard.js 的
 *        「copySync 纯同步不变量」：复制动作必须发生在用户手势栈内，
 *        放进 catch 回调里会导致手势过期，国产浏览器直接失败。
 *
 * 【幂等】inject 内部检查 .share-btn 已存在则直接返回，
 *   因此 router 每次 _mountTool（含 refresh 分支）调用都安全。
 */
(function () {
  'use strict';
  window.LB = window.LB || {};

  const SVG_SHARE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
    '<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>' +
    '<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

  const SITE = '轻工具箱 LiteBox';

  /* 返回按钮 SVG（与 components.css .back 配套） */
  const SVG_BACK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';

  LB.ui.share = {
    /* ---------- 在工具页 head 注入分享按钮 ---------- */
    inject(root, toolId, toolName) {
      if (!root || !toolId) return;
      let head = root.querySelector('.tool-head');
      if (!head) head = this._ensureHead(root, toolId, toolName);
      if (!head) return;
      if (head.querySelector('.share-btn')) return;         /* 幂等 */

      const btn = document.createElement('button');
      btn.className = 'share-btn icon-btn';
      btn.type = 'button';
      btn.title = '分享此工具';
      btn.setAttribute('aria-label', '分享「' + (toolName || toolId) + '」');
      btn.dataset.shareFor = toolId;
      btn.innerHTML = SVG_SHARE;

      /* 靠 flex + margin-left:auto 推到最右（CSS 里定义），
         不使用 absolute + 固定 top —— 各工具 head 高度不同，硬编码会错位。 */
      head.appendChild(btn);

      /* 点击时同步进入 share()，保持在用户手势栈内。
         ★ 必须用箭头函数：写成 function 时this 指向按钮元素而非 LB.ui.share，
           运行时抛 "this.share is not a function"（Step 6A 首轮实测踩到）。 */
      btn.addEventListener('click', () => {
        LB.ui.share.share(toolId, toolName);
      });
    },

    /* ---------- 补建 tool-head ----------
       实测有 10 个工具（fileinfo / filemerge / sheetbox / vframe / vconv /
       acut / screencap / tts / stt / rec）原本既没有 .tool-head 也没有返回按钮，
       直接返回会导致这 10 个工具页拿不到分享入口（覆盖率只有 88%）。
       这里为它们补一个标准头部：返回按钮 + 标题，顺带把分享按钮挂上。
       标题从 registry 拿，避免在此处硬编码工具名。 */
    _ensureHead(root, toolId, toolName) {
      try {
        const head = document.createElement('div');
        head.className = 'tool-head';
        head.dataset.autoHead = '1';

        const back = document.createElement('button');
        back.className = 'back';
        back.type = 'button';
        back.setAttribute('aria-label', '返回');
        back.innerHTML = SVG_BACK;
        back.addEventListener('click', () => LB.hash.go('home'));
        head.appendChild(back);

        const box = document.createElement('div');
        const h1 = document.createElement('h1');
        h1.textContent = toolName || toolId;
        box.appendChild(h1);
        const p = document.createElement('p');
        p.textContent = '结果全部在本机浏览器完成，不上传、不联网';
        box.appendChild(p);
        head.appendChild(box);

        root.insertBefore(head, root.firstChild);
        return head;
      } catch (_) {
        return null;
      }
    },

    /* ---------- 执行分享 ---------- */
    share(toolId, toolName) {
      const url = location.origin + '/#' + toolId;
      const name = toolName || '工具';
      const title = name + ' · ' + SITE;
      const text = '发现一个免费的「' + name + '」，不用注册，打开就能用。';

      /* 1. Web Share API（移动端拉起系统面板） */
      if (navigator.share) {
        /* 某些浏览器 share() 会同步抛 TypeError（如 payload 不合法），必须包 try */
        let p;
        try {
          p = navigator.share({ title: title, text: text, url: url });
        } catch (_) {
          LB.ui.share._fallback(url);
          return;
        }
        if (p && typeof p.catch === 'function') {
          p.catch((e) => {
            /* 用户主动取消（AbortError）不做任何提示，也不降级——
               否则用户明明点了"取消"却弹出一个"链接已复制"，非常突兀。 */
            if (e && e.name === 'AbortError') return;
            LB.ui.share._fallback(url);
          });
        }
        return;
      }

      /* 2. 不支持 Web Share → 复制链接 */
      this._fallback(url);
    },

    /* ---------- 降级：复制链接 ---------- */
    _fallback(url) {
      /* 同步调用，绝不 await —— 手势栈内执行，国产浏览器才能成功 */
      const ok = LB.copyNow(url, '链接已复制，粘贴给朋友吧');
      if (ok === false) {
        /* copyNow 内部已排队异步验证；若它最终失败会自动弹可长按的兜底框。
           这里不再重复提示，避免 toast 叠加。 */
        return;
      }
    },

    /* 供测试读取当前页的分享链接 */
    _currentUrl(toolId) {
      return location.origin + '/#' + toolId;
    }
  };
})();
