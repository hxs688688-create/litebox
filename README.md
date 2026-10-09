# 轻工具箱 LiteBox v5

本地优先的免费在线工具集，136 个实用工具 + 29 个后端接口。

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

### 环境变量（最终清单）

| 变量 | 用途 |
|---|---|
| `XIAOAPI_KEY` | xiaoapi.cn 专用：文本翻译、IP 查询、历史今日、灾害预警 |
| `OVO1_KEY` | ovo1.cc 通用：聚合解析、工商信息、票房、限免 |
| `XUNJINLU_KEY` | xunjinlu.fun 金价专用：实时金价 |
| `YUNMGE_KEY` | yunmge.com 云萌阁 OCR：图片转文字（`/api/ocr`，Step 32 恢复；Step 33 起 FormData 本地图片上传） |
| `YAOHUD_KEY` | yaohud.cn 战力查询：英雄战力（`/api/wzzl`，Step 32 新增；Step 33 起 lei 按文档短码 qq/wx/pqq/pwx） |

可选：`AI`（Workers AI 绑定，语音转写兜底）、`TTS_ENDPOINT`（自建 TTS 服务地址）。
`OVO1_KEY2` 已废弃（工商信息改用通用 `OVO1_KEY`），面板里如果还留着可以删掉。
Step 32 起战力数据源已从 ovo1.cc 换为 yaohud.cn，`OVO1_KEY` 不再用于战力。

工商「服务未配置」排查：部署后打开 Cloudflare → Functions → Real-time logs，
查一次工商，看 `[gongshang] keyLen=` 是否大于 0；为 0 说明 `OVO1_KEY` 没保存或没重新部署。
工商多结果排查：同一日志里看 `[gongshang] code= … count= …`，`code=300` 表示上游返回多条候选，
前端会弹选择层，选中后带 `select=序号` 再查一次详情。

热榜 / 60 秒 / AI / IT 资讯「数据获取失败」排查：浏览器直接打开
`https://你的域名/api/60s?type=weibo`，看返回体里的 `detail` 字段——
它是真实原因（界面只统一显示「数据获取失败，请稍后重试」）。
注意主域名 `60s.viki.moe` 站在 Cloudflare 上，而 Cloudflare 转发时会强制注入
`cf-connecting-ip`，上游 CDN 见到这个头直接回 403，所以「Pages Functions → 主域名」
这一跳必然失败。

Step 33 起 `functions/api/60s.js` 改为**并发择优**：每轮同时问 3 台核心镜像，
带日期的（60s / AI 资讯）取最新日期，纯列表热搜取**内容签名多数派**；
结论不可信（孤源 / 全空 / 无当日数据）再对剩余镜像补一轮仲裁。
之前「手机上永远是前几天的热搜、只有电脑实时」就是顺序取源把最快但系统性滞后的
镜像钉成了 preferred（Functions 按 isolate 隔离，手机和电脑各钉各的）。
现在 preferred 只由「证实新鲜的胜出者」设置，故障主机移到队尾 10 分钟，
全源失败时用 5 分钟内的上一轮数据兜底；单次请求总预算仍是 10s。
Real-time logs 里看 `[60s] decided type= … host= … date= … verdict= … agree= …`，
`verdict= stale` + `lagging` 表示全网都滞后（只能取相对最新的一份），不是选源 bug。

OCR「OCR 服务未配置」排查：Real-time logs 看 `[ocr] YUNMGE_KEY length=`——
为 0 是变量没配或没重新部署。Step 33 起按云萌阁文档改用 **FormData 上传**
（`token` + 图片二进制 `file`），只支持本地图片（base64 data URL），
传 JSON 会被上游判 504「缺少token参数」、传图片 URL 一律前端 400「请上传本地图片」；
上游回 504~522 的配置/额度类错误码统一提示「OCR 服务未配置或额度不足」。

战力排查：Real-time logs 看 `[wzzl] YAOHUD_KEY length=` 与 `[wzzl] name= … lei=`。
Step 33 起 `lei` 按妖狐文档（api.yaohud.cn/doc/42）提交短码 `qq / wx / pqq / pwx`
（界面标签仍是安卓QQ/安卓微信/苹果QQ/苹果微信），中文旧值后端自动归一；
返回字段按文档 `lowest/medium/highest/guobiao + lowestname/mediumname/highestname + time`
精确映射，界面为英雄名、平台、四格战力、地区与三档门槛所在区服、更新时间。

## 部署与缓存（改了代码却看不到变化时看这里）

`public/_headers` 里 `/css/*`、`/js/*`、`/vendor/*` 是 `max-age=31536000, immutable`（一年不回源），
靠 URL 上的 `?v=` 版本号来更新；`/*.html` 与 `/` 是 `max-age=0, must-revalidate`，每次都会回源校验。

发布新版本的流程：

1. 改代码；
2. 把 `public/js/app.js` 顶部的 `window.LB_VERSION` 和 `public/index.html` 里全部 `?v=` 一起改成新版本号
   （例如 `5.3.0` → `5.3.1`，两处必须一致）；
3. 部署。

用户侧行为：

- 静态资源：URL 变了，天然拉新的，无需任何操作；
- 旧版 HTML：新版部署后自己会回源校验拿到新 HTML；
- 若用户仍停留在旧 HTML 上：`app.js` 启动时比对 `localStorage.lb_version`，发现版本变化会清掉
  Cache Storage 并自动刷新一次（`sessionStorage` 兜底，最多刷一次，不会循环）。

仍看不到新版时手动清一次：

- 电脑：`Ctrl+Shift+R`（macOS `Cmd+Shift+R`）；
- 手机：清浏览器缓存，或开无痕窗口重新访问。

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
│   │   ├── tools/        # 138 个工具模块（含 image-common / ffmpeg-common 两个公共模块）
│   │   ├── router.js     # 路由
│   │   └── app.js        # 启动入口
│   ├── vendor/           # 第三方库（按需加载，不进首屏）
│   └── vendor/dict/      # 内置数据表（拼音 / 简繁 / 诗词 / 成语 / 农历…）
├── functions/            # Cloudflare Pages Functions
│   ├── _utils.js         # 公共工具（不注册为路由）
│   └── api/              # 28 个 API 接口（60s.js 为热榜 / 日更资讯统一代理）
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
- 骨架屏 / 空状态 / 下拉刷新：`LB.ui.skeleton` / `LB.ui.empty` / `LB.ui.pull`（Step 30）
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
