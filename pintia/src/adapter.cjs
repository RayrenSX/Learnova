// Only editor transactions and the non-scoring custom-test UI are used.
const {cmView} = require('../../src/editor-models.cjs');
function createAdapter(page) {
  const doc = page.document;
  const visible = node => !!node && node.isConnected && node.getClientRects().length > 0 &&
    page.getComputedStyle(node).visibility !== 'hidden';
  const cleanCode = value => String(value).replace(/\r\n?/g, '\n');

  function route() {
    const url = new URL(page.location.href);
    const match = url.pathname.match(/^\/problem-sets\/(\d+)\/exam\/problems\/type\/(\d+)\/?$/);
    const id = url.searchParams.get('problemSetProblemId');
    if (!match || !id || !/^\d+$/.test(id)) throw new Error('请先打开 Pintia 的具体编程题页面');
    // 6 = function, 7 = programming, 8 = code completion (Pintia problem types).
    if (!['6', '7', '8'].includes(match[2])) throw new Error('当前插件适配函数题、编程题和代码补全题');
    return {setId: match[1], type: match[2], problemId: id, key: `${match[1]}:${match[2]}:${id}`};
  }

  function editor() {
    const candidates = [];
    for (const element of doc.querySelectorAll('.cm-editor')) {
      const content = element.querySelector('.cm-content');
      if (!visible(element) || content?.getAttribute('contenteditable') !== 'true' ||
        content.getAttribute('aria-readonly') === 'true' || element.closest('.rendered-markdown, [data-code]') ||
        /输入测试用例|Input Test Case/i.test(content.getAttribute('aria-placeholder') || '')) continue;
      const view = cmView(element);
      if (!view) throw new Error('已找到 CodeMirror 6，但无法读取完整编辑器状态；请将代码粘贴到助手中分析，使用复制代码手动填写');
      candidates.push({element, kind: 'CodeMirror 6', read: () => cleanCode(view.state.doc.toString()), revision: () => view.state.doc, tabSize:()=>view.state.tabSize,
        write: code => view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: code}})});
    }
    // Legacy Pintia CodeMirror 5: scoped to one visible writable code editor.
    for (const element of doc.querySelectorAll('.CodeMirror')) {
      const cm = element.CodeMirror;
      if (!visible(element) || element.closest('.rendered-markdown, [data-code]') || !cm || cm.getOption('readOnly')) continue;
      candidates.push({element, kind: 'CodeMirror 5', read: () => cleanCode(cm.getValue()), write: code => cm.setValue(code)});
    }
    const marked = candidates.filter(candidate => candidate.element.querySelector('.cm-content[data-language]'));
    const answerCandidates = marked.length ? marked : candidates;
    if (!answerCandidates.length) throw new Error('没有找到可填写的代码编辑器；请等待页面加载，或将代码粘贴到助手中分析');
    if (answerCandidates.length !== 1) throw new Error('页面有多个可编辑代码区，无法确定目标；请关闭额外编辑器后重试');
    return answerCandidates[0];
  }

  function markdownText(element) {
    const clone = element.cloneNode(true);
    const originals = [...element.querySelectorAll('[data-code], .cm-editor, .CodeMirror')].filter(node =>
      !node.parentElement.closest('[data-code], .cm-editor, .CodeMirror'));
    const copies = [...clone.querySelectorAll('[data-code], .cm-editor, .CodeMirror')].filter(node =>
      !node.parentElement.closest('[data-code], .cm-editor, .CodeMirror'));
    originals.forEach((node, i) => {
      const cm = node.matches('.cm-editor') ? node : node.querySelector('.cm-editor');
      const old = node.matches('.CodeMirror') ? node : node.querySelector('.CodeMirror');
      const content = cmView(cm || doc.createElement('div'))?.state.doc.toString() ?? old?.CodeMirror?.getValue();
      if (content === undefined && cm) throw new Error('题干代码块无法完整读取，请在助手中补充完整题目');
      const pre = doc.createElement('pre');
      pre.textContent = '\n' + (content ?? node.textContent) + '\n';
      copies[i]?.replaceWith(pre);
    });
    clone.querySelectorAll('button, svg, .cm-gutters, script, style').forEach(node => node.remove());
    // Keep one accessible representation of KaTeX, without hidden TeX and duplicated glyphs.
    clone.querySelectorAll('.katex').forEach(node => {
      const math = node.querySelector('math');
      if (!math) return;
      const copy = math.cloneNode(true); copy.querySelectorAll('annotation,annotation-xml').forEach(item => item.remove());
      node.replaceWith(copy.textContent);
    });
    clone.querySelectorAll('p, h1, h2, h3, h4, li, pre, tr, div').forEach(node => node.append('\n'));
    return clone.textContent.replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function statement() {
    const candidates = [...doc.querySelectorAll('.rendered-markdown')].filter(visible);
    if (candidates.length !== 1) throw new Error('无法唯一识别题目描述；请在助手中补充完整题目');
    const element = candidates[0];
    if (element.querySelector('img, canvas, svg')) throw new Error('题目包含图片或图形，请在助手中补充其文字说明后分析');
    const text = markdownText(element);
    if (!text) throw new Error('题目描述为空，请等待题目加载');
    return text;
  }

  function language(target) {
    // React-select on current Pintia is adjacent to the code editor.
    let node = target?.element;
    for (let depth = 0; node && depth < 5; node = node.parentElement, depth++) {
      const combo = node.querySelector('[role="combobox"]');
      if (combo && visible(combo)) {
        const container = combo.closest('[class*="container"]') || combo.parentElement?.parentElement;
        const value = container?.querySelector('[class*="singleValue"]')?.textContent?.trim();
        if (value) return value;
      }
    }
    const select = [...doc.querySelectorAll('select')].find(node => visible(node) &&
      /C\+\+|gcc|clang|Python|Java|Rust|Go\b|C#/i.test(node.selectedOptions[0]?.textContent || ''));
    return select?.selectedOptions[0]?.textContent.trim() || '';
  }
  function compilerOptions() {
    const seed=doc.querySelector('[data-e2e="code-editor-input"]');
    for(let node=seed,depth=0;node&&depth<6;node=node.parentElement,depth++){
      const key=Object.keys(node).find(name=>name.startsWith('__reactFiber$'));
      for(let fiber=key&&node[key],step=0;fiber&&step<24;fiber=fiber.return,step++){
        const props=fiber.stateNode?.props||fiber.memoizedProps;
        if(Array.isArray(props?.compilers)&&typeof props.onChangeCompiler==='function')return {
          values:props.compilers.filter(value=>typeof value==='string'),value:props.compiler,
          select(value){if(!props.compilers.includes(value))throw new Error('平台不允许当前语言');props.onChangeCompiler(value);}
        };
      }
    }
    return null;
  }

  function snapshot() {
    const currentRoute = route();
    const target = editor();
    const title = doc.title.replace(/\s+-\s+[^]*$/, '').trim();
    return {route: currentRoute, target, code: target.read(), revision: target.revision?.(), statement: statement(), language: language(target), title};
  }

  function feedback(target = null) {
    const current = route();
    let code = '';
    try {code = (target || editor()).read();} catch {}
    const submissions = new Map();
    const examples = [];
    // The custom test React component retains its last completed response even
    // while its compiler/output tab is closed. Read it without making API calls.
    const seeds = [...doc.querySelectorAll('[data-e2e="toggle-custom-test-area-btn"], [data-e2e="code-editor-input"], [data-e2e="submission-detail"], [role="dialog"]')].filter(visible);
    for (const seed of seeds) {
      for (let node = seed, depth = 0; node && depth < 7; node = node.parentElement, depth++) {
        const key = Object.keys(node).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
        for (let fiber = key && node[key], step = 0; fiber && step < 28; fiber = fiber.return, step++) {
          const props = fiber.stateNode?.props || fiber.memoizedProps;
          if (!props) continue;
          for (const example of props.exampleTestDatas || []) {
            if (typeof example.input === 'string' && typeof example.output === 'string') examples.push(example);
          }
          const submission = props.submission;
          if (!submission || !Array.isArray(submission.submissionDetails)) continue;
          const detail = submission.submissionDetails.find(item => String(item.problemSetProblemId) === current.problemId);
          const program = detail?.programmingSubmissionDetail?.program ?? detail?.codeCompletionSubmissionDetail?.program;
          if (!detail || typeof program !== 'string') continue;
          const contents = (submission.judgeResponseContents || []).map(item => item.programmingJudgeResponseContent || item.codeCompletionJudgeResponseContent).filter(Boolean);
          if (!contents.length && !/^(WAITING|PENDING|QUEUED|JUDGING|RUNNING|PROCESSING|COMPILING)$/i.test(submission.status || '')) continue;
          const id = String(submission.id || submission.submitAt || 'latest');
          submissions.set(id, {submission, detail, program, contents});
        }
      }
    }
    const items = [...submissions.values()].sort((a, b) => String(b.submission.submitAt || '').localeCompare(String(a.submission.submitAt || '')));
    const latest = items[0];
    if (!latest) return {text: '', state: 'none', source: '', id: '', matchesCode: false};
    const {submission, detail, program, contents} = latest;
    const pending = /^(WAITING|PENDING|QUEUED|JUDGING|RUNNING|PROCESSING|COMPILING)$/i.test(submission.status || '');
    if (pending) return {text: '', state: 'pending', source: '平台正在运行测试', id: String(submission.id || ''), matchesCode: cleanCode(program) === code};
    const labels = {COMPILE_ERROR: '编译错误', WRONG_ANSWER: '答案错误', RUNTIME_ERROR: '运行错误', ACCEPTED: '答案正确',
      PARTIAL_ACCEPTED: '部分正确', TIME_LIMIT_EXCEEDED: '运行超时', MEMORY_LIMIT_EXCEEDED: '内存超限',
      OUTPUT_LIMIT_EXCEEDED: '输出超限', PRESENTATION_ERROR: '格式错误', NEUTRAL: '运行完成（不计分）'};
    const custom = detail.customTestData?.hasCustomTestData === true;
    const text = [custom ? '来源：Pintia 运行测试（不计分）' : '来源：Pintia 当前题目已有评测',
      `状态：${labels[submission.status] || submission.status || '未知'}`];
    const input = detail.customTestData?.content;
    const compilationLogs = [];
    const cases = [];
    if (typeof input === 'string') text.push(`测试输入：\n${input}`);
    for (const content of contents) {
      if (content.compilationResult?.log) {
        compilationLogs.push(content.compilationResult.log);
        text.push(`编译器输出：\n${content.compilationResult.log}`);
      }
      for (const [name, entry] of Object.entries(content.testcaseJudgeResults || {})) {
        cases.push({name, status: labels[entry.result] || entry.result || '运行结束',
          stdout: typeof entry.stdout === 'string' ? entry.stdout : null, stdoutTruncated: !!entry.stdoutTruncated,
          stderr: typeof entry.stderr === 'string' ? entry.stderr : '', stderrTruncated: !!entry.stderrTruncated,
          errorDescription: typeof entry.errorDescription === 'string' ? entry.errorDescription : ''});
        text.push(`测试点 ${name}：${labels[entry.result] || entry.result || '运行结束'}`);
        if (typeof entry.stdout === 'string') text.push(`实际输出：\n${entry.stdout}${entry.stdoutTruncated ? '\n（平台输出已截断）' : ''}`);
        if (entry.stderr) text.push(`错误输出：\n${entry.stderr}${entry.stderrTruncated ? '\n（平台输出已截断）' : ''}`);
        if (entry.errorDescription) text.push(`错误说明：${entry.errorDescription}`);
      }
    }
    const example = typeof input === 'string' && examples.find(item => cleanCode(item.input).trim() === cleanCode(input).trim());
    if (example) text.push(`该样例预期输出：\n${example.output}`);
    const matchesCode = cleanCode(program) === code;
    return {text: text.join('\n\n').slice(0,50000), state: matchesCode ? 'ready' : 'stale', status: submission.status,
      source: custom ? '平台运行测试' : '平台已有评测', id: String(submission.id || ''), matchesCode,
      input: typeof input === 'string' ? input : null, compilationLog: compilationLogs.join('\n\n'), cases,
      expected: example ? example.output : null};
  }

  function sampleInput() {
    const sample = doc.querySelector('.rendered-markdown [data-lang="in"] .cm-editor');
    return sample && cmView(sample)?.state.doc.toString() || '';
  }
  function testInput() {
    const content = [...doc.querySelectorAll('.cm-content')].find(node => /输入测试用例|Input Test Case/i.test(node.getAttribute('aria-placeholder') || ''));
    if (content) {
      const view = cmView(content.closest('.cm-editor'));
      if (view) return view.state.doc.toString();
    }
    const seed = doc.querySelector('[data-e2e="code-editor-input"]');
    for (let node = seed, depth=0; node && depth<7; node=node.parentElement, depth++) {
      const key = Object.keys(node).find(name=>name.startsWith('__reactFiber$'));
      for (let fiber=key&&node[key], step=0;fiber&&step<28;fiber=fiber.return,step++) {
        if (typeof fiber.stateNode?.state?.testData === 'string') return fiber.stateNode.state.testData;
      }
    }
    return '';
  }
  async function runTest(snapshot, signal, progress = () => {}, {timeoutMs = 90000, intervalMs = 200, input} = {}) {
    const startedAt = Date.now();
    const baseline = feedback(snapshot.target);
    let requested = baseline.state === 'pending' && baseline.matchesCode;
    const check = () => {
      if (signal.aborted) throw new Error('分析已取消');
      guard(snapshot);
      if (Date.now() - startedAt > timeoutMs) throw new Error('平台测试超时，未请求 AI；请稍后重试');
    };
    const pause = () => new Promise((resolve, reject) => {
      const abort = () => {clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('分析已取消'));};
      const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, intervalMs);
      signal.addEventListener('abort', abort, {once:true});
      if (signal.aborted) abort();
    });
    function area() {
      const toggles = [...doc.querySelectorAll('[data-e2e="toggle-custom-test-area-btn"]')].filter(visible);
      if (toggles.length !== 1) throw new Error('未识别当前题目的不计分测试区；请确认平台支持“运行测试”');
      const toggle = toggles[0];
      let node = toggle.parentElement;
      while (node && node !== doc.body) {
        if ([...node.querySelectorAll('button')].some(button => /^(测试用例|Test Case)$/.test(button.textContent.trim()))) return node.parentElement;
        node = node.parentElement;
      }
      throw new Error('未识别平台测试用例入口；未请求 AI');
    }
    check();
    if (!requested) {
      progress('正在打开平台测试区…');
      const container = area();
      const tab = [...container.querySelectorAll('button')].find(button => /^(测试用例|Test Case)$/.test(button.textContent.trim()) && visible(button));
      if (!tab || tab.disabled || tab.getAttribute('aria-disabled') === 'true') throw new Error('平台测试入口不可用；未请求 AI');
      tab.click();
      await pause();
      check();
      const liveArea = area();
      const inputEditors = [...liveArea.querySelectorAll('.cm-editor')].filter(node => {
        const content = node.querySelector('.cm-content');
        return visible(node) && content?.getAttribute('contenteditable') === 'true' && /输入测试用例|Input Test Case/i.test(content.getAttribute('aria-placeholder') || '');
      });
      if (input !== undefined && inputEditors.length !== 1) throw new Error('未识别平台测试输入编辑器，未运行测试');
      if (inputEditors.length === 1) {
        const inputView = cmView(inputEditors[0]);
        if (input !== undefined) {
          if (!inputView) throw new Error('无法同步平台测试输入，未运行测试');
          if (inputView.state.doc.toString() !== input) inputView.dispatch({changes:{from:0,to:inputView.state.doc.length,insert:input}});
          await pause(); check();
          if (inputView.state.doc.toString() !== input) throw new Error('平台未确认测试输入，未运行测试');
        }
        const sample = doc.querySelector('.rendered-markdown [data-lang="in"] .cm-editor');
        const sampleView = sample && cmView(sample);
        if (inputView && !inputView.state.doc.toString().trim() && sampleView) {
          const sampleText = sampleView.state.doc.toString();
          if (sampleText.trim()) {
            progress('测试输入为空，使用题目输入样例…');
            inputView.dispatch({changes:{from:0,to:inputView.state.doc.length,insert:sampleText}});
            await pause(); check();
            if (inputView.state.doc.toString() !== sampleText) throw new Error('平台未确认样例输入，未运行测试');
          }
        }
      }
      const run = [...liveArea.querySelectorAll('button')].filter(button => /^(运行测试|Run Test Case)$/.test(button.textContent.trim()) && visible(button));
      if (run.length !== 1 || run[0].disabled || run[0].getAttribute('aria-disabled') === 'true') throw new Error('平台“运行测试”不可用；未请求 AI');
      // This is the custom-test action; never search for or click a submission control.
      run[0].click();
      requested = true;
    }
    progress('正在等待平台测试与编译反馈…');
    while (true) {
      await pause(); check();
      const current = feedback(snapshot.target);
      const completed = current.state === 'ready' && current.matchesCode &&
        (baseline.state === 'pending' || current.id !== baseline.id || current.text !== baseline.text);
      if (completed) return current;
    }
  }

  function guard(snapshot) {
    if (route().key !== snapshot.route.key) throw new Error('题目已切换，已停止填写');
    const target = editor();
    if (target.element !== snapshot.target?.element || target.read() !== snapshot.code) throw new Error('代码或编辑器已变化，保留你的修改；请重新分析');
    if (snapshot.revision && target.revision?.() !== snapshot.revision) throw new Error('代码编辑记录已变化，保留你的修改；请重新分析');
    if (snapshot.statement && statement() !== snapshot.statement) throw new Error('题目内容已变化，请重新分析');
    if (snapshot.detectedLanguage !== undefined && language(target) !== snapshot.detectedLanguage) throw new Error('编程语言已变化，请重新分析');
    return target;
  }

  function fill(snapshot, code) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('没有有效修正代码');
    const target = guard(snapshot);
    const normalized = cleanCode(code);
    const before = target.read();
    target.write(normalized);
    if (target.read() !== normalized) throw new Error('编辑器未确认写入；请核对页面代码');
    return {route: snapshot.route, target, before, after: normalized, afterRevision: target.revision?.()};
  }

  function undo(backup) {
    if (!backup) throw new Error('没有可恢复的原代码');
    const target = guard({route: backup.route, target: backup.target, code: backup.after, revision: backup.afterRevision});
    target.write(backup.before);
    if (target.read() !== backup.before) throw new Error('编辑器未确认恢复');
  }
  return {route, editor, statement, snapshot, guard, fill, undo, language, feedback, runTest, sampleInput, testInput, compilerOptions};
}
module.exports = {createAdapter};
