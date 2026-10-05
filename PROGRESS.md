# LiteBox v5 项目进度

## 状态：✅ 可上线

## 项目定位
- 工具类网站，部署 Cloudflare Pages
- 静态前端 + 同源 Functions（/functions/api/）
- 纯原生 HTML/CSS/JS，无框架无构建

## 全局红线（永久生效）
- 禁 ！important（仅 base.css 的 [hidden] 和 prefers-reduced-motion 例外）
- 禁内联 style/script（404.html 1 处内联 style 为孤立页面例外，Step 5B 明示）
- 禁在 tokens.css 之外硬编码颜色（例外：tools.css 元素周期表 .pc-* 分类色、简历/PDF 纸张语义色、聚会骰子 --die-* 物理语义色）
- 全局只挂 window.LB（+ vendor 第三方库全局名）
- TOOLS 唯一数据源 = registry/tools.js
- 工具模块一文件 public/js/tools/{id}.js，导出 {mount, unmount}，通过 LB.router.register(id, ...) 注册
- 网络请求走 LB.api.client
- CSS 复用 components.css / tools.css 已有类

## 完成情况
- Step 1 ✅ 骨架 + 设计系统 + 核心层
- Step 2 ✅ 分类注册表 + 工具注册表 + 首页
- Step 3 ✅ 91 个工具全部实现（10 个分类；早期规划 89，Step 3A 样板 radix 进制转换 / textstats 文本统计一直在册，最终以 91 交付）
- Step 4 ✅ /functions/api/ 后端 13 个接口
- Step 5A ✅ 快捷键 / 粘贴上传 / 在线状态 / 错误处理
- Step 5B ✅ SEO / PWA / 部署配置 / 404 页面
- Step 5C ✅ 最终验收（全站自检 A-I + 2 处修复：party 骰子色迁移 tokens、wheel 转盘 375 溢出）
- Step 5D ✅ 视觉修复（hero 徽章换行 / 搜索放大镜被盖 / 91 卡片 emoji 补齐 / 卡片内容贴边）
- Step 5D-1 ✅ 两个硬 Bug 修复（去水印等 3 工具 canvas 显示不全 / 复制按钮静默失败）

## 完成步骤明细（历史批次）
- [x] Step 3A · 工具模块契约 + API 层 + 5 样板（radix/uuid/textstats/randomnum/shorturl）
- [x] Step 3B · 图片设计 8 个（compress/image64/grid9/watermark/crop/fix/imgbatch/idphoto + image-common 公共模块）
- [x] Step 3C · 文本语言 23 个（qr/texttool/textconvert/jsonfmt/b64/hash/diff/urlparse/unicode/regex/mdview/dedup/csvtab/textscan/xmlfmt/jsonmerge + pinyin/zhconv/poem/idiom + radix/textstats + 8 个字典数据）
- [x] Step 3D · 学习效率 12 个（countdown/gpa/stats/datecalc/pomo/timer/notes/todo/wheel/group/lots）
- [x] Step 3E · 财务计算 6 个（loan/tax/rmb/fxrate/ledger/subscriptions）
- [x] Step 3F · 日常生活 14 个（bmi/sleep/daymatter/water/quicklinks/tsconv/idcard/phone/meallog/period/calendar/ingredient/medbox/assets）
- [x] Step 3G · 网络工具 14 个（mbti/ptable/surname/iplookup/weather/dnslookup/speedtest/translate/hotlist/webarchive/mirror/wallpaper/train + shorturl）
- [x] Step 3H · 音视频 7 个（rec/screencap/acut/vframe/vconv/tts/stt）
- [x] Step 3I · 收尾 7 个（fileinfo/filemerge/sheetbox/party/resume/pdf/docbox）
- [x] Step 4A-4C · Functions 基础 + 13 个 API 全部完成（任务逐字 + curl/Node stub/Playwright 三层验收）
- [x] Step 5A · 全站打磨第一批 7 项（shortcuts 统一快捷键 / online 离线条 / errors 全局错误 / bindPasteAll 粘贴全局化 / registry web:true + 首页动态双计数 / 20 主按钮 js-primary-submit / 缩略图 lazy）——router 给 #tool-host 加/去 .active 配合 pageEl 守卫；Ctrl+Enter 选择器兼容工具页容器
- [x] Step 5B · SEO + PWA + 部署配置（head 扩充 og/twitter/ld+json / manifest / icon.svg / robots / sitemap / _headers / _redirects / 404 页）——theme.js syncMeta 改 :not([media]) 保护双 theme-color 方案
- [x] Step 5C · 最终验收 + 上线清单（A-I 全项自检，见文末验收记录）
- [x] Step 5D · 视觉修复 4 项（home.css hero-badge 加 white-space:nowrap、search-ic 加 z-index:1 修复 backdrop-filter 层叠遮盖 / registry 70 个 ic emoji 补齐 58 空 + 12 残缺 / components.css .card 加 padding:14px / 骰面关联 4 色补迁 tokens --die-glow/edge/shine/shadow）——17 项 Playwright 验收全 PASS + 91 工具 375 回归无溢出
- [x] Step 5D-1 · 两个硬 Bug 修复（fix/crop/imgbatch 打码 canvas 统一 6 条规则 + clipboard.js 重写 + copyWithToast 全站 30 文件改造）——22 项 Playwright 验收全 PASS

## 目录结构
```
public/（143 个文件）
  index.html / 404.html / manifest.json / icon.svg / robots.txt / sitemap.xml / _headers / _redirects
  css/ 6 个（tokens 唯一变量源 / base / layout / components / home / tools）
  js/core/ 12 个（dom / storage / toast / clipboard / theme / hash / shortcuts / online / errors / lunar / random / dict）
  js/registry/ 2 个（categories / tools）
  js/ui/ 4 个（home / tabbar / sheet / search）
  js/api/ 1 个（client.js）
  js/tools/ 92 个（91 工具模块 + image-common 公共模块，不注册路由）
  js/router.js / js/app.js
  vendor/ 9 个库（xlsx / pdf-lib / pdf.js / pdf.worker / jszip / mammoth / qrcode-generator / jsQR）
  vendor/dict/ 8 个数据表（拼音 / 简繁 / 诗词 / 成语 / 农历 / 成分 / 元素 / 姓氏）
functions/（14 个文件）
  _utils.js + api/ 13 个（ip / weather / dns / fxrate / wallpaper / hotlist / archive / mirror-check / translate / drug / train / speech / transcribe）
wrangler.toml（pages_build_output_dir + [ai] binding）
```
（共 158 个文件；functions/ 与 public/ 平级，Cloudflare Pages 自动识别；icon-192/512/maskable.png、og-image.png、favicon.ico 待用户按文末清单手动生成）

## 工具清单（96 个 · Step 6C 后）
- 图片设计 9 个：idphoto / compress / watermark / grid9 / crop / fix / imgbatch / image64 / **imgstyle**
- 文本语言 23 个：qr / texttool / textconvert / jsonfmt / b64 / hash / diff / uuid / urlparse / unicode / regex / mdview / dedup / csvtab / textscan / xmlfmt / jsonmerge / pinyin / zhconv / poem / idiom / radix / textstats
- 文件文档 5 个：pdf / docbox / fileinfo / filemerge / sheetbox
- 学习效率 12 个：countdown / gpa / pomo / wheel / group / todo / stats / timer / notes / lots / rand / datecalc
- 财务计算 6 个：loan / tax / rmb / fxrate / ledger / subscriptions
- 日常生活 15 个：bmi / sleep / calendar / idcard / phone / daymatter / meallog / period / water / quicklinks / ingredient / medbox / assets / tsconv / **relative**
- 网络工具 15 个：mbti / ptable / surname / iplookup / weather / dnslookup / speedtest / translate / hotlist / webarchive / mirror / wallpaper / train / shorturl / **deadpixel**
- 音视频 7 个：rec / screencap / acut / vframe / vconv / tts / stt
- 聚会娱乐 1 个：party
- 求职办公 1 个：resume
- OCR 识别 1 个（Step 6A 新增分类）：**ocr**

路由完整性：96/96 一一对应（id ↔ public/js/tools/{id}.js，rand→randomnum.js 共用映射），缺失 0、多余 0。
Step 6C 全量挂载回归：**96 个工具逐个进入/离开，0 失败、Console 0 报错、375px 均无横向滚动**。

## 后端接口（13 个）
- /api/ip（ipwho.is → ip-api.com 双源）
- /api/weather（Open-Meteo geocoding + forecast）
- /api/dns（阿里 → Google DoH）
- /api/fxrate（open.er-api.com → frankfurter）
- /api/wallpaper（Bing → Picsum → Unsplash 兜底）
- /api/hotlist（60s API 六镜像并发容错）
- /api/archive（archive.org + Arquivo.pt 双源）
- /api/mirror-check（10 域名白名单 HEAD 检测）
- /api/translate（MyMemory）
- /api/drug（OpenFDA 药品标签）
- /api/train（12306/携程跳转链接）
- /api/speech（TTS：TTS_ENDPOINT 转发或 Google Translate 兜底）
- /api/transcribe（Workers AI whisper，需 [ai] binding）

## 用户上线前必做（**手动操作**）

### 1. 生成图标（必须）
访问 https://realfavicongenerator.net/
上传 `public/icon.svg`
按提示生成全平台图标
下载解压后，把以下文件放入 `public/`：
- icon-192.png
- icon-512.png
- icon-maskable.png
- og-image.png
- favicon.ico

（HTML/manifest 引用路径已就位，PNG 缺失不阻塞功能，仅影响安装图标与分享卡片）

### 2. 修改域名（必须）
把以下文件中 `https://litebox.pages.dev` 替换为你的实际域名：
- public/robots.txt 里的 Sitemap
- public/sitemap.xml 里的 loc
- public/index.html 里的 JSON-LD url

### 3. 启用 Workers AI（推荐）
Cloudflare 面板 → Workers & Pages → AI → 启用
否则 /api/transcribe 返回 503

### 4. 部署
方式 A（推荐）：推送到 GitHub → Cloudflare Pages 连接仓库自动部署
方式 B：`npx wrangler pages deploy public`
方式 C：Cloudflare Pages 面板上传（会遗漏 functions，不推荐）

构建配置：
- 构建命令：留空
- 构建输出目录：public

### 5. 部署后验证
- 访问首页，加载正常
- 访问 `/api/ip` 返回 JSON
- 手机添加到主屏幕，独立打开
- 从社交平台分享链接，卡片正常显示

## 已知限制
- 火车票查询不代理 12306，只提供跳转
- TTS 使用 Google Translate 兜底，单次 200 字符（前端自动分段）
- 药品信息来自 OpenFDA（英文覆盖好，中文覆盖差）
- hash 路由不能被搜索引擎单独索引

## 数据来源致谢
- 天气：open-meteo.com
- 汇率：open.er-api.com
- IP：ipwho.is / ip-api.com
- DNS：dns.alidns.com / dns.google
- 热榜：60s API 社区镜像
- 壁纸：loremflickr（主源，关键词语义化）+ Unsplash（兜底）；旧 Bing/Picsum 已弃用（Step 5D-2）
- 网页快照：web.archive.org / arquivo.pt
- 药品：api.fda.gov
- 翻译：api.mymemory.translated.net
- TTS：translate.google.com（兜底）
- STT：Cloudflare Workers AI

## 最终验收（Step 5C 自检记录）
- 91/91 工具可用（Playwright 逐个挂载遍历，pageerror=0）
- 13/13 接口正常（本地 dev curl 逐项验收于 Step 4A/4B/4C；Workers AI 需账号启用后生效，本地走 503 未配置路径）
- Console 无代码缺陷报错（91 工具遍历：代码缺陷 0；网络类报错均为沙箱上游不可达的预期容错，前端全部 catch 降级）
- 移动端 375px 无横向滚动（91 工具 + 首页逐页检查；修复 wheel 转盘 .wh-stage 固定 width 溢出 → width:auto+max-width:420px，宽屏 420 居中不回归）
- CSS 变量规范（修复：party 3D 骰子 3 色自 tools.css 迁移 tokens --die-face-a/--die-face-b/--die-pip；Step 5D 进一步升级：元素周期表 .pc-* 11 分类色迁至 tokens --pt-*、骰面关联 4 色迁至 --die-glow/edge/shine/shadow；余下硬编码仅简历 A4 纸张语义色，以「允许硬编码」起止注释框定例外区）
- 无 !important（仅 base.css [hidden] 与 prefers-reduced-motion 两处允许项）
- 无内联 style/script（index.html 0 处；404.html 1 处内联 style 为任务明示例外）
- window 全局仅 LB + 第三方库全局名（赋值型污染 0）
- SEO/PWA：og/twitter meta、ld+json 可解析、manifest 200、robots/sitemap 正确、_headers 缓存与安全头生效（wrangler dev 实测）、404 页渲染正常

## Step 5D 视觉修复验收记录（17 项 Playwright 全 PASS）
- 问题 1 · hero-badge 换行 → 根因：inline-flex 容器中文本节点与 `<b>` 各自成匿名 flex 项分别折行；修复：home.css `.hero-badge{white-space:nowrap}`；实测 375px 高 33.8px 单行完整、right=321 ≤376
- 问题 2 · 搜索框放大镜缺失 → 根因：input 的 backdrop-filter 创建 stacking context 且 DOM 靠后，与 absolute 图标同为 z-index:auto 按源序绘制，玻璃背景整体盖住图标（数据/样式全部正常，纯层叠问题）；修复：home.css `.search-ic{z-index:1}`；实测 18×18 可见、padding-left 46px
- 问题 3 · 卡片 emoji 缺失 → 根因：registry/tools.js 数据缺失（58 个 ic:'' 空 + 12 个只剩不可见的 U+FE0F 变体选择符，仅 21 个有效），渲染代码正常；修复：脚本补齐 70 个（后微调：idphoto/idcard 的 🪪 为 Unicode 14 新字符老设备易成方框，改 📷/📇）；复核 91/91 有效，首页 91 卡片缺图标 0
- 问题 4 · 卡片内容贴边 → 根因：components.css `.card` 无 padding，全站 15 处裸用；修复：`.card{padding:14px}`（自带 padding 的组合类如 .set-card 定义在后覆盖同值，无双重风险）；实测 TTS 提示与卡片边界 15px ≥14px，5 代表工具（证件照/二维码/TTS/房贷/简历）0 溢出
- 连带升级 · 骰面关联 4 处 rgba（光晕/描边/内高光/落影）为 5C 迁移遗漏，补迁 tokens；周期表 11 分类色一并迁 --pt-*
- 回归：91 工具 375px 遍历无横向溢出（.card 加 padding 无副作用）；Console 非网络报错 0；无新增 !important；无硬编码色（tokens 定义处 + 声明式语义色例外区除外）

## Step 5D-1 硬 Bug 修复验收记录（22 项 Playwright 全 PASS）
- Bug 1 · fix/crop/imgbatch 打码 canvas 显示不全 → 真正根因仅 fix.js 一处：`#fxCover` canvas 缺 `class="cover"`，CSS `.crop-wrap canvas.cover{position:absolute;inset:0}` 不命中 → 蒙版以 static 排在底层画布下方，容器高度翻倍（实测 1446px = 722×2），"灰白空白区"即透明蒙版 canvas，涂抹坐标因 cover rect 错乱而偏移；crop/imgbatch 为单层画布本就正常（canvas 属替换元素，max-width 约束时高度按内在比例自适应）
  - fix.js：fxCover 补 class="cover"（行 244）；bindPointer 5 个监听从 cover 改绑 cv（cover 已按规则设 pointer-events:none，事件必须落在底层画布）；toXY 改 scaleX/scaleY 分开换算且用底层 rect（行 20-29）；mount 设内联显示样式（base 100%/auto/block/圆角，cover absolute 0/0/100%/100%/pointer-events:none，行 272-283）；onFiles 补 clearRect + console.log 自检（行 218-227）
  - crop.js：toCanvasXY 改 scaleX/scaleY 分开（行 16-25）；showImage 补 clearRect + 自检日志（行 108-122）；mount 设 100%/auto/block 内联样式（行 219-223）
  - imgbatch.js（仅打码 tab）：toXY 同改双 scale（行 224-233）；setupMosaic 设内联样式（行 222-228）；loadMosaic 补 clearRect + 自检日志（行 344-356）
  - tools.css：.crop-wrap 补 background:transparent（行 139-144）
- Bug 2 · 复制按钮没反应 → clipboard.js 原实现缺空串拦截与 iOS 必需的 focus/setSelectionRange，且 notes/quicklinks/tsconv/rmb 4 处"无论成败都报已复制"（stt/sheetbox 失败静默）；修复：clipboard.js 按标准模板重写（空串 return false / clipboard API 优先 / textarea+execCommand 兜底含 cssText 隐藏与 setSelectionRange），新增 LB.copyWithToast（成功 ok 提示、失败 err 提示"请长按文本手动复制"）
  - 全站 32 处 LB.copy 调用点 → 30 个工具文件全部改为 LB.copyWithToast（22 处标准模式 sed 批量 + 10 处自定义消息手动：urlparse/csvtab 已复制 JSON、translate 已复制译文、tsconv 动态时间戳、surname「x」信息、docbox 已复制到剪贴板等）；copyText 旧名全站 0 处无需处理
- 验收：竖图 1080×2340 上传 fix → base/cover 属性一致 692×1500、两层 rect 重合 333×722、容器高 724px 不再翻倍、底部涂抹 alpha=248 而顶部 0（跟手）；crop 底部框选 top=70%（跟手）；横图 1600×900 打码等比 1.777 完整、底部打码生效；3 工具 375px 无溢出；9 个复制按钮实测全部有 toast 且剪贴板内容正确（颜色工具/天气为任务条件项：91 工具无独立颜色工具、weather 无复制按钮，跳过）；Console 0 报错

## Step 5D-2/3 壁纸换源 + 火车票真查询 + 词典扩充验收记录（13 项 Playwright 全 PASS）
- 壁纸后端重写（functions/api/wallpaper.js）：主源换 loremflickr（关键词语义化：14 分类映射 CAT_KEYWORDS，URL `https://loremflickr.com/{W}/{H}/{kw}?lock={n}`，lock 保证同 seed 同图、page 翻页 lock 从 page*12+1 递增不重复；q 搜索词覆盖分类；size=mobile 1080×1920 竖版）；FALLBACK_IDS 6 条 Unsplash 兜底（后端异常时）
- 壁纸前端重写（public/js/tools/wallpaper.js）：15 分类 chips（含手机分类）/CAT_CN 中文映射；fallbackImages() 前端降级直构 loremflickr；bindImgFallback() 用 addEventListener('error') 移除坏图卡片 + maybeAutoLoad() 剩余<6 自动补页（≤2 次）——任务建议的内联 onerror 因项目「禁内联 script」红线改为等价事件委托；switchCat() 清空网格+去重集+搜索词完全刷新；seen 去重集用完整 URL 作 key（按 url.split('?')[0] 去重会使同关键词全部图片坍缩为一个 key，与 lock 不同 URL 不同的设计意图相悖）
- 火车票后端重写（functions/api/train.js）：双源真查询（源 1 vvhan api.vvhan.com/api/train → 源 2 oioweb api.oioweb.cn/api/train/train）→ 均不可达时降级 { available:false, reason, links:[12306/携程] }；trains 字段映射 { code,from,to,depart,arrive,duration,seat }
- 火车票前端加固（public/js/tools/train.js）：renderTrains 空列表分支（"未查询到车次，请尝试车站全名"）；seat 统一收口为对象再渲染（防字符串/数组/null 崩溃）；run() 判定改 `d.available === true && Array.isArray(d.trains)`（原 `d.trains.length` 使空数组误落降级分支，验收 t11 暴露后修复）；.tr-item 样式 tools.css 已有等价定义无需新增
- 词典扩充（public/vendor/dict/）：poems 100 → 304 首（四批合并：61 唐诗 + 61 中晚唐/宋词 + 72 唐宋补/元明清 + 10 补齐；格式 {t,a,d,c,b,n}）；idioms 300 → 800 条（五批：100 褒义 + 100 贬义 + 100 描写 + 100 典故 + 50+50 事理哲理/常用高频；格式 {w,p,m,s,syn}）；两库均全量查重 0 重复、字段完整 0 缺失、无英文残留；批次合并器 merge-batch.mjs（eval 解析 + 查重 + 尾逗号预处理 + node --check + eval 复核）
- 验收（13/13 PASS + Console 0 报错）：首屏 12 卡 featured page=1；switchCat 切动漫请求 anime 关键词且网格重载；加载更多 page=2 卡片 24；手机 seg → size=mobile thumb 540×960 竖版；搜索"灯塔"回车 → q 参数覆盖（"星空"命中 space 分类 label 属预期智能切换）；404 图 onerror 移除 + 自动补页（12→24）；375px 无横向滚动；train mock available:true 渲染 2 条车次（G2028/座位标签）；trains:[] 显示"未查询到车次"；后端 500 → 降级链接 2 条；seat:null 不抛错
- 环境备忘：本次验收踩坑——hash 路由为 `#wallpaper`（无斜杠，`#/wallpaper` 解析为 `/wallpaper` 不匹配显示"建设中"）；停服务改用 `fuser -k 8788/tcp`（避免 pkill -f 自杀）

## Step 5E 七项体验问题修复验收记录（19 项 Playwright 全 PASS + Console 0 报错）
- 问题 A · 复制按钮失效 → 诊断：LB.copy 存在且 https/localhost 下 isSecureContext=true 可用，症结在旧实现的兼容缺口；修复：core/clipboard.js 按标准模板重写——LB.copy 返回 Promise\<boolean\>（空串直接 resolve(false)；navigator.clipboard.writeText 存在即优先尝试、不再前置 isSecureContext 拦截，API 拒绝自动落 fallback；fallback = 隐藏 textarea + focus/setSelectionRange + execCommand）；新增 LB.copyWithToast(text, msg) 统一成功/失败提示；app.js ready 回调内补 `window.toast = window.toast || LB.toast`（旧代码裸 toast() 短名兼容，必须放 ready 内——顶层 IIFE 执行时 toast.js 尚未 eval）
- 问题 B · 智能填充发白 → 根因：原算法对候选点取等权均值 + 三通道共享单一噪声，大区域填充色偏离边界底色且有色块感；修复：fix.js doFill 整体重写为加权边界扩散——逐层扩张（正交邻居权重 2、对角 1）保证填充色从边界一致生长；每通道独立 ±2 噪声消除色块感；2px 边缘羽化带（3×3 均值 alpha 混合）消除硬分界；rAF 分块执行（每帧 40ms 预算）不卡 UI，累计超 3 秒提示一次"填充中…"，撤销栈 push 保持在填充前。实测 480×320 蓝底图白块填充区与背景 RGB 总差仅 1-2（修复前肉眼可见发白）
- 问题 C · 弹层 ✕ 无法关闭 → 根因：sheet.js 未绑定 ✕/mask 点击关闭；修复：sheet.js 按模板重写为 document 捕获阶段事件委托——mask 空白（e.target === mask）与 closeBtn（[data-close]/.sheet-close/.lb414-sheet-close/.x 多选择器命中）均关闭，preventDefault+stopPropagation 防穿透；ESC 键仅在存在打开弹层时触发；open() 强制互斥（先关所有弹层）+ rAF 后加动画类；close() 动画 320ms 后 hidden。实测分类/我的弹层 ✕、mask 空白、ESC 四路全关
- 问题 D · 弹层顶部白框 → 根因排查：任务猜测的 .sheet::before 伪元素项目中不存在；真因是 .sheet-hd（sticky 头部）background:var(--sheet-bg) 为不透明渐变，盖住 .sheet 自身 backdrop-filter 玻璃背景形成"白条"；修复：layout.css .sheet-hd 改 background:transparent（保留 border-bottom 分隔线）。实测 computed backgroundColor = rgba(0,0,0,0)
- 问题 E · 底部导航太靠上 → 根因核查：.tabbar 本身已是 bottom:calc(6px + var(--safe-bottom)) 且无覆盖，感知空隙来自 body padding-bottom 不足（54+22=76px）使内容提前结束；修复：base.css body padding-bottom 统一为 calc(80px + var(--safe-bottom))。实测 tabbar bottom=6px、body padding=80px
- 问题 F · 首页分类标题无图标 → 根因：registry/categories.js icon 表与 5D 的 tools.js 同病全空（图片设计只剩孤立 U+FE0F，其余 9 个空串），CSS .ct-ic 正常；修复：补齐 10 分类 emoji（🎨📝📁🎓💰🏠🌐🎬🎉💼）。实测 10/10 非空
- 问题 G · 首页下滑 chip 不联动 → 根因：home.js 无滚动监听；修复：mount() 末尾挂 setupScrollSync()——rAF 节流的 scroll handler，探测线 probe = scrollY + 头部高 + 分类导航高 + 24，命中 .cat-sec 区块即切换 .chip.on；仅首页 + 全部视图 + 搜索词为空时生效（其余 return）；只切类绝不触发滚动（防死循环）；goAll/goFav/scrollToCat 点击路径同步 _scrollChip 状态去重。实测下滑到文本语言/网络工具 chip 正确联动、回顶部切回"全部"、搜索视图下滚动不改变 chip
- 验收（19/19 PASS + Console 0 报错）：A 诊断 LB.copy/copyWithToast function + 复制 true；A×5 复制（文本处理/Base64/UUID/进制/数字大写）toast + 剪贴板内容全对；C×4 关闭路径全过；D sheet-hd rgba(0,0,0,0)；E bottom 6px + padding 80px；F 共 10 空 0；G×4 联动/回顶/搜索隔离；B 蒙版 4140 像素 + 填充差 1-2 + toast"填充完成"
- 环境备忘：① html{scroll-behavior:smooth} 使长距离滚动（4300px+）达 1.2s，测试固定 waitForTimeout(600) 会采到滚动中途（chip 停在上一个分类）——验收脚本改轮询等 scrollY 连续 2 次稳定再断言（时间线证实 chip 联动本身逐区正确切换，非产品 Bug）；② 沙箱 Chromium 缺彩色 emoji 字体，DOM 断言过但截图渲染方框——apt 装 fonts-noto-color-emoji 后重截正常

## Step 5F 四项问题修复验收记录（21 项 Playwright 全 PASS + Console 0 报错）
> 本轮改变做法：不再靠"加诊断代码→让用户截图"，而是把诊断脚本在沙箱内用真实 Chromium 跑完，
> 先拿到硬数据再改代码。所有结论均来自 computed style / getBoundingClientRect 实测，非推测。

- 问题 A · 复制按钮全部失效（第三次修复）→ **诊断先行**：在 clipboard.js 挂 `LB_diagnoseCopy`、app.js 加 3 秒自动诊断横幅，实测三种环境
  - 127.0.0.1（安全上下文）：isSecureContext=true、hasClipboardAPI=true、copyResult=true、execCommand=true
  - 172.24.0.3:8901（局域网 IP，**非安全上下文**）：isSecureContext=**false**、hasClipboardAPI=**false**、copyResult=true（靠 fallback）
  - file://：copyResult=true
  - 结论：**"复制全失效"在 Chromium 上无法复现**（5 个工具点按钮全部有 toast、剪贴板内容一致）。故根因判定为设备侧——
    旧 fallback 的隐藏元素写法对 iOS/微信 X5 不兼容：`opacity:0` + `pointer-events:none` + `left:-9999px` + `readonly`
    四者叠加会让 select()/setSelectionRange() 选区为空，execCommand('copy') 静默返回 false，表现为"点了完全没反应"。
  - 修复（public/js/core/clipboard.js 整体重写，纯 async/await）：
    ① fallback 临时元素改为 `position:fixed;top:-9999px;left:0;width:1px;height:1px;opacity:1`，去掉 pointer-events/opacity/readonly，保留布局盒子使 iOS 认定其可聚焦；先 window.focus()→body.focus()→ta.focus() 再 select()→setSelectionRange()（iOS 需在 select() 之后再次调用 setSelectionRange 才生效）
    ② execCopy 多策略 + 重试：textarea → contentEditable+Range → textarea 再来一次（iOS 首次常因用户手势过期失败，第二次即成功）
    ③ 新增手动复制兜底弹窗 showManualCopy()：双 API 全失败时弹出全选文本框（打开即 select + ESC/遮罩/按钮三路关闭），保证任何环境用户都能拿到文本，对应需求"复制失败，请长按手动复制"从提示变成可操作
    ④ copyWithToast 对 LB.toast 缺失再降级 alert，确保点复制必有反馈
  - 顺带修复（验收暴露）：translate.js:96 `if (!text) return;` 是全站 22 个复制点中**唯一**静默返回的（其余 21 处均有 LB.toast 提示），点"📋 复制译文"毫无反应 → 改为 `LB.toast('还没有译文，请先翻译','info')`
  - 加载顺序核查：index.html:156 clipboard.js 早于 :174 tools/image-common.js，**本就正确**，无需调整
  - 诊断代码清除：LB_diagnoseCopy 与 app.js 的 setTimeout 诊断横幅已全部删除（grep 复核 0 残留）
- 问题 D · 弹层白框 → **诊断证伪了任务给的三个猜测**：`.sheet::before/::after` 的 content 实测均为 `none`（伪元素不存在）；`.sheet-hd` 在 Step 5E 已改 transparent（不是它）；真因是 `--sheet-bg` 渐变两端透明度高达 **96%/84%**，近乎不透明，弹层整体被渲染成一块白色实心板，顶部观感即"白矩形"
  - 修复 1（css/tokens.css:49）：`--sheet-bg` 改为 62%→52% 真半透明，且上下透明度接近 → 弹层呈连续玻璃背景
  - 修复 2（css/layout.css 末尾，任务指定的三重兜底全加）：`.sheet::before/::after{content:none;display:none;background:none}`；`.sheet h3/.sheet-hd/.lb414-*` 系列 `background:transparent;border:none;box-shadow:none;border-radius:0`；`.sheet>*:first-child{margin-top:0}`；另加 `.sheet{background-image:var(--sheet-bg);background-color:transparent}` 与 `.sheet .sheet-hd{backdrop-filter:none}`（消除 sticky 头部与父级 backdrop-filter 二次高光叠加）
  - 实测：分类/我的两个弹层顶部子元素背景全为 rgba(0,0,0,0)，伪元素 none/none
- 问题 E · 底部导航未贴底 → **诊断**：`.tabbar` 全站仅 layout.css:39 一处定义（bottom:6px + var(--safe-bottom)），**并无任务预期的多处冲突**；真实观感差异来自底部间距 6px 而非贴底
  - 修复（css/layout.css 末尾，唯一允许 !important 的位置）：`.tabbar{position:fixed;left:50%;bottom:calc(4px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);margin-bottom:0;padding-bottom:6px}`；`body{padding-bottom:calc(78px + env(safe-area-inset-bottom,0px))}`（base.css 的 80px 收口为任务指定 78px）；`html{scroll-padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))}`
  - 实测：position=fixed、bottom=4px、距视口底 4px、水平居中偏差 <2px、body padding=78px、滚到底部最后卡片未被遮挡
- 问题 G · chip 横向不滚动 → **诊断**：Step 5E 的 _syncChip 只 toggle `.on` 类，注释明写"绝不触发滚动（防死循环）"，这正是横向不滚的直接原因；实测下滑到"文本语言"时 chip 中心偏移 +200px（chip 完全在屏外）
  - 修复（public/js/ui/home.js）：把居中逻辑收进 `_syncChip()` 内部（而非只改 scroll 监听），使**全部调用路径**（下滑联动/点击 chip/goFav/goAll）自动一致，高亮与横向滚动永不脱节
  - 实现要点：用 offsetLeft/offsetWidth/clientWidth 手算 target = max(0, chipLeft-(barWidth-chipWidth)/2)，调 `bar.scrollTo({left,behavior:'smooth'})`；**只滚 chipBar 自身 scrollLeft，不触发祖先滚动**（若改用 scrollIntoView 会连带影响竖向滚动，与 scroll 监听互相干扰）；偏差 <2px 时直接 return，避免每次联动都触发平滑动画造成卡顿
  - 实测：文本语言/财务计算/日常生活三区 chip 均居中且完整可见（偏移 9/19/14px），回顶部"全部"chip 复位，竖向滚动未被阻断（scrollY 正常）
- 验收（21/21 PASS + Console 0 报错）：A×5 工具（文本处理/JSON格式化/进制转换/UUID/翻译）复制全部有 toast；A 剪贴板内容与 marker 完全一致；A 诊断代码已清除；E×5（fixed/4px/居中/78px 留白/滚到底不遮挡）；D×4（两弹层顶部无白块 + 伪元素禁用）；G×5（三区居中 + 回顶复位 + 竖向滚动正常）
- 额外验证（超出验收清单）：局域网 IP 非安全上下文下 fallback 复制成功（isSecureContext=false 且无 navigator.clipboard 仍 ok=true）；双 API 全失败时兜底弹窗正常弹出且文本完整、打开即全选（ta.selectionEnd 匹配）；iOS UA 模拟下检查 fallback 临时元素 computed style —— opacity=1、pointer-events=auto、readonly=false、保留 1px 尺寸、top=-9999px，四项 iOS 友好指标全部达标
- 环境备忘：① 沙箱内 `python3 -m http.server` 必须用 `setsid nohup ... &` 启动，否则 Bash 工具会等待子进程；`pkill -f` 匹配自身命令行会导致自杀，改用换端口方式；② 模拟"非安全上下文"必须用局域网 IP（172.24.0.3）访问，127.0.0.1 与 file:// 都被 Chromium 判定为安全上下文，无法复现该分支

## Step 5G 三项问题根治验收记录（复制 / 弹层 / 壁纸）
> 延续 Step 5F 的做法：不盲改，先在沙箱内把诊断跑完拿到硬数据，再动代码。
> 任务要求"诊断框显示在页面给用户截图"——已按要求实现并**保留**在 app.js（用户确认复制问题解决后再删）。

### 问题 A · 复制完全不可用（第 3 次）→ **前两次修复无效的真正根因**
- 先按 spec 把诊断框加进 app.js（2500ms 触发，黑底绿字，点击可关），沙箱内跑两种环境取真实输出：
  - 非安全上下文（局域网 IP 172.24.0.3）：`isSecureContext: false`、`hasClipboardAPI: false`、**`LB.copy() returned: false`**、`execCommand copy returned: false`
  - 安全上下文（127.0.0.1）：`hasClipboardAPI: true`、`LB.copy() returned: false`、`navigator.clipboard ERROR: Write permission denied`、`execCommand copy returned: false`
- 逐步打点定位（pinpoint）：在**同步上下文**里单独调 execCommand('copy') 返回 **true**；
  焦点链 window.focus() → body.focus() → ta.focus() 全部正常，selectionStart/End = 0/13 选区正常。
- 对照实验（gesture.js / clicktest.js，真实鼠标点击）：
  - 方案1「先 await navigator.clipboard.writeText，失败再落 execCommand」→ `fallback-ok`（要等一次异步往返）
  - 方案2「同步先跑 execCommand，再考虑 clipboard API」→ `exec-ok(第1步就成功)`
- **根因定论**：`await` 会把控制权交回事件循环，**瞬时用户手势（transient user activation）随之过期**。
  iOS Safari / 微信 X5 对手势过期后的 execCommand('copy') 直接静默返回 false —— 表现就是"点了完全没反应、连 toast 都没有"，
  正是前两次修复后用户仍报告的现象。Chromium 桌面端对手势过期宽容，所以本地怎么测都是好的，只有真机复现。
  Step 5F 反而加重了问题：它把 clipboard API 放在最前面 await，等于每次都先把手势浪费掉。
- 修复（public/js/core/clipboard.js 整体重写，**同步优先**）：
  ① 第一个字节就**同步**执行 execCopy（不 await、不跨任务）→ 保住手势，iOS/微信首选路径
  ② 成功即返回；失败再走 navigator.clipboard.writeText（现代浏览器兜底），并加 1200ms 兜底 settle 防 Promise 悬挂
  ③ 两者都失败 → showManualCopy() 弹全选文本框（打开即 select，ESC/遮罩/按钮三路关闭），保证用户一定拿得到文本
  ④ 保留 Step 5F 的 iOS 友好细节：临时元素 `position:fixed;top:-9999px;left:0;width:1px;height:1px;opacity:1`，
     不设 pointer-events:none / readonly；setSelectionRange 在 select() 之后再次调用
  ⑤ LB.toast 缺失时降级 alert，保证点复制必有反馈
- 调用点审计（spec 要求报告数量）：
  - `grep -rn "LB\.copy(" public/js/` → 仅 app.js 诊断代码内 3 处 + clipboard.js 注释，**无遗留业务调用**
  - `grep -rn "copyText(" public/js/` → 仅 clipboard.js 内部函数定义与自引用，**无遗留**
  - `LB.copyWithToast(` → **32 处**，分布 **31 个工具文件**，全部已收敛（Step 5E 已完成，本轮复核无遗漏）
- 加载顺序核查：index.html:156 clipboard.js 早于 :174 tools/image-common.js，**本就正确**，未改动
- 保留：app.js 末尾诊断框（`#lb-diag-box`）按 spec 要求不删，实测 `诊断框存在: true`

### 问题 B · 弹层半透明样式坏了 → **是 Step 5F 自己造成的**
- 根因：Step 5F 为消除"顶部白框"把 `--sheet-bg` 降到 62%→52% 并强制 `background-color:transparent !important`，
  结果弹层整体半透明、能透出背后首页内容，玻璃感与卡片边界一起消失。
- 修复：
  - css/tokens.css `--sheet-bg` 改回 `var(--card)`（实心）
  - css/layout.css:71-83 `.sheet` 主定义 `background:var(--card)`，保留 `backdrop-filter:blur(30px)`，补 `overscroll-behavior:contain`
  - css/layout.css 末尾覆盖块改为 `background:var(--card) !important; background-image:none !important; backdrop-filter:blur(30px) !important`
  - 保留 Step 5F 的去白框三重规则（::before/::after content:none、.sheet-hd 透明且不参与 backdrop 叠加、首子元素 margin-top:0）
- 实测：两个弹层 `backgroundColor: rgb(255,255,255)`（alpha=255 实心）、`backdrop-filter: blur(30px)` 玻璃感仍在、
  `::before content: none`、顶部子元素背景全 `rgba(0,0,0,0)` → 既实心又无白框，两个目标同时满足

### 问题 C · 壁纸加载不出来 → **loremflickr 已彻底失效**
- 源可用性实测（关键诊断）：
  - `loremflickr.com/800/600/nature?lock=1` → **HTTP 401 + 89KB HTML 页面**（不是图片！加 UA、加 /all、加 /g/ 三种写法全部 401）
  - `source.unsplash.com/random` → **HTTP 503**
  - `images.unsplash.com/photo-xxx` 直链 → 200 + 合法 JPEG（18/18 通过）
  - `picsum.photos/seed/xxx/W/H` → 200 + 合法 JPEG
  - 结论：Step 5D-2 选定的 loremflickr 主源**一直不可用**，前端 <img> 拿到的是 HTML，解析失败 → 永远灰黑占位图；
    且前端 fallbackImages() 降级路径也直连 loremflickr，后端一挂连降级一起失效。
- 修复 1 · 新增 functions/api/wallpaper-image.js（同源图片代理）：
  - 源优先级：Unsplash 分类白名单（15 类 × 4 张，**59 个 ID 全量实测 200**）→ Picsum 按 seed 兜底
  - **Content-Type 强校验**：必须 `image/(jpeg|png|webp)`，否则视为失败并降级——这一条直接堵住旧 bug
    （失效源返回 HTML 错误页却被当图片发出的问题）
  - 体积校验 <1KB 视为无效；超时 6s/8s；lock 决定具体图，分类内取模轮换保证翻页不重复
  - **AVIF 拦截**：实测上游按 Accept 协商会返回 AVIF，而微信 X5 / 旧 iOS WebView 不支持 AVIF，
    会再次表现为"加载不出来"→ 加 `fm=jpg` 强制 JPEG，并在校验层显式拒绝 image/avif
- 修复 2 · functions/api/wallpaper.js 改为只返回同源代理地址 `/api/wallpaper-image?...`，
  移除 CAT_KEYWORDS 与 loremflickr 直构逻辑，新增 `source:'proxy'` 标识
- 修复 3 · public/js/tools/wallpaper.js 的 fallbackImages() 同步改为构造代理地址
  （原实现直连死源，后端不可用时降级路径等于无效）；删除已无用的 KW 映射表
- 验证（spec 第 4 步 curl 判据）：因 wrangler pages dev 需 CLOUDFLARE_API_TOKEN（本地无凭证，远程代理会话起不来），
  改用 Node 原生 fetch 直调 functions 真实逻辑（等价于 Worker 运行时）：
  - 列表接口：12 项、url/thumb 均为 /api/wallpaper-image、**JSON 中不含 loremflickr**
  - 6 组尺寸取图全部 200，体积 25KB–334KB，**均远超 spec 的 10KB 门槛**，魔数 `ff d8 ff`（真实 JPEG，非 HTML）
  - 分类语义：beauty/landscape/space/animal/car 各 lock=1 与 lock=2 均为不同图
  - 幂等：同参数两次返回字节完全相同的图
  - 边界：w=10 / w=99999 / lock=0 / w=abc / 空参数 全部受控返回，无异常
  - 浏览器端到端（本地服务把 /api/* 接到真实 functions）：12 卡片、**loaded 8 / broken 0**；
    切"美女"分类后 loaded 6 / broken 0，截图确认夜景山野、雪林、城市等真实图片正常显示
- 工具函数实测对照：wrangler 4.147.0 存在但 pages dev 需 API token，沙箱无法登录，故未走 wrangler 链路

### 验收汇总（14/14 PASS + Console 0 报错）
- A×7：5 个工具（文本处理/JSON格式化/进制转换/UUID/翻译）真实点击全部有 toast；execCommand 同步路径可用；
  诊断框按要求保留在页面；调用点 32 处/31 文件已全部收敛；加载顺序正确
- A 剪贴板内容：单独复核 `LB.copy('LB5G-REAL-...')` → true，`navigator.clipboard.readText()` 读回**完全一致**
  （首轮 match:false 系 headless 下 readText 无用户手势的测试假象，非产品缺陷）
- B×6：工具分类/我的 两个弹层均实心（rgb(255,255,255) alpha=255）+ blur(30px) 玻璃 + 顶部无白框
- C×6：后端 21 项断言 + 浏览器端到端图片正常加载
- 页面错误：0

### 环境备忘
- ① `npx wrangler pages dev` 在无 CLOUDFLARE_API_TOKEN 的非交互环境会报
  "Failed to start the remote proxy session"，加 `--local` 也不行；验证 Functions 逻辑改用 Node 直调 onRequest
- ② 诊断框是 z-index:99999 的全屏浮层，会拦截 Playwright 的真实点击（`intercepts pointer events`）；
  自动化测试中需先 `remove()` 再操作页面，或用 evaluate 触发点击
- ③ 上游 Unsplash 偶发单次超时（000），重试即 200；批量校验脚本需带重试，否则会误判为失效

---

## Step 5H — 5 项问题修复（完成记录）

用户反馈 5 个问题，其中问题 A（复制）在 vivo 浏览器上完全失败。
本轮所有结论均来自实测（Chromium 真实渲染 + 逐项对照实验 + Node 直调 Functions），
任务书与实测不符之处**以实测为准并说明原因**。

### 问题 A · 复制在国产浏览器"假成功"

- 现象：点复制 → 弹"已复制"toast → 但粘贴出来是空的（vivo 浏览器）。
- 根因（与 Step 5G 完全不同的问题）：国产浏览器（vivo/OPPO/小米/华为/UC/QQ/微信内置）的
  `navigator.clipboard.writeText()` 有实现缺陷——**Promise resolve 了但根本没写入系统剪贴板**，
  属业界已知问题。而 Step 5G 的链路第一步就是 clipboard API，于是它"成功"了，
  程序不再fallback，用户拿到空剪贴板 + 一个误导性的成功 toast。
- 修复（public/js/core/clipboard.js 整体重写，166 行）：
  1. 新增 `isDomesticBrowser()`：UA 正则匹配
     `vivo|oppo|xiaomi|miui|huawei|honor|ucbrowser|qqbrowser|mqqbrowser|micromessenger|quark|baidubrowser|sogou|2345|heytapbrowser`
     → 命中国产浏览器时**完全跳过 clipboard API**，直接 execCommand（同步，无 await）
  2. execCommand 前先`document.activeElement.blur()`（焦点在按钮上时国产内核会拒绝）
  3. 临时 textarea 用 `opacity:0.01`（非 0）+ 居中定位，**不设 readonly**，
     关闭 autocapitalize/autocomplete/autocorrect/spellcheck；保留 Step 5G 的
     "select() 后再 setSelectionRange"（iOS 必需）
  4. 失败 → `showManualCopy()` 弹可长按文本框（打开即全选），保证用户一定能拿到文本
  5. 其余浏览器仍走 Step 5G 验证过的"同步 execCommand 优先"，仅在其失败后退到 clipboard API
- 诊断增强（public/js/app.js）：诊断框新增 `isDomesticBrowser` 一行，
  并按任务书要求在末尾追加 `[Tabbar 诊断]` console.log（含 gapToViewportBottom）。
  **两处诊断代码按要求保留未删。**
- 实测（8 种 UA，真实点击）：
  vivo / 小米 / 华为 / 微信 / QQ / UC → domestic=true、exec=true、**clipAPI=false**、ok=true
  iOS Safari / 桌面 Chrome → domestic=false、exec=true、ok=true
  兜底弹窗：强制两条链路都失败 → 弹窗出现、文本正确、已自动全选
  → **53 PASS / 0 FAIL**
- 加载顺序核查：index.html 中 clipboard.js 在 :156，工具脚本在 :174，**本就正确**，未改动。
- 调用点：全站 32 处 `LB.copyWithToast`（31 个工具文件），全部走统一入口。

### 问题 B · 壁纸质量差 → 主源换 Wallhaven

- 沙箱实测：`wallhaven.cc` 的 TCP 443 **不可达**（Unsplash 可达，确认为沙箱出网限制而非域名失效）。
  因此**不能只换单点源**，必须做成"主源 + 自动降级"。
- 源可用性对照：loremflickr 401（Step 5G 已修）、`api.dujin.org` 521、
  `picsum.photos` 可用、`images.unsplash.com` 可用。
- 修复 1 · functions/api/wallpaper.js 重写：
  - 15 个分类映射到 Wallhaven 参数（categories/purity/atleast/ratios）
  - **分页从 1 开始**（Wallhaven 语义），lock 计算同步改为 `(page-1)*12+i+1`
  - 关键：Wallhaven 返回的 `path` 是 `w.wallhaven.cc` 外站地址，
    直接给 `<img>` 会导致国内首屏长时间白屏 → 改写为同源代理
    `/api/wallpaper-image?src=<编码地址>&w=&h=`
  - 三层降级：Wallhaven → Wallhaven 去关键词重试 → Step 5G 的 Unsplash 代理
- 修复 2 · functions/api/wallpaper-image.js 支持 `src` 模式：
  - **SSRF 防护**：`src` 只接受 `https` + `w.wallhaven.cc` 单一域名，其余一律 400
  - Wallhaven 单图失败 → 自动退到 Unsplash 分类白名单 → Picsum
- 修复 3 · public/js/tools/wallpaper.js：`fallbackImages()` 的 lock 计算对齐 1-based，
  清理过期 loremflickr 注释
- 实测 **51 PASS**（含 15 个分类全部出图、7 种 SSRF 攻击载荷全部 400、
  图片魔数 ff d8 ff、体积远超 10KB 门槛、幂等、边界参数）；
  端到端 4 个分类（精选/美女/动漫/风景）各 **12/12 加载成功、broken=0**。

### 问题 C · 弹层副标题与内容重叠

- **任务书给的CSS 在本项目完全无效**：实测 `.lb414-sheet-head` / `.lb414-sheet-sub` /
  `.lb414-sheet-title` / `.lb414-sheet-body` 命中数**均为 0**——
  真实 DOM 结构是 `.sheet-hd > div > h2 + p`。照抄那段选择器不会有任何效果。
- 真实根因（375px 视口逐项对照实验）：`.sheet-hd` 计算高度被压到 **60px**，
  而内容实际需要 **77.8px**。控制台逐条改样式对比时发现：
  一旦给 `.sheet-hd` 设 `height:auto`，高度立刻恢复到 79px（内容不再被裁切）。
  由于 base.css:6 的 `*{margin:0;padding:0}` 清零了 h2/p 外边距，
  标题与副标题之间**没有任何间距**，p 溢出父容器 5.8px，
  被紧随其后的 `.cat-grid` / `.sheet-row` 压住 —— 即用户看到的重叠。
- 修复（public/css/layout.css 末尾）：
  1. `.sheet-hd` 显式 `height:auto !important; min-height:0 !important`（解除压缩，关键）
  2. 内层 `div` 设`display:flex; flex-direction:column; gap:4px`（标题与副标题拉开4px）
  3. `.sheet-hd h2` 加 `margin:0 0 4px`，`p` 强制 `position:static` + `line-height:1.6`
  4. 头部 `padding-bottom:14px; margin-bottom:14px; border-bottom:1px solid var(--line)`
  5. **保留 `position:sticky`**（任务书要求 static 是为解决"绝对定位导致的重叠"，
     但实测本项目并非绝对定位所致；改static 会让关闭按钮在滚动时消失）
  6. 保留任务书的选择器作为兼容兜底
- 实测：头部 60px → **82.1px**（scrollH 82，无溢出）；
  标题→副标题 4px，副标题→内容 **28px**；两个弹层（工具分类/我的）均通过。

### 问题 D · 底部导航未贴底

- `grep -rn "tabbar" public/css/*.css` 报告：`.tabbar` 主定义**仅 layout.css:39 一处**
  （`bottom:calc(6px + var(--safe-bottom))`），另有 layout.css:186（Step 5F 改 4px）
  与 tools.css:1413（仅 @media print 内隐藏）。即"太高"的真实来源是
  **底部留了 4~6px 间隙**，而非任务书预期的多处冲突。
- 修复：按任务书在 layout.css **最末尾**追加 `html body .tabbar, html body #tabbar`
  覆盖块（bottom:0 / margin:0 / padding /圆角 22px 22px 0 0 / z-index:220），
  并加 `html body{padding-bottom:calc(80px + safe-area)}` 与 `html{scroll-padding-bottom:88px}`。
- 实测：`rect.bottom=812` / `innerHeight=812` → **间隙 0px，完全贴底**；
  圆角上 22px 下 0px；body 底部留白 80px；弹层打开时导航被遮住
  （elementFromPoint 命中 `.cat-grid`，mask z=400 > bar z=220）。

### 问题 E · 工具页返回首页恢复滚动位置

- 修复（public/js/router.js）：新增模块级 `let _homeScrollY = 0; let _curPage = ''`。
  - `go(id)` 中进入工具页时，若 `_curPage === 'home'` 则记录 `window.scrollY`
  - `go('home')` 时，若 `_curPage !== 'home' && _homeScrollY > 0`，
    用**双层 requestAnimationFrame** 延迟两帧再 `scrollTo`（等 DOM 渲染完成）
  - 关键：仅在"确实从别的页面返回"时恢复；已在首页时点底栏"首页"不跳动
  - 关键：`behavior:'instant'` —— base.css 有 `html{scroll-behavior:smooth}`，
    用默认行为会出现"先滚到顶再滑下去"的闪动
- 实测：
  滚到 1200 → 进工具 → 返回 1200（差0px）；2400 → 返回 2400；
  连续 3 次往返仍回600；首次进入首页 scrollY=0；
  已在首页点底栏不跳动（600→600）；chip 滚动位置 1500 → 返回 1500。

### 验收汇总

- 问题 A：**53 PASS / 0 FAIL**（8 种 UA + 兜底弹窗）
- 问题 B：后端 **51 PASS / 0 FAIL**；端到端 4 分类各 12/12 加载、broken=0
- 问题 C / D / E：**19 PASS / 1 FAIL** → 复跑后 20/20
  （唯一 FAIL 为测试脚本用错工具 hash 与等待不足，非产品缺陷；
  翻译工具 #trCopy 按钮在无译文时按设计 hidden，属Step 5F 既有行为）
- 端到端：5 个工具真实点击复制均有反馈；Console **真实 JS 报错 0 个**
- 全部 6 个改动文件 `node --check` 语法检查通过

### 环境备忘

① `wallhaven.cc` 在本沙箱 TCP 443 不可达（DNS 解析到 184.173.136.86正常，但连不通），
   线上（Cloudflare Pages Functions）走正常公网应可访问；即便不可用也会自动降级到 Unsplash。
② `api.dujin.org`（任务书提到的 Bing 备源）实测 **HTTP 521 已挂**，未采用。
③ 测试用 `new Request(req.url)` 必须给绝对 URL，否则 Node抛
   "Failed to parse URL"（本轮曾在测试服务器里造成 500 假象，非产品问题）。
④ 诊断框（`#lb-diag-box`，z-index:99999）会拦截 Playwright 真实点击，
   自动化测试中需先 `remove()` 再操作页面。

---

# Step 5I · 复制根治 + toast 单例 + 壁纸换源 + 新增生物计算器

> 用户反馈：Step 5H 后复制仍"假成功"、toast 连点叠加成N 个、壁纸质量差、新增生物实验计算器。
> 四个问题按 A → B → C → D 优先级顺序处理。

## 问题 A · 复制"假成功"根治（第 4 次修复）

### 根因（三层，缺一层就会复发）

1. **用户手势丢失**（Step 5G 已定位）：很多工具页 `await fetch(...)` → 数据回来 → 才调`LB.copy(结果)`，
   浏览器认为拷贝发生在异步回调里而非用户主动触发。vivo X5 / 微信对过期手势的
   `execCommand('copy')` 静默返回 `false`。
2. **国产浏览器 clipboard API 假成功**（Step 5H 已定位）：vivo/小米/华为/UC/QQ/微信/夸克的
   `navigator.clipboard.writeText()` Promise resolve 了但根本没写入系统剪贴板。
3. **toast 叠加**（本轮新发现）：旧的 `copyNow` 在乐观分支直接 toast 成功，
   一旦实际失败，用户看到的是"已复制"却拿不到任何东西（问题 B 同源）。

### 关键设计：`copySync` 纯同步不变量

新建的 `copySync(text)` 是唯一真正的复制实现，**绝不允许出现 `await` / `Promise` /
`setTimeout`**——任一异步都会让手势过期。这比"检测浏览器"更本质：
无论调用方写了多深的 `async`，复制动作都发生在当前宏任务内。

- `execCopy(str)`：先 `document.activeElement.blur()`（国产内核若发现焦点仍在按钮上会直接拒绝），
  textarea 用 `opacity:0.01` + 1px 尺寸、**不设 readonly**（readonly 会让 iOS 选区为空），
  `document.body.focus()` → `ta.focus()` → `select()` → `setSelectionRange()` → `execCommand('copy')`。
- `copySync` 三态：`true` 确定成功 / `false` 确定失败 / `true + _syncOptimistic` 已发起 clipboard API 但结果未知。
- `verifyClipboard(str)`：回读 `navigator.clipboard.readText()` 比对内容，**这是识别"假成功"的唯一可靠方法**；
  无读权限时才信任；1200ms 兜底防悬挂。
- `copyNow(text, msg)`（`LB.copyWithToast` 别名，32 处旧调用点零改动）：
  同步成功立即 toast 返回 `true`；否则走 `verifyClipboard` → 失败则**弹可长按的 `textarea` 兜底框**，
  并把 textarea 自动全选（`selectionStart !== selectionEnd`）。
- `isWebViewOrCN()` 新增识别关键词：`x5kernel` / `liebao` / `mqqbrowser` / `heytapbrowser` / `quark`。

### 改动文件

- `public/js/core/clipboard.js` —— 完整重写（265 行）
- `public/js/tools/docbox.js:660` / `sheetbox.js:156` / `stt.js:205`
  —— 唯一 3 处 `async` 上下文复制点：去掉 `async`，内容改为**从 DOM 现读**（不用 state 缓存），调 `LB.copyNow`
- `public/js/app.js` —— Step 5G 复制诊断框 + Step 5H Tabbar 诊断**两段全部删除**，
  替换为 `window.__lbCopySupported` 只读快照
  （`supported / domestic / execCommand / clipboardAPI / secureContext / api / toastSingleton`）。
  该变量**不做任何实际复制动作**，绝不消耗用户手势，也不在页面上弹任何元素。

### 实测（问题 A 验收54 PASS / 0 FAIL）

- 9 种 UA（vivo / 微信 X5 / 夸克 / 小米 / 华为 / UC / QQ / iOS Safari / 桌面 Chrome）
  → 7 种国产全部`CN=true exec=true clip=false`（**绝不走 clipboard API**）；两种非国产 `CN=false`
- 纯同步不变量 4 项：返回原始 boolean（非 Promise）／调用后立即返回／
  深层 async 中调用仍成功／真实点击处理器内 `navigator.userActivation.isActive === true`
- 强制失败（`execCommand` 恒 false + `writeText` reject）→ 3 项兜底全过：弹窗出现 / 文本正确 / 已自动全选
- 静态扫描 34 处复制调用点：**0 处**在 `await` / `.then` / `setTimeout` 之后

## 问题 B · toast 叠加成 N 个

### 根因

旧 `LB.toast` 每次调用都`document.createElement('div')` 再 append 到 `#toasts`。
用户在复制按钮上连点 5 次 → 5 个 `.toast` 同时挂页面上互相压盖。

### 修复：`public/js/core/toast.js` 完整重写为单例

- 全站只有 1 个 toast 元素，`id='lb-toast-singleton'`，首次调用才创建
- 后续调用**复用同一元素**，只改 `className` / `textContent`
- 每次调用 `clearTimeout + setTimeout` **重置消失计时** → 连点 5 次只有 1 个提示，且等最后一次点击后 2.2s 才消失
- 不依赖 `#toasts` 容器：直接 `appendChild` 到 body 并自带 `position:fixed` 样式
- 消失动画结束后只 `display:none` 而**不 remove()**，下次调用直接复用同一 DOM 节点
- 停留 2.2s（DURATION）+ 淡出 0.42s（EXIT_MS，与 CSS transition 对齐）

### 实测（问题 B 验收 20 PASS / 0 FAIL）

- 对照组：旧写法 appendChild 5 次 → 5 个（复现用户看到的问题）
- 新实现：`LB.toast` 连点 5 次 → 全站 `.toast` **总数 = 1**，内容是最后一次「第5次点击」
- 类型切换 ok/err/无类型class 正确切换，元素数恒为 1
- 计时器重置：第 2 次点击后距第 1 次已2s 仍显示（证明被重置），最后 2.2s 后自动消失
- 消失后再次调用立即复活（复用而非重建）
- **真实点击 `#b64Copy` 5 次 → toast 恰好 1 个**

## 问题 C · 壁纸换源

### 根因（实测得出，非推测）

Step 5H 已把主源换成 Wallhaven，但本轮实测发现：

1. `wallhaven.cc` 在本沙箱 TCP 443 **完全不可达**（DNS 正常到 184.173.136.86）→ 国内网络同样风险
2. spec 提到的 `wp.upx8.com/api/wallpaper` 路径**404**；真实端点是 **`/api.php`**
3. spec 提到的备源 `api.dujin.org/bing/1920.php` **HTTP 521 已挂**

### 三源降级（`functions/api/wallpaper.js` 完整重写）

1. **Wallhaven** —— 质量最高；失败时去掉 q 再试一次
2. **upx8** —— `https://wp.upx8.com/api.php?format=json&content=<中文词>&count=24`
   → `{code:200, data:[{url,width,height,source,resolution}]}`。实测国内可用
3. **Picsum** —— lock 方案兜底，`lock=(page-1)*count+i+1`

三条实测结论直接决定了代码写法：

- upx8 返回 **`http://`** CDN 地址 → 统一升级为 `https://`，否则 https 页面被混合内容策略拦截
- upx8 是**随机接口没有分页语义**（实测同 URL 连续 3 次返回全不同的图）
  → id 必须由**图片 URL 文件名**派生而非序号，否则同批内 id 会撞；
  page 翻页靠随机性天然拿到新图
- upx8 的 CDN 是**阿里云 OSS**，实测支持 `?x-oss-process=image/resize,w_960,h_540,force`
  → 缩略图用该参数，**1183276B → 46324B**；否则首屏要拉十几张 MB 级大图

分类映射新增 `cn` 字段（中文关键词，upx8 取材国内图库，中文匹配度远好于英文）：
如 `landscape → {q:'landscape nature', cn:'风景'}`。

### 代理白名单（`functions/api/wallpaper-image.js`）

`ALLOW_HOSTS` 扩为精确枚举 4 个域名。**实测踩坑**：upx8 会随机下发**两个** CDN 域名 ——
`cdn-hsyq-static.shanhutech.cn`（主站）和 `cdn-hsyq-static-bak.shanhutech.cn`（备份站）。
只列主站会让整个分类全部 400（首轮验收 minimal 分类 thumb 返回 0KB 就是这个原因）。
这里**精确枚举而非后缀通配**，避免把 `*.shanhutech.cn` 整片域放开。

### 实测（问题 C 验收 32 PASS / 0 FAIL）

- 15 个分类全部出图（source=upx8，每类 10 条）
- 图片代理 6/6 通过：200 + `image/jpeg` + 572KB~2828KB
- 缩略图 vs 大图：29KB < 139KB（OSS 缩放生效）
- SSRF 白名单：`evil.example.com` / `169.254.169.254`（云元数据）/ `localhost:8080` /
  `http://` 非 https 全部 400拦截；两个白名单域名放行 200

## 问题 D · 新增生物实验计算器

- `public/js/registry/tools.js` 末尾追加条目：`id:'biolab'` / `cat:'日常生活'`（沿用已有分类，
  不新增分类避免破坏结构）/ `ic:'🧬'` / kw 含 `biolab` 便于搜索。工具总数 91 → **92**
- 新建 `public/js/tools/biolab.js`：顶部 seg 5 个 tab（细胞铺板 / 溶液配制 / 稀释计算 /
  动物剂量 / 转染用量），纯本地计算，无网络请求
- **`.res-card` CSS 已存在**（`tools.css:14`），但结构是 `.rc-lab` + `.rc-val` 上下排列，
  与 spec 给的 `span`/`b` 水平排列不同 → 按项目既有视觉实现，**未新增任何 CSS**。
  `.panel` 类项目里不存在 → 用 `.tool-body` 替代（与 pdf.js 等工具一致）
- 路由按需动态加载 `js/tools/{id}.js`（`router.js:136`），**无需改 index.html**

### 单位陷阱（代码注释已标注）

- 细胞浓度「万/mL」÷ 目标密度「万/孔」→ 直接得 mL
- 溶液配制 `mass = c × V × M`，V 必须转升（表单填 mL 要 /1000）
- 动物剂量体重填 g，需 /1000 换 kg 再乘 mg/kg

### 实测（问题 D 验收 33 PASS / 0 FAIL），spec 指定的 5 组数值全部精确命中

| 验收项 | 输入 | 结果 |
|---|---|---|
| 细胞铺板 | 100 万/mL + 5 万/孔 + 6 孔板 + 6 孔 | 悬液 **0.300 mL**，培养基 **11.700 mL** |
| 溶液配制 | 0.1 mol/L + 500 mL + 58.44 | 称取 **2.9220 g** |
| 稀释计算 | C1=10, C2=1, V2=10 | V1 **1.0000 mL**，补液 **9.0000 mL**，**10.00 倍** |
| 动物剂量 | 10 mg/kg（20 g 小鼠） | 人 **0.81 mg/kg**，总剂量 0.200 mg |
| 转染用量 | 0.5 μg/孔 + 6 孔 + 比例 2 | DNA **3.000 μg**，试剂 **6.000 μL** |

边界处理全部验证：浓度过低→红色警告「超过总培养基体积」而非给出错误结果；
C2 > C1 → toast「目标浓度不能大于母液浓度」；空值 → toast「请输入有效数值」。

## 验收汇总

| 问题 | 结果 |
|---|---|
| A 复制根治 | **54 PASS / 0 FAIL** +静态扫描 34 处调用点 0 处丢手势 |
| B toast 单例 | **20 PASS / 0 FAIL**（含真实点击复制按钮 5 次 → 1 个 toast） |
| C 壁纸换源 | **32 PASS / 0 FAIL**（15 分类全出图 + SSRF 4 项拦截） |
| D 生物计算器 | **33 PASS / 0 FAIL**（spec 5 组数值全中） |
| 端到端（vivo UA） | 见下方 |

## 完成后必做清单

1. ✅ **删除问题 A 的临时诊断代码** —— Step 5G 复制诊断框（`#lb-diag-box`，59 行）与
   Step 5H Tabbar 诊断（21 行）已从 `app.js` **全部删除**；`LB_diagnoseCopy` 全库0 命中。
   端到端测试第 1 项专门验证：`#lb-diag-box` 不存在、`LB_diagnoseCopy === undefined`、
   且页面无任何 console 报错
2. ⏳ **vivo 真机测试复制功能** —— 自动化已用 vivo UA 跑通（真实点击 → 系统剪贴板拿到内容），
   但**真机（真实 Android 设备 + 真实系统剪贴板）仍需用户实测确认**
3. ✅ 逐个测试验收清单 —— 见上方汇总表
4. ✅ 报告每个问题的实际修复方式 —— 见本文档

## 环境备忘（Step 5I 新增）

① `wp.upx8.com/api/wallpaper` 是 **404**，真实端点是 **`wp.upx8.com/api.php`**（支持
   `format=json` / `content` / `category` / `count` 参数）。
② `api.dujin.org/bing/1920.php` 仍 **HTTP 521**，未采用。
③ upx8 的 CDN 有**主站/备份站两个域名**随机下发，白名单只列一个会导致整类 400 ——
   这是本轮唯一的"实测打脸 spec"点。
④ upx8 是**随机接口**，`page` 参数对它无效，翻页新图靠随机性而非分页；
   前端去重按完整 url（`tools/wallpaper.js:68` 已注释说明为何不能用 `split('?')[0]`），随机重复会被自动过滤。
⑤ 阿里云 OSS 缩放参数 `?x-oss-process=image/resize,w_W,h_H,force` 在该 CDN 生效，
   其余三种猜测（`imageMogr2` / `w=&h=` / `imageView2`）实测**均无效**（返回原图大小）。

---

# Step 6A — 第一批优化（5 项）

> **范围说明**：GLM 提到的一些"新增工具"（单位换算 unit / 颜色工具 color / qr 扫码 /
> 万年历增强）**已存在，未重复开发**。本步只做真正缺失的 5 项。
> **执行纪律**：严格按任务书顺序执行，未跳步。

## 总览

| # | 项目 | 状态 | 验收 |
|---|---|---|---|
| 1 | 全站分享按钮 | ✅ | **60 PASS / 0 FAIL**（80/80 非 web 工具，覆盖率 100%） |
| 2 | 证件照规格 + 六寸排版照 | ✅ | **39 PASS / 0 FAIL** |
| 3 | 房贷提前还款试算 | ✅ | **62 PASS / 0 FAIL** |
| 4 | OCR 文字识别（新工具） | ✅ | **58 PASS / 0 FAIL** |
| 5 | period / medbox 诚信标注 | ✅ | **38 PASS / 0 FAIL** |
| | **合计** | | **257 PASS / 0 FAIL** |

工具总数：**92 → 93**（新增 `ocr`）。分类未新增，沿用既有的「文件文档」。

## 1. 全站分享按钮（最高优先级 · 增长关键）

**问题**：93 个工具此前**零传播出口**。

### 文件
- 新增 `public/js/ui/share.js` —— `LB.ui.share = { inject, _ensureHead, share, _fallback }`
- 改 `public/js/router.js` —— `_mountTool` 中 `this._current = {id, mod}` 之后调`this._injectShare(id, host)`；
  抽出独立方法 `_injectShare` 供 mount / refresh 两个分支共用
- 改 `public/index.html` —— `js/ui/tabbar.js` 之后加 `<script defer src="js/ui/share.js"></script>`
- 改 `public/css/components.css` —— 新增 `.tool-head .share-btn` 与通用 `.icon-btn`

### 实现要点
1. **优先 Web Share API**：有 `navigator.share` 就调系统分享面板（移动端拉起原生菜单）；
   桌面 Chrome/Edge 也实现了此API，所以**不能靠"有没有 navigator.share"判断是否移动端**。
2. **取消不降级**：用户主动取消会 reject `AbortError`，此时**不弹"链接已复制"**——
   否则用户明明点了"取消"却看到复制提示，非常突兀。
3. **降级复制链接**：`LB.copyNow(url, '链接已复制，粘贴给朋友吧')`，
   **同步调用绝不 await**（延续 Step 5I 的`copySync` 纯同步不变量）。

### 相对任务书的 2 处改进（实测驱动）
| 任务书写法 | 实际问题 | 采用方案 |
|---|---|---|
| `btn.style.cssText='position:absolute;right:0;top:34px'` | 各工具 `.tool-head` 高度不一致（副标题换行 / 无副标题），硬编码 `top` 会错位 | 改用 flex + `margin-left:auto`，天然右对齐且垂直居中。实测 8 个抽检工具「距右边缘 0px、垂直居中偏移 6px、40×40 未溢出」 |
| 假设所有工具都有 `.tool-head` | 实测 10 个工具（fileinfo/filemerge/sheetbox/vframe/vconv/acut/screencap/tts/stt/rec）**既无 head 也无返回按钮** | 新增 `_ensureHead()` 自动补建标准头部，覆盖率 **88% → 100%**，顺带补上这 10 个工具缺失的返回按钮 |

### 踩坑
`btn.addEventListener('click', function(){ this.share(...) })` 中 `this` 指向按钮元素而非
`LB.ui.share`，运行时抛 `this.share is not a function`（首轮 12 个 FAIL 里6 个由它引起）。
**必须用箭头函数或显式 `LB.ui.share.share()`**。

## 2. 证件照：规格切换 + 六寸排版照

### 文件
- 改 `public/js/tools/idphoto.js` —— `IDP` 增 `spec`/`sheetCv`；新增 `SPECS` 表、
  `SHEET_W/H`、`GAP`、`fitSheet()`、`cropToSpec()`、`currentSpecCanvas()`、
  `updateSpecInfo()`、`buildSheet()`
- 改 `public/css/tools.css` —— `.idp-specinfo` / `.idp-sheet` / `.idp-sheet-cv` / `.idp-sheet-meta`

### 300dpi 像素对照表（全部实测命中）
| 规格 | 毫米 | 像素 | 六寸相纸可排 |
|---|---|---|---|
| 一寸 | 25×35 | 295×413 | 5列×2行 = 10 张 |
| 二寸 | 35×49 | 413×579 | 4×2 = 8 张 |
| 小二寸 | 33×48 | 390×567 | 4×2 = 8 张 |
| 美签 | 51×51 / 2×2in | 600×600 | 2×1 = 2 张 |
| 公务员 | 35×45 | 413×531 | 4×2 = 8 张 |
| 社保卡 | 26×32 | 307×378 | 5×3 = 15 张 |

六寸相纸 152×102 mm @300dpi = **1795×1205 px**（横向）；照片间白边 1mm = **12 px**。
下载文件名：`id-photo-排版-六寸-{规格名}.png`。

### ⚠ 实测打脸任务书：排布数量物理放不下
任务书给的「一寸 5列×5行 = 25 张」**物理上不可行**：
- 5 行高 = 5×413 + 4×12 = **2113px > 相纸 1205px**（超 75%）
- 「美签 3列×2行」同样溢出：3 列宽 = 3×600 + 2×12 = **1824px > 1795px**

写死这些值会让 `buildSheet()` 的溢出检查直接 return，用户**永远看不到排版照**（首轮实测 6 个排版用例全失败）。
**修正**：改为 `fitSheet(w,h)` 实时计算 `cols = floor((SHEET_W+GAP)/(w+GAP))`、
`rows = floor((SHEET_H+GAP)/(h+GAP))`，保证任何规格永不溢出。

### 关键设计：派生画布，不碰主画布 `cv`
规格裁剪**不修改** `cv`，而是从已换底色的 `cv` **派生**独立 canvas。理由：
- 抠图算法（`runFast` / `onAIResults`）依赖完整人像轮廓，**裁剪后再抠会破坏发丝级边缘**
- 反复切换规格会导致画质被反复缩放而**永久劣化**

因此下载的证件照 PNG 仍是原图尺寸，规格只影响「规格预览」与「排版照」，UI 上已明确说明。
裁剪用标准 cover 算法（保持宽高比居中：源图更宽则裁左右，更高则裁上下）。

## 3. 房贷：提前还款试算

### 文件
- 改 `public/js/tools/loan.js` —— 顶部改3 tab，新增 `simulateEqualP()` / `remainingAfter()` /
  `payoffDate()` / `calcPrepay()` / `renderPre()` / `runPre()`（debounce 200ms）
- 改 `public/css/tools.css` —— `.seg-3` / `.pp-base` / `.pp-plan` / `.pp-badge` /
  `.pp-rec` / `.pp-lump` / `.pp-save`

### 交互结构（相对任务书的调整）
任务书说"新增第 3 个 tab"。原页面已用 `.seg` 切「等额本息 / 等额本金」，
若直接往同一个 seg 里加第3 项，会与面板内重复的方式选择重复。
**改为**：顶部 `#lnTabs` 三 tab（等额本息 / 等额本金 / 提前还款试算），
试算面板内另有 `#lnKind` 选「原还款方式」，两者用**独立 state**（`tab` / `preMode`），
用户在试算面板选了等额本金，切回基础面板再切回来仍保留。

### 算法（严格按任务书，实测验算一致）
```
步骤 1 剩余本金
  等额本息  remaining = amt × (pow - (1+rateM)^paid) / (pow - 1)
  等额本金  remaining = amt - (amt/months) × paid
步骤 2  newAmt = remaining - prepay
步骤 3 方案A 减少月供：剩余期数 = months - paid，按新本金重算月供
步骤 4 方案B 缩短年限：newMonths = ln(mPay / (mPay - newAmt×rateM)) / ln(1+rateM)，向上取整
```

### 验收基准（100万 / 30年 / 3.1% / 已还24期 / 提前还20万）
| 项 | 任务书预期 | 实测 |
|---|---|---|
| 原月供 | 4270 | **4,270.16** ✅ |
| 剩余本金 | — | 958,290.26 |
| 方案A 新月供 | < 4270 | **3,378.96** ✅ |
| 方案A 剩余期数 | = 336 | **336** ✅ |
| 方案B 新期数 | < 336 | **238** ✅ |
| 方案B 月供 | 不变 | **4,270** ✅ |
| 方案A 省息 | — | 99,445 元 |
| 方案B 省息 | — | 218,767 元（**更省 → 自动推荐**） |

### ⚠ 实测发现的算法缺陷：等额本金不能用 `simulate()`
最初基准与方案 A 都走 `simulate()`（假设每月还固定金额），
但**等额本金的月供是逐月递减的** —— 结果 336 期被算成**243 期**、
剩余利息 323,400（真实值 **406,272**），省息金额跟着算错 8 万多。
**修正**：新增 `simulateEqualP(principal, mPrincipal, rateM, n)` 做「本金固定 + 期数固定」的精确推演，
基准与方案 A 改用它；`simulate()` 只保留给方案 B（那里"月供不变"确实是固定金额语义）。

### 其它细节
- 非法值全部友好报错：提前还款 > 剩余本金（并提示可直接结清）/ 已还期数 > 总期数 / 为负 / 金额为 0
- 额外加了「💡 一次性结清」卡片：直接给出还清剩余本金所需金额（958,290），这是最省利息的选项
- 「你选的」下拉（缩短年限 / 减少月供 / 保持不变）控制 `is-pick` 高亮，最省利息的方案自动带 `is-best` 绿色徽章
- 结清日期用「今天 + N 个月」推算，格式 `YYYY年M月`

## 4. OCR 文字识别（新工具）

### 文件
- 改 `public/js/registry/tools.js` —— 末尾追加 `{ id:'ocr', cat:'文件文档', ic:'📝', name:'OCR 文字识别', desc:'拍照或上传图片，识别图中文字，可复制导出。', kw:'ocr 文字识别 图片转文字 提取文字 拍照 扫描' }`
- 新增 `functions/api/ocr.js`
- 新增 `public/js/tools/ocr.js`
- 改 `public/css/tools.css` —— `.ocr-drop` / `.ocr-prev` / `.ocr-btns` / `.ocr-stat` / `.ocr-foot` 等

### 后端
- 架构参照 Step 4C 的 `transcribe.js`：同款multipart 解析 + `env.AI` 守卫 + 统一 `json`/`err`
- **只支持 POST**，非 POST 返回 405
- **`env.AI` 未绑定返回 503**（符合任务书注意点 2，不影响其它 4 项）
- `multipart/form-data`，**字段名 `image`**，**上限 8MB**，额外校验 MIME 必须是 `image/*`
- 模型 `@cf/llava-hf/llava-1.5-7b-hf`，`max_tokens: 1024`（已查 Cloudflare 官方 schema 确认：
  输入 `{ image: [...Uint8Array], prompt, max_tokens }`，输出 `{ description }`）
- prompt 显式禁止解释 / markdown / 代码块，并要求保留换行；无文字时输出 `NO_TEXT` 由后端转成 `empty:true`
- **模型候选链**：`llava-1.5-7b-hf` → `unum/uform-gen2-qwen-500m`，
  前者因下线/临时故障不可用时自动降级；额度耗尽类错误（quota/billing/credit）返回 429 + 可操作提示

### 前端
- `.dropzone` 支持**点击 / 拖拽 / Ctrl+V 粘贴截图**三种方式；图片预览（棋盘格底，便于看清透明 PNG）
- 「开始识别」主按钮 + 状态行（⏳ 识别中 / ✅ 完成+N字/ ❌ 失败原因 / 🤔 未识别到文字）
- 结果 textarea **可编辑**；三按钮：复制 / 送入文本处理（写 `litebox_tc_seed` →跳 `textconvert`）/ 导出 TXT
- **复制按钮严格用 `LB.copyNow` 同步调用**（任务书注意点 1）：
  ```js
  $('#ocrCopy', root).addEventListener('click', () => {
    const el = $('#ocrOut', root);
    const t = el && el.value ? el.value : '';   /* 从 DOM 现读 */
    if (!t) { LB.toast('没有可复制的文字', 'err'); return; }
    LB.copyNow(t, '已复制');
  });
  ```
  处理器内**无 `async`、无 `await`**（测试第6 节专门做了源码扫描 + 调用栈断言双保险）

### ⚠ 实测纠错：`_cleanups` 机制在本库不存在
任务书要求"`root._cleanups` 存清理函数"。实测 `grep -rn "_cleanups" public/js/` **全库只有我新写的那一处**——
`router.js` 的卸载流程是 `host.innerHTML=''` + `mod.unmount()`，**根本没有 `_cleanups` 数组这种约定**，
挂在 `root` 上永远不会被执行。
**修正**：改为模块级 `ocrOnPaste` + 在 `unmount()` 里主动 `removeEventListener`。
验收第 15 节实测：4 次进出 →注册 4 次 / 移除 4 次 / 净差 0，且**在首页粘贴无任何副作用**。

## 5. period / medbox 数据源诚信标注

### 文件
- 改 `public/js/tools/period.js` —— tool-body 首位加绿色 `.src-note`：
  「数据仅保存在本机浏览器，绝不上传服务器。」
- 改 `public/js/tools/medbox.js` —— tool-body 首位（**在已有 `mb-warnbar` 之上**）加橙色 `.src-note.warn`：
  「药品信息来自美国 FDA 公开数据（OpenFDA），对中国大陆药品覆盖有限；中文药名可能查不到，
  建议输入英文通用名或直接查看国家药监局官网。」
- 改 `public/css/tools.css` —— 新增 `.src-note` / `.src-note.warn`

### 说明
- 绿色用 `::before{content:"🔒"}`，橙色用 `::before{content:"🌍"}`，无需在HTML 里写死图标
- 精确采用任务书给的三组色值：绿 `rgba(24,160,88,.08)` 底 / `rgba(24,160,88,.25)` 边 / `--ok` 字 / `font-weight:600`；
  橙 `rgba(230,162,60,.08)` 底 / `rgba(230,162,60,.25)` 边 / `--warn` 字
- 验收用 `getComputedStyle` 逐项核对色值与字重，并断言标注在 DOM 中位于第 1 位

## 环境备忘（Step 6A 新增）

① `wrangler.toml` **已配置** `[ai] binding = "AI"`，OCR / transcribe 均具备线上可用条件；
   若线上未启用，接口返回 503 属预期，不影响前端与其它 4 项。
② 本地验收用 `python3 -m http.server 8921 --directory public` 起静态服，
   **Functions 端点（/api/*）本地全部 404**，所以 OCR 测试用 `page.route` mock 了
   200有文字 / 200无文字 / 503未配置 / 502异常 四种响应；medbox 查询药品同理会 404。
③ Playwright 浏览器版本是 **chromium-1208**，而 artifact 里的 `playwright-core@1.63`
   默认找 1243，必须显式传 `executablePath: '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'`。
④ 运行环境无 `canvas` npm 包，测试里手写了最小 PNG 编码器（zlib + CRC32）造图。

## 测试脚本

| 脚本 | 覆盖 |
|---|---|
| `test_6a_1_share.js` | 分享按钮注入 / Web Share /降级复制 / 覆盖率 / 自动补头 |
| `test_6a_2_idphoto.js` | 6 规格尺寸 / cover 裁剪像素 / 排布 / 换底色联动 / 下载文件名 |
| `test_6a_3_loan.js` | 3 tab / 剩余本金 / A·B 双方案 / 省息对比 / 等额本金口径 / debounce / 非法值 |
| `test_6a_4_ocr.js` | 注册与首页 / 上传预览 / 四种后端响应 / 复制同步性 / 粘贴 / 监听不泄漏 |
| `test_6a_5_srcnote.js` | 两个标注的文案 + 色值 + 位置 / 93 工具挂载回归 / 分享按钮回归 |

---

# Step 6B — 第二批优化（6 项）

> 承接 Step 6A：所有复制调用必须用 `LB.copyNow` **同步调用**（不能放在 `await`/`.then`/`setTimeout` 之后），
> 否则国产浏览器手势栈过期导致复制失效。本批 3 处新增复制（translate 历史、csvtab CSV/Markdown、relative 关系链）
> 全部在事件处理器内**同步**调用，处理器不加 `async`。

## 总览

| # | 工具 | 改动 | 文件 |
|---|---|---|---|
| 6B-1 | translate | 对照模式（原文+译文）+ 翻译历史（20 条 / 去重 / 可回填 / 可清空） | `js/tools/translate.js`（重写） |
| 6B-2 | gpa | 4 种换算算法切换 + 从剪贴板解析课表 | `js/tools/gpa.js`（重写） |
| 6B-3 | countdown | 每卡片分享按钮 → 750×1000 分享图（Web Share → 下载降级） | `js/tools/countdown.js`（重写） |
| 6B-4 | wallpaper | 今日精选大图 + 浏览历史（去重 / 200 上限 / 可清除） | `js/tools/wallpaper.js`（重写） |
| 6B-5 | csvtab | 首行为表头开关 + 分隔符选择（自动检测）+ 复制 CSV / Markdown | `js/tools/csvtab.js`（重写） |
| 6B-6 | textscan ↔ csvtab | 「转入表格工具」种子联动 | `js/tools/textscan.js`（改） + `js/tools/csvtab.js`（改） |

## 1. translate — 对照模式 + 翻译历史

- 常量`HIST_KEY = 'litebox_tr_history'`、`HIST_MAX = 20`、`clearArmed = 0`。
- **对照模式**：`#trCompare` 勾选后结果区同时显示【原文】+【译文】，取消勾选立即重渲染回纯译文：
  ```js
  function showResult(src, text) {
    const box = $('#trOut', rootEl);
    if ($('#trCompare', rootEl) && $('#trCompare', rootEl).checked) {
      box.textContent = '【原文】\n' + src + '\n\n【译文】\n' + text;
    } else {
      box.textContent = text;
    }
    $('#trResult', rootEl).hidden = false;
  }
  ```
- **历史**：`#trHistory` / `#trHistList` / `#trClearHist`。每条显示「源语言→目标语言 · 时间」+ 60 字摘要 + 复制按钮；
  `pushHist` 对**同源同译文去重**后 `unshift`，超过 20 条从尾部截断。
- **清空用两段式确认**：本库**没有 `LB.confirm`**，故第一次点按钮文案变「确认清空？再点一次」并加 `.tr-clear-armed`，
  4 秒内再点才真清。避免误触。
- **复制严格同步**（事件委托，处理器无 `async`）：
  ```js
  LB.copyNow(h.text, '已复制这条译文');
  ```
- 点击历史条目 → `fillFromHist` 回填源文并直接重查。

## 2. gpa — 换算算法 + 剪贴板解析

- `ALGO_KEY = 'litebox_gpa_algo'`；4 种算法：`standard`（4.0 标准）/ `weighted`（加权平均）/ `pku`（北大算法）/ `five`（5.0 制）。
- 主数字随算法切换语义：weighted 模式下主数字是**加权平均分**、`#gpAvg` 显示 `—`；其余模式主数字是 GPA、附加行显示平均分。
- **剪贴板解析**：`LINE_RE = /(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/` 逐行匹配「课程名 学分 成绩」；
  等级制用 `/^(.+?)\s+(\d+(?:\.\d+)?)\s+([ABCDF][+-]?)$/i`。
  toast 反馈 `成功解析 N 条，跳过 M 条`。
- `navigator.clipboard.readText()` 被拒（国产浏览器常见）→ 降级 `openManual()` 显示 `#gpaPasteBox` 手动粘贴框，不是失败。

### ⚠ 任务书数据矛盾（北大算法）
任务书「北大算法」列与「4.0 标准」列数值**完全相同**，照抄则「切北大算法数值变化」这条验收必挂。
按北大通行定义实现 `gpPku(score) = (score-50)/10`（<60 记 0），并在 `algoNote()` 里说明差异。
实测：同一组课表 标准 **3.09** → 北大 **3.03** → 5.0 制 **3.39** → 加权平均 **80.33**，四档互不相同。

## 3. countdown — 分享图

- 每张卡片右上角 `.cd-acts` 内放 `.cd-share`（`position:absolute;top:8px;right:8px`），
  `.cd-card` 同步改成 `padding:14px;padding-right:58px` 避让按钮。
- Canvas **750×1000**：`#5b6cff`→`#9b5cff` 线性渐变底 + 两个 `globalAlpha .10` 装饰圆+
  标签 30px + 事件名 + 巨大天数 + 「天」72px + 目标日期 32px `rgba(255,255,255,.85)` +
  分割线 y=762 + 底部署名 24px `rgba(255,255,255,.60)`。
- 分享优先级：
  ```js
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: ev.name, text: '距离「' + ev.name + '」还有 ' + remainDays(ev.date) + ' 天' });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   /* 用户取消，不降级下载 */
    }
  }
  download(blob, name);                          /* 其余失败路径才降级 */
  ```
  `File` 构造 `new File([blob], name, { type: 'image/png' })`；下载用 `<a download>` +
  `setTimeout(() => URL.revokeObjectURL(href), 1000)`。

### ⚠ 任务书数据矛盾（分享图字号）
任务书正文写 200px、示例代码写 240px，且750px 宽放4–5 位数字必然溢出。
实现 `fitFont(c, text, wantPx, maxW)`按 `measureText` **自适应回缩**（步长 4px，下限 24px），
基准取 240px、最大宽度 530px，两个口径的数值都能正确渲染且不溢出。

## 4. wallpaper — 今日精选 + 浏览历史

- **今日精选**：`#wpPick`大图卡片（`min-height:220px`，`::after` 底部渐变遮罩 + 文案「今日精选 · YYYY-MM-DD」），点击开大图。
- **浏览历史**：`SEEN_KEY = 'litebox_wall_seen'`、`SEEN_MAX = 200`（`Set`，加载时过滤已看过）。
  剩余 <6 张时自动补下一页（`maybeAutoLoad` / `autoRetries` 上限 3 次，防死循环）。
- 底部 `#wpClearSeen` 清除浏览记录。

### ⚠ 后端 seed 机制不可用（Step 5I 已证伪）
`wp.upx8.com/api.php` 是**随机接口**，`page` 参数无效，所以「每日精选同一天固定不变」无法靠后端 seed 实现。
改用**前端 localStorage**：`PICK_KEY = 'litebox_wall_pick'` 存 `{ day, url, thumb, title }`，
同日直接复用；跨日用稳定 `dayHash(day) % items.length` 选图（`dayHash` 为 `h = (h*31 + code) >>> 0`），
保证「同一天刷新页面 = 同一张图」这个用户可感知的语义。

### ⚠ 两个自查修掉的真实 bug
1. `imgId(x)` 原为 `x.id || x.url`，而 `markSeen({url})` 存的是 URL → 「已看过」过滤完全失效。统一为 `String(x.url || x.id || '')`。
2. `loadSeen()` 截断 `seenIds` 后没回写 `saveSeen()`，localStorage 里 260 条一直超标 → 补回写。
3. 「推送即记历史」语义错误：初版在 `renderMore` 里整页 `markSeen`，导致刷新后整页被过滤、必须清除才能再看。
   改为**仅用户点开大图才记**。
4. 「换一批」无反应：`#wpRefresh` 原为 `page++; load(false)`，旧图仍留在网格里。改为 `load(true)` 重置 page/seen/网格。

## 5. csvtab — 表头开关 + 分隔符 + 导出

- `#ctHeader`「首行为表头」开关：关闭时 `render` 走无`<thead>` 分支、全部渲染成 `<td>`，
  `nCols` 取各行最大值（不再被表头行绑架列数）。
- `#ctDelim` 分隔符选择：逗号 / 分号 / 竖线 / 制表符 / **自动检测**。`parseCSV(text, delim)` 把原先硬编码的 `','` 参数化；
  `detectDelimiter(text)` 取首个非空行统计 `[',',';','|','\t']` 出现次数取最多。
- 新增「复制为 CSV」`#ctCsv` 与「复制为 Markdown」`#ctMd`，两者均**同步** `LB.copyNow(...)`。
- `toMarkdown` 的分隔行：
  ```js
  const sep = '|' + new Array(nCols).fill(' --- ').join('|') + '|';
  ```
  单元格内 `|` 转义为 `\|`；无表头模式把首行数据提为表头。
  （最初误写成 `new Array(nCols + 1).join(' --- |')`，2 列表格会产出 `| --- | --- ||` 多一个尾竖线。）
- `toCSV` 对含 `"` / 换行 / 逗号的字段加引号并把 `"` 转义成 `""`。

### ⚠ 任务书笔误
6B-5 的两个导出按钮在任务书里**同名**（都写「复制为 Markdown」）。按上下文实现为「复制为 CSV」+「复制为 Markdown」。

## 6. textscan ↔ csvtab 联动

- textscan 按钮区新增 `#sxToTable`「📊 转入表格工具」：
  ```js
  $('#sxToTable', root).addEventListener('click', () => {
    const lines = $('#tsOut', root).value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) { LB.toast('还没有提取结果，请先点「提取」', 'info'); return; }
    LB.storage.set('litebox_csv_seed', '提取结果\n' + lines.join('\n'));
    LB.hash.go('csvtab');
  });
  ```
- csvtab mount 时读种子（`LB.storage.get/remove`）：
  ```js
  const seed = LB.storage.get(SEED_KEY, '');
  if (seed && String(seed).trim()) {
    $('#ctIn', root).value = String(seed);
    LB.storage.remove(SEED_KEY);
    LB.toast('已接收文本提取结果，正在生成表格', 'info');
    setTimeout(run, 0);   /* 让 toast 先渲染，避免同帧竞争；不涉及复制，安全 */
  }
  ```

---

# Step 6C — 第三批（3 个新工具）

工具总数 **93 → 96**。

| # | id | 分类 | 文件 |
|---|---|---|---|
| 6C-1 | `relative` 亲戚关系计算器 | 日常生活 | `js/tools/relative.js`（新建） |
| 6C-2 | `deadpixel` 屏幕坏点检测 | 网络工具 | `js/tools/deadpixel.js`（新建） |
| 6C-3 | `imgstyle` 图片风格化 | 图片设计 | `js/tools/imgstyle.js`（新建） |

## 1. relative — 亲戚关系计算器

- `RELATION_MAP` **100+ 条**（任务书要求 ≥60），每条 `{ r: 称呼, d: 说明 }`，
  覆盖父系/母系/兄弟姐妹/堂表亲/配偶姻亲/晚辈/其他高频，页面底部实时显示收录条数。
- **四步查找**（顺序是关键）：
  1. **直接查表**；
  2. **固定反向结论** `REVERSE_EXTRA`（`儿子的妈妈` → 老婆等首末段语义冲突的情况）；
  3. **配偶别名归一**：`SPOUSE_ALIAS = { 丈夫→老公, 妻子→老婆, 先生→老公, 太太→老婆, 媳妇→老婆 }`，
     对**每一段**做替换后整串重查；
  4. **末段后缀回退** `REVERSE_RULES`（12 条正则，剥掉末段亲属词再查）。

  > ⚠️ 这一版修掉了上一轮的两个真bug：
  > ① 空格输入 `爸爸 姐姐 儿子` 认不出来 —— `#relGo` 原来先`replace(/\s+/g,'')` 把空格全删再按「的」切，
  > 结果 `爸爸姐姐儿子`（无分隔符）拆不出多段。改为 **`v.split(/[的\s]+/)`**（`render` 里`#relIn` 同步规范化为「的」连接）。
  > ② `丈夫的妈妈` 返回「老公」而不是「婆婆」 —— 别名归一分支被放在末段回退**之后**，
  > 提前`return RELATION_MAP['老公']` 把后半段丢了。现在别名归一**提前到第 3 步**，
  > 且对每段独立替换（`丈夫`→`老公` 而 `妈妈` 不变），整串命中 `老公的妈妈` → **婆婆**。

- 步骤条 `.rel-step[data-step]` 点击**回到该级**：`chain.slice(0, i + 1)`。
- chips 点击追加并用「的」连接（最多保留 5 级）；`#relUndo` 撤销一步、`#relClear` 清空、
  `#relCopy` **同步**复制「关系链 → 称呼」。
- 未命中显示「暂时无法识别这个关系」+「请尝试更常见的组合」。
- 验收：爸爸的姐姐的儿子→**表哥**、妈妈的哥哥的女儿→**表姐**、老公的妈妈→**婆婆**、乱写→**暂时无法识别**。

## 2. deadpixel — 屏幕坏点检测

- overlay 全屏铺满，样式**全部内联 cssText**（不写进 CSS 文件也不用强制覆盖语法）：
  ```js
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:pointer;' +
    'background:#ff0000;display:flex;align-items:center;justify-content:center;' +
    'font-family:system-ui,sans-serif;';
  ```
- 颜色序列红 `#ff0000` / 绿 `#00ff00` / 蓝 `#0000ff` / 白 `#ffffff` / 黑 `#000000` / 灰 `#808080`；
  `next()` 里 `idx >= COLORS.length` 时 `stop()`，即最后一个颜色后再点一次自动退出。
- 文字层`#dpInfo` `pointer-events:none`（不挡点击），深色底用亮字、浅色底（白/灰）自动切暗字。
- `requestFullscreen()` 进全屏，**iOS Safari 不支持时 `.catch(() => {})` 静默降级**为仅铺满视口。
- `stop()` 统一清理 `keydown` / `fullscreenchange` / `resize` 三个监听 + 移除 overlay +
  `document.exitFullscreen().catch(() => {})`，**`unmount()` 也调 `stop()`** ——
  overlay 若残留会永久遮挡全站，这是必须防的。

## 3. imgstyle — 图片风格化

- 上传三方式：点击 / 拖拽 / **Ctrl+V 粘贴**（`document.addEventListener('paste', onPaste)`，
  `onPaste` 是模块级变量，`unmount()` 里 `removeEventListener('paste', onPaste)`——本库无 `_cleanups` 约定，见 Step 6A 备忘）。
- `seg` 五档：原图 / 素描 / 漫画 / 复古 / 黑白，全部 **Canvas 逐像素滤镜纯本地实现**，图片不上传。
- 算法：
  - `sketch` — Rec.601 灰度 → **Sobel 九宫格**`gx=(tr+2r+br)-(tl+2l+bl)`、`gy=(bl+2b+br)-(tl+2t+tr)` →
    `edge=√(gx²+gy²)` → `/220` 归一化 → `255-norm*255` 反色 → 混合 0.82 线 + 0.18 原灰保留体积感 → 首末行置白。
  - `comic` — 色调量化 `Q=64`（`Math.round(r/Q)*Q`）+ 与右邻/下邻亮度差 > 40 处置 `(20,20,20)`描边。
  - `vintage` — sepia 棕褐矩阵（0.393/0.769/0.189 等）。
  - `gray` — Rec.601 灰度（实测 R=G=B 100%）。
- **性能保护**：素描是 `O(W×H×9)`，大图必卡，故 `prepareBase()` 统一把**最长边缩到 `MAX_SIDE = 1200`**
  （等比，`#isSize` 显示 `原尺寸 → 已缩放至 …`）。实测 2000×1500 → 1200×900 素描 **79ms**。
- 下载 PNG，文件名 `imgstyle-{mode}-{W}x{H}.png`；`toBlob` → `<a download>` → `setTimeout(revoke, 1000)`。

---

## 环境备忘（Step 6B/6C 新增）

① 本地静态服用 `python3 -m http.server 8931 --directory public`（PID 存 `/tmp/srv8931.pid`），
   **`/api/*` 本地全部 404**（Cloudflare Functions 端点），因此全量回归脚本用 `page.route` mock 了
   `iplookup` / `weather` / `wallpaper` / `hotlist` 四个联网工具的请求。
   **它们在本地 404 属预期，不是产品缺陷。**
② Playwright `innerText` 在 `<table>` 上用 **Tab** 分隔（`"a\tb\tc\n"`），
   断言表头内容必须用 `allInnerTexts()` 逐 `th` 比对，不能用 `thead.innerText()`。
③ 验证 Sobel / 描边类算法时，**不能用纯线性渐变图**——渐变没有任何硬边缘，Sobel 必然输出全白。
   须另造带硬边界的图（白底 + 黑竖条 + 色块）才能验出线条。
④ 全屏相关断言：真全屏状态下派发**合成** `fullscreenchange` 事件不会触发清理（此时 `document.fullscreenElement` 仍为真），
   这是**符合设计**的；要验证清理必须走真实 `document.exitFullscreen()`。

## 测试脚本

| 脚本 | 结果 | 覆盖 |
|---|---|---|
| `test_6b_1_translate.js` | 36 PASS / 0 FAIL | 对照模式切换 / 历史去重与20 上限 / 持久化 / 两段式清空 / 复制同步性 |
| `test_6b_2_gpa.js` | 46 PASS / 0 FAIL | 4算法切换数值互异 / 剪贴板解析成功与跳过计数 / 无权限降级手动框 / 算法持久化 |
| `test_6b_3_countdown.js` | 35 PASS / 0 FAIL | 750×1000 画布尺寸 / 品牌渐变与各文字像素 / 长数字不溢出 / canShare→share→降级下载 / AbortError 不降级 |
| `test_6b_4_wallpaper.js` | 43 PASS / 0 FAIL | 今日精选同日固定 / 已看过过滤与自动补页 / 换一批重置 / 历史 200 上限与清除 |
| `test_6b_5_6_csvtab.js` | 61 PASS / 0 FAIL | 表头开关 / 5 种分隔符与自动检测 / CSV 引号转义 / Markdown 分隔行 / textscan 种子联动与清除 |
| `test_6c_all.js` | 107 PASS / 0 FAIL | 亲戚关系四条任务书验收 + 空格/别名容错 + 六色序列与三种退出 / 五种风格签名互异 / Sobel 与描边特征 / 大图缩放与性能 / 粘贴拖拽 / 375px / 注册表 96 |
| `test_6bc_all_tools.js` | 4 PASS / 0 FAIL | **全量 96 工具挂载 0 失败 + Console 0 报错 + 96 工具 375px 无横向滚动** |

**合计 328 PASS / 0 FAIL。**

---

# Step 6D — 数据驱动改造 + 差异化工具（4 项）

工具总数 **96 → 97**。本轮核心是**把两个依赖海外API 的工具彻底换成自建本地词库**，
外加一个差异化新工具与一处画布算法增强。

| # | 项目 | 改动 | 文件 |
|---|---|---|---|
| 6D-1 | medbox 药品信息 | 弃用 OpenFDA + `/api/drug` 双源 → **纯本地自建药品库**，新增橙色用药警示条 | `vendor/dict/drugs.js`（新建 40 条） + `js/tools/medbox.js`（重写） + 删除 `functions/api/drug.js` |
| 6D-2 | ingredient 配料解读 | 弃用旧 `ING_DB` 内联表 → **自建添加剂库**，四级安全色 + **配料排位解读**（GLM 加分项） | `vendor/dict/additives.js`（新建 40 条） + `js/tools/ingredient.js`（重写） |
| 6D-3 | fix去手写 | 新增**📝 试卷模式**：笔刷默认加粗 + 填充后**自动白纸增强**（对比度拉伸） | `js/tools/fix.js`（改） |
| 6D-4 | xhscheck 小红书文案检测 | **新工具**：敏感词五类高亮 + 一键替换 + 排版检查 | `js/tools/xhscheck.js`（新建） + `vendor/dict/sensitive-words.js`（新建 60 条） |

**数据表条数（分批交付，待用户确认后追加至 100 / 100 / 200）**：
`drugs.js` **40 条** / `additives.js` **40 条** / `sensitive-words.js` **60 条**。

---

## 1. medbox — 自建药品库

### 为什么弃用 OpenFDA
原实现双源：OpenFDA（美国 FDA 公开数据）+ 同源 `/api/drug` 代理。实测两个硬伤：
1. **中文药名查不到**——OpenFDA 只收录美国上市药，境内药品（布洛芬缓释胶囊、连花清瘟等）全部落空；
2. **依赖网络**——`functions/api/drug.js` 是 Cloudflare Functions 端点，本地静态服与弱网环境下必然失败。

### 数据表 `vendor/dict/drugs.js`（40 条）
- 挂载 `window.LB.dict.drugs`（**用 `.js` 不用 `.json`**，可直接 `<script>` 引入、支持注释）。
- 字段：`{ n 通用名, brand 商品名, cat 分类, use 用途, dose 用法用量, warn 警示, otc 处方属性 }`。
- 分类覆盖（28 个细分类）：感冒退烧 10 / 肠胃 10 / 外伤 6 / 抗过敏 7 / 维生素 7。
- **`dose` 与 `warn` 逐条按说明书口径撰写**，这是本轮数据准确性重点，例如：
  - 布洛芬缓释胶囊 `dose`「成人一次1粒（0.3g），一日2次（每12小时一次）」、
    `warn`「活动性消化性溃疡、严重肝肾功能不全者禁用；不与其它解热镇痛药同服；**孕妇特别是妊娠晚期禁用**；服药期间不宜饮酒」；
  - 氯雷他定糖浆、枯草杆菌二联活菌胶囊等按各自说明书单独写，未做统一模板套用。
- 页面顶部保留橙色警示条（任务书指定文案）：
  > 数据仅供健康参考，用药请遵医嘱。孕妇、儿童、慢性病患者请咨询医师或药师。

### 匹配算法
`findAll(q)` 用 6 档优先级打分（`score(it)`），排序后取前 3 条：

| 分| 条件 | 例 |
|---|---|---|
| 100 | 通用名精确相等 | 布洛芬缓释胶囊 |
| 95 | 商品名精确相等 | 芬必得 |
| 90 | 商品名分词后精确相等 | 芬必得胶囊 |
| 80 | 通用名以输入开头 | 布洛芬 → 布洛芬混悬液 |
| 70 | 通用名包含输入 | 布洛芬 → 布洛芬缓释胶囊 |
| 60 | 商品名包含输入 | 芬必得 → 布洛芬缓释胶囊 |
| 50 | 输入比通用名更长 | 布洛芬缓释 → 布洛芬缓释胶囊 |

未收录时显示「未收录该药品」+ 两条建议（换通用名/商品名再试、查国家药监局官网
`https://www.nmpa.gov.cn/zwfwqjd/index.html`）。**`run()` 全同步执行，零网络请求。**

---

## 2. ingredient — 自建添加剂库 + 配料排位解读

### 数据表 `vendor/dict/additives.js`（40 条）
- 挂载 `window.LB.dict.additives`，字段 `{ n 名称, code 编号, func 分类, safety 安全等级, note 说明 }`。
- 四级安全枚举（CSS 类`.s0`~`.s3`）：

  | 枚举 | 名称 | 色 | 含义 |
  |---|---|---|---|
  | `very` | 很安全 | 绿 | 常规剂量无风险 |
  | `common` | 一般安全 | 蓝 | 常规食品用途 |
  | `limit` | 限量摄入 | 黄 | 有每日限量 |
  | `worry` | 争议较大 | 红 | 有限量争议 / 特殊人群禁忌 |

- 分布：`{ very: 16, limit: 12, common: 7, worry: 5 }`。

### 切分与匹配
- 切分分隔符：`/[，,、；;（）()]/`（任务书指定），并过滤「配料」「主要成分」等包装词。
- 双向模糊匹配 `matchOne(seg, list)`：精确 100 > 库名以输入开头 80 > 库名包含输入 70 > 输入以库名开头 60 > 输入包含库名 50。
- 未收录项以**灰字 `--fg3`** 列入「未收录（N）」区，不报错。

### 配料排位解读（GLM 加分项）
- 提示「配料表按**含量降序**排列，第一位是主要成分，含量通常最高」。
- 列出前 3 位；**勾选「给个大概」后**附占比推测 `['约 60% 以上', '约 20%–30%', '约 5%–10%']`，
  并明确标注「占比为按常规配方的**推测值**，非实测数据」。
- 实现要点：`rows` 数组按输入顺序 push，排位解读直接取 `rows.slice(0, 3)`；
  安全等级排序另用 `hits.slice().sort(...)` 按 `LV = { worry:3, limit:2, common:1, very:0 }` 降序，**两套顺序互不干扰**。
- 未收录的成分占比显示「—」而非编造数值。

---

## 3. fix — 试卷模式 + 白纸增强

- 顶部 `.seg` 从「涂抹 / 框选」扩展为 **「涂抹 / 框选 / 📝 试卷模式」**（`.seg-3`）。
- 选「试卷模式」后：引导文字切为「涂抹手写答案区域 → 点智能填充 → 自动白纸增强」，
  笔刷**强制加粗到 32px**（同步 `#fxBrush` 与 `#fxBrushV`）。
- 填充完成回调里，`mode === 'exam'` 时自动执行 `whiteEnhance()`，并弹提示条
  「✅ 手写已消除 · 已应用白纸增强」+「↺ 关闭增强」按钮（可撤销，`undoStack` 存前态）。
- 三处绘制判断（`pointerdown` / `pointermove` / `finish`）统一改为 `mode === 'brush' || mode === 'exam'`，
  `exam` 复用涂抹式路径；只有 `rect` 隐藏笔刷行与光标。

### 白纸增强算法（性能优化）
任务书示例用 `Array.from(lum).sort((a,b)=>a-b)` 求 1%/99% 分位数——
在 1500×1500（约 225 万像素）上会**卡住秒级**。改用 **256 桶计数**求分位数，O(n) 且结果完全等价：

```js
const bucket = new Uint32Array(256);
for (let i = 0; i < n; i++) bucket[lum[i]]++;
/* 累加找 lo(1%) / hi(99%) → 线性拉伸 → v>220 提到 245+ */
```

实测效果（600×400 合成试卷，纸底 215 / 印刷 60 / 手写 90）：
平均亮度与高亮像素占比显著提升，手写深色块不再是深色，**印刷线仍为深色未被淡化**。

---

## 4. xhscheck — 小红书文案检测器（新工具）

- 注册：`{ id:'xhscheck', cat:'文本语言', ic:'📝', name:'小红书文案检测' }`
  （任务书示例里 `ic` 为空字符串会导致首页卡片无图标，故补 `📝`；分类沿用已有的「文本语言」，不新增分类）。
- 数据表 `vendor/dict/sensitive-words.js`（60 条），挂载 `window.LB.dict.sensitiveWords`，
  字段 `{ w 词, cat 分类, alt 替换建议 }`。
  分类分布：`{ 绝对化: 19, 医疗用语: 15, 诱导: 10, 虚假宣传: 10, 平台禁忌: 6 }`。

### UI 与能力
- `textarea(rows=10)` + [开始检测] 主按钮 + [复制] + 结果区。
- 结果区 = 汇总卡（命中 N 处 · 分 M 类）+ 分类高亮预览 + 命中列表（分类高亮 + 词 + 替换建议 + [一键替换]）
  + 排版检查 + 底部 [一键替换全部]。
- **排版检查**：字数（正文上限 1000 字，超限标红 `l-err`）、emoji 密度（建议 5-15 个）、话题标签数（建议 5-8 个）。
- 复制**严格用 `LB.copyNow` 同步调用**（处理器不加 `async`、不用 `setTimeout`）。

### 两个实现要点
1. **单字词边界检查**：词库收录了单字「最」（广告法极限词），但不能误伤「最初」。
   判定为**任一侧紧邻汉字就跳过**：
   ```js
   if (w.length === 1 && (/[一-龥]/.test(before) || /[一-龥]/.test(after))) { idx += 1; continue; }
   ```
   （任务书示例是 `&&`，会让句首的「最初想法」被误判，此处修正为 `||`。）
2. **高亮渲染的位置偏移**：任务书示例先`esc(text)` 再按 `h.pos` 切字符串插 `<mark>`，
   但 `esc` 会把 `<` `>` `&` 转成实体导致**长度变化、位置全部错位**。
   改为**先切原文、逐段 esc**：
   ```js
   hits.forEach(h => {
     html += esc(text.slice(cur, h.pos));
     html += '<mark class="' + cls + '" data-w="' + esc(h.w) + '">' + esc(h.w) + '</mark>';
     cur = h.pos + h.len;
   });
   html += esc(text.slice(cur));
   ```
3. **重叠去重**：词库里同时有单字「最」和「最好」，扫描时两者会命中同一段。
   按 `pos` 升序、`len` 降序排序后保留更长的（信息量更大、替换更准确）。

###踩坑记录：`LB.dict.load` 的参数是「挂载名」而非文件名
`core/dict.js` 里 `FILE` 映射把挂载 key转成文件名：
```js
const FILE = { ..., sensitiveWords: 'sensitive-words' };
s.src = 'vendor/dict/' + (FILE[name] || name) + '.js';
const d = window.LB.dict[name];          /* ←按挂载名取，不是文件名 */
```
最初误写 `LB.dict.load('sensitive-words')`——脚本能正常加载，但onload 后取
`window.LB.dict['sensitive-words']` 得到 `undefined` → reject「字典加载失败」→ 敏感词全不命中。
**正确写法：`LB.dict.load('sensitiveWords')`。**

---

## 环境备忘（Step 6D 新增）

① `fix.js` 的模式 `.seg` 与工作区 `#fxWork` 一起`hidden`（上传图片后才可见），
   `#fxFile` 本身也带 `hidden` 属性（由按钮代理点击）——Playwright 需用
   `waitForSelector('#fxFile', { state: 'attached' })`，等`visible` 会超时。
② 验证 medbox 离线可用：用 `page.route(u => !u.href.startsWith(BASE), r => r.abort())`
   拦截所有非本地请求；本地 `vendor/dict/*.js` 不受影响，仍可查。
③ Step 6D 改动了 medbox 的h1（`药品信息分析` → `药品信息查询`）与数据源文案，
   `test_6a_5_srcnote.js` 中断言旧 OpenFDA 文案的部分已同步改写为验证新的本地库警示条。

## 测试脚本

| 脚本 | 结果 | 覆盖 |
|---|---|---|
| `test_6d_all.js` | **136 PASS / 0 FAIL** | 药品库 40 条字段完整性 / medbox 四条任务书验收 + 断网可查 / 添加剂库四级安全 + 5 种分隔符 + 排位解读 / 试卷模式全流程（引导·笔刷 32·涂抹·填充·白纸增强·手写消失·印刷清晰·关闭增强）/ xhscheck 命中·高亮分色·一键替换·单字边界·复制同步·排版检查 / Console 0 报错 + 375px 无横向滚动 |
| `test_6bc_all_tools.js` | 4 PASS / 0 FAIL | **全量 97 工具挂载 0 失败 + Console 0 报错 + 97 工具 375px 无横向滚动**（工具数断言 96 → 97） |
| `test_6c_all.js` | 107 PASS / 0 FAIL | Step 6C 三项回归（工具数断言同步为 97） |
| `test_6b_1_translate.js` | 36 PASS / 0 FAIL | Step 6B-1 回归 |
| `test_6b_2_gpa.js` | 46 PASS / 0 FAIL | Step 6B-2 回归 |
| `test_6b_3_countdown.js` | 35 PASS / 0 FAIL | Step 6B-3 回归 |
| `test_6b_4_wallpaper.js` | 43 PASS / 0 FAIL | Step 6B-4 回归 |
| `test_6b_5_6_csvtab.js` | 61 PASS / 0 FAIL | Step 6B-5/6 回归 |
| `test_6a_1_share.js` | 60 PASS / 0 FAIL | Step 6A-1 回归（端口 8921 → 8947，避开常驻静态服占用） |
| `test_6a_2_idphoto.js` | 39 PASS / 0 FAIL | Step 6A-2 回归 |
| `test_6a_3_loan.js` | 62 PASS / 0 FAIL | Step 6A-3 回归 |
| `test_6a_4_ocr.js` | 58 PASS / 0 FAIL | Step 6A-4 回归（工具数断言同步为 97） |
| `test_6a_5_srcnote.js` | 36 PASS / 0 FAIL | Step 6A-5 回归（medbox 断言改写为本地库警示条口径） |

**本轮合计 687 PASS / 0 FAIL。**

## 待办（等用户确认）

- 三张数据表按任务书分批交付，**当前为首批 40 / 40 / 60**；用户确认后追加至
  **drugs 100 / additives 100 / sensitive-words 200** 条。
- 追加时继续保持「数据准确性优先」：药品的 `dose` / `warn` 逐条查证，
  添加剂的 `code`（INS 编号）与 `safety` 分级、小红书敏感词的 `alt` 替换建议需可落地。

---

# Step 6I / 6J / 6K — 数据型工具第二批 + 第三批复杂工具 + 影视热榜

> 工具数 **107 → 114**（+7）。数据表 5 张全部一次性做满（用户确认采用「一次性做满」方案，
> 不走分批）。所有复制点统一用 `LB.copyNow` 同步调用。

## 一、数据表（`public/vendor/dict/`）

| 文件 | 挂载名 | 条数 | 说明 |
|---|---|---|---|
| `foods.js` | `LB.dict.foods` | **238** | 9 分类（主食/肉类/水产/蛋奶/蔬菜/水果/饮料/零食/快餐），每 100g 或 100ml |
| `universities.js` | `LB.dict.universities` | **721** | 覆盖大陆 31 省，985 = 39、211 = 115、双一流 = 148；165 所含官网域名 |
| `soc-ladder.js` | `LB.dict.socLadder` | **61** | 相对分（TOP1 = 10000），7 个品牌 |
| `recipes.js` | `LB.dict.recipes` | **200** | 7 分类，含食材清单 / 步骤 / 小贴士 |
| `history-today.js` | `LB.dict.historyToday` | **382**（366 个日期） | `{ 'MM-DD': [{y,e}] }` 结构 |

**`core/dict.js` 的 FILE 映射补了两条**（挂载名 ≠ 文件名，不补会 404）：
`socLadder → soc-ladder`、`historyToday → history-today`。
（`foods` / `universities` / `recipes` 挂载名与文件名一致，无需映射。）

## 二、新增 7 个工具

| id | 名称 | 分类 | 要点 |
|---|---|---|---|
| `calorie` | 卡路里查询 | 日常生活 | seg 双 tab（查询 / 饮食记录）；份量弹窗按 `份量/100` 换算；跨天自动开新组、历史保留 |
| `university` | 高校查询 | 学习效率 | 省份下拉从数据现取；层次 chips 985/211/双一流；无官网域名的条目降级为必应搜索 |
| `cpu_ladder` | 硬件天梯 | 网络工具 | 条形宽度按 TOP1 归一化；品牌 chips 从数据现取；点击跳必应搜「型号 跑分」 |
| `recipe` | 菜谱查询 | 日常生活 | 检索串 = 菜名 + 主料 + 分类；卡片内联手风琴展开详情 |
| `today_history` | 历史今日 | 学习效率 | 基准年固定为闰年 2000，保证 02-29 可到达；前一天/后一天/随机一天/回到今天 |
| `exif` | 图片 EXIF 编辑 | 图片设计 | piexifjs **按需懒加载**（77KB 不进首屏）；查看 / 清除 / 修改拍摄时间三 tab；限 JPG、20MB |
| `jobvalue` | 工作性价比计算 | 财务计算 | 任务书评分模型 + S/A/B/C/D 分级 + 750×1000 canvas 分享图（参照 countdown） |

## 三、hotlist 新增「🎬 影视」tab（Step 6K）

- 前端 `public/js/tools/hotlist.js`：`BOARDS` 增加 `{ key:'movie', name:'影视', ic:'🎬', path:'/v2/douban/weekly/movie' }`；
  `parseHot` 增加 `rating` 兜底（影视榜无 `hot_value`，用豆瓣评分并标注「分」）。
- 后端 `functions/api/hotlist.js`：`PATHS` 增加 `movie`；`parseList` 同样支持 `rating`。
- **短剧榜按任务书跳过**：无公开稳定数据源，只做影视。

## 四、关键决策与踩坑

1. **21.75 的泛化**：`jobvalue` 时薪公式里任务书写死 21.75（= 5 天 × 4.35）。
   工具允许选 5-7 天班，故改为「每周工作天数 × 4.35」——5 天时恰好等于 21.75，口径不变，
   6/7 天班也能算对。
2. **piexif 只支持 JPEG**：EXIF 是 JPEG/TIFF 的段结构，PNG/WebP 没有可写 EXIF。
   在上传阶段就拦截并明确提示，而不是等用户点按钮才失败。
3. **清除隐私 = 清 5 个 IFD + thumbnail**：只清 GPS 不够，机身序列号 / 软件版本 / 原始时间都在
   0th / Exif 里，故全部置空。
4. **官网链接降级**：721 所里只有 165 所有可靠域名，其余省属院校域名口径不统一，
   写错反而误导 → 无 `site` 的条目退化为必应搜索，保证「每个条目都有可点入口且绝不给错域名」。
5. **`?.` 一律不用**：目标含国产壳浏览器（X5 内核等），全站保持 ES2017 写法（`&&` / 三元），
   与本仓库既有风格一致。
6. **`!important` 零新增**：`tools.css` 里唯一的 `!important` 出现在注释中（非实际声明）。

## 五、本轮验证（临时脚本，跑完即删）

| 检查 | 结果 |
|---|---|
| 注册表一致性（114 工具 × 文件 × router.register × 分类 × id 唯一） | **全绿**：缺文件 0 / 未注册 0 / 非法分类 0 / 重复 id 0 / 缺字段 0 |
| 字典映射（16 个 `LB.dict.load` 全部命中文件且挂载名正确） | **全绿** |
| jsdom 功能测试（7 个新工具挂载 + 检索 + 筛选 + 评分 + 存储） | **47 PASS / 0 FAIL** |
| hotlist 前后端（7 个 tab、影视 chip、后端 ESM `node --check`） | **6 PASS / 0 FAIL** |
| 5 张数据表 JS 语法 + 条数 | **全部 OK**（238 / 721 / 61 / 200 / 382） |

**本轮合计 53 PASS / 0 FAIL。**（jsdom 环境无法覆盖真实渲染与 375px 横向滚动，建议真机复核。）

## 六、验收对照（任务书）

- calorie：搜「鸡蛋」→ 144 kcal/100g ✅；点鸡蛋 → 输 100g → 加入记录 ✅；记录页显示今日总热量 ✅；
  刷新保留（localStorage）✅；跨天自动清空但历史保留 ✅
- university：搜「清华」命中 ✅；筛 985 只显示 985 ✅；筛「江苏」显示江苏全部 ✅；官网新标签打开 ✅
- cpu_ladder：打开显示天梯 ✅；筛 Apple 只显示 Apple ✅；点条目跳必应「型号 跑分」✅
- recipe：搜「西红柿」命中西红柿炒鸡蛋 ✅；搜「鸡」命中多道 ✅；点菜展开详情 ✅；分类筛选 ✅
- today_history：默认显示今天 ✅；前一天/后一天 ✅；无数据日期提示「暂无记录」✅
- exif：上传 JPG → 显示字段 ✅（真机需实拍图复核）；清除 → 下载干净版 ✅；修改时间 → 保存 ✅
- jobvalue：10000/5天/8h/无通勤/无加班 → 高分（A/S）✅；5000/6天/10h/通勤3h/加班40h → 低分（C/D）✅；
  点分享生成分享图 ✅
- hotlist：切「影视」→ 显示豆瓣热门电影 ✅（接口 `60s.viki.moe/v2/douban/weekly/movie` 实测有数据）
