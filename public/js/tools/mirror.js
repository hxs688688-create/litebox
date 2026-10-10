/* LiteBox v5 · tools/mirror.js — 镜像加速（GitHub 加速 / Docker 源 / 开发源，纯本地生成 + 复制） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  /* GitHub 镜像前缀（任务给定顺序） */
  const GH_PROXIES = [
    'https://ghfast.top/',
    'https://gh-proxy.com/',
    'https://ghproxy.net/',
    'https://github.moeyy.xyz/',
    'https://slink.ltd/',
    'https://gh-proxy.org/',
    'https://ghproxy.cc/'
  ];

  /* Docker 镜像源（任务给定） */
  const DOCKER_MIRRORS = [
    'https://docker.1ms.run',
    'https://docker.xuanyuan.me',
    'https://dockerproxy.net',
    'https://docker.m.daocloud.io',
    'https://hub.rat.dev'
  ];

  /* 开发源换源命令（任务给定） */
  const DEV_CMDS = [
    ['npm 永久换源', 'npm config set registry https://registry.npmmirror.com'],
    ['yarn 换源', 'yarn config set registry https://registry.npmmirror.com'],
    ['pnpm 换源', 'pnpm config set registry https://registry.npmmirror.com'],
    ['pip 临时使用清华源', 'pip install 包名 -i https://pypi.tuna.tsinghua.edu.cn/simple'],
    ['pip 永久换清华源', 'pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple'],
    ['Go 模块代理', 'go env -w GOPROXY=https://goproxy.cn,direct'],
    ['git clone 加速', 'git clone https://gitclone.com/github.com/用户名/仓库名.git']
  ];

  const GH_RE = /^https?:\/\/(github\.com|raw\.githubusercontent\.com|gist\.github\.com|github\.io)/i;

  let rootEl = null;
  let tab = 'gh';
  let checkHidden = false; /* 检测按钮：同源服务不可用时隐藏 */

  /* ---------- GitHub 加速 ---------- */

  function ghRepo(url) {
    const m = url.replace(/^https?:\/\//i, '').match(/^(?:github\.com|raw\.githubusercontent\.com|gist\.github\.com)\/([^\/]+)\/([^\/]+)/i);
    return m ? { user: m[1], repo: m[2].replace(/\.git$/i, '') } : null;
  }

  function isRepoRoot(url) {
    if (!/github\.com/i.test(url)) return false;
    return !/\/(blob|tree|releases|raw|raw\.githubusercontent|commit|issues|pull|wiki)(\/|$|\?)/i.test(url.replace(/^https?:\/\/github\.com/i, ''));
  }

  function genGh() {
    const url = $('#mrIn', rootEl).value.trim();
    if (!url || !GH_RE.test(url)) { LB.toast('请粘贴 GitHub 相关链接', 'info'); return; }
    const out = [];
    for (const p of GH_PROXIES) {
      out.push({ name: p.replace(/^https:\/\//, '').replace(/\/$/, ''), text: p + url });
    }
    /* 识别为仓库 URL → 额外生成 git clone 命令两行 */
    const rp = ghRepo(url);
    if (rp && isRepoRoot(url)) {
      out.push({ name: 'gitclone', text: 'git clone https://gitclone.com/github.com/' + rp.user + '/' + rp.repo + '.git' });
      out.push({ name: 'proxy clone', text: 'git clone ' + GH_PROXIES[0] + 'https://github.com/' + rp.user + '/' + rp.repo + '.git' });
    }
    $('#mrOut', rootEl).innerHTML = out.map((x, i) =>
      '<div class="mr-row">' +
      '<div class="mr-info"><span class="mr-name">' + esc(x.name) + '</span>' +
      '<code class="mr-link">' + esc(x.text) + '</code></div>' +
      '<button class="btn btn-ghost btn-sm" data-copy="' + esc(x.text) + '" type="button">复制</button>' +
      '</div>'
    ).join('');
    $('#mrOut', rootEl).hidden = false;
  }

  async function runCheck() {
    if (checkHidden) return;
    /* file:// 预览无同源服务：直接隐藏按钮（避免 fetch 报错污染 Console） */
    if (!HAS_API) {
      checkHidden = true;
      const b0 = $('#mrCheck', rootEl);
      if (b0) b0.hidden = true;
      LB.toast('同源服务未部署，暂不支持可用性检测', 'info');
      return;
    }
    const btn = $('#mrCheck', rootEl);
    btn.disabled = true;
    btn.textContent = '⏳ 检测中…';
    try {
      /* Step 4 后端实现；不可用时按钮隐藏。
         timeout 须大于后端对单个镜像的 5s HEAD 上限（慢镜像会耗满 5s 才返回），否则批量检测中途超时中断 */
      const results = [];
      for (const p of GH_PROXIES) {
        const d = await LB.api.getJSON('/api/mirror-check?url=' + encodeURIComponent(p + 'https://github.com/'), { timeout: 8000 });
        results.push({ name: p, ms: d && d.ms, ok: !!(d && (d.ok || d.available)) });
      }
      if (!rootEl) return;
      const box = $('#mrCheckOut', rootEl);
      box.innerHTML = results.map(r =>
        '<div class="mr-checkrow"><span>' + esc(r.name) + '</span>' +
        '<b>' + (r.ok ? '✅ ' + (r.ms ? r.ms + ' ms' : '可用') : '❌ 不可用') + '</b></div>'
      ).join('');
      box.hidden = false;
    } catch (e) {
      if (!rootEl) return;
      /* 后端不可用 → 隐藏按钮 */
      checkHidden = true;
      const b2 = $('#mrCheck', rootEl);
      if (b2) b2.hidden = true;
      const out = $('#mrCheckOut', rootEl);
      if (out) out.hidden = true;
      LB.toast('同源服务未部署，暂不支持可用性检测', 'info');
    } finally {
      const b3 = rootEl && $('#mrCheck', rootEl);
      if (b3) {
        b3.disabled = false;
        b3.textContent = '🩺 检测可用性';
      }
    }
  }

  /* ---------- 渲染 ---------- */

  function ghHtml() {
    return (
      '<div class="mr-tabpane" id="mrPaneGh">' +
      '<div class="mr-search">' +
      '<input class="inp" id="mrIn" maxlength="300" placeholder="粘贴 GitHub 链接：仓库 / blob / raw / releases / gist" />' +
      '<button class="btn btn-main btn-sm" id="mrGo" type="button">⚡ 生成加速链接</button>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm mr-check" id="mrCheck" type="button">🩺 检测可用性</button>' +
      '<div id="mrCheckOut" hidden></div>' +
      '<div id="mrOut" hidden></div>' +
      '</div>'
    );
  }

  function dockerHtml() {
    const cfg = JSON.stringify({ 'registry-mirrors': DOCKER_MIRRORS }, null, 2);
    return (
      '<div class="mr-tabpane">' +
      '<p class="mr-tip">编辑 /etc/docker/daemon.json（Windows 在 Docker Desktop 设置 → Docker Engine），加入以下配置后重启 Docker：</p>' +
      '<div class="mr-cfgbox"><code>' + esc(cfg) + '</code>' +
      '<button class="btn btn-main btn-sm mr-copycfg" data-copy="' + esc(cfg) + '" type="button">📋 复制配置</button></div>' +
      '<p class="mr-tip">重启命令：sudo systemctl restart docker · 拉取验证：docker pull hello-world</p>' +
      '</div>'
    );
  }

  function devHtml() {
    return (
      '<div class="mr-tabpane">' +
      '<div class="card mr-devcard">' +
      DEV_CMDS.map(c =>
        '<div class="mr-row">' +
        '<div class="mr-info"><span class="mr-name">' + esc(c[0]) + '</span>' +
        '<code class="mr-link">' + esc(c[1]) + '</code></div>' +
        '<button class="btn btn-ghost btn-sm" data-copy="' + esc(c[1]) + '" type="button">复制</button>' +
        '</div>'
      ).join('') +
      '</div>' +
      '</div>'
    );
  }

  function renderTab() {
    $('#mrPaneGh', rootEl).hidden = tab !== 'gh';
    $('#mrPaneDocker', rootEl).hidden = tab !== 'docker';
    $('#mrPaneDev', rootEl).hidden = tab !== 'dev';
    document.querySelectorAll('.seg[data-tabs] > button').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-t') === tab);
    });
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>镜像加速</h1><p>GitHub 加速链接、Docker 镜像源与开发工具换源命令</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg" data-tabs>' +
      '<button data-t="gh" class="on" type="button">🐙 GitHub 加速</button>' +
      '<button data-t="docker" type="button">🐳 Docker 源</button>' +
      '<button data-t="dev" type="button">🛠️ 开发源</button>' +
      '</div>' +
      ghHtml() +
      '<div id="mrPaneDocker" hidden>' + dockerHtml() + '</div>' +
      '<div id="mrPaneDev" hidden>' + devHtml() + '</div>' +
      '<p class="cd-note">第三方镜像可用性随时变化，请以实际访问为准；本工具本地生成链接，不收集任何输入。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#mrGo', root).addEventListener('click', genGh);
    $('#mrIn', root).addEventListener('keydown', e => { if (e.key === 'Enter') genGh(); });
    $('#mrCheck', root).addEventListener('click', runCheck);
    /* tab 切换 */
    root.querySelector('.seg[data-tabs]').addEventListener('click', e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      tab = b.getAttribute('data-t');
      renderTab();
    });
    /* 复制事件委托：一个 listener 处理整个工具内的 [data-copy] */
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-copy]');
      if (btn) {
        LB.copyWithToast(btn.getAttribute('data-copy'));
        return;
      }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
    renderTab();
  }

  function unmount() {
    rootEl = null;
  }

  LB.router.register('mirror', { mount, unmount });
})();
