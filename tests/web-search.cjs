const assert = require('node:assert/strict');
const search = require('../tools/web-search.cjs');
const signal = new AbortController().signal;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const good = { status: 'completed', output: [
  { type: 'web_search_call', id: 'call1', status: 'completed', action: { type: 'search', query: 'reliable facts', sources: [{ title: 'Source', url: 'https://evidence.example/doc' }] } },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"answers":["B"],"confidence":0.9}' }] },
] };
(async () => {
  await test('Responses tool evidence produces succeeded and preserves answer JSON', () => {
    const parsed = search.parseResponses(good);
    assert.equal(parsed.search.status, 'succeeded'); assert.equal(parsed.search.calls[0].id, 'call1');
    assert.equal(JSON.parse(parsed.response.choices[0].message.content).answers[0], 'B');
  });
  await test('HTTP200/self-report/URL alone cannot establish a completed search', () => {
    assert.throws(() => search.parseResponses({ status: 'completed', output: [good.output[1]] }), error => error.search.status === 'unsupported');
    assert.throws(() => search.parseResponses({ status: 'completed', output: [{ ...good.output[0], status: 'failed' }] }), error => error.search.status === 'failed');
    assert.throws(() => search.parseResponses({ ...good, status: 'incomplete' }), error => error.search.status === 'failed');
  });
  await test('Finished search without actual result URLs is no_results', () => {
    assert.throws(() => search.parseResponses({ status: 'completed', output: [{ ...good.output[0], action: { type: 'search', sources: [{ url: 'javascript:bad' }] } }] }), error => error.search.status === 'no_results');
  });
  await test('Source annotations are accepted only after a completed search action', () => {
    const fixture = structuredClone(good); fixture.output[0].action.sources = [];
    fixture.output[1].content[0].annotations = [{ type: 'url_citation', title: 'Quoted page', url: 'https://evidence.example/cited' }];
    assert.equal(search.parseResponses(fixture).search.evidence[0].title, 'Quoted page');
  });
  await test('Query planning retains conditions, options and every bounded subquestion', () => {
    const queries = search.planQueries({ question: '在常温和标准气压下水的状态', options: [{ text: '气体' }, { text: '液体' }, { text: '固体' }], groups: [{ title: '温度改变后' }] });
    assert.ok(queries[0].includes('标准气压')); assert.ok(queries[0].includes('气体 液体 固体'));
    assert.ok(queries.some(query => query.includes('温度改变后')));
    assert.throws(() => search.planQueries({ question: 'Q', groups: Array.from({ length: 5 }, (_, i) => ({ title: 'child' + i })) }), error => error.search.status === 'not_attempted');
    assert.throws(() => search.planQueries({ question: 'Q'.repeat(351) }), error => error.search.status === 'not_attempted');
  });
  await test('Independent real result normalization keeps title/snippet/URL/date, rejects fabricated protocols', () => {
    const result = search.normalizeResults({ results: [{ title: 'Page', content: 'Facts', url: 'https://evidence.example/doc', published_date: '2026-10-12' }, { title: 'bad', content: 'bad', url: 'data:text/plain,bad' }] });
    assert.equal(result.length, 1); assert.equal(result[0].publishedDate, '2026-10-12');
    assert.throws(() => search.normalizeResults({ answer: 'memory facts' }), error => error.search.status === 'failed');
  });
  await test('Missing/unbound search credentials never make a network request', async () => {
    const request = () => { throw new Error('must not request'); };
    await assert.rejects(search.independentSearch({ question: 'Q' }, { url: 'https://search.example/search' }, request, signal), error => error.search.status === 'not_attempted');
    await assert.rejects(search.independentSearch({ question: 'Q' }, { url: 'https://search.example/search', key: 'test', keyOrigin: 'https://other.example' }, request, signal), error => error.search.status === 'not_attempted');
  });
  await test('Independent state comes from actual request and valid results, not answer flags', async () => {
    let calls = 0;
    const execution = await search.independentSearch({ question: 'Q', options: [{ text: 'A' }, { text: 'B' }] }, { url: 'https://search.example/search', key: 'test', keyOrigin: 'https://search.example' }, async (url, body, sig, options) => {
      calls++; assert.equal(options.headers.Authorization, 'Bearer test'); assert.equal(body.include_answer, false);
      return { results: [{ title: 'Doc', content: 'Facts', url: 'https://evidence.example/doc' }] };
    }, signal);
    assert.equal(calls, 1); assert.equal(execution.status, 'succeeded'); assert.equal(execution.requests, 1);
  });
  await test('No results, auth, rate limiting and partial multi-search failure never become succeeded', async () => {
    const config = { url: 'https://search.example/search', key: 'test', keyOrigin: 'https://search.example' };
    await assert.rejects(search.independentSearch({ question: 'Q' }, config, async () => ({ results: [] }), signal), error => error.search.status === 'no_results');
    for (const httpStatus of [401, 429]) {
      await assert.rejects(search.independentSearch({ question: 'Q' }, config, async () => { const error = new Error('HTTP ' + httpStatus); error.httpStatus = httpStatus; throw error; }, signal), error => error.search.status === 'failed' && error.httpStatus === httpStatus);
    }
    let count = 0;
    await assert.rejects(search.independentSearch({ question: 'Q', options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] }, config, async () => {
      if (++count === 2) throw new Error('network failure'); return { results: [{ title: 'Doc', content: 'Facts', url: 'https://evidence.example/doc' }] };
    }, signal), error => error.search.status === 'failed' && error.search.requests === 2);
  });
  await test('Cancellation and endpoint credentials are rejected', async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(search.independentSearch({ question: 'Q' }, { url: 'https://search.example/search', key: 'test', keyOrigin: 'https://search.example' }, () => { throw new Error('no request'); }, controller.signal), error => error.search.status === 'failed');
    for (const url of ['https://secret@search.example/search', 'https://search.example/search?api_key=secret', 'http://public.example/search']) assert.throws(() => search.searchEndpoint(url));
  });
  await test('Hub MCP address converts only documented same-origin REST endpoint and validates nested result envelope', () => {
    assert.equal(search.searchEndpoint('https://tavily.sharyuke.com/api/mcp'), 'https://tavily.sharyuke.com/api/proxy/search');
    assert.throws(() => search.searchEndpoint('https://unknown.example/api/mcp'));
    assert.equal(search.normalizeResults({ code: 0, data: { ok: true, data: { results: [{ title: 'Hub result', content: 'Facts', url: 'https://evidence.example/doc' }] } } }).length, 1);
    assert.throws(() => search.normalizeResults({ code: 40101, data: { ok: true, data: { results: [{ title: 'fake', content: 'fake', url: 'https://evidence.example' }] } } }), error => error.search.status === 'failed');
    assert.throws(() => search.normalizeResults({ code: 0, data: { ok: false } }), error => error.search.status === 'failed');
  });
  console.log(`${passed}/${passed} web-search unit scenarios passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
