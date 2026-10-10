/* LiteBox v5 · core/clipboard.js — 剪贴板（Step 5I 根治：用户手势丢失 + 国产浏览器假成功）
 *
 *【三次修复的完整根因链（每一层都对应用户实际反馈）】
 *
 * 第1 次（Step 5F）：用了 clipboard API + await
 *   → 失败现象：点了完全没反应。iOS/微信对手势过期后的 execCommand 静默返回 false。
 *
 * 第 2 次（Step 5G）：改为「同步优先」
 *   → 失败现象（vivo）：弹了"已复制"toast，但粘贴出来是空的。**这是"假成功"**。
 *   根因：国产浏览器（vivo/小米/华为/UC/QQ/微信/夸克）的 navigator.clipboard.writeText()
 *   有实现缺陷 —— Promise resolve 了但根本没写入系统剪贴板。
 *   我们上一次的链路第一步就是 clipboard API，于是它"成功"了，程序不再 fallback。
 *
 * 第 3 次（Step 5I，用户诊断文档指出）：**用户手势丢失**
 *   根因：很多工具页的复制发生在 `await fetch(...)` 之后 ——
 *   浏览器认为拷贝动作发生在异步回调里，不是用户主动触发，于是拒绝写入。
 *   国产浏览器（vivo X5 / 微信 / 夸克）对此最严格。
 *
 * 【本版策略：把"复制"做成一个纯同步动作】
 *
 *   ★ copySync(text) —— 唯一真正的复制实现，**必须是纯同步函数**：
 *       不new Promise、不 await、不 setTimeout、不跨任务。
 *       因此无论调用方写了多深的 async，复制动作都发生在当前手势栈内。
 *
 *   ★ copyNow(text, msg) —— 供 onclick 同步栈调用的新 API：
 *       同步复制 → 成功立即 toast；失败再退化到异步重试一次。
 *
 *   ★ copyAsync(text) —— 兼容旧调用点（LB.copy），内部先同步再异步。
 *
 *   ★ copyWithToast === copyNow（保持旧名兼容，32 处调用点无需改动）。
 *
 * 关键约束（改动时务必保持）：
 *   1. execCopy 内绝不能出现 await / Promise / setTimeout
 *   2. 国产浏览器**完全跳过** navigator.clipboard（它会假成功）
 *   3. 临时元素不能完全隐藏（opacity:0 / display:none / readonly 会被判定选区为空）
 *   4. 任何失败都必须给用户可长按的文本，绝不"什么都不给"
 */
(function() {
  window.LB = window.LB || {};

  /* ---------- 国产壳浏览器识别（其 clipboard API 不可信） ---------- */
  function isWebViewOrCN() {
    const ua = navigator.userAgent || '';
    return /vivo|oppo|xiaomi|miui|huawei|honor|ucbrowser|uc browser|qqbrowser|mqqbrowser|micromessenger|x5kernel|quark|quarkbrowser|baidubrowser|sogou|sogoumobile|2345|liebao|heytapbrowser/i.test(ua);
  }
  LB._isDomesticBrowser = isWebViewOrCN;   /* 供诊断框读取 */

  /* ================================================================
   * execCopy —— execCommand 兜底
   * 必须是**纯同步**：这里出现的任何异步都会让用户手势过期。
   * ================================================================ */
  function execCopy(str) {
    let ta = null;
    try {
      /* 关键 1：先失焦当前元素。
         国产浏览器若发现焦点仍在按钮/输入框上，会直接拒绝复制。 */
      try {
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur();
        }
      } catch (_) {}

      ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('aria-hidden', 'true');
      /* 关键 2：不能"完全"隐藏。
         opacity:0 / display:none / visibility:hidden / readonly 的元素，
         多个国产内核判定其不可聚焦 → 选区为空 → 复制静默失败。
         故用 opacity:0.01 + 1px 尺寸。 */
      ta.style.cssText =
        'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
        'width:1px;height:1px;padding:0;border:0;margin:0;' +
        'opacity:0.01;color:transparent;caret-color:transparent;background:transparent;' +
        'outline:none;box-shadow:none;resize:none;overflow:hidden;z-index:-1;';
      /* 不用 readonly（见关键 2），但要关掉这些会干扰选区的移动端属性 */
      ta.setAttribute('autocapitalize', 'off');
      ta.setAttribute('autocomplete', 'off');
      ta.setAttribute('autocorrect', 'off');
      ta.setAttribute('spellcheck', 'false');

      document.body.appendChild(ta);

      /* 关键 3：先 focus body 再 focus textarea（部分内核要求焦点经过 body） */
      try { document.body.focus(); } catch (_) {}
      ta.focus({ preventScroll: true });
      ta.select();
      /* iOS / 部分安卓内核需在 select() 之后再次调用 setSelectionRange 才生效 */
      try { ta.setSelectionRange(0, str.length); } catch (_) {}

      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }

      if (ta.parentNode) ta.parentNode.removeChild(ta);
      return !!ok;
    } catch (_) {
      if (ta && ta.parentNode) { try { ta.parentNode.removeChild(ta); } catch (_) {} }
      return false;
    }
  }

  /* ================================================================
   * copySync —— 核心：纯同步复制，**保证在用户手势栈内执行**
   *
   * 返回值分三种（供copyNow 区分，boolean 语义保持不变）：
   *   true  —— 确定成功（execCommand 返回 true）
   *   false —— 确定失败（没有 clipboard API 可用）
   *   true「但 _syncOptimistic === true」—— 已同步发起 clipboard API，结果未知
   *※绝不能出现 await / Promise / setTimeout，否则手势过期。
   * ================================================================ */
  let _syncOptimistic = false;   /* 上次 copySync 是否走了"乐观"分支 */
  LB._lastCopyWasOptimistic = function() { return _syncOptimistic; };

  function copySync(text) {
    const str = String(text == null ? '' : text);
    _syncOptimistic = false;
    if (!str) return false;

    /* 国产浏览器：直接 execCommand，绝不碰会"假成功"的 clipboard API */
    if (isWebViewOrCN()) return execCopy(str);

    /* 其它浏览器：execCommand 同步执行，处于手势栈内，成功率最高 */
    if (execCopy(str)) return true;

    /* 仅在同步路径失败时，才尝试 clipboard API。
       注意：这里仍**不 await**，只是发起调用（保持函数同步返回）。
       返回 true 但标记 optimistic —— copyNow 会追加一次回读验证，
       若验证失败则弹手动兜底框，绝不让用户"以为成功却拿到空"。 */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        const p = navigator.clipboard.writeText(str);
        if (p && typeof p.then === 'function') {
          p.then(function() {}, function() {});
        }
        _syncOptimistic = true;   /* 同步栈内已发起；结果待验证 */
        return true;
      } catch (_) {}
    }
    return false;
  }

  /* ================================================================
   * verifyClipboard —— 异步回读验证：唯一能识别"假成功"的方法
   * ================================================================ */
  function verifyClipboard(str) {
    return new Promise(function(resolve) {
      let settled = false;
      const done = function(v) { if (!settled) { settled = true; resolve(v); } };
      try {
        Promise.resolve(navigator.clipboard.writeText(str)).then(
          function() {
            if (navigator.clipboard && navigator.clipboard.readText) {
              Promise.resolve(navigator.clipboard.readText()).then(
                function(read) { done(read === str); },
                function() { done(true); }   /* 无读权限时信任 */
              );
            } else { done(true); }
          },
          function() { done(false); }
        );
      } catch (_) { done(false); }
      /* 防止 API 既不 resolve 也不 reject 时 Promise 悬挂 */
      setTimeout(function() { done(false); }, 1200);
    });
  }

  /* ================================================================
   * copyAsync —— 兼容旧调用点（LB.copy）
   * 内部依然**先同步**执行以抢住手势，异步只作为二次补救。
   * ================================================================ */
  function copyAsync(text) {
    const str = String(text == null ? '' : text);
    if (!str) return Promise.resolve(false);

    /* 第 1 步：同步（保住手势）。确定成功才算成功。 */
    if (copySync(str)) {
      if (!_syncOptimistic) return Promise.resolve(true);
      /* 乐观分支：已发起 clipboard API，必须回读验证才算数 */
      return verifyClipboard(str);
    }

    /* 第 2 步：异步补救（仅当同步路径完全失败且有 clipboard API） */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return verifyClipboard(str);
    }
    return Promise.resolve(false);
  }

  /* ================================================================
   * copyNow —— 新 API：必须在 onclick 顶层同步栈里调用
   * 返回 boolean：true = 已确定成功；false = 进入异步补救/兜底流程
   * ================================================================ */
  function copyNow(text, successMsg) {
    const msg = successMsg || '已复制到剪贴板';
    const str = String(text == null ? '' : text);
    if (!str) {
      if (typeof LB.toast === 'function') LB.toast('没有可复制的内容', 'err');
      return false;
    }

    let ok = false;
    try { ok = copySync(str); } catch (_) { ok = false; }
    const optimistic = _syncOptimistic;

    /* 确定成功（execCommand）→ 立即 toast，**同步返回 true** */
    if (ok && !optimistic) {
      if (typeof LB.toast === 'function') LB.toast(msg, 'ok');
      return true;
    }

    /* 到这里说明"尚未确定成功"：乐观分支 或 完全失败。
       统一走异步验证；验证失败 → 弹可长按的文本框，保证用户一定能拿到文本。
       ★ 注意：此处 return false 会让32 处调用点里的 await 拿到 false，
         但它们只是await 一下，无副作用（toast 由这里统一发出）。 */
    const finish = function(success) {
      if (success) {
        if (typeof LB.toast === 'function') LB.toast(msg, 'ok');
      } else {
        if (typeof LB.toast === 'function') LB.toast('复制失败，请长按下方文本手动复制', 'err');
        showManualCopy(str);
      }
    };

    if (optimistic) {
      verifyClipboard(str).then(finish);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      verifyClipboard(str).then(finish);
    } else {
      /* 连 clipboard API 都没有 —— 直接兜底，不让用户空等 */
      finish(false);
    }
    return false;
  }

  /* ---------- 手动复制兜底弹窗（可长按 / 可全选） ---------- */
  let manualLayer = null;
  function showManualCopy(text) {
    const str = String(text == null ? '' : text);
    if (!str) return;
    if (manualLayer) { try { manualLayer.remove(); } catch (_) {} manualLayer = null; }

    try {
      const layer = document.createElement('div');
      layer.id = 'lbManualCopy';
      layer.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(8,12,24,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

      const box = document.createElement('div');
      box.style.cssText =
        'width:min(100%,520px);max-height:82vh;display:flex;flex-direction:column;gap:12px;' +
        'padding:18px;border-radius:16px;background:#fff;color:#1a2233;' +
        'box-shadow:0 18px 48px rgba(0,0,0,.3);';

      const tip = document.createElement('div');
      tip.textContent = '自动复制被浏览器拦截，请长按下方文本手动复制：';
      tip.style.cssText = 'font-size:13.5px;font-weight:700;line-height:1.5;';

      /* textarea + value 赋值（而非 innerHTML），天然免疫 HTML 注入，
         移动端长按会弹出「全选/复制」菜单。 */
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.readOnly = true;
      ta.style.cssText =
        'width:100%;min-height:180px;max-height:46vh;resize:vertical;padding:10px 12px;' +
        'border:1px solid #e5e9f2;border-radius:10px;color:#1a2233;background:#f8fafd;' +
        'font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;';
      ta.addEventListener('focus', function() { try { ta.select(); } catch (_) {} }, { once: true });

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '关闭';
      btn.style.cssText =
        'align-self:flex-end;padding:9px 22px;border-radius:999px;border:0;cursor:pointer;' +
        'background:#4a5ae6;color:#fff;font-size:13.5px;font-weight:700;';

      const close = function() {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
        manualLayer = null;
        document.removeEventListener('keydown', onKey);
      };
      const onKey = function(e) { if (e.key === 'Escape') close(); };

      btn.addEventListener('click', close);
      layer.addEventListener('click', function(e) { if (e.target === layer) close(); });
      document.addEventListener('keydown', onKey);

      box.appendChild(tip);
      box.appendChild(ta);
      box.appendChild(btn);
      layer.appendChild(box);
      document.body.appendChild(layer);
      manualLayer = layer;

      setTimeout(function() {
        try { ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, str.length); } catch (_) {}
      }, 120);
    } catch (_) { /* 连兜底都失败则静默，toast 已提示过 */ }
  }

  /* ---------- 挂载 ---------- */
  LB.copy = copyAsync;/* 兼容旧名（内部先同步） */
  LB.copyNow = copyNow;            /* 新 API：手势同步栈专用 */
  LB.copyWithToast = copyNow;      /* 兼容旧名，32 处调用点零改动 */
  LB._copySync = copySync;         /* 供诊断/测试 */
  LB.manualCopy = showManualCopy;
  window.copyText = copyAsync;
})();
