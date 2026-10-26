const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {buildSync} = require('esbuild');
const {newer, VERSION} = require('../src/update.cjs');
const fs = require('node:fs');
assert.equal(VERSION, require('../package.json').version);
for (const [remote, local, result] of [
  ['0.1.3', '0.1.2', true], ['0.10.0', '0.9.9', true],
  ['1.0.0', '0.99.99', true], ['0.1.2', '0.1.2', false],
  ['0.1.1', '0.1.2', false], ['oops', '0.1.2', false], ['0.1.3-beta', '0.1.2', false]
]) assert.equal(newer(remote, local), result);
for (const name of ['study-helper', 'pintia-helper']) {
  const script = fs.readFileSync(`dist/${name}.user.js`, 'utf8');
  const meta = fs.readFileSync(`dist/${name}.meta.js`, 'utf8');
  assert.ok(script.startsWith(meta.trim()));
  assert.equal(meta.match(/@version\s+(\S+)/)[1], VERSION);
  assert.ok(meta.includes(`https://github.com/RayrenSX/Learnova/releases/latest/download/${name}.meta.js`));
}
const code = buildSync({entryPoints:['src/update.cjs'], bundle:true, write:false, platform:'browser', format:'iife', globalName:'StudyHelperUpdate'}).outputFiles[0].text;
const gfCode = buildSync({entryPoints:['src/update.cjs'], bundle:true, write:false, platform:'browser', format:'iife', globalName:'StudyHelperUpdate', define:{LEARNOVA_DISTRIBUTION:JSON.stringify('greasyfork')}}).outputFiles[0].text;
(async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? {channel:'msedge'} : {});
  try {
    const page = await browser.newPage();
    const nextVersion = VERSION.replace(/\d+$/, value => String(Number(value) + 1));
    async function setup(response, standalone = false, store = {}, greasyFork = false, nativeInfo = true) {
      if (response && typeof response === 'object') response = {...response, responseText: response.responseText.replace('0.1.3', nextVersion).replace('0.1.2', VERSION)};
      await page.setContent('<div id="host"></div>');
      await page.evaluate(({code, response, standalone, store, nativeInfo}) => {
        window.values = store; window.notifications = []; window.requests = [];
        window.GM_getValue = (key, fallback) => window.values[key] ?? fallback;
        window.GM_setValue = (key, value) => { window.values[key] = value; };
        window.GM_notification = options => window.notifications.push(options);
        window.GM_registerMenuCommand = () => {};
        window.GM_info = nativeInfo ? {script:{downloadURL:'https://update.greasyfork.org/scripts/123456/Learnova.user.js'}} : {};
        window.GM_xmlhttpRequest = options => {
          window.requests.push(options.url);
          queueMicrotask(() => response === 'timeout' ? options.ontimeout() : options.onload(response));
        };
        (0, eval)(code);
        const root = document.getElementById('host').attachShadow({mode:'open'});
        root.innerHTML = '<header><strong>Learnova</strong><button>−</button></header>';
        StudyHelperUpdate.mount(root, standalone);
        StudyHelperUpdate.mount(root, standalone);
      }, {code:greasyFork ? gfCode : code, response, standalone, store, nativeInfo});
      await page.waitForTimeout(20);
    }
    await setup({status:200, responseText:'// @version 0.1.3'});
    assert.equal(await page.locator('[data-study-update]').count(), 1);
    assert.ok((await page.locator('[role=status]').innerText()).includes('发现新版本 v' + nextVersion));
    assert.equal(await page.locator('a').getAttribute('href'), 'https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.user.js');
    assert.equal(await page.evaluate(() => notifications.length), 1);
    const cached = await page.evaluate(() => values);
    await setup({status:200,responseText:'// @version 0.1.3'}, false, cached);
    assert.equal(await page.evaluate(() => requests.length), 0);
    assert.equal(await page.locator('[role=status]').isVisible(), true);
    await page.locator('[data-study-update]').click();
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => notifications.length), 0);
    await setup({status:200,responseText:'// @version 0.1.3'}, true);
    assert.match(await page.locator('a').getAttribute('href'), /pintia-helper.user.js$/);
    await setup({status:200,responseText:'// @version 0.1.2'});
    await page.locator('[data-study-update]').click();
    await page.waitForTimeout(20);
    assert.match(await page.locator('[role=status]').innerText(), /当前已是最新版本/);
    for (const response of [{status:404,responseText:''}, {status:200,responseText:'invalid'}, 'timeout']) {
      await setup(response);
      assert.equal(await page.locator('[role=status]').isVisible(), false);
      await page.locator('[data-study-update]').click();
      await page.waitForTimeout(20);
      assert.match(await page.locator('[role=status]').innerText(), /重试/);
      assert.equal(await page.locator('a').count(), 0);
    }
    await setup({status:200,responseText:'// @version 0.1.3'}, false, {}, true);
    assert.equal(await page.locator('a').getAttribute('href'), 'https://update.greasyfork.org/scripts/123456/Learnova.user.js');
    assert.match(await page.evaluate(() => requests[0]), /^https:\/\/update\.greasyfork\.org\/scripts\/123456\/Learnova\.meta\.js\?/);
    const gfCached = await page.evaluate(() => values);
    gfCached['study-helper.update.greasyfork.study-helper.checked'] = Date.now() - 12 * 60 * 60 * 1000;
    await setup({status:200,responseText:'// @version 0.1.3'}, false, gfCached, true);
    await page.locator('[data-study-update]').click();
    assert.equal(await page.evaluate(() => requests.length), 0, 'Greasy Fork checks at most once per 24h, including manual checks');
    gfCached['study-helper.update.greasyfork.study-helper.checked'] = Date.now() - 25 * 60 * 60 * 1000;
    await setup({status:200,responseText:'// @version 0.1.3'}, false, gfCached, true);
    assert.equal(await page.evaluate(() => requests.length), 1);
    await setup({status:200,responseText:'// @version 0.1.3'}, false, {}, true, false);
    await page.locator('[data-study-update]').click();
    assert.equal(await page.evaluate(() => requests.length), 0);
    assert.match(await page.locator('[role=status]').innerText(), /脚本管理器检查/);
    console.log('PASS update comparison, metadata, both install links, duplicate mount, cache, notification deduplication, manual check, malformed response and timeout');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
