module.exports = async function({test,setup,choice,blank,checked,logContains,aiSettings,assert}) {
  await test('深审 A01：无效本地答案继续查询 AI，有效冲突不随机作答', async () => {
    const one=await setup(choice(1,'本地坏答案',['甲','乙']),{...aiSettings},[{question:'本地坏答案',answers:['Z']}]);
    await checked(one.page,'input[value="B"]');
    assert.equal(await one.page.evaluate(()=>window.aiRequests.length),1);
    const two=await setup(choice(2,'冲突答案',['甲','乙']),{...aiSettings,randomFallback:true},[{question:'冲突答案',answers:['A']},{question:'冲突答案',answers:['B']}]);
    await logContains(two.page,'本地题库存在冲突答案');
    assert.equal(await two.page.locator('.TiMu input:checked').count(),0);
  });
  await test('深审 A02：最高优先题库成功立即返回并中止慢来源',async()=>{
    const banks=[{name:'快',url:'https://banks.example/fast',method:'GET'},{name:'慢',url:'https://banks.example/slow',method:'GET'}];
    const {page}=await setup(choice(1,'保序早返回',['甲','乙']),{externalBanks:banks},[],{external:{'/fast':{delay:30,body:{answers:['B']}},'/slow':{delay:10000,body:{answers:['A']}}}});
    await checked(page,'input[value="B"]');
    assert.ok(await page.evaluate(()=>window.apiAborts)>=1);
    assert.equal(await page.locator('input[value="A"]').isChecked(),false);
  });
  await test('深审 A02：低优先级先成功仍等待高优先级，不抢占',async()=>{
    const banks=[{name:'优先',url:'https://banks.example/priority',method:'GET'},{name:'后备',url:'https://banks.example/fallback',method:'GET'}];
    const {page}=await setup(choice(1,'优先级',['甲','乙']),{externalBanks:banks},[],{external:{'/priority':{delay:1500,body:{answers:['A']}},'/fallback':{delay:30,body:{answers:['B']}}}});
    await page.waitForTimeout(500);assert.equal(await page.locator('.TiMu input:checked').count(),0);
    await checked(page,'input[value="A"]');
  });
  await test('深审 A02：两题网络重叠且填写顺序稳定，暂停取消全部',async()=>{
    const {page}=await setup(choice(1,'并发甲',['甲','乙'])+choice(2,'并发乙',['甲','乙'])+choice(3,'并发丙',['甲','乙']),
      {...aiSettings,queryInterval:1000,answerCache:true},[],{delay:3500});
    await page.waitForFunction(()=>window.aiRequests.length===2,undefined,{timeout:3000});
    assert.equal(await page.locator('.TiMu input:checked').count(),0);
    await checked(page,'input[name="q1"][value="B"]');
    await checked(page,'input[name="q2"][value="B"]');
    const logs=await page.locator('#cx-video-helper-host #logs').textContent();
    assert.ok(logs.indexOf('并发甲')<logs.indexOf('并发乙'));
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.waitForTimeout(3700);assert.equal(await page.locator('input[name="q3"]:checked').count(),0);
  });
  await test('深审 A03：隐藏类型4保留简答语义，不采用低信心填空豁免',async()=>{
    const {page}=await setup(blank(1,'类型码简答',1,'简答题')+'<script>document.querySelector(".TiMu").insertAdjacentHTML("beforeend",\'<input type="hidden" name="answertype1" value="4">\')</script>',
      {...aiSettings,fillLowConfidenceBlanks:true,compareRandomConfidence:false},[],{answer:{answers:['甲'],confidence:.2}});
    await logContains(page,'低于设置阈值');assert.equal(await page.locator('.TiMu textarea').inputValue(),'');
    const type=await page.evaluate(()=>JSON.parse(window.aiRequests[0].payload.messages[1].content).type);assert.equal(type,'essay');
  });
  await test('深审 A04：可见人脸遮罩和识别文案暂停，隐藏控件不误阻断',async()=>{
    for(const html of ['<div class="chapterVideoFaceMaskDiv" style="width:200px;height:100px"></div>','<p>请完成人脸识别</p>']){
      const {page}=await setup(html+'<video id="v"></video>');
      await logContains(page,'平台要求人工验证');assert.equal(await page.locator('#v').evaluate(v=>v.playCalls),0);
    }
    const {page}=await setup('<div class="chapterVideoFaceMaskDiv" hidden></div><img id="fcqrimg" src=""><video id="v"></video>');
    await page.waitForFunction(()=>document.querySelector('#v').playCalls>0);
  });
  await test('深审 A05：辅助iframe替换不取消查询或重复已填题，题目iframe替换则取消',async()=>{
    const one=await setup(choice(1,'稳定主测验',['甲','乙']),{...aiSettings,overwriteAnswers:true},[],{delay:1800},{'/helper':'<p>辅助内容</p>'});
    await one.page.waitForFunction(()=>window.aiRequests.length===1);
    await one.page.evaluate(()=>{const f=document.createElement('iframe');f.src='/helper';f.id='helper';document.body.append(f);});
    await checked(one.page,'input[value="B"]');
    await one.page.locator('#helper').evaluate(f=>f.remove());await one.page.waitForTimeout(1800);
    assert.equal(await one.page.evaluate(()=>window.aiRequests.length),1);
    const two=await setup('<iframe id="task" src="/api/work"></iframe>',{...aiSettings},[],{delay:2500},{'/api/work':choice(1,'旧题',['甲','乙']),'/gone':'<p>新内容</p>'});
    await two.page.waitForFunction(()=>window.aiRequests.length===1);
    await two.page.locator('#task').evaluate(f=>{f.src='/gone';});await two.page.waitForTimeout(1200);
    assert.ok(await two.page.evaluate(()=>window.apiAborts)>0);
  });
  await test('深审 A06：提交未确认不自动重提，手动重试可恢复，平台已完成不重提',async()=>{
    const {page}=await setup(choice(1,'提交恢复',['甲','乙'])+'<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>',{autoSubmit:true},[{question:'提交恢复',answers:['B']}]);
    await page.waitForFunction(()=>window.submitClicks===1);
    await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+20000;});
    await logContains(page,'提交尚未得到平台确认');assert.equal(await page.evaluate(()=>window.submitClicks),1);
    await page.locator('#cx-video-helper-host #retry').click();await page.waitForFunction(()=>window.submitClicks===2);
    await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div data-submit-state="success"></div>'));
    await page.waitForTimeout(900);await page.locator('#cx-video-helper-host #retry').click();await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>window.submitClicks),2);
  });
  await test('深审 A07：导航未生效提示可恢复，手动重试后只重试一次',async()=>{
    const {page}=await setup('<video id="v"></video>',{nextDelay:1000});
    await page.waitForFunction(()=>document.querySelector('#v').playCalls>0);await page.locator('#v').evaluate(v=>v.finish());
    await page.waitForFunction(()=>window.nextClicks===1);
    await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+20000;});
    await logContains(page,'切换任务尚未生效');await page.locator('#cx-video-helper-host #retry').click();
    await page.waitForFunction(()=>window.nextClicks===2);await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.nextClicks),2);
  });
  await test('深审 A08：更换AI模型中止旧查询，下一请求使用新模型',async()=>{
    const {page}=await setup(choice(1,'更换配置',['甲','乙']),{...aiSettings},[],{delay:3500});
    await page.waitForFunction(()=>window.aiRequests.length===1);
    await page.locator('#cx-video-helper-host #apiSettings summary').click();
    await page.locator('#cx-video-helper-host #apiModel').fill('replacement-model');
    await page.locator('#cx-video-helper-host #saveApi').click();
    await page.waitForFunction(()=>window.apiAborts>=1);
    assert.equal(await page.locator('.TiMu input:checked').count(),0);
    await checked(page,'input[value="B"]');
    assert.equal(await page.evaluate(()=>window.aiRequests.at(-1).payload.model),'replacement-model');
  });
  await test('深审 A09：过期缓存与其他模型缓存不再复用，有效缓存仍命中',async()=>{
    const body=choice(1,'缓存版本',['甲','乙']);
    const first=await setup(body,{...aiSettings,answerCache:true});await logContains(first.page,'已填写（AI）');
    const cache=await first.page.evaluate(()=>window.testStore['cxHelper.answers.v1']);
    for(const config of [{cache:cache.map(x=>({...x,at:1})),settings:aiSettings},{cache,settings:{...aiSettings,apiModel:'other'}}]){
      const item=await setup(body,{...config.settings,answerCache:true},[],{}, {},{cache:config.cache});
      await logContains(item.page,'已填写（AI）');assert.equal(await item.page.evaluate(()=>window.aiRequests.length),1);
    }
  });
  await test('深审 A10：页面丢失词间空格不能通过回读或提交',async()=>{
    const {page}=await setup(blank(1,'空格回读')+'<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button><script>document.querySelector("textarea").addEventListener("input",e=>e.target.value=e.target.value.replace(/ /g,""))</script>',
      {autoSubmit:true},[{question:'空格回读',answers:['New York']}]);
    await logContains(page,'页面未确认');assert.equal(await page.evaluate(()=>window.submitClicks),0);
  });
  await test('深审 A11：全角单选标签正确填写，同时保留字母文本一致性',async()=>{
    const {page}=await setup(choice(1,'全角标签',['甲','乙']).replace('value="A"','value="1"').replace('value="B"','value="2"'),{},[{question:'全角标签',answers:['Ｂ']}]);
    await checked(page,'input[value="2"]');
  });
  await test('深审 A13：隐藏必答题与分页范围阻止提交，隐藏模板不计入',async()=>{
    const known=choice(1,'可见题',['甲','乙']);const other=choice(2,'隐藏必答',['甲','乙']).replace('class="TiMu"','class="TiMu" hidden');
    const button='<button id="btnBlueSubmit" onclick="window.submitClicks++">提交</button>';
    const one=await setup(known+other+button,{autoSubmit:true},[{question:'可见题',answers:['B']}]);await checked(one.page,'input[value="B"]');await one.page.waitForTimeout(1000);assert.equal(await one.page.evaluate(()=>window.submitClicks),0);
    const two=await setup(known+'<div data-cx-template hidden>'+other+'</div>'+button,{autoSubmit:true},[{question:'可见题',answers:['B']}]);await two.page.waitForFunction(()=>window.submitClicks===1);
    const three=await setup(known+'<div data-cx-question-pages="2"></div>'+button,{autoSubmit:true},[{question:'可见题',answers:['B']}]);await logContains(three.page,'完整题目范围');assert.equal(await three.page.evaluate(()=>window.submitClicks),0);
  });
};
