const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const version = require('../../package.json').version;
const metadata = `// ==UserScript==
// @name         Learnova for Pintia
// @namespace    local.pintia.code-helper
// @version      ${version}
// @homepageURL  https://github.com/RayrenSX/Learnova
// @supportURL   https://github.com/RayrenSX/Learnova/issues
// @updateURL    https://github.com/RayrenSX/Learnova/releases/latest/download/pintia-helper.meta.js
// @downloadURL  https://github.com/RayrenSX/Learnova/releases/latest/download/pintia-helper.user.js
// @description  根据题目诊断现有代码，解释错因并生成修正代码；独立填写适配，不提交答案。
// @author       Ray
// @license      MIT
// @match        https://pintia.cn/problem-sets/*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==
`;
const output = esbuild.buildSync({entryPoints: [path.join(root, 'src/main.cjs')], bundle: true,
  write: false, platform: 'browser', format: 'iife', charset: 'utf8', legalComments: 'inline'}).outputFiles[0].text;
const updater = esbuild.buildSync({entryPoints:[path.join(root,'../src/update.cjs')], bundle:true, write:false, platform:'browser', format:'iife', globalName:'StudyHelperUpdate'}).outputFiles[0].text;
const script = metadata + '\n' + updater + '\nStudyHelperUpdate.standalone = true;\n' + output;
fs.writeFileSync(path.join(root, 'Pintia代码助手.user.js'), script);
const dist = path.join(root, '../dist');
fs.mkdirSync(dist, {recursive:true});
fs.writeFileSync(path.join(dist, 'pintia-helper.user.js'), script);
fs.writeFileSync(path.join(dist, 'pintia-helper.meta.js'), metadata);
console.log('Built Pintia代码助手.user.js');
