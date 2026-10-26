# 来源和许可范围

v3.9.0 的任务适配、草稿保护与 OCS 隔离运行模块独立编写，未嵌入研究库的第三方业务引擎。用户自行导入的 handler 是其配置内容，不属于本项目附带源代码；研究库原始材料的许可范围仍独立保留。详见 [P1/P2 接入报告](research/2026-10-25/p1p2-integration/REPORT.md)。

v3.9.1 按用户允许直接复用成熟脚本逻辑的要求，`src/platform-tasks.cjs` 改编 OCS 的 `cx.ts searchJob` 任务匹配：iframe `data` → `jobid/_jobid` → `attachments`。来源为 [OCS 8b25a3f 的原文件](https://github.com/ocsjs/ocsjs/blob/8b25a3f44523a0d4b7373878488056f4aa478cf6/packages/scripts/src/projects/cx.ts#L1610)，版权为 Copyright (c) 2022 enncy，许可为 MIT。完整许可保存在 [vendor/ocs.LICENSE.txt](vendor/ocs.LICENSE.txt)，并通过构建的 `legalComments: inline` 保留在两份安装脚本中。改编增加损坏/重复元数据、跨域不可读和油猴页面环境处理。CodeMirror 6 模型读取则直接复用本项目已有 Pintia 适配，两个站点使用同一个模块。

其余本项目源码采用根目录 LICENSE 的 MIT 许可；所附第三方代码和数据遵循各自声明。构建不嵌入原 Easy 引擎或其依赖。用户导入的 handler 仍是配置内容；研究库快照不自动纳入安装文件。

v3.7.0 合并版还包含 Pintia 模块使用的 CodeMirror 6、官方语言包和 Lezer（MIT）。编辑器包与许可证说明见 [pintia/THIRD_PARTY_NOTICES.md](pintia/THIRD_PARTY_NOTICES.md) 及对应 npm 包 LICENSE。Pintia 源码和依赖锁文件仍保留在子目录，合并构建直接打包同一实现。

`vendor/Easy-1.1.3.source.txt` 是用户提供的参考脚本，作者 Aaron，未声明许可证。参考文件不属于本项目 MIT 授权范围，未向外发布。v3.0.x 曾使用原引擎，该实现已按用户要求从当前安装文件移除。

参考的公开项目和设计思路见 REFERENCES.md。开发用 Playwright 许可遵循其包内声明。

字体解码使用公开 MIT 库 typr-ts 1.1.5、blueimp-md5 2.19.0，构建打包其代码。字体映射数据来自 https://www.forestpolice.org/ttf/2.0/table.json （参考脚本指定的公开资源，2026-10-09 获取）；数据资源未声明许可，使用范围限本地验证，不将其纳入项目 MIT 授权。对应库许可证见 vendor 下的许可文件。
