module.exports = async ({test, setup, assert}) => {
  const path = '/mooc-ans/knowledge/cards';
  const empty = '<div class="ans-cc" id="pageDiv"><div class="nullpage"><dl><dt><img src="/nullImg.png"></dt><dd>暂无内容</dd></dl></div></div>';
  const frame = `<iframe src="${path}"></iframe>`;
  const options = {autoAnswer:false, autoRead:false, autoNext:false, nextDelay:1000};
  await test('暂无内容：脚本管理器虚拟window与DOM窗口不同仍可前进', async () => {
    const {page} = await setup(frame, options, [], {}, {[path]:empty}, {sandboxWindow:true});
    await page.waitForFunction(() => window.nextClicks === 1, undefined, {timeout:7000});
  });
  await test('暂无内容：默认开关独立于自动切章，调用下一节且只调用一次', async () => {
    const {page} = await setup(frame, options, [], {}, {[path]:empty});
    assert.equal(await page.locator('#cx-video-helper-host #autoSkipEmpty').isChecked(), true);
    await page.waitForFunction(() => window.nextClicks === 1, undefined, {timeout:7000});
    await page.waitForTimeout(1700);
    assert.equal(await page.evaluate(() => window.nextClicks), 1);
  });
  await test('暂无内容：优先下一张卡片，不漏掉本节测验', async () => {
    const tabs = '<li id="dct1" cardid="1" class="active">1</li><li id="dct2" cardid="2" title="章节测验" onclick="window.nextCard=1">2</li>';
    const {page} = await setup(tabs + frame, options, [], {}, {[path]:empty});
    await page.waitForFunction(() => window.nextCard === 1, undefined, {timeout:7000});
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('暂无内容：关闭开关、暂停及只答题均阻止跳转', async () => {
    for (const settings of [{autoSkipEmpty:false}, {answerOnly:true}, {enabled:false}]) {
      const {page} = await setup(frame, {...options, ...settings}, [], {}, {[path]:empty}, {noStart:settings.enabled===false});
      await page.waitForTimeout(4200);
      assert.equal(await page.evaluate(() => window.nextClicks), 0);
    }
  });
  await test('暂无内容：从最后卡片启动时前进到下一节，不退回前一张', async () => {
    const tabs = '<li id="dct1" cardid="1" onclick="window.wrongCard=true">1</li><li id="dct2" cardid="2" class="active">2</li>';
    const {page} = await setup(tabs + frame, options, [], {}, {[path]:empty});
    await page.waitForFunction(() => window.nextClicks === 1, undefined, {timeout:7000});
    assert.equal(await page.evaluate(() => !!window.wrongCard), false);
  });
  await test('暂无内容：常用按钮即时保存并同步设置开关', async () => {
    const {page} = await setup(frame, {...options, uiTab:'home'}, [], {}, {[path]:empty});
    const button = page.locator('#cx-video-helper-host [data-setting="autoSkipEmpty"]');
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.testStore['cxVideoHelper.settings.v1'].autoSkipEmpty), false);
    await page.waitForTimeout(4200);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
    await button.click();
    await page.waitForFunction(() => window.nextClicks === 1, undefined, {timeout:7000});
  });
  await test('暂无内容：倒计时关闭开关取消导航', async () => {
    const {page} = await setup(frame, {...options, nextDelay:4000}, [], {}, {[path]:empty});
    await page.waitForTimeout(2800);
    await page.locator('#cx-video-helper-host #autoSkipEmpty').uncheck();
    await page.waitForTimeout(4500);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
  await test('暂无内容：正文文字、隐藏占位和未完成附件不触发', async () => {
    for (const body of [empty.replace('</div></div>', '</div><p>本节正文</p></div>'),
      empty.replace('class="nullpage"','class="nullpage" hidden'),
      empty + '<div class="ans-job">待完成附件</div>']) {
      const {page} = await setup(frame, options, [], {}, {[path]:body});
      await page.waitForTimeout(4200);
      assert.equal(await page.evaluate(() => window.nextClicks), 0);
    }
  });
  await test('暂无内容：非课程占位文字和隐藏卡片不触发', async () => {
    for (const body of ['<div class="nullpage">暂无内容</div>', '<iframe hidden src="'+path+'"></iframe>']) {
      const {page} = await setup(body, options, [], {}, {[path]:empty});
      await page.waitForTimeout(4200);
      assert.equal(await page.evaluate(() => window.nextClicks), 0);
    }
  });
  await test('暂无内容：等待期间加载正文，取消跳转', async () => {
    const {page} = await setup(frame, {...options,nextDelay:4000}, [], {}, {[path]:empty});
    await page.waitForTimeout(2800);
    await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('.ans-cc').innerHTML = '<p>正文已加载</p>');
    await page.waitForTimeout(4500);
    assert.equal(await page.evaluate(() => window.nextClicks), 0);
  });
};
