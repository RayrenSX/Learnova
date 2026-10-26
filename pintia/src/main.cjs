const {createAdapter} = require('./adapter.cjs');
const {endpoint, messages, requestAI} = require('./analysis.cjs');
const {draggableWindow} = require('./window.cjs');
const {createWorkspaceEditor} = require('./editor.cjs');
const {dockWorkspace} = require('./dock.cjs');
const {editorSplitter} = require('./splitter.cjs');

(() => {
  'use strict';
  if (window.top !== window.self || document.getElementById('pintia-code-helper')) return;
  const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const adapter = createAdapter(page);
  const STORE = 'pintia.code-helper.settings.v1';
  const defaults = {apiUrl: 'https://www.fastaitoken.com/v1', apiModel: 'gpt-5.6-terra', apiKey: '', keyOrigin: '', autoFill: false, confidence: 0.85, position: null, floating:false, editorFontSize:13, editorSplit:null, editorWrap:false};
  let saved = {};
  try {saved = typeof GM_getValue === 'function' ? GM_getValue(STORE, {}) : {}; } catch {}
  let settings = {...defaults, ...saved};
  if (typeof settings.confidence !== 'number' || settings.confidence < 0 || settings.confidence > 1) settings.confidence = 0.85;
  settings.autoFill = settings.autoFill === true;
  settings.editorWrap = settings.editorWrap === true;
  settings.editorFontSize=Number.isInteger(settings.editorFontSize)?Math.min(28,Math.max(10,settings.editorFontSize)):13;
  settings.editorSplit=typeof settings.editorSplit==='number'&&Number.isFinite(settings.editorSplit)?Math.min(1,Math.max(.15,settings.editorSplit)):null;
  for (const field of ['apiUrl', 'apiModel', 'apiKey', 'keyOrigin']) if (typeof settings[field] !== 'string') settings[field] = '';
  let controller = null;
  let activeSnapshot = null;
  let resultRecord = null;
  let backup = null;
  let writing = false;
  let epoch = 0;
  let lastRoute = '';
  let languageManual = false;
  let feedbackManual = false;
  let detectedFeedback = {text: '', state: 'none', source: '', id: ''};
  let activeTab = 'analysis';
  let refreshSignature = '';
  let workspaceHidden = false;
  let mirror = null;
  let mirrorRoute = '';
  let mirrorText = '';
  let syncFailed = false;
  let syncPending = 0;
  let workspaceOwnsCode = false;
  let testInputDirty = false;
  let compilerSignature='';
  const compilerLabels={GCC:'C (gcc)',GXX:'C++ (g++)',CLANG:'C (clang)',CLANGXX:'C++ (clang++)',JAVAC:'Java',PYTHON2:'Python 2',PYTHON3:'Python 3',PYPY3:'Python 3 (PyPy)',GO:'Go',RUST:'Rust',NODE:'JavaScript (Node)',MCS:'C#',FPC:'Pascal',GHC:'Haskell',RLANG:'R',CAT:'文本',CLISP:'Lisp',OCAMLC:'OCaml',VBNC:'VB.NET',RKT:'Racket'};
  const host = document.createElement('div');
  host.id = 'pintia-code-helper';
  host.dataset.version = require('../../package.json').version;
  host.dataset.docked = 'false';
  host.style.cssText = 'position:fixed;right:16px;top:72px;z-index:2147483600;max-width:calc(100vw - 16px)';
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = require('./ui.cjs');
  document.documentElement.append(host);
  if (typeof StudyHelperUpdate !== 'undefined') StudyHelperUpdate.mount(root, StudyHelperUpdate.standalone === true);
  const $ = id => root.getElementById(id);
  const workspaceEditor = createWorkspaceEditor($('workspace-editor'), code => {
    invalidate('代码已修改，请重新测试或分析。');
    try {
      const route = adapter.route();
      const target = adapter.editor();
      if (route.key !== mirrorRoute || target.element !== mirror?.element || target.read() !== mirrorText) throw new Error('平台代码已变化，请核对后同步');
      target.write(code); mirrorText = code; syncPending = Date.now(); workspaceOwnsCode = true;
      syncFailed = false; $('editor-sync').textContent = '同步中…'; $('sync-now').hidden = true;
    } catch (error) {
      syncFailed = true; $('editor-sync').textContent = '待同步'; $('sync-now').hidden = false; status(error.message, true);
    }
  }, info => {
    $('editor-position').textContent = `行 ${info.line}，列 ${info.column}` + (info.selected ? ` · 已选 ${info.selected} 字符` : '') + (info.editable ? '' : ' · 只读');
    $('editor-undo').disabled = !info.canUndo;
    $('editor-redo').disabled = !info.canRedo;
  });
  const moving = draggableWindow({host, handle: $('drag-handle'), position: settings.position,
    save: position => {settings.position = position; try {persist();} catch {}}});
  const docking = dockWorkspace({host,page,enabled:()=>!settings.floating&&!workspaceHidden,onChange:docked=>{
    $('float-mode').textContent=docked?'浮窗':'贴回';
    $('collapse').textContent=docked?'原网页':'收起';
    if (docked) tab('test');
    else moving.clamp();
    workspaceEditor.view.requestMeasure();
    split.refresh();
  }});
  const split=editorSplitter({host,panel:root.querySelector('.panel'),editor:$('editor-workspace'),body:$('body'),handle:$('editor-splitter'),button:$('editor-collapse'),ratio:settings.editorSplit,
    save:ratio=>{settings.editorSplit=ratio;try{persist();}catch{}},measure:()=>workspaceEditor.view.requestMeasure()});
  for(let size=10;size<=28;size++){const option=document.createElement('option');option.value=String(size);option.textContent=`${size}px`;$('editor-font-size').append(option);}
  function fontSize(size){
    settings.editorFontSize=Math.min(28,Math.max(10,Math.round(size)));
    $('editor-workspace').style.setProperty('--pintia-code-font-size',`${settings.editorFontSize}px`);
    $('editor-font-size').value=String(settings.editorFontSize);
    $('font-smaller').disabled=settings.editorFontSize===10;$('font-larger').disabled=settings.editorFontSize===28;
    workspaceEditor.view.requestMeasure();
  }
  fontSize(settings.editorFontSize);
  const status = (text, error = false) => {
    for (const id of ['status', 'settings-status']) {$(id).textContent = text; $(id).classList.toggle('error', error);}
    if (activeTab === 'test') {
      $('test-message').hidden = false;
      $('test-message').textContent = text;
      $('test-message').classList.toggle('error', error);
    }
  };
  function tab(name, focus = false) {
    activeTab = name;
    host.dataset.tab = name;
    for (const value of ['test','analysis','settings']) {
      const selected = value === name;
      $('tab-' + value).setAttribute('aria-selected', String(selected));
      $('tab-' + value).tabIndex = selected ? 0 : -1;
      $(value + '-page').hidden = !selected;
    }
    $('footer').hidden = name === 'settings';
    $('body').scrollTop = 0;
    if (focus) $('tab-' + name).focus();
    moving.clamp();
    workspaceEditor.view.requestMeasure();
    split.refresh();
  }
  function persist() {
    if (typeof GM_setValue !== 'function') throw new Error('请通过油猴安装插件后保存配置');
    GM_setValue(STORE, settings);
  }
  function configured() {
    $('key-state').textContent = settings.apiKey ? '已保存密钥（不回显）' : '尚未保存密钥';
    $('api-url').value = settings.apiUrl;
    $('api-model').value = settings.apiModel;
    $('confidence').value = settings.confidence;
    $('auto-fill').checked = settings.autoFill;
    $('api-key').value = '';
  }
  function controls() {
    const busy = !!controller || writing;
    $('diagnose').disabled = $('generate').disabled = $('run-test-action').disabled = busy || syncFailed;
    $('cancel').disabled = !controller;
    $('cancel').hidden = !controller;
    $('diagnose').textContent = controller && activeSnapshot?.stage === 'analyzing' ? '分析中…' : 'AI 分析';
    $('run-test-action').textContent = controller && activeSnapshot?.stage === 'testing' ? '运行中…' : '运行测试';
    $('fill').disabled = busy || !resultRecord?.valid || !resultRecord.snapshot.target || !resultRecord.result.correctedCode.trim() || resultRecord.result.confidence < settings.confidence;
    $('copy').disabled = !resultRecord?.result.correctedCode.trim();
    $('undo').disabled = busy || !backup;
    $('result-actions').hidden = !resultRecord && !backup;
    $('empty').hidden = !!resultRecord || !!controller;
    renderTestFeedback();
  }
  function syncEditor() {
    try {
      const route=adapter.route();
      const target=adapter.editor();
      const text=target.read();
      const isNew=mirrorRoute!==route.key || mirror?.element!==target.element;
      if (isNew) {
        if(mirrorRoute===route.key&&mirror&&(syncFailed||syncPending||workspaceOwnsCode)&&text!==workspaceEditor.read()){
          mirror=target;mirrorText=text;syncFailed=true;syncPending=0;$('editor-sync').textContent='待同步';$('sync-now').hidden=false;controls();return;
        }
        mirror=target;mirrorRoute=route.key;mirrorText=text;syncFailed=false;syncPending=0;workspaceOwnsCode=false;
        workspaceEditor.replace(text,true);
        $('test-input').value=adapter.testInput();testInputDirty=false;
      } else if (!syncFailed) {
        if ((syncPending || workspaceOwnsCode) && text !== workspaceEditor.read()) {
          if (Date.now()-syncPending<350) return;
          syncFailed=true; $('editor-sync').textContent='平台同步失败';$('sync-now').hidden=false;
          status('平台未保留最新代码，请核对后点击“同步到平台”。',true);controls();return;
        }
        if (text!==mirrorText) {workspaceEditor.replace(text);mirrorText=text;}
        if (Date.now()-syncPending>350)syncPending=0;
      }
      workspaceEditor.configure(adapter.language(target),target.tabSize?.()||4,true);
      workspaceEditor.setWrapping(settings.editorWrap);
      $('editor-wrap').setAttribute('aria-pressed', String(settings.editorWrap));
      if(!testInputDirty && root.activeElement!==$('test-input'))$('test-input').value=adapter.testInput();
      $('editor-language').textContent=adapter.language(target)||'未识别语言';
      const compiler=adapter.compilerOptions();
      $('workspace-language').hidden=!compiler;
      $('editor-language').hidden=!!compiler;
      if(compiler){
        const signature=JSON.stringify(compiler.values);
        if(signature!==compilerSignature){
          compilerSignature=signature;$('workspace-language').replaceChildren();
          for(const value of compiler.values){const option=document.createElement('option');option.value=value;option.textContent=compilerLabels[value]||value;$('workspace-language').append(option);}
        }
        $('workspace-language').value=compiler.value;
      }
      if (!syncFailed) {$('editor-sync').textContent=syncPending?'同步中…':'已同步';$('sync-now').hidden=true;}
    } catch {
      workspaceEditor.configure('',4,false);$('editor-sync').textContent='等待平台编辑器';
    }
  }
  function ensureSynced() {
    if (syncFailed || adapter.editor().read()!==workspaceEditor.read()) throw new Error('助手代码尚未同步到平台，请先同步后再测试');
  }
  // A deliberate edit in the original editor transfers control back to it.
  // A delayed framework restore must not erase code authored in the workspace.
  document.addEventListener('beforeinput',event=>{
    if(event.isTrusted&&mirror?.element?.contains(event.target))workspaceOwnsCode=false;
  },true);
  function cancel(reason) {
    epoch++;
    controller?.abort();
    controller = null;
    activeSnapshot = null;
    controls();
    if (reason) status(reason);
  }
  function invalidate(reason) {
    const hadQuery = !!controller;
    cancel();
    if (resultRecord) resultRecord.valid = false;
    controls();
    if (reason && (hadQuery || resultRecord)) status(reason, true);
  }
  function prepare() {
    syncEditor();
    if (!$('use-manual').checked) ensureSynced();
    syncDetected();
    const currentRoute = adapter.route();
    const manualStatement = $('statement').value.trim();
    const manualCode = $('use-manual').checked;
    let target = null;
    let baselineCode = '';
    let originalStatement = '';
    let detectedLanguage = '';
    try {target = adapter.editor(); baselineCode = target.read(); detectedLanguage = adapter.language(target);} catch (error) {if (!manualCode) throw error;}
    try {originalStatement = adapter.statement();} catch (error) {if (!manualStatement) throw error;}
    const snapshot = {route: currentRoute, target, revision: target?.revision?.(), baselineCode, originalStatement, detectedLanguage,
      code: manualCode ? $('manual-code').value.replace(/\r\n?/g, '\n') : baselineCode,
      statement: manualStatement || originalStatement, language: $('language').value.trim() || detectedLanguage,
      feedback: $('feedback').value.trim(), feedbackSignature: feedbackManual ? null : detectedFeedback.text,
      title: page.document.title.split(' - ')[0].trim()};
    if (!snapshot.statement) throw new Error('请补充完整题目');
    return snapshot;
  }
  function guardedSnapshot(snapshot) {
    return {...snapshot, code: snapshot.baselineCode, statement: snapshot.originalStatement};
  }
  function valid(snapshot) {
    if (adapter.route().key !== snapshot.route.key) throw new Error('题目已切换，分析已取消');
    if (snapshot.target) adapter.guard(guardedSnapshot(snapshot));
    if (snapshot.stage !== 'testing' && snapshot.feedbackSignature !== null && adapter.feedback(snapshot.target).text !== snapshot.feedbackSignature) throw new Error('平台反馈已更新，请使用最新反馈重新分析');
  }
  function syncDetected() {
    let target = null;
    let language = '';
    try {target = adapter.editor(); language = adapter.language(target);} catch {}
    if (!languageManual) {
      if ($('language').value !== language) $('language').value = language;
      $('language-source').textContent = language ? '已自动识别' : '未识别';
    }
    $('language-auto').hidden = !languageManual;
    try {detectedFeedback = adapter.feedback(target);} catch {detectedFeedback = {text: '', state: 'none', source: '', id: ''};}
    if (!feedbackManual) {
      const usable = detectedFeedback.state === 'ready';
      const text = usable ? detectedFeedback.text : '';
      if ($('feedback').value !== text) $('feedback').value = text;
      $('feedback-source').textContent = usable ? detectedFeedback.source : detectedFeedback.state === 'pending' ? '测试运行中' : detectedFeedback.state === 'stale' ? '旧代码反馈' : '暂无平台反馈';
      $('feedback-note').textContent = usable ? '已读取与当前代码一致的反馈；分析时会一起发送。' : detectedFeedback.state === 'stale'
        ? '上次反馈对应其他代码，已停止引用。请重新运行平台测试。' : detectedFeedback.state === 'pending'
        ? '等待平台完成运行，反馈会自动更新。' : '点击平台“运行测试”后自动读取；无需提交答案。';
    }
    $('feedback-auto').hidden = !feedbackManual;
    $('language-status').textContent = $('language').value || '未识别语言';
    $('feedback-status').textContent = {none:'未测试',pending:'测试中',stale:'代码已变更'}[detectedFeedback.state] ||
      ({COMPILE_ERROR:'编译错误',WRONG_ANSWER:'答案错误',RUNTIME_ERROR:'运行错误',NEUTRAL:'测试完成',ACCEPTED:'答案正确'}[detectedFeedback.status] || '已有反馈');
    $('feedback-status').dataset.error = String(detectedFeedback.state === 'ready' && /ERROR|WRONG|EXCEEDED/.test(detectedFeedback.status || ''));
    const ready = detectedFeedback.state === 'ready';
    $('feedback-details').hidden = !ready;
    $('feedback-preview').textContent = ready ? detectedFeedback.text : '';
    renderTestFeedback();
  }
  function renderTestFeedback() {
    const feedback = detectedFeedback;
    const testing = !!controller && activeSnapshot?.stage === 'testing';
    const ready = feedback.state === 'ready' && !testInputDirty && !testing;
    const compileError = ready && feedback.status === 'COMPILE_ERROR';
    const cases = ready ? feedback.cases || [] : [];
    const multiple = cases.length > 1;
    const label = entry => multiple ? `测试点 ${entry.name} · ${entry.status}\n` : '';
    const stdout = cases.filter(entry => entry.stdout !== null).map(entry => label(entry) + (entry.stdout || '（无输出）') + (entry.stdoutTruncated ? '\n（平台输出已截断）' : '')).join('\n\n');
    const runtime = cases.filter(entry => entry.stderr || entry.errorDescription).map(entry => label(entry) +
      [entry.stderr + (entry.stderrTruncated ? '\n（平台错误输出已截断）' : ''), entry.errorDescription].filter(Boolean).join('\n')).join('\n\n');
    function value(id, text, fallback) {
      const node = $(id);
      node.textContent = text === null ? fallback : text === '' ? '（空输出）' : text;
      node.dataset.empty = String(text === null);
    }
    $('test-compile').hidden = !ready || (!feedback.compilationLog && !compileError);
    $('test-compile-title').textContent = compileError ? '编译错误' : '编译器提示';
    $('test-compile-log').textContent = ready ? feedback.compilationLog || '平台未提供详细编译日志，请展开完整反馈查看。' : '';
    value('test-stdout', stdout || null, compileError ? '编译未通过，未运行程序' : ready ? '平台未返回实际输出' : '等待运行');
    value('test-expected', ready ? feedback.expected ?? null : null, ready ? '当前输入未匹配题目样例' : '运行样例后自动读取');
    $('test-runtime').hidden = !runtime;
    $('test-runtime-log').textContent = runtime;
    $('test-full-feedback').hidden = !ready;
    $('test-log').textContent = ready ? feedback.text : '';
    const resultLabel = {COMPILE_ERROR:'编译错误',WRONG_ANSWER:'答案错误',RUNTIME_ERROR:'运行错误',NEUTRAL:'运行完成（不计分）',ACCEPTED:'答案正确',
      PARTIAL_ACCEPTED:'部分正确',TIME_LIMIT_EXCEEDED:'运行超时',MEMORY_LIMIT_EXCEEDED:'内存超限',OUTPUT_LIMIT_EXCEEDED:'输出超限',PRESENTATION_ERROR:'格式错误'};
    $('test-status').textContent = testing || feedback.state === 'pending' ? '平台正在运行测试…' : testInputDirty ? '测试输入已修改，请重新运行' : ready ?
      resultLabel[feedback.status] || feedback.status || '平台测试完成' : feedback.state === 'stale' ? '代码已修改，请重新运行测试' : '运行测试，查看输出。';
    $('test-status').dataset.error = String(ready && /ERROR|WRONG|EXCEEDED/.test(feedback.status || ''));
  }
  function context(snapshot) {
    $('problem-title').textContent = snapshot.title;
    $('code-status').textContent = `${snapshot.code ? snapshot.code.split('\n').length : 0} 行 · ${snapshot.code.length} 字符`;
    const value = `${snapshot.statement}\n\n当前代码：\n${snapshot.code || '（空）'}`;
    if ($('context').textContent !== value) $('context').textContent = value;
  }
  function refresh() {
    try {
      const snapshot = prepare();
      const signature = JSON.stringify([snapshot.route.key,snapshot.title,snapshot.code,snapshot.statement,snapshot.language]);
      if (signature !== refreshSignature) {refreshSignature = signature; context(snapshot);}
    } catch (error) {
      if (!refreshSignature) {
        $('problem-title').textContent = page.document.title.split(' - ')[0] || '等待题目加载';
        $('code-status').textContent = '等待编辑器';
        $('context').textContent = error.message;
      }
    }
  }
  function element(tag, text, parent, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  }
  function render(record) {
    const output = $('output');
    output.replaceChildren();
    const {result, snapshot} = record;
    element('h3', '分析结论', output);
    element('p', result.summary, output);
    element('p', `模型自评信心 ${Math.round(result.confidence * 100)}% · 修正代码尚未运行`, output, 'result-meta');
    result.issues.forEach(issue => {
      const card = element('div', undefined, output, 'issue');
      element('strong', `${issue.line === null ? '未定位行号' : `原代码第 ${issue.line} 行`} · ${issue.category}`, card);
      element('p', issue.cause, card);
      element('p', `修正：${issue.fix}`, card);
    });
    if (result.changes.length) {
      element('h3', '修改说明', output);
      const list = element('ul', undefined, output);
      result.changes.forEach(change => element('li', change, list));
    }
    if (result.correctedCode.trim()) {
      const label = element('label', '修正代码', output);
      label.htmlFor = 'fixed-code';
      const code = element('textarea', undefined, output, 'code');
      code.id = 'fixed-code'; code.value = result.correctedCode; code.readOnly = true; code.spellcheck = false;
    }
    if (result.tests.length) {
      const details = element('details', undefined, output);
      element('summary', `建议测试（未执行） · ${result.tests.length} 项`, details);
      result.tests.forEach(test => {
        const card = element('div', undefined, details, 'test');
        element('p', test.reason, card);
        element('pre', `输入：\n${test.input}\n预期输出：\n${test.expected}`, card);
      });
    }
  }
  async function fill() {
    const record = resultRecord;
    if (!record?.valid) throw new Error('分析结果已过期，请重新分析');
    if (record.result.confidence < settings.confidence) throw new Error('信心低于填写阈值，请核对分析或调整设置');
    if (!record.snapshot.target) throw new Error('未识别可填写的编辑器，请复制修正代码');
    writing = true;
    try {
      backup = adapter.fill(guardedSnapshot(record.snapshot), record.result.correctedCode);
      mirrorText=backup.after;syncPending=0;workspaceEditor.replace(backup.after);
      record.valid = false;
      controls();
      status('正在确认平台编辑器同步…');
      await new Promise(resolve => setTimeout(resolve, 250));
      adapter.guard({route: backup.route, target: backup.target, code: backup.after});
      status('已写入代码并回读确认。尚未提交；可恢复原代码。');
    } finally {writing = false; controls();}
  }
  async function analyze(mode) {
    tab('analysis');
    cancel();
    resultRecord = null;
    $('output').replaceChildren();
    let snapshot;
    let run = 0;
    try {
      snapshot = prepare();
      messages(snapshot, mode);
      const api = endpoint(settings.apiUrl);
      if (!settings.apiKey || settings.keyOrigin !== new URL(api).origin || !settings.apiModel.trim()) throw new Error('请先在设置页保存 AI 模型和当前接口的密钥');
      context(snapshot);
      const abortController = new AbortController();
      controller = abortController;
      activeSnapshot = snapshot;
      run = ++epoch;
      if (mode === 'diagnose') {
        if (!snapshot.target || snapshot.code !== snapshot.baselineCode) throw new Error('自动测试需要平台编辑器中的当前代码；请先将粘贴代码写入平台编辑器');
        let feedback = adapter.feedback(snapshot.target);
        if (feedback.state !== 'ready' || testInputDirty) {
          snapshot.stage = 'testing';
          controls();
          feedback = await adapter.runTest(guardedSnapshot(snapshot), abortController.signal, text => status(text),testInputDirty?{input:$('test-input').value}:{});
          if (run !== epoch || abortController.signal.aborted) return;
        }
        snapshot.feedback = feedback.text + (feedbackManual && $('feedback').value.trim() ? `\n\n用户补充：\n${$('feedback').value.trim()}` : '');
        testInputDirty=false;$('test-input').value=adapter.testInput();
        snapshot.feedbackSignature = feedback.text;
        snapshot.stage = 'analyzing';
        syncDetected();
        valid(snapshot);
      }
      controls();
      status(mode === 'diagnose' ? '正在根据题目检查当前代码、定位错因…' : '正在根据题目生成代码与说明…');
      const result = await requestAI(settings, snapshot, mode, abortController.signal,
        typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined);
      if (run !== epoch || abortController.signal.aborted) return;
      valid(snapshot);
      controller = null; activeSnapshot = null;
      resultRecord = {snapshot, result, valid: true};
      render(resultRecord);
      $('body').scrollTop = 0;
      controls();
      status(result.correctedCode.trim() ? '分析完成，请核对错因、修正代码和建议测试。' : '分析完成，信息不足或没有可填写的代码。');
      if (settings.autoFill && result.correctedCode.trim()) {
        try {await fill();} catch (error) {status(`分析完成，未自动填写：${error.message}`, true);}
      }
    } catch (error) {
      // A canceled run must not clear a newer run's controller or status.
      if (run && run !== epoch) return;
      controller = null; activeSnapshot = null;
      controls(); status(error.message, true);
    }
  }
  const action = (id, callback) => $(id).addEventListener('click', () => {
    try {const promise = callback(); promise?.catch(error => status(error.message, true));} catch (error) {status(error.message, true);}
  });
  action('tab-analysis', () => tab('analysis'));
  action('tab-test', () => tab('test'));
  action('tab-settings', () => tab('settings'));
  root.querySelector('nav').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs=['test','analysis','settings'];
    const index=Math.max(0,tabs.indexOf(activeTab));
    tab(event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length],true);
  });
  action('collapse', () => {workspaceHidden=true;docking.refresh();root.querySelector('.panel').hidden=true;$('expand').hidden=false;moving.clamp();});
  action('expand', () => {workspaceHidden=false;root.querySelector('.panel').hidden=false;$('expand').hidden=true;docking.refresh();moving.clamp();});
  action('float-mode',()=>{settings.floating=!settings.floating;try{persist();}catch{}docking.refresh();if(!docking.docked)tab('analysis');});
  action('sync-now',()=>{const target=adapter.editor();target.write(workspaceEditor.read());mirror=target;mirrorRoute=adapter.route().key;mirrorText=workspaceEditor.read();syncPending=Date.now();syncFailed=false;controls();syncEditor();});
  action('sample-input',()=>{$('test-input').value=adapter.sampleInput();testInputDirty=true;invalidate('已采用样例输入，请重新运行测试。');syncDetected();});
  action('editor-undo',()=>workspaceEditor.command('undo'));
  action('editor-redo',()=>workspaceEditor.command('redo'));
  action('editor-search',()=>workspaceEditor.command('search'));
  action('editor-wrap',()=>{
    settings.editorWrap=!settings.editorWrap;workspaceEditor.setWrapping(settings.editorWrap);
    $('editor-wrap').setAttribute('aria-pressed',String(settings.editorWrap));try{persist();}catch{}
  });
  action('font-smaller',()=>{fontSize(settings.editorFontSize-1);try{persist();}catch{}});
  action('font-larger',()=>{fontSize(settings.editorFontSize+1);try{persist();}catch{}});
  $('editor-font-size').addEventListener('change',()=>{fontSize(Number($('editor-font-size').value));try{persist();}catch{}});
  $('workspace-language').addEventListener('change',()=>{
    try{ensureSynced();const compiler=adapter.compilerOptions();if(!compiler)throw new Error('未识别平台语言选项');compiler.select($('workspace-language').value);invalidate('编程语言已切换，请重新测试或分析。');}catch(error){status(error.message,true);}
  });
  action('editor-fullscreen',async()=>{
    if(document.fullscreenElement)await document.exitFullscreen();else await $('editor-workspace').requestFullscreen();
    workspaceEditor.view.requestMeasure();
  });
  $('test-input').addEventListener('input',()=>{testInputDirty=true;invalidate('测试输入已修改，请重新测试或分析。');syncDetected();});
  action('language-auto', () => {languageManual = false; invalidate('已恢复平台语言识别，请重新分析。'); syncDetected();});
  action('feedback-auto', () => {feedbackManual = false; invalidate('已恢复平台反馈读取，请重新分析。'); syncDetected();});
  action('read', () => { const snapshot = prepare(); context(snapshot); status('已读取当前题目与代码，请选择分析或生成。'); });
  action('diagnose', () => analyze('diagnose'));
  action('run-test-action',async()=>{
    tab('test');cancel();let run=0;
    try{
      syncEditor();ensureSynced();
      const target=adapter.editor();const route=adapter.route();
      const snapshot={route,target,code:target.read(),baselineCode:target.read(),revision:target.revision?.(),detectedLanguage:adapter.language(target),originalStatement:'',feedbackSignature:null};
      if(!snapshot.code.trim())throw new Error('当前代码为空，请先写代码');
      snapshot.stage='testing';controller=new AbortController();activeSnapshot=snapshot;run=++epoch;controls();
      await adapter.runTest(guardedSnapshot(snapshot),controller.signal,text=>status(text),testInputDirty?{input:$('test-input').value}:{});
      if(run!==epoch)return;
      controller=null;activeSnapshot=null;testInputDirty=false;$('test-input').value=adapter.testInput();syncDetected();controls();status('平台测试完成，反馈已更新。');
    }catch(error){if(run&&run!==epoch)return;controller=null;activeSnapshot=null;controls();status(error.message,true);}
  });
  action('generate', () => analyze('generate'));
  action('cancel', () => {cancel('分析已取消，页面代码保留。');});
  action('fill', fill);
  action('undo', () => {adapter.undo(backup);mirrorText=backup.before;workspaceEditor.replace(backup.before);backup=null;controls();status('已恢复填写前的原代码。');});
  action('copy', async () => {
    if (!resultRecord?.result.correctedCode.trim()) return;
    try {await navigator.clipboard.writeText(resultRecord.result.correctedCode); status('修正代码已复制。');}
    catch {const code = $('fixed-code'); code?.focus(); code?.select(); status('请按 Ctrl+C 复制选中的修正代码。');}
  });
  action('save', () => {
    const url = endpoint($('api-url').value);
    const model = $('api-model').value.trim();
    const confidence = Number($('confidence').value);
    if (!model || !$('confidence').value || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('请填写模型，以及 0–1 范围内的信心阈值');
    const origin = new URL(url).origin;
    const key = $('api-key').value.trim();
    const next = {...settings, apiUrl: url, apiModel: model, confidence,
      apiKey: key || (origin === settings.keyOrigin ? settings.apiKey : ''), keyOrigin: origin};
    if (typeof GM_setValue !== 'function') throw new Error('请通过油猴安装后保存设置');
    GM_setValue(STORE, next);
    settings = next;
    invalidate(); configured(); status('独立设置已保存。' + (settings.apiKey ? '' : '请填写当前接口域名的密钥。'));
  });
  action('clear-key', () => {settings = {...settings, apiKey: '', keyOrigin: ''}; persist(); invalidate(); configured(); status('Pintia 插件密钥已清除。');});
  $('auto-fill').addEventListener('change', () => {
    settings.autoFill = $('auto-fill').checked;
    try {persist();} catch (error) {status(error.message, true);}
    // Turning this off while a request is in flight takes effect immediately.
  });
  for (const id of ['language', 'feedback', 'statement', 'manual-code', 'use-manual']) {
    $(id).addEventListener('input', () => {
      if (id === 'language') {languageManual = true; $('language-source').textContent = '手动指定';}
      if (id === 'feedback') {feedbackManual = true; $('feedback-source').textContent = '手动补充'; $('feedback-note').textContent = '当前使用你补充的反馈。';}
      invalidate('分析输入已修改，请重新分析。'); syncDetected();
    });
  }
  const poller = setInterval(() => {
    if (!host.isConnected && host.parentElement?.isConnected) return;
    if (!host.isConnected && host.parentElement===null) {cancel();moving.destroy();docking.destroy();split.destroy();workspaceEditor.destroy();clearInterval(poller);return;}
    docking.refresh();syncEditor();
    let currentRoute = '';
    try {currentRoute = adapter.route().key;} catch {}
    if (currentRoute !== lastRoute) {
      lastRoute = currentRoute;
      cancel(); resultRecord = null; backup = null;
      $('output').replaceChildren(); $('context').textContent = ''; refreshSignature = '';
      $('problem-title').textContent = '正在读取新题目…';
      // Per-problem supplemental input must not be reused for another problem.
      for (const id of ['statement', 'manual-code', 'feedback']) $(id).value = '';
      languageManual = false; feedbackManual = false; $('language').value = '';
      $('use-manual').checked = false;
      controls();
      status(currentRoute ? '已切换题目，正在自动刷新题目与代码。' : '请打开具体的函数题、编程题或代码补全题。');
    }
    const snapshot = activeSnapshot || (resultRecord?.valid && resultRecord.snapshot);
    if (snapshot) {
      try {valid(snapshot);} catch (error) {invalidate(error.message);}
    }
    syncDetected();
    refresh();
  }, 500);
  try {lastRoute = adapter.route().key;} catch {}
  configured();syncEditor();docking.refresh();controls();syncDetected();refresh();
  require('./study-export.cjs').mountExports({root,page,adapter,status});
})();
