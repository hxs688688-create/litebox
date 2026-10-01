# LiteBox v3.0 — Wrangler / Cloudflare Pages

这版专门解决“保留 litebox.pages.dev，同时使用 Pages Functions”的部署问题。

## 项目结构

```text
index.html
functions/
  _shared.js
  api/ip.js
  api/tts.js
  api/stt.js
_headers
_routes.json
wrangler.toml
package.json
deploy.cmd
deploy.ps1
```

## Windows 最简单部署

1. 解压本目录。
2. 双击 `deploy.cmd`。
3. 第一次会打开 Cloudflare 登录授权页面；登录你拥有 `litebox` Pages 项目的账号。
4. 脚本随后执行：

```powershell
npx wrangler pages deploy . --project-name=litebox
```

## 手动命令

```powershell
npx wrangler login
npx wrangler pages deploy . --project-name=litebox
```

## 部署前本地测试

```powershell
npx wrangler pages dev .
```

默认打开：`http://localhost:8788`

## 重要

- 这是 Cloudflare **Pages** 部署，不是 Workers 独立项目。
- 不要在 Workers 创建新项目。
- 不要使用 Advanced Mode。
- 不要把 `functions` 移到其他目录。
- `index.html` 必须和 `functions`、`wrangler.toml` 在同一级根目录。
- 生产项目名默认按你的现有项目写成 `litebox`；如果 Cloudflare 后台实际项目名不同，把命令里的 `litebox` 换成实际项目名。

## 部署后检查

1. `https://litebox.pages.dev/`
2. `https://litebox.pages.dev/api/ip`
3. TTS/STT 在页面内测试

如果首页打不开，先不要改文件。直接把 `deploy.cmd` 最后的完整终端输出发给我，我根据 Wrangler 的真实错误继续处理。
