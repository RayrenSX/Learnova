const assert = require('node:assert/strict');
const bank = require('../tools/external-bank.cjs');
const config = bank.n1Config('test-only-key');
const q = { title: '中文 & a=b', type: 'single', options: [{ text: '甲;乙' }, { text: '丙' }], blanks: 0 };
const request = bank.makeRequest(config, q);
assert.equal(new URLSearchParams(request.body).get('question'), q.title);
assert.equal(new URLSearchParams(request.body).get('options'), '["甲;乙","丙"]');
assert.equal(new URLSearchParams(request.body).get('type'), '单选题');
assert.deepEqual(bank.parseResponse(config, { code: 1, data: '甲;乙' }, q).answers, ['甲;乙']);
assert.deepEqual(bank.parseResponse(config, { code: 1, data: '甲;乙#丙' }, { ...q, type: 'multiple', options: [] }).answers, ['甲', '乙', '丙']);
assert.deepEqual(bank.parseResponse(config, { code: 1, data: '段落;带分号|原样' }, { ...q, type: 'essay' }).answers, ['段落;带分号|原样']);
assert.throws(() => bank.parseResponse(config, { code: 0, data: 'B', msg: 'sensitive reflected key' }, q));
assert.throws(() => bank.parseResponse(config, { code: '1', data: 'B' }, q));
assert.throws(() => bank.parseResponse(config, { code: 1, data: '', confidence: 1 }, q));
assert.equal(bank.makeRequest(config, { ...q, type: 'blank', blanks: 3 }).data.options, '["3"]');
const ocs = bank.normalizeConfig({ name: 'N1', url: 'http://tk.n1t.cn/api/search.php', method: 'post', type: 'GM_xmlhttpRequest', data: { question: '${title}', key: 'test-key' }, handler: 'return (res)=> res.code === 1 ? [undefined, res.data] : undefined' });
assert.equal(ocs.url, bank.N1_URL); assert.equal(ocs.method, 'POST'); assert.equal(ocs.handler, undefined);
assert.throws(() => bank.normalizeConfig({ ...ocs, handler: 'alert(1)' }));
assert.throws(() => bank.normalizeConfig({ ...ocs, url: 'https://another.example/search' }));
assert.throws(() => bank.normalizeConfig({ ...ocs, method: 'GET' }));
assert.throws(() => bank.n1Config('您的API密钥'));
const generic = bank.makeRequest({ data: { title: '${title}', other: '{{type}}' }, headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' } }, q);
assert.equal(generic.data.title, q.title); assert.equal(generic.data.other, 'single');
const declarative = bank.normalizeConfig({ name: '声明式', url: 'https://example.com/search', handler: 'return (res)=> res.ok === true ? [undefined, res.data.answers] : undefined' });
assert.equal(declarative.answerPath, 'data.answers'); assert.equal(declarative.successPath, 'ok'); assert.equal(declarative.successValue, true);
assert.deepEqual(bank.parseResponse(declarative, { ok: true, data: { answers: ['A'] } }, q).answers, ['A']);
assert.throws(() => bank.makeRequest({ data: { title: '${unknown}' } }, q));
for (const title of ['JavaScript 模板字符串 ${name} 的用途？', 'int a[2][2]={{1,2},{3,4}}; a[1][0] 的值？', '题目原文中的 ${title} 和 {{question}}']) {
  const literal = { ...q, title, options: [{ text: '${options}' }, { text: '{{1,2}}' }], groups: [{ title: '${child}' }] };
  for (const entry of [config, { name: '普通', data: { question: '${title}', options: '{{optionsJSON}}', groups: '{{groups}}' } }, { name: '默认字段' }]) {
    const result = bank.makeRequest(entry, literal);
    assert.equal(result.data.question, title);
    if (entry.profile === 'n1') assert.deepEqual(JSON.parse(new URLSearchParams(result.body).get('options')), literal.options.map(o => o.text));
    else assert.deepEqual(JSON.parse(result.body).groups, JSON.stringify(literal.groups));
  }
}
for (const template of ['{{unknown}}', '{{title}} ${unknown}', '${title', '{{title']) {
  assert.throws(() => bank.makeRequest({ data: { question: template } }, q), /不支持的占位符/);
}
assert.deepEqual(bank.parseResponse({ name: '普通', answerPath: 'data.answers' }, { data: { answers: ['A', 'C'] } }, { ...q, type: 'multiple' }).answers, ['A', 'C']);
console.log('PASS External bank form encoding, N1 status, OCS import, placeholders, type/blanks, safe parsing and generic compatibility');
