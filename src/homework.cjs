// Public Chaoxing page adapter. Reads DOM and returns native controls; never sends platform requests.
const ROOTS = '.TiMu, .questionLi, .questionBox, .questionWrap, [data-cx-question]';
const SAVE_FEEDBACK = '#saveSuccessContent, #dialogToast, .save-result, [data-save-state]';
const { virtualManifest } = require('./task-adapters.cjs');
function pathOf(doc) { try { return new URL(doc.URL).pathname; } catch { return ''; } }
function chapterTask(doc) {
  try {
    const url = new URL(doc.URL);
    const params = url.searchParams;
    const taskId = params.get('jobid') || params.get('jobId') || params.get('originJobId') || params.get('originjobid') || '';
    return params.has('knowledgeid') || params.has('knowledgeId') || /^work-/i.test(taskId) || params.has('originJobId') || params.has('originjobid');
  } catch { return false; }
}
function kind(doc) {
  const path = pathOf(doc);
  if (/\/(?:exam|exam-ans)\//i.test(path) || doc.querySelector('#examId, input[name="examId"]')) return 'none';
  if (/\/(?:mooc2\/)?work\/(?:view|lookWork|viewWork|viewWorkNew|review|workAnswer|preview)(?:\/|$)/i.test(path)) return 'review';
  // 章节任务也复用 doHomeWorkNew，但应沿用章节测验开关与提交策略。
  // knowledge/job 参数来自卡片内任务 iframe，不代表独立课后作业入口。
  if (/\/(?:mooc2\/)?work\/(?:dowork|doHomeWorkNew|doHomeWork|answer)(?:\/|$)/i.test(path)) return chapterTask(doc) ? 'none' : 'answer';
  if (/\/work\/(?:list|stu-work|workList)(?:\/|$)/i.test(path)) return 'list';
  if (/\/work\/(?:detail|workDetail)(?:\/|$)/i.test(path) || doc.querySelector('[data-cx-homework-detail]')) return 'detail';
  return 'none';
}
function value(doc, selector) { const node = doc.querySelector(selector); return node?.value || node?.getAttribute('data-value') || ''; }
function identity(doc) {
  const url = new URL(doc.URL);
  const id = value(doc, '#workId, input[name="workId"], #workid, input[name="workid"], #workLibraryId')
    || url.searchParams.get('workId') || url.searchParams.get('workid') || '';
  const course = value(doc, '#courseId, input[name="courseId"], #courseid') || url.searchParams.get('courseId') || url.searchParams.get('courseid') || '';
  const clazz = value(doc, '#classId, input[name="classId"], #clazzid') || url.searchParams.get('clazzid') || url.searchParams.get('classId') || '';
  return JSON.stringify([url.origin, course, clazz, id || url.pathname]);
}
function readonly(doc, visible) {
  if (kind(doc) === 'review') return true;
  if ([...doc.querySelectorAll('[data-submit-state="success"]')].some(visible)) return true;
  return [...doc.querySelectorAll('[data-work-status], .workStatus, .work-status, .mark_status')].some(node => visible(node)
    && (/^(?:finished|submitted|reviewed)$/.test(node.dataset.workStatus || '') || /已提交|已完成|待批阅|已批阅/.test(node.textContent)));
}
function questionId(root) {
  const explicit = root.getAttribute('data-question-id') || root.getAttribute('data-questionid') || root.getAttribute('data-id')
    || root.getAttribute('questionid') || root.getAttribute('data');
  if (explicit) return explicit;
  if (/^question\d+$/.test(root.id)) return root.id.replace(/^question/, '');
  const hidden = [...root.querySelectorAll('input[id^="answertype"], input[name^="answertype"], input[name^="type"]')]
    .find(input => /^(?:answertype|type)\d+$/.test(input.name || input.id));
  return hidden ? (hidden.name || hidden.id).replace(/^(?:answertype|type)/, '') : '';
}
function heading(root) {
  return root.querySelector('.Zy_TItle .fontLabel, [data-question-title], .mark_name, .tkItem_title, .question-title, .Zy_TItle, :scope > h3, :scope > p');
}
function hint(root) {
  return root.getAttribute('typeName') || root.getAttribute('typename') || root.getAttribute('data-question-type')
    || root.querySelector('.newZy_TItle, .colorShallow, .tkTopic_title, .mark_name > span, :scope > h3 > span')?.textContent || '';
}
function roots(doc, selector = ROOTS) {
  const candidates = [...doc.querySelectorAll(selector)].filter(root => !root.closest('template, [data-cx-template], [data-cx-ignore]')
    && !(root.matches('.TiMu:not(.questionLi)') && root.querySelector('.questionLi')));
  return candidates.filter(root => !candidates.some(parent => parent !== root && parent.contains(root)));
}
function manifest(doc) {
  const virtual = virtualManifest(doc);
  const count = doc.querySelector('#totalQuestionNum, input[name="totalQuestionNum"], input[name="questionCount"], [data-question-count]');
  let actionTotal = '';
  try { actionTotal = new URL(doc.querySelector('form[action*="totalQuestionNum"]')?.getAttribute('action') || '', doc.URL).searchParams.get('totalQuestionNum') || ''; } catch {}
  const totalValue = Number(count?.value || count?.dataset.questionCount || actionTotal || virtual.total || 0);
  const cards = [...doc.querySelectorAll('.answerCard [data-questionid], .answerCard [data-question-id], .answer-card [data-question-id], [data-cx-question-index] [data-question-id]')];
  const ids = cards.map(node => node.getAttribute('data-questionid') || node.getAttribute('data-question-id')).filter(Boolean);
  if (!ids.length) ids.push(...virtual.ids);
  const distinct = [...new Set(ids)];
  const total = Number.isInteger(totalValue) && totalValue > 0 ? totalValue : distinct.length;
  const conflicts = virtual.conflicts || distinct.length > 0 && distinct.length !== total || ids.length !== distinct.length;
  const page = doc.querySelector('.question-pagination, .questionPager, [data-cx-question-pages], #questionPage');
  const paged = Boolean(page) || virtual.paged || total > roots(doc).length;
  const missingIdentity = roots(doc).some(root => !questionId(root));
  const url = new URL(doc.URL);
  const workId = value(doc, '#workId, input[name="workId"], #workid, #workLibraryId') || url.searchParams.get('workId') || url.searchParams.get('workid');
  return { total, ids: distinct, paged, known: total > 0 && !conflicts && !missingIdentity && (!paged || Boolean(workId)), conflicts };
}
function control(doc, action, usable) {
  const selectors = {
    save: '[data-action="save-work"], #saveWork, [onclick*="saveWork"], [onclick*="noSubmit"], .btnSave',
    submit: '[data-action="submit-homework"], #submitWork, .Btn_blue_1, .completeBtn, [onclick*="submitWork"], #btnBlueSubmit',
    next: '[data-action="next-work-page"], #nextQuestion, .nextQuestion, #nextPage, [onclick*="getTheNextQuestion(1)"]',
  };
  const labels = { save: /^(?:暂时保存|暂存|保存)(?:答案|作业)?$/, submit: /^(?:提交|提交作业|确认提交)$/, next: /^(?:下一题|下一页)$/ };
  const candidates = [...doc.querySelectorAll(selectors[action])].filter(node => usable(node) && labels[action].test((node.textContent || node.value || node.getAttribute('aria-label') || '').replace(/\s/g, '')));
  return candidates.length === 1 ? candidates[0] : null;
}
function saveEvidence(doc, visible) {
  return [...doc.querySelectorAll(SAVE_FEEDBACK)].filter(node => visible(node)
    && (node.dataset.saveState === 'success' || /保存成功|暂存成功/.test(node.textContent)));
}
function submissionState(doc, visible) {
  if (readonly(doc, visible)) return 'acknowledged';
  if ([...doc.querySelectorAll('[data-submit-state="success"], .submit-result, [data-submit-result]')].some(node => visible(node) && (node.dataset.submitState === 'success' || /提交成功/.test(node.textContent)))) return 'acknowledged';
  if ([...doc.querySelectorAll('[data-submit-state="rejected"], .submit-error, [data-submit-error]')].some(node => visible(node) && (node.dataset.submitState === 'rejected' || /提交失败|未答完/.test(node.textContent)))) return 'rejected';
  return 'unknown';
}
function workURL(raw, doc) {
  try {
    const url = new URL(raw, doc.URL);
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)chaoxing\.com$/i.test(url.hostname) || url.username || url.password) return null;
    if (!/\/work\/(?:dowork|doHomeWorkNew|doHomeWork|detail|workDetail|view|lookWork|viewWork)(?:\/|$)/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
function listEntries(doc, visible) {
  if (!['list', 'detail'].includes(kind(doc))) return [];
  const candidates = [...doc.querySelectorAll('li[data], [data-cx-homework], .work-item, .work-list li, .workList li, a[href*="/work/"]')];
  const entries = [], seen = new Set();
  for (const item of candidates) {
    if (!visible(item)) continue;
    const link = item.matches('a[href]') ? item : item.querySelector('a[href*="/work/"]');
    const url = workURL(link?.getAttribute('href') || item.getAttribute('data') || item.getAttribute('data-url'), doc);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const paragraphs = [...item.querySelectorAll('p')];
    const title = (item.getAttribute('data-title') || item.querySelector('.work-title, .workName, h3, h4')?.textContent || paragraphs[0]?.textContent || link?.textContent || '课程作业').trim();
    const status = item.querySelector('.work-status, .status')?.textContent || paragraphs[1]?.textContent || '';
    const restricted = /未开始|未开放|已截止|已过期|已结束/.test(status) || item.matches('.locked, [aria-disabled="true"]');
    entries.push({ title, status: status.trim(), url, element: link || item, restricted });
  }
  return entries;
}
module.exports = { ROOTS, SAVE_FEEDBACK, chapterTask, kind, identity, readonly, questionId, heading, hint, roots, manifest, control, saveEvidence, submissionState, workURL, listEntries };
