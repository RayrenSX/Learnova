// Native DOM/model adapters. No synthetic attendance, location, recordings or completion reports.
const {cmView}=require('./editor-models.cjs');
const {nativeTask,nativeFinished}=require('./platform-tasks.cjs');
const LIVE_RE = /直播|live|liveroom/i;
const SIGN_RE = /签到|签退|打卡/;
const DISCUSSION_RE = /讨论|话题|bbs|discussion/i;
const SPECIAL_RE = /附件|录音|语音|编程|互评|分组|问卷|投票/;
const BUTTONS = 'button, input[type=button], input[type=submit], a, [role=button]';
const ROOTS = '[data-cx-special], .questionLi, .TiMu, .questionBox, .questionWrap, [data-cx-question]';
function text(node) { return String(node?.value || node?.textContent || node?.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim(); }
function visible(node) {
  if (!node?.isConnected || node.closest?.('[hidden], [aria-hidden="true"], #cx-video-helper-host')) return false;
  const win = node.ownerDocument?.defaultView;
  if (!win || !node.getClientRects?.().length) return false;
  const style = win.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}
function enabled(node) { return visible(node) && !node.matches(':disabled, [aria-disabled="true"], .disabled, [class*="_disable"]'); }
function path(doc) { try { return new URL(doc.URL).pathname; } catch { return ''; } }
function nodes(root, selector) { return [...root.querySelectorAll(selector)].filter(visible); }
function nativeButtons(root, regex) { return nodes(root, BUTTONS).filter(node => enabled(node) && regex.test(text(node).replace(/\s/g, ''))); }
function pdfResource(doc) { return /\/ananas\/modules\/pdf\/(?:mooc2-resource-index|index)\.html/i.test(path(doc)); }
function taskKinds(doc) {
  const p = path(doc), kinds = [];
  if (pdfResource(doc)) kinds.push('pdf-resource');
  if (/\/(?:live|zhibo|liveroom)(?:\/|\.|$)/i.test(p) || nodes(doc, '[data-live], [data-live-player], .live-player, .liveRoom').length) kinds.push('live');
  if (/\/(?:sign|signIn|signIn2|signDetail|preSign|signDetail2)(?:\/|\.|$)/i.test(p) || nodes(doc, '[data-sign], [data-checkin], .signBtn, .sign-btn, #signBtn, #signInBtn').length) kinds.push('sign');
  if (/\/(?:bbs|discussion|discuss|topic)(?:\/|\.|$)/i.test(p) || nodes(doc, '[data-discussion], .bbs-topic, .discussion-topic, .forum-post').length) kinds.push('discussion');
  if (/\/page\/active\/stuActiveList(?:\/|$)/i.test(p)) kinds.push('activity-list');
  if (specialRoots(doc).length) kinds.push('special');
  return kinds;
}
function pageKind(doc) { return taskKinds(doc)[0] || 'none'; }
function completion(root, kind) {
  if (nativeFinished(root)) return true;
  if (root.nodeType === 9) {
    const kinds = kind ? [kind] : taskKinds(root).filter(item => ['live','sign','discussion'].includes(item));
    const scopes = {live:'[data-live], [data-live-player], .live-player, .liveRoom', sign:'[data-sign], [data-checkin]', discussion:'[data-discussion], .discussion-topic, .bbs-topic'};
    const markers = {live:'.live-finished, .liveFinish', sign:'.sign-success, #signSuccess', discussion:'.discussion-success'};
    if ([root.documentElement,root.body].some(node => node?.matches('[data-task-state="success"], [data-finished="true"]'))) return true;
    return kinds.length > 0 && kinds.every(item => nodes(root,markers[item]).length > 0 || nodes(root,scopes[item]).some(node => completion(node)));
  }
  return Boolean(root.matches?.('[data-task-state="success"], [data-finished="true"], .ans-job-finished, .job-finished'))
    || nodes(root, '[data-task-state="success"], [data-submit-state="success"], [data-finished="true"], .sign-success, #signSuccess, .live-finished, .liveFinish, .discussion-success').length > 0;
}
function liveState(doc) {
  const player = nodes(doc, 'video, audio, iframe[src*="live"], [data-live-player], .live-player, .liveRoom')[0];
  const state = nodes(doc, '[data-live-state], .live-status, .liveStatus').map(text).join(' ');
  const finished = completion(doc,'live') || /^(?:直播已结束|回放已结束)$/.test(state);
  return { player, finished, waiting: /未开始|等待开播/.test(state), active: taskKinds(doc).includes('live') && !finished };
}
function signControls(doc) { return nativeButtons(doc, /^(?:签到|立即签到|开始签到|确认签到|打卡|立即打卡|签退)$/); }
function discussionControls(doc) {
  return [...new Set([...nativeButtons(doc, /^(?:发表|发布|发表讨论|发表回复|发布讨论|提交讨论|提交回复|回复)$/),
    ...nodes(doc,'.edit_btn .jb_btn, .addReply').filter(node => enabled(node) && /^(?:发布|回复)$/.test(text(node)))])];
}
function textEditor(root, win = root.ownerDocument?.defaultView || root.defaultView) {
  const candidates = [];
  for (const textarea of nodes(root, 'textarea')) {
    if (textarea.disabled || textarea.readOnly || textarea.closest('.CodeMirror, .cm-editor, .ace_editor')) continue;
    const ue = win?.UE?.instants && Object.values(win.UE.instants).find(editor => editor.textarea === textarea || editor.key === textarea.id);
    if (ue?.setContent) {
      candidates.push({element: textarea, read: () => ue.getContentTxt?.() || ue.body?.textContent || '',
        write(value) { if (ue.isReady === false) throw new Error('富文本编辑器未就绪'); ue.setContent(escapeHTML(value).replace(/\n/g, '<br>')); ue.sync?.(); }});
    } else candidates.push(plainEditor(textarea));
  }
  for (const element of nodes(root, '[contenteditable="true"]')) {
    if (element.closest('.cm-editor, .ace_editor, .CodeMirror') || candidates.some(c => c.element.contains(element))) continue;
    candidates.push(plainEditor(element));
  }
  for (const frame of nodes(root, 'iframe')) {
    try { const body = frame.contentDocument?.body;
      if (body && (body.isContentEditable || body.ownerDocument.designMode === 'on') && !candidates.some(c => c.element.id && frame.id.startsWith(c.element.id))) {
        const ue = win?.UE?.instants && Object.values(win.UE.instants).find(editor => editor.body === body || editor.iframe === frame);
        candidates.push(ue?.setContent ? {element:body, read: () => ue.getContentTxt?.() || body.innerText,
          write(value) {ue.setContent(escapeHTML(value).replace(/\n/g,'<br>')); ue.sync?.();}} : plainEditor(body));
      }
    } catch { /* Cross-origin editor requires its own adapter. */ }
  }
  const specific = candidates.filter(c => c.element.matches('[data-discussion-editor], .reply-content, .discussion-content, [placeholder="回复话题"], [name="content"], [name="replyContent"]'));
  const usable = specific.length ? specific : candidates;
  return usable.length === 1 ? usable[0] : null;
}
function escapeHTML(value) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])); }
function plainEditor(element) {
  const view = element.ownerDocument.defaultView;
  return {element, read: () => element.isContentEditable || element.ownerDocument.designMode === 'on' ? element.innerText : element.value,
    write(value) {
      if (element.isContentEditable || element.ownerDocument.designMode === 'on') element.textContent = value;
      else Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new view.Event('input', {bubbles:true})); element.dispatchEvent(new view.Event('change', {bubbles:true}));
    }};
}
function codeEditor(root, win = root.ownerDocument?.defaultView || root.defaultView) {
  const candidates = [];
  for (const element of nodes(root, '.CodeMirror')) {
    const cm = element.CodeMirror;
    if (cm && !cm.getOption?.('readOnly')) candidates.push({element, current:()=>element.CodeMirror===cm && !cm.getOption?.('readOnly'),read: () => cm.getValue(), revision: () => cm.doc?.history?.done?.length,
      language: () => cm.getOption?.('mode') || '',
      write(code) { cm.setValue(code); cm.save?.(); }});
  }
  for (const element of nodes(root, '.cm-editor')) {
    const content = element.querySelector('.cm-content');
    const view = cmView(element);
    if (view?.state?.doc && view.dispatch && content?.getAttribute('contenteditable') !== 'false' && content?.getAttribute('aria-readonly') !== 'true') candidates.push({element,
      current:()=>cmView(element)===view && element.querySelector('.cm-content')===content && content?.getAttribute('contenteditable')!=='false' && content?.getAttribute('aria-readonly')!=='true',
      read: () => view.state.doc.toString(), revision: () => view.state.doc,
      write: code => view.dispatch({changes:{from:0, to:view.state.doc.length, insert:code}})});
  }
  for (const element of nodes(root, '.ace_editor')) {
    const ace = element.env?.editor;
    if (ace?.getValue && !ace.getReadOnly?.()) candidates.push({element,current:()=>element.env?.editor===ace && !ace.getReadOnly?.(),read: () => ace.getValue(), write: code => ace.setValue(code, -1)});
  }
  for (const editor of win?.monaco?.editor?.getEditors?.() || []) {
    const element = editor.getDomNode(), model = editor.getModel();
    const readOnly=()=>editor.getRawOptions?.().readOnly || editor.getOption?.(win.monaco.editor.EditorOption?.readOnly ?? 91);
    if (element && visible(element) && root.contains(element) && model && !readOnly()) candidates.push({element,
      current:()=>editor.getModel()===model && !model.isDisposed?.() && !readOnly(),
      read: () => model.getValue(), revision: () => model.getAlternativeVersionId(), write: code => model.pushEditOperations([], [{range:model.getFullModelRange(),text:code}], () => null)});
  }
  for (const element of nodes(root, 'textarea[data-language], textarea.code, textarea[data-code-editor], textarea.code-editor')) {
    if (element.closest('.CodeMirror, .cm-editor, .ace_editor') || element.readOnly || element.disabled) continue;
    candidates.push(plainEditor(element));
  }
  return candidates.length === 1 ? candidates[0] : null;
}
function specialRoots(doc) {
  // Discussion attachment inputs belong to its one reply composer, not separate assignments.
  if (/\/(?:bbs|topic|discussion)(?:\/|$)/i.test(path(doc)) || doc.querySelector('[data-discussion]')) return [];
  const seeds = [...doc.querySelectorAll('input[type=file], [data-record-audio], .voice-record, .record-audio, .code-editor, .CodeMirror, .cm-editor, .ace_editor, .monaco-editor, textarea[data-language], textarea.code, [data-code-editor], .peer-review, [data-peer-review], .group-work, [data-group-work], .questionnaire, [data-survey], [data-vote]')]
    .filter(node=>!node.closest('template, [data-cx-template], [data-cx-ignore], #cx-video-helper-host') && (visible(node) || node.matches('input[type=file]') && visible(node.parentElement)));
  const candidates = [...new Set(seeds.map(node => {
    const question=node.closest('.questionLi, .questionBox, .questionWrap, [data-cx-question], [data-cx-special]');
    if(question)return question;
    const legacy=node.closest('.TiMu');
    if(legacy && !legacy.querySelector('.questionLi, [data-cx-question]'))return legacy;
    const attachment=node.closest('.upload-block, .file-upload, [data-attachment]');
    if(attachment)return attachment;
    const host=node.closest('form, [data-task-root], .work-area');
    if(host && !host.querySelector('.questionLi, [data-cx-question]'))return host;
    return node.matches('input[type=file]') ? node : node.parentElement;
  }))];
  return candidates.filter(root => !candidates.some(parent => parent !== root && parent.contains(root)));
}
function specialControls(root) {
  const kinds = [];
  const files = [...(root.matches?.('input[type=file]') ? [root] : []),...root.querySelectorAll('input[type=file]')].filter(node => !node.disabled);
  if (files.length) kinds.push('attachment');
  if (nodes(root, '[data-record-audio], .voice-record, .record-audio').length) kinds.push('audio-recording');
  if (nodes(root, '.code-editor, .CodeMirror, .cm-editor, .ace_editor, .monaco-editor, textarea[data-language], textarea.code, [data-code-editor]').length) kinds.push('programming');
  if (root.matches?.('[data-peer-review], .peer-review, [data-group-work], .group-work') || nodes(root, '[data-peer-review], .peer-review, [data-group-work], .group-work').length) kinds.push('peer/group');
  if (root.matches?.('[data-survey], [data-vote], .questionnaire') || nodes(root, '[data-survey], [data-vote], .questionnaire').length) kinds.push('survey/vote');
  return {kinds, files, controls:nodes(root, BUTTONS), record:nativeButtons(root, /^(?:开始录音|录音|重新录音)$/),
    stop:nativeButtons(root, /^(?:停止录音|结束录音|完成录音)$/),
    save:nativeButtons(root, /^(?:保存|暂存|保存草稿)(?:作业|答案)?$/),
    submit:nativeButtons(root, /^(?:提交|提交作业|提交互评|提交评价|提交小组作业)$/),
    run:nativeButtons(root, /^(?:运行|运行代码|编译运行|评测|运行测试)$/)};
}
const ACTION_FEEDBACK = {
  '暂存':'#saveSuccessContent, #dialogToast, .save-result, [data-save-state]',
  '运行测试':'.run-result, .compile-result, .test-result, [data-run-state]',
  '提交':'.submit-result, [data-submit-state], [data-submit-result]',
  '签到':'.sign-success, #signSuccess, [data-sign-state]',
};
function actionFeedback(root, action) {
  const doc = root.ownerDocument || root;
  const scope = root.nodeType === 9 || specialRoots(doc).length === 1 ? doc : root;
  const selector = ACTION_FEEDBACK[action];
  if (!selector) return [];
  return nodes(scope,selector).filter(node => node.matches('[data-save-state="success"], [data-run-state="success"], [data-submit-state="success"], [data-sign-state="success"], .sign-success, #signSuccess')
    || (action === '暂存' ? /保存成功|暂存成功/ : action === '运行测试' ? /运行完成|编译成功|测试完成/ : action === '签到' ? /签到成功/ : /提交成功/).test(text(node)));
}
function taskTitle(root) { return text(root.querySelector('[data-question-title], .mark_name, .problem-title, .question-title, h1, h2, h3')) || '当前任务'; }
function statement(root, {bounded=true}={}) {
  const clone = (root.nodeType === 9 ? root.querySelector('[data-discussion-topic], .topicDetail_main, .topic-content, .topicDetail, .topic_content') || root.body : root).cloneNode(true);
  clone.querySelectorAll('script, style, button, input, textarea, iframe, [contenteditable], .CodeMirror, .cm-editor, .ace_editor, .monaco-editor, #cx-video-helper-host').forEach(node => node.remove());
  clone.querySelectorAll('p, div, pre, li, tr, h1, h2, h3').forEach(node => node.append('\n'));
  const value = String(clone.textContent || '').trim();
  if (bounded && value.length > 40000) throw new Error('题目超过处理范围，请选中对应题目单独处理');
  return value;
}
function virtualManifest(doc) {
  const counts = [...doc.querySelectorAll('#totalQuestionNum, #questionCount, input[name="totalQuestionNum"], input[name="questionCount"], [data-total-question], [data-question-count]')]
    .map(node => Number(node.value || node.getAttribute('data-total-question') || node.getAttribute('data-question-count'))).filter(n => Number.isSafeInteger(n) && n > 0);
  const cardNodes = [...doc.querySelectorAll('.answerCard [data-questionid], .answerCard [data-question-id], .answer-card [data-question-id], [data-cx-question-index] [data-question-id], [data-question-index] [data-questionid]')];
  const ids = cardNodes.map(node => node.getAttribute('data-question-id') || node.getAttribute('data-questionid')).filter(Boolean);
  if (!ids.length) {
    const hidden = doc.querySelector('#questionIds, input[name="answerwqbid"]');
    const value = hidden?.value?.replace(/,$/, '');
    if (value && /^\d+(?:,\d+)*$/.test(value)) ids.push(...value.split(','));
  }
  const unique = [...new Set(ids)];
  const total = counts[0] || unique.length;
  const conflicts = counts.some(n => n !== total) || ids.length !== unique.length || unique.length > 0 && unique.length !== total;
  const virtual = Boolean(doc.querySelector('[data-virtualized], [data-virtual-list], .virtual-list, .question-virtual-list'));
  const paged = virtual || Boolean(doc.querySelector('.question-pagination, .questionPager, [data-cx-question-pages], #questionPage'));
  return {total, ids:unique, conflicts, virtual, paged, known:total > 0 && !conflicts};
}
function audioSources(root) {
  const urls=[...root.querySelectorAll('audio')].map(audio=>{
    const sources=[...audio.querySelectorAll('source[src]')];
    const preferred=sources.find(source=>!source.type || audio.canPlayType(source.type)) || sources[0];
    return audio.currentSrc || audio.getAttribute('src') || preferred?.getAttribute('src');
  });
  urls.push(...[...root.querySelectorAll('[data-audio-url]')].map(node=>node.getAttribute('data-audio-url')));
  return [...new Set(urls.filter(Boolean).map(raw=>{try{return new URL(raw,root.ownerDocument.URL).href;}catch{return raw;}}))];
}
function activityEntries(doc) {
  if (!/\/page\/active\/stuActiveList(?:\/|$)/i.test(path(doc))) return [];
  return nodes(doc,'li[activeid][activestatus][onclick*="activeRowClick"]').map(node => ({element:node,
    title:text(node.querySelector('p')) || '课程活动', status:node.getAttribute('activestatus'),
    type:node.getAttribute('activetype'), ended:node.getAttribute('activestatus') === '2'}));
}
module.exports = {LIVE_RE,SIGN_RE,DISCUSSION_RE,SPECIAL_RE,ACTION_FEEDBACK,actionFeedback,nativeTask,nativeFinished,pageKind,taskKinds,liveState,signControls,discussionControls,textEditor,codeEditor,specialRoots,specialControls,taskTitle,statement,completion,virtualManifest,pdfResource,audioSources,activityEntries,text,visible,enabled};
