// 同一独立实现；仅打包公开字体库与映射数据，不读取参考脚本。
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const bundle = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'font-codec.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', globalName: 'CXFontCodec', minify: true, legalComments: 'inline' }).outputFiles[0].text;
const file = path.join(root, '学习通学习助手.user.js');
let source = fs.readFileSync(file, 'utf8');
source = source.replace(/\/\/ FONT_CODEC_BEGIN[\s\S]*?\/\/ FONT_CODEC_END/, `// FONT_CODEC_BEGIN\n${bundle}\n// FONT_CODEC_END`);
fs.writeFileSync(file, source);
fs.writeFileSync(path.join(root, '学习助手完整版.user.js'), source);
console.log('Built independent userscript');
