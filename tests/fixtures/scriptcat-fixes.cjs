module.exports = async ({test,setup,choice,checked,logContains,aiSettings,assert}) => {
  const imageQuestion = () => choice(1,'识别图形',['甲','乙']).replace('识别图形</div>',
    '识别图形<picture><source srcset="/test-image.png?source=1"><img alt="题图" src="/test-image.png?image=1"></picture></div>');
  await test('ScriptCat修复：相同alt题图在查询中替换，不接受旧图答案',async()=>{
    const {page}=await setup(imageQuestion(),{...aiSettings,queryInterval:1000},[],{delay:2000});
    await page.waitForFunction(()=>window.aiRequests.length===1);
    await page.evaluate(()=>document.querySelector('picture source').srcset='/test-image.png?source=2');
    await page.waitForFunction(()=>window.aiRequests.length===2);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.TiMu input:checked').count(),0);
    await checked(page,'input[value=B]');
  });
  await test('ScriptCat修复：已填写图片题更换src和srcset后重新查题',async()=>{
    const {page}=await setup(imageQuestion(),{...aiSettings,queryInterval:1000,overwriteAnswers:true});
    await checked(page,'input[value=B]');
    await page.evaluate(()=>document.querySelector('img').src='/test-image.png?image=2');
    await page.waitForFunction(()=>window.aiRequests.length===2);
    await logContains(page,'已填写（AI）');
    await page.waitForTimeout(500);
    await page.evaluate(()=>document.querySelector('img').srcset='/test-image.png?image=3 1x');
    await page.waitForFunction(()=>window.aiRequests.length===3);
  });
  await test('ScriptCat修复：完整题库配置变更后旧缓存不复用，未变配置仍命中',async()=>{
    const body=choice(1,'配置缓存隔离',['甲','乙']);
    const bank={name:'test',url:'https://bank.example/cache',method:'POST',answerPath:'answers',
      data:{edition:'old'},successPath:'code',successValue:1};
    const settings={...aiSettings,answerCache:true,externalBanks:[bank]};
    const first=await setup(body,settings,[],{external:{'/cache':{body:{code:1,answers:['A']}}}});
    await checked(first.page,'input[value=A]');
    await logContains(first.page,'已填写（外部题库：test）');
    const cache=await first.page.evaluate(()=>window.testStore['cxHelper.answers.v1']);
    await first.context.close();
    const unchanged=await setup(body,settings,[],{}, {},{cache});
    await checked(unchanged.page,'input[value=A]');
    assert.equal(await unchanged.page.evaluate(()=>window.aiRequests.length),0);
    await unchanged.context.close();
    for(const patch of [{data:{edition:'new'}},{separator:'|'},{successValue:0},
      {allowCode:true,handler:'return res => [undefined,res.otherAnswers]'},
      {type:'fetch'},{headers:{Authorization:'different-test-secret'}}]){
      const next=await setup(body,{...settings,externalBanks:[{...bank,...patch}]});
      await checked(next.page,'input[value=B]');
      assert.ok(await next.page.evaluate(()=>window.aiRequests.length)>0);
      assert.ok(!JSON.stringify(await next.page.evaluate(()=>window.testStore['cxHelper.answers.v1'])).includes('different-test-secret'));
      await next.context.close();
    }
  });
  await test('ScriptCat修复：升级后旧作用域缓存不再采用',async()=>{
    const question='旧版本缓存';
    const cache=[{schemaVersion:2,scope:require('../../tools/font-codec.cjs').sourceFingerprint(JSON.stringify([2,aiSettings.apiUrl,aiSettings.apiModel,[],false,'',true])),
      at:Date.now(),key:JSON.stringify([question,'single',[['A','甲'],['B','乙']],0,[]]),question,answers:['A'],confidence:1,source:'AI'}];
    const {page}=await setup(choice(1,question,['甲','乙']),{...aiSettings,answerCache:true},[],{}, {},{cache});
    await checked(page,'input[value=B]');assert.equal(await page.evaluate(()=>window.aiRequests.length),1);
  });
  await test('ScriptCat修复：跨域及无效最终响应地址拒绝，不转随机填写',async()=>{
    for(const finalUrl of ['https://different.example/redirected','invalid-url']){
      const {page,context}=await setup(choice(1,'跳转响应',['甲','乙']),{...aiSettings,randomFallback:true},[],{finalUrl});
      await logContains(page,'最终地址无效');
      assert.equal(await page.locator('.TiMu input:checked').count(),0);
      assert.equal(await page.evaluate(()=>window.submitClicks),0);
      await context.close();
    }
  });
  await test('ScriptCat修复：同源响应路径改变与无finalUrl管理器保持兼容',async()=>{
    for(const finalUrl of ['https://mock-provider.example/other-path',undefined]){
      const {page,context}=await setup(choice(1,'同源响应',['甲','乙']),aiSettings,[],{finalUrl});
      await checked(page,'input[value=B]');await context.close();
    }
  });
};
