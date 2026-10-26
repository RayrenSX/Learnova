# Learnova

**学习通与 Pintia 的学习工作台 · 当前版本 0.1.3**

[![Release](https://img.shields.io/github/v/release/RayrenSX/Learnova?label=release)](https://github.com/RayrenSX/Learnova/releases/latest)
[![Build](https://github.com/RayrenSX/Learnova/actions/workflows/release.yml/badge.svg)](https://github.com/RayrenSX/Learnova/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Learnova 将课程导航、媒体与阅读辅助、题库及 AI 辅助，以及 Pintia 代码编辑与测试集中到网页内的工作台。安装一份合并脚本，即可在支持的网站加载对应模块。

[安装 Learnova](https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.user.js) · [Greasy Fork 学习通版](https://greasyfork.org/zh-CN/scripts/602230-learnova-for-chaoxing) · [Greasy Fork Pintia 版](https://greasyfork.org/zh-CN/scripts/602231-learnova-for-pintia) · [版本更新](https://github.com/RayrenSX/Learnova/releases) · [反馈问题](https://github.com/RayrenSX/Learnova/issues)

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

[ScriptCat 合并版条目](https://scriptcat.org/zh-CN/script-show-page/8739)已提交，当前处于平台审核中，普通用户暂时无法下载；可先通过上方已开放的入口安装。

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

## 首次配置

### 学习通

打开课程页后，在工作台设置中按需配置：

| 配置 | 用途 |
| --- | --- |
| 播放与阅读 | 选择播放、静音、暂停恢复和阅读处理方式 |
| AI 接口 | 填写 HTTPS 接口地址、模型名称与自己的 API 密钥，并测试连接 |
| 题库 | 导入本地题库，或配置外部题库地址和所需鉴权 |
| 答题策略 | 设置匹配门槛、查询间隔及需要启用的填写选项 |
| 作业与任务 | 分别选择作业保存、翻页、签到、讨论等操作 |

自动答题默认关闭。开启后，随机兜底、低信心与随机基准比较、替换已有答案默认开启，可分别在设置中关闭。AI 自报信心高于随机基准时，即使低于设置阈值也可能被采用；该比较不代表实际正确率。未知答案可能随机填写，需核对来源。章节自动提交默认关闭；课后作业的保存、翻页和提交有独立设置。考试交卷需要人工完成。启用相关选项前，请核对页面和设置所指的操作。

### Pintia

先在工作台编辑代码并运行测试。需要 AI 辅助时，在“设置 → AI 服务”保存接口、模型和密钥，再点击“AI 分析”。核对结果后应用修正，或按需启用自动填写。学习通与 Pintia 分别保存 AI 配置。

题目、代码、图片或音频会在使用相应 AI 功能时发送到你配置的服务；题库查询会发送必要的查询内容。密钥保存在用户脚本管理器的配置中，更换接口域名后需要重新配置密钥。

## 版本与自动更新

两个站点的工作台标题栏均显示 **`v0.1.3`**。点击版本号，或打开脚本管理器菜单中的“检查 Learnova 更新”，即可手动检查。

- GitHub 版在顶层页面启动时，距离上次成功检查超过六小时会查询 GitHub 最新版本。
- 发现更高版本后，工作台显示“发现新版本”和“立即更新”链接；同一新版只发送一次桌面通知。
- 提示会保留在后续页面中，方便稍后安装。网络失败时可点击版本号重试。
- 安装脚本包含固定的 `.meta.js` 检查地址和 `.user.js` 下载地址，供管理器按其更新设置使用。

Greasy Fork 版保留站内更新渠道，使用该条目的原生安装链接，脚本内检查最多每 24 小时一次。两个发布渠道均显示版本号和新版提示。

更新提示不会自行安装代码。后续版本使用递增版本号；`0.1.2` 的首次迁移方法见上方安装说明。

## 当前验证范围

`0.1.3` 修复带相同 alt 文本的图片换题识别、题库配置变更后的缓存隔离，以及 AI 跨域最终响应的拒绝处理。旧版本缓存会重新查询；最终响应检查不保证管理器阻止了跳转请求本身。当前功能缺口与同类脚本对照见 [功能差距](docs/FEATURE_GAPS.md)。历史研究文档中的默认行为以本页当前说明为准。

`0.1.3` 的构建与语法检查已通过；更新检查专项测试覆盖版本比较、元信息、两个版本的安装链接、缓存、通知去重和失败处理。学习通完整隔离回归 **226/226**、Pintia **66/66** 通过，包含本次新增的 **6** 项修复回归。

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
