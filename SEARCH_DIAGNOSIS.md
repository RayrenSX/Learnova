# 联网搜索诊断与修复 v3.6.11

## 已确认的根因

原 v3.6.8 使用油猴 `GM_xmlhttpRequest`，没有 OpenAI SDK。配置是 `https://www.fastaitoken.com/v1`、`gpt-5.6-terra`，密钥保存在油猴本机存储并绑定接口域名。请求最终发送到 `/chat/completions`，只有 `model`、`stream:false`、`messages`，没有搜索工具、独立搜索请求或结果传递。提示词要求联网并不能添加运行时能力。

原解析器读取模型 JSON 中的 `searched:true`，无法证明真实搜索。返回 false 会拒绝填写，返回虚假的 true 却可能被当成成功；这两种问题均由同一个错误假设导致。业务题型及答案匹配、取消请求机制不是此次根因。

## 服务能力证据与界限

- 2026-10-12 20:00:24–20:00:33 的 Edge 实测：Chat Completions 返回可解析 JSON，但没有布尔值 `searched:true`。这证明普通接口能响应，不证明工具可用。
- 历史 v3.6.5/3.6.6 真实记录曾收到 completed `web_search_call` 和来源网址，说明当时相同服务/模型路由执行过内置搜索；不能据此承诺当前稳定支持。
- 本轮 v3.6.9 初始修复在 Edge 使用已保存密钥执行最小 Responses 搜索探测：请求包含 `web_search`、指定工具选择和来源 include；服务返回 **HTTP 524**，程序状态为 `failed`，未取得有效工具记录或来源。HTTP 524 不能证明永久不支持工具，当前能力仍待服务恢复后验证。
- [FastAI 官网](https://www.fastaitoken.com/)及 [/docs](https://www.fastaitoken.com/docs)返回 HTTP 200，但可取得的公开页面和入口脚本没有明确说明该模型的 `web_search` 参数/支持范围。模型名是用户当前配置，不据此推断官方模型能力。
- 官方 OpenAI 文档 `developers.openai.com/api/docs/guides/tools-web-search` 和 `platform.openai.com/docs/guides/tools-web-search` 在本轮多种读取方式下连接失败/重置，未声称已成功读取当前官方内容。
- [Tavily Search 官方协议](https://docs.tavily.com/documentation/api-reference/endpoint/search)与 Markdown 版本已实际读取：`POST https://api.tavily.com/search`，Bearer 独立密钥，`query`、`max_results`、`search_depth`，结果含 `title`、`content`、`url` 等字段。用户随后配置了 Tavily Hub 兼容服务，真实验证结果如下。
- 用户最初填入 `https://tavily.sharyuke.com/api/mcp`，它是 MCP 地址，与普通搜索 JSON 不兼容。[该服务搜索接口文档](https://tavily.sharyuke.com/docs/search)实际说明 REST 路径为 `/api/proxy/search`，鉴权为 Bearer，Body 与 Tavily 一致，结果包装为 `code:0 → data.ok:true → data.data.results`。v3.6.10 增加严格包装校验，并仅对这个已有文档的同域服务把 MCP 地址修正成 REST 地址；其他 MCP 地址明确拒绝。
- 20:37:06：Edge 实际取得 6 条有效标题、摘要和网址，程序状态 succeeded。来源含网道 C 语言教程、菜鸟教程等；导出证据在 `test-results/live-independent-search-edge.json`，不含密钥。
- 20:42:01–20:43:09：真实独立搜索 → FastAI 当前模型 → JSON 解析完整链路成功，共约 68 秒，6 条实际来源。课程未填写或提交，不能以此宣称评分正确率已验证。

## 当前实现

保留原模型、普通 Chat Completions、视觉题、字体解码、题库、缓存与单选/多选匹配逻辑。联网模式不从缓存直接填写，失败不随机猜答，不自动重复修改提示词。

1. **内置 Responses**：发送真实 `web_search` 工具，必须有 completed 响应、completed search 动作以及有效来源/引用 URL。HTTP 200、模型自报和单独的 URL 均不够。缺少工具的响应记为本次 `unsupported`，本会话不再逐题反复请求；点击测试可重新探测。普通 HTTP 400 不武断当成工具不支持，仅标准工具错误标识或明确未实现时才分类。
2. **独立 Tavily**：由题干限定条件、选项和子题生成最多四个查询，各次真实 HTTP 请求返回有效标题、摘要、URL 后合并去重。搜索证据作为独立 user 消息送入原模型；系统指令明确它们是不可信数据。低相关性结果被过滤；证据不足、冲突或歧义要求返回空答案。搜索成功不代表模型判断必然正确。

程序状态为 `not_attempted / succeeded / no_results / failed / unsupported`；内部搜索元数据与模型答案分开。模型仍只输出 `{"answers":["B"],"confidence":0.95}`；searched 和搜索状态由程序执行结果产生。答题导出新增 search 元数据，原消费者继续读取 answers、confidence，仓库内没有依赖固定字段数量的消费者。日志不记录鉴权信息或原始服务错误正文。

内置模式一次模型请求；独立模式最多四次搜索请求和一次答题模型请求。搜索请求每次 30 秒，AI 请求联网时 180 秒；独立模式整题 330 秒，内置 210 秒，普通 90 秒。均保留独立计时、取消和迟到结果保护。

未解码字体无法可靠生成独立文本搜索词时明确停止，仍可使用内置视觉搜索或人工处理；普通带文字图片题可独立检索文字并将图片一并传给模型。独立查询超过四次或任一查询超过350字符时停止而不截断未核实子题，可以选择内置搜索或分题处理。

## 配置与复验

在助手“设置 → AI / 题库 → 联网搜索配置”选择方式并保存：

- 内置模式沿用 AI 接口地址、模型和原密钥。先点击“测试搜索能力”，再用“测试连接”检查联网答案格式；支持搜索不等于能正确输出答案。
- 独立模式填 `https://api.tavily.com/search` 和 **Tavily 搜索密钥**，或提供相同协议的兼容服务完整地址及对应密钥。用户当前服务填 `https://tavily.sharyuke.com/api/proxy/search`。搜索密钥与 AI 密钥各自管理、不互相复用、更换域名清除旧搜索密钥。保存后密码框清空，已保存密钥不回显。
- 默认采用内置模式；没有独立密钥时不会偷偷请求其他服务，也不会自动换模型。
- v3.6.11 收尾版本保留 v3.6.10 已验证的 Hub/模型链路，增加每次搜索请求的 HTTP 状态/时间诊断及查询范围检查，不会把超长查询或未覆盖子题截断后宣称核查完成。
- “导出搜索诊断”导出最后一次执行状态、工具调用标识、查询和来源，不含 API Key。查询/证据可能包含题目内容，分享前自行核对。

命令行可选实测：`node tools/probe-search.cjs`。环境变量 `CX_SEARCH_MODE=responses` 时使用 `CX_AI_BASE_URL`、`CX_AI_MODEL`、`CX_AI_API_KEY`；`CX_SEARCH_MODE=tavily` 时使用 `CX_SEARCH_URL`、`CX_SEARCH_API_KEY`。此工具不读取浏览器密钥，不输出密钥；未配置时记录 not_attempted，报告保存在被 Git 忽略的 test-results 内。

测试结果与真实验证边界见 REAL_TEST.md。独立搜索及原模型组合已通过真实连接测试；FastAI 内置搜索当前仅得到 HTTP 524，能力恢复与稳定性仍待服务端验证。
