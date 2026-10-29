const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ueditorFixture = require('./fixtures/ueditor.cjs');
const catalogFixture = require('./fixtures/catalog.cjs');
const cloudReaderFixture = require('./fixtures/cloud-reader.cjs');
const script = fs.readFileSync(process.env.CX_TEST_SCRIPT || path.join(__dirname, '..', '学习通学习助手.user.js'), 'utf8');
const BASE = 'https://mooc1.chaoxing.com';
const URL = BASE + '/mycourse/studentstudy?knowledgeId=1';
const STORE = 'cxVideoHelper.settings.v1';
const bankKey = 'cxHelper.bank.v2';
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const choice = (id, title, options, type = '单选题') => `<div class="TiMu" data-id="${id}">
  <div class="Zy_TItle"><span class="newZy_TItle">【${type}】</span><div class="fontLabel">${title}</div></div>
  <ul class="Zy_ulTop">${options.map((option, i) => `<li><label><input type="${type === '多选题' ? 'checkbox' : 'radio'}" name="q${id}" value="${String.fromCharCode(65 + i)}"><span class="after">${option}</span></label></li>`).join('')}</ul></div>`;
const blank = (id, title, count = 1, type = '填空题') => `<div class="TiMu" data-id="${id}"><div class="newZy_TItle">【${type}】</div><div class="Zy_TItle"><div class="fontLabel">${title}</div></div>${Array.from({ length: count }, (_, i) => `<textarea id="ans${id}_${i}"></textarea>`).join('')}</div>`;
const popup = `<div class="ans-videoquiz"><div class="ans-videoquiz-des">1 + 1 = ?</div><div class="ans-videoquiz-opt">
<label><input type="radio" name="popup" value="a">1</label><label><input type="radio" name="popup" value="b">2</label></div>
<button id="videoquiz-submit" onclick="this.hidden=true;document.getElementById('spanHas').hidden=false;document.getElementById('videoquiz-continue').hidden=false;window.popupSubmitted++">提交</button>
<span id="spanHas" hidden>回答正确</span><button id="videoquiz-continue" hidden onclick="this.closest('.ans-videoquiz').remove();window.popupContinued++">继续学习</button></div>`;
const wrap = (body) => `<html><head><meta charset="utf-8"></head><body><h1>学习助手隔离测试</h1>${body}
<button class="nextChapter" onclick="window.nextClicks++">下一章</button><script>window.nextClicks=0;window.submitClicks=0;window.popupSubmitted=0;window.popupContinued=0;</script></body></html>`;

(async () => {
  const launch = { headless: true };
  // 启动 Playwright 自己的临时用户目录，绝不使用现有 Edge 的登录或扩展配置。
  if (process.env.CX_TEST_BROWSER) launch.executablePath = process.env.CX_TEST_BROWSER;
  else if (process.platform === 'win32') launch.channel = 'msedge';
  const browser = await chromium.launch(launch);
  const results = [];
  let contexts = [];
  let scenarioIndex = 0;
  async function setup(body, settings = {}, bank = [], api = {}, frames = {}, mediaOptions = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    contexts.push(context);
    await context.route('**/*', (route) => {
      const url = new global.URL(route.request().url());
      if (api.external?.[url.pathname]?.nativeFetch) return route.fulfill({status:api.external[url.pathname].status || 200,
        headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type'},contentType:'application/json',body:JSON.stringify(api.external[url.pathname].body)});
      if (url.pathname === '/test-image.png') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      const html = frames[url.pathname];
      if (url.pathname === '/mycourse/studentstudy') return route.fulfill({ contentType: 'text/html', body: wrap(body) });
      if (mediaOptions.path && url.pathname === new global.URL(mediaOptions.path,BASE).pathname) return route.fulfill({ contentType: 'text/html', body: wrap(body) });
      if (mediaOptions.url && url.pathname === new global.URL(mediaOptions.url).pathname) return route.fulfill({ contentType: 'text/html', body: wrap(body) });
      if (html !== undefined) return route.fulfill({ contentType: 'text/html', body: html.startsWith('<html') ? html : wrap(html) });
      return route.fulfill({ status: 404, body: 'Blocked by offline test' });
    });
    await context.addInitScript(({ store, bankKey, settings, bank, api, mediaOptions }) => {
      const values = { [store]: { enabled: false, autoNext: true, autoAnswer: true, requireWebSearch: false, compareRandomConfidence: false, overwriteAnswers: false, blockPause: false, randomFallback: false, answerCache: false, homeworkEnabled: true, specialEnabled: true, visionImages: true, fuzzyMatching: true, uiTab: 'all', ...settings }, [bankKey]: bank, 'cxHelper.answers.v1': mediaOptions.cache || [] };
      if(mediaOptions.cleanSettings) values[store] = settings;
      if (mediaOptions.persistentStore) Object.assign(values,JSON.parse(sessionStorage.getItem('cx-fixture-store') || '{}'));
      if (mediaOptions.defaultWebSearch) delete values[store].requireWebSearch;
      window.originalPausePrototype = HTMLMediaElement.prototype.pause;
      window.GM_getValue = (key, fallback) => values[key] ?? fallback;
      window.GM_setValue = (key, value) => { values[key] = JSON.parse(JSON.stringify(value)); if(mediaOptions.persistentStore)sessionStorage.setItem('cx-fixture-store',JSON.stringify(values)); };
      window.testStore = values;
      window.aiRequests = [];
      window.desktopNotices = [];
      window.GM_notification = options => window.desktopNotices.push({ title: options.title, text: options.text });
      window.testMenus = {};
      window.promptAnswers = [];
      window.promptCalls = [];
      window.GM_registerMenuCommand = (name, callback) => { window.testMenus[name] = callback; };
      window.prompt = (message, initial) => { window.promptCalls.push({ message, initial }); return window.promptAnswers.shift() ?? null; };
      window.apiAborts = 0;
      if (mediaOptions.slowFill) {
        const originalTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 100 ? 700 : ms, ...args);
      }
      if (api.silent) {
        const originalTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 60000 || ms === 180000 ? 150 : ms, ...args);
      }
      if (api.fastQueryDeadline) {
        const originalTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 90000 || ms === 210000 || ms === 330000 ? 250 : ms, ...args);
      }
      window.GM_xmlhttpRequest = (options) => {
        // Update checks use a separate service and must not count as AI requests.
        if (new URL(options.url).hostname === 'github.com' && new URL(options.url).pathname.endsWith('.meta.js')) {
          queueMicrotask(() => options.onload({status:200, responseText:'// @version 0.0.0'}));
          return {abort() {}};
        }
        if (options.responseType === 'blob') {
          window.imageRequests = (window.imageRequests || 0) + 1;
          (window.blobRequests ||= []).push(options.url);
          const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0));
          const timer = setTimeout(() => options.onload({ status: 200, response: new Blob([bytes], { type: mediaOptions.blobTypes?.[new URL(options.url).pathname] || (/\.mp3(?:\?|$)/.test(options.url) ? 'audio/mpeg' : 'image/png') }) }), 30);
          return { abort: () => { clearTimeout(timer); window.apiAborts++; options.onabort?.(); } };
        }
        const requestType = Object.entries(options.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || '';
        const payload = options.data ? (/^application\/x-www-form-urlencoded/i.test(requestType)
          ? Object.fromEntries(new URLSearchParams(options.data)) : JSON.parse(options.data)) : Object.fromEntries(new URL(options.url).searchParams);
        if (new URL(options.url).hostname === 'search.example') {
          window.aiRequests.push({ url: options.url, payload, headers: options.headers, method: options.method });
          const timer = setTimeout(() => {
            if (api.searchTimeout) { options.ontimeout(); return; }
            if (api.searchNetworkError) { options.onerror(); return; }
            options.onload({ status: api.searchStatus || 200, responseText: api.searchInvalidJSON ? 'bad' : JSON.stringify(api.searchResponse ?? {
              results: [{ title: '可靠资料', url: 'https://evidence.example/reference', content: '资料支持乙，单选为 B；多选对应 B 和 C。', score: 0.9 }],
            }) });
          }, api.searchDelay || 30);
          return { abort: () => { clearTimeout(timer); window.apiAborts++; options.onabort?.(); } };
        }
        if (api.external?.[new URL(options.url).pathname]) {
          const external = api.external[new URL(options.url).pathname];
          window.aiRequests.push({ url: options.url, payload, method: options.method, headers: options.headers, rawBody: options.data });
          const timer = setTimeout(() => {
            if (external.timeout) { options.ontimeout(); return; }
            if (external.networkError) { options.onerror(); return; }
            options.onload({ status: external.status || 200, responseText: external.raw ?? JSON.stringify(external.body || {}) });
          }, external.delay || 30);
          return { abort: () => { clearTimeout(timer); window.apiAborts++; options.onabort?.(); } };
        }
        if (api.silent) {
          window.aiRequests.push(payload);
          return { abort: () => { window.apiAborts++; } };
        }
        window.aiRequests.push({ url: options.url, payload, anonymous: options.anonymous, headers: options.headers });
        const question = (() => { try { return JSON.parse(payload.messages?.[1]?.content || payload.input?.[0]?.content || '{}'); } catch { return {}; } })();
        const timer = setTimeout(() => {
          if (api.timeout) { options.ontimeout(); return; }
          if (api.status) { options.onload({ status: api.status, responseText: JSON.stringify(api.errorResponse || {}) }); return; }
          let answer = api.byModel?.[payload.model] || api.answer || { answers: ['B'], confidence: 0.99 };
          if (api.byTitle?.[question.question]) answer = api.byTitle[question.question];
          const content = api.raw ?? JSON.stringify(answer);
          options.onload({ status: 200, finalUrl: api.finalUrl, responseText: JSON.stringify(payload.tools ? (api.responses ?? {
            status: 'completed', usage: api.usage, output: [
              ...(!api.noSearch ? [{ type: 'web_search_call', id: 'test-search', status: 'completed', action: { type: 'search', query: '资料查询', sources: [{ title: '来源', url: 'https://evidence.example/reference' }] } }] : []),
              { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] },
            ],
          }) : { usage: api.usage, choices: [{ message: { content } }] }) });
        }, api.delayByTitle?.[question.question] ?? api.delay ?? 50);
        return { abort: () => { clearTimeout(timer); window.apiAborts++; options.onabort?.(); } };
      };
      // 仅在测试页面模拟媒体状态；不接触真实播放器。
      window.mockMedia = (media) => {
        if (!mediaOptions.preserveSources || (!media.getAttribute('src') && !media.querySelector('source[src]'))) media.setAttribute('src', '/mock-media.mp4');
        media.playCalls = 0;
        media.pauseCalls = 0;
        let paused = true, ended = false, currentTime = 0;
        Object.defineProperties(media, {
          duration: { configurable: true, get: () => 120 }, paused: { configurable: true, get: () => paused },
          ended: { configurable: true, get: () => ended }, currentTime: { configurable: true, get: () => currentTime },
        });
        media.play = async () => {
          media.playCalls++;
          if (mediaOptions.rejectPlay) throw new DOMException('Mock permission rejection', 'NotAllowedError');
          paused = false; media.dispatchEvent(new Event('play'));
        };
        media.pause = () => { media.pauseCalls++; paused = true; media.dispatchEvent(new Event('pause')); };
        media.originalPause = media.pause;
        media.finish = () => { ended = true; paused = true; currentTime = 120; media.dispatchEvent(new Event('ended')); };
      };
      if (mediaOptions.hidden) {
        window.testHidden = true;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.testHidden });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.testHidden ? 'hidden' : 'visible' });
        Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => !window.testHidden });
      }
      if (mediaOptions.taintedCanvas) HTMLCanvasElement.prototype.toDataURL = () => { throw new DOMException('Tainted canvas', 'SecurityError'); };
      if (mediaOptions.randomSequence) { let index = 0; Math.random = () => mediaOptions.randomSequence[index++ % mediaOptions.randomSequence.length]; }
    }, { store: STORE, bankKey, settings, bank, api, mediaOptions });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(mediaOptions.url || (mediaOptions.path ? BASE + mediaOptions.path : URL));
    for (const frame of page.frames()) {
      await frame.evaluate(() => document.querySelectorAll('video,audio').forEach(window.mockMedia));
    }
    if (mediaOptions.sandboxWindow) await page.evaluate(source => {
      // Userscript managers may expose a virtual window while DOM defaultView
      // still refers to the underlying window. Preserve that identity split.
      let sandbox;
      sandbox = new Proxy(window, { get(target, key) {
        if (['window', 'self', 'top'].includes(key)) return sandbox;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' && !/^[A-Z]/.test(String(key)) ? value.bind(target) : value;
      } });
      new Function('window', source)(sandbox);
    }, script);
    else await page.addScriptTag({ content: script });
    if (!mediaOptions.noStart) await page.locator(`#cx-video-helper-host #${mediaOptions.startButton || 'toggle'}`).click();
    return { page, context, errors };
  }
  async function test(name, fn) {
    const index = scenarioIndex++;
    if (process.env.CX_TEST_SHARD) {
      const [shard, total] = process.env.CX_TEST_SHARD.split('/').map(Number);
      if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) throw new Error('Invalid CX_TEST_SHARD');
      if (index % total !== shard - 1) return;
    }
    if (process.env.CX_TEST_FILTER && !new RegExp(process.env.CX_TEST_FILTER).test(name)) return;
    if (process.env.CX_TEST_TRACE) {
      fs.mkdirSync(path.join(__dirname, '..', 'test-results'), {recursive:true});
      fs.writeFileSync(path.join(__dirname, '..', 'test-results', `progress-${(process.env.CX_TEST_SHARD || 'single').replace('/', '-')}.json`),
        JSON.stringify({name,at:new Date().toISOString(),completed:results.length}));
    }
    try { await fn(); results.push({ index, name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) {
      const diagnostics = await Promise.all(contexts.flatMap(context => context.pages()).map(async page => ({ url: page.url(), logs: await page.locator('#cx-video-helper-host #logs').textContent().catch(() => '') })));
      results.push({ index, name, passed: false, error: error.message, diagnostics });
      console.error(`FAIL ${name}: ${error.message}\n${JSON.stringify(diagnostics)}`);
    }
    finally { for (const context of contexts) await context.close(); contexts = []; }
  }
  const aiSettings = { apiUrl: 'https://mock-provider.example/v1', apiModel: 'mock-model', apiKey: 'test-secret' };
  const checked = (page, selector) => page.waitForFunction((sel) => document.querySelector(sel)?.checked === true, selector, { timeout: 6000 });
  const logContains = (page, text) => page.locator('#cx-video-helper-host #logs').filter({ hasText: text }).waitFor({ timeout: 6000 });
  const menu = (page, name, answer = null) => page.evaluate(({ name, answer }) => {
    window.promptAnswers.push(answer); window.testMenus[name](); window.promptAnswers.length = 0;
  }, { name, answer });

  await test('审查回归：外层 iframe 任务完成后停止旧媒体并播放下一任务', async () => {
    const { page } = await setup('<div class="ans-job" id="job"><iframe src="/player1"></iframe></div><div class="ans-job"><iframe src="/player2"></iframe></div>',
      { autoAnswer: false, autoNext: false, blockPause: true }, [], {}, { '/player1': '<video id="v"></video>', '/player2': '<video id="v"></video>' });
    const first = page.frames().find(f => f.url().endsWith('/player1'));
    const second = page.frames().find(f => f.url().endsWith('/player2'));
    await first.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#job').evaluate(node => node.classList.add('ans-job-finished'));
    await second.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await first.locator('#v').evaluate(m => m.paused), true);
    assert.equal(await first.locator('#v').evaluate(m => m.pause === m.originalPause), true);
    assert.equal(await second.locator('#v').evaluate(m => m.playCalls), 1);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('审查回归：延迟播放不能越过人工验证或视频弹题，解除后可恢复', async () => {
    for (const verification of [true, false]) {
      const { page } = await setup('', { autoAnswer: false, blockPause: true });
      await page.evaluate(() => {
        const media = document.createElement('video'); media.id = 'late'; document.body.appendChild(media); window.mockMedia(media);
        const play = media.play;
        const pending = new Promise(resolve => { window.releasePlay = resolve; });
        media.play = async () => { window.playStarted = true; await pending; return play(); };
      });
      await page.waitForFunction(() => window.playStarted);
      await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), verification
        ? '<div id="verification">[9010] 操作异常，请输入图片中的验证码</div>' : popup);
      if (verification) await logContains(page, '平台要求人工验证');
      await page.evaluate(() => window.releasePlay());
      await page.waitForFunction(() => document.querySelector('#late').playCalls === 1 && document.querySelector('#late').paused);
      await page.waitForTimeout(1100);
      assert.equal(await page.locator('#late').evaluate(m => m.paused), true);
      await page.locator(verification ? '#verification' : '.ans-videoquiz').evaluate(node => node.remove());
      await page.waitForFunction(() => !document.querySelector('#late').paused);
    }
  });
  await test('审查回归：提交后忽略无关弹窗，仍能确认真正的提交弹窗', async () => {
    for (const kind of ['layui', 'popok']) {
      const unrelated = kind === 'layui'
        ? '<div class="layui-layer-dialog" id="unrelated" hidden><p>登录已过期，确定退出当前账号？</p><button class="layui-layer-btn0" onclick="window.unrelatedClicks=(window.unrelatedClicks||0)+1">确定</button></div>'
        : '<div class="popDiv" id="unrelated" hidden><p>确定删除本地记录？</p><div class="popBottom"><a id="popok" onclick="window.unrelatedClicks=(window.unrelatedClicks||0)+1">确定</a></div></div>';
      const body = choice(1, '确认弹窗归属', ['甲', '乙']) + unrelated
        + '<button id="btnBlueSubmit" onclick="window.submitClicks++;document.getElementById(\'unrelated\').hidden=false">提交</button>'
        + '<div class="layui-layer-dialog" id="actual" hidden><p>确定提交本次章节作业？</p><button class="layui-layer-btn0" onclick="window.confirmClicks=(window.confirmClicks||0)+1;this.parentElement.hidden=true">确定</button></div>';
      const { page } = await setup(body, { autoSubmit: true }, [{ question: '确认弹窗归属', answers: ['A'] }]);
      await page.waitForFunction(() => window.submitClicks === 1);
      await page.waitForTimeout(1700);
      assert.equal(await page.evaluate(() => window.unrelatedClicks || 0), 0);
      await page.locator('#actual').evaluate(node => { node.hidden = false; });
      await page.waitForFunction(() => window.confirmClicks === 1);
      await page.waitForTimeout(900);
      assert.deepEqual(await page.evaluate(() => [window.unrelatedClicks || 0, window.confirmClicks, window.submitClicks]), [0, 1, 1]);
    }
  });
  await test('审查回归：加密阅读理解、完形及连线题的子题和选项完整绘入画布', async () => {
    for (const type of ['阅读理解', '完形填空', '连线题']) {
      const groups = [1, 2].map(index => `<div data-cx-subquestion data-cx-line><span data-subtitle class="font-cxsecret" style="font-family:review-encoded">SUBTITLE_${index}</span><select><option value="">请选择</option><option value="A" class="font-cxsecret" style="font-family:review-encoded">CHOICE_${index}_A</option><option value="B">CHOICE_${index}_B</option></select></div>`).join('');
      const body = `<div class="TiMu" data-question-type="${type}"><div class="question-title"><span class="font-cxsecret">加密材料</span></div>${groups}</div>
        <script>window.drawnText=[];window.drawnFonts=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.drawnText.push(text);window.drawnFonts.push(this.font);return original.call(this,text,...args)}</script>`;
      const { page } = await setup(body, aiSettings, [], { answer: { answers: ['B', 'A'], confidence: 1 } });
      await page.waitForFunction(() => [...document.querySelectorAll('.TiMu select')].map(node => node.value).join(',') === 'B,A');
      const { drawn, fonts, messages } = await page.evaluate(() => ({ drawn: window.drawnText.join(''), fonts: window.drawnFonts, messages: window.aiRequests[0].payload.messages }));
      for (const index of [1, 2]) for (const text of [`子题 ${index}: `, `SUBTITLE_${index}`, `CHOICE_${index}_A`, `CHOICE_${index}_B`]) assert.ok(drawn.includes(text), text);
      assert.ok(fonts.some(font => font.includes('review-encoded')));
      assert.ok(messages[1].content.some(part => part.type === 'image_url' && part.image_url.url.startsWith('data:image/png;base64,')));
      assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
    }
  });
  await require('./fixtures/verified-search.cjs')({ test, setup, choice, blank, aiSettings, checked, logContains });
  await require('./fixtures/n1-bank.cjs')({ test, setup, choice, blank, aiSettings, checked, logContains });
  await test('后台原型暂停被拦截，收起窗口与切换设置不暂停，停止后还原原型', async () => {
    const { page } = await setup('<video id="v"></video>', { blockPause: true }, [], {}, {}, { hidden: true });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('webkitvisibilitychange'));
      HTMLMediaElement.prototype.pause.call(document.querySelector('#v'));
    });
    await page.locator('#cx-video-helper-host #collapse').click();
    await page.locator('#cx-video-helper-host #collapse').click();
    await page.locator('#cx-video-helper-host #muted').uncheck();
    assert.deepEqual(await page.locator('#v').evaluate(m => [m.paused, m.pauseCalls, m.playCalls]), [false, 0, 1]);
    await page.locator('#cx-video-helper-host #toggle').click();
    assert.equal(await page.evaluate(() => HTMLMediaElement.prototype.pause === window.originalPausePrototype), true);
    assert.equal(await page.locator('#v').evaluate(m => m.paused), true);
  });
  await test('调整播放器音量后最小化不误判为手动暂停，缓存的原始暂停在后台立即恢复', async () => {
    const { page } = await setup('<div class="video-js"><video id="v"></video><button id="volume">音量</button></div>',
      { blockPause: true }, [], {}, {}, { hidden: true });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#volume').click();
    await page.locator('#v').evaluate(m => m.pause());
    assert.equal(await page.locator('#v').evaluate(m => m.paused), false);
    await page.locator('#v').evaluate(m => m.originalPause());
    await page.waitForFunction(() => !document.querySelector('#v').paused, null, { timeout: 1000 });
    assert.equal(await page.locator('#v').evaluate(m => m.playCalls), 2);
  });
  await test('原生控件手动暂停保留，点击视频后立即最小化的页面暂停仍拦截', async () => {
    const { page } = await setup('<video id="v" width="320" height="180"></video>', { blockPause: true }, [], {}, {}, { hidden: true });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.evaluate(() => { window.testHidden = false; });
    await page.locator('#v').click();
    await page.locator('#v').evaluate(m => m.originalPause());
    await page.waitForTimeout(2000);
    assert.deepEqual(await page.locator('#v').evaluate(m => [m.paused, m.playCalls]), [true, 1]);
    await page.locator('#cx-video-helper-host #resumeMedia').click();
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#v').click();
    await page.evaluate(() => { window.testHidden = true; document.querySelector('#v').pause(); });
    assert.equal(await page.locator('#v').evaluate(m => m.paused), false);
  });

  await test('审查修复：前台 iframe 焦点转移前的 pointerdown 手动暂停保留', async () => {
    for (const blockPause of [true, false]) {
      const body = '<input id="parentInput"><iframe src="/player" width="600" height="260"></iframe>';
      const player = '<div data-cx-player><video id="v" width="320" height="180"></video><button id="manual" data-cx-pause onpointerdown="document.querySelector(\'#v\').pause()">暂停</button></div>';
      const { page, errors } = await setup(body, { blockPause, autoResume: false, autoNext: false, autoAnswer: false }, [], {}, { '/player': player });
      const frame = page.frames().find(f => f.url().endsWith('/player'));
      await frame.waitForFunction(() => !document.querySelector('#v').paused);
      await page.locator('#parentInput').click();
      assert.equal(await frame.evaluate(() => Document.prototype.hasFocus.call(document)), false);
      await frame.locator('#manual').click();
      await page.waitForTimeout(1800);
      assert.deepEqual(await frame.locator('#v').evaluate(m => [m.paused, m.pauseCalls, m.playCalls]), [true, 1, 1]);
      await page.locator('#cx-video-helper-host #resumeMedia').click();
      await frame.waitForFunction(() => !document.querySelector('#v').paused);
      await page.locator('#parentInput').click();
      await frame.locator('#v').evaluate(m => m.pause());
      assert.equal(await frame.locator('#v').evaluate(m => m.paused), !blockPause);
      assert.deepEqual(errors, []);
    }
  });
  await test('安全配置：密钥和题库鉴权不进入页面，菜单保存清除，接口换域名不复用旧密钥', async () => {
    const banks = [{ name: '安全题库', url: 'https://bank.example/search', headers: { Authorization: 'private-bank-key' }, data: { token: 'private-bank-token' } }];
    const { page } = await setup('', { ...aiSettings, externalBanks: banks });
    assert.equal(await page.locator('#cx-video-helper-host #apiKey').count(), 0);
    assert.equal(await page.locator('#cx-video-helper-host #externalConfig').count(), 0);
    assert.equal(await page.evaluate(() => /test-secret|private-bank-key|private-bank-token/.test(document.querySelector('#cx-video-helper-host').shadowRoot.innerHTML)), false);
    await page.evaluate(() => {
      const root = document.querySelector('#cx-video-helper-host').shadowRoot;
      root.getElementById('apiUrl').value = 'https://attacker.example/v1';
      root.getElementById('saveApi').click(); root.getElementById('testApi').click();
      for (const id of ['saveApi', 'testApi']) {
        const button = root.getElementById(id);
        button.onclick({ isTrusted: true, currentTarget: button });
        const fake = Object.create(Event.prototype);
        Object.defineProperties(fake, { isTrusted: { value: true }, currentTarget: { value: button } });
        button.onclick(fake);
      }
    });
    assert.equal(await page.evaluate(key => window.testStore[key].apiUrl, STORE), aiSettings.apiUrl);
    assert.equal(await page.evaluate(() => window.aiRequests.length), 0);
    await page.locator('#cx-video-helper-host #apiSettings > summary').click();
    await page.locator('#cx-video-helper-host #apiUrl').fill('https://mock-provider.example/v2');
    await page.locator('#cx-video-helper-host #saveApi').click();
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), 'test-secret');
    await page.locator('#cx-video-helper-host #apiUrl').fill('https://new-provider.example/v1');
    await page.locator('#cx-video-helper-host #saveApi').click();
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), '');
    await menu(page, '设置 AI 密钥', 'new-private-key');
    await menu(page, '设置 AI 密钥', null);
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), 'new-private-key');
    assert.equal(await page.evaluate(() => document.querySelector('#cx-video-helper-host').shadowRoot.innerHTML.includes('new-private-key')), false);
    assert.equal(await page.evaluate(() => window.promptCalls.every(call => call.initial === '')), true);
    await page.locator('#cx-video-helper-host #testApi').click();
    await logContains(page, '接口连接成功');
    assert.equal(await page.evaluate(() => window.aiRequests[0].headers.Authorization), 'Bearer new-private-key');
    await menu(page, '清除 AI 密钥');
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), '');
    await menu(page, '配置外部题库', '[]');
    assert.deepEqual(await page.evaluate(key => window.testStore[key].externalBanks, STORE), []);
    await menu(page, '配置外部题库', JSON.stringify(banks));
    assert.equal(await page.evaluate(() => document.querySelector('#cx-video-helper-host').shadowRoot.innerHTML.includes('private-bank-key')), false);
    assert.deepEqual(await page.evaluate(key => window.testStore[key].externalBanks, STORE), banks.map(item=>({...item,method:'POST'})));
  });

  await test('填写取消：多选、组合题及多空输入停止后续写入，不缓存和提交', async () => {
    const cancel = `document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('retry').click()`;
    const fixtures = [
      { body: choice(1, '取消多选', ['甲', '乙'], '多选题').replace('value="A"', `value="A" onclick="${cancel}"`), answer: ['A', 'B'], first: 'input[value="A"]', second: 'input[value="B"]', kind: 'choice' },
      { body: `<div class="TiMu" data-question-type="连线题"><h3>取消组合</h3><div class="line_answer_ct"><select class="selectBox" id="first" onchange="${cancel}"><option value="">请选择</option><option value="A">甲</option></select><select class="selectBox" id="second"><option value="">请选择</option><option value="B">乙</option></select></div></div>`, answer: ['A', 'B'], first: '#first', second: '#second' },
      { body: blank(1, '取消多空', 2).replace('id="ans1_0"', `id="ans1_0" oninput="${cancel}"`), answer: ['甲', '乙'], first: '#ans1_0', second: '#ans1_1' },
    ];
    for (const fixture of fixtures) {
      const { page, context } = await setup(fixture.body + '<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>',
        { ...aiSettings, autoSubmit: true, answerCache: true }, [], { answer: { answers: fixture.answer, confidence: 1 } });
      await logContains(page, '已取消正在等待的查询');
      await page.waitForTimeout(1200);
      if (fixture.kind === 'choice') {
        assert.equal(await page.locator(fixture.first).isChecked(), true);
        assert.equal(await page.locator(fixture.second).isChecked(), false);
      } else {
        assert.equal(await page.locator(fixture.first).inputValue(), fixture.answer[0]);
        assert.equal(await page.locator(fixture.second).inputValue(), '');
      }
      assert.equal(await page.evaluate(() => window.submitClicks), 0);
      assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
      assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（AI）'));
      await context.close();
    }
  });

  await test('填写保护：多选异步确认期间的真实手动修改不被覆盖，不缓存和提交', async () => {
    const body = choice(1, '填写手动保护', ['甲', '乙', '丙'], '多选题')
      .replace('value="A"', 'value="A" onclick="window.fillStarted=true;this.checked=false;const input=this;setTimeout(()=>input.checked=true,400)"')
      + '<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>';
    const { page } = await setup(body, { ...aiSettings, autoSubmit: true, answerCache: true }, [], { answer: { answers: ['A', 'C'], confidence: 1 } });
    await page.waitForFunction(() => window.fillStarted);
    await page.locator('input[value="B"]').check();
    await logContains(page, '填写期间题目已被手动修改');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('input[value="B"]').isChecked(), true);
    assert.equal(await page.locator('input[value="C"]').isChecked(), false);
    assert.equal(await page.evaluate(() => window.submitClicks), 0);
    assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（AI）'));
  });

  await test('填写保护：组合题填写期间的手动修改保留，不提交', async () => {
    const body = '<div class="TiMu" data-question-type="连线题"><h3>组合手动保护</h3><div class="line_answer_ct"><select id="first" class="selectBox" onchange="window.fillStarted=true"><option value="">请选择</option><option value="A">甲</option></select><select id="second" class="selectBox"><option value="">请选择</option><option value="A">甲</option><option value="B">乙</option></select></div></div>';
    const { page } = await setup(body, aiSettings, [], { answer: { answers: ['A', 'A'], confidence: 1 } }, {}, { slowFill: true });
    await page.waitForFunction(() => window.fillStarted);
    // selectOption 用脚本分发非可信事件；用真实键盘操作验证用户输入保护。
    await page.locator('#second').press('End');
    await logContains(page, '填写期间题目已被手动修改');
    assert.equal(await page.locator('#second').inputValue(), 'B');
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（AI）'));
  });

  await test('媒体完成：平台提前标记完成后停止旧媒体，播放下一任务并正常切章', async () => {
    const { page } = await setup('<div id="job1" class="ans-job"><video id="v1"></video></div><div id="job2" class="ans-job"><video id="v2"></video></div>',
      { autoAnswer: false, blockPause: true, nextDelay: 1000 });
    await page.waitForFunction(() => !document.querySelector('#v1').paused);
    await page.locator('#job1').evaluate(job => job.classList.add('ans-job-finished'));
    await page.waitForFunction(() => !document.querySelector('#v2').paused);
    assert.equal(await page.locator('#v1').evaluate(media => media.paused && !media.ended), true);
    assert.equal(await page.locator('#v1').evaluate(media => Object.getOwnPropertyDescriptor(media, 'pause').value.toString().includes('pauseCalls')), true);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    await page.locator('#job2').evaluate(job => job.classList.add('ans-job-finished'));
    await page.waitForFunction(() => window.nextClicks === 1);
    assert.equal(await page.locator('#v2').evaluate(media => media.paused && !media.ended), true);
  });

  await test('只答题按钮开启答题，同源音视频不播放，不阅读和切章，暂停后可继续', async () => {
    const { page, errors } = await setup('<video id="v"></video><iframe src="/answer-frame"></iframe>' + choice(1, '只答题测试', ['甲', '乙']),
      { autoAnswer: false, blockPause: true, nextDelay: 1000 }, [{ question: '只答题测试', answers: ['B'] }], {},
      { '/answer-frame': '<audio id="a"></audio>' }, { startButton: 'answerOnly' });
    await checked(page, 'input[value="B"]');
    await page.waitForTimeout(1800);
    for (const frame of page.frames()) {
      assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('video,audio')].map(m => [m.playCalls, m.paused])), [[0, true]]);
    }
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    assert.equal(await page.evaluate(store => window.testStore[store].answerOnly, STORE), true);
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => document.querySelector('#v').playCalls), 0);
    assert.equal(await page.locator('#cx-video-helper-host #resumeMedia').isDisabled(), true);
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'answer-only.png') });
    await page.locator('#cx-video-helper-host #answerOnly').click();
    await page.waitForFunction(() => document.querySelector('#v').playCalls === 1);
    assert.equal(await page.evaluate(store => window.testStore[store].answerOnly, STORE), false);
    assert.deepEqual(errors, []);
  });
  await test('播放中切换只答题会暂停媒体并撤销暂停拦截', async () => {
    const { page } = await setup('<video id="v"></video>', { autoAnswer: false, blockPause: true });
    await page.waitForFunction(() => document.querySelector('#v').playCalls === 1);
    await page.locator('#cx-video-helper-host #answerOnly').click();
    await page.waitForTimeout(1700);
    assert.deepEqual(await page.evaluate(() => {
      const m = document.querySelector('#v');
      return [m.playCalls, m.paused, Object.getOwnPropertyDescriptor(m, 'pause').value.toString().includes('pauseCalls')];
    }), [1, true, true]);
  });
  await test('保存的只答题模式启动后不播放和阅读，不自动切章', async () => {
    const { page } = await setup('<video id="v"></video><div class="ans-job-finished"></div><div id="reader"><select id="pagejump" onchange="window.readerClicks=(window.readerClicks||0)+1"><option value="1">1</option><option value="2">2</option></select></div>',
      { answerOnly: true, nextDelay: 1000, readDelay: 1000 });
    await page.waitForTimeout(2500);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#v').playCalls, window.nextClicks, window.readerClicks || 0]), [0, 0, 0]);
    assert.equal(await page.locator('#cx-video-helper-host #answerOnly').textContent(), '恢复学习模式');
  });

  await test('桌面提醒填写失败去重，不泄露题目，关闭后仅测试按钮可通知', async () => {
    const { page } = await setup(choice(1, '隐私题目甲', ['甲', '乙']) + choice(2, '隐私题目乙', ['甲', '乙']), { ...aiSettings, queryInterval: 1000 }, [], { status: 500 });
    await page.waitForFunction(() => window.aiRequests.length === 2);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.desktopNotices.length), 1);
    assert.ok(!JSON.stringify(await page.evaluate(() => window.desktopNotices)).includes('隐私题目'));
    await page.locator('#cx-video-helper-host #desktopNotifications').uncheck();
    await page.locator('#cx-video-helper-host #retry').click();
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => window.desktopNotices.length), 1);
    await page.locator('#cx-video-helper-host #testNotification').click();
    assert.equal(await page.evaluate(() => window.desktopNotices.length), 2);
  });
  await test('桌面提醒油猴抛错或异步拒绝时回退已授权浏览器通知', async () => {
    for (const asyncFailure of [false, true]) {
      const { page } = await setup('');
      await page.evaluate(asyncFailure => {
        window.GM_notification = () => {
          if (asyncFailure) return Promise.reject(new Error('mock failure'));
          throw new Error('mock failure');
        };
        window.nativeNotices = [];
        window.Notification = class {
          static permission = 'granted';
          constructor(title, options) { window.nativeNotices.push({ title, body: options.body }); }
          close() {}
        };
      }, asyncFailure);
      await page.locator('#cx-video-helper-host #testNotification').click();
      await page.waitForFunction(() => window.nativeNotices.length === 1);
      await logContains(page, '已调用浏览器通知');
      assert.equal(await page.locator('#cx-video-helper-host #logs').innerText().then(t => t.includes('已显示')), false);
    }
  });
  await test('桌面提醒浏览器异步错误和权限拒绝可重复诊断且不主动请求权限', async () => {
    const { page } = await setup('');
    await page.evaluate(() => {
      delete window.GM_notification;
      window.permissionRequests = 0;
      window.Notification = class {
        static permission = 'granted';
        static requestPermission() { window.permissionRequests++; return Promise.resolve('denied'); }
        constructor() { setTimeout(() => this.onerror?.(), 0); }
        close() {}
      };
    });
    await page.locator('#cx-video-helper-host #testNotification').click();
    await logContains(page, '浏览器通知发送失败');
    await page.evaluate(() => { window.Notification.permission = 'denied'; });
    for (let i = 0; i < 2; i++) await page.locator('#cx-video-helper-host #testNotification').click();
    assert.equal(await page.locator('#cx-video-helper-host #logs').innerText().then(t => t.split('站点通知权限被拒绝').length - 1), 2);
    assert.equal(await page.evaluate(() => window.permissionRequests), 0);
  });
  await test('桌面提醒浏览器按钮独立申请权限，允许后发送且拒绝不走油猴', async () => {
    for (const answer of ['granted', 'denied']) {
      const { page } = await setup('');
      await page.evaluate(answer => {
        window.nativeNotices = [];
        window.permissionRequests = 0;
        window.Notification = class {
          static permission = 'default';
          static requestPermission() { window.permissionRequests++; this.permission = answer; return Promise.resolve(answer); }
          constructor(title, options) {
            window.nativeNotices.push(options.body);
            setTimeout(() => this.onshow?.(), 0);
          }
          close() {}
        };
      }, answer);
      await page.locator('#cx-video-helper-host #testBrowserNotification').click();
      await logContains(page, answer === 'granted' ? '浏览器已触发通知显示事件' : '站点通知权限被拒绝');
      assert.deepEqual(await page.evaluate(() => [window.permissionRequests, window.nativeNotices.length, window.desktopNotices.length]), [1, answer === 'granted' ? 1 : 0, 0]);
    }
  });
  await test('桌面提醒已有浏览器授权时自动提醒优先浏览器且不重复发送油猴', async () => {
    const { page } = await setup(choice(1, '测试题', ['甲', '乙']), aiSettings, [], { status: 500, delay: 1000 });
    await page.evaluate(() => {
      window.nativeNotices = [];
      window.Notification = class {
        static permission = 'granted';
        constructor(title, options) { window.nativeNotices.push(options.body); }
        close() {}
      };
    });
    await page.waitForFunction(() => window.nativeNotices.length === 1);
    assert.equal(await page.evaluate(() => window.desktopNotices.length), 0);
  });
  await test('桌面提醒考试预览只通知一次且仍不交卷，关闭提醒不发送', async () => {
    for (const enabled of [true, false]) {
      const { page } = await setup('<input name="questionId" value="1"><input id="answer1" value="A"><button onclick="window.submits=1">交卷</button>', { examEnabled: true, desktopNotifications: enabled }, [], {}, {}, { path: '/exam-ans/mooc2/exam/preview' });
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(() => window.desktopNotices.length), enabled ? 1 : 0);
      assert.equal(await page.evaluate(() => window.submits || 0), 0);
    }
  });
  await test('横向选项卡只展示当前设置，支持键盘切换和全部视图', async () => {
    const { page, errors } = await setup('<video id="v"></video>', { uiTab: 'playback' });
    assert.equal(await page.locator('#cx-video-helper-host #speed').isVisible(), true);
    assert.equal(await page.locator('#cx-video-helper-host #autoAnswer').isVisible(), false);
    await page.locator('#cx-video-helper-host #tab-reading').click();
    assert.equal(await page.locator('#cx-video-helper-host #autoRead').isVisible(), true);
    await page.locator('#cx-video-helper-host #tab-reading').press('ArrowRight');
    assert.equal(await page.locator('#cx-video-helper-host #autoAnswer').isVisible(), true);
    assert.equal(await page.locator('#cx-video-helper-host #speed').isVisible(), false);
    await page.locator('#cx-video-helper-host #tab-sources').click();
    await page.locator('#cx-video-helper-host #presetProvider').selectOption('ocs');
    assert.equal(await page.locator('#cx-video-helper-host #externalInfo').isVisible(), true);
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'tabs-sources.png') });
    await page.locator('#cx-video-helper-host #tab-playback').click();
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'tabs-playback.png') });
    await page.locator('#cx-video-helper-host #tab-all').click();
    assert.equal(await page.locator('#cx-video-helper-host #autoAnswer').isVisible(), true);
    assert.equal(await page.locator('#cx-video-helper-host #speed').isVisible(), true);
    assert.deepEqual(errors, []);
  });
  await test('常用首页：快捷设置同步、入口跳转、键盘导航与窄屏布局', async () => {
    const { page, errors } = await setup('', { uiTab: 'home', autoAnswer: false });
    const ui = page.locator('#cx-video-helper-host');
    assert.equal(await ui.locator('#tab-home').getAttribute('aria-selected'), 'true');
    const quick = ui.locator('[data-setting=autoAnswer]');
    await quick.click();
    assert.equal(await quick.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(key => window.testStore[key].autoAnswer, STORE), true);
    await ui.locator('[data-destination=answer]').click();
    assert.equal(await ui.locator('#autoAnswer').isChecked(), true);
    await ui.locator('#autoAnswer').uncheck();
    await ui.locator('#tab-home').click();
    assert.equal(await quick.getAttribute('aria-pressed'), 'false');
    await ui.locator('#answerOnly').click();
    assert.equal(await quick.getAttribute('aria-pressed'), 'true');
    assert.equal(await ui.locator('#resumeMedia').isDisabled(), true);
    await ui.locator('#answerOnly').click();
    await ui.locator('[data-destination=sources]').click();
    assert.equal(await page.evaluate(key => window.testStore[key].uiTab, STORE), 'sources');
    await ui.locator('#tab-sources').press('Home');
    assert.equal(await ui.locator('#tab-playback').getAttribute('aria-selected'), 'true');
    await ui.locator('#tab-home').click();
    await ui.locator('#tab-home').press('End');
    assert.equal(await ui.locator('#tab-records').getAttribute('aria-selected'), 'true');
    const ids = await ui.evaluate(host => [...host.shadowRoot.querySelectorAll('[id]')].map(node => node.id));
    assert.equal(ids.length, new Set(ids).size);
    await ui.locator('#tab-home').click();
    await ui.locator('#toggle').click();
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'layout-home.png'), animations: 'disabled' });
    for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport);
      const bounds = await ui.locator('.panel').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
      for (const tab of ['home', 'playback', 'reading', 'answer', 'sources', 'records', 'all']) {
        if (!['home', 'records'].includes(tab)) await ui.locator('#tab-settings').click();
        await ui.locator(`#tab-${tab}`).click();
        assert.ok(await ui.locator('.config').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `水平溢出：${tab}`);
        assert.equal(await ui.locator('#toggle').isVisible(), true);
      }
      await ui.locator('#tab-home').click();
      await page.screenshot({ path: path.join(__dirname, '..', 'test-results', `layout-${viewport.width}.png`), animations: 'disabled' });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await ui.locator('.tab-panel').first().evaluate(node => getComputedStyle(node).animationName), 'none');
    await ui.locator('#collapse').click();
    assert.equal(await ui.locator('#collapse').getAttribute('aria-expanded'), 'false');
    await ui.locator('#collapse').click();
    assert.equal(await ui.locator('#collapse').getAttribute('aria-expanded'), 'true');
    assert.deepEqual(errors, []);
  });
  await test('内置目录：贴合侧栏、筛选搜索、定位当前、原生切章及状态同步', async () => {
    const { page, errors } = await setup(catalogFixture(), { uiTab: 'course', autoNext: false, autoAnswer: false });
    const ui = page.locator('#cx-video-helper-host');
    assert.equal(await ui.getAttribute('data-docked'), 'true');
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), true);
    const sourceRect = await page.locator('#courseSidebar').boundingBox(), helperRect = await ui.boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(sourceRect[key] - helperRect[key]) < 2, key);
    assert.equal(await ui.locator('.chapter-link').count(), 9);
    assert.equal(await ui.locator('.chapter-link[aria-current=page]').getAttribute('data-chapter-id'), 'cur12');
    assert.equal(await ui.locator('#courseProgressText').textContent(), '1 / 9 节已完成');
    await ui.locator('.chapter-link[aria-current=page]').click();
    assert.equal(await page.evaluate(() => window.chapterClicks?.length || 0), 0);
    await ui.locator('#pendingChapters').click();
    assert.equal(await ui.locator('.chapter-link').count(), 8);
    await ui.locator('#chapterSearch').fill('2.2');
    assert.equal(await ui.locator('.chapter-link').count(), 1);
    await ui.locator('#chapterSearch').fill('不存在的章节');
    assert.equal(await ui.locator('#chapterEmpty').isVisible(), true);
    await ui.locator('#locateChapter').click();
    assert.equal(await ui.locator('#chapterSearch').inputValue(), '');
    assert.equal(await ui.locator('#pendingChapters').getAttribute('aria-pressed'), 'false');
    await ui.locator('#next').click();
    await page.waitForFunction(() => document.querySelector('#cur13').classList.contains('posCatalog_active'));
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    await ui.locator('#chapterSearch').fill('2.1');
    await ui.locator('[data-chapter-id=cur21]').click();
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').shadowRoot.querySelector('[data-chapter-id=cur21]')?.getAttribute('aria-current') === 'page');
    assert.deepEqual(await page.evaluate(() => window.chapterClicks), ['cur13', 'cur21']);
    await page.locator('#cur21').evaluate(node => node.insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>'));
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('courseProgress').value === 2);
    await ui.locator('#chapterSearch').fill('3.3');
    assert.equal(await ui.locator('[data-chapter-id=cur33]').isDisabled(), true);
    await ui.locator('#chapterSearch').press('Escape');
    await ui.locator('#locateChapter').click();
    await ui.locator('.chapter-group summary').first().click();
    await ui.screenshot({ path: path.join(__dirname, '..', 'test-results', 'course-sidebar.png'), animations: 'disabled' });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'course-workspace.png'), animations: 'disabled' });
    await ui.locator('#nativeCatalog').click();
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), false);
    assert.equal(await ui.locator('.panel').isVisible(), false);
    await ui.locator('#returnHelper').click();
    assert.equal(await ui.getAttribute('data-docked'), 'true');
    await ui.locator('#dockToggle').click();
    assert.equal(await ui.getAttribute('data-docked'), 'false');
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), false);
    await ui.locator('#dockToggle').click();
    await ui.locator('#collapse').click();
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), false);
    await ui.locator('#collapse').click();
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), true);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);
    const small = await ui.boundingBox();
    assert.ok(small.x >= 0 && small.y >= 0 && small.x + small.width <= 375 && small.y + small.height <= 667);
    assert.ok(await ui.locator('.config').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await ui.screenshot({ path: path.join(__dirname, '..', 'test-results', 'course-mobile.png'), animations: 'disabled' });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), false);
    assert.deepEqual(errors, []);
  });
  await test('内置目录：原生内置及相邻拖动条可用，覆盖层跟随真实鼠标拖拽', async () => {
    for (const placement of ['inside', 'sibling']) {
      const fixture = catalogFixture() + `<script>
        const sidebar = document.querySelector('#courseSidebar');
        const handle = document.createElement('div');
        handle.id = 'nativeSideGrip';
        handle.style.cssText = 'position:fixed;top:28px;bottom:20px;width:12px;cursor:${placement === 'inside' ? 'col-resize' : 'default'};background:#ccc;touch-action:none';
        const placeHandle = () => handle.style.left = sidebar.getBoundingClientRect().left + 'px';
        ${placement === 'inside' ? 'sidebar.prepend(handle)' : 'sidebar.after(handle)'};
        placeHandle();
        let start;
        handle.onpointerdown = event => { start = { x: event.clientX, width: sidebar.getBoundingClientRect().width }; handle.setPointerCapture(event.pointerId); window.resizeStarts = (window.resizeStarts || 0) + 1; };
        handle.onpointermove = event => { if (!start) return; sidebar.style.width = start.width + start.x - event.clientX + 'px'; placeHandle(); };
        handle.onpointerup = () => { start = null; };
      </script>`;
      const { page, errors } = await setup(fixture, { uiTab: 'course', autoNext: false, autoAnswer: false });
      const sidebar = page.locator('#courseSidebar'), ui = page.locator('#cx-video-helper-host');
      const before = await sidebar.boundingBox(), handle = await page.locator('#nativeSideGrip').boundingBox();
      assert.equal(await page.locator('#nativeSideGrip').evaluate(node => Boolean(node.closest('[inert]'))), false, placement);
      const cover = await ui.boundingBox();
      assert.ok(cover.x >= handle.x + handle.width - 1 && Math.abs(cover.y - before.y) < 2, placement);
      await page.mouse.move(handle.x + 6, handle.y + 100);
      await page.mouse.down();
      await page.mouse.move(handle.x - 94, handle.y + 100, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(() => Math.abs(document.querySelector('#courseSidebar').getBoundingClientRect().right - document.querySelector('#cx-video-helper-host').getBoundingClientRect().right) < 2);
      const after = await sidebar.boundingBox(), helper = await ui.boundingBox();
      assert.equal(await page.evaluate(() => window.resizeStarts), 1, placement);
      assert.ok(Math.abs(after.width - before.width - 100) < 2, placement);
      assert.ok(Math.abs(helper.x - after.x - 12) < 2 && Math.abs(helper.width - after.width + 12) < 2, placement);
      await ui.locator('#nativeCatalog').click();
      assert.equal(await sidebar.evaluate(node => Boolean(node.querySelector('[inert]')) || node.inert), false);
      await ui.locator('#returnHelper').click();
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await sidebar.evaluate(node => Boolean(node.querySelector('[inert]')) || node.inert), false);
      assert.deepEqual(errors, []);
    }
  });
  await test('内置目录：拖动缩放逐帧跟随，收窄和隐藏后保持贴合', async () => {
    const { page, errors } = await setup(catalogFixture(), { uiTab: 'course', autoNext: false, autoAnswer: false });
    const measurements = await page.evaluate(async () => {
      const sidebar = document.querySelector('#courseSidebar'), host = document.querySelector('#cx-video-helper-host');
      const chapter = host.shadowRoot.querySelector('.chapter-link');
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const samples = [];
      for (const width of [420, 470, 510, 450, 380, 310, 270, 210, 160, 300, 400]) {
        sidebar.style.width = `${width}px`;
        await frame(); await frame();
        const a = sidebar.getBoundingClientRect(), b = host.getBoundingClientRect();
        samples.push({ error: Math.max(Math.abs(a.left - b.left), Math.abs(a.width - b.width), Math.abs(a.top - b.top)), docked: host.dataset.docked });
      }
      sidebar.style.display = 'none'; await frame(); await frame();
      const hidden = getComputedStyle(host).visibility === 'hidden';
      sidebar.style.display = ''; await frame(); await frame();
      return { samples, hidden, restored: getComputedStyle(host).visibility === 'visible', sameChapter: chapter === host.shadowRoot.querySelector('.chapter-link') };
    });
    assert.ok(measurements.samples.every(sample => sample.error < 2 && sample.docked === 'true'), JSON.stringify(measurements));
    assert.ok(measurements.hidden && measurements.restored && measurements.sameChapter, JSON.stringify(measurements));
    assert.deepEqual(errors, []);
  });
  await test('审查修复：窄侧栏控件可点击，收起、原目录与浮窗切换正常', async () => {
    const { page, errors } = await setup(catalogFixture(), { uiTab: 'course', autoNext: false, autoAnswer: false });
    const ui = page.locator('#cx-video-helper-host');
    for (const width of [270, 210, 160]) {
      await page.locator('#courseSidebar').evaluate((sidebar, width) => { sidebar.style.width = `${width}px`; }, width);
      await page.waitForFunction(width => Math.abs(document.querySelector('#cx-video-helper-host').getBoundingClientRect().width - width) < 1, width);
      const controls = await ui.evaluate(host => {
        const bounds = host.getBoundingClientRect(), root = host.shadowRoot;
        return ['collapse', 'nativeCatalog', 'dockToggle', 'toggle', 'answerOnly', 'resumeMedia', 'retry', 'next', 'tab-course', 'tab-home', 'tab-settings', 'tab-records'].map(id => {
          const button = root.getElementById(id), rect = button.getBoundingClientRect();
          return { id, within: rect.left >= bounds.left && rect.right <= bounds.right + 1,
            clickable: root.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button };
        });
      });
      assert.ok(controls.every(control => control.within && control.clickable), JSON.stringify({ width, controls }));
    }
    await ui.screenshot({ path: path.join(__dirname, '..', 'test-results', 'course-sidebar-narrow.png'), animations: 'disabled' });
    await ui.locator('#collapse').click();
    assert.equal(await ui.locator('#body').isVisible(), false);
    await ui.locator('#collapse').click();
    assert.equal(await ui.locator('#body').isVisible(), true);
    await ui.locator('#nativeCatalog').click();
    assert.equal(await page.locator('#courseSidebar').evaluate(node => node.inert), false);
    await ui.locator('#returnHelper').click();
    assert.equal(await ui.getAttribute('data-docked'), 'true');
    await ui.locator('#dockToggle').click();
    assert.equal(await ui.getAttribute('data-docked'), 'false');
    await ui.locator('#dockToggle').click();
    assert.equal(await ui.getAttribute('data-docked'), 'true');
    await ui.locator('#tab-settings').click();
    await ui.getByRole('tab', { name: '答题', exact: true }).click();
    await ui.locator('#fillLowConfidenceBlanks').check();
    assert.equal(await ui.locator('#fillLowConfidenceBlanks').isChecked(), true);
    assert.deepEqual(errors, []);
  });
  await test('内置目录：延迟出现、根节点替换和侧栏移除时自动恢复', async () => {
    const { page, errors } = await setup('', { uiTab: 'course', autoNext: false, autoAnswer: false });
    const ui = page.locator('#cx-video-helper-host');
    assert.equal(await ui.locator('#chapterEmpty').isVisible(), true);
    assert.equal(await ui.getAttribute('data-docked'), 'false');
    await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), catalogFixture());
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').dataset.docked === 'true');
    await page.locator('#courseSidebar').evaluate(node => { const replacement = node.cloneNode(true); replacement.inert = false; replacement.querySelector('#cur13 .posCatalog_name').title = '1.3 新目录内容'; node.replaceWith(replacement); });
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').shadowRoot.querySelector('[data-chapter-id=cur13]')?.textContent.includes('新目录内容'));
    await ui.locator('[data-chapter-id=cur13]').click();
    assert.deepEqual(await page.evaluate(() => window.chapterClicks), ['cur13']);
    await page.locator('#courseSidebar').evaluate(node => node.remove());
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').dataset.docked === 'false');
    assert.equal(await ui.locator('#chapterEmpty').isVisible(), true);
    assert.equal(await ui.locator('#toggle').isVisible(), true);
    assert.deepEqual(errors, []);
  });
  await test('内置目录：人工切章取消旧题请求，迟到答案不填写', async () => {
    const { page, errors } = await setup(catalogFixture() + choice(1, '切章保护', ['甲', '乙']),
      { ...aiSettings, uiTab: 'course', autoNext: false }, [], { delay: 2000 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('#cx-video-helper-host [data-chapter-id=cur13]').click();
    await page.locator('#cx-video-helper-host #toggle').click();
    assert.ok(await page.evaluate(() => window.apiAborts >= 1));
    await page.waitForTimeout(2100);
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.chapterClicks), ['cur13']);
    assert.deepEqual(errors, []);
  });
  await test('助手内部配置：密钥保存替换测试清除、外部题库编辑与错误反馈', async () => {
    const { page, errors } = await setup('', { uiTab: 'sources', autoAnswer: false, requireWebSearch: false });
    const ui = page.locator('#cx-video-helper-host');
    await ui.locator('#apiSettings summary').click();
    await ui.locator('#apiUrl').fill('https://mock-provider.example/v1');
    await ui.locator('#apiModel').fill('mock-model');
    await ui.locator('#apiKeyInput').fill('panel-test-secret');
    assert.equal(await ui.locator('#apiKeyInput').getAttribute('type'), 'password');
    await ui.locator('#saveApi').click();
    assert.equal(await ui.locator('#apiKeyInput').inputValue(), '');
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), 'panel-test-secret');
    await ui.locator('#testApi').click();
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('apiFeedback').textContent.includes('连接成功'));
    assert.equal(await page.evaluate(() => window.aiRequests[0].headers.Authorization), 'Bearer panel-test-secret');
    await ui.locator('#apiUrl').fill('https://new-provider.example/v1');
    await ui.locator('#apiKeyInput').fill('replacement-secret');
    await ui.locator('#saveApi').click();
    assert.equal(await page.evaluate(key => window.testStore[key].apiKeyOrigin, STORE), 'https://new-provider.example');
    await ui.locator('#saveApi').click();
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), 'replacement-secret');
    await page.evaluate(() => document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('clearApiKey').click());
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), 'replacement-secret');
    await ui.locator('#clearApiKey').click();
    assert.equal(await page.evaluate(key => window.testStore[key].apiKey, STORE), '');
    await ui.locator('#presetProvider').selectOption('ocs');
    const banks = [{ name: '题库', url: 'https://bank.example/search', headers: { Authorization: 'bank-panel-secret' } }];
    await ui.locator('#externalInput').fill(JSON.stringify(banks));
    await ui.locator('#saveExternal').click();
    assert.deepEqual(await page.evaluate(key => window.testStore[key].externalBanks, STORE), banks.map(item=>({...item,method:'POST'})));
    assert.equal(await ui.locator('#externalInput').inputValue(), '');
    await ui.locator('#externalInput').fill('{');
    await ui.locator('#saveExternal').click();
    assert.ok((await ui.locator('#externalFeedback').textContent()).includes('未保存'));
    assert.deepEqual(await page.evaluate(key => window.testStore[key].externalBanks, STORE), banks.map(item=>({...item,method:'POST'})));
    await ui.locator('#clearExternal').click();
    assert.deepEqual(await page.evaluate(key => window.testStore[key].externalBanks, STORE), []);
    await ui.locator('#presetProvider').selectOption('ocs');
    await ui.locator('#apiSettings').scrollIntoViewIfNeeded();
    await ui.screenshot({ path: path.join(__dirname, '..', 'test-results', 'course-api-settings.png'), animations: 'disabled' });
    assert.equal(await page.evaluate(() => window.promptCalls.length), 0);
    assert.ok(!/panel-test-secret|replacement-secret|bank-panel-secret/.test(await ui.locator('#logs').textContent()));
    assert.deepEqual(errors, []);
  });
  await test('查询答案持久缓存，重新打开同题不请求，换选项顺序重新查询', async () => {
    const body = choice(1, '缓存测试', ['甲', '乙']);
    const first = await setup(body, { ...aiSettings, answerCache: true });
    await checked(first.page, 'input[value="B"]');
    await logContains(first.page, '已填写（AI）');
    const cache = await first.page.evaluate(() => window.testStore['cxHelper.answers.v1']);
    assert.equal(cache.length, 1);
    const second = await setup(body, { ...aiSettings, answerCache: true }, [], {}, {}, { cache });
    await checked(second.page, 'input[value="B"]');
    await logContains(second.page, '已填写（答案缓存）');
    assert.equal(await second.page.evaluate(() => window.aiRequests.length), 0);
    const third = await setup(choice(1, '缓存测试', ['乙', '甲']), { ...aiSettings, answerCache: true }, [], {}, {}, { cache });
    await checked(third.page, 'input[value="B"]');
    assert.equal(await third.page.evaluate(() => window.aiRequests.length), 1);
    await second.page.locator('#cx-video-helper-host #bank-tab-cache').click();
    await second.page.locator('#cx-video-helper-host #clearCache').click();
    assert.deepEqual(await second.page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
  });
  await test('单选多选判断随机答案不写入缓存，重新打开仍查询 AI', async () => {
    for (const type of ['单选题', '多选题', '判断题']) {
      const body = choice(1, '随机不缓存', ['甲', '乙', '丙'], type);
      const first = await setup(body, { answerCache: true, randomFallback: true }, [], {}, {}, { randomSequence: [0.1] });
      await logContains(first.page, '已填写（随机选择）');
      const cache = await first.page.evaluate(() => window.testStore['cxHelper.answers.v1']);
      assert.deepEqual(cache, []);
      const second = await setup(body, { ...aiSettings, answerCache: true }, [],
        { answer: { answers: type === '多选题' ? ['B', 'C'] : ['B'], confidence: 1 } }, {}, { cache });
      await logContains(second.page, '已填写（AI）');
      assert.equal(await second.page.evaluate(() => window.aiRequests.length), 1);
      await first.context.close(); await second.context.close();
    }
  });
  await test('旧随机及不可信缓存启动时清理并写回，正常 AI 和外部题库缓存保留', async () => {
    const question = '旧随机缓存';
    const entry = { schemaVersion: 2, scope: require('../tools/font-codec.cjs').sourceFingerprint(JSON.stringify([3, aiSettings.apiUrl, aiSettings.apiModel, [], false, '', true])), at: Date.now(),
      key: JSON.stringify([question, 'single', [['A', '甲'], ['B', '乙']], 0, []]), question, answers: ['A'], confidence: 1, source: 'AI' };
    const valid = [entry, { ...entry, key: '另一道题', source: '外部题库：测试' }];
    const invalid = [
      { ...entry, source: '随机选择', confidence: 0 },
      { ...entry, source: '随机选择' },
      { ...entry, source: undefined },
      { ...entry, source: '答案缓存' },
      { ...entry, lowConfidenceAccepted: true },
      { ...entry, randomEpoch: 0 },
      { ...entry, confidence: 0 }
    ];
    const preserved = await setup(choice(1, question, ['甲', '乙']), { ...aiSettings, answerCache: true }, [], {}, {}, { cache: [...invalid, ...valid] });
    await logContains(preserved.page, '已填写（答案缓存）');
    assert.deepEqual(await preserved.page.evaluate(() => window.testStore['cxHelper.answers.v1']), valid);
    assert.equal(await preserved.page.evaluate(() => window.aiRequests.length), 0);
    for (const answerCache of [true, false]) {
      const { page, context } = await setup(choice(1, question, ['甲', '乙']), { ...aiSettings, answerCache, confidence: 0 }, [], {}, {}, { cache: invalid });
      await logContains(page, '已填写（AI）');
      await checked(page, 'input[value="B"]');
      assert.equal(await page.evaluate(() => window.aiRequests.length), 1);
      const cache = await page.evaluate(() => window.testStore['cxHelper.answers.v1']);
      assert.equal(cache.length, answerCache ? 1 : 0);
      if (answerCache) { assert.equal(cache[0].source, 'AI'); assert.deepEqual(cache[0].answers, ['B']); }
      await context.close();
    }
  });
  await test('多题库 JSON GET/POST、模板和答案路径，优先可匹配结果且不调用 AI', async () => {
    const externalBanks = [
      { name: '第一题库', url: 'https://bank.example/first', method: 'POST', answerPath: 'data.answers', data: { title: '{{question}}', kind: '{{type}}' } },
      { name: '第二题库', url: 'https://bank.example/second', method: 'GET', answerPath: 'data.answer', headers: { Authorization: 'test-bank-key' } }
    ];
    const { page } = await setup(choice(1, '多题库测试', ['甲', '乙']), { ...aiSettings, externalBanks }, [], { external: { '/first': { body: { data: { answers: ['Z'] } } }, '/second': { body: { data: { answer: 'B' } } } } });
    await checked(page, 'input[value="B"]');
    const requests = await page.evaluate(() => window.aiRequests);
    assert.equal(requests.length, 2); assert.equal(requests[0].payload.title, '多题库测试');
    assert.equal(requests[1].method, 'GET');
    await logContains(page, '外部题库：第二题库');
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('test-bank-key'));
  });
  await test('外部题库失败后 AI 回退，配置非法协议不保存', async () => {
    const { page } = await setup(choice(1, '题库失败回退', ['甲', '乙']), { ...aiSettings, externalBanks: [{ name: '失败题库', url: 'https://bank.example/fail' }] }, [], { external: { '/fail': { status: 500 } } });
    await checked(page, 'input[value="B"]');
    assert.equal(await page.evaluate(() => window.aiRequests.length), 2);
    await page.locator('#cx-video-helper-host #presetProvider').selectOption('ocs');
    await menu(page, '配置外部题库', '[{"name":"错误","url":"javascript:alert(1)"}]');
    await logContains(page, '题库配置未保存');
    assert.equal(await page.evaluate((key) => window.testStore[key].externalBanks[0].name, STORE), '失败题库');
  });
  await test('普通图片题发送 Base64 给视觉接口并填写，不缓存图片答案', async () => {
    const { page } = await setup(choice(1, '图片判断<img src="/test-image.png">', ['甲', '乙']), { ...aiSettings, answerCache: true });
    await checked(page, 'input[value="B"]');
    const request = await page.evaluate(() => window.aiRequests[0]);
    assert.ok(request.payload.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,'));
    assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
  });
  await test('阅读理解、完形填空、连线题按子题顺序填写及回读', async () => {
    const group = (className, index) => `<div class="${className}" data-cx-subquestion><span data-subtitle>子题${index}</span><span class="saveSingleSelect" data="A" onclick="this.parentElement.querySelectorAll('span[data]').forEach(n=>n.classList.remove('selected'));this.classList.add('selected')">甲</span><span class="saveSingleSelect" data="B" onclick="this.parentElement.querySelectorAll('span[data]').forEach(n=>n.classList.remove('selected'));this.classList.add('selected')">乙</span></div>`;
    const reading = `<div class="questionLi" data-question-type="阅读理解"><h3>阅读材料</h3>${group('reading_answer', 1)}${group('reading_answer', 2)}</div>`;
    const cloze = `<div class="TiMu" data-question-type="完形填空"><div class="question-title">完形材料</div>${group('filling_answer', 1)}</div>`;
    const line = '<div class="TiMu" data-question-type="连线题"><div class="question-title">连线材料</div><div class="line_answer_ct"><select class="selectBox"><option value="">请选择</option><option value="A">甲</option><option value="B">乙</option></select><select class="selectBox"><option value="">请选择</option><option value="A">甲</option><option value="B">乙</option></select></div></div>';
    const { page } = await setup(reading + cloze + line, { ...aiSettings, queryInterval: 1000 }, [], { byTitle: { '阅读材料': { answers: ['B', 'A'], confidence: 1 }, '完形材料': { answers: ['B'], confidence: 1 }, '连线材料': { answers: ['B', 'A'], confidence: 1 } } });
    await page.waitForFunction(() => [...document.querySelectorAll('.selectBox')].map(n => n.value).join(',') === 'B,A');
    assert.deepEqual(await page.locator('.reading_answer .selected').evaluateAll(nodes => nodes.map(n => n.getAttribute('data'))), ['B', 'A']);
    assert.equal(await page.locator('.filling_answer .selected').getAttribute('data'), 'B');
    const request = await page.evaluate(() => window.aiRequests[0]);
    assert.equal(JSON.parse(request.payload.messages[1].content).groups.length, 2);
  });
  await test('阅读任务按计时翻页，完成前不切章，关闭阅读不翻页', async () => {
    const body = `<div class="ans-job" id="job"><div data-cx-reader data-page="1" data-read-seconds="1"><span class="page-number">1</span><button data-action="next-page" onclick="const r=this.parentElement;r.dataset.page=Number(r.dataset.page)+1;r.querySelector('.page-number').textContent=r.dataset.page;if(r.dataset.page==='3'){this.disabled=true;r.querySelector('[data-action=finish-reading]').hidden=false}">下一页</button><button hidden data-action="finish-reading" onclick="document.querySelector('#job').classList.add('ans-job-finished')">结束阅读</button></div></div>`;
    const { page } = await setup(body, { readDelay: 1000, autoRead: true, nextDelay: 1000 });
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-cx-reader]').getAttribute('data-page'), '1');
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    await page.waitForFunction(() => window.nextClicks === 1, null, { timeout: 8000 });
    assert.equal(await page.locator('[data-cx-reader]').getAttribute('data-page'), '3');
    const disabled = await setup(body, { readDelay: 1000, autoRead: false });
    await disabled.page.waitForTimeout(2200);
    assert.equal(await disabled.page.locator('[data-cx-reader]').getAttribute('data-page'), '1');
  });
  await test('云盘课件：嵌套视频下方按间隔滚动全部内容，不滚动外层或伪造完成', async () => {
    const { page } = await setup('<video></video><div style="height:1400px"></div><div class="ans-job" id="docJob"><iframe id="pdf" src="/ananas/modules/pdf/index.html"></iframe></div>',
      { autoAnswer: false, autoRead: true, readDelay: 1000 }, [], {}, {
        '/ananas/modules/pdf/index.html': '<iframe id="panView" style="height:240px" src="/screen/v2/file_fixture"></iframe>',
        '/screen/v2/file_fixture': cloudReaderFixture(),
      });
    const reader = page.frames().find(f => f.url().endsWith('/screen/v2/file_fixture'));
    await page.waitForTimeout(500);
    assert.equal(await reader.evaluate(() => scrollY), 0);
    await reader.waitForFunction(() => window.reachedBottom, null, { timeout: 15000 });
    const progress = await reader.evaluate(() => ({ positions, height: document.scrollingElement.clientHeight }));
    assert.ok(progress.positions.length > 3, '高于视口的幻灯片必须分段覆盖');
    assert.ok(progress.positions.every((p,i) => p-(progress.positions[i-1] || 0) <= progress.height));
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.locator('#docJob').evaluate(e => e.classList.contains('ans-job-finished')), false);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    const count = progress.positions.length;
    await page.waitForTimeout(2200);
    assert.equal(await reader.evaluate(() => positions.length), count);
  });
  await test('云盘课件：图片延迟加载、关闭阅读、暂停和只答题均不滚动', async () => {
    const { page } = await setup('<div class="ans-job"><iframe src="/screen/v2/file_delayed"></iframe></div>',
      { autoRead: true, readDelay: 1000 }, [], {}, { '/screen/v2/file_delayed': cloudReaderFixture({ delayed: true }) });
    const reader = page.frames().find(f => f.url().endsWith('/screen/v2/file_delayed'));
    await page.waitForTimeout(2200);
    assert.equal(await reader.evaluate(() => scrollY), 0);
    await page.locator('#cx-video-helper-host #autoRead').uncheck();
    await reader.evaluate(() => document.querySelectorAll('img').forEach(img => { img.src = img.dataset.src; }));
    await page.waitForTimeout(2200);
    assert.equal(await reader.evaluate(() => scrollY), 0);
    await page.locator('#cx-video-helper-host #autoRead').check();
    await reader.waitForFunction(() => scrollY > 0);
    await page.locator('#cx-video-helper-host #toggle').click();
    const paused = await reader.evaluate(() => scrollY);
    await page.waitForTimeout(2200);
    assert.equal(await reader.evaluate(() => scrollY), paused);
    await page.locator('#cx-video-helper-host #answerOnly').click();
    await page.waitForTimeout(2200);
    assert.equal(await reader.evaluate(() => scrollY), paused);
  });
  await test('云盘课件：跨域预览独立滚动并响应共享停止设置', async () => {
    const { page } = await setup('<div class="ans-job"><iframe src="https://pan-yz.chaoxing.com/screen/v2/file_cross"></iframe></div>',
      { autoRead: true, readDelay: 1000 }, [], {}, { '/screen/v2/file_cross': cloudReaderFixture() });
    const reader = page.frames().find(f => f.url().includes('pan-yz'));
    await reader.evaluate(() => { window.testStore['cxVideoHelper.settings.v1'].enabled = true; });
    await reader.addScriptTag({ content: script });
    await reader.waitForFunction(() => scrollY > 0);
    assert.equal(await reader.locator('#cx-video-helper-host').count(), 0);
    await reader.evaluate(() => { window.testStore['cxVideoHelper.settings.v1'].enabled = false; });
    const paused = await reader.evaluate(() => scrollY);
    await page.waitForTimeout(2200);
    assert.equal(await reader.evaluate(() => scrollY), paused);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('云盘课件：普通页面同名容器和已完成任务不滚动', async () => {
    const { page } = await setup('<iframe src="/unrelated"></iframe><div class="ans-job ans-job-finished"><iframe src="/screen/v2/file_done"></iframe></div>',
      { autoRead: true, readDelay: 1000, autoNext: false }, [], {}, {
        '/unrelated': cloudReaderFixture(), '/screen/v2/file_done': cloudReaderFixture(),
      });
    await page.waitForTimeout(2200);
    for (const reader of page.frames().slice(1)) assert.equal(await reader.evaluate(() => scrollY), 0);
  });
  await test('独立作业页面正常填写，考试默认停止、开启后逐题切换一次', async () => {
    const work = await setup(choice(1, '独立作业', ['甲', '乙']), aiSettings, [], {}, {}, { path: '/mooc2/work/dowork' });
    await checked(work.page, 'input[value="B"]');
    const body = `<input name="examId" value="1">${choice(1, '考试题', ['甲', '乙'])}<button id="nextQuestion" onclick="window.examNextClicks=(window.examNextClicks||0)+1">下一题</button><button id="submitExam" onclick="window.examSubmits=(window.examSubmits||0)+1">提交</button>`;
    const stopped = await setup(body, aiSettings, [], {}, {}, { path: '/exam-ans/exam/test/reVersionTestStartNew' });
    assert.equal(await stopped.page.locator('.TiMu input:checked').count(), 0);
    const exam = await setup(body, { ...aiSettings, examEnabled: true, examNext: true, autoSubmit: true }, [], {}, {}, { path: '/exam-ans/exam/test/reVersionTestStartNew' });
    await exam.page.waitForFunction(() => window.examNextClicks === 1);
    await exam.page.waitForTimeout(1500);
    assert.equal(await exam.page.evaluate(() => window.examNextClicks), 1);
    assert.equal(await exam.page.evaluate(() => window.examSubmits || 0), 0);
    assert.equal(await exam.page.evaluate(() => window.nextClicks), 0);
  });
  await test('跨域图片画布失败后通过油猴读取原图，关闭视觉不发送图片', async () => {
    const body = choice(1, '跨域图片<img src="/test-image.png">', ['甲', '乙']);
    const enabled = await setup(body, aiSettings, [], {}, {}, { taintedCanvas: true });
    await checked(enabled.page, 'input[value="B"]');
    assert.equal(await enabled.page.evaluate(() => window.imageRequests), 1);
    const disabled = await setup(body, { ...aiSettings, visionImages: false });
    await logContains(disabled.page, '图片题识别未开启');
    assert.equal(await disabled.page.evaluate(() => window.aiRequests.length), 0);
    assert.equal(await disabled.page.locator('.TiMu input:checked').count(), 0);
  });
  await test('暂停中止全部并行题库请求，迟到的结果不填写和缓存', async () => {
    const externalBanks = [{ name: '一', url: 'https://bank.example/slow1' }, { name: '二', url: 'https://bank.example/slow2' }];
    const { page } = await setup(choice(1, '并行暂停', ['甲', '乙']), { externalBanks, answerCache: true, randomFallback: true }, [], { external: { '/slow1': { body: { answers: ['B'] }, delay: 2000 }, '/slow2': { body: { answers: ['B'] }, delay: 2000 } } });
    await page.waitForFunction(() => window.aiRequests.length === 2);
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(() => window.apiAborts), 2);
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
  });
  await test('组合题答案缺项不填写，已有子题答案保留', async () => {
    const body = '<div class="TiMu" data-question-type="阅读理解"><div class="question-title">缺项阅读</div><div class="reading_answer"><input type="radio" name="sub1" value="A"><input type="radio" name="sub1" value="B"></div><div class="reading_answer"><input type="radio" name="sub2" value="A"><input type="radio" name="sub2" value="B"></div></div>';
    const missing = await setup(body, aiSettings, [], { answer: { answers: ['A'], confidence: 1 } });
    await logContains(missing.page, '子题答案数量');
    assert.equal(await missing.page.locator('.TiMu input:checked').count(), 0);
    const manual = await setup(body.replace('name="sub1" value="A"', 'name="sub1" value="A" checked'), aiSettings);
    await logContains(manual.page, '保留现有答案');
    assert.equal(await manual.page.locator('.TiMu input:checked').count(), 1);
    assert.equal(await manual.page.evaluate(() => window.aiRequests.length), 0);
  });
  await test('考试题量未知时即使开启交卷仍等待人工核对', async () => {
    const body = `<input name="examId" value="1">${choice(1, '完整考试', ['甲', '乙'])}<button id="submitExam" onclick="window.examSubmits=(window.examSubmits||0)+1">提交</button>`;
    const { page } = await setup(body, { ...aiSettings, examEnabled: true, examSubmit: true, autoSubmit: true }, [], {}, {}, { path: '/exam-ans/exam/test/reVersionTestStartNew' });
    await logContains(page, '已填写（AI）');
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.examSubmits || 0), 0);
    await page.locator('#cx-video-helper-host #examEnabled').uncheck();
    assert.equal(await page.locator('#cx-video-helper-host #toggle').textContent(), '开始');
  });
  await test('读书下拉分页、旧版阅读器和链接任务只操作页面入口', async () => {
    const body = `<div class="ans-job" id="book"><div id="reader"><select id="pagejump" onchange="window.pagesRead=(window.pagesRead||[]).concat(this.value)"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div></div>`;
    const book = await setup(body, { autoRead: true, readDelay: 1000 });
    await book.page.waitForFunction(() => document.querySelector('#pagejump').value === '3');
    assert.deepEqual(await book.page.evaluate(() => window.pagesRead), ['2', '3']);
    assert.equal(await book.page.evaluate(() => window.nextClicks), 0);
    const legacy = await setup('<div class="ans-job"><div id="ReadWeb"></div></div><script>window.epage=3;window.bookPages=[];window.readweb={goto:n=>window.bookPages.push(n)};window.finishJob=()=>window.fakeFinish=true</script>', { autoRead: true, readDelay: 1000 });
    await legacy.page.waitForFunction(() => window.bookPages.length === 2);
    assert.deepEqual(await legacy.page.evaluate(() => window.bookPages), [2, 3]);
    assert.equal(await legacy.page.evaluate(() => Boolean(window.fakeFinish)), false);
    const link = await setup('<div class="ans-job"><a data-cx-link-task href="#read" onclick="window.linkClicks=(window.linkClicks||0)+1">阅读链接</a></div>', { readDelay: 1000 });
    await link.page.waitForFunction(() => window.linkClicks === 1);
    await link.page.waitForTimeout(1500);
    assert.equal(await link.page.evaluate(() => window.linkClicks), 1);
    assert.equal(await link.page.evaluate(() => window.nextClicks), 0);
  });
  await test('跨域阅读 iframe 独立运行，无重复窗口，顶层暂停后停止翻页', async () => {
    const childHTML = '<div id="reader"><select id="pagejump" onchange="window.readClicks=(window.readClicks||0)+1"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div>';
    const { page } = await setup('<iframe src="https://reader.sslibrary.com/readsvr/book/mooc"></iframe>', { autoRead: true, readDelay: 1000 }, [], {}, { '/readsvr/book/mooc': childHTML });
    const frame = page.frames().find(f => f.url().includes('sslibrary'));
    await frame.evaluate(() => { window.testStore['cxVideoHelper.settings.v1'].enabled = true; });
    await frame.addScriptTag({ content: script });
    await frame.waitForFunction(() => window.readClicks === 1);
    assert.equal(await frame.locator('#cx-video-helper-host').count(), 0);
    await frame.evaluate(() => { window.testStore['cxVideoHelper.settings.v1'].enabled = false; });
    await frame.waitForTimeout(2000);
    assert.equal(await frame.evaluate(() => window.readClicks), 1);
    assert.equal(await page.locator('#cx-video-helper-host').count(), 1);
  });
  await test('真实考试下一题入口连续处理动态题目，装饰图片不触发视觉查询', async () => {
    const first = choice(1, '第一页题目', ['甲', '乙']);
    const second = choice(2, '第二页题目', ['丙', '丁']);
    const body = `<input name="examId" value="1"><div id="examBody">${first}</div><button onclick="getTheNextQuestion(1)">下一题</button><button id="submitExam" onclick="window.examSubmits=(window.examSubmits||0)+1">交卷</button><script>window.getTheNextQuestion=()=>{window.moves=(window.moves||0)+1;document.querySelector('#examBody').innerHTML=${JSON.stringify(second)};document.querySelector('[onclick=\"getTheNextQuestion(1)\"]').remove();};</script>`;
    const { page } = await setup(body, { ...aiSettings, examEnabled: true, examNext: true, queryInterval: 1000 }, [], {}, {}, { path: '/exam-ans/exam/test/reVersionTestStartNew' });
    await page.waitForFunction(() => document.querySelector('[data-id="2"] input[value="B"]')?.checked);
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(() => window.moves), 1);
    assert.equal(await page.evaluate(() => window.examSubmits || 0), 0);
    assert.equal(await page.evaluate(() => window.aiRequests.length), 2);
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写全部题目'));
    const decorative = await setup(choice(1, '纯文字题', ['甲', '乙']).replace('</ul>', '</ul><img class="icon" src="/broken-icon.png">'), aiSettings);
    await checked(decorative.page, 'input[value="B"]');
    assert.equal(typeof (await decorative.page.evaluate(() => window.aiRequests[0].payload.messages[1].content)), 'string');
  });
  await test('新版考试多选点击内部文本并确认延迟状态图标，不重复识别嵌套选项', async () => {
    const options = ['甲', '乙', '丙'].map((text, index) => `<div class="answerBg"><div class="singleoption"><i class="num_option">${String.fromCharCode(65 + index)}</i><span class="answer_p" onclick="window.optionClicks=(window.optionClicks||0)+1;const icon=this.parentElement.querySelector('i');setTimeout(()=>icon.classList.toggle('check_answer_duox'),350)">${text}</span></div></div>`).join('');
    const { page } = await setup(`<div class="questionLi"><h3>物理爆炸多选</h3><input name="type1" value="1" type="hidden"><div class="stem_answer">${options}</div></div>`, aiSettings, [], { answer: { answers: ['AC'], confidence: 1 } });
    await logContains(page, '已填写（AI）');
    assert.deepEqual(await page.locator('.check_answer_duox').evaluateAll(nodes => nodes.map(n => n.textContent)), ['A', 'C']);
    assert.equal(await page.evaluate(() => window.optionClicks), 2);
  });
  await test('选项状态标记仅影响所属选项，页面没有确认时仍报错', async () => {
    const body = '<div class="questionLi"><h3>状态未响应</h3><input name="type1" value="1" type="hidden"><div class="stem_answer"><div class="answerBg"><span class="answer_p" onclick="window.optionClicks=(window.optionClicks||0)+1">甲</span></div><div class="answerBg"><span class="answer_p">乙</span></div></div></div>';
    const { page } = await setup(body, aiSettings, [], { answer: { answers: ['A', 'B'], confidence: 1 } });
    await logContains(page, '页面未确认选中');
    assert.equal(await page.evaluate(() => window.optionClicks), 1);
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（AI）'));
  });
  await test('重新查询已有单选、多选和文字答案，替换后不重复查询', async () => {
    const body = choice(1, '重查单选', ['甲', '乙']).replace('value="A"', 'value="A" checked')
      + choice(2, '重查多选', ['甲', '乙', '丙'], '多选题').replace('value="B"', 'value="B" checked')
      + blank(3, '重查文字').replace('</textarea>', '旧答案</textarea>');
    const { page } = await setup(body, { ...aiSettings, overwriteAnswers: true, queryInterval: 1000 }, [], { byTitle: { '重查多选': { answers: ['AC'], confidence: 1 }, '重查文字': { answers: ['新答案'], confidence: 1 } } });
    await page.waitForFunction(() => document.querySelector('#ans3_0').value === '新答案');
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('[data-id="1"] input:checked').inputValue(), 'B');
    assert.deepEqual(await page.locator('[data-id="2"] input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['A', 'C']);
    assert.equal(await page.evaluate(() => window.aiRequests.length), 3);
    assert.equal(await page.locator('#cx-video-helper-host #logs').evaluate(node => (node.textContent.match(/检测到已有答案，重新查题并按查询结果替换/g)||[]).length),3);
  });
  await test('重新查题保留查询期间的手动修改，失败时保留原答案', async () => {
    const body = choice(1, '重查保护', ['甲', '乙', '丙']).replace('value="A"', 'value="A" checked');
    const { page } = await setup(body, { ...aiSettings, overwriteAnswers: true }, [], { delay: 1200 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('input[value="C"]').check();
    await logContains(page, '查询期间题目已被手动修改');
    assert.equal(await page.locator('.TiMu input:checked').inputValue(), 'C');
    const failed = await setup(body, { ...aiSettings, overwriteAnswers: true }, [], { status: 500 });
    await logContains(failed.page, 'HTTP 500');
    assert.equal(await failed.page.locator('.TiMu input:checked').inputValue(), 'A');
  });
  await test('等待中的查询可取消重试，总耗时超时后退出查询状态', async () => {
    const { page } = await setup(choice(1, '等待重试', ['甲', '乙']), aiSettings, [], { delay: 1800 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('#cx-video-helper-host #retry').click();
    await checked(page, 'input[value="B"]');
    assert.equal(await page.evaluate(() => window.apiAborts), 1);
    assert.equal(await page.evaluate(() => window.aiRequests.length), 2);
    const timeout = await setup(choice(1, '总耗时', ['甲', '乙']), aiSettings, [], { delay: 3000, fastQueryDeadline: true });
    await logContains(timeout.page, '查题总耗时超过 90 秒');
    await timeout.page.waitForTimeout(300);
    assert.ok(!(await timeout.page.locator('#cx-video-helper-host #status').textContent()).includes('正在查询答案'));
    assert.equal(await timeout.page.evaluate(() => window.apiAborts), 1);
  });
  await test('低信心填空：默认拦截，开启即重试并保存开关，填写后不缓存', async () => {
    const { page } = await setup(blank(1, '两个空的低信心答案', 2), { ...aiSettings, answerCache: true }, [], { answer: { answers: ['甲', '乙'], confidence: 0.2 } });
    await logContains(page, '低于设置阈值');
    assert.deepEqual(await page.locator('.TiMu textarea').evaluateAll(nodes => nodes.map(n => n.value)), ['', '']);
    const toggle = page.locator('#cx-video-helper-host #fillLowConfidenceBlanks');
    assert.equal(await toggle.isChecked(), false);
    await toggle.check();
    await logContains(page, '已填写（AI）');
    assert.deepEqual(await page.locator('.TiMu textarea').evaluateAll(nodes => nodes.map(n => n.value)), ['甲', '乙']);
    assert.equal(await page.evaluate(() => window.testStore['cxVideoHelper.settings.v1'].fillLowConfidenceBlanks), true);
    assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
    await toggle.uncheck();
    assert.equal(await page.evaluate(() => window.testStore['cxVideoHelper.settings.v1'].fillLowConfidenceBlanks), false);
    assert.deepEqual(await page.locator('.TiMu textarea').evaluateAll(nodes => nodes.map(n => n.value)), ['甲', '乙']);
  });
  await test('低信心填空：零信心可填写，缺项及其他题型仍拦截', async () => {
    const config = { ...aiSettings, fillLowConfidenceBlanks: true, compareRandomConfidence: false, randomFallback: false };
    const zero = await setup(blank(1, '零信心填空'), config, [], { answer: { answers: ['甲'], confidence: 0 } });
    await logContains(zero.page, '已填写（AI）');
    assert.equal(await zero.page.locator('.TiMu textarea').inputValue(), '甲');
    const missing = await setup(blank(1, '缺少一个答案', 2), config, [], { answer: { answers: ['甲'], confidence: 0.2 } });
    await logContains(missing.page, '答案数量与输入框数量不一致');
    assert.deepEqual(await missing.page.locator('.TiMu textarea').evaluateAll(nodes => nodes.map(n => n.value)), ['', '']);
    const essay = await setup(blank(1, '简答题仍遵守阈值', 1, '简答题'), config, [], { answer: { answers: ['甲'], confidence: 0.2 } });
    await logContains(essay.page, '低于设置阈值');
    assert.equal(await essay.page.locator('.TiMu textarea').inputValue(), '');
    const single = await setup(choice(1, '单选仍遵守阈值', ['甲', '乙']), config, [], { answer: { answers: ['B'], confidence: 0.2 } });
    await logContains(single.page, '低于设置阈值');
    assert.equal(await single.page.locator('.TiMu input:checked').count(), 0);
  });
  await test('低信心填空：查询中关闭开关取消旧请求，后续低信心不填写', async () => {
    const { page } = await setup(blank(1, '关闭填空策略'), { ...aiSettings, fillLowConfidenceBlanks: true }, [], { delay: 600, answer: { answers: ['甲'], confidence: 0.2 } });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('#cx-video-helper-host #fillLowConfidenceBlanks').uncheck();
    await logContains(page, '低于设置阈值');
    assert.ok(await page.evaluate(() => window.apiAborts >= 1));
    assert.equal(await page.locator('.TiMu textarea').inputValue(), '');
  });
  await test('低信心 AI 高于单选及多选随机基准仍采用且不写缓存', async () => {
    for (const type of ['单选题', '多选题']) {
      const { page, context } = await setup(choice(1, '低信心策略', ['甲', '乙', '丙', '丁'], type), { ...aiSettings, compareRandomConfidence: true, confidence: 0.85, answerCache: true, randomFallback: true }, [], { answer: { answers: type === '单选题' ? ['B'] : ['AC'], confidence: 0.4 } });
      await logContains(page, '已填写（AI）');
      await logContains(page, '高于随机基准');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), type === '单选题' ? ['B'] : ['A', 'C']);
      assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
      await context.close();
    }
  });
  await test('低信心不高于随机基准或标签无法匹配时随机至少两项多选', async () => {
    for (const answer of [{ answers: ['BD'], confidence: 0.01 }, { answers: ['Z'], confidence: 0.8 }]) {
      const { page, context } = await setup(choice(1, '多选随机策略', ['甲', '乙', '丙', '丁'], '多选题'), { ...aiSettings, compareRandomConfidence: true, randomFallback: true }, [], { answer }, {}, { randomSequence: [0.9, 0.9, 0.9, 0.9, 0.1, 0.9, 0.1, 0.9] });
      await logContains(page, '已填写（随机选择）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['A', 'C']);
      await context.close();
    }
  });
  await test('多选拒绝单项及去重后单项的 AI 答案，保留原答案且不缓存提交', async () => {
    for (const answers of [['A'], ['A', 'A'], ['A', '甲']]) {
      const body = choice(1, '多选不足两项', ['甲', '乙', '丙'], '多选题').replace('value="C"', 'value="C" checked')
        + '<button id="submit" onclick="window.submitClicks++">提交</button>';
      const { page, context } = await setup(body, { ...aiSettings, overwriteAnswers: true, answerCache: true, autoSubmit: true }, [], { answer: { answers, confidence: 1 } });
      await logContains(page, '多选题至少需要两个不同选项');
      await page.waitForTimeout(1300);
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['C']);
      assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
      assert.equal(await page.evaluate(() => window.submitClicks), 0);
      assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写'));
      const request = await page.evaluate(() => window.aiRequests[0].payload);
      assert.equal(JSON.parse(request.messages[1].content).type, 'multiple');
      assert.ok(request.messages[0].content.includes('至少两个不同的选项字母标签'));
      await context.close();
    }
  });
  await test('多选的本地题库及缓存单项答案无效时继续AI，AI仍单项则不填写', async () => {
    const question = '多选题库校验';
    const cached = { schemaVersion: 2, scope: require('../tools/font-codec.cjs').sourceFingerprint(JSON.stringify([3, aiSettings.apiUrl, aiSettings.apiModel, [], false, '', true])), at: Date.now(),
      key: JSON.stringify([question, 'multiple', [['A', '甲'], ['B', '乙'], ['C', '丙']], 0, []]), question, answers: ['A'], confidence: 1, source: 'AI' };
    for (const source of ['bank', 'cache']) {
      const { page, context } = await setup(choice(1, question, ['甲', '乙', '丙'], '多选题'), { ...aiSettings, answerCache: true },
        source === 'bank' ? [{ question, answers: ['A'] }] : [], {}, {}, { cache: source === 'cache' ? [cached] : [] });
      await logContains(page, '多选题至少需要两个不同选项');
      assert.equal(await page.locator('.TiMu input:checked').count(), 0);
      assert.equal(await page.evaluate(() => window.aiRequests.length), 1);
      await context.close();
    }
  });
  await test('外部题库多选单项答案无效，继续使用 AI 的两项答案', async () => {
    const { page } = await setup(choice(1, '外部多选校验', ['甲', '乙', '丙'], '多选题'),
      { ...aiSettings, externalBanks: [{ name: '测试题库', url: 'https://bank.example/multiple' }] }, [],
      { external: { '/multiple': { body: { answers: ['A'] } } }, answer: { answers: ['B', 'C'], confidence: 1 } });
    await logContains(page, '已填写（AI）');
    assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['B', 'C']);
    assert.equal(await page.evaluate(() => window.aiRequests.length), 2);
  });
  await test('多选随机兜底拒绝空集和单项，AI 单项或空答案均只能回退到至少两项', async () => {
    for (const answers of [['B'], []]) {
      const { page, context } = await setup(choice(1, '多选随机最少两项', ['甲', '乙', '丙', '丁'], '多选题'),
        { ...aiSettings, randomFallback: true, answerCache: true }, [], { answer: { answers, confidence: 1 } }, {},
        { randomSequence: [0.9, 0.9, 0.9, 0.9, 0.1, 0.9, 0.9, 0.9, 0.1, 0.9, 0.1, 0.9] });
      await logContains(page, '已填写（随机选择）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['A', 'C']);
      assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
      await context.close();
    }
  });
  await test('多选随机基准排除空集和单项组合，并按可用选项数计算', async () => {
    for (const scenario of [
      { confidence: 0.08, baseline: 1 / 11 }, { confidence: 1 / 11, baseline: 1 / 11 }, { confidence: 0.1, baseline: 1 / 11 },
      { confidence: 0.2, baseline: 1 / 4, disabled: true }, { confidence: 0.3, baseline: 1 / 4, disabled: true },
    ]) {
      let body = choice(1, '多选基准校验', ['甲', '乙', '丙', '丁'], '多选题');
      if (scenario.disabled) body = body.replace('value="D"', 'value="D" disabled');
      const { page, context } = await setup(body, { ...aiSettings, compareRandomConfidence: true, randomFallback: true }, [],
        { answer: { answers: ['A', 'C'], confidence: scenario.confidence } }, {}, { randomSequence: [0.1] });
      const useAI = scenario.confidence > scenario.baseline;
      await logContains(page, useAI ? '已填写（AI）' : '已填写（随机选择）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)),
        useAI ? ['A', 'C'] : scenario.disabled ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);
      await context.close();
    }
  });
  await test('多选可用选项不足两项时停止随机填写，恰好两项时选中两项', async () => {
    for (const count of [1, 2]) {
      let body = choice(1, '多选可用选项数量', ['甲', '乙', '丙'], '多选题').replace('value="C"', 'value="C" disabled');
      if (count === 1) body = body.replace('value="B"', 'value="B" disabled');
      const { page, context } = await setup(body, { randomFallback: true }, [], {}, {}, { randomSequence: [0.9] });
      await logContains(page, count === 1 ? '多选题可用选项不足两个' : '已填写（随机选择）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), count === 1 ? [] : ['A', 'B']);
      await context.close();
    }
  });
  await test('判断题低信心比较严格区分低于等于高于50%，随机与低信心结果不缓存', async () => {
    for (const confidence of [0.3, 0.5, 0.6]) {
      const { page, context } = await setup(choice(1, '判断信心策略', ['错误', '正确'], '判断题'),
        { ...aiSettings, confidence: 0.85, compareRandomConfidence: true, randomFallback: true, answerCache: true }, [],
        { answer: { answers: [true], confidence } }, {}, { randomSequence: [0.01] });
      await logContains(page, confidence > 0.5 ? '已填写（AI）' : '已填写（随机选择）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), [confidence > 0.5 ? 'B' : 'A']);
      assert.deepEqual(await page.evaluate(() => window.testStore['cxHelper.answers.v1']), []);
      await context.close();
    }
  });
  await test('判断题关闭比较后低信心随机，接口失败和无匹配答案也兜底并避开禁用选项', async () => {
    for (const api of [{ answer: { answers: ['A'], confidence: 0.6 } }, { status: 500 }, { answer: { answers: ['Z'], confidence: 1 } }]) {
      const { page, context } = await setup(choice(1, '判断随机兜底', ['正确', '错误'], '判断题').replace('value="A"', 'value="A" disabled'),
        { ...aiSettings, compareRandomConfidence: false, randomFallback: true }, [], api);
      await logContains(page, '已填写（随机选择）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['B']);
      await context.close();
    }
  });
  await test('判断题失败后开启随机可重试，关闭随机不填写', async () => {
    const { page } = await setup(choice(1, '判断开关', ['正确', '错误'], '判断题'),
      { ...aiSettings, compareRandomConfidence: true, randomFallback: false }, [], { answer: { answers: ['A'], confidence: 0.2 } });
    await logContains(page, '低于设置阈值');
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
    await page.locator('#cx-video-helper-host #randomFallback').check();
    await logContains(page, '已填写（随机选择）');
    assert.equal(await page.locator('.TiMu input:checked').count(), 1);
  });
  await test('判断题随机兜底保留查询期间手动改动，暂停不填写', async () => {
    for (const pause of [false, true]) {
      const { page, context } = await setup(choice(1, '判断等待保护', ['正确', '错误'], '判断题'),
        { ...aiSettings, randomFallback: true, overwriteAnswers: true }, [], { answer: { answers: ['B'], confidence: 0.2 }, delay: 1200 }, {}, { randomSequence: [0.99] });
      await page.waitForFunction(() => window.aiRequests.length === 1);
      if (pause) await page.locator('#cx-video-helper-host #toggle').click();
      else await page.locator('input[value="A"]').check();
      await page.waitForTimeout(1800);
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), pause ? [] : ['A']);
      assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（随机选择）'));
      await context.close();
    }
  });
  await test('关闭随机开关后等待中的低信心答案不随机填写，低信心比较仍是独立策略', async () => {
    for (const compare of [false, true]) {
      const { page, context } = await setup(choice(1, '关闭随机等待', ['正确', '错误'], '判断题'),
        { ...aiSettings, randomFallback: true, compareRandomConfidence: compare }, [], { answer: { answers: ['B'], confidence: 0.6 }, delay: 1200 });
      await page.waitForFunction(() => window.aiRequests.length === 1);
      await page.locator('#cx-video-helper-host #randomFallback').uncheck();
      await page.waitForTimeout(1800);
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), compare ? ['B'] : []);
      assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('随机选择'));
      assert.equal(await page.evaluate(store => window.testStore[store].randomFallback, STORE), false);
      await context.close();
    }
  });
  await test('随机多选填写中关闭开关立即停止后续点击，不提交未完成随机结果', async () => {
    const disable = `onclick="const input=document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('randomFallback');input.checked=false;input.dispatchEvent(new Event('change'));"`;
    const body = choice(1, '关闭随机进行中', ['甲', '乙', '丙'], '多选题').replace('value="A"', `value="A" ${disable}`)
      + '<button id="submit" onclick="window.submitClicks++">提交</button>';
    const { page } = await setup(body, { randomFallback: true, autoSubmit: true }, [], {}, {}, { randomSequence: [0.1] });
    await logContains(page, '随机兜底已关闭');
    await page.waitForTimeout(1500);
    assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['A']);
    assert.equal(await page.evaluate(() => window.submitClicks), 0);
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（随机选择）'));
  });
  await test('随机多选排除禁用项，单选信心等于基准不采用 AI', async () => {
    const disabled = await setup(choice(1, '禁用多选', ['甲', '乙', '丙'], '多选题').replace('value="B"', 'value="B" disabled'), { randomFallback: true }, [], {}, {}, { randomSequence: [0.1, 0.1] });
    await logContains(disabled.page, '已填写（随机选择）');
    assert.deepEqual(await disabled.page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['A', 'C']);
    const equal = await setup(choice(1, '基准相等', ['甲', '乙', '丙', '丁']), { ...aiSettings, compareRandomConfidence: true, randomFallback: true }, [], { answer: { answers: ['B'], confidence: 0.25 } }, {}, { randomSequence: [0.01] });
    await logContains(equal.page, '已填写（随机选择）');
    assert.equal(await equal.page.locator('.TiMu input:checked').inputValue(), 'A');
  });
  await test('多选兼容连续字母、分隔标签、字母文本和重复答案', async () => {
    for (const answers of [['AC'], ['a、c'], ['答案：A,C'], ['[A C]'], ['A. 甲', 'C、丙'], ['A. 甲；C. 丙'], ['A', 'C', 'A']]) {
      const { page, context } = await setup(choice(1, '多选格式', ['甲', '乙', '丙'], '多选题'), aiSettings, [], { answer: { answers, confidence: 1 } });
      await logContains(page, '已填写（AI）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), ['A', 'C']);
      await context.close();
    }
  });
  await test('多选完整英文缩写和含分隔符文本不拆分，标签冲突及未知标签不填写', async () => {
    for (const answers of [['AC', '其他'], ['甲,乙', '其他']]) {
      const { page, context } = await setup(choice(1, '完整文本', ['AC', '甲,乙', '其他'], '多选题'), aiSettings, [], { answer: { answers, confidence: 1 } });
      await logContains(page, '已填写（AI）');
      assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll(nodes => nodes.map(n => n.value)), answers[0] === 'AC' ? ['A', 'C'] : ['B', 'C']);
      await context.close();
    }
    for (const answers of [['AC'], ['甲,乙']]) {
      const { page, context } = await setup(choice(1, '完整文本不足两项', ['AC', '甲,乙', '其他'], '多选题'), aiSettings, [], { answer: { answers, confidence: 1 } });
      await logContains(page, '多选题至少需要两个不同选项');
      assert.equal(await page.locator('.TiMu input:checked').count(), 0);
      await context.close();
    }
    for (const answers of [['A. 丙', 'C'], ['AZ'], ['相同']]) {
      const { page, context } = await setup(choice(1, '歧义文本', ['相同', '相同', '丙'], '多选题'), aiSettings, [], { answer: { answers, confidence: 1 } });
      await logContains(page, '答案不能唯一匹配选项');
      assert.equal(await page.locator('.TiMu input:checked').count(), 0);
      await context.close();
    }
  });
  await test('考试整卷预览缺少核对记录时不能触发交卷确认', async () => {
    const body = '<input name="examId" value="1"><input name="questionId" value="1"><input id="answer1" value="A"><div class="question-pagination" data-total-pages="2"></div>'
      + choice(1, '预览已有答案', ['甲', '乙'])
      + '<button onclick="window.submits=(window.submits||0)+1">交卷</button><div role="dialog">确认交卷？<button onclick="window.confirms=(window.confirms||0)+1">确定</button></div>';
    const { page } = await setup(body, { ...aiSettings, examEnabled: true, examSubmit: true, autoSubmit: true, overwriteAnswers: true }, [], {}, {}, { path: '/exam-ans/mooc2/exam/preview' });
    await logContains(page, '手动交卷');
    await page.waitForTimeout(1800);
    assert.deepEqual(await page.evaluate(() => [window.submits || 0, window.confirms || 0]), [0, 0]);
    assert.equal(await page.locator('#cx-video-helper-host #examSubmit').count(), 1);
  });
  await test('考试提交关闭时不点击末题下一步、交卷和无关确认框', async () => {
    const body = `<input name="examId" value="1">${choice(85, '关闭交卷', ['甲', '乙'])}<button onclick="window.steps=(window.steps||0)+1">下一步</button><button onclick="window.submits=(window.submits||0)+1">交卷</button><div role="dialog">确认退出考试？<button onclick="window.confirms=(window.confirms||0)+1">确定</button></div>`;
    const { page } = await setup(body, { ...aiSettings, examEnabled: true, examSubmit: false, autoSubmit: true, examNext: true }, [], {}, {}, { path: '/exam-ans/exam/test/reVersionTestStartNew' });
    await logContains(page, '已填写（AI）'); await page.waitForTimeout(1800);
    assert.deepEqual(await page.evaluate(() => [window.steps || 0, window.submits || 0, window.confirms || 0]), [0, 0, 0]);
  });
  await test('无接口随机单选及多选，保留已有答案、不随机填空', async () => {
    const body = choice(1, '未命中', ['甲', '乙', '丙', '丁'])
      + choice(2, '已有答案', ['甲', '乙']).replace('value="B"', 'value="B" checked')
      + choice(3, '多选', ['甲', '乙'], '多选题') + blank(4, '填空');
    const { page } = await setup(body, { randomFallback: true, queryInterval: 1000 });
    await logContains(page, '已填写（随机选择）');
    await page.waitForTimeout(3500);
    assert.equal(await page.locator('[data-id="1"] input:checked').count(), 1);
    assert.equal(await page.locator('[data-id="2"] input:checked').inputValue(), 'B');
    assert.equal(await page.locator('[data-id="3"] input:checked').count(), 2);
    assert.equal(await page.locator('#ans4_0').inputValue(), '');
    assert.equal(await page.evaluate(() => window.submitClicks), 0);
  });
  await test('低信心、无匹配答案、接口错误均随机单选且避开禁用选项', async () => {
    for (const api of [{ answer: { answers: ['B'], confidence: 0.1 } }, { answer: { answers: ['Z'], confidence: 1 } }, { status: 500 }]) {
      const body = choice(1, '随机兜底', ['甲', '乙', '丙', '丁'])
        .replace('value="A"', 'value="A" disabled').replace('value="B"', 'value="B" disabled').replace('value="C"', 'value="C" disabled');
      const { page, context } = await setup(body, { ...aiSettings, randomFallback: true }, [], api);
      await checked(page, 'input[value="D"]');
      await logContains(page, '已填写（随机选择）');
      assert.equal(await page.locator('.TiMu input:checked').count(), 1);
      await context.close();
    }
  });
  await test('随机兜底不覆盖等待期间手动填写，也不在暂停后写入', async () => {
    const { page } = await setup(choice(1, '等待手填', ['甲', '乙']), { ...aiSettings, randomFallback: true }, [], { status: 500, delay: 1200 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('input[value="A"]').check();
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('.TiMu input:checked').inputValue(), 'A');
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（随机选择）'));
    const second = await setup(choice(1, '暂停兜底', ['甲', '乙']), { ...aiSettings, randomFallback: true }, [], { status: 500, delay: 1200 });
    await second.page.waitForFunction(() => window.aiRequests.length === 1);
    await second.page.locator('#cx-video-helper-host #toggle').click();
    await second.page.waitForTimeout(1800);
    assert.equal(await second.page.locator('.TiMu input:checked').count(), 0);
  });
  await test('已失败单选开启随机开关后重新处理，记录随机来源', async () => {
    const { page } = await setup(choice(1, '原先失败', ['甲', '乙', '丙']));
    await logContains(page, '本地题库未命中');
    await page.locator('#cx-video-helper-host #randomFallback').check();
    await logContains(page, '已填写（随机选择）');
    assert.equal(await page.locator('.TiMu input:checked').count(), 1);
    assert.ok((await page.locator('#cx-video-helper-host #answers').textContent()).includes('随机选择'));
  });
  await test('扩展丢失全部请求回调时仍超时退出并中止请求', async () => {
    const { page } = await setup(choice(1, '测试超时', ['甲', '乙']), aiSettings, [], { silent: true });
    await logContains(page, 'AI 请求超过 60 秒');
    assert.equal(await page.evaluate(() => window.apiAborts), 1);
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
    assert.equal(await page.evaluate(() => window.aiRequests.length), 1);
    await page.waitForFunction(() => !document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('status').textContent.includes('正在查询答案'));
  });

  await test('五种题型：本地题库填写，默认不提交，不误切章', async () => {
    const body = choice(1, '地球是？', ['行星', '恒星']) + choice(2, '哪些是偶数？', ['2', '3', '4'], '多选题')
      + choice(3, '水是液体。', ['正确', '错误'], '判断题') + blank(4, '两个空', 2) + blank(5, '描述水', 1, '简答题')
      + '<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>';
    const bank = [
      { question: '地球是？', answers: ['行星'] }, { question: '哪些是偶数？', answers: ['A', 'C'] },
      { question: '水是液体。', answers: [true] }, { question: '两个空', answers: ['甲', '乙'] }, { question: '描述水', answers: ['水是一种物质。'] },
    ];
    const { page, errors } = await setup(body, {}, bank);
    await page.waitForFunction(() => document.querySelector('#ans5_0').value === '水是一种物质。', null, { timeout: 23000 });
    assert.deepEqual(await page.locator('.TiMu input:checked').evaluateAll((nodes) => nodes.map((n) => [n.name, n.value])), [['q1', 'A'], ['q2', 'A'], ['q2', 'C'], ['q3', 'A']]);
    assert.equal(await page.locator('#ans4_0').inputValue(), '甲');
    assert.equal(await page.locator('#ans4_1').inputValue(), '乙');
    assert.equal(await page.evaluate(() => window.submitClicks + window.nextClicks), 0);
    assert.deepEqual(errors, []);
  });
  await test('自定义 OpenAI 接口：地址补全、模型、答案格式及日志脱敏', async () => {
    const { page } = await setup(choice(1, '1 + 1 = ?', ['1', '2']), aiSettings);
    await checked(page, 'input[value="B"]');
    const request = await page.evaluate(() => window.aiRequests[0]);
    assert.equal(request.url, 'https://mock-provider.example/v1/chat/completions');
    assert.equal(request.payload.model, 'mock-model');
    assert.equal(request.anonymous, true);
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('test-secret'));
  });
  await test('AI 低信心、无法匹配及非法 JSON 不填写、不提交', async () => {
    for (const api of [{ answer: { answers: ['B'], confidence: 0.3 } }, { answer: { answers: ['Z'], confidence: 1 } }, { raw: '答案是B' }]) {
      const { page } = await setup(choice(1, '测试题', ['甲', '乙']), { ...aiSettings, autoSubmit: true }, [], api);
      await logContains(page, api.raw ? '格式不正确' : api.answer.answers[0] === 'Z' ? '不能唯一匹配' : '低于设置阈值');
      assert.equal(await page.locator('.TiMu input:checked').count(), 0);
      assert.equal(await page.evaluate(() => window.nextClicks), 0);
    }
  });
  await test('API 错误及超时可重试，不重复发请求', async () => {
    for (const api of [{ status: 401 }, { timeout: true }]) {
      const { page } = await setup(choice(1, '失败题', ['甲', '乙']), aiSettings, [], api);
      await logContains(page, api.status ? 'HTTP 401' : '超过 60 秒');
      await page.waitForTimeout(1700);
      assert.equal(await page.evaluate(() => window.aiRequests.length), 1);
      await page.locator('#cx-video-helper-host #retry').click();
      await page.waitForFunction(() => window.aiRequests.length === 2);
    }
  });
  await test('暂停中止查询，迟到的答案不写入页面', async () => {
    const { page } = await setup(choice(1, '暂停题', ['甲', '乙']), aiSettings, [], { delay: 1500 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
    assert.equal(await page.evaluate(() => window.apiAborts), 1);
  });
  await test('查询期间用户改答案，保留手动选择', async () => {
    const { page } = await setup(choice(1, '人工改题', ['甲', '乙']), aiSettings, [], { delay: 700 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('input[value="A"]').click();
    await logContains(page, '已保留你的答案');
    assert.equal(await page.locator('input[value="A"]').isChecked(), true);
    assert.equal(await page.locator('input[value="B"]').isChecked(), false);
  });
  await test('iframe 内章节题目，全题确认填写后提交一次', async () => {
    const html = choice(1, '子页面问题', ['甲', '乙']) + '<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>';
    const { page } = await setup('<div class="ans-job"><iframe src="/api/work"></iframe></div>', { autoSubmit: true }, [{ question: '子页面问题', answers: ['B'] }], {}, { '/api/work': html });
    const frame = page.frames().find((f) => f.url().includes('/api/work'));
    await frame.waitForFunction(() => window.submitClicks === 1, null, { timeout: 5000 });
    await page.waitForTimeout(1800);
    assert.equal(await frame.evaluate(() => window.submitClicks), 1);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('章节提交后点击父页面延迟出现的 popok 二次确认且仅点击一次', async () => {
    const html = choice(1, '提交确认题', ['甲', '乙']) + `<button onclick="window.submitClicks++;setTimeout(()=>parent.document.getElementById('submissionDialog').hidden=false,1000)" id="btnBlueSubmit">提交</button>`;
    const body = `<div class="ans-job"><iframe src="/api/work"></iframe></div><div class="popBottom" id="submissionDialog" hidden><p>确定提交本次章节测验？</p><a id="popok" aria-label="确定" onclick="window.confirmClicks=(window.confirmClicks||0)+1;this.parentElement.hidden=true">确定</a></div>`;
    const { page } = await setup(body, { autoSubmit: true }, [{ question: '提交确认题', answers: ['B'] }], {}, { '/api/work': html });
    await page.waitForFunction(() => window.confirmClicks === 1, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.confirmClicks), 1);
    const frame = page.frames().find(f => f.url().includes('/api/work'));
    assert.equal(await frame.evaluate(() => window.submitClicks), 1);
  });
  await test('未由助手发起的确认弹窗和关闭提交后的弹窗均不点击', async () => {
    const body = choice(1, '保留确认题', ['甲', '乙']) + `<button id="btnBlueSubmit" onclick="window.submitClicks++;document.getElementById('later').hidden=false">提交</button>
      <div class="popBottom"><a id="popok" onclick="window.unrelatedClicks=(window.unrelatedClicks||0)+1">确定</a></div>
      <div id="later" hidden><button id="confirmSubmit" onclick="window.confirmClicks=(window.confirmClicks||0)+1">确认提交</button></div>`;
    const { page } = await setup(body, { autoSubmit: false }, [{ question: '保留确认题', answers: ['A'] }]);
    await checked(page, '.TiMu input[value="A"]');
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.unrelatedClicks || 0), 0);
    assert.equal(await page.evaluate(() => window.submitClicks), 0);
    await page.locator('#cx-video-helper-host #autoSubmit').check();
    await page.waitForFunction(() => window.submitClicks === 1);
    await page.locator('#cx-video-helper-host #autoSubmit').uncheck();
    await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(() => window.confirmClicks || 0), 0);
    assert.equal(await page.evaluate(() => window.unrelatedClicks || 0), 0);
  });
  await test('多题测验未答全时禁止自动提交', async () => {
    const { page } = await setup(choice(1, '已知题', ['甲', '乙']) + choice(2, '未知题', ['甲', '乙'])
      + '<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>', { autoSubmit: true }, [{ question: '已知题', answers: ['A'] }]);
    await logContains(page, '本地题库未命中');
    assert.equal(await page.evaluate(() => window.submitClicks), 0);
    assert.equal(await page.locator('.TiMu input:checked').count(), 1);
  });
  await test('视频弹题暂停播放，提交成功后继续', async () => {
    const { page } = await setup('<video id="v"></video>' + popup, { autoSubmit: true }, [{ question: '1 + 1 = ?', answers: ['B'] }]);
    await page.waitForFunction(() => window.popupContinued === 1, null, { timeout: 6000 });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await page.evaluate(() => window.popupSubmitted), 1);
  });
  await test('两个媒体依次播放，自动切章定时器不会被轮询重置', async () => {
    const { page } = await setup('<video id="v1"></video><audio id="v2"></audio>', { nextDelay: 1000 });
    await page.waitForFunction(() => !document.querySelector('#v1').paused);
    assert.equal(await page.locator('#v2').evaluate((m) => m.paused), true);
    await page.locator('#v1').evaluate((m) => m.finish());
    await page.waitForFunction(() => !document.querySelector('#v2').paused);
    await page.locator('#v2').evaluate((m) => m.finish());
    await page.waitForFunction(() => window.nextClicks === 1, null, { timeout: 6000 });
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.nextClicks), 1);
  });
  await test('平台未标记任务完成时不切章；标记后才进入下一章', async () => {
    const { page } = await setup('<div class="ans-job" id="job"><video id="v"></video></div>', { nextDelay: 1000 });
    await page.locator('#v').evaluate((m) => m.finish());
    await page.waitForTimeout(1900);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    await page.locator('#job').evaluate((job) => job.classList.add('ans-job-finished'));
    await page.waitForFunction(() => window.nextClicks === 1, null, { timeout: 5000 });
  });
  await test('动态 iframe 切章后重新扫描并处理新题', async () => {
    const frames = { '/chapter-one': choice(1, '第一题', ['甲', '乙']), '/chapter-two': choice(2, '第二题', ['甲', '乙']) };
    const { page } = await setup('<iframe id="chapter" src="/chapter-one"></iframe>', {}, [
      { question: '第一题', answers: ['A'] }, { question: '第二题', answers: ['B'] },
    ], {}, frames);
    let frame = page.frames().find((f) => f.url().endsWith('/chapter-one'));
    await frame.waitForFunction(() => document.querySelector('input[value="A"]').checked);
    await page.locator('#chapter').evaluate((f) => { f.src = '/chapter-two'; });
    await page.waitForFunction(() => document.querySelector('#chapter').contentDocument?.querySelector('.fontLabel')?.textContent === '第二题');
    frame = page.frames().find((f) => f.url().endsWith('/chapter-two'));
    await frame.waitForFunction(() => document.querySelector('input[value="B"]').checked);
  });
  await test('加密字体用页面字体生成图片查询，考试页面仍停止', async () => {
    const { page } = await setup(choice(1, '<span class="font-cxsecret">密文</span>', ['甲', '乙']), aiSettings);
    await page.waitForFunction(() => document.querySelector('input[value="B"]').checked);
    const request = await page.evaluate(() => window.aiRequests[0]);
    assert.ok(Array.isArray(request.payload.messages[1].content));
    assert.ok(request.payload.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,'));
    assert.ok(!request.payload.messages[1].content[0].text.includes('密文'));
    await page.evaluate(() => { const node = document.createElement('input'); node.name = 'examId'; document.body.appendChild(node); });
    await logContains(page, '考试页面');
    assert.equal(await page.locator('#cx-video-helper-host #toggle').textContent(), '开始');
  });
  await test('UEditor 五空题在嵌套章节中按顺序同步 HTML 并通过回读', async () => {
    const answers = ['take over', 'sympathy', 'been hooked on', 'A & B < C', '<p>literal</p>\n下一行'];
    const { page, errors } = await setup('<iframe src="/blank-chapter"></iframe>', {}, [
      { question: '真实布局五空题', answers },
    ], {}, { '/blank-chapter': ueditorFixture('真实布局五空题') });
    await logContains(page, '已填写（本地题库）');
    const frame = page.frames().find(f => f.url().endsWith('/blank-chapter'));
    assert.deepEqual(await frame.locator('.InpDIV').allTextContents(), answers.map(a => a.replace('\n', '')));
    assert.equal(await frame.locator('#answerEditor0').inputValue(), '<p>take over</p>');
    assert.equal(await frame.locator('#answerEditor4').inputValue(), '<p>&lt;p&gt;literal&lt;/p&gt;<br>下一行</p>');
    assert.equal(await frame.evaluate(() => window.editorWrites), 5);
    assert.deepEqual(errors, []);
  });
  await test('UEditor 尚未同步 textarea 的手动答案仍保留', async () => {
    const { page } = await setup(ueditorFixture('已有富文本答案', 1, { live: '<p>手动内容</p>', saved: '' }), {}, [
      { question: '已有富文本答案', answers: ['替换内容'] },
    ]);
    await logContains(page, '保留现有答案');
    assert.equal(await page.evaluate(() => window.editorWrites), 0);
    assert.equal(await page.locator('#ueditor_0').evaluate(f => f.contentDocument.body.textContent), '手动内容');
  });
  await test('UEditor 正文或提交字段同步失败时不误报成功', async () => {
    for (const options of [{ rejectSync: true }, { rejectBody: true }]) {
      const { page } = await setup(ueditorFixture('同步失败题', 1, options), {}, [
        { question: '同步失败题', answers: ['应填内容'] },
      ]);
      await logContains(page, '页面未确认');
      assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('已填写（本地题库）'));
    }
  });
  await test('普通 textarea 中的 HTML 字面量不按富文本解释或创建 UEditor', async () => {
    const { page } = await setup(blank('literal', '普通文本题') + '<script>window.UE={instants:{},getEditor(){throw Error("Unexpected editor creation")}}</script>', {}, [
      { question: '普通文本题', answers: ['<p>literal</p> & text'] },
    ]);
    await logContains(page, '已填写（本地题库）');
    assert.equal(await page.locator('#ansliteral_0').inputValue(), '<p>literal</p> & text');
  });
  await test('富文本 iframe、默认 text 输入框及新版多空输入框', async () => {
    const body = `<div class="TiMu"><div class="newZy_TItle">简答题</div><div class="Zy_TItle"><div class="fontLabel">富文本题</div></div><iframe id="editor" src="/rich-editor"></iframe></div>
      <div class="TiMu"><div class="newZy_TItle">填空题</div><div class="Zy_TItle"><div class="fontLabel">默认输入框题</div></div><input id="defaultInput"></div>
      <div class="TiMu"><div class="newZy_TItle">填空题</div><div class="Zy_TItle"><div class="fontLabel">新版双空题</div></div><div class="blankItemDiv"><textarea id="b1"></textarea><div contenteditable="true"></div></div><div class="blankItemDiv"><textarea id="b2"></textarea><div contenteditable="true"></div></div></div>`;
    const { page } = await setup(body, {}, [
      { question: '富文本题', answers: ['富文本答案'] }, { question: '默认输入框题', answers: ['默认文本'] }, { question: '新版双空题', answers: ['第一空', '第二空'] },
    ], {}, { '/rich-editor': '<html><body contenteditable="true"></body></html>' });
    await page.waitForFunction(() => document.querySelector('#b2').value === '第二空', null, { timeout: 12000 });
    assert.equal(await page.locator('#defaultInput').inputValue(), '默认文本');
    assert.equal(await page.locator('#editor').evaluate((frame) => frame.contentDocument.body.textContent), '富文本答案');
    assert.equal(await page.locator('#b1').inputValue(), '第一空');
  });
  await test('自定义选项 DOM 通过页面点击事件填写并验证', async () => {
    const body = `<div class="TiMu"><div class="newZy_TItle">单选题</div><div class="Zy_TItle"><div class="fontLabel">自定义选择题</div></div><ul class="Zy_ulTop"><li onclick="document.querySelectorAll('.num_option').forEach(x=>x.classList.remove('check_answer'));this.querySelector('.num_option').classList.add('check_answer')"><span class="num_option" data="A">A</span><span class="after">甲</span></li><li onclick="document.querySelectorAll('.num_option').forEach(x=>x.classList.remove('check_answer'));this.querySelector('.num_option').classList.add('check_answer')"><span class="num_option" data="B">B</span><span class="after">乙</span></li></ul></div>`;
    const { page } = await setup(body, {}, [{ question: '自定义选择题', answers: ['B'] }]);
    await page.waitForFunction(() => document.querySelector('.num_option[data="B"]').classList.contains('check_answer'));
    assert.equal(await page.locator('.num_option.check_answer').count(), 1);
  });
  await test('关闭自动答题中止查询，再开启可以继续', async () => {
    const { page } = await setup(choice(1, '开关测试', ['甲', '乙']), aiSettings, [], { delay: 900 });
    await page.waitForFunction(() => window.aiRequests.length === 1);
    await page.locator('#cx-video-helper-host #autoAnswer').uncheck();
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
    assert.equal(await page.evaluate(() => window.apiAborts), 1);
    await page.locator('#cx-video-helper-host #autoAnswer').check();
    await checked(page, 'input[value="B"]');
  });
  await test('跨域 iframe 不能读取时阻止自动切章', async () => {
    const { page } = await setup('<video id="v"></video><div class="ans-job"><iframe src="https://other.chaoxing.com/unreadable"></iframe></div>', { nextDelay: 1000 });
    await page.locator('#v').evaluate((m) => m.finish());
    await logContains(page, '跨域不可读');
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('真实页面隐藏试听音频不占用媒体队列', async () => {
    const { page } = await setup('<audio id="auditionAudio" style="display:none" src=""></audio><video id="v"></video>');
    // mockMedia 为测试注入了地址，恢复真实试听元素的空源；id 仍应始终被排除。
    await page.waitForFunction(() => !document.querySelector('#v').paused, null, { timeout: 4000 });
    assert.equal(await page.locator('#cx-video-helper-host #mediaCount').textContent(), '1');
    assert.equal(await page.locator('#auditionAudio').evaluate((m) => m.paused), true);
  });
  await test('同源 iframe 导航成跨域后后台清理不中断扫描和暂停', async () => {
    const { page } = await setup('<iframe id="moving" src="/old-task"></iframe>', {}, [], {}, { '/old-task': '<p>旧任务</p>' });
    await page.waitForFunction(() => Object.getOwnPropertyDescriptor(document.querySelector('#moving').contentDocument, 'hidden'));
    await page.locator('#moving').evaluate(frame => { frame.src = 'https://other.chaoxing.com/new-task'; });
    await page.waitForTimeout(1800);
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('扫描失败'));
    await page.locator('#cx-video-helper-host #toggle').click();
    await logContains(page, '已暂停');
  });
  await test('新版 ans-attach-ct 未完成状态阻止导航，完成后使用新版下一节按钮', async () => {
    const body = '<div class="ans-attach-ct videoContainer" id="realJob"><div class="ans-job-icon"></div><video id="v"></video></div>'
      + '<div id="prevNextFocusNext" role="button" onclick="window.realNext=(window.realNext||0)+1">下一节</div>';
    const { page } = await setup(body, { nextDelay: 1000 });
    await page.locator('#v').evaluate((m) => m.finish());
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => window.realNext || 0), 0);
    await page.locator('#realJob').evaluate((j) => j.classList.add('ans-job-finished'));
    await page.waitForFunction(() => window.realNext === 1, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('已完成章节跳过，目录导航进入下一未完成章', async () => {
    const body = '<div class="posCatalog_select posCatalog_active" id="cur1"><span class="icon_Completed"></span></div>'
      + '<div class="posCatalog_select" id="cur2"><span class="icon_Completed"></span><span class="posCatalog_name" onclick="window.wrongChapter=true">已完成</span></div>'
      + '<div class="posCatalog_select" id="cur3"><span class="posCatalog_name" onclick="window.rightChapter=true">未完成</span></div>';
    const { page } = await setup(body, { autoAnswer: false, nextDelay: 1000 });
    await page.waitForFunction(() => window.rightChapter === true, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => Boolean(window.wrongChapter)), false);
  });
  await test('完成的媒体卡片切换下一视频卡片，纯播放模式跳过测验卡片', async () => {
    const tabs = '<li id="dct1" cardid="1" class="active" title="视频一"></li><li id="dct2" cardid="2" title="章节测验" onclick="window.wrongCard=true"></li>'
      + '<li id="dct3" cardid="3" title="视频二" onclick="window.rightCard=true"></li>';
    const { page } = await setup(tabs + '<div class="ans-job-finished"></div>', { autoAnswer: false, nextDelay: 1000 });
    await page.waitForFunction(() => window.rightCard === true, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => Boolean(window.wrongCard)), false);
  });
  await test('真实课程学习目标文字卡片加载稳定后进入视频，未知附件不跳过', async () => {
    for (const resource of ['', '<iframe src="/unknown-resource"></iframe>']) {
      const tabs = '<li id="dct1" cardid="1" class="active" title="学习目标">目标</li><li id="dct2" cardid="2" title="视频" onclick="window.videoCard=true">视频</li>';
      const { page } = await setup(tabs + '<iframe src="/mooc-ans/knowledge/cards"></iframe>',
        { autoAnswer: false, readDelay: 3000, nextDelay: 1000 }, [], {},
        { '/mooc-ans/knowledge/cards': '<div class="ans-cc"><p>通过本章学习，你需要掌握和了解以下问题。</p>' + resource + '</div>' });
      if (!resource) await page.waitForFunction(() => window.videoCard === true, null, { timeout: 8000 });
      else { await page.waitForTimeout(5500); assert.equal(await page.evaluate(() => Boolean(window.videoCard)), false); }
    }
  });
  await test('真实课程目录进入待完成章节，不进入已完成或锁定章节', async () => {
    const row = (id, pending, extra = '') => `<div class="chapter_item ${extra}" id="cur${id}" onclick="window.openedChapter=${id}"><span class="catalog_points_yi">${pending}</span></div>`;
    const { page } = await setup(row(1, 0) + row(2, 1, 'locked') + row(3, 2),
      { autoAnswer: false, nextDelay: 1000 }, [], {}, {}, { path: '/mooc2-ans/mycourse/studentcourse' });
    await page.waitForFunction(() => window.openedChapter === 3, null, { timeout: 5000 });
  });
  await test('播放器自行恢复后清除等待自动继续状态', async () => {
    const { page } = await setup('<video id="v"></video>', { autoResume: true });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#v').evaluate(async media => { media.pause(); await media.play(); });
    await page.waitForTimeout(1000);
    assert.ok(!(await page.locator('#cx-video-helper-host #status').textContent()).includes('等待'));
  });
  await test('课程默认任务页自动打开章节并继续进入目录，不误发完成通知', async () => {
    const body = '<div onclick="window.catalogClicks=(window.catalogClicks||0)+1;document.querySelector(\'#frame_content-zj\').style.display=\'block\'"><span class="tag_new"><span class="nav_content">章节</span><b hidden>NEW</b></span></div><iframe id="frame_content-zj" style="display:none" src="/mooc2-ans/mycourse/studentcourse"></iframe>';
    const { page } = await setup(body, { autoAnswer: false, nextDelay: 1000 }, [], {},
      { '/mooc2-ans/mycourse/studentcourse': '<p>暂无章节内容</p>' }, { path: '/mooc2-ans/mycourse/stu' });
    await page.waitForURL('**/mycourse/studentcourse', { timeout: 6000 });
    assert.equal(await page.evaluate(() => window.desktopNotices.length), 0);
  });
  await test('可配置窗口：保存、接口连接测试、收起展开、题库导入与日志导出', async () => {
    const { page, errors } = await setup(choice(1, 'UI测试题', ['甲', '乙']));
    await page.locator('#cx-video-helper-host #apiSettings > summary').click();
    await page.locator('#cx-video-helper-host #apiUrl').fill('https://mock-provider.example/v1/chat/completions');
    await page.locator('#cx-video-helper-host #apiModel').fill('ui-model');
    await page.locator('#cx-video-helper-host #saveApi').click();
    await menu(page, '设置 AI 密钥', 'do-not-export-me');
    await page.locator('#cx-video-helper-host #testApi').click();
    await logContains(page, '接口连接成功');
    assert.equal(await page.evaluate((key) => window.testStore[key].apiModel, STORE), 'ui-model');
    await page.locator('#cx-video-helper-host #collapse').click();
    assert.equal(await page.locator('#cx-video-helper-host #body').isVisible(), false);
    await page.locator('#cx-video-helper-host #collapse').click();
    await page.locator('#cx-video-helper-host #bankFile').setInputFiles({ name: 'bank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ question: 'UI测试题', answers: ['B'] }])) });
    await logContains(page, '已导入 1 条题库');
    await checked(page, 'input[value="B"]');
    const downloaded = page.waitForEvent('download');
    await page.locator('#cx-video-helper-host #exportLogs').click();
    const download = await downloaded;
    const logs = fs.readFileSync(await download.path(), 'utf8');
    assert.ok(!logs.includes('do-not-export-me'));
    await page.locator('#cx-video-helper-host #apiSettings > summary').click();
    fs.mkdirSync(path.join(__dirname, '..', 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'settings-window.png') });
    assert.deepEqual(errors, []);
  });
  await test('未知暂停保持暂停，手动继续仅请求一次播放', async () => {
    const { page } = await setup('<video id="v"></video>', { autoResume: false });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#v').evaluate((m) => m.pause());
    await page.waitForTimeout(3100);
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.paused, m.playCalls]), [true, 1]);
    await page.locator('#cx-video-helper-host #resumeMedia').click();
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 2);
  });
  await test('播放权限失败不轮询重试，每次手动继续只尝试一次', async () => {
    const { page } = await setup('<video id="v"></video>', {}, [], {}, {}, { rejectPlay: true });
    await logContains(page, 'NotAllowedError');
    await page.waitForTimeout(3100);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 1);
    await page.locator('#cx-video-helper-host #resumeMedia').click();
    await page.waitForTimeout(2400);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 2);
  });
  await test('无关 iframe 加载和移除保留播放状态，不重复导航', async () => {
    const { page } = await setup('<video id="v"></video>', { nextDelay: 1000 }, [], {}, { '/extra': '<p>辅助内容</p>' });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.id = 'extra'; frame.src = '/extra'; document.body.appendChild(frame); });
    await page.waitForTimeout(1800);
    await page.locator('#extra').evaluate((f) => f.remove());
    await page.waitForTimeout(1000);
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.playCalls, m.pauseCalls]), [1, 0]);
    await page.locator('#v').evaluate((m) => m.finish());
    await page.waitForFunction(() => window.nextClicks === 1);
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/extra'; document.body.appendChild(frame); });
    await page.waitForTimeout(2600);
    assert.equal(await page.evaluate(() => window.nextClicks), 1);
  });
  await test('自动倍速读取播放器最大档位，平台重置后保持一倍，可切换固定一倍', async () => {
    const { page } = await setup('<div class="video-js" id="player"><video id="v"></video></div><script>window.videojs={getPlayer:()=>({playbackRates:()=>[1,1.5,3]})}</script>');
    await page.waitForFunction(() => document.querySelector('#v').playbackRate === 3);
    await page.locator('#v').evaluate(m => { m.playbackRate = 1.5; });
    await page.waitForFunction(() => document.querySelector('#v').playbackRate === 1);
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#v').evaluate(m => m.playbackRate), 1);
    await page.locator('#cx-video-helper-host #speed').selectOption('normal');
    await page.locator('#cx-video-helper-host #speed').selectOption('auto');
    await page.waitForFunction(() => document.querySelector('#v').playbackRate === 3);
    await page.locator('#cx-video-helper-host #speed').selectOption('normal');
    await page.waitForFunction(() => document.querySelector('#v').playbackRate === 1);
  });
  await test('没有倍速档位或倍速控件禁用时默认一倍，延迟加载菜单后选择最大档位', async () => {
    const { page } = await setup('<div class="video-js"><video id="v"></video><div class="vjs-playback-rate" aria-disabled="true"><li class="vjs-menu-item">4x</li></div></div>');
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await page.locator('#v').evaluate(m => m.playbackRate), 1);
    await page.locator('.vjs-playback-rate').evaluate(n => n.remove());
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#v').evaluate(m => m.playbackRate), 1);
    await page.locator('.video-js').evaluate(n => n.insertAdjacentHTML('beforeend', '<div class="vjs-playback-rate"><li class="vjs-menu-item">1x</li><li class="vjs-menu-item">2.5x</li><li class="vjs-menu-item" aria-disabled="true">8x</li></div>'));
    await page.waitForFunction(() => document.querySelector('#v').playbackRate === 2.5);
  });
  await test('播放器抛错拒绝最高倍速时回退一倍且继续播放', async () => {
    const { page, errors } = await setup('<div class="video-js"><video id="v"></video><div class="vjs-playback-rate"><li class="vjs-menu-item">3x</li></div></div><script>let rate=1;window.rateAttempts=0;Object.defineProperty(document.querySelector("video"),"playbackRate",{get:()=>rate,set:value=>{window.rateAttempts++;if(value>1)throw Error("rate blocked");rate=value;}})</script>');
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.waitForTimeout(1800);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#v').playbackRate, window.rateAttempts]), [1, 1]);
    assert.deepEqual(errors, []);
  });
  await test('隐藏页面不启动播放，回到页面后仍尊重平台暂停', async () => {
    const { page } = await setup('<video id="v"></video>', { backgroundPlay: false, autoResume: false }, [], {}, {}, { hidden: true });
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 0);
    await page.evaluate(() => { window.testHidden = false; });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.evaluate(() => { window.testHidden = true; document.querySelector('#v').pause(); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { window.testHidden = false; });
    await page.waitForTimeout(1800);
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.paused, m.playCalls]), [true, 1]);
  });
  await test('播放中出现弹题暂停，平台通过后正常继续', async () => {
    const { page } = await setup('<video id="v"></video>', { autoSubmit: true }, [{ question: '1 + 1 = ?', answers: ['B'] }]);
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.evaluate((html) => { document.body.insertAdjacentHTML('beforeend', html); document.querySelector('#v').pause(); }, popup);
    await page.waitForFunction(() => window.popupContinued === 1);
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 2);
  });
  await test('自动继续恢复普通暂停，连续被暂停时延长重试间隔', async () => {
    const { page } = await setup('<video id="v"></video>');
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#v').evaluate((m) => m.pause());
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 1);
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 2);
    await page.locator('#v').evaluate((m) => m.pause());
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 2);
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    assert.equal(await page.locator('#v').evaluate((m) => m.playCalls), 3);
  });
  await test('后台适配覆盖同源课程 iframe，关闭和停止时恢复页面属性', async () => {
    const { page } = await setup('<iframe id="course" src="/player"></iframe>', {}, [], {}, { '/player': '<video id="v"></video>' }, { hidden: true });
    const frame = page.frames().find((f) => f.url().endsWith('/player'));
    await frame.waitForFunction(() => !document.querySelector('#v').paused);
    for (const target of [page, frame]) {
      assert.deepEqual(await target.evaluate(() => [document.hidden, document.visibilityState, document.hasFocus()]), [false, 'visible', true]);
    }
    await page.locator('#cx-video-helper-host #backgroundPlay').uncheck();
    for (const target of [page, frame]) {
      assert.deepEqual(await target.evaluate(() => [document.hidden, document.visibilityState, document.hasFocus()]), [true, 'hidden', false]);
    }
    await page.locator('#cx-video-helper-host #backgroundPlay').check();
    await page.locator('#cx-video-helper-host #toggle').click();
    for (const target of [page, frame]) {
      assert.deepEqual(await target.evaluate(() => [document.hidden, document.visibilityState, document.hasFocus()]), [true, 'hidden', false]);
    }
  });
  await test('后台屏蔽页面失焦和可见性暂停，但保留输入框失焦事件', async () => {
    const { page } = await setup('<video id="v"></video><input id="field">');
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    const values = await page.evaluate(() => {
      window.pageBlurCount = 0; window.visibilityCount = 0; window.fieldBlurCount = 0;
      window.addEventListener('blur', () => window.pageBlurCount++);
      document.addEventListener('visibilitychange', () => window.visibilityCount++);
      document.querySelector('#field').addEventListener('blur', () => window.fieldBlurCount++);
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      document.querySelector('#field').dispatchEvent(new Event('blur'));
      return [window.pageBlurCount, window.visibilityCount, window.fieldBlurCount];
    });
    assert.deepEqual(values, [0, 0, 1]);
  });
  await test('暂停拦截直接阻止页面调用，关闭开关和停止助手恢复原方法', async () => {
    const { page } = await setup('<video id="v"></video>', { blockPause: true, autoResume: false });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#v').evaluate((m) => { m.pause(); m.pause(); });
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.paused, m.pauseCalls, m.playCalls]), [false, 0, 1]);
    await page.locator('#cx-video-helper-host #blockPause').uncheck();
    await page.locator('#v').evaluate((m) => m.pause());
    assert.equal(await page.locator('#v').evaluate((m) => m.paused), true);
    await page.locator('#cx-video-helper-host #blockPause').check();
    await page.locator('#cx-video-helper-host #resumeMedia').click();
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#cx-video-helper-host #toggle').click();
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.paused, m.pauseCalls]), [true, 2]);
  });
  await test('暂停拦截保留播放器手动暂停，自动继续不覆盖用户操作', async () => {
    const { page } = await setup('<div class="video-js"><video id="v"></video><button id="manual" data-cx-pause onclick="document.querySelector(\'#v\').pause()">暂停</button></div>', { blockPause: true });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.locator('#manual').click();
    await page.waitForTimeout(2400);
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.paused, m.playCalls]), [true, 1]);
    await page.locator('#cx-video-helper-host #resumeMedia').click();
    await page.waitForFunction(() => !document.querySelector('#v').paused);
  });
  await test('同源 iframe 暂停拦截保留弹题和验证码出现时的即时暂停', async () => {
    const { page } = await setup('<iframe src="/player"></iframe>', { blockPause: true, autoAnswer: false }, [], {}, { '/player': '<video id="v"></video>' });
    const frame = page.frames().find((f) => f.url().endsWith('/player'));
    await frame.waitForFunction(() => !document.querySelector('#v').paused);
    await frame.locator('#v').evaluate((m) => m.pause());
    assert.equal(await frame.locator('#v').evaluate((m) => m.paused), false);
    await frame.evaluate((html) => { document.body.insertAdjacentHTML('beforeend', html); document.querySelector('#v').pause(); }, popup);
    assert.equal(await frame.locator('#v').evaluate((m) => m.paused), true);
    await frame.locator('.ans-videoquiz').evaluate((node) => node.remove());
    await frame.waitForFunction(() => !document.querySelector('#v').paused);
    await frame.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div>[9010] 操作异常，请输入图片中的验证码</div>'); document.querySelector('#v').pause(); });
    assert.equal(await frame.locator('#v').evaluate((m) => m.paused), true);
    await logContains(page, '平台要求人工验证');
    await page.waitForTimeout(2400);
    assert.equal(await frame.locator('#v').evaluate((m) => m.paused), true);
  });
  await test('后台播放中验证码出现会暂停并撤销适配，不自动恢复验证码', async () => {
    const { page } = await setup('<video id="v"></video>', {}, [], {}, {}, { hidden: true });
    await page.waitForFunction(() => !document.querySelector('#v').paused);
    await page.evaluate(() => { const node = document.createElement('div'); node.textContent = '[9010] 操作异常，请输入图片中的验证码'; document.body.appendChild(node); });
    await logContains(page, '平台要求人工验证');
    await page.waitForTimeout(2600);
    assert.deepEqual(await page.locator('#v').evaluate((m) => [m.paused, m.playCalls]), [true, 1]);
    assert.equal(await page.evaluate(() => document.hidden), true);
  });
  await test('9010 人工验证码出现时停止任务，解除后恢复播放', async () => {
    const { page } = await setup('<div id="verification">[9010] 操作异常，请输入图片中的验证码</div><video id="v"></video>');
    await logContains(page, '平台要求人工验证');
    assert.equal(await page.locator('#v').evaluate((m) => m.paused), true);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    await page.locator('#verification').evaluate((e) => e.remove());
    await logContains(page, '恢复扫描课程任务');
    await page.waitForFunction(() => !document.querySelector('#v').paused);
  });
  await require('./fixtures/audit-fixes.cjs')({test,setup,choice,blank,checked,logContains,aiSettings,assert});
  await require('./fixtures/followup-fixes.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/homework.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/advanced-tasks.cjs')({test,setup,choice,blank,checked,logContains,aiSettings,assert});
  await require('./fixtures/stability.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/scriptcat-fixes.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/extended-features.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/abc-audit.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/learning-tools.cjs')({test,setup,choice,checked,logContains,aiSettings,assert});
  await require('./fixtures/course-queue.cjs')({test,setup,assert});
  await require('./fixtures/html-reading.cjs')({test,setup,assert});
  await require('./fixtures/empty-content.cjs')({test,setup,assert});
  await browser.close();
  fs.mkdirSync(path.join(__dirname, '..', 'test-results'), { recursive: true });
  const reportName = process.env.CX_TEST_SHARD ? `report-shard-${process.env.CX_TEST_SHARD.replace('/', '-')}.json`
    : process.env.CX_TEST_FILTER ? 'report-filtered.json' : 'report.json';
  fs.writeFileSync(path.join(__dirname, '..', 'test-results', reportName), JSON.stringify({ environment: 'Isolated headless browser; all page and API traffic simulated; no real accounts used',
    version: script.match(/@version\s+(\S+)/)?.[1], scriptSha256: require('node:crypto').createHash('sha256').update(script).digest('hex'),
    scenarioCount:scenarioIndex,filter: process.env.CX_TEST_FILTER || null, shard: process.env.CX_TEST_SHARD || null, results }, null, 2));
  console.log(`\n${results.filter((r) => r.passed).length}/${results.length} scenarios passed`);
  if (results.some((r) => !r.passed)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
