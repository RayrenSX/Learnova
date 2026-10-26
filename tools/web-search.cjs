// 搜索执行证据由网络响应和工具记录生成，与模型自报字段分离。
const STATUSES = ['not_attempted', 'succeeded', 'no_results', 'failed', 'unsupported'];
function searchError(status, message, details = {}) {
  const error = new Error(`联网搜索 [${status}]：${message}`);
  error.search = { ...details, status, evidence: [] };
  return error;
}
function validUrl(raw) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.hostname ? url.href : null;
  } catch { return null; }
}
function searchEndpoint(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('搜索接口需 HTTPS 或本机 HTTP，不能包含鉴权参数、用户名或密码');
  }
  // 此兼容站文档明确提供同域 REST 端点；不得向 MCP 发送普通搜索 JSON。
  if (url.hostname === 'tavily.sharyuke.com' && /^\/api\/mcp(?:\/sse)?\/?$/.test(url.pathname)) url.pathname = '/api/proxy/search';
  else if (/\/mcp(?:\/sse)?\/?$/.test(url.pathname)) throw new Error('这里需要 REST 搜索地址，不能填 MCP 地址；请查阅服务商搜索接口文档');
  return url.href;
}
function queryText(raw) {
  return String(raw || '').replace(/\[图片:[^\]]*\]/g, ' ').replace(/[\u0000-\u001f]/g, ' ')
    .replace(/^(?:\d+[.、\s]*)?【[^】]*】/, '').replace(/\s+/g, ' ').trim();
}
function planQueries(question) {
  const stem = queryText(question.question);
  if (!stem) throw searchError('not_attempted', '题干无法提取搜索词；请手动核对图片或字体');
  // 保留题干限定条件并加入选项上下文；组合题单独覆盖各子题。
  const options = (question.options || []).map(item => queryText(item.text)).filter(Boolean);
  const queries = [stem + (options.length ? ' ' + options.slice(0, 4).join(' ') : '')];
  for (const group of question.groups || []) {
    const title = queryText(group.title || (Array.isArray(group) ? group[1] : ''));
    if (title) queries.push(`${stem} ${title}`);
  }
  if (options.length > 2) queries.push(`${stem} ${options.slice(2).join(' ')} 资料 定义`);
  const unique = [...new Set(queries)];
  if (unique.length > 4 || unique.some(query => query.length > 350)) {
    throw searchError('not_attempted', '题目或子题超出独立搜索查询范围，不能截断未核实内容；请选择内置搜索或分题处理');
  }
  return unique;
}
function normalizeResults(raw) {
  // Tavily Hub documented envelope: {code:0,data:{ok:true,data:{results:[]}}}。
  if (raw && Object.hasOwn(raw, 'code')) {
    if (raw.code !== 0 || raw.data?.ok !== true) throw searchError('failed', [401, 40101, 403].includes(raw.code)
      ? '搜索兼容服务鉴权失败，请检查搜索密钥及权限' : raw.code === 429 ? '搜索兼容服务限流，请稍后重试'
        : '搜索兼容服务返回失败状态，未取得有效证据');
    raw = raw.data.data;
  }
  if (!raw || !Array.isArray(raw.results)) throw searchError('failed', '搜索服务返回无效 results 数组');
  return raw.results.filter(item => item && typeof item.title === 'string' && item.title.trim()
    && typeof item.content === 'string' && item.content.trim() && validUrl(item.url)
    && (typeof item.score !== 'number' || item.score >= 0.25)).map(item => ({
    title: item.title.trim().slice(0, 300), url: validUrl(item.url), summary: item.content.trim().slice(0, 4000),
    ...(typeof item.published_date === 'string' ? { publishedDate: item.published_date } : {}),
  })).slice(0, 6);
}
function responseBody(body) {
  return { model: body.model, stream: false, store: false, instructions: body.messages[0].content,
    input: body.messages.slice(1).map(message => ({ role: message.role, content: typeof message.content === 'string' ? message.content
      : message.content.map(part => part.type === 'image_url' ? { type: 'input_image', image_url: part.image_url.url }
        : { type: 'input_text', text: part.text }) })),
    tools: [{ type: 'web_search' }], tool_choice: { type: 'web_search' }, include: ['web_search_call.action.sources'] };
}
function parseResponses(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const calls = output.filter(item => item?.type === 'web_search_call');
  if (response?.status !== 'completed') throw searchError('failed', 'Responses 响应未完成或结构不兼容', { provider: 'responses', requests: 1 });
  if (!calls.length) throw searchError('unsupported', '本次响应没有 web_search_call；服务忽略工具或当前模型不支持。请选择独立搜索，或让服务商确认工具支持', { provider: 'responses', requests: 1 });
  const completed = calls.filter(item => item.status === 'completed' && item.action?.type === 'search');
  if (!completed.length) throw searchError('failed', '搜索工具失败或没有完成 search 动作', { provider: 'responses', requests: 1 });
  const messages = output.filter(item => item?.type === 'message' && item.role === 'assistant' && item.phase !== 'commentary');
  const parts = messages.flatMap(message => message.content || []);
  const urls = [...completed.flatMap(call => call.action.sources || []), ...parts.flatMap(part => part.annotations || [])
    .filter(citation => citation.type === 'url_citation')];
  const evidence = [...new Map(urls.filter(item => validUrl(item.url)).map(item => [validUrl(item.url),
    { url: validUrl(item.url), title: typeof item.title === 'string' ? item.title : '', summary: '' }])).values()];
  if (!evidence.length) throw searchError('no_results', '工具已执行，但没有可用的结果网址或引用，不能核验资料', { provider: 'responses', requests: 1 });
  const final = messages.at(-1);
  const text = (final?.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('\n');
  const search = { status: 'succeeded', provider: 'responses', requests: 1, evidence,
    calls: completed.map(call => ({ id: call.id || '', status: call.status, action: call.action.type,
      queries: call.action.queries || (call.action.query ? [call.action.query] : []) })) };
  return { response: { choices: [{ message: { content: text } }] }, search };
}
async function independentSearch(question, config, request, signal) {
  if (!config.key) throw searchError('not_attempted', '请在设置 → AI / 题库 → 联网搜索配置中保存 Tavily 搜索密钥', { provider: 'tavily', requests: 0 });
  let url;
  try { url = searchEndpoint(config.url); }
  catch { throw searchError('not_attempted', '搜索接口地址无效，请重新保存 HTTPS 搜索地址', { provider: 'tavily', requests: 0 }); }
  if (new URL(url).origin !== config.keyOrigin) throw searchError('not_attempted', '搜索密钥未绑定当前接口域名，请重新保存', { provider: 'tavily', requests: 0 });
  const queries = planQueries(question);
  let requests = 0;
  const evidence = new Map();
  const runs = [];
  for (const query of queries) {
    if (signal.aborted) throw searchError('failed', '请求已取消', { provider: 'tavily', requests });
    const run = { query, startedAt: new Date().toISOString(), status: 'failed', resultCount: 0 };
    runs.push(run);
    try {
      requests++;
      const raw = await request(url, { query, max_results: 6, search_depth: 'basic', include_answer: false }, signal,
        { service: '搜索', timeoutMs: 30000, headers: { Authorization: `Bearer ${config.key}` },
          onResponse: meta => Object.assign(run, meta) });
      const results = normalizeResults(raw);
      Object.assign(run, { status: results.length ? 'succeeded' : 'no_results', resultCount: results.length, completedAt: new Date().toISOString() });
      for (const item of results) evidence.set(item.url, item);
    } catch (error) {
      run.completedAt = new Date().toISOString();
      if (!error.search) error.search = { status: 'failed', provider: 'tavily', requests, evidence: [], runs };
      else error.search = { ...error.search, provider: 'tavily', requests, runs };
      throw error; // 部分请求失败也不伪装为完成整题核查。
    }
  }
  if (signal.aborted) throw searchError('failed', '请求已取消', { provider: 'tavily', requests });
  if (!evidence.size) throw searchError('no_results', '搜索正常响应但没有有效标题、摘要和 URL，或结果相关性过低', { provider: 'tavily', requests, runs });
  return { status: 'succeeded', provider: 'tavily', requests, queries, runs, evidence: [...evidence.values()].slice(0, 18) };
}
module.exports = { STATUSES, searchError, searchEndpoint, planQueries, normalizeResults, responseBody, parseResponses, independentSearch };
