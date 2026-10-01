$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host "=== LiteBox Wrangler 部署 ==="
npx wrangler --version
try { npx wrangler whoami | Out-Host } catch { npx wrangler login }
Write-Host "正在部署到 Cloudflare Pages 项目 litebox..."
npx wrangler pages deploy . --project-name=litebox
Write-Host "部署完成。原网址应继续为：https://litebox.pages.dev/"
