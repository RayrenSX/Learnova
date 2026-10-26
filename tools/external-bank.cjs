const N1_URL = 'https://tk.n1t.cn/api/search.php';
const TYPE_NAMES = { single: '单选题', multiple: '多选题', judgment: '判断题', blank: '填空题', essay: '简答题', line: '连线题', cloze: '完形填空', reading: '阅读理解' };
function isN1(raw) {
  try { const url = new URL(raw); return url.hostname === 'tk.n1t.cn' && url.pathname === '/api/search.php' && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
}
function n1Config(key) {
  if (typeof key !== 'string' || !key.trim() || /您的|请填写|密钥/.test(key)) throw new Error('请填写 N1 题库密钥');
  return { name: 'N1搜题助手', url: N1_URL, method: 'POST', profile: 'n1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: { question: '{{question}}', key: key.trim(), type: '{{typeName}}', options: '{{optionsJSON}}' }, answerPath: 'data' };
}
function normalizeConfig(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('题库配置需为对象');
  if (item.profile && item.profile !== 'n1') throw new Error('不支持的题库适配类型');
  if (item.type && !['GM_xmlhttpRequest','fetch'].includes(item.type)) throw new Error('不支持的 OCS 请求类型');
  const method = String(item.method || (item.handler !== undefined ? 'GET' : 'POST')).toUpperCase();
  if (!['GET', 'POST'].includes(method)) throw new Error('题库请求方法必须是 GET 或 POST');
  const n1 = isN1(item.url);
  if (item.profile === 'n1' && !n1) throw new Error('N1 题库密钥只能发送到 tk.n1t.cn 的搜索接口');
  if (item.handler !== undefined) {
    // 只把简单的属性读取/状态判断降级为声明式配置；绝不 eval 或运行导入函数。
    const declarative = parseDeclarativeHandler(item.handler);
    if (!declarative && item.allowCode !== true) throw new Error('可执行 OCS handler 需设置 allowCode:true，或改用 answerPath 声明字段');
    if (declarative) { item = { ...item, ...declarative }; delete item.handler; }
    else if (typeof item.handler !== 'string' || item.handler.length > 50000) throw new Error('OCS handler 格式或长度无效');
  }
  if (!['json','text',undefined].includes(item.responseType || item.contentType)) throw new Error('OCS 响应类型只支持 json 或 text');
  if (Object.values(item.data || {}).some(value => value && typeof value === 'object' && value.handler) && item.allowCode !== true) throw new Error('data.handler 需设置 allowCode:true');
  if (n1) {
    const result = n1Config(item.data?.key);
    if (method !== 'POST') throw new Error('N1 搜索仅支持 POST');
    return { ...result, name: typeof item.name === 'string' && item.name.trim() ? item.name : result.name,
      ...(item.enabled !== undefined ? { enabled: item.enabled } : {}) };
  }
  return { ...item, method };
}
function parseDeclarativeHandler(handler) {
  if (typeof handler !== 'string' || handler.length > 2000) return null;
  const compact = handler.replace(/\s+/g, '').replace(/;$/, '');
  // Exact grammar: never infer a path while ignoring inversion, branches or transforms.
  const path = '[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*';
  const m = compact.match(new RegExp('^return\\(res\\)=>(?:res\\.('+path+')===([0-9]+|true|false|"[^"\\\\]*"|\'[^\'\\\\]*\')\\?)?\\[undefined,res\\.('+path+')\\](?::undefined)?$'));
  if (!m || Boolean(m[1]) !== compact.endsWith(':undefined')) return null;
  if (m[3].split('.').some(key => ['__proto__','constructor','prototype'].includes(key))) return null;
  const result = {answerPath:m[3]};
  if (m[1]) {result.successPath=m[1]; result.successValue=JSON.parse(m[2].startsWith("'") ? JSON.stringify(m[2].slice(1,-1)) : m[2]);}
  return result;
}
function fieldsOf(q) {
  const texts = (q.options || []).map(option => option.text);
  const options = ['blank', 'essay'].includes(q.type) ? [String(q.blanks || 1)] : texts;
  return { question: q.title, title: q.title, type: q.type, typeName: TYPE_NAMES[q.type] || q.type,
    options: texts.join('\n'), optionsJSON: JSON.stringify(options), groups: JSON.stringify(q.groups || []), blanks: String(q.blanks || 0),
    images: q.images || [], suggestion_title:q.title, suggestion_options:texts.join('\n') };
}
function makeRequest(config, q) {
  const fields = fieldsOf(q);
  const placeholders = /\{\{(question|title|type|typeName|options|optionsJSON|groups|blanks|images|suggestion_title|suggestion_options)\}\}|\$\{(question|title|type|typeName|options|optionsJSON|groups|blanks|images|suggestion_title|suggestion_options)\}/g;
  function replace(value, depth = 0) {
    if (depth > 12) throw new Error('题库模板嵌套过深');
    if (Array.isArray(value)) return value.map(item => replace(item,depth+1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,replace(item,depth+1)]));
    if (typeof value !== 'string') return value;
    // 校验配置模板本身；插入的题干、选项和子题中的代码符号必须原样保留。
    if (/\{\{|\$\{/.test(value.replace(placeholders, ''))) throw new Error('题库配置存在不支持的占位符');
    return value.replace(placeholders, (_, a, b) => typeof fields[a||b] === 'object' ? JSON.stringify(fields[a||b]) : fields[a||b]);
  }
  const data = config.data ? Object.fromEntries(Object.entries(config.data).map(([key,value]) =>
    [key,config.transformedKeys instanceof Set && config.transformedKeys.has(key) ? value : replace(value)])) : fields;
  const headers = { ...config.headers };
  const typeEntry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
  const type = typeEntry?.[1] || 'application/json';
  if (typeof type !== 'string') throw new Error('题库 Content-Type 必须为字符串');
  const form = /^application\/x-www-form-urlencoded(?:;|$)/i.test(type);
  if (!form && !/^application\/json(?:;|$)/i.test(type)) throw new Error('题库 POST 只支持 JSON 或表单编码');
  if (!typeEntry) headers['Content-Type'] = type;
  const url = String(config.url || '').replace(placeholders,(_,a,b) => encodeURIComponent(fields[a||b]));
  return { url, data, headers, body: form ? new URLSearchParams(Object.entries(data).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)])).toString() : JSON.stringify(data) };
}
function parseResponse(config, json, q) {
  const n1 = config.profile === 'n1' || isN1(config.url);
  if (n1 && json?.code !== 1) throw new Error('N1 题库未返回成功状态（可能未命中、密钥无效或配额不足），不采用响应中的答案');
  if (config.successPath) {
    const state = config.successPath.split('.').reduce((node, key) => node?.[key], json);
    if (state !== config.successValue) throw new Error('题库响应状态未通过 handler 条件');
  }
  const value = (config.answerPath || 'answers').split('.').reduce((node, key) => node?.[key], json);
  let answers = value;
  if (typeof value === 'string') {
    const exact = (q.options || []).some(option => String(option.text).trim() === value.trim());
    answers = n1 && (exact || ['single', 'judgment', 'essay'].includes(q.type)) ? [value]
      : value.split(config.separator || (n1 ? /[#;；|]/ : /[;；|]/));
  }
  if (!Array.isArray(answers) || !answers.length || answers.some(a => !['string', 'number', 'boolean'].includes(typeof a) || !String(a).trim())) throw new Error('题库答案缺少有效内容');
  const confidence = json.confidence === undefined ? 1 : Number(json.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('题库答案信心格式无效');
  const result = { answers: answers.map(String), confidence, source: `外部题库：${config.name}` };
  if (n1 && json.quota_info && typeof json.quota_info === 'object') {
    result.quota = Object.fromEntries(['remaining', 'free_remaining', 'recharge_balance', 'today_free_usage']
      .filter(key => typeof json.quota_info[key] === 'number' && Number.isFinite(json.quota_info[key]) && json.quota_info[key] >= 0)
      .map(key => [key, json.quota_info[key]]));
  }
  return result;
}
module.exports = { N1_URL, TYPE_NAMES, isN1, n1Config, normalizeConfig, parseDeclarativeHandler, fieldsOf, makeRequest, parseResponse };
