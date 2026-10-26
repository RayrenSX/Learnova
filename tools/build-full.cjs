// 一个安装文件，按站点启动学习通或 Pintia；保留学习通的用户脚本身份。
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..');
const packageInfo = require('../package.json');
const greasyFork = process.env.LEARNOVA_TARGET === 'greasyfork';
const minify = !greasyFork;
const updateBundle = esbuild.buildSync({entryPoints:[path.join(root, 'src/update.cjs')], bundle:true, write:false, platform:'browser', format:'iife', globalName:'StudyHelperUpdate', define:{LEARNOVA_DISTRIBUTION:JSON.stringify(greasyFork ? 'greasyfork' : 'github')}}).outputFiles[0].text;
const bundle = esbuild.buildSync({ entryPoints: [path.join(__dirname, 'font-codec.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', globalName: 'CXFontCodec', minify, legalComments: 'inline' }).outputFiles[0].text;
const file = path.join(root, '学习通学习助手.user.js');
let source = fs.readFileSync(path.join(root, 'src/userscript.metadata.txt'), 'utf8');
const metadataMatch = source.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==/);
if (!metadataMatch) throw new Error('学习通脚本缺少用户脚本元信息');
let metadata = metadataMatch[0].replace(/\r\n/g, '\n')
  .replace(/(\/\/ @version\s+)\S+/, (_, prefix) => `${prefix}${packageInfo.version}`)
  .replace(/\/\/ @description[^\n]*/, '// @description  学习通视频音频连播、阅读与答题；Pintia 独立代码编辑、平台测试、AI 纠错与填写。按网站自动加载。');
if (!metadata.includes('// @match        https://pintia.cn/problem-sets/*')) {
  metadata = metadata.replace('// @run-at', '// @match        https://pintia.cn/problem-sets/*\n// @run-at');
}
// 学习通跨域阅读框架需要注入；Pintia 自己在入口排除 iframe。
metadata = metadata.replace(/^\/\/ @noframes[^\n]*\n/gm, '');
if (greasyFork) {
  metadata = metadata.replace(/\/\/ @name[^\n]*/, '// @name         Learnova for Chaoxing')
    .replace(/^\/\/ @(?:updateURL|downloadURL)[^\n]*\n/gm, '')
    .replace(/^\/\/ @match[^\n]*pintia[^\n]*\n/gm, '')
    .replace(/\/\/ @description[^\n]*/, '// @description  学习通课程目录、视频音频播放、阅读、题库与可配置 AI 辅助。');
  metadata = metadata.replace('// @grant        unsafeWindow', '// @grant        GM_info\n// @grant        unsafeWindow');
}
const begin = '// CHAOXING_MODULE_BEGIN';
const end = '// CHAOXING_MODULE_END';
source = fs.readFileSync(path.join(root, 'src/chaoxing.js'), 'utf8').trim();
for (const name of ['FONT_CODEC', 'WEB_SEARCH', 'EXTERNAL_BANK', 'HOMEWORK', 'TASKS', 'DRAFT_GUARD', 'AUXILIARY', 'OCS_RUNTIME']) {
  if (!source.includes(`// ${name}_BEGIN`) || !source.includes(`// ${name}_END`)) {
    throw new Error(`学习通源码缺少 ${name} 构建标记`);
  }
}
source = source.replace(/\/\/ FONT_CODEC_BEGIN[\s\S]*?\/\/ FONT_CODEC_END/, `// FONT_CODEC_BEGIN\n${bundle}\n// FONT_CODEC_END`);
const searchBundle = esbuild.buildSync({ entryPoints: [path.join(__dirname, 'web-search.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', globalName: 'CXWebSearch', minify }).outputFiles[0].text;
source = source.replace(/\/\/ WEB_SEARCH_BEGIN[\s\S]*?\/\/ WEB_SEARCH_END/, `// WEB_SEARCH_BEGIN\n${searchBundle}\n// WEB_SEARCH_END`);
const bankBundle = esbuild.buildSync({ entryPoints: [path.join(__dirname, 'external-bank.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', globalName: 'CXExternalBank', minify }).outputFiles[0].text;
source = source.replace(/\/\/ EXTERNAL_BANK_BEGIN[\s\S]*?\/\/ EXTERNAL_BANK_END/, `// EXTERNAL_BANK_BEGIN\n${bankBundle}\n// EXTERNAL_BANK_END`);
const homeworkBundle = esbuild.buildSync({entryPoints: [path.join(root, 'src/homework.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', globalName: 'CXHomework', minify}).outputFiles[0].text;
const taskBundle = esbuild.buildSync({entryPoints: [path.join(root, 'src/task-adapters.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', globalName: 'CXTasks', minify, legalComments:'inline'}).outputFiles[0].text;
source = source.replace(/\/\/ HOMEWORK_BEGIN[\s\S]*?\/\/ HOMEWORK_END/, `// HOMEWORK_BEGIN\n${homeworkBundle}\n// HOMEWORK_END`);
source = source.replace(/\/\/ TASKS_BEGIN[\s\S]*?\/\/ TASKS_END/, `// TASKS_BEGIN\n${taskBundle}\n// TASKS_END`);
const draftBundle = esbuild.buildSync({entryPoints: [path.join(root, 'src/draft-guard.cjs')], bundle: true,
  write: false, platform:'browser', format:'iife', globalName:'CXDraftGuard', minify}).outputFiles[0].text;
source = source.replace(/\/\/ DRAFT_GUARD_BEGIN[\s\S]*?\/\/ DRAFT_GUARD_END/, `// DRAFT_GUARD_BEGIN\n${draftBundle}\n// DRAFT_GUARD_END`);
source = source.replace(/\/\/ AUXILIARY_BEGIN[\s\S]*?\/\/ AUXILIARY_END/, () => '// AUXILIARY_BEGIN\n' + fs.readFileSync(path.join(root,'src/auxiliary.js'),'utf8') + '\n// AUXILIARY_END');
const ocsBundle = esbuild.buildSync({entryPoints:[path.join(__dirname,'ocs-runtime.cjs')],bundle:true,write:false,platform:'browser',format:'iife',globalName:'CXOCSRuntime',minify}).outputFiles[0].text;
source = source.replace(/\/\/ OCS_RUNTIME_BEGIN[\s\S]*?\/\/ OCS_RUNTIME_END/, () => '// OCS_RUNTIME_BEGIN\n'+ocsBundle+'\n// OCS_RUNTIME_END');
const pintiaBundle = greasyFork ? '' : esbuild.buildSync({entryPoints: [path.join(root, 'pintia/src/main.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', charset: 'utf8', legalComments: 'inline'}).outputFiles[0].text;
const output = `${metadata}

(() => {
  'use strict';
${updateBundle}
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname;
  const chaoxing = /(^|\\.)chaoxing\\.com$/.test(hostname) ||
    ((/(^|\\.)(sslibrary|xuexi365)\\.com$/.test(hostname)) && /^\\/readsvr\\/book\\/mooc/.test(pathname));
  if (chaoxing) {
    // 同源子框架由顶层扫描，在依赖初始化前退出。
    if (window !== window.top) { try { if (window.top.document) return; } catch {} }
    if (document.getElementById('cx-video-helper-host')) return;
${begin}
${source}
${end}
  } else if (hostname === 'pintia.cn' && pathname.startsWith('/problem-sets/')) {
    if (window.top !== window.self || document.getElementById('pintia-code-helper')) return;
// PINTIA_MODULE_BEGIN
${pintiaBundle}
// PINTIA_MODULE_END
  }
})();
`;
if (!greasyFork) {
  fs.writeFileSync(file, output);
  fs.writeFileSync(path.join(root, '学习助手完整版.user.js'), output);
}
const dist = path.join(root, greasyFork ? 'dist/greasyfork' : 'dist');
fs.mkdirSync(dist, {recursive:true});
const asset = greasyFork ? 'learnova-chaoxing' : 'study-helper';
if (greasyFork && Buffer.byteLength(output) >= 2 * 1024 * 1024) throw new Error('Greasy Fork edition exceeds 2 MiB');
fs.writeFileSync(path.join(dist, asset + '.user.js'), output);
fs.writeFileSync(path.join(dist, asset + '.meta.js'), metadata + '\n');
console.log(`Built ${greasyFork ? 'Greasy Fork Chaoxing edition' : 'combined userscript'} v${packageInfo.version}`);
