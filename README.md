![Learnova — 课程学习、题库与 AI、代码工作台](https://raw.githubusercontent.com/RayrenSX/Learnova/main/assets/learnova-cover.png)

# Learnova

**学习通与 Pintia 的学习工作台 · 当前版本 0.1.5**

[![Release](https://img.shields.io/github/v/release/RayrenSX/Learnova?label=release)](https://github.com/RayrenSX/Learnova/releases/latest)
[![Build](https://github.com/RayrenSX/Learnova/actions/workflows/release.yml/badge.svg)](https://github.com/RayrenSX/Learnova/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Learnova 将课程导航、媒体与阅读辅助、题库及 AI 辅助，以及 Pintia 代码编辑与测试集中到网页内的工作台。安装一份合并脚本，即可在支持的网站加载对应模块。

[ScriptCat 合并版](https://scriptcat.org/zh-CN/script-show-page/8739) · [安装 Learnova](https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.user.js) · [Greasy Fork 学习通版](https://greasyfork.org/zh-CN/scripts/602230-learnova-for-chaoxing) · [Greasy Fork Pintia 版](https://greasyfork.org/zh-CN/scripts/602231-learnova-for-pintia) · [版本更新](https://github.com/RayrenSX/Learnova/releases) · [反馈问题](https://github.com/RayrenSX/Learnova/issues)

## 安装

1. 在浏览器中安装并启用用户脚本管理器，例如 ScriptCat 或 Tampermonkey。
2. 选择下面的一份脚本，打开链接后在管理器中确认安装。
3. 刷新学习通课程页或 Pintia 题目页，进入工作台设置，按需配置。

| 版本 | 适用范围 | 安装入口 |
| --- | --- | --- |
| **Learnova** | 学习通 + Pintia，推荐 | [GitHub](https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.user.js) |
| **Learnova for Pintia** | 仅 Pintia 代码工作台 | [GitHub](https://github.com/RayrenSX/Learnova/releases/latest/download/pintia-helper.user.js) |
| **Learnova for Chaoxing** | 仅学习通，Greasy Fork 版本 | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/602230-learnova-for-chaoxing) |
| **Learnova for Pintia** | 仅 Pintia，Greasy Fork 版本 | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/602231-learnova-for-pintia) |

每个站点只启用一份对应模块，避免出现两个工作台。Greasy Fork 因单脚本体积限制分别提供学习通版与 Pintia 版，可按需安装。脚本覆盖学习通相关域名、支持的阅读资源页，以及 `pintia.cn/problem-sets/*`。

[ScriptCat 合并版](https://scriptcat.org/zh-CN/script-show-page/8739)已公开发布，可直接安装。ScriptCat、Greasy Fork 与 GitHub 使用同一版本发布源。

**从旧 3.x / 1.x 版本迁移：** 本次更名并将版本统一为 `0.1.2`，首次需要手动安装，并停用旧脚本。脚本管理器按安装脚本隔离配置；如果原设置没有自动保留，请在新版中重新填写接口、密钥和题库配置。

## 可以做什么

### 学习通课程工作台

- **课程导航：** 识别章节目录，搜索、筛选未完成章节，定位当前章节，并保留原目录入口。
- **视频与音频：** 播放控制、倍速与静音、暂停恢复、连续任务处理，以及适配页面中的后台播放。任务推进以页面反馈为依据。
- **阅读：** 适配已识别的文档、PDF 和阅读框架，提供计时、滚动与逐页处理。
- **题目辅助：** 支持本地题库、外部题库和可配置的 AI；处理单选、多选、判断、填空、简答及部分组合题，提供匹配、填写与回读。
- **图片与复杂内容：** 包含加密字体解析、图片题处理，以及供支持相应消息格式的模型使用的音频输入。
- **作业与扩展任务：** 适配已识别的课后作业、直播等待、签到、讨论及部分附件、录音和编程控件；具体行为由独立设置控制。
- **结果核对：** 日志、答案记录、缓存、手动搜题、可选联网检索及多模型投票，便于查看结果来源与处理状态。

页面布局和平台控件可能变化。未识别到入口、无法确认保存结果或任务范围时，需要在原页面核对；检测到验证码时暂停，待人工处理后继续。

### Pintia 代码工作台

- 独立代码编辑器，支持语法高亮、行号、补全、查找、撤销重做、折行和全屏。
- 在已适配的页面中与平台编辑器同步，支持字号、分割比例、贴合网页与浮窗切换。
- 使用平台的“运行测试”查看编译日志、实际输出与可匹配的预期输出；运行测试无需 AI 密钥。
- “AI 分析”结合题目、当前代码和有效测试反馈解释错因，给出修正代码与修改说明。
- 按需应用修正、恢复原代码；切题、修改代码、切换语言或取消请求时，使旧分析失效。

Pintia 模块不点击正式提交。代码填写与平台测试分别处理；是否提交由用户在平台中决定。更详细的操作见 [Pintia 说明](pintia/README.md)。

## 按页面使用

| 页面 | 显示与入口 |
| --- | --- |
| 学习通空间页 | 课程队列 → 常用 → 设置；隐藏播放控制与媒体统计，读取已加载课程后勾选启动 |
| 学习通课程学习页 | 目录、常用、AI 聊天、设置、记录；课程队列和课后作业收在常用中 |
| Pintia 题目页 | 代码编辑器、平台测试、AI 分析及手动应用修正 |

题库统一在“设置 → AI / 题库 → 题库管理”，默认显示 OCS 配置，也可选择 ABC / N1、本地题库和缓存。答题相关开关默认关闭，播放相关开关默认开启；已有个人设置保留。

## 首次配置

### 资料、导出与复习

学习通首页新增“资料与复习工具”：Word/Markdown 试卷导出（含无答案版及只读分页）、课件原文件入口、跨课程待办与截止时间、AI 用量、资料总结、复习卡片及可关闭的原生粘贴辅助。Pintia 提供当前题与题目集 Markdown 导出。合并版另有智慧树、智慧职教和中国大学 MOOC 的基础手动工作台；完整路由与真实账号场景仍待验收。入口和源码参考见 [工具说明](docs/STUDY_TOOLS.md)。这些能力已随 0.1.4 发布。

### 课程队列、聊天和现成题库

- **课程队列：** 在学习通空间页打开“课程队列 → 读取空间课程”，或粘贴带 `courseid`、`clazzid` 的课程链接。勾选后开始，支持暂停、调整顺序、移除与重置。平台目录全部标记完成后才进入下一门；进度保存在脚本存储，刷新后继续，多个标签页使用运行租约避免重复调度。
- **AI 聊天：** 打开“AI 聊天”，复用 AI / 题库中保存的接口、模型和密钥；支持连续追问、停止回复和清空。会话仅保留在当前页面。
- **现成题库：** 在“设置 → AI / 题库 → 题库管理 → 在线题库”选择 ABC 或 N1，填入该服务的密钥保存。ABC 支持 HTTPS 节点 2 和原默认 HTTP 节点；节点切换保留该服务密钥。HTTP 节点明文传输密钥与题目，建议选择 HTTPS。服务由第三方运营，需要其有效授权及配额；本项目没有附送题库账号。
- **OCS 通用题库：** 在“AI / 题库 → 题库管理 → 在线题库 → 自定义 / OCS 题库”直接粘贴 OCS JSON 数组并保存，不限于 N1。依据 [OCS 官方格式](https://docs.ocsjs.com/docs/other/api) 适配 GET/POST、fetch/GM、json/text、占位符、handler 与 data.handler、判断/填空题型及答案分隔符。同请求配置自动去重，保留首个配置和优先级；不同密钥或解析方式分别保留。代码只在限时隔离环境运行，依赖页面、存储或额外网络的扩展代码不兼容。HTTP 服务会明文传输密钥和题目。
- **考试自动交卷：** 在答题设置中单独开启，同时开启考试处理和自动答题。识别完整题量且全部题目填写、回读核对后，才操作预览、交卷及对应确认。支持当前页与已识别的逐题页面；刷新和整卷预览通过同一考试的核对记录衔接。题量未知、答案未核对或页面未适配时停留人工处理。开关默认关闭。

这些功能按公开接口协议与平台页面控件实现，未复制 ABC 的专有脚本代码。真实课程布局和第三方题库授权仍需使用者自己的环境验证。

### 学习通

打开课程页后，在工作台设置中按需配置：

| 配置 | 用途 |
| --- | --- |
| 播放与阅读 | 选择播放、静音、暂停恢复和阅读处理方式 |
| AI 接口 | 填写 HTTPS 接口地址、模型名称与自己的 API 密钥，并测试连接 |
| 题库 | 导入本地题库，或配置外部题库地址和所需鉴权 |
| 答题策略 | 设置匹配门槛、查询间隔及需要启用的填写选项 |
| 作业与任务 | 分别选择作业保存、翻页、签到、讨论等操作 |

答题相关开关全部默认关闭，包括随机兜底、低信心比较、替换已有答案、图片识别、答案缓存、作业处理与考试处理，按需手动开启。视频播放、自动续播、后台播放、静音及自动切章默认开启。已保存的个人设置继续保留。AI 自报信心高于随机基准时，即使低于设置阈值也可能被采用；该比较不代表实际正确率。未知答案可能随机填写，需核对来源。章节自动提交默认关闭；课后作业的保存、翻页和提交有独立设置。考试自动交卷有独立开关，默认关闭。启用相关选项前，请核对页面和设置所指的操作。

### Pintia

先在工作台编辑代码并运行测试。需要 AI 辅助时，在“设置 → AI 服务”保存接口、模型和密钥，再点击“AI 分析”。核对结果后应用修正，或按需启用自动填写。学习通与 Pintia 分别保存 AI 配置。

题目、代码、图片或音频会在使用相应 AI 功能时发送到你配置的服务；题库查询会发送必要的查询内容。密钥保存在用户脚本管理器的配置中，更换接口域名后需要重新配置密钥。

## 版本与自动更新

两个站点的工作台标题栏均显示 **`v0.1.4`**。点击版本号，或打开脚本管理器菜单中的“检查 Learnova 更新”，即可手动检查。

- GitHub 版在顶层页面启动时，距离上次成功检查超过六小时会查询 GitHub 最新版本。
- 发现更高版本后，工作台显示“发现新版本”和“立即更新”链接；同一新版只发送一次桌面通知。
- 提示会保留在后续页面中，方便稍后安装。网络失败时可点击版本号重试。
- 安装脚本包含固定的 `.meta.js` 检查地址和 `.user.js` 下载地址，供管理器按其更新设置使用。

Greasy Fork 版保留站内更新渠道，使用该条目的原生安装链接，脚本内检查最多每 24 小时一次。两个发布渠道均显示版本号和新版提示。

更新提示不会自行安装代码。后续版本使用递增版本号；`0.1.2` 的首次迁移方法见上方安装说明。

## 当前验证范围

`0.1.4` 修复带相同 alt 文本的图片换题识别、题库配置变更后的缓存隔离，以及 AI 跨域最终响应的拒绝处理。旧版本缓存会重新查询；最终响应检查不保证管理器阻止了跳转请求本身。当前功能缺口与同类脚本对照见 [功能差距](docs/FEATURE_GAPS.md)。历史研究文档中的默认行为以本页当前说明为准。

`0.1.4` 的构建与语法检查已通过；更新检查专项测试覆盖版本比较、元信息、两个版本的安装链接、缓存、通知去重和失败处理。学习通完整隔离回归 **226/226**、Pintia **66/66** 通过，包含本次新增的 **6** 项修复回归。

这些结果来自隔离的模拟页面与请求，不代表所有真实课程、题型、AI 服务和平台布局均已验证。题库与 AI 返回内容仍需核对。

## 本地开发

需要 Node.js 与 npm。首次安装依赖并构建：

```sh
npm ci
npm ci --prefix pintia
npm run build
npm run build --prefix pintia
npm run build:greasyfork
npm run check
npm run check --prefix pintia
npm run test:update
npm run test:distribution
```

运行更广的隔离测试：

```sh
npm test
npm test --prefix pintia
```

浏览器测试需要 Playwright 的浏览器环境。Windows 测试默认使用 Edge；Linux 可先执行 `npx playwright install --with-deps chromium`。

| 路径 | 内容 |
| --- | --- |
| `src/` | 学习通模块、更新组件与合并脚本元信息 |
| `pintia/src/` | Pintia 编辑器、平台适配与 AI 分析 |
| `tools/`、`pintia/tools/` | 构建工具 |
| `tests/`、`pintia/tests/` | 隔离测试与页面夹具 |
| `dist/` | GitHub 合并版、独立版及 `greasyfork/` 下的站点版本发布文件 |

## 发布

GitHub Actions 在推送 `main` 时构建、检查并保存产物；推送与 `package.json` 版本匹配的 `v*` 标签时，发布 GitHub Release 和各版本的安装、元信息文件。根包版本是构建版本来源。

修改版本、更新说明、创建标签及脚本站同步方法见 [发布指南](PUBLISHING.md)。每次发布的具体变化见 [Releases](https://github.com/RayrenSX/Learnova/releases)。

## 许可与反馈

Learnova 使用 [MIT License](LICENSE)。包含的第三方字体解析、编辑器及适配代码保留各自许可，详见 [第三方声明](THIRD_PARTY_NOTICES.md) 与 [Pintia 第三方声明](pintia/THIRD_PARTY_NOTICES.md)。

反馈问题时，请提供脚本版本、浏览器与管理器版本、页面类型、复现步骤及已去除个人信息的错误日志。请勿在 Issue 中上传 API 密钥、账号凭据或完整私人课程数据。

### 页面与课程队列（0.1.4）

空间页只显示“课程队列 → 常用 → 设置”，隐藏播放统计和控制。读取空间中已加载的课程；文件夹内课程展开后再读取。新课程默认不勾选，原有选择与完成状态保留。课程学习页显示目录、常用、AI 聊天、设置与记录；课程队列和课后作业位于“常用”，课程页不能读取空间课程。队列支持进度、搜索、筛选和暂停后排序，继续时回到未完成的当前课程；页面切换失败后可重试。空间页与学习页分别记住当前选项卡。
