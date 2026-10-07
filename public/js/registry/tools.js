/* LiteBox v5 · registry/tools.js — 工具注册表（唯一数据源，禁止外部 push/splice/重排） */
(() => {
  window.LB = window.LB || {};
  LB.tools = [
    { id:'idphoto', weight: 10, cat:'图片设计', ic:'📷', name:'证件照换底色', desc:'白蓝红透明底一键替换，AI 人像分割发丝级边缘，纯本地处理。', kw:'证件照 照片 抠图 换背景 底色 一寸 二寸 蓝底 白底 红底' },
    { id:'compress', weight: 10, cat:'图片设计', ic:'🗜️', name:'图片压缩', desc:'批量压缩并互转 JPG / PNG / WebP，支持限制尺寸，最高省 90% 体积。', kw:'压缩 图片 变小 体积 容量 格式转换 png jpg webp 转' },
    { id:'watermark', weight: 8, cat:'图片设计', ic:'🖋️', name:'图片加水印', desc:'文字水印防搬运，支持平铺、旋转、透明度，本地处理。', kw:'水印 版权 防盗 签名' },
    { id:'grid9', weight: 6, cat:'图片设计', ic:'🔲', name:'九宫格切图', desc:'一张图切九张，朋友圈 / 小红书拼图必备，逐张或全部下载。', kw:'九宫格 切图 拼图 朋友圈 小红书' },
    { id:'crop', weight: 8, cat:'图片设计', ic:'✂️', name:'图片裁剪', desc:'自由 / 1:1 / 3:4 / 9:16 等比例裁剪，拖拽框选，头像壁纸必备。', kw:'裁剪 截图 比例 头像 壁纸 剪裁' },
    { id:'fix', weight: 7, cat:'图片设计', ic:'🩹', name:'图片修复去水印', desc:'涂抹或框选水印、字迹、路人，周边智能填充，白底文档截图神器。', kw:'去水印 去字迹 修复 涂抹 抹除 去除 消除 路人 图片处理' },
    { id:'imgbatch', weight: 7, cat:'图片设计', ic:'🗂️', name:'图片批量处理', desc:'尺寸修改 / 格式转换 / EXIF 清理 / 打码马赛克，批量本地处理。', kw:'图片 批量 尺寸 修改 格式 转换 jpg png webp 打码 马赛克 模糊 exif 隐私' },
    { id:'image64', weight: 5, cat:'图片设计', ic:'🔣', name:'图片 Base64', desc:'图片转 Base64 数据并复制，Base64 图片也可直接下载。', kw:'图片 base64 转码 data url 图片编码 解码' },
    { id:'gifmake', weight: 4, cat:'图片设计', ic:'🎞️', name:'GIF 制作', desc:'多张图片合成 GIF 动图，帧率 / 尺寸 / 循环次数可调，纯本地生成。', kw:'gif 动图 合成 制作 帧 动画 表情包 循环' },
    /* Step 22 · 四：表情包加字（id: meme）已按需求下线 */
    { id:'docscan', weight: 4, cat:'图片设计', ic:'📐', name:'文档矫正', desc:'拍摄的课件、书页透视校正，拖动四角拉正成矩形文档。', kw:'文档 矫正 透视 校正 扫描 拍书 课件 deskew 拉正' },
    /* Step 14 新增 · 试卷去手写（分类沿用已有的「图片设计」，不新增分类） */
    { id:'qr', weight: 9, cat:'文本语言', ic:'🔳', name:'二维码工具', desc:'7 种类型生成（文本/网址/WiFi/名片/电话/短信/邮件），码点定位美化，Logo 色块文字装饰，传图即解码。', kw:'二维码 qr 生成 识别 扫码 解码 wifi 链接 名片 vcard 短信 邮件 美化 logo' },
    { id:'texttool', weight: 10, cat:'文本语言', ic:'📝', name:'文本处理', desc:'字数统计、阅读时长、一键排版清理三合一。', kw:'字数 统计 字符 论文 排版 清理' },
    { id:'textconvert', weight: 7, cat:'文本语言', ic:'🔀', name:'文本互相转换', desc:'大小写、全半角、URL、Unicode、JSON、去重排序一站式处理。', kw:'文本转换 大小写 全角 半角 url unicode json 格式化 编解码 去重 排序' },
    { id:'jsonfmt', weight: 10, cat:'文本语言', ic:'🧾', name:'JSON 格式化', desc:'格式化 / 压缩 JSON，错误行号定位，接口调试与配置编辑好用。', kw:'json 格式化 压缩 校验 api 调试' },
    { id:'b64', weight: 8, cat:'文本语言', ic:'🔢', name:'Base64 / URL 编解码', desc:'文本与 Base64、URL 编码互转，中文安全无乱码。', kw:'base64 编码 解码 url 转码 encode' },
    { id:'hash', weight: 8, cat:'文本语言', ic:'🧮', name:'SHA-256 哈希', desc:'文本秒算 SHA-256 摘要，可用于校验文件指纹与去重比对。', kw:'哈希 hash sha256 摘要 校验 加密' },
    { id:'diff', weight: 6, cat:'文本语言', ic:'🆚', name:'文本对比', desc:'两段文本逐行差异高亮，新增 / 删除一目了然。', kw:'对比 差异 diff 文本 比较 行 新增 删除 改稿' },
    { id:'uuid', weight: 6, cat:'文本语言', ic:'🆔', name:'UUID 生成', desc:'UUID v4 / 短 ID / 时间戳 ID / NanoID，批量生成一键复制。', kw:'uuid guid 唯一 id 生成 随机 nanoid 短id' },
    { id:'urlparse', weight: 5, cat:'文本语言', ic:'⚙️', name:'URL 参数解析', desc:'拆解链接协议 / 路径 / 查询参数，一键复制 JSON，中文自动解码。', kw:'url 链接 参数 解析 query 查询 解码 json' },
    { id:'unicode', weight: 4, cat:'文本语言', ic:'🔤', name:'Unicode 编解码', desc:'中文 ↔ \\\\uXXXX 转义互转，字符码点 / UTF-8 字节查询。', kw:'unicode 编码 解码 utf8 转义 码点 字符' },
    { id:'regex', weight: 7, cat:'文本语言', ic:'🧪', name:'正则测试', desc:'实时匹配高亮与分组捕获，写正则调正则的好帮手。', kw:'正则 regex 匹配 表达式 调试' },
    { id:'mdview', weight: 4, cat:'文本语言', ic:'📄', name:'Markdown 预览', desc:'边写边看的实时预览：标题、列表、代码、表格、引用。', kw:'markdown md 预览 编辑器 文档' },
    { id:'dedup', weight: 6, cat:'文本语言', ic:'🧹', name:'文本去重排序', desc:'一键去重 / 排序 / 反转 / 去空行，行数统计一目了然。', kw:'去重 排序 反转 空行 文本清理 唯一' },
    { id:'csvtab', weight: 5, cat:'文本语言', ic:'📋', name:'CSV 表格预览', desc:'粘贴 CSV 即转表格，支持引号转义，可导出 JSON。', kw:'csv 表格 预览 json excel tsv' },
    { id:'textscan', weight: 5, cat:'文本语言', ic:'🔍', name:'文本提取器', desc:'一键提取网址、邮箱、IPv4、手机号和数字，去重后可复制。', kw:'提取 链接 url 邮箱 email ip 手机号 电话 数字 文本 extractor' },
    { id:'xmlfmt', weight: 4, cat:'文本语言', ic:'🧱', name:'XML 美化工具', desc:'XML 快速校验、美化、压缩，错误时给出解析提示。', kw:'xml 美化 压缩 格式化 校验 代码' },
    { id:'jsonmerge', weight: 4, cat:'文本语言', ic:'🧩', name:'JSON 合并', desc:'多个 JSON 对象或数组快速合并，支持格式化导出。', kw:'json 合并 merge 数组合并 对象 合并 api' },
    { id:'pinyin', weight: 5, cat:'文本语言', ic:'🗣️', name:'汉字转拼音', desc:'带声调 / 不带声调 / 首字母，支持长文本与分隔符自定义。', kw:'拼音 汉字 注音 声调 首字母 pinyin 转换' },
    { id:'zhconv', weight: 4, cat:'文本语言', ic:'🔄', name:'简繁转换', desc:'简体 ⇄ 繁体一键互转，常用字词覆盖，支持换向与复制。', kw:'简体 繁体 转换 简繁 中文 台湾 香港' },
    { id:'poem', weight: 3, cat:'文本语言', ic:'📜', name:'古诗词查询', desc:'中小学必背古诗词，按作者 / 名句检索，附注释与赏析。', kw:'古诗 诗词 唐诗 宋词 李白 杜甫 背诵 赏析 静夜思' },
    { id:'idiom', weight: 3, cat:'文本语言', ic:'🀄', name:'成语查询', desc:'常用成语释义 / 拼音 / 例句 / 近义，按字检索，随机抽查。', kw:'成语 词典 释义 拼音 例句 近义词 查询' },
    { id:'pdf', weight: 9, cat:'文件文档', ic:'📕', name:'PDF 工具箱', desc:'图片转 PDF / PDF 转图片 / 合并拆分 / 加页码水印一站式。', kw:'pdf 合并 拆分 转图片 转pdf 页码 水印 打印 作业 扫描' },
    { id:'docbox', weight: 8, cat:'文件文档', ic:'📦', name:'文档转换箱', desc:'EPUB / PDF / DOCX ↔ TXT，Markdown / HTML / CSV 互转。', kw:'epub txt pdf docx 文档 转换 html markdown csv 文件 epub2txt' },
    { id:'fileinfo', weight: 6, cat:'文件文档', ic:'ℹ️', name:'文件信息', desc:'查看文件大小、类型、修改时间与图片尺寸，纯本地。', kw:'文件 信息 大小 mime 图片尺寸 属性 metadata' },
    { id:'filemerge', weight: 6, cat:'文件文档', ic:'🧩', name:'文本文件合并', desc:'批量合并 TXT / MD / CSV，并自动加文件标题。', kw:'文本 合并 txt md csv 文件 批量' },
    { id:'sheetbox', weight: 8, cat:'文件文档', ic:'📊', name:'Excel 转换箱', desc:'XLSX / XLS / CSV 与 JSON 互转，表格数据快速处理。', kw:'excel xlsx xls csv json 表格 转换' },
    { id:'countdown', weight: 10, cat:'学习效率', ic:'⏳', name:'考试倒计时', desc:'四六级、考研、高考内置日期，秒级实时跳动。', kw:'倒计时 考试 四六级 考研 高考' },
    { id:'gpa', weight: 9, cat:'学习效率', ic:'🎓', name:'GPA 计算器', desc:'加权平均分与 4.0 制绩点一键换算，数据本地留存。', kw:'gpa 绩点 成绩 加权 平均分' },
    { id:'pomo', weight: 9, cat:'学习效率', ic:'🍅', name:'番茄钟专注', desc:'专注 / 休息循环计时，圆环进度可视化，今日番茄数统计。', kw:'番茄钟 专注 计时 效率 自习 pomodoro' },
    /* Step 13 · B4：白噪音从番茄钟拆成独立工具（音源表 vendor/dict/noise-sources.js） */
    { id:'noise', weight: 6, cat:'学习效率', ic:'🌧️', name:'白噪音', desc:'雨声、海浪、白噪音、咖啡馆、篝火等多种背景音，专注助眠。', kw:'白噪音 雨声 海浪 助眠 专注 背景音 noise' },
    { id:'wordcard', weight: 8, cat:'学习效率', ic:'🃏', name:'背单词', desc:'四级高频词卡片记忆，翻牌看释义，生词本本机保存，可导出 CSV。', kw:'背单词 四级 六级 考研 单词 记忆 卡片 cet4 生词本' },
    { id:'wheel', weight: 6, cat:'学习效率', ic:'🎡', name:'随机点名转盘', desc:'课堂点名、抽签决定，转盘动画抽取，支持抽后移除。', kw:'点名 转盘 随机 抽签 抽奖' },
    { id:'group', weight: 6, cat:'学习效率', ic:'👥', name:'课堂随机分组', desc:'名单一键随机分成若干组，课堂活动、小组作业必备。', kw:'分组 随机 小组 队伍 课堂 组队' },
    { id:'todo', weight: 8, cat:'学习效率', ic:'✅', name:'待办清单', desc:'轻量待办事项，勾选完成、一键清理，本地保存。', kw:'待办 清单 计划 todo 任务 备忘' },
    { id:'stats', weight: 5, cat:'学习效率', ic:'📈', name:'统计计算器', desc:'均值、中位数、方差、标准差粘贴即算，数学作业必备。', kw:'统计 均值 平均数 方差 标准差 中位数 数学' },
    { id:'timer', weight: 8, cat:'学习效率', ic:'⏱️', name:'计时器秒表', desc:'倒计时 / 秒表 / 分段计时三合一，到点响铃提醒。', kw:'计时器 秒表 倒计时 定时 分段 提醒 学习' },
    { id:'notes', weight: 7, cat:'学习效率', ic:'🗒️', name:'便签本', desc:'彩色便签随手记，自动本地保存，支持一键复制与删除。', kw:'便签 笔记 备忘 随手记 备忘录 待办 彩色' },
    { id:'lots', weight: 5, cat:'学习效率', ic:'🎋', name:'随机抽签', desc:'输入名单抽 1 或多签，不重复抽取，带历史记录。', kw:'抽签 抽奖 随机 点名 名单 抽取 摇号' },
    { id:'rand', cat:'学习效率', ic:'🎰', name:'随机数生成', desc:'指定范围与个数，支持不重复抽取，抽签抽题抽学号。', kw:'随机数 抽签 抽号 摇号 概率 幸运' },
    { id:'datecalc', weight: 5, cat:'学习效率', ic:'📅', name:'日期计算器', desc:'两个日期间隔天数、日期推算与星期查询。', kw:'日期 天数 间隔 计算 星期 推算' },
    { id:'loan', weight: 10, cat:'财务计算', ic:'🏦', name:'房贷计算器', desc:'等额本息 / 等额本金对比，月供、总利息与逐月明细。', kw:'房贷 计算 月供 利息 等额本息 等额本金 贷款 买房' },
    { id:'tax', weight: 9, cat:'财务计算', ic:'🧾', name:'个税五险一金', desc:'税前税后换算，五险一金明细与到手工资估算。', kw:'个税 五险一金 工资 到手 税前 税后 社保 公积金 计算' },
    { id:'rmb', weight: 8, cat:'财务计算', ic:'💴', name:'数字大写', desc:'金额转人民币大写（壹贰叁），报销发票必备。', kw:'大写 金额 人民币 数字 转换 发票 报销 壹贰叁' },
    { id:'fxrate', weight: 7, web:true, cat:'财务计算', ic:'💱', name:'汇率换算', desc:'30+ 币种实时汇率双向换算，汇率每日自动更新。', kw:'汇率 换算 美元 日元 港币 英镑 货币 exchange' },
    { id:'ledger', weight: 8, cat:'财务计算', ic:'📒', name:'记账本', desc:'收入 / 支出 / 分类 / 月度统计，数据只保存在本机。', kw:'记账 账本 支出 收入 消费 财务 budget expense income' },
    { id:'subscriptions', weight: 6, cat:'财务计算', ic:'🔔', name:'订阅管理', desc:'管理会员、软件和流媒体订阅，自动计算月度 / 年度成本与续费日期。', kw:'订阅 会员 流媒体 软件 续费 扣费 subscription renewal' },
    { id:'bmi', weight: 9, cat:'日常生活', ic:'⚖️', name:'BMI 体重指数', desc:'输入身高体重即算 BMI，中国标准分级，健康参考。', kw:'bmi 体重 身高 肥胖 健康 体脂' },
    { id:'sleep', weight: 8, cat:'日常生活', ic:'😴', name:'睡眠周期计算', desc:'按 90 分钟睡眠周期推荐入睡 / 起床时间，醒来更轻松。', kw:'睡眠 睡觉 起床 入睡 作息 熬夜' },
    { id:'calendar', weight: 9, cat:'日常生活', ic:'🗓️', name:'万年历', desc:'公历农历对照 · 二十四节气 · 传统节日 · 生肖干支。', kw:'万年历 农历 阴历 节气 黄历 生肖 干支 节日 日历' },
    { id:'idcard', weight: 7, cat:'日常生活', ic:'📇', name:'身份证解析', desc:'校验号码真伪，解析生日 / 性别 / 年龄 / 户籍省份。', kw:'身份证 解析 校验 生日 性别 年龄 籍贯 号码' },
    { id:'phone', weight: 7, cat:'日常生活', ic:'📞', name:'手机号归属地', desc:'省市 + 运营商查询，支持批量，号段库本地匹配不上传。', kw:'手机号 归属地 运营商 号码 查询 移动 联通 电信 区号' },
    { id:'daymatter', weight: 6, cat:'日常生活', ic:'⌛', name:'纪念日倒数', desc:'生日、考试、纪念日倒数与累计天数，本地保存多个日子。', kw:'纪念日 倒计时 生日 倒数 天数 距离' },
    { id:'meallog', weight: 6, cat:'日常生活', ic:'🍱', name:'伙食记录', desc:'记录每一餐、花费与评分，按天/月统计与预算。', kw:'伙食 饮食 吃饭 早餐 午餐 晚餐 花费 meal food' },
    /* Step 17 · A2：由「经期提醒」改为「经期记录」——纯前端无法做系统级推送，移除"提醒"避免误导 */
    { id:'period', weight: 5, cat:'日常生活', ic:'🌙', name:'经期记录', desc:'记录月经周期，预测排卵期与易孕期，数据仅本机保存。', kw:'经期 月经 周期 记录 排卵 易孕 安全期 美柚 period' },
    { id:'water', weight: 6, cat:'日常生活', ic:'💧', name:'喝水记录', desc:'每日饮水目标与杯数记录，轻量追踪习惯。', kw:'喝水 饮水 水杯 习惯 hydration water tracker' },
    { id:'quicklinks', weight: 7, cat:'日常生活', ic:'⚡', name:'快捷收藏夹', desc:'保存常用网站与链接，本机管理、搜索、分类和一键复制。', kw:'收藏 链接 网址 快捷 网站 bookmark links' },
    { id:'ingredient', weight: 5, cat:'日常生活', ic:'🧪', name:'配料表解读', desc:'自动切分配料、识别别名与添加剂、统计风险。', kw:'配料 成分 添加剂 食品 防腐剂 甜味剂 色素 健康 解读 识别' },
    { id:'medbox', weight: 5, cat:'日常生活', ic:'💊', name:'药品信息分析', desc:'查询常见药品成分、用途、警示与官方说明入口。', kw:'药品 药物 用药 成分 禁忌 相互作用 说明书 medicine drug' },
    { id:'assets', weight: 4, cat:'日常生活', ic:'🏷️', name:'物品资产记录', desc:'物品台账与价值统计，分类筛选，支持导出。', kw:'资产 记录 物品 台账 清单 财产 统计 库存' },
    { id:'tsconv', weight: 6, cat:'日常生活', ic:'🕐', name:'时间戳转换', desc:'Unix 时间戳与日期互转，秒 / 毫秒双精度。', kw:'时间戳 unix 日期 转换 timestamp 秒' },
    { id:'iplookup', weight: 10, web:true, cat:'网络工具', ic:'🌍', name:'IP 归属地查询', desc:'查本机或任意 IP / 域名的归属地、运营商、时区。', kw:'ip 归属地 位置 运营商 本机ip 域名 geolocation' },
    { id:'weather', weight: 10, web:true, cat:'网络工具', ic:'☁️', name:'天气预报', desc:'全球城市当前天气 + 5 日预报，温度湿度风速一目了然。', kw:'天气 温度 湿度 降雨 风速 预报 weather' },
    { id:'translate', weight: 9, web:true, cat:'网络工具', ic:'🌐', name:'文本翻译', desc:'中英日韩法等 15 种语言互译，支持自动检测，一键复制译文。', kw:'翻译 translate 英译中 中译英 日语 韩语' },
    { id:'dnslookup', weight: 6, web:true, cat:'网络工具', ic:'🧭', name:'DNS 查询', desc:'A / AAAA / CNAME / MX / TXT 记录解析，国内 DoH 节点直连。', kw:'dns 解析 域名解析 a记录 mx txt cname' },
    { id:'webarchive', weight: 5, web:true, cat:'网络工具', ic:'🗄️', name:'网页快照', desc:'查询网页历史存档与最新快照，失效页面也能回看。', kw:'网页 快照 存档 镜像 历史 时光机 wayback archive' },
    { id:'speedtest', weight: 7, web:true, cat:'网络工具', ic:'🚀', name:'网速测试', desc:'多节点下载测速，实时速度与网络评级。', kw:'网速 测速 带宽 宽带 speed 下行速度' },
    /* Step 18 新增 · 大模型 API 速查 */
    { id:'llmapis', weight: 6, cat:'网络工具', ic:'🧠', name:'大模型 API 速查', desc:'主流大模型 API 刊例速查：上下文窗口、输入输出价格、多模态能力一目了然。', kw:'大模型 llm api 价格 定价 gpt claude gemini deepseek kimi 上下文 token' },
    { id:'mirror', weight: 6, web:true, cat:'网络工具', ic:'🪞', name:'镜像加速', desc:'GitHub 加速下载 / Docker 镜像源 / npm·pip 国内源。', kw:'镜像 加速 github 代理 下载 docker npm pip 源 registry ghproxy' },
    { id:'wallpaper', weight: 8, web:true, cat:'网络工具', ic:'🖼️', name:'壁纸精选', desc:'多源高清壁纸中心，支持电脑/手机、动漫、风景等分类。', kw:'壁纸 wallpaper 高清 美图 bing 每日 桌面 背景' },
    { id:'hotlist', weight: 8, web:true, cat:'网络工具', ic:'🔥', name:'热榜聚合', desc:'微博 / 知乎 / 抖音 / B站 / 头条 / 影视热搜一屏看完。', kw:'热搜 热榜 微博 知乎 抖音 bilibili 头条 百度 影视 电影 豆瓣 新闻 trending' },
    { id:'mbti', weight: 3, cat:'网络工具', ic:'🧠', name:'MBTI 人格测试', desc:'12 道轻量题快速测出四维偏好与 16 型结果。', kw:'mbti 人格 性格 entp infj intj enfp 测试' },
    { id:'shorturl', weight: 4, web:true, cat:'网络工具', ic:'🔗', name:'短网址生成', desc:'把长链接生成短网址，支持复制与一键打开。', kw:'短网址 短链接 url short url 链接压缩' },
    { id:'ptable', weight: 4, cat:'网络工具', ic:'⚛️', name:'元素周期表', desc:'118 种元素按周期、族和原子序号快速查看。', kw:'元素 周期表 原子序数 元素符号 化学 原子量' },
    { id:'surname', weight: 3, cat:'网络工具', ic:'🖌️', name:'百家姓查询', desc:'常见姓氏拼音与百家姓序位快速查询。', kw:'百家姓 姓氏 拼音 序位 中文 姓' },
    { id:'vframe', weight: 6, cat:'音视频', ic:'🎞️', name:'视频帧提取', desc:'视频封面截图 / 定时连拍，帧画面本地提取，一键保存 PNG。', kw:'视频 帧 截图 封面 连拍 抽帧 video frame' },
    { id:'vconv', weight: 7, cat:'音视频', ic:'🎬', name:'视频压缩转码', desc:'浏览器本地转码压缩，可选分辨率与码率，输出 WebM。', kw:'视频 压缩 转码 webm 分辨率 码率 变小' },
    { id:'acut', weight: 6, cat:'音视频', ic:'🎚️', name:'音频剪辑', desc:'截取音频片段导出 WAV，波形可视化选区。', kw:'音频 剪辑 截取 wav 波形 铃声 audio cut' },
    { id:'screencap', weight: 6, cat:'音视频', ic:'🖥️', name:'屏幕录制', desc:'录制屏幕 / 窗口 / 标签页，可含系统声音，导出 WebM。', kw:'屏幕录制 录屏 录像 网课 screencast' },
    { id:'tts', weight: 10, cat:'音视频', ic:'🔊', name:'文字转语音', desc:'粘贴文本即朗读，语速音调可调，英语听力 / 课文跟读好用。', kw:'朗读 语音 tts 读文本 听力 英语 配音' },
    { id:'stt', weight: 9, cat:'音视频', ic:'🎤', name:'语音转文字', desc:'上传音频快速识别成可编辑文字，结果可复制导出。', kw:'语音转文字 stt 录音 转写 音频 识别 会议 课堂' },
    { id:'rec', weight: 8, cat:'音视频', ic:'🔴', name:'录音机', desc:'课堂 / 会议录音，本地录制下载，不上传不耗流量。', kw:'录音 录音机 课堂 会议 记录 语音' },
    /* Step 13 · B5：原「聚会小游戏」按玩法拆成 4 个独立工具，
       「比大小」并入摇骰子作副按钮，「谁是卧底」下架（依赖词库、维护成本高）。 */
    { id:'dice', weight: 10, cat:'聚会娱乐', ic:'🎲', name:'摇骰子', desc:'5 颗 3D 骰子抛起翻滚落地按点数定面，可连摇和比大小。', kw:'骰子 摇骰子 骰 色子 大话骰 比大小 聚会 派对 dice 3d' },
    { id:'bottle', weight: 6, cat:'聚会娱乐', ic:'🍾', name:'转瓶子', desc:'输入玩家名单转动瓶子，瓶口指向谁就由谁接受挑战。', kw:'转瓶子 瓶子 抽签 选人 聚会 惩罚 bottle 旋转' },
    { id:'bomb', weight: 6, cat:'聚会娱乐', ic:'💣', name:'数字炸弹', desc:'1 到 100 里藏一颗炸弹，轮流猜数字缩小范围，踩中的人受罚。', kw:'数字炸弹 炸弹 猜数字 范围 聚会 游戏 惩罚 bomb' },
    { id:'truth_dare', weight: 8, cat:'聚会娱乐', ic:'💬', name:'真心话大冒险', desc:'各 50 道真心话与大冒险题目随机抽取，聚会破冰直接用。', kw:'真心话 大冒险 Truth or Dare 惩罚 破冰 聚会 游戏 truth' },
    /* Step 18 新增 · 脑筋急转弯 */
    { id:'brainteaser', weight: 6, cat:'聚会娱乐', ic:'🤔', name:'脑筋急转弯', desc:'内置题库随机抽题先想后看答案，可随机不重复出题，聚会破冰利器。', kw:'脑筋急转弯 谜语 益智 动脑 破冰 聚会 brainteaser riddle' },
    { id:'resume', weight: 10, cat:'求职办公', ic:'📑', name:'简历生成器', desc:'多套专业模板、实时预览、证件照、示例填充与 PDF 打印导出。', kw:'简历 resume 求职 实习 cv' },
    { id:'radix', cat:'文本语言', ic:'🔢', name:'进制转换', desc:'2 / 8 / 10 / 16 进制互转，BigInt 支持任意大数。', kw:'进制 转换 二进制 八进制 十进制 十六进制 hex binary 255' },
    { id:'textstats', cat:'文本语言', ic:'📊', name:'文本统计', desc:'字符 / 中英文 / 行段落实时统计，附阅读时长估算。', kw:'字数 统计 字符 中文字 英文单词 行数 段落 阅读时长' },
    /* Step 5I 新增 · 生物实验计算器（分类沿用已有的「日常生活」，不新增分类） */
    { id:'biolab', weight: 2, cat:'日常生活', ic:'🧬', name:'生物实验计算器', desc:'细胞铺板、溶液配制、稀释、动物剂量、转染用量一站计算。', kw:'生物 实验 细胞 铺板 溶液 稀释 转染 用量 分子 摩尔 浓度biolab lab' },
    /* Step 6A 新增 · OCR 文字识别（分类沿用已有的「文件文档」，不新增分类） */
    { id:'ocr', weight: 7, cat:'文件文档', ic:'📝', name:'OCR 文字识别', desc:'拍照或上传图片，识别图中文字，可复制导出。', kw:'ocr 文字识别 图片转文字 提取文字 拍照 扫描' },
    /* Step 15 · B3 新增 · 压缩包工具（分类沿用已有的「文件文档」，不新增分类） */
    { id:'ziptool', weight: 7, cat:'文件文档', ic:'🗜️', name:'压缩包工具', desc:'在线解压 / 压缩 ZIP 文件，支持加密压缩包。', kw:'zip 压缩 解压 加密 解密 rar 7z archive' },
    /* Step 6C 新增 · 三个新工具（分类均沿用已有分类，不新增分类） */
    { id:'relative', weight: 3, cat:'日常生活', ic:'👨‍👩‍👧', name:'亲戚关系计算器', desc:'逐步组合亲戚关系链，自动算出称呼，附说明与地域差异提示。', kw:'亲戚 关系 称呼 辈分 表哥 表姐 婆婆 岳父 家族 亲属 算计器' },
    { id:'deadpixel', weight: 3, cat:'网络工具', ic:'📱', name:'屏幕坏点检测', desc:'全屏纯色逐色检查屏幕坏点与亮点，六色循环，点击或 Esc 退出。', kw:'坏点 亮点 死点 屏幕 显示器 手机 纯色 检测 dead pixel' },
    { id:'imgstyle', weight: 3, cat:'图片设计', ic:'🎨', name:'图片风格化', desc:'上传图片一键转卡通 / 漫画 / 油画 / 素描 / 铅笔 / 人像，纯本地处理可下载。', kw:'图片 风格化 卡通 漫画 油画 素描 铅笔 人像 滤镜 效果 处理 toon' },
    /* Step 6D 新增 · 小红书文案检测（分类沿用已有的「文本语言」，不新增分类）
       注：任务书示例里 ic 为空字符串，会导致首页该卡片无图标，故补一个 📝 */
    { id:'xhscheck', weight: 3, cat:'文本语言', ic:'📝', name:'小红书文案检测', desc:'检测敏感词、极限词、违禁词，给出替换建议，发布前先自查。', kw:'小红书 文案 敏感词 违禁词 极限词 检查 检测 广告法' },

    /* ================= Step 6H 新增 · 6 项纯前端工具 =================
       注：任务书注册示例里 ic 多为空字符串，会导致首页该卡片无图标，
       故统一补上可见 emoji（与 6D/6F/6G 同样的处理）。 */
    { id:'scoreboard', cat:'聚会娱乐', ic:'🏆', name:'记分牌', desc:'聚会、桌游、运动比赛多人计分，支持加减分与全屏大字显示。', kw:'记分 计分 分数 桌游 比赛 比分 scoreboard 加分' },
    { id:'teleprompter', weight: 4, cat:'学习效率', ic:'🎙️', name:'提词器', desc:'演讲、直播、录制视频的匀速滚动提词器。', kw:'提词 提词器 演讲 直播 滚动 大字 prompter' },
    /* Step 20 · A2：手持弹幕自 teleprompter 拆分为独立工具 */
    { id:'danmu', weight: 5, cat:'聚会娱乐', ic:'💬', name:'手持弹幕', desc:'手机变灯牌，全屏大字滚动，接机、应援、表白神器。', kw:'弹幕 灯牌 应援 全屏 大字 滚动 手持 接机' },
    /* Step 20 · A4：字幕互转 */
    { id:'subtitle', weight: 5, cat:'文件文档', ic:'🎬', name:'字幕互转', desc:'SRT / WebVTT / LRC / ASS 两两转换，自动修复编码乱码，时间偏移。', kw:'字幕 srt vtt lrc ass 转换 编码 乱码 时间偏移 subtitle' },
    { id:'quicksearch', weight: 6, cat:'网络工具', ic:'🔎', name:'综合搜索', desc:'输入关键词，一键跳转到各平台搜索，省去逐个打开 App。', kw:'综合搜索 搜索 跳转 百度 知乎 b站 小红书 抖音 微信' },
    { id:'scicalc', weight: 7, cat:'财务计算', ic:'🧮', name:'计算器', desc:'基础四则与科学函数双模式，表达式输入、历史回填。', kw:'计算器 科学 基础 三角函数 对数 阶乘 幂 开方 calc' },
    { id:'postcode', weight: 3, cat:'日常生活', ic:'📮', name:'邮编查询', desc:'输入省市或区县名，查询邮政编码，本地数据不上传。', kw:'邮编 邮政编码 邮政 地址 查询' },
    { id:'geo', weight: 3, cat:'日常生活', ic:'🧭', name:'经纬度转换', desc:'十进制度、度分、度分秒三种格式互相转换。', kw:'经纬度 坐标 度分秒 十进制度 转换 地理 GPS' },

    /* ================= Step 6I 新增 · 数据型工具第二批（5 项） =================
       数据表：foods 238 / universities 721 / soc-ladder 61 / recipes 200
       （today_history 自 Step 28 起改走同源接口，本地数据表已下线）
       分类均沿用已有分类，不新增分类。 */
    { id:'calorie', weight: 6, cat:'日常生活', ic:'🍎', name:'卡路里查询', desc:'200+ 常见食物热量查询，可记录一日饮食总计。', kw:'卡路里 热量 食物 减肥 饮食 营养 蛋白质 calorie' },
    { id:'university', weight: 3, cat:'学习效率', ic:'🎓', name:'高校查询', desc:'全国高校信息查询，可按省份、985/211/双一流筛选。', kw:'高校 大学 985 211 双一流 院校 高考 志愿' },
    { id:'cpu_ladder', weight: 3, cat:'网络工具', ic:'📊', name:'硬件天梯', desc:'手机 SoC 性能天梯排行，静态数据，本地展示。', kw:'硬件 天梯 cpu soc 处理器 排行 骁龙 天玑 苹果 a系列 跑分' },
    { id:'recipe', weight: 5, cat:'日常生活', ic:'🍳', name:'菜谱查询', desc:'200 道家常菜谱，按菜名或食材检索，含做法步骤。', kw:'菜谱 食谱 做饭 烹饪 家常菜 食材 recipe' },
    { id:'today_history', weight: 3, web:true, cat:'学习效率', ic:'📅', name:'历史今日', desc:'按日期翻历史上今天的大事，支持前后 3 天与关键词搜索。', kw:'历史 今日 历史上的今天 history 事件' },

    /* Step 16 · B1 新增 · 小说阅读器（分类沿用已有的「日常生活」，不新增分类）
       注：任务书注册示例里 ic 为空字符串，会导致首页该卡片无图标，故补一个 📖 */
    { id:'reader', weight: 5, cat:'日常生活', ic:'📖', name:'小说阅读器', desc:'上传 TXT / EPUB 本地阅读，字体 / 背景 / 翻页 / 进度记忆，支持夜间模式。', kw:'小说 阅读器 电子书 txt epub 阅读 reader 书' },

    /* ================= Step 6J 新增 · 第三批复杂工具（2 项） ================= */
    { id:'exif', weight: 3, cat:'图片设计', ic:'🖼️', name:'图片 EXIF 编辑', desc:'查看图片 EXIF 信息，一键清除隐私数据，或修改拍摄时间。', kw:'exif 图片 元数据 隐私 gps 拍摄 时间 清除 修改' },
    { id:'jobvalue', weight: 5, cat:'财务计算', ic:'💼', name:'工作性价比计算', desc:'综合月薪、通勤、加班、福利，计算工作性价比评分。', kw:'工作 性价比 工资 月薪 加班 通勤 五险一金 评分 job' },

    /* ================= Step 25 新增 · 三个联网工具（分类沿用已有的「网络工具」，不新增分类） =================
       注：任务书注册示例里 shortvideo / horoscope 的 ic 为空字符串，会导致首页该卡片无图标，
       故按 6D/6F/6G/Step 16 的同样处理补上可见 emoji。
       三者都靠同源 Functions 代理第三方，前端不直连，界面上不标注数据来源。 */
    { id:'shortvideo', weight: 7, web:true, cat:'网络工具', ic:'📹', name:'聚合解析', desc:'粘贴抖音 / 快手 / 小红书等平台分享链接，解析视频、图集、背景音乐。', kw:'短视频 解析 抖音 快手 小红书 图集 视频 下载 去水印 douyin kuaishou' },
    { id:'wzry', weight: 5, web:true, cat:'网络工具', ic:'⚔️', name:'王者荣耀英雄查询', desc:'查询王者荣耀英雄的出装、技能、铭文、对线技巧。', kw:'王者荣耀 英雄 出装 铭文 技能 攻略 李白 韩信 wzry' },
    { id:'horoscope', weight: 5, web:true, cat:'网络工具', ic:'🔮', name:'星座运势', desc:'12 星座今日运势查询：综合、事业、财运、爱情、贵人方位。', kw:'星座 运势 每日 摩羯 水瓶 双鱼 白羊 金牛 双子 巨蟹 狮子 处女 天秤 天蝎 射手 horoscope' },

    /* ================= Step 26 新增 · 四个联网工具（分类沿用「网络工具」） =================
       注：任务书注册示例里 ic 均为空字符串，会导致首页卡片无图标，
       故沿用 Step 25 的处理补上可见 emoji。
       所有第三方调用一律走同源 Functions 代理，前端不直连，界面不标注数据来源。 */
    { id:'wzrank', weight: 6, web:true, cat:'网络工具', ic:'🛡️', name:'王者荣耀战力查询', desc:'查询任意英雄的最低省标/市标/区标战力，以及国服前十、国服第一数据。', kw:'王者荣耀 战力 省标 市标 区标 国服 廉颇 李白 英雄 排行 wzry' },
    { id:'gongshang', weight: 6, web:true, cat:'网络工具', ic:'🏢', name:'工商信息查询', desc:'查询企业工商信息：法人、注册资本、成立日期、经营状态、注册地址。', kw:'工商 企业 公司 法人 注册资本 天眼查 企查查 营业执照' },
    { id:'maoyan', weight: 5, web:true, cat:'网络工具', ic:'🎟️', name:'实时票房', desc:'猫眼实时票房排行，总票房、排片、上座率一屏看懂。', kw:'票房 猫眼 实时 电影 排行 上映' },
    { id:'gamefree', weight: 5, web:true, cat:'网络工具', ic:'🎮', name:'每日限免游戏', desc:'Epic / Steam / PlayStation 限免游戏实时汇总，一个页面看全。', kw:'限免 免费游戏 epic steam ps 白嫖 游戏喜加一' },

    /* ================= Step 27 新增 · 两个联网工具（分类沿用任务书指定的「日常生活」） =================
       注：任务书注册示例里 express 的 ic 为空字符串，会导致首页卡片无图标，
       故沿用 Step 25 / 26 的处理补上可见 emoji。
       两者都靠同源 Functions 代理第三方，前端不直连，界面不标注数据来源。
       快递查询涉及收件人手机后四位：前端不缓存、不写历史、不把后四位渲染到页面上。 */
    { id:'express', weight: 7, web:true, cat:'日常生活', ic:'📦', name:'快递查询', desc:'输入快递单号 + 手机后四位，查询物流轨迹。', kw:'快递 物流 查询 单号 顺丰 中通 圆通 申通 韵达 EMS' },
    { id:'oilprice', weight: 6, web:true, cat:'日常生活', ic:'⛽', name:'全国油价', desc:'各省 89/92/95/98 号汽油及 0/10/20/35 号柴油价格实时查询。', kw:'油价 汽油 柴油 92 95 98 加油 涨价 降价 全国' },

    /* ================= Step 28 新增 · 两个联网工具（分类沿用任务书指定） =================
       注：任务书注册示例已给出 ic（🥇 / ⚠️），无需补图标。
       两者都靠同源 Functions 代理第三方，前端不直连，界面不标注数据来源。
       实时金价不做 K 线图：上游图表地址里含第三方域名，后端直接丢弃该字段。 */
    { id:'goldprice', weight: 6, web:true, cat:'财务计算', ic:'🥇', name:'实时金价', desc:'周大福、六福等金店零售价，国际/上海黄金白银现货价格实时查询。', kw:'金价 黄金 白银 周大福 六福 菜百 现货 期货 金店' },
    { id:'disaster', weight: 6, web:true, cat:'日常生活', ic:'⚠️', name:'灾害预警', desc:'全国气象灾害预警实时查询：暴雨、雷电、大风、霜冻、冰雹等。', kw:'灾害 预警 天气 暴雨 台风 雷电 预警信号 应急' },
  ];
})();
