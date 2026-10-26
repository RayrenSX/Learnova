// 可选真实诊断：密钥仅来自环境变量；报告只包含执行元数据和实际来源。
const fs = require('node:fs');
const path = require('node:path');
const search = require('./web-search.cjs');
const mode = process.env.CX_SEARCH_MODE || 'responses';
const model = process.env.CX_AI_MODEL || 'gpt-5.6-terra';
const report = { time: new Date().toISOString(), mode, model, status: 'not_attempted', requests: [], evidence: [] };
const signal = new AbortController().signal;
async function request(url, body, callerSignal, options = {}) {
  const record = { endpoint: url, startedAt: new Date().toISOString(), toolTypes: (body.tools || []).map(tool => tool.type) };
  report.requests.push(record);
  try {
    const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(body), signal: AbortSignal.any([callerSignal, AbortSignal.timeout(options.timeoutMs || 180000)]) });
    record.httpStatus = result.status; record.completedAt = new Date().toISOString();
    if (!result.ok) { const error = new Error('HTTP ' + result.status); error.httpStatus = result.status; throw error; }
    return await result.json();
  } catch (error) {
    // fetch 异常正文不进入报告，以防服务把鉴权信息反射回来。
    record.completedAt = new Date().toISOString();
    if (error.httpStatus) throw error;
    throw new Error('搜索请求网络失败、超时或响应格式无效');
  }
}
(async () => {
  if (mode === 'tavily') {
    report.missing = !process.env.CX_SEARCH_API_KEY ? ['CX_SEARCH_API_KEY'] : [];
    if (!report.missing.length) Object.assign(report, await search.independentSearch({ question: 'C语言字符串结束字符 标准定义' },
      { url: process.env.CX_SEARCH_URL || 'https://api.tavily.com/search', key: process.env.CX_SEARCH_API_KEY,
        keyOrigin: new URL(process.env.CX_SEARCH_URL || 'https://api.tavily.com/search').origin }, request, signal));
  } else if (mode === 'responses') {
    report.missing = ['CX_AI_BASE_URL', 'CX_AI_API_KEY'].filter(name => !process.env[name]);
    if (!report.missing.length) {
      const base = search.searchEndpoint(process.env.CX_AI_BASE_URL).replace(/\/+$/, '').replace(/\/(?:responses|chat\/completions)$/, '');
      const raw = await request(base + '/responses', search.responseBody({ model, messages: [
        { role: 'system', content: '调用 web_search 阅读 C语言字符串结束字符的可靠文档，并提供实际引用。' },
        { role: 'user', content: '查阅 C 字符串结束字符的文档。' },
      ] }), signal, { headers: { Authorization: `Bearer ${process.env.CX_AI_API_KEY}` } });
      Object.assign(report, search.parseResponses(raw).search);
    }
  } else throw new Error('CX_SEARCH_MODE 必须为 responses 或 tavily');
})().catch(error => {
  report.status = error.search?.status || 'failed';
  report.httpStatus = error.httpStatus || null;
  report.error = error.search ? error.message : '真实搜索探测失败；详见 HTTP 状态或网络记录';
}).finally(() => {
  const target = path.join(__dirname, '..', 'test-results', 'live-capability-probe.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, missing: report.missing, httpStatus: report.httpStatus, resultCount: report.evidence.length, report: target }));
  if (report.status === 'failed') process.exitCode = 1;
});
