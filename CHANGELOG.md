# LiteBox 版本记录

> 当前版本：**v2.10.0**
> 上一版本：v2.9.4（原始包，全站 404，未含本次修复与升级）

---

## v2.10.0（本次发布）

**部署修复（从 v2.9.4 起已解决，本版沿用并验证）**
- 部署文件平铺到仓库根目录，根目录含 `index.html`，解决全站 404。
- 修复 `functions/v1/audio/speech.js`、`transcriptions.js` 的 `import` 路径多一级 `../` 导致构建 `Build failed`。
- 补全 `_routes.json` 的 `exclude` 字段，满足新版 Cloudflare 校验。
- 新增 `wrangler.toml`，支持 `wrangler pages deploy` 一键部署。

**功能升级（本轮新增）**
| 模块 | 改了什么 |
|---|---|
| 导航 / 首页 | 底部导航下移、关闭"分类随下滑高亮"（仅点击高亮）、点击分类跳转精准（修正滚动偏移被导航遮挡） |
| 来电模拟 | 重写：全屏来电遮罩 + 自定义头像/号码/状态 + 接听计时，WebAudio 稳定响铃（原"点了没反应"已修） |
| 天气预报 | 修复深色模式白色 stat 方块；手机端 5 日预报横向滑动、搜索/定位换行、取消 sticky 重叠；380px 超小屏降级 |
| 壁纸中心 | 新增 8 大分类（抽象/美食/旅行/花卉/运动/影视/海洋/森林）；新增 Picsum 随机源 + 2 个 Bing 镜像，图源更丰富稳定 |
| 简历生成器 | 4 套模板（经典/现代/左栏/紧凑）实时切换 + 打印/导出 PDF + 内容持久化 |
| 聚会小游戏 | 新增大话骰(吹牛)双人计分、真心话/大冒险拆为双题库、保留骰子比大小/转瓶子 |
| 周期记录 | 3 个月历热力图自动推算预测经期、统计"下一次预计/距离还有 X 天/平均周期" |
| 伙食记录 | 早/午/晚/零食/饮料餐型 chips、按餐型分组汇总、当日合计、可删历史 |

**部署验证**
- 全文件 7 个 `<script>` 块语法 0 错误。
- 本地 `wrangler pages dev`：`/` → 200、`/api/ip` → 200，各目标模块 section 均在位。

---

## 如何更新到本版本（详见《部署步骤.md》"更新部署"章节）

你已成功部署过一次，部署通道（Git 或 Wrangler）已就绪。更新 = 用本版文件**替换线上文件并重新生成部署**：

- **Git 方式**：把 `LiteBox-v2.10.0/` 内全部文件覆盖到仓库根目录 → `git add -A && git commit -m "v2.10.0" && git push` → Cloudflare 自动构建新版本，`litebox.pages.dev` 自动更新。
- **Wrangler 方式**：在 `LiteBox-v2.10.0/` 目录执行 `wrangler pages deploy . --project-name litebox`。
- ⚠️ **不要用 Dashboard 拖拽上传**——它不编译 `functions/`，接口会 404。
- 构建设置保持不变：**Build command = `exit 0`**，**Build output directory = `.`**。
- 发布后可到 Dashboard → Deployments 查看每次提交对应的版本与预览地址，必要时可一键回滚。
