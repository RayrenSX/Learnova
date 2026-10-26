const fs=require('node:fs');
const path=require('node:path');
module.exports=async({test,setup,choice,checked,logContains,aiSettings,assert})=>{
  const prefix='#cx-video-helper-host ';
  await test('资料工具：当前页Markdown区分参考答案和本人作答，无答案版不泄漏解析',async()=>{
    const body=choice(1,'资料测试',['甲','乙']).replace('</div>','</div>')+'<div class="questionLi" data="review"><h3 class="mark_name">批阅题</h3><div class="mark_answer"><span class="colorGreen">参考文本</span><span class="colorDeep">本人文本</span></div><div class="analysisDiv">解析文本</div></div>';
    const {page,errors}=await setup(body,{},[],{}, {},{noStart:true});await page.locator(prefix+'#tab-home').click();
    const download=page.waitForEvent('download');await page.locator(prefix+'#toolsMarkdown').click();const result=await download;const filename=await result.path();const content=fs.readFileSync(filename,'utf8');
    assert.ok(content.includes('参考文本'));assert.ok(content.includes('本人文本'));assert.ok(content.includes('解析文本'));
    await page.locator(prefix+'#toolsAnswers').uncheck();const again=page.waitForEvent('download');await page.locator(prefix+'#toolsMarkdown').click();const practice=fs.readFileSync(await (await again).path(),'utf8');
    assert.ok(!/参考文本|本人文本|解析文本/.test(practice));assert.deepEqual(errors,[]);
  });
  await test('资料工具：完整试卷缺题时阻止导出，已加载范围仍可显式导出',async()=>{
    const {page}=await setup('<input id="totalQuestionNum" value="3">'+choice(1,'分页题',['甲','乙']),{},[],{}, {},{noStart:true});
    await page.locator(prefix+'#tab-home').click();await page.locator(prefix+'#toolsExportScope').selectOption('full');
    let downloads=0;page.on('download',()=>downloads++);await page.locator(prefix+'#toolsMarkdown').click();
    await page.locator(prefix+'#toolsStatus').filter({hasText:'1/3'}).waitFor();assert.equal(downloads,0);
    await page.locator(prefix+'#toolsExportScope').selectOption('loaded');const event=page.waitForEvent('download');await page.locator(prefix+'#toolsMarkdown').click();await event;assert.equal(downloads,1);
  });
  await test('资料工具：Word文件能下载，图像失败保留链接，含中文题干',async()=>{
    const {page}=await setup(choice(1,'Word中文题',['甲','乙']),{},[],{}, {},{noStart:true});await page.locator(prefix+'#tab-home').click();
    const event=page.waitForEvent('download');await page.locator(prefix+'#toolsDocx').click();const file=await event;assert.match(file.suggestedFilename(),/\.docx$/);
    const buffer=fs.readFileSync(await file.path());assert.equal(buffer.readUInt32LE(0),0x04034b50);assert.ok(buffer.includes(Buffer.from('Word中文题')));
  });
  await test('资料工具：课件下载识别原fileinfo并去重，不展示javascript地址',async()=>{
    const {page}=await setup('<script>window.fileinfo={name:"原课件.pdf",download:"https://files.example/lecture.pdf"};</script><a download href="https://files.example/lecture.pdf">重复</a><a data-download-url="javascript:alert(1)">危险</a>',{},[],{}, {},{noStart:true});
    await page.locator(prefix+'#tab-home').click();await page.locator(prefix+'#toolsRefresh').click();const links=page.locator(prefix+'#toolsResources a');assert.equal(await links.count(),1);assert.equal(await links.getAttribute('href'),'https://files.example/lecture.pdf');
  });
  await test('资料工具：总结仅渲染文本，取消和接口变更不接受迟到响应',async()=>{
    const {page}=await setup('<article>这是课程资料，介绍数据结构、链表和树的遍历方法。</article>',aiSettings,[],{raw:'<img src=x onerror="window.summaryXss=true">总结结果'}, {},{noStart:true});
    await page.locator(prefix+'#tab-home').click();await page.locator(prefix+'#toolsSummary').click();await page.locator(prefix+'#toolsSummaryText').filter({hasText:'总结结果'}).waitFor();
    assert.equal(await page.locator(prefix+'#toolsSummaryText img').count(),0);assert.equal(await page.evaluate(()=>window.summaryXss),undefined);
    await page.locator(prefix+'#toolsUsageRefresh').click();assert.match(await page.locator(prefix+'#toolsUsage').textContent(),/请求 1/);
    const slow=await setup('<article>这是另一段充分长的课程资料，用于检查请求取消后的状态。</article>',aiSettings,[],{raw:'迟到结果',delay:2000}, {},{noStart:true});await slow.page.locator(prefix+'#tab-home').click();await slow.page.locator(prefix+'#toolsSummary').click();await slow.page.waitForFunction(()=>window.aiRequests.length===1);await slow.page.locator(prefix+'#toolsCancel').click();await slow.page.waitForTimeout(2200);assert.equal(await slow.page.locator(prefix+'#toolsSummaryText').textContent(),'');
  });
  await test('资料工具：API用量累计输入输出并统计未知响应，记录无题干和密钥',async()=>{
    const {page}=await setup(choice(1,'计量题',['甲','乙']),{...aiSettings},[],{});
    await checked(page,'input[value=B]');const rows=await page.evaluate(()=>window.testStore['learnova.usage.v1']);assert.equal(rows[0].requests,1);assert.equal(rows[0].known,0);assert.ok(!JSON.stringify(rows).includes('test-secret'));assert.ok(!JSON.stringify(rows).includes('计量题'));
    const known=await setup(choice(1,'有计量',['甲','乙']),aiSettings,[],{usage:{prompt_tokens:120,completion_tokens:30,total_tokens:150}});await checked(known.page,'input[value=B]');const usage=await known.page.evaluate(()=>window.testStore['learnova.usage.v1']);assert.equal(usage[0].known,1);assert.equal(usage[0].total,150);
  });
  await test('资料工具：复习卡片支持翻面与TSV导出，缺少资料依据不采用',async()=>{
    const {page}=await setup('<article>二叉树的每个节点最多有两个子节点。</article>',aiSettings,[],{raw:JSON.stringify([{question:'二叉树最多几个子节点？',answer:'两个',source:'资料第一句'},{question:'节点数是否固定？',answer:'不固定',source:'资料未给出固定数量'}])}, {},{noStart:true});
    await page.locator(prefix+'#tab-home').click();await page.locator(prefix+'#toolsCards').click();await page.locator(prefix+'#toolsCardDeck').waitFor();assert.equal(await page.locator(prefix+'#toolsCardAnswer').isVisible(),false);await page.locator(prefix+'#toolsCardReveal').click();assert.ok((await page.locator(prefix+'#toolsCardAnswer').textContent()).includes('资料第一句'));await page.locator(prefix+'#toolsCardNext').click();assert.match(await page.locator(prefix+'#toolsCardPosition').textContent(),/2 \/ 2/);
    const event=page.waitForEvent('download');await page.locator(prefix+'#toolsCardExport').click();const output=fs.readFileSync(await (await event).path(),'utf8');assert.equal(output.split('\n').length,2);assert.ok(output.includes('\t两个\t'));
    const bad=await setup('<article>这是用于错误格式检测的足够长的材料。</article>',aiSettings,[],{raw:'[{"question":"问题","answer":"答案"}]'}, {},{noStart:true});await bad.page.locator(prefix+'#tab-home').click();await bad.page.locator(prefix+'#toolsCards').click();await bad.page.locator(prefix+'#toolsStatus').filter({hasText:'资料依据'}).waitFor();assert.equal(await bad.page.locator(prefix+'#toolsCardDeck').isVisible(),false);
  });
  await test('资料工具：复制粘贴开关可撤销且不自动改写编辑器内容',async()=>{
    const {page}=await setup('<textarea id="original">原始答案</textarea>',{},[],{}, {},{noStart:true});await page.locator(prefix+'#tab-home').click();await page.locator(prefix+'#toolsPaste').check();assert.equal(await page.locator('#original').inputValue(),'原始答案');await page.locator(prefix+'#toolsPaste').uncheck();assert.equal(await page.locator('#original').inputValue(),'原始答案');
  });
};
