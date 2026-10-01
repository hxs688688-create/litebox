@echo off
setlocal
cd /d "%~dp0"
echo.
echo === LiteBox Wrangler 部署 ===
echo.
echo [1/3] 检查 Wrangler...
npx wrangler --version
if errorlevel 1 goto :error

echo.
echo [2/3] 登录 Cloudflare（如果已经登录会直接跳过）...
npx wrangler whoami
if errorlevel 1 (
  echo 未检测到登录，正在打开 Cloudflare 登录...
  npx wrangler login
  if errorlevel 1 goto :error
)

echo.
echo [3/3] 部署到 Pages 项目 litebox...
npx wrangler pages deploy . --project-name=litebox
if errorlevel 1 goto :error

echo.
echo 部署完成。原网址应继续为：https://litebox.pages.dev/
pause
exit /b 0
:error
echo.
echo 部署失败，请把上面的完整报错截图/复制给我。
pause
exit /b 1
