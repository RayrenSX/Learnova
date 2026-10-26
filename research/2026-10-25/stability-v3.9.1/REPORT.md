# v3.9.1 稳定性修复与交付验证

日期：2026-10-25。继续使用已收集的 465 个 GitHub 快照和 99 份 Greasy Fork 脚本，以可直接安装使用、减少动态页面错误为目标，直接复用成熟适配逻辑。两份安装文件由同一构建生成，只安装其中一份即可；AI、题库和可选自动操作仍使用现有配置。

## 最终验证

学习通完整隔离回归 **220/220**，其中稳定性新增场景 **11/11**、P1/P2 **23/23**、课后作业 **13/13**。Pintia 合并安装包 **66/66**。字体、搜索 **11/11**、外部题库、native task 元数据单元检查、两份安装文件语法检查通过。重复构建保持相同字节，最终 SHA-256：

`2fdb339d5e06e13e866a723884dc9549c0e05a38b72c2b6363543af66387701e`

原始检查输出见 [preflight.json](preflight.json)，完整结果见 [full-suite.json](full-suite.json)、[pintia.json](pintia.json) 和 [status.json](status.json)。四个不重叠分组覆盖全部场景，聚合检查场景索引、名称、数量和相同安装文件哈希；所有结果对应最终文件。[source-hashes.json](source-hashes.json) 保留相关源码及来源快照哈希。

## 修复内容

| 问题 | 当前处理与验证 |
| --- | --- |
| 已完成任务与相邻任务混淆 | 改编 OCS 的 iframe data/jobid/_jobid/attachments 匹配，只认对应任务；损坏、重复、缺失或跨域不可读数据不会异常或误判完成。油猴顶层通过 unsafeWindow 读取页面任务数据 |
| 隐藏附件输入被漏掉或外层容器吞并题目 | 显示的上传区域可调用隐藏原生文件入口，多个独立题目保留独立工作台行；隔离文件选择器已实际触发 |
| 录音预览占用课程播放队列 | 排除录音/特殊作业媒体，普通课程视频继续播放 |
| 直播未开播仍被自动播放 | 等待开播时不入队；播放中转回等待时暂停并退出队列；开播后重新加入。异步 play 返回后也复核当前状态 |
| 编辑器模型替换后旧响应写错位置 | CodeMirror 5/6、Ace、Monaco 写入前检查当前模型；CM6 共用 Pintia 的完整状态读取，虚拟编辑器不用可见 DOM 片段替代模型 |
| 同节点换题或模型延迟挂载后卡住 | 程序题状态绑定完整题干和原生任务身份；换题取消旧操作并自动处理新题；未就绪编辑器进入等待，挂载后继续；保留人工输入保护 |
| 只读模型仍被写入 | Monaco 按平台 EditorOption/readOnly 读取配置，并在响应返回后复核；CM6 同时复核当前 content 节点和只读属性 |
| 过长题干拖停其他题目 | 身份指纹读取不受 AI 长度限制影响；只在生成时限制过长内容，失败不阻止正常题处理 |
| 听力备选格式重复发送 | 每个 audio 只取当前或可播放音源，解析绝对 URL 并去重；隔离验证一次材料下载和一个 input_audio |

## 直接复用与许可

OCS 来源为 [cx.ts searchJob](https://github.com/ocsjs/ocsjs/blob/8b25a3f44523a0d4b7373878488056f4aa478cf6/packages/scripts/src/projects/cx.ts#L1610)，研究快照提交 `8b25a3f44523a0d4b7373878488056f4aa478cf6`。改编文件为 `src/platform-tasks.cjs`，MIT 版权为 Copyright (c) 2022 enncy。完整许可保存在 [vendor/ocs.LICENSE.txt](../../../vendor/ocs.LICENSE.txt)，并保留在两份安装文件内。

本项目已有 Pintia 的 cmView 函数移入 `src/editor-models.cjs`，两个站点共用同一实现。来源说明已更新，不再把 v3.9.1 描述为全部独立编写。[THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md) 列出各代码、库和数据的许可范围。

## 使用与现场边界

将 [学习助手完整版.user.js](../../../学习助手完整版.user.js) 导入 Tampermonkey，停用重复脚本并刷新课程页。原名称、命名空间和配置存储沿用；程序题自动生成、签到/讨论发布及独立作业暂存/翻页/提交由各自开关控制。听力需要服务商支持音频输入，未知编辑器或播放器布局仍需适配。

按 ego-browser 技能重新检查真实浏览器空间，库存为 [空列表](browser-inventory.json)。本轮没有操作真实账号、上传材料、发布讨论、签到或交卷。隔离测试使用模拟页面、媒体和接口；Pintia 使用真实 CodeMirror 6 状态模型。当前真实全功能验收未完成，不能保证所有课程布局绝对无错。

## 复验

`node research/2026-10-25/stability-v3.9.1/preflight.cjs` 检查构建、语法、单元与可重复性。

`node tests/audit-suite.cjs` 运行完整学习通隔离回归；`CX_TEST_FILTER=稳定性：` 可运行新增场景子集。Pintia 在其目录设置 `PINTIA_TEST_SCRIPT` 指向根目录合并文件后运行 `node tests/run.cjs`。随后运行本目录 `finalize.cjs` 汇总；哈希、覆盖或版本不符时会拒绝生成通过状态。
