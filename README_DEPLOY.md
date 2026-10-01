# LiteBox v2.9.4 — Cloudflare Pages 稳定部署版

目标：保留原来的 `litebox.pages.dev`，不再使用 Pages Advanced Mode / `_worker.js`。

## 推荐部署

使用 GitHub + Cloudflare Pages Git integration。

仓库根目录必须直接包含：
- index.html
- _headers
- _routes.json
- functions/

Cloudflare Pages：Workers & Pages → Create application → Pages → Connect to Git。

Build command：`exit 0`
Build output directory：`.`（项目根目录）

如果你直接用 Wrangler：
`npx wrangler pages deploy . --project-name litebox`

注意：Dashboard 的 Pages Drag & Drop 不会编译 functions 目录；要部署 Functions 请使用 Git integration 或 Wrangler。

部署后检查：
- `/`
- `/api/ip`
- `/api/tts`
- `/api/stt`

这样生产地址继续使用：`litebox.pages.dev`。
