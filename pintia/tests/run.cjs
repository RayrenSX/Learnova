const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const {chromium} = require('playwright');
const {endpoint, messages, parseResponse, requestAI} = require('../src/analysis.cjs');
const root = path.resolve(__dirname, '..');
const scriptPath = process.env.PINTIA_TEST_SCRIPT ? path.resolve(process.env.PINTIA_TEST_SCRIPT) : path.join(root, 'Pintia代码助手.user.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const STORE = 'pintia.code-helper.settings.v1';
const URL = 'https://pintia.cn/problem-sets/2104749481361477632/exam/problems/type/7?problemSetProblemId=2104749481550221325';
const original = '#include <stdio.h>\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    printf("%d\\n", n + 1);\n    return 0;\n}\n';
const fixed = original.replace('n + 1', 'n');
const result = {summary: '当前代码多加了 1。', issues: [{line: 5, category: '逻辑', cause: '输出与输入不一致', fix: '移除多余的 + 1'}],
  correctedCode: fixed, changes: ['只修改输出表达式'], tests: [{input: '0', expected: '0', reason: '零输入'}], confidence: 0.95};
const response = value => ({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(value)}}]});
const harness = esbuild.buildSync({stdin: {resolveDir: root, contents: `
  const {EditorView} = require('@codemirror/view');
  const {EditorState} = require('@codemirror/state');
  const {createAdapter} = require('./src/adapter.cjs');
  window.testAdapter = createAdapter(window);
  window.mountEditor = (container, value, readOnly = false) => {
    const state = EditorState.create({doc: value, extensions: [EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly), EditorView.updateListener.of(update => {
        if(update.docChanged && !readOnly) {window.savedCode = update.state.doc.toString(); window.codeSaves++;}
      })]});
    const view = new EditorView({state, parent: container});
    container.__reactFiber$fixture = {stateNode: null, return: {stateNode: {codemirror: view}, return: null}};
    return view;
  };
`, loader: 'js'}, bundle: true, write: false, platform: 'browser', format: 'iife'}).outputFiles[0].text;

(async () => {
  let passed = 0;
  const report = [];
  const test = async (name, callback) => {
    if(process.env.PINTIA_TEST_FILTER&&!new RegExp(process.env.PINTIA_TEST_FILTER).test(name))return;
    if (process.env.PINTIA_TEST_TRACE) {
      fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
      fs.writeFileSync(path.join(root,'test-results/progress.json'),JSON.stringify({name,at:new Date().toISOString(),completed:report.length}));
    }
    try {await callback(); passed++; report.push({name, passed: true}); console.log('PASS', name);}
    catch (error) {report.push({name, passed: false, error: error.message}); throw error;}
  };
  await test('AI URL normalization, HTTPS and platform rejection', () => {
    assert.equal(endpoint('https://ai.example'), 'https://ai.example/v1/chat/completions');
    assert.equal(endpoint('https://ai.example/v1/'), 'https://ai.example/v1/chat/completions');
    assert.equal(endpoint('https://ai.example/v1/chat/completions'), 'https://ai.example/v1/chat/completions');
    for (const url of ['http://ai.example', 'https://a:b@ai.example/v1', 'https://ai.example/v1?key=secret', 'https://pintia.cn/api', 'https://api.pintia.cn/api']) assert.throws(() => endpoint(url));
  });
  await test('Strict AI schema rejects truncated, malformed and unsafe-to-fill results', () => {
    assert.deepEqual(parseResponse(response(result)), result);
    for (const value of [{...result, confidence: '0.9'}, {...result, confidence: 1.1}, {...result, issues: [{line: 0}]},
      {...result, tests: [null]}, {...result, correctedCode: '```c\nx\n```'}, {...result, changes: 'none'}]) assert.throws(() => parseResponse(response(value)));
    assert.throws(() => parseResponse({choices: [{finish_reason: 'length', message: {content: '{}'}}]}));
    assert.throws(() => parseResponse({choices: [{message: {content: 'not json'}}]}));
  });
  await test('Prompt retains exact code symbols and distinguishes correction / generation', () => {
    const snapshot = {route: {type: '6'}, code: original, statement: '输出原始整数', title: '函数题', language: 'C (gcc)'};
    const content = JSON.parse(messages(snapshot, 'diagnose')[1].content);
    assert.equal(content.code, original); assert.equal(content.type, '6');
    assert.match(content.task, /错因/);
    assert.throws(() => messages({...snapshot, code: ''}, 'diagnose'));
    assert.match(JSON.parse(messages({...snapshot, code: ''}, 'generate')[1].content).task, /生成/);
  });
  await test('Canceled requests stop without filling or exposing errors / keys', async () => {
    const controller = new AbortController(); controller.abort(); let calls = 0;
    await assert.rejects(requestAI({apiUrl: 'https://ai.example/v1', apiModel: 'test', apiKey: 'secret', keyOrigin: 'https://ai.example'},
      {route: {type: '7'}, title: 'test', statement: 'test', language: 'C', code: original}, 'diagnose', controller.signal, () => calls++), /取消/);
    assert.equal(calls, 0);
  });
  const launch = {headless: true};
  if (process.platform === 'win32') launch.channel = 'msedge';
  const browser = await chromium.launch(launch);
  const contexts = [];
  const externalRequests = [];
  async function setup(options = {}) {
    const context = await browser.newContext({viewport: {width: options.width || 1280, height: options.height || 960}});
    contexts.push(context);
    await context.route('**/*', route => {
      const request = route.request();
      if (request.url() !== URL || request.method() !== 'GET') externalRequests.push({url: request.url(), method: request.method()});
      return route.fulfill({contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><title>7-14 示例编程题 - 测试题集</title>
      ${options.dock ? '<style>body{margin:0}main{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 70px)}.answerInput_fixture{position:relative;height:100%;min-height:0;display:flex;flex-direction:column}.code-pane{flex:1;min-height:0}.codeEditor_WDyZc{height:300px}.rendered-markdown{padding:20px}#submit{position:fixed;bottom:0;right:10px}</style>':''}
      <main><div class="rendered-markdown"><p>输入一个整数，输出原整数。</p><h3>输入样例：</h3><div data-code data-lang="in" id="sample-in"></div><h3>输出样例：</h3><div data-code data-lang="out" id="sample-out"></div></div>
      ${options.dock ? '<div class="answerInput_fixture">':''}<div class="code-pane" ${options.dock?'data-e2e="code-editor-input"':''}><div class="css-select-container"><div class="test-singleValue">C (gcc)</div><input role="combobox"></div><div class="codeEditor_WDyZc" id="answer"></div></div>
      <div id="test-area"><div><div><button id="test-tab" onclick="document.getElementById('run-test').hidden=false">测试用例</button></div><div><button data-e2e="toggle-custom-test-area-btn">展开测试区</button></div></div><button id="run-test" hidden>运行测试</button></div>
      ${options.dock ? '</div>':''}<button id="submit" onclick="window.submissions++">提交本题作答</button></main>`});
    });
    await context.addInitScript(({store, result, options}) => {
      window.submissions = 0; window.codeSaves = 0;
      window.values = {cxVideoHelper: {apiKey: 'existing-learning-key'}, [store]: {apiUrl: 'https://ai.example/v1', apiModel: 'fixture-model',
        apiKey: 'fixture-secret', keyOrigin: 'https://ai.example', autoFill: false, confidence: 0.85, ...options.settings}};
      window.GM_getValue = (key, fallback) => window.values[key] ?? fallback;
      window.GM_setValue = (key, value) => {window.values[key] = JSON.parse(JSON.stringify(value));};
      window.requests = []; window.aborts = 0;
      window.GM_xmlhttpRequest = request => {
        window.requests.push({url: request.url, method: request.method, data: JSON.parse(request.data), anonymous: request.anonymous});
        const timer = setTimeout(() => {
          const content = options.raw ?? JSON.stringify(options.result || result);
          request.onload({status: options.status || 200, finalUrl: options.finalUrl || request.url,
            responseText: JSON.stringify({choices: [{finish_reason: options.finishReason || 'stop', message: {content}}]})});
        }, options.delay || 40);
        return {abort: () => {clearTimeout(timer); window.aborts++; request.onabort?.();}};
      };
    }, {store: STORE, result, options});
    const page = await context.newPage();
    await page.goto(URL);
    await page.addScriptTag({content: harness});
    await page.evaluate(({original, options}) => {
      window.inputSample = mountEditor(document.getElementById('sample-in'), '0', true);
      window.outputSample = mountEditor(document.getElementById('sample-out'), '0', true);
      window.answerView = mountEditor(document.getElementById('answer'), options.empty ? '' : original);
      if (options.longCode) answerView.dispatch({changes: {from: 0, to: answerView.state.doc.length, insert: Array.from({length: 1200}, (_, i) => `// line ${i}`).join('\n')}});
      if (options.noFiber) delete document.getElementById('answer').__reactFiber$fixture;
      window.testStarts = 0;
      window.createFeedback = (status = 'NEUTRAL') => ({id: String(++window.feedbackSequence), submitAt: String(window.feedbackSequence), status,
        submissionDetails: [{problemSetProblemId: new URL(location.href).searchParams.get('problemSetProblemId'),
          programmingSubmissionDetail: {program: answerView.state.doc.toString()},customTestData: {hasCustomTestData:true,content:'0'}}],
        judgeResponseContents: status === 'RUNNING' ? [] : [{programmingJudgeResponseContent:{compilationResult:{log:status==='COMPILE_ERROR'?'main.c:5: error: expected ; before return':''},
          testcaseJudgeResults:{custom:{result:status,stdout:'1'}}}}]});
      window.feedbackSequence = 10;
      window.fixtureTestProps = {submission: options.untested ? null : createFeedback(),exampleTestDatas:[{input:'0',output:'0'}]};
      document.querySelector('[data-e2e="toggle-custom-test-area-btn"]').__reactFiber$fixture = {stateNode:{props:fixtureTestProps}};
      document.getElementById('run-test').disabled = !!options.testDisabled;
      document.getElementById('run-test').onclick = () => {
        window.testStarts++;
        const pending = createFeedback('RUNNING'); fixtureTestProps.submission = pending;
        if (options.testNeverFinishes) return;
        setTimeout(() => {
          const final = createFeedback(options.testStatus || 'COMPILE_ERROR');
          final.submissionDetails = pending.submissionDetails; fixtureTestProps.submission = final;
        }, options.testDelay || 150);
      };
    }, {original, options});
    await page.addScriptTag({content: script});
    return page;
  }
  const button = (page, id) => page.locator(`#pintia-code-helper >> #${id}`);
  const status = page => button(page, 'status').textContent();
  const settingsPage = page => button(page, 'tab-settings').click();
  const diagnose = async page => {await button(page, 'tab-analysis').click(); await button(page, 'diagnose').click();};
  async function analyze(page, generate = false) {
    await button(page, generate ? 'tab-settings' : 'tab-analysis').click();
    await button(page, generate ? 'generate' : 'diagnose').click();
    await page.waitForFunction(() => document.getElementById('pintia-code-helper').shadowRoot.querySelector('#fixed-code'));
  }
  try {
    await test('Real CodeMirror 6 state read excludes sample toolbars, line numbers and assistant content', async () => {
      const page = await setup(); await button(page, 'context-details').locator('summary').click(); await button(page, 'read').click();
      const snap = await page.evaluate(() => {const s = testAdapter.snapshot(); return {code: s.code, statement: s.statement, language: s.language};});
      assert.equal(snap.code, original); assert.equal(snap.language, 'C (gcc)');
      assert.match(snap.statement, /输入样例：\n+0/); assert.doesNotMatch(snap.statement, /复制内容|分析代码错因/);
      assert.equal(await page.evaluate(() => requests.length), 0);
    });
    await test('Detected language is shown immediately, follows platform changes, and respects manual override', async () => {
      const page = await setup(); assert.equal(await button(page, 'language').inputValue(), 'C (gcc)');
      await page.evaluate(() => document.querySelector('.test-singleValue').textContent = 'Python 3');
      await page.waitForTimeout(600); assert.equal(await button(page, 'language').inputValue(), 'Python 3');
      await settingsPage(page); await button(page, 'language').fill('C++17');
      await page.evaluate(() => document.querySelector('.test-singleValue').textContent = 'C (gcc)');
      await page.waitForTimeout(600); assert.equal(await button(page, 'language').inputValue(), 'C++17');
      await button(page, 'language-auto').click(); assert.equal(await button(page, 'language').inputValue(), 'C (gcc)');
    });
    async function feedbackFixture(page, options = {}) {
      await page.evaluate(({original, options}) => {
        document.querySelectorAll('[data-e2e="toggle-custom-test-area-btn"]').forEach(node => { delete node.__reactFiber$fixture; });
        const seed = document.createElement('button'); seed.dataset.e2e = 'toggle-custom-test-area-btn'; document.body.append(seed);
        const submission = {id: '200', submitAt: '2026-10-13T05:00:00Z', status: options.status || 'COMPILE_ERROR',
          submissionDetails: [{problemSetProblemId: options.problemId || '2104749481550221325', programmingSubmissionDetail: {program: options.code || original},
            customTestData: {hasCustomTestData: true, content: '0'}}],
          judgeResponseContents: [{programmingJudgeResponseContent: {compilationResult: {log: 'main.c:5: error: expected ; before return'},
            testcaseJudgeResults: {custom: {result: 'NEUTRAL', stdout: '1', stderr: 'runtime warning'}}}}]};
        window.feedbackProps = {submission, exampleTestDatas: [{input: '0', output: '0'}]};
        seed.__reactFiber$fixture = {stateNode: {props: window.feedbackProps}};
      }, {original, options});
    }
    await test('Auto feedback reads full compile log, stdout and expected output while compiler tab is closed', async () => {
      const page = await setup(); await feedbackFixture(page); await page.waitForTimeout(600);
      const text = await button(page, 'feedback').inputValue();
      assert.match(text, /编译错误/); assert.match(text, /main.c:5/); assert.match(text, /实际输出：\n1/); assert.match(text, /预期输出：\n0/);
      await analyze(page); assert.equal(await page.evaluate(() => JSON.parse(requests[0].data.messages[1].content).feedback), text);
    });
    await test('Stale feedback and other problem feedback are excluded; manual feedback is preserved', async () => {
      const page = await setup(); await feedbackFixture(page, {code: '// different code'}); await page.waitForTimeout(600);
      assert.equal(await button(page, 'feedback').inputValue(), ''); assert.match(await button(page, 'feedback-source').textContent(), /旧代码/);
      await settingsPage(page); await button(page, 'feedback').fill('my own feedback'); await page.waitForTimeout(600);
      assert.equal(await button(page, 'feedback').inputValue(), 'my own feedback');
      await button(page, 'feedback-auto').click(); assert.equal(await button(page, 'feedback').inputValue(), '');
      const other = await setup(); await feedbackFixture(other, {problemId: '999'}); await other.waitForTimeout(600);
      assert.equal(await button(other, 'feedback').inputValue(), '');
    });
    await test('New platform feedback cancels in-flight analysis instead of filling obsolete result', async () => {
      const page = await setup({delay: 1500, settings: {autoFill: true}}); await diagnose(page);
      await feedbackFixture(page); await page.waitForFunction(() => aborts === 1);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original); assert.match(await status(page), /反馈已更新/);
    });
    await test('Pending platform test without response contents is shown as running, then updates to compiler feedback', async () => {
      const page = await setup(); await feedbackFixture(page, {status: 'RUNNING'});
      await page.evaluate(() => feedbackProps.submission.judgeResponseContents = []); await page.waitForTimeout(600);
      assert.match(await button(page, 'feedback-source').textContent(), /运行中/); assert.equal(await button(page, 'feedback').inputValue(), '');
      await feedbackFixture(page); await page.waitForTimeout(600); assert.match(await button(page, 'feedback').inputValue(), /main.c:5/);
    });
    await test('Expanded test input editor is excluded from answer reads and writes', async () => {
      const page = await setup(); await page.evaluate(() => {
        answerView.contentDOM.dataset.language = 'cpp';
        const container = document.createElement('div'); document.body.append(container);
        window.testInputView = mountEditor(container, '1120 110'); testInputView.contentDOM.setAttribute('aria-placeholder', '输入测试用例...');
      });
      await analyze(page); await button(page, 'fill').click(); assert.equal(await page.evaluate(() => testInputView.state.doc.toString()), '1120 110');
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), fixed);
    });
    await test('Drag title moves window, clamps to viewport, persists position and keeps controls usable', async () => {
      const page = await setup(); const handle = button(page, 'drag-handle'); const initial = await handle.boundingBox();
      await page.mouse.move(initial.x + 50, initial.y + 20); await page.mouse.down();
      await page.mouse.move(200, 250, {steps: 8}); await page.mouse.up();
      const box = await page.locator('#pintia-code-helper').boundingBox(); assert.ok(box.x < initial.x && box.y > initial.y);
      const position = await page.evaluate(store => values[store].position, STORE); assert.equal(Math.round(position.left), Math.round(box.x));
      await handle.focus(); await page.keyboard.press('ArrowRight'); const moved = await page.locator('#pintia-code-helper').boundingBox(); assert.ok(moved.x > box.x);
      await page.setViewportSize({width: 390, height: 640}); await page.waitForTimeout(100);
      const clamped = await page.locator('#pintia-code-helper').boundingBox(); assert.ok(clamped.x >= 0 && clamped.y >= 0 && clamped.x + clamped.width <= 390 && clamped.y + clamped.height <= 640);
      assert.equal(await button(page, 'diagnose').isVisible(), true);
      await button(page, 'collapse').click(); await button(page, 'expand').click(); assert.equal(await button(page, 'diagnose').isVisible(), true);
    });
    await test('Reads all 1200 lines from a virtualized CM6 document', async () => {
      const page = await setup({longCode: true});
      const text = await page.evaluate(() => testAdapter.editor().read());
      assert.equal(text.split('\n').length, 1200); assert.match(text, /line 1199$/);
    });
    await test('One click on untested code runs only custom test, waits for feedback, then asks AI', async () => {
      const page = await setup({untested:true,testDelay:700}); await diagnose(page);
      await page.waitForFunction(() => testStarts === 1);
      assert.equal(await page.evaluate(() => requests.length),0);
      await page.waitForFunction(() => requests.length === 1);
      const input = await page.evaluate(() => JSON.parse(requests[0].data.messages[1].content));
      assert.match(input.feedback,/编译错误/); assert.match(input.feedback,/main.c:5/);
      assert.equal(await page.evaluate(() => submissions),0);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()),original);
    });
    const workContent=page=>page.locator('#pintia-code-helper >> #workspace-editor .cm-content');
    const localCode=page=>workContent(page).evaluate(content=>content.closest('.cm-editor').textContent);
    await test('Independent editor docks exactly in the original pane without moving original React editor nodes',async()=>{
      const page=await setup({dock:true});
      assert.equal(await page.locator('#pintia-code-helper').getAttribute('data-docked'),'true');
      assert.equal(await page.evaluate(()=>answerView.dom.parentElement.id),'answer');
      assert.equal(await workContent(page).getAttribute('contenteditable'),'true');
      const same=await page.evaluate(()=>document.getElementById('pintia-code-helper').shadowRoot.querySelector('#workspace-editor .cm-editor')===answerView.dom);assert.equal(same,false);
      const pane=await page.locator('.answerInput_fixture').boundingBox(),box=await page.locator('#pintia-code-helper').boundingBox();
      assert.equal(Math.round(box.x),Math.round(pane.x));assert.equal(Math.round(box.width),Math.round(pane.width));
      assert.equal(await button(page,'tab-test').isVisible(),true);assert.equal(await button(page,'run-test-action').isVisible(),true);
    });
    await test('Typing in independent editor syncs to platform and supports undo/redo and indentation',async()=>{
      const page=await setup({dock:true});const content=workContent(page);await content.click();await page.keyboard.press('Control+a');await page.keyboard.insertText('int main() {\nreturn 0;\n}');
      assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),'int main() {\nreturn 0;\n}');
      await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// added');assert.match(await page.evaluate(()=>answerView.state.doc.toString()),/added/);
      await page.keyboard.press('Control+z');assert.doesNotMatch(await page.evaluate(()=>answerView.state.doc.toString()),/added/);
      await page.keyboard.press('Control+y');assert.match(await page.evaluate(()=>answerView.state.doc.toString()),/added/);
      await page.keyboard.press('Control+Home');await page.keyboard.press('Tab');assert.match(await page.evaluate(()=>answerView.state.doc.toString()),/^    int/);
      assert.equal(await page.evaluate(()=>submissions),0);
    });
    await test('Assistant editor completion and syntax highlighting work',async()=>{
      const page=await setup({dock:true});const content=workContent(page);await content.click();await page.keyboard.press('Control+a');await page.keyboard.insertText('int main() {\n    pri');
      await page.keyboard.press('Control+Space');await page.waitForTimeout(200);assert.match(await page.locator('#pintia-code-helper >> .cm-tooltip-autocomplete').textContent(),/printf/);
      await page.keyboard.press('Escape');assert.ok(await page.locator('#pintia-code-helper >> #workspace-editor .cm-line span').count()>0);
    });
    await test('Dragging the horizontal separator changes editor height and saves the ratio without modifying code',async()=>{
      const page=await setup({dock:true});await page.waitForTimeout(100);
      const before=await button(page,'editor-workspace').boundingBox(),bar=await button(page,'editor-splitter').boundingBox();
      await page.mouse.move(bar.x+bar.width/2,bar.y+bar.height/2);await page.mouse.down();await page.mouse.move(bar.x+bar.width/2,bar.y-85,{steps:8});await page.mouse.up();await page.waitForTimeout(100);
      const after=await button(page,'editor-workspace').boundingBox();assert.ok(after.height<before.height-60);
      const ratio=await page.evaluate(store=>values[store].editorSplit,STORE);assert.ok(ratio>=.15&&ratio<=.85);
      assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),original);assert.equal(await page.evaluate(()=>requests.length),0);assert.equal(await page.evaluate(()=>testStarts),0);
      await button(page,'tab-analysis').click();await page.waitForTimeout(100);assert.ok(Math.abs((await button(page,'editor-workspace').boundingBox()).height-after.height)<2);
      await button(page,'float-mode').click();await button(page,'float-mode').click();await page.waitForTimeout(100);
      assert.equal(await page.evaluate(store=>values[store].editorSplit,STORE),ratio);
    });
    await test('Separator keyboard movement reaches the bottom and the collapse button restores lower content',async()=>{
      const page=await setup({dock:true});await button(page,'editor-splitter').focus();const before=await button(page,'editor-workspace').boundingBox();
      await page.keyboard.press('ArrowDown');await page.waitForTimeout(100);assert.ok((await button(page,'editor-workspace').boundingBox()).height>before.height);
      await page.keyboard.press('End');await page.setViewportSize({width:700,height:500});await page.waitForTimeout(150);
      const pane=await page.locator('.answerInput_fixture').boundingBox(),editor=await button(page,'editor-workspace').boundingBox(),lower=await button(page,'body').boundingBox(),action=await button(page,'diagnose').boundingBox();
      assert.ok(editor.height>=80&&lower.height<=20);assert.equal(await button(page,'editor-splitter').getAttribute('aria-valuenow'),'100');assert.equal(await button(page,'editor-collapse').getAttribute('aria-pressed'),'true');assert.ok(action.y+action.height<=pane.y+pane.height+1);
      await button(page,'editor-collapse').click();await page.waitForTimeout(100);assert.equal(await button(page,'editor-collapse').getAttribute('aria-pressed'),'false');assert.ok((await button(page,'body').boundingBox()).height>=79);
      await page.keyboard.press('Home');await page.waitForTimeout(100);assert.ok((await button(page,'editor-workspace').boundingBox()).height<editor.height);
    });
    await test('Saved separator ratio is restored at startup and fullscreen does not change it',async()=>{
      const page=await setup({dock:true,settings:{editorSplit:.35}});await page.waitForTimeout(100);
      assert.equal(await button(page,'editor-splitter').getAttribute('aria-valuenow'),'35');
      await button(page,'editor-fullscreen').click();await page.waitForTimeout(500);await button(page,'editor-fullscreen').click();await page.waitForTimeout(150);
      assert.equal(await button(page,'editor-splitter').getAttribute('aria-valuenow'),'35');assert.equal(await page.evaluate(store=>values[store].editorSplit,STORE),.35);
    });
    await test('Font controls update text and line numbers, persist size, and preserve current code and undo history',async()=>{
      const page=await setup({dock:true});await workContent(page).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// font test');
      await button(page,'editor-font-size').selectOption('20');await page.waitForTimeout(100);
      assert.equal(await workContent(page).evaluate(node=>getComputedStyle(node).fontSize),'20px');
      assert.equal(await page.locator('#pintia-code-helper >> #workspace-editor .cm-lineNumbers').evaluate(node=>getComputedStyle(node).fontSize),'20px');
      assert.equal(await page.evaluate(store=>values[store].editorFontSize,STORE),20);assert.match(await page.evaluate(()=>answerView.state.doc.toString()),/font test/);
      await button(page,'font-larger').click();assert.equal(await button(page,'editor-font-size').inputValue(),'21');await button(page,'font-smaller').click();
      await workContent(page).click();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),original);
      assert.equal(await page.evaluate(()=>requests.length),0);assert.equal(await page.evaluate(()=>testStarts),0);
    });
    await test('Font size survives new problems and fullscreen; invalid saved size is sanitized and limits are enforced',async()=>{
      const page=await setup({dock:true,settings:{editorFontSize:18}});assert.equal(await workContent(page).evaluate(node=>getComputedStyle(node).fontSize),'18px');
      await page.evaluate(()=>{history.pushState({},'',location.href.replace('2104749481550221325','2104749481550221326'));answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:'// next'}});});await page.waitForTimeout(650);
      assert.equal(await workContent(page).evaluate(node=>getComputedStyle(node).fontSize),'18px');
      await button(page,'editor-fullscreen').click();await page.waitForTimeout(450);assert.equal(await workContent(page).evaluate(node=>getComputedStyle(node).fontSize),'18px');await button(page,'editor-fullscreen').click();
      await button(page,'editor-font-size').selectOption('28');assert.equal(await button(page,'font-larger').isDisabled(),true);await button(page,'editor-font-size').selectOption('10');assert.equal(await button(page,'font-smaller').isDisabled(),true);
      const invalid=await setup({dock:true,settings:{editorFontSize:'999'}});assert.equal(await button(invalid,'editor-font-size').inputValue(),'13');
    });
    await test('Fullscreen editing remains editable and synchronized, then returns to dock',async()=>{
      const page=await setup({dock:true});await button(page,'editor-fullscreen').click();await page.waitForTimeout(700);
      assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);assert.equal(await workContent(page).getAttribute('contenteditable'),'true');
      await workContent(page).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// fullscreen');assert.match(await page.evaluate(()=>answerView.state.doc.toString()),/fullscreen/);
      await button(page,'editor-fullscreen').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);assert.equal(await page.locator('#pintia-code-helper').getAttribute('data-docked'),'true');
    });
    await test('Run test from independent workspace uses synchronized platform code without invoking AI',async()=>{
      const page=await setup({dock:true,untested:true});await workContent(page).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// workspace test');
      await button(page,'run-test-action').click();await page.waitForFunction(()=>testStarts===1);await page.waitForTimeout(600);
      assert.match(await page.evaluate(()=>fixtureTestProps.submission.submissionDetails[0].programmingSubmissionDetail.program),/workspace test/);
      assert.equal(await page.evaluate(()=>requests.length),0);assert.equal(await page.evaluate(()=>submissions),0);assert.match(await button(page,'test-log').textContent(),/编译错误/);
    });
    await test('Applying correction and restoring original update both workspace and platform',async()=>{
      const page=await setup({dock:true});await analyze(page);await button(page,'fill').click();await page.waitForTimeout(300);
      assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),fixed);assert.match(await localCode(page),/printf/);
      await button(page,'undo').click();assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),original);assert.match(await localCode(page),/n \+ 1/);
    });
    await test('Switching problems replaces workspace code and clears undo history',async()=>{
      const page=await setup({dock:true});await workContent(page).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// old edit');
      await page.evaluate(()=>{history.pushState({},'',location.href.replace('2104749481550221325','2104749481550221326'));document.title='7-15 Next - test';answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:'// fresh problem'}});});
      await page.waitForTimeout(700);assert.match(await localCode(page),/fresh problem/);
      await workContent(page).click();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),'// fresh problem');
    });
    await test('Floating/returning and original-page controls restore native view without destroying code',async()=>{
      const page=await setup({dock:true});await button(page,'float-mode').click();assert.equal(await page.locator('#pintia-code-helper').getAttribute('data-docked'),'false');assert.equal(await page.locator('[data-pintia-workspace-native]').count(),0);
      await button(page,'float-mode').click();assert.equal(await page.locator('#pintia-code-helper').getAttribute('data-docked'),'true');
      await button(page,'collapse').click();assert.equal(await button(page,'expand').isVisible(),true);assert.equal(await page.locator('[data-pintia-workspace-native]').count(),0);
      await button(page,'expand').click();assert.equal(await page.locator('#pintia-code-helper').getAttribute('data-docked'),'true');assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),original);
    });
    await test('Native rerender does not overwrite unsynchronized user code; explicit sync restores consistency',async()=>{
      const page=await setup({dock:true});await workContent(page).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// local edit');
      await page.evaluate(original=>answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:original}}),original);
      await page.waitForTimeout(800);
      assert.equal(await button(page,'sync-now').isVisible(),true,JSON.stringify({local:await localCode(page),native:await page.evaluate(()=>answerView.state.doc.toString()),sync:await button(page,'editor-sync').textContent(),status:await status(page)}));assert.match(await localCode(page),/local edit/);assert.equal(await button(page,'diagnose').isDisabled(),true);
      await button(page,'sync-now').click();await page.waitForTimeout(500);assert.match(await page.evaluate(()=>answerView.state.doc.toString()),/local edit/);
    });
    await test('Workspace custom test input syncs only to test input while answer remains unchanged',async()=>{
      const page=await setup({dock:true,untested:true});await page.evaluate(()=>{const parent=document.createElement('div');document.getElementById('test-area').append(parent);window.customInputView=mountEditor(parent,'0');customInputView.contentDOM.setAttribute('aria-placeholder','输入测试用例...');answerView.contentDOM.dataset.language='cpp';});
      await button(page,'test-input').fill('42\n');await button(page,'run-test-action').click();await page.waitForFunction(()=>testStarts===1);assert.equal(await page.evaluate(()=>customInputView.state.doc.toString()),'42\n');assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),original);
    });
    await test('Standalone run test does not require AI credentials or a readable image statement',async()=>{
      const page=await setup({dock:true,untested:true,settings:{apiKey:''}});await page.evaluate(()=>{const img=document.createElement('img');img.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';document.querySelector('.rendered-markdown').append(img);});
      await button(page,'run-test-action').click();await page.waitForFunction(()=>testStarts===1);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>requests.length),0);assert.match(await button(page,'test-log').textContent(),/编译错误/);
    });
    await test('Workspace language selector uses only platform compilers and calls the platform change callback',async()=>{
      const page=await setup({dock:true});await page.evaluate(()=>{
        window.compilerProps={compilers:['GCC','PYTHON3'],compiler:'GCC',onChangeCompiler:value=>{compilerProps.compiler=value;document.querySelector('.test-singleValue').textContent=value==='GCC'?'C (gcc)':'Python 3';}};
        document.querySelector('[data-e2e="code-editor-input"]').__reactFiber$compiler={stateNode:{props:compilerProps}};
      });await page.waitForTimeout(600);
      assert.equal(await button(page,'workspace-language').isVisible(),true);
      await button(page,'workspace-language').selectOption('PYTHON3');await page.waitForTimeout(600);
      assert.equal(await page.evaluate(()=>compilerProps.compiler),'PYTHON3');assert.equal(await button(page,'language-status').textContent(),'Python 3');
      assert.equal(await page.evaluate(()=>answerView.state.doc.toString()),original);assert.equal(await page.evaluate(()=>submissions),0);
    });
    await test('Workspace survives SPA pane remount and cleans native styles after explicit removal',async()=>{
      const page=await setup({dock:true});await page.evaluate(()=>{
        const old=document.querySelector('.answerInput_fixture');old.remove();
        const pane=document.createElement('div');pane.className='answerInput_fixture';pane.innerHTML='<div data-e2e="code-editor-input" class="code-pane"><div class="css-select-container"><div class="test-singleValue">C (gcc)</div><input role="combobox"></div><div id="answer-new"></div></div>';document.querySelector('main').append(pane);
        history.pushState({},'',location.href.replace('2104749481550221325','2104749481550221326'));
        window.answerView=mountEditor(document.getElementById('answer-new'),'// new pane');
      });await page.waitForTimeout(800);
      assert.equal(await page.locator('#pintia-code-helper').getAttribute('data-docked'),'true');assert.match(await localCode(page),/new pane/);
      await page.evaluate(()=>document.getElementById('pintia-code-helper').remove());await page.waitForTimeout(700);
      assert.equal(await page.locator('[data-pintia-workspace-native]').count(),0);assert.equal(await page.locator('[data-pintia-workspace-pane]').count(),0);
    });
    await test('Same-problem native editor replacement preserves pending assistant edits for review',async()=>{
      const page=await setup({dock:true});await workContent(page).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// pending local');
      await page.evaluate(original=>{answerView.destroy();document.getElementById('answer').replaceChildren();window.answerView=mountEditor(document.getElementById('answer'),original);},original);
      await page.waitForTimeout(700);assert.equal(await button(page,'sync-now').isVisible(),true);assert.match(await localCode(page),/pending local/);
    });
    await test('Docked desktop and narrow layouts keep code, tabs and actions inside their pane',async()=>{
      for(const [width,height,name] of [[1440,960,'workspace-desktop'],[390,740,'workspace-narrow']]){
        const page=await setup({dock:true,width,height});await analyze(page);
        const pane=await page.locator('.answerInput_fixture').boundingBox(),editor=await workContent(page).boundingBox(),buttonBox=await button(page,'diagnose').boundingBox();
        assert.ok(editor.y>=pane.y && editor.y+editor.height<=pane.y+pane.height+1);
        assert.ok(buttonBox.y>=pane.y && buttonBox.y+buttonBox.height<=pane.y+pane.height+1);
        assert.equal(await button(page,'workspace-editor').isVisible(),true);
        fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results',name+'.png')});
      }
    });
    await test('A matching completed platform test is reused without another run', async () => {
      const page = await setup(); await analyze(page);
      assert.equal(await page.evaluate(() => testStarts),0); assert.equal(await page.evaluate(() => requests.length),1);
    });
    await test('Empty test input uses the first sample; existing user test input is preserved', async () => {
      for (const initial of ['', 'custom input']) {
        const page = await setup({untested:true});
        await page.evaluate(initial => {
          document.getElementById('sample-in').dataset.lang='in';
          const parent=document.createElement('div'); document.getElementById('test-area').append(parent);
          window.customInputView=mountEditor(parent,initial); customInputView.contentDOM.setAttribute('aria-placeholder','输入测试用例...');
          answerView.contentDOM.dataset.language='cpp';
        },initial);
        await analyze(page); assert.equal(await page.evaluate(()=>customInputView.state.doc.toString()),initial || '0');
        assert.equal(await page.evaluate(()=>testStarts),1);
      }
    });
    await test('Math in the statement keeps one text representation without hidden TeX duplicates', async () => {
      const page=await setup(); await page.evaluate(()=>document.querySelector('.rendered-markdown p').innerHTML='范围 <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mn>1</mn><mo>≤</mo><mi>D</mi><mo>≤</mo><mn>7</mn></mrow><annotation encoding="application/x-tex">1 \\le D \\le 7</annotation></semantics></math></span><span class="katex-html">1 ≤ D ≤ 7</span></span>');
      const text=await page.evaluate(()=>testAdapter.statement());assert.match(text,/范围 1≤D≤7/);assert.doesNotMatch(text,/\\le/);
    });
    await test('Missing AI credentials stop before starting platform test', async () => {
      const page=await setup({untested:true,settings:{apiKey:''}});await diagnose(page);assert.equal(await page.evaluate(()=>testStarts),0);assert.equal(await page.evaluate(()=>requests.length),0);assert.match(await status(page),/设置页/);
    });
    await test('Changed code forces a new custom test and excludes old feedback', async () => {
      const page = await setup();
      await page.evaluate(() => answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:'// changed code'}}));
      await analyze(page); assert.equal(await page.evaluate(() => testStarts),1);
      assert.equal(await page.evaluate(() => JSON.parse(requests[0].data.messages[1].content).code),'// changed code');
    });
    await test('Cancel during custom test does not request AI or fill when platform response arrives', async () => {
      const page = await setup({untested:true,testDelay:1000,settings:{autoFill:true}}); await diagnose(page);
      await page.waitForFunction(() => testStarts === 1); await button(page,'cancel').click(); await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(() => requests.length),0); assert.equal(await page.evaluate(() => answerView.state.doc.toString()),original);
      assert.match(await status(page),/取消/);
    });
    await test('Editing code or switching problem during custom test prevents AI', async () => {
      for (const change of ['code','route']) {
        const page = await setup({untested:true,testDelay:700}); await diagnose(page); await page.waitForFunction(() => testStarts === 1);
        await page.evaluate(change => change==='code'?answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:'// user'}}):history.pushState({},'',location.href.replace('2104749481550221325','2104749481550221326')),change);
        await page.waitForTimeout(1000); assert.equal(await page.evaluate(() => requests.length),0);
      }
    });
    await test('Disabled or missing custom-test UI stops before AI without clicking submit', async () => {
      for (const missing of [false,true]) {
        const page = await setup({untested:true,testDisabled:true}); if(missing) await page.evaluate(() => document.getElementById('test-area').remove());
        await diagnose(page); await page.waitForTimeout(500); assert.equal(await page.evaluate(() => requests.length),0);
        assert.equal(await page.evaluate(() => submissions),0); assert.match(await status(page),/未识别|不可用/);
      }
    });
    await test('Custom-test timeout has a bounded wait and never asks AI', async () => {
      const page = await setup({untested:true,testNeverFinishes:true});
      const message = await page.evaluate(async()=>{try{await testAdapter.runTest(testAdapter.snapshot(),new AbortController().signal,()=>{},{timeoutMs:250,intervalMs:30});return '';}catch(error){return error.message;}});
      assert.match(message,/超时/); assert.equal(await page.evaluate(() => requests.length),0);
    });
    await test('Analysis page is compact, settings stay separate, and tabs support keyboard navigation', async () => {
      const page = await setup(); assert.equal(await button(page,'api-url').isVisible(),false);
      assert.equal(await button(page,'language').isVisible(),false); assert.equal(await button(page,'feedback').isVisible(),false);
      assert.equal(await button(page,'diagnose').isVisible(),true); assert.equal(await button(page,'language-status').textContent(),'C (gcc)');
      await button(page,'tab-analysis').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await button(page,'api-url').isVisible(),true);
      assert.equal(await button(page,'diagnose').isVisible(),false); await page.keyboard.press('ArrowLeft'); assert.equal(await button(page,'diagnose').isVisible(),true);
      await analyze(page); assert.equal(await button(page,'fixed-code').isVisible(),true);
      assert.equal(await button(page,'fill').isVisible(),true); assert.equal(await button(page,'api-url').isVisible(),false);
    });
    await test('Problem changes automatically replace title, description and code without a refresh click', async () => {
      const page = await setup(); await analyze(page);
      await page.evaluate(()=>{history.pushState({},'',location.href.replace('2104749481550221325','2104749481550221326'));document.title='7-15 新题 - 测试';document.querySelector('.rendered-markdown p').textContent='新的题干';answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:'// new problem'}});});
      await page.waitForTimeout(700); assert.equal(await button(page,'problem-title').textContent(),'7-15 新题');
      assert.match(await button(page,'context').textContent(),/新的题干/); assert.match(await button(page,'context').textContent(),/new problem/);
      assert.equal(await button(page,'output').textContent(),''); assert.equal(await page.evaluate(() => requests.length),1);
    });
    await test('Diagnosis only: displays reasons and code, no writes / submission by default', async () => {
      const page = await setup(); await analyze(page);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
      assert.equal(await page.evaluate(() => submissions), 0);
      assert.match(await button(page, 'output').textContent(), /当前代码多加了 1/);
      assert.match(await button(page, 'output').textContent(), /建议测试（未执行）/);
      const req = await page.evaluate(() => requests[0]);
      assert.equal(req.url, 'https://ai.example/v1/chat/completions'); assert.equal(req.anonymous, true);
      assert.equal(JSON.parse(req.data.messages[1].content).code, original);
    });
    await test('Fill uses actual CM6 transaction, updates platform state, leaves samples unchanged; undo restores original', async () => {
      const page = await setup(); await analyze(page); await button(page, 'fill').click();
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), fixed);
      assert.equal(await page.evaluate(() => savedCode), fixed);
      assert.equal(await page.evaluate(() => inputSample.state.doc.toString()), '0');
      assert.equal(await page.evaluate(() => submissions), 0);
      await page.waitForTimeout(300); await button(page, 'undo').click();
      assert.equal(await page.evaluate(() => savedCode), original);
    });
    await test('Delayed platform rerender is detected before reporting fill success', async () => {
      const page = await setup(); await analyze(page);
      await page.evaluate(original => {
        setTimeout(() => answerView.dispatch({changes:{from:0,to:answerView.state.doc.length,insert:original}}),140);
      }, original);
      await button(page, 'fill').click(); await page.waitForTimeout(350);
      assert.match(await status(page), /代码或编辑器已变化/);
      assert.doesNotMatch(await status(page), /已写入代码并回读确认/);
    });
    await test('Opt-in automatic filling writes successful analysis but never submits', async () => {
      const page = await setup({settings: {autoFill: true}}); await analyze(page);
      await page.waitForTimeout(300); assert.equal(await page.evaluate(() => savedCode), fixed); assert.equal(await page.evaluate(() => submissions), 0);
    });
    await test('Low-confidence analysis remains visible and does not fill automatically', async () => {
      const page = await setup({settings: {autoFill: true}, result: {...result, confidence: 0.4}}); await analyze(page);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
      assert.equal(await button(page, 'fill').isDisabled(), true); assert.match(await status(page), /低于/);
    });
    await test('Manual code change during request cancels it and preserves user code', async () => {
      const page = await setup({settings: {autoFill: true}, delay: 1400}); await diagnose(page);
      await page.evaluate(() => answerView.dispatch({changes: {from: 0, to: answerView.state.doc.length, insert: '// user edit'}}));
      await page.waitForFunction(() => window.aborts === 1);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), '// user edit');
      assert.equal(await button(page, 'fill').isDisabled(), true);
    });
    await test('Changing language before response stops fill even before the polling guard', async () => {
      const page = await setup({settings: {autoFill: true}, delay: 200}); await diagnose(page);
      await page.evaluate(() => document.querySelector('.test-singleValue').textContent = 'Python 3');
      await page.waitForTimeout(350); assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
      assert.match(await status(page), /语言已变化/);
    });
    await test('Editing and restoring identical text still invalidates the old analysis', async () => {
      const page = await setup({settings: {autoFill: true}, delay: 250}); await diagnose(page);
      await page.evaluate(original => {
        answerView.dispatch({changes: {from: 0, to: answerView.state.doc.length, insert: '// transient edit'}});
        answerView.dispatch({changes: {from: 0, to: answerView.state.doc.length, insert: original}});
      }, original);
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
      assert.match(await status(page), /编辑记录已变化/);
    });
    await test('SPA problem switch cancels request, clears supplemental input and old result', async () => {
      const page = await setup({settings: {autoFill: true}, delay: 1500});
      await settingsPage(page); await button(page, 'feedback').fill('答案错误'); await diagnose(page);
      await page.evaluate(() => history.pushState({}, '', location.href.replace('2104749481550221325', '2104749481550221326')));
      await page.waitForFunction(() => window.aborts === 1);
      assert.equal(await button(page, 'feedback').inputValue(), ''); assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
      assert.equal(await button(page, 'output').textContent(), '');
    });
    await test('Cancel followed immediately by new query cannot allow the old result to overwrite the new run', async () => {
      const page = await setup({delay: 300}); await diagnose(page);
      await button(page, 'cancel').click(); await analyze(page);
      assert.equal(await page.evaluate(() => requests.length), 2); assert.equal(await page.evaluate(() => aborts), 1);
      assert.match(await status(page), /分析完成/);
    });
    await test('Turning off auto-fill while waiting takes effect on response', async () => {
      const page = await setup({settings: {autoFill: true}, delay: 400}); await diagnose(page);
      await settingsPage(page); await button(page, 'auto-fill').uncheck();
      await page.waitForFunction(() => document.getElementById('pintia-code-helper').shadowRoot.querySelector('#fixed-code'));
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
    });
    await test('Rejects stale result after user edits; undo also preserves changes made after fill', async () => {
      const page = await setup(); await analyze(page);
      await page.evaluate(() => answerView.dispatch({changes: {from: 0, to: answerView.state.doc.length, insert: '// edited'}}));
      await page.waitForTimeout(650); assert.equal(await button(page, 'fill').isDisabled(), true);
      const second = await setup(); await analyze(second); await button(second, 'fill').click();
      await second.evaluate(() => answerView.dispatch({changes: {from: 0, to: answerView.state.doc.length, insert: '// after fill'}}));
      await second.waitForTimeout(300); await button(second, 'undo').click(); assert.match(await status(second), /保留你的修改/);
      assert.equal(await second.evaluate(() => answerView.state.doc.toString()), '// after fill');
    });
    await test('Empty code refuses diagnosis; explicit generate mode works and never submits', async () => {
      const page = await setup({empty: true}); await diagnose(page);
      assert.match(await status(page), /代码为空/); assert.equal(await page.evaluate(() => requests.length), 0);
      await analyze(page, true); assert.match(await page.evaluate(() => JSON.parse(requests[0].data.messages[1].content).task), /生成/);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), '');
    });
    await test('Missing CM6 state reference does not read or overwrite visible DOM snippets; manual analysis works', async () => {
      const page = await setup({noFiber: true}); await button(page, 'context-details').locator('summary').click(); await button(page, 'read').click(); assert.match(await status(page), /无法读取完整/);
      await settingsPage(page); await button(page, 'manual').locator('summary').click(); await button(page, 'use-manual').check();
      await button(page, 'manual-code').fill(original); await settingsPage(page); await button(page, 'language').fill('C (gcc)'); await analyze(page, true);
      assert.equal(await button(page, 'fill').isDisabled(), true);
      assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
    });
    await test('Manual feedback and full statement reach AI without changing the platform', async () => {
      const page = await setup(); await settingsPage(page); await button(page, 'manual').locator('summary').click();
      await button(page, 'statement').fill('完整题目补充：输出输入整数，样例 0 → 0');
      await settingsPage(page); await button(page, 'feedback').fill('编译失败：第 5 行'); await analyze(page);
      const payload = await page.evaluate(() => JSON.parse(requests[0].data.messages[1].content));
      assert.match(payload.statement, /完整题目补充/); assert.match(payload.feedback, /编译失败：第 5 行/);
    });
    await test('Malformed response / HTTP error / redirect never writes or exposes server text', async () => {
      for (const options of [{raw: 'not json'}, {status: 401}, {finishReason: 'length'}, {finalUrl: 'https://other.example/result'}]) {
        const page = await setup({...options, settings: {autoFill: true}}); await diagnose(page);
        await page.waitForTimeout(130); assert.equal(await page.evaluate(() => answerView.state.doc.toString()), original);
        assert.equal(await button(page, 'fill').isDisabled(), true); assert.doesNotMatch(await status(page), /fixture-secret/);
      }
    });
    await test('Model content rendered as plain text, never executed as HTML', async () => {
      const malicious = '<img src=x onerror="window.injectionRan=true">';
      const page = await setup({result: {...result, summary: malicious, changes: [malicious]}}); await analyze(page);
      assert.equal(await page.evaluate(() => window.injectionRan), undefined);
      assert.equal(await page.locator('#pintia-code-helper >> #output img').count(), 0);
      assert.match(await button(page, 'output').textContent(), /onerror/);
    });
    await test('Independent settings hide key; changing API domain drops old key and preserves learning-plugin store', async () => {
      const page = await setup(); await settingsPage(page);
      assert.equal(await button(page, 'api-key').inputValue(), '');
      await button(page, 'api-url').fill('https://another-ai.example/v1'); await button(page, 'save').click();
      assert.equal(await page.evaluate(store => values[store].apiKey, STORE), '');
      assert.equal(await page.evaluate(() => values.cxVideoHelper.apiKey), 'existing-learning-key');
      await button(page, 'api-key').fill('new-secret'); await button(page, 'save').click();
      assert.equal(await button(page, 'api-key').inputValue(), '');
      assert.equal(await page.evaluate(store => values[store].apiKey, STORE), 'new-secret');
      await button(page, 'clear-key').click(); assert.equal(await page.evaluate(store => values[store].apiKey, STORE), '');
    });
    await test('Unknown language blocks querying; provided language enables analysis', async () => {
      const page = await setup(); await page.evaluate(() => document.querySelector('.test-singleValue').remove());
      await diagnose(page); assert.match(await status(page), /未识别语言/);
      assert.equal(await page.evaluate(() => requests.length), 0);
      await settingsPage(page); await button(page, 'language').fill('C (gcc)'); await analyze(page);
    });
    await test('Function and code-completion routes remain explicitly typed and never submit', async () => {
      for (const type of ['6', '8']) {
        const page = await setup(); await page.evaluate(type => history.replaceState({}, '', location.href.replace('/type/7', '/type/' + type)), type);
        await page.waitForTimeout(600); await analyze(page);
        assert.equal(await page.evaluate(() => JSON.parse(requests[0].data.messages[1].content).type), type);
        assert.equal(await page.evaluate(() => submissions), 0);
      }
    });
    await test('Narrow panel stays in viewport and can collapse / reopen', async () => {
      const page = await setup({width: 390, height: 640}); await analyze(page);
      const box = await page.locator('#pintia-code-helper').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 640);
      const dir = path.join(root, 'test-results'); fs.mkdirSync(dir, {recursive: true});
      await page.screenshot({path: path.join(dir, 'narrow.png')});
      await button(page, 'collapse').click(); assert.equal(await button(page, 'expand').isVisible(), true);
      await button(page, 'expand').click(); assert.equal(await button(page, 'diagnose').isVisible(), true);
      const desktop = await setup(); await analyze(desktop); await desktop.screenshot({path: path.join(dir, 'desktop.png')});
    });
    await test('Study exports: current statement and own full code download as Markdown without test or submit',async()=>{
      const page=await setup();await button(page,'tab-settings').click();const event=page.waitForEvent('download');await button(page,'export-current').click();const content=fs.readFileSync(await (await event).path(),'utf8');
      assert.ok(content.includes('## 我的代码'));assert.ok(content.includes(original));
      await button(page,'export-my-code').uncheck();const next=page.waitForEvent('download');await button(page,'export-current').click();const statement=fs.readFileSync(await (await next).path(),'utf8');assert.ok(!statement.includes('## 我的代码'));
    });
    await test('Study exports: existing problem set uses GET endpoints and downloads all returned types',async()=>{
      const page=await setup();const requests=[];
      await page.route('**/api/**',route=>{const url=new global.URL(route.request().url());requests.push({url:url.pathname,method:route.request().method()});const data=url.pathname.endsWith('/exams')?{exam:{id:'42'}}:url.pathname.endsWith('/problem-summaries')?{summaries:{7:1,6:1}}:{problemSetProblems:[{id:url.searchParams.get('problem_type'),title:'导出样例',content:'题目材料 $x^2$'}]};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
      await button(page,'tab-settings').click();const event=page.waitForEvent('download');await button(page,'export-set').click();const content=fs.readFileSync(await (await event).path(),'utf8');assert.ok(content.includes('题目材料 $x^2$'));assert.equal(requests.length,4);assert.ok(requests.every(r=>r.method==='GET'));
    });
    await test('Study exports: missing exam stops without creating an exam; canceled export never downloads',async()=>{
      const page=await setup();const requests=[];let delay=false;
      await page.route('**/api/**',async route=>{requests.push(route.request().method());if(delay)await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({contentType:'application/json',body:JSON.stringify({exam:null})}).catch(()=>{});});
      await button(page,'tab-settings').click();let downloads=0;page.on('download',()=>downloads++);await button(page,'export-set').click();await button(page,'export-status').filter({hasText:'已存在'}).waitFor();assert.equal(downloads,0);assert.deepEqual(requests,['GET']);
      delay=true;await button(page,'export-set').click();await button(page,'export-cancel').click();await page.waitForTimeout(700);assert.equal(downloads,0);
    });
    assert.equal(externalRequests.filter(item => item.method !== 'GET').length, 0);
    console.log(`${passed}/${passed} Pintia checks passed; no real platform / AI requests or submissions`);
  } finally {
    const dir = path.join(root, 'test-results'); fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({passed, results: report, externalRequests,
      scriptPath, scriptSha256:require('node:crypto').createHash('sha256').update(script).digest('hex'),
      environment: 'Isolated offline Edge, real CodeMirror 6, mocked AI; no live submission'}, null, 2));
    for (const context of contexts) await context.close();
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
