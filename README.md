# 轻工具箱 LiteBox v5

本地优先的免费在线工具集，114 个实用工具 + 13 个后端接口。

## 快速开始

### 本地开发

```bash
npx wrangler pages dev public
```

打开 http://localhost:8788

### 部署到 Cloudflare Pages

```bash
npx wrangler pages deploy public
```

或推送到 GitHub 后在 Cloudflare Pages 面板连接仓库自动部署（构建命令留空，输出目录 `public`）。

## 项目结构

```
.
├── public/               # 静态站点（Cloudflare Pages 部署目录）
│   ├── index.html        # 单页应用入口
│   ├── 404.html          # 404 页面
│   ├── manifest.json     # PWA 配置
│   ├── icon.svg          # 主图标（PNG 图标的导出母版）
│   ├── robots.txt / sitemap.xml / _headers / _redirects
│   ├── css/              # 样式（tokens.css 为唯一变量来源）
│   ├── js/
│   │   ├── core/         # 核心模块（DOM / 存储 / 主题 / 快捷键 / 在线状态 / 错误处理…）
│   │   ├── registry/     # 分类与工具注册表
│   │   ├── ui/           # UI 模块（首页 / 导航 / 弹层 / 搜索）
│   │   ├── api/          # 网络请求封装
│   │   ├── tools/        # 114 个工具模块
│   │   ├── router.js     # 路由
│   │   └── app.js        # 启动入口
│   ├── vendor/           # 第三方库（按需加载，不进首屏）
│   └── vendor/dict/      # 内置数据表（拼音 / 简繁 / 诗词 / 成语 / 农历…）
├── functions/            # Cloudflare Pages Functions
│   ├── _utils.js         # 公共工具（不注册为路由）
│   └── api/              # 13 个 API 接口
└── wrangler.toml         # Cloudflare 配置（含 [ai] binding）
```

## 开发约定

### 全局命名空间

所有代码挂到 `window.LB`，禁止污染其它全局变量（vendor 第三方库的全局名除外）。

### 工具模块结构

每个工具一个文件 `public/js/tools/{id}.js`：

```js
(function() {
  function mount(root) { /* 挂载 */ }
  function unmount() { /* 清理 */ }
  LB.router.register('{id}', { mount, unmount });
})();
```

### 数据流

- 工具元数据唯一来源：`public/js/registry/tools.js`
- 网络请求统一走：`LB.api.getJSON / postJSON`
- 存储统一走：`LB.storage.get / set`
- 复制统一走：`LB.copy(text)`
- Toast 统一走：`LB.toast(msg, type)`
- 图片工具公共能力（载入 / 拖拽 / 粘贴 / 导出 / 下载）：`LB.img.*`

### 样式约定

- 颜色/间距/圆角/阴影全部用 `tokens.css` 里的变量
- 禁止在其它 CSS 文件硬编码颜色（例外：元素周期表分类色、简历/PDF 纸张语义色、骰子物理语义色——均已收口 tokens 变量或任务明示）
- 禁止用 `!important`（仅 base.css 有两处例外：`[hidden]` 与 prefers-reduced-motion）

### 全局快捷键

- `Ctrl/⌘ + K`：回首页并聚焦搜索
- `/`：非输入态聚焦搜索
- `ESC`：关闭弹层 → 退出工具页
- `Ctrl/⌘ + Enter`：触发当前工具页主按钮（`.js-primary-submit`）

## 数据来源

（见 PROGRESS.md「数据来源致谢」）

## 许可

本项目所有代码为原创。第三方库遵循各自协议：

- XLSX (SheetJS)：Apache-2.0
- pdf-lib：MIT
- PDF.js：Apache-2.0
- JSZip：MIT
- mammoth：BSD-2-Clause
- MediaPipe：Apache-2.0
- qrcode-generator：MIT
- jsQR：Apache-2.0
- piexifjs：MIT
