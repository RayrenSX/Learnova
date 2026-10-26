# 第三方组件

助手内独立编辑器使用 [CodeMirror 6](https://codemirror.net/) 及官方语言包，采用 MIT 许可证，版权归 Marijn Haverbeke 与各包贡献者所有。涉及 `codemirror`、`@codemirror/state`、`view`、`commands`、`language`、`autocomplete`、`search`、`lint` 以及 C/C++、Python、Java、JavaScript/TypeScript、Rust 和 Go 语言包；语言解析依赖 Lezer（MIT）。详细版权与许可证见相应 npm 包中的 LICENSE 文件。

构建使用 esbuild（MIT），隔离验证使用 Playwright（Apache-2.0）。它们仅作为开发依赖。依赖版本由本目录 `package-lock.json` 锁定。个人 API 密钥不打包进安装文件。
