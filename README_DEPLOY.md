# LiteBox v4.1.0 专业精致完整版

## 目标
移动端优先、Apple 风格玻璃质感、分类清晰、动画顺滑、在线工具同源调用、前台不展示第三方服务名称。

## 为什么除了 index.html 还有其它文件？
`index.html` 本身当然可以直接双击打开。计算器、文本处理、图片本地处理、日期计算等纯前端工具不依赖其它文件。

额外的 `functions/` 是为了天气、壁纸、IP、语音等需要联网的数据请求：它们通过网站自己的 `/api/...` 路径转发或汇总，减少跨域失败和前台暴露服务地址。`_routes.json` 决定哪些 URL 交给 Pages Functions；`_headers` 放安全/缓存响应头；`wrangler.toml` 与 `package.json` 保持 Cloudflare Pages + Wrangler 的部署结构。

## 目录
```text
index.html
functions/
  _shared.js
  api/
    ip.js
    weather.js
    wallpaper.js
    tts.js
    stt.js
    mirror-check.js
  v1/audio/
    speech.js
    transcriptions.js
_headers
_routes.json
wrangler.toml
package.json
deploy.cmd
deploy.ps1
```

Cloudflare Pages：Build command 建议 `exit 0`，Build output directory 为 `.`，Framework 选 None；正式部署使用 Git 集成或 Wrangler。
