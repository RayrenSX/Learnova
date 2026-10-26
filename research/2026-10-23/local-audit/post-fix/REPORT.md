# v3.7.1 修复结果与后续深入研究

上一轮的 **A01—A13 已逐项实施修复**。继续研究又发现并修复小数题干清理（B01）和浏览器页面缓存恢复（B02）两处问题。安装文件仍使用原学习通脚本名称和存储键，现有学习、随机、低信心、倍速与考试手动交卷选择保留。

本轮重构还把业务源码移到 src/chaoxing.js，构建读取独立元信息和源码，再生成两份相同安装文件；构建前的安装文件不再承担业务源码角色。同源子框架在依赖初始化前退出。[构建输入为独立源码](C:/Users/Ray/Documents/xuexitong/tools/build-full.cjs:23) 记录实际构建入口。

## 修复范围与实现

| 编号 | 状态 | 结果 | 当前源码 |
| --- | --- | --- | --- |
| A01 | 已修复 | 无效本地项/缓存继续尝试后续来源；有效答案冲突明确停止，避免落入随机。 | [来源有效性与回退](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:252) |
| A02 | 已修复 | 按配置优先级尽早选用可用题库并取消更后来源；最多两题查询重叠，填写仍按创建顺序。 | [题库保序返回](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:220)、[并发查询与顺序填写](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1153) |
| A03 | 已修复 | 隐藏类型码4保留简答语义，其他长文本不误用填空的低信心豁免。 | [语义题型](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:752) |
| A04 | 已修复 | 增加可见人脸遮罩、相关iframe和常见识别/认证文案检测；用户仍需人工完成验证。 | [人工验证检测](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1329) |
| A05 | 已修复 | 辅助document变化不再重置全局；旧题目document移除/隐藏时只取消所属查询。 | [章节及卡片身份](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:542)、[局部查询清理](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:557) |
| A06 | 已修复 | 提交区分requested、awaiting_ack、acknowledged、rejected、unknown；未知状态不自动重复提交，显式重试可恢复。 | [提交确认状态](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1232)、[人工重试恢复](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1816) |
| A07 | 已修复 | 导航15秒仍未生效时提示未确认，手动重试释放本次导航记录，不静默卡在“运行中”。 | [导航请求确认](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1420) |
| A08 | 已修复 | AI/题库配置和密钥改变时递增配置revision并中止旧请求；过期结果不得写入。 | [配置失效处理](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:548) |
| A09 | 已修复 | 新缓存包含schema、来源配置摘要、时间；最多复用30天，旧schema/过期/换来源结果不自动采用。 | [缓存版本与期限](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:157) |
| A10 | 已修复 | 编辑器回读保留词间空格和换行，兼容浏览器换行/NBSP/零宽字符。 | [文本回读校验](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:712) |
| A11 | 已修复 | 单选字母标签先NFKC规范化，全角Ｂ可以按标签匹配；仍校验字母与文本一致。 | [全角标签规范化](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1008) |
| A12 | 已修复 | 私用区及汉字扩展区参与字形校验，未知私用字形不再宣称完整；真实TTF夹具验证。 | [私用区与汉字字体检查](C:/Users/Ray/Documents/xuexitong/tools/font-codec.cjs:28) |
| A13 | 已修复 | 提交使用已加载必答题全集，包含隐藏题；过滤模板，识别到分页/总题量不完整时停止自动提交。 | [必答题范围与分页检查](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:651) |
| B01 | 继续研究时发现并修复 | 清理题号不再误删3.14或1.5的数字前缀。 | [小数题干保护](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:436) |
| B02 | 继续研究时发现并修复 | persisted pagehide/pageshow按缓存暂停/恢复；目录观察器不被永久销毁，原本暂停的用户状态不自动开启。 | [页面缓存恢复](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:2771) |

提交及导航的“恢复”并非不断重试点击。默认等平台标记；提交结果不明确时提示用户先核对，按显式“重试”操作解除未确认记录。确认成功的提交不重提，考试仍必须用户交卷。

缓存30天是当前实现的失效期限，不是正确性保证。仅复用可信来源及非低信心结果；来源摘要不明文复制URL中的查询鉴权字段到缓存导出。缓存身份摘要不是鉴权机制。

## 验证状态

最终安装文件 SHA-256：`5bf03ee404c9a3957a86e2245f8c64d8caee83b2ebae59fae66bb7379d134403`。两份文件逐字节一致。下表只把报告中的SHA与当前文件一致、且所有场景通过的运行标为 passed。

| 检查 | 状态 | 场景数 | 对应文件 |
| --- | --- | --- | --- |
| full | passed | 173/173 | 当前文件 |
| audit | passed | 17/17 | 当前文件 |
| pintia_combined | passed | 66/66 | 当前文件 |

补充检查：构建与两份语法检查通过；字体单元含真实TTF私用区映射/未知字形；搜索单元11/11及外部题库协议检查通过。学习通浏览器回归加载实际合并文件，Pintia也以合并文件运行完整套件。所有网站、AI和题库返回均在隔离环境模拟，没有真实账号或课程提交。

原缺陷复现保存在上一版的 observations.json；本次回归位于 tests/fixtures/audit-fixes.cjs、followup-fixes.cjs 和 tests/font-codec.cjs。重新研究的 [原始观察](../followup-observations.json) 与 [修复后复核](../followup-verification.json) 使用各自的文件哈希，不能把修复前复现说成当前缺陷。

REA对新业务源码解析1文件、26,522个AST节点、解析失败0；图仍为partial/truncated。见 [REA摘要](rea-summary.json)。结论由源码和执行回归交叉支持，REA图没有提供真实平台成功证据。

## 修复后仍值得继续改进的地方

### B03：独立搜索的复合题预算较小（已复现，P3）

[独立搜索预算](C:/Users/Ray/Documents/xuexitong/tools/web-search.cjs:41) 限制最多4个查询、每个350字符。共享题干加4个带标题子题会生成5个查询，因此在发送前返回 not_attempted。当前行为是明确拒绝，不会截掉后面的子题后伪装整题核查完成。

改进方向：把搜索预算按子题组织，允许“共享背景一次、每子题独立补查”，合并来源时保留每条证据覆盖哪个子题。先给每批设可取消的时间与请求上限，再讨论并发。验收要包括某一子题无结果、请求中取消，以及部分搜索成功时不能宣称整题已核查。

### B04：虚拟化或未暴露题量的页面还缺专门适配（已核对边界，P2）

[必答题范围与分页检查](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:651) 已修复“DOM中已有隐藏必答题却被漏掉”的问题，并处理已识别的分页与题量元数据。但若页面只在DOM挂载一题，且不暴露任何当前支持的题量字段或分页控件，通用DOM扫描仍无法证明服务器端共有多少题。

这是下一轮最值得补的适配层。应针对真实章节/作业路由采集**不含密钥和答案的**题号、总题量、分页及状态结构，形成题目范围adapter。不要再仅靠添加一个CSS选择器就声称所有分页布局都已支持。验收要从明确的题目ID全集出发，区分“当前页已写”“该作业全部已写”和“平台已确认”。

### B05：外链字体与变体字形仍会走视觉回退（源码确认的能力边界，P3）

[字体资源发现](C:/Users/Ray/Documents/xuexitong/tools/font-codec.cjs:7) 仍以内联base64字体和字形轮廓表为主；私用区的完整性判断已修好，但没有将OCS整套CSSOM资源发现、位图最近邻和Worker迁进来。未知字体会停止纯文本解码并走现有视觉路径，可能增加请求延迟和成本。

下一步应先统计实际课程中外链TTF/WOFF2、缺字、参考表未命中分别有多少，再决定加哪一种fallback。样本需要保留目标document身份、字体URL/哈希和未知字形数量；字体未就绪不能被当成空题或已解码。

### B06：视频弹题优先级可继续增强（源码发现，尚未完整动态复现，P2）

[视频弹题排队](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1725) 会把弹题放到下一次候选的首位；[查询并发上限](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1772) 同时限制最多两题在查。如果弹题出现时两个长查询槽都已占满，它仍需等待可用槽位，填写也受顺序队列约束。当前代码保证“下次调度优先”，没有保证“立即抢占”。

可考虑让视频弹题在独立的小队列中获得槽位，或取消尚未填写的普通题预取；但要避免反复抢占造成配额浪费。验收需要“正在查普通题→弹题出现→弹题处理→恢复普通题”完整过程，并测量等待时间，而不只是候选数组排序。

### B07：查询阶段的用户修改保护还可增加编辑版本（源码发现，尚未完整动态复现，P2）

[查询结果与输入快照检查](C:/Users/Ray/Documents/xuexitong/src/chaoxing.js:1191) 使用返回前的输入快照比较，填写期间也监听真实用户事件。这能保留多数手动修改。若用户在查询期间改动后又恢复到原文本/选择，快照会再次相同；学习通模块没有像Pintia编辑器那样的revision语义。

后续可在题目输入与编辑器所属document上记录可信编辑revision，只在该题用户实际操作时递增。写入前同时比较内容与revision，脚本自身写入应有独立标志。需要覆盖“编辑→撤销”“切换选项→改回”和用户只操作另一个题目的情况。

### B08：性能优化需要数据，而不是继续扩大并发（改进建议）

目前每800ms扫描任务，fresh检查又会收集document、判断人工验证并解析题目。两题预取已经降低部分网络串行等待，但继续增加并发可能加重DOM解析、请求额度和限流压力。建议先对collect、parseQuestion、字体检查和队列等待做有界耗时记录，再按题目document的变更局部刷新。真实媒体最小化、实际跨域阅读、完整图片/组合题评分仍需现场证据，隔离回归不能替代它们。

## 后续顺序

1. 优先补虚拟化/分页作业的题目范围adapter（B04），明确平台确认依据。
2. 实测视频弹题抢占和用户编辑revision（B06/B07），再决定调度改动。
3. 按实际课程样本扩展复合题搜索预算和字体fallback（B03/B05）。
4. 用测量结果安排局部DOM索引、模块进一步拆分和配置迁移。

这是完成一轮修复后再次审查的结果，不表示项目已经没有缺点。B03/B04有离线边界证据；B05/B06/B07分别是源码能力范围或待复现推断，不能合并成已经在真实课程发生的故障清单。
