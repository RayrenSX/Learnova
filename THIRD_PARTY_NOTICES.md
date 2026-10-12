# 来源和许可范围

当前两份用户脚本、构建工具和测试为独立编写，采用根目录 LICENSE 的 MIT 许可。构建不嵌入原 Easy 引擎或其依赖。

`vendor/Easy-1.1.3.source.txt` 是用户提供的参考脚本，作者 Aaron，未声明许可证。参考文件不属于本项目 MIT 授权范围，未向外发布。v3.0.x 曾使用原引擎，该实现已按用户要求从当前安装文件移除。

参考的公开项目和设计思路见 REFERENCES.md。开发用 Playwright 许可遵循其包内声明。

字体解码使用公开 MIT 库 typr-ts 1.1.5、blueimp-md5 2.19.0，构建打包其代码。字体映射数据来自 https://www.forestpolice.org/ttf/2.0/table.json （参考脚本指定的公开资源，2026-10-09 获取）；数据资源未声明许可，使用范围限本地验证，不将其纳入项目 MIT 授权。对应库许可证见 vendor 下的许可文件。
