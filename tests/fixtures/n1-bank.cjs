const assert = require('node:assert/strict');
const codec = require('../../tools/external-bank.cjs');
module.exports = async ({ test, setup, choice, blank, aiSettings, checked, logContains }) => {
  const config = codec.n1Config('mock-n1-key');
  const external = body => ({ external: { '/api/search.php': { body } } });
  await test('N1题库：HTTPS表单POST正确传中文题型和JSON选项，命中不调用AI', async () => {
    const { page } = await setup(choice(1, '甲 & 乙=丙？', ['动物蛋白', '钠盐食入过多']), { ...aiSettings, externalBanks: [config] }, [],
      external({ code: 1, data: '钠盐食入过多', quota_info: { remaining: 9 } }));
    await checked(page, '.TiMu input[value="B"]');
    await logContains(page, '已填写（外部题库：N1搜题助手）');
    const requests = await page.evaluate(() => window.aiRequests);
    assert.equal(requests.length, 1); assert.equal(requests[0].url, codec.N1_URL);
    assert.equal(requests[0].method, 'POST'); assert.equal(requests[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(requests[0].payload.question, '甲 & 乙=丙？'); assert.equal(requests[0].payload.type, '单选题');
    assert.deepEqual(JSON.parse(requests[0].payload.options), ['动物蛋白', '钠盐食入过多']);
    assert.equal(requests[0].payload.key, 'mock-n1-key');
    assert.ok((await page.locator('#cx-video-helper-host #answers').textContent()).includes('外部题库：N1搜题助手'));
    assert.ok(!(await page.locator('#cx-video-helper-host #logs').textContent()).includes('mock-n1-key'));
  });
  await test('审查修复：N1 原样发送含模板符号的题干、选项并命中填写', async () => {
    const title = 'int a[2][2]={{1,2},{3,4}}; 模板字符串 ${name}？';
    const options = ['变量 ${name}', '{{1,2}}'];
    const { page } = await setup(choice(1, title, options), { ...aiSettings, externalBanks: [config] }, [], external({ code: 1, data: options[1] }));
    await checked(page, '.TiMu input[value="B"]');
    await logContains(page, '已填写（外部题库：N1搜题助手）');
    const requests = await page.evaluate(() => window.aiRequests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].payload.question, title);
    assert.deepEqual(JSON.parse(requests[0].payload.options), options);
  });
  await test('N1题库：多选分隔文本和多空答案保持逐项匹配', async () => {
    const multi = await setup(choice(1, '多选题库', ['甲', '乙', '丙'], '多选题'), { externalBanks: [config] }, [], external({ code: 1, data: '甲#丙' }));
    await checked(multi.page, '.TiMu input[value="A"]'); await checked(multi.page, '.TiMu input[value="C"]');
    assert.equal(await multi.page.locator('.TiMu input:checked').count(), 2);
    assert.equal(await multi.page.evaluate(() => window.aiRequests[0].payload.type), '多选题');
    const blanks = await setup(blank(2, '两个空', 2), { externalBanks: [config] }, [], external({ code: 1, data: '首空#次空' }));
    await blanks.page.waitForFunction(() => [...document.querySelectorAll('.TiMu textarea')].map(x => x.value).join('|') === '首空|次空');
    assert.equal(await blanks.page.evaluate(() => window.aiRequests[0].payload.options), '["2"]');
    assert.equal(await blanks.page.evaluate(() => window.aiRequests[0].payload.type), '填空题');
  });
  await test('N1题库：code失败或伪成功不采用data，正确回退到AI', async () => {
    for (const code of [0, '1', null]) {
      const { page } = await setup(choice(1, '失败回退', ['甲', '乙']), { ...aiSettings, externalBanks: [config] }, [], external({ code, data: 'A' }));
      await checked(page, '.TiMu input[value="B"]');
      assert.equal(await page.evaluate(() => window.aiRequests.length), 2);
      await logContains(page, '外部题库未返回可匹配答案');
    }
  });
  await test('N1题库：无效JSON鉴权超时网络及选项不匹配时不提交', async () => {
    for (const response of [{ raw: 'bad' }, { status: 401 }, { timeout: true }, { networkError: true }, { body: { code: 1, data: '不存在的答案' } }]) {
      const { page } = await setup(choice(1, '题库失败', ['甲', '乙']), { externalBanks: [config], randomFallback: false, autoSubmit: true }, [],
        { external: { '/api/search.php': response } });
      await logContains(page, '本地题库未命中');
      assert.equal(await page.locator('.TiMu input:checked').count(), 0);
      assert.equal(await page.evaluate(() => window.submitClicks), 0);
    }
  });
  await test('N1题库：OCS小写post题干占位符和已知handler安全导入，不执行任意函数', async () => {
    const { page } = await setup('', { uiTab: 'sources' });
    const ui = page.locator('#cx-video-helper-host'); await ui.locator('#presetProvider').selectOption('ocs');
    const ocs = [{ name: 'OCS N1', url: 'http://tk.n1t.cn/api/search.php', method: 'post', type: 'GM_xmlhttpRequest', data: { question: '${title}', key: 'import-private-key' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: '' }, handler: 'return (res)=> res.code === 1 ? [undefined, res.data] : undefined' }];
    await ui.locator('#externalInput').fill(JSON.stringify(ocs)); await ui.locator('#saveExternal').click();
    const stored = await page.evaluate(() => window.testStore['cxVideoHelper.settings.v1'].externalBanks);
    assert.equal(stored[0].url, codec.N1_URL); assert.equal(stored[0].profile, 'n1'); assert.equal(stored[0].handler, undefined);
    assert.equal(await ui.locator('#externalInput').inputValue(), '');
    assert.ok(!await page.evaluate(() => document.querySelector('#cx-video-helper-host').shadowRoot.innerHTML.includes('import-private-key')));
    ocs[0].handler = 'return (res)=> {window.hacked=true; return [undefined,res.data]}';
    await ui.locator('#externalInput').fill(JSON.stringify(ocs)); await ui.locator('#saveExternal').click();
    assert.ok((await ui.locator('#externalFeedback').textContent()).includes('未保存'));
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    assert.deepEqual(await page.evaluate(() => window.testStore['cxVideoHelper.settings.v1'].externalBanks), stored);
  });
  await test('N1题库：密钥UI保存保留其他题库，连接测试校验成功及剩余配额', async () => {
    const old = { name: '旧题库', url: 'https://bank.example/old' };
    const { page } = await setup('', { uiTab: 'sources', externalBanks: [old], autoAnswer: false }, [], external({ code: 1, data: '钠盐食入过多', quota_info: { remaining: 7 } }));
    const ui = page.locator('#cx-video-helper-host');
    await ui.locator('#presetProvider').selectOption('n1');
    await ui.locator('#presetKey').fill('ui-n1-secret'); await ui.locator('#presetSave').click();
    assert.equal(await ui.locator('#presetKey').inputValue(), '');
    assert.equal(await page.evaluate(() => window.testStore['cxVideoHelper.settings.v1'].externalBanks.length), 2);
    await ui.locator('#presetTest').click();
    await page.waitForFunction(() => document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('presetStatus').textContent.includes('剩余次数 7'));
    assert.equal(await page.evaluate(() => window.aiRequests.length), 1);
    assert.ok(!await page.evaluate(() => document.querySelector('#cx-video-helper-host').shadowRoot.innerHTML.includes('ui-n1-secret')));
  });
  await test('N1题库：暂停取消表单查询且迟到答案不填写', async () => {
    const { page } = await setup(choice(1, '取消题库', ['甲', '乙']), { externalBanks: [config] }, [], { external: { '/api/search.php': { delay: 1000, body: { code: 1, data: 'B' } } } });
    await page.waitForFunction(() => window.aiRequests.length === 1); await page.locator('#cx-video-helper-host #toggle').click();
    await page.waitForTimeout(1100); assert.equal(await page.evaluate(() => window.apiAborts), 1);
    assert.equal(await page.locator('.TiMu input:checked').count(), 0);
  });
};
