# 参考项目与采用方式

研究日期：2026-10-09。当前两份安装文件均为同一独立实现。用户要求只参考功能而非照抄后，已移除 v3.0.x 原引擎。下文版本对照为历史调查记录，不代表当前代码。来源和许可范围见 THIRD_PARTY_NOTICES.md。

| 来源 | 实际查看内容 | 本项目采用的思路 |
| --- | --- | --- |
| 用户提供的 Easy 网课学习助手 1.1.3 | 章节媒体处理、`parseQuestion` / `parseOptions`、视频弹题控制器、富文本输入及提交函数 | `.TiMu`、`.Zy_TItle .fontLabel`、`.Zy_ulTop li`、`.ans-videoquiz`、`.num_option`、`.num_option_dx` 等选择器；填写后验证；暂停取消；视频反馈后继续 |
| [DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy) | README 及用户脚本公开源码的配置、持久化、等待 iframe 和媒体模块 | 同源 iframe 递归、可配置自动连播、面板设置持久化；AI 和播放分别配置 |
| [EOOrte/chaoxing-auto-study](https://github.com/EOOrte/chaoxing-auto-study) | README 及 `学习通一键刷课-all-in-one.user.js` 的媒体、题目提取和跨域请求代码（通过 GitHub / jsDelivr 获取） | OpenAI 兼容服务；`GM_xmlhttpRequest` 访问自定义接口；题目 DOM 提取；无 type 的文本 input；新版 `.blankItemDiv` 与 iframe 编辑器 |
| [ocsjs/ocsjs](https://github.com/ocsjs/ocsjs) | README 和 `cdn/chaoxing/sk-main.js` 的 `MediaUtils` 播放实现（通过 jsDelivr 获取） | 比较旧版媒体事件处理；其暂停后立即强制播放、每秒设置倍速的逻辑未采用 |

与常见实现的取舍：默认 1x 倍速；先查本地题库，再请求配置的 AI；默认仅填写，提交可开启；不会用“随便选一个”处理未知答案。信心阈值为模型自评，不能当作正确率。

GitHub API 曾出现未认证请求限流，部分 Git/raw 连接重置。EOOrte 源码后来通过 jsDelivr 成功读取；这一网络限制不影响本地脚本安装和隔离测试。

## 操作异常排查：实际源码对照

以下行号对应 2026-10-09 读取的 main 分支源码；分支后续更新可能改变行号。只描述源码行为，不把项目 README 的风险或稳定性宣传当成平台验证结果。

| 来源与源码位置 | 播放行为 | 本项目 v2.1.2 的处理 |
| --- | --- | --- |
| 用户贴的 Easy，约 3890–4005 行 `handleMedia` | 设置倍速一次，配置变化时更新；`pause` 事件延迟 1 秒重试，400ms 定时检查；iframe 失效时清理 | 借鉴初始化/设置变化更新和生命周期清理；未知暂停不定时重试 |
| [DaRin 的视频任务](https://github.com/DaRin1403/xuexitong-autostudy/blob/main/学习通刷课助手.user.js)，约 1022–1078 行 | 使用 video.js 对象设置倍速/启动；每 2 秒检查弹题，仍暂停就再次 `play()` | 保留正常媒体事件和弹题继续；未发现可证明其避免验证码的依据 |
| [EOOrte 的播放器循环](https://github.com/EOOrte/chaoxing-auto-study/blob/main/学习通一键刷课-all-in-one.user.js)，约 245–281 行 | 每 2 秒设置倍速、点击大播放按钮，暂停时 `play()`；约 74–77 行修改页面可见性属性 | 不采用可见性伪装或强制恢复；隐藏页面不新启动播放 |
| [OCS 仓库的旧版模块](https://github.com/ocsjs/ocsjs/blob/main/cdn/chaoxing/sk-main.js#L629)，约 629–651 行 | 每秒设置静音和倍速，`pause` 时立即 `play()` | 不采用该重试策略；不将此旧文件等同于 OCS 所有版本 |

原实现的实际问题是每两秒尝试恢复未知暂停、每次扫描强制覆盖倍速，以及任意参与扫描的 iframe 变化都会清空媒体记录并暂停播放。v2.1.2 分别改为明确等待手动继续、只在设置变化时应用、保留原媒体记录。无关 iframe 变化也不再清除“已点击下一章”标志，避免重复导航。

`[9010]` 确认平台判定操作异常，但没有当时的服务端日志或请求记录，无法证明具体触发项。这次对照不是验证码绕过方案，也不承诺修改后一定不再触发验证。

## 后续需求变更

用户随后明确要求恢复普通暂停、失焦及最小化播放，并要求原脚本的全部功能。v2.2.0 因此增加可配置后台适配和延迟恢复；上表的“未采用”描述是 v2.1.2 的历史状态。v3.0.0 完整版直接保留 Easy 的原题型、文档、字体和全部平台适配，变更清单由构建工具输出。后台处理参考 EOOrte 可见性思路，同时加入同源 iframe 覆盖、停止时撤销和验证码暂停。

## 当前字体文字提取实现（v3.1.3）

参考脚本的 decrypt 在题目提取前读取内联 Base64 字体，用字形轮廓 JSON 的 MD5 后 8 位查询公开表，再读取题干和选项。当前 tools/font-codec.cjs 独立编写这一适配流程，只遍历实际题目中的字符并缓存映射，翻译文本副本而非替换页面 innerHTML。字体解析和哈希使用公开 MIT 包，未复制参考脚本的业务引擎。字体表来源为参考脚本声明的公开资源；未知字形不会转换为空字符，也不会被当作已解码。

## v3.2.0 综合适配（2026-10-10）

读取 OCS 主分支 `84be4cbf09181d697b15d83d8f0b8a7a2f11a788` 的 `projects/cx.ts`、`projects/common.ts`、题库与子题模块，参考公开页面结构 `#pagejump`、`readweb`、Swiper、`.line_answer_ct .selectBox`、`.thirdUlList .dept_select`、`.reading_answer`、`.filling_answer`，以及多题库/缓存的功能划分。实现使用独立代码和回读验证，未复制 OCS 引擎、执行其配置函数或调用其完成上报逻辑。Easy 参考文件当前不在工作区，本轮沿用此前已记录的题目、编辑器与提交适配思路，没有声称重新读取该文件。
