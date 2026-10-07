/* LiteBox v5 · router.js — 路由（首页 / 工具动态加载 + unmount 生命周期 + 返回位置恢复） */
(() => {
  window.LB = window.LB || {};

  /* Step 8：空状态类名统一为 es-icon / es-title / es-sub（与 components.css 一致） */
  const FAIL_HTML =
    '<div class="empty-state">' +
    '<div class="es-icon">⚠️</div>' +
    '<p class="es-title">工具加载失败，请刷新重试</p>' +
    '<p class="es-sub">网络异常或该工具暂时不可用</p>' +
    '</div>';

  /* Step 5H：首页滚动位置记忆。
     需求：首页滚到中间 → 进入工具 → 返回时停在离开时的位置，而不是回到顶部。
     注意 base.css 有 `html{scroll-behavior:smooth}`，恢复时必须用 behavior:'instant'，
     否则会出现"先滚到顶再滑下去"的闪动。 */
  let _homeScrollY = 0;   /* 上次离开首页时的 scrollY */
  let _curPage = '';      /* 当前所在页，用于判断"是否正在离开首页" */

  function currentScrollY() {
    return window.scrollY || document.documentElement.scrollTop ||
      document.body.scrollTop || 0;
  }

  LB.router = {
    routes: new Map(),
    _current: null,   /* 当前运行中的工具 { id, mod } */
    _navSeq: 0,       /* 导航序号：丢弃过期的异步加载回调 */
    _scriptCache: null,

    /* hash id → 脚本文件名映射（一个工具文件可注册多个 id 时使用） */
    MODULE_FILES: { rand: 'randomnum' },

    register(id, mod) { this.routes.set(id, mod); },

    /* 动态注入 <script>，缓存 Promise 避免重复加载；失败不缓存以便重试。
       Step 28 修正 · 一：实际请求地址拼 ?v=LB_VERSION —— _headers 里 /js/* 是
       max-age=31536000, immutable（一年不回源），没有版本号的话改了工具脚本
       部署上去用户也拿不到新的。缓存键仍用原始 src，只让 URL 带版本。 */
    loadScript(src) {
      if (!this._scriptCache) this._scriptCache = new Map();
      if (this._scriptCache.has(src)) return this._scriptCache.get(src);
      const versionedSrc = src + (src.indexOf('?') > -1 ? '&' : '?') + 'v=' + (window.LB_VERSION || '5.3.0');
      const p = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = versionedSrc;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          this._scriptCache.delete(src);
          s.remove();
          reject(new Error('script load fail: ' + versionedSrc));
        };
        document.body.appendChild(s);
      });
      this._scriptCache.set(src, p);
      return p;
    },

    /* Step 8：_unmountCurrent 重写。
       旧实现只做 host.innerHTML = ''，但 #tool-host 是常驻节点被反复复用，
       绑在 host 身上的 click/input 监听器不随卸载消失（实测连开 15 个工具 add=15 / remove=0）。
       现改为整节点替换：旧节点连同其上全部监听器一起被 GC。
       返回替换后的新 host —— 调用方必须使用返回值，旧引用已失效。 */
    _unmountCurrent() {
      const cur = this._current;
      this._current = null;
      const oldHost = LB.dom.$('#tool-host');
      if (!oldHost) return null;

      /* 无运行中工具：维持旧行为清空内容即可（host 自身没有可泄漏的监听器） */
      if (!cur) { oldHost.innerHTML = ''; return oldHost; }

      /* 关键：用空克隆替换节点本身（cloneNode(false) 复制 id/class/hidden 等全部属性），
         旧节点连同所有监听器一起脱离文档被 GC。 */
      const newHost = oldHost.cloneNode(false);
      newHost.innerHTML = '';
      oldHost.parentNode.replaceChild(newHost, oldHost);

      /* 摘除后再 unmount：沿用既有约定 —— 工具 revoke blob URL 时页面上已没有
         尚未加载完的缩略图，不会报错；unmount 清定时器 / 停流 / 关 AudioContext
         都不依赖节点仍挂在文档上。 */
      if (cur.mod && typeof cur.mod.unmount === 'function') {
        try { cur.mod.unmount(); } catch (_) { /* 清理失败不阻断路由 */ }
      }
      return newHost;
    },

    _showBuilding(host) {
      host.innerHTML =
        '<div class="empty-state">' +
        '<div class="es-icon">🛠️</div>' +
        '<p class="es-title">该工具建设中</p>' +
        '<p class="es-sub">即将上线，敬请期待</p>' +
        '</div>';
    },

    go(id) {
      const pages = LB.dom.$$('.page');
      let host = LB.dom.$('#tool-host');   /* Step 8：let —— _unmountCurrent 克隆替换后须取新节点 */

      /* —— 首页：卸载当前工具 + 显示首页 —— */
      if (id === 'home') {
        /* Step 5H：只在"确实从别的页面回到首页"时恢复位置。
           若本来就在首页（_curPage === 'home'），保持当前滚动不动，
           否则点底栏"首页"会突然跳到上次的位置，反而是bug。 */
        const shouldRestore = _curPage && _curPage !== 'home' && _homeScrollY > 0;
        host = this._unmountCurrent() || host;   /* Step 8：host 可能已被克隆替换 */
        if (host) { host.hidden = true; host.classList.remove('active'); }
        pages.forEach(p => p.classList.toggle('active', p.id === 'page-home'));
        /* Step 23 · 六：首页不再展示最近使用，这里只刷新收藏（litebox_rec 仍照常写入，
           「我的」弹层要用）。 */
        LB.ui.home.renderFav && LB.ui.home.renderFav();

        if (shouldRestore) {
          /* 用 rAF 延迟一帧，等首页 DOM 渲染完成后再定位 */
          const y = _homeScrollY;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try { window.scrollTo({ top: y, behavior: 'instant' }); }
              catch (_) { window.scrollTo(0, y); }
            });
          });
        }
        _curPage = 'home';
        return;
      }

      /* —— 工具页 —— */
      /* Step 5H：离开首页前先记住当前位置。
         只在"从首页进入工具"这一刻记录，保证工具之间互相跳转不会覆盖它。 */
      if (_curPage === 'home') {
        _homeScrollY = currentScrollY();
      }
      _curPage = id;

      this._navSeq++;
      const seq = this._navSeq;

      /* 上一个工具仍在运行且目标不同 → 卸载（Step 8：host 可能已被克隆替换，取新节点） */
      if (this._current && this._current.id !== id) host = this._unmountCurrent() || host;

      pages.forEach(p => p.classList.remove('active'));
      if (!host) return;
      host.hidden = false;
      /* 工具页激活标记：bindPasteAll 等以 .active 判断"当前工具页"（任务 Step 5A 约定，
         #tool-host 即所有工具页的 pageEl 容器） */
      host.classList.add('active');

      /* 已注册：直接挂载 */
      const mod = this.routes.get(id);
      if (mod) {
        this._mountTool(id, mod, host);
        return;
      }

      /* 未注册：按需动态加载 js/tools/{文件名}.js（相对路径，不写 / 开头）
         Step 8：路由切换瞬间的加载态从 spinner 文案换成骨架屏 */
      LB.ui.skeleton(host, 3, 'card');
      const file = (this.MODULE_FILES && this.MODULE_FILES[id]) || id;
      this.loadScript('js/tools/' + encodeURIComponent(file) + '.js')
        .then(() => {
          if (seq !== this._navSeq) return; /* 用户已切走，丢弃过期回调 */
          const m = this.routes.get(id);
          if (!m) { this._showBuilding(host); return; }
          this._mountTool(id, m, host);
        })
        .catch(() => {
          if (seq !== this._navSeq) return;
          host.innerHTML = FAIL_HTML;
        });
    },

    _mountTool(id, mod, host) {
      /* 挂载（幂等：重复进入同一工具时先卸载再重挂，保证状态干净） */
      if (this._current && this._current.id === id && typeof mod.refresh === 'function') {
        mod.refresh();
      } else {
        if (this._current) host = this._unmountCurrent() || host;  /* Step 8：取克隆后的新 host */
        host.innerHTML = '';
        try { mod.mount(host); } catch (e) { host.innerHTML = FAIL_HTML; return; }
      }
      this._current = { id, mod };

      /* Step 6A：注入分享按钮（92 个工具此前零传播出口）
         —— 放在 mount/refresh 之后：只有 DOM 里有 .tool-head 了才能注入。
         inject 内部幂等（已存在则跳过），故refresh 分支重复调用也安全。 */
      this._injectShare(id, host);

      /* Step 6E：注入工具链路互推按钮（把结果一键送入下一个工具）
         —— 同样放在 mount/refresh 之后，links.inject 内部幂等。 */
      this._injectLinks(id, host);

      /* Step 8：统一隐私 / 数据来源声明 —— 本地敏感工具标"不上传"，联网工具标数据来源。
         放在最后注入页脚；_injectTrust 内部幂等（已有 .tool-footer 则跳过）。 */
      this._injectTrust(id, host);

      /* 最近使用：去重后 unshift，最多 12 条 */
      const rec = LB.storage.get('litebox_rec', []);
      const i = rec.indexOf(id);
      if (i > -1) rec.splice(i, 1);
      rec.unshift(id);
      LB.storage.set('litebox_rec', rec.slice(0, 12));

      /* 使用统计 */
      const usage = LB.storage.get('litebox_usage', {});
      usage[id] = (usage[id] || 0) + 1;
      LB.storage.set('litebox_usage', usage);
    },

    init() {
      /* 工具脚本通过 js/tools/{id}.js 自注册；此处无需静态登记 */

      /* Step 22 · 三：返回按钮全局兜底。
         docbox 的左上角箭头点了没反应，根因是它自己的 mount 里漏了 [data-back] 绑定
         —— 全站 120+ 工具各自手写这条绑定，漏一个就坏一个，所以在路由层统一兜住。
         工具自己的绑定照常执行；hash 重复赋同一个值不会产生第二次 hashchange。
         data-go 保留任务书写法（.back[data-go="home"]），默认回首页。 */
      document.addEventListener('click', e => {
        const back = e.target.closest && e.target.closest('.back, [data-back]');
        if (!back) return;
        e.preventDefault();
        LB.hash.go(back.getAttribute('data-go') || 'home');
      });
    },

    /* Step 6A：给当前工具页注入分享按钮
       ——抽成独立方法，供 _mountTool 的两个分支（mount / refresh）共用。 */
    _injectShare(id, host) {
      if (!host || id === 'home') return;
      if (!LB.ui || !LB.ui.share || typeof LB.ui.share.inject !== 'function') return;
      const tool = Array.isArray(LB.tools) ? LB.tools.find(t => t.id === id) : null;
      if (!tool) return;
      try {
        LB.ui.share.inject(host, id, tool.name);
      } catch (_) {
        /* 注入失败绝不能影响工具本身的使用 */
      }
    },

    /* Step 6E：给当前工具页注入链路按钮
       —— 与 _injectShare 同构：失败静默，绝不能影响工具本身的使用。 */
    _injectLinks(id, host) {
      if (!host || id === 'home') return;
      if (!LB.links || typeof LB.links.inject !== 'function') return;
      try {
        LB.links.inject(host, id);
      } catch (_) {
        /* 同上 */
      }
    },

    /* Step 8：统一隐私声明。
       - 涉及「上传图片/文件或输入敏感信息」的本地工具标注「仅本机处理、不上传」；
       - 其余工具（如进制转换）不强加。
       Step 11 红线：**界面上不得标注任何数据来源**（如「数据来源：xxx.com」），
       故原先给联网工具打的「📌 数据来源：…」页脚已整体移除，
       下面只保留本地处理声明。
       幂等：已存在 .tool-footer 则跳过，不覆盖工具自己的页脚说明。 */
    _injectTrust(toolId, host) {
      if (!host || !host.isConnected || host.querySelector('.tool-footer')) return;
      const tool = Array.isArray(LB.tools) ? LB.tools.find(t => t.id === toolId) : null;
      if (!tool) return;

      /* 本地工具：只对「上传图片/文件」或「输入敏感信息」类注入本地处理声明 */
      const LOCAL_DECLARE_IDS = [
        'idphoto', 'compress', 'watermark', 'grid9', 'crop', 'fix', 'imgbatch',
        'image64', 'gifmake', 'docscan', 'exif', 'pdf', 'docbox',
        'imgstyle',
        'resume', 'notes', 'ledger', 'meallog', 'assets', 'period', 'water',
        'calorie', 'todo', 'quicklinks', 'subscriptions', 'daymatter'
      ];

      let note = '';
      if (LOCAL_DECLARE_IDS.indexOf(toolId) > -1) {
        note = '🔒 文件仅在本机浏览器内处理，不上传服务器';
      }
      if (!note) return;

      const footer = document.createElement('div');
      footer.className = 'tool-footer';
      const span = document.createElement('span');
      span.className = 'foot-note';
      span.textContent = note;
      footer.appendChild(span);
      host.appendChild(footer);
    }
  };
})();
