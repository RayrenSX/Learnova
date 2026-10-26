const {abcConfig,normalizeConfig,makeRequest,parseResponse}=require('../../tools/external-bank.cjs');
module.exports=async({test,setup,choice,checked,logContains,aiSettings,assert})=>{
  const host='#cx-video-helper-host ';
  await test('题库管理：统一入口、常用顺序、分类切换与窄屏布局',async()=>{
    const {page,errors}=await setup('',{},[],{}, {},{noStart:true});await page.locator(host+'#tab-sources').click();
    assert.deepEqual(await page.locator(host+'#panel-sources > details > summary').allTextContents(),['AI 接口配置','题库管理','联网搜索配置']);
    assert.equal(await page.locator(host+'#panel-sources > details').count(),3);
    assert.equal(await page.locator(host+'#presetProvider').inputValue(),'ocs');assert.equal(await page.locator(host+'#externalInput').isVisible(),true);assert.equal(await page.locator(host+'#presetKey').isVisible(),false);
    await page.locator(host+'#bank-tab-local').click();assert.equal(await page.locator(host+'#importBank').isVisible(),true);assert.equal(await page.locator(host+'#externalInput').isVisible(),false);
    await page.locator(host+'#bank-tab-local').press('ArrowRight');assert.equal(await page.locator(host+'#answerCache').isVisible(),true);
    await page.locator(host+'#bank-tab-cache').press('Home');assert.equal(await page.locator(host+'#externalInput').isVisible(),true);
    await page.locator(host+'#presetProvider').selectOption('n1');assert.equal(await page.locator(host+'#presetKey').isVisible(),true);assert.equal(await page.locator(host+'#externalInput').isVisible(),false);
    await page.locator(host+'#panel-sources').evaluate(n=>{n.querySelectorAll(':scope > details').forEach(d=>d.open=false);for(let p=n;p;p=p.parentElement)p.scrollTop=0;});
    await page.screenshot({path:require('node:path').resolve(__dirname,'../../test-results/bank-management.png')});
    await page.setViewportSize({width:390,height:844});await page.locator(host+'#bankSettings > summary').click();
    const fits=await page.locator(host+'#bankSettings').evaluate(n=>n.scrollWidth<=n.clientWidth+1);assert.equal(fits,true);assert.deepEqual(errors,[]);
  });
  await test('默认开关：首次使用只启用播放阅读，答题相关全部关闭',async()=>{
    const {page,errors}=await setup('<video id="v"></video>'+choice(1,'默认不答题',['甲','乙']),{},[],{}, {},{noStart:true,cleanSettings:true});
    const values=await page.evaluate(()=>{const r=document.getElementById('cx-video-helper-host').shadowRoot;return Object.fromEntries([...r.querySelectorAll('input[type=checkbox][id]')].map(n=>[n.id,n.checked]));});
    for(const id of ['autoAnswer','randomFallback','overwriteAnswers','compareRandomConfidence','fillLowConfidenceBlanks','fuzzyMatching','visionImages','answerCache','homeworkEnabled','homeworkNext','homeworkAutoSave','homeworkSubmit','examEnabled','examNext','examSubmit','autoSubmit','multiModelEnabled','specialEnabled','specialCodeAI','specialAutoSubmit','discussionEnabled','discussionSubmit','requireWebSearch'])assert.equal(values[id],false,id);
    for(const id of ['autoResume','blockPause','backgroundPlay','muted','autoNext','skipFinished','autoRead'])assert.equal(values[id],true,id);
    await page.waitForFunction(()=>document.getElementById('v').playCalls>0);
    assert.equal(await page.locator('.TiMu input:checked').count(),0);assert.deepEqual(await page.evaluate(()=>window.aiRequests),[]);assert.deepEqual(errors,[]);
    assert.equal(await page.locator(host+'#n1KeyInput').count(),0);
  });
  await test('OCS通用接入：原格式handler字段转换、多选分隔与重复题库去重',async()=>{
    const {page,errors}=await setup(choice(1,'OCS通用题',['甲','乙','丙'],'多选题'),{},[],{external:{'/generic-ocs':{body:{ok:true,rows:[{title:'OCS通用题',answer:'甲###丙'}]}}}}, {},{noStart:true});
    const config={name:'任意OCS服务',url:'https://bank.example/generic-ocs',type:'GM_xmlhttpRequest',method:'post',data:{question:'${title}',options:{handler:'return env => env.options.split("\\n")'}},handler:'return res => res.ok ? res.rows.map(r => [r.title,r.answer]) : undefined'};
    await page.locator(host+'#tab-sources').click();await page.locator(host+'#presetProvider').selectOption('ocs');
    await page.locator(host+'#externalInput').fill(JSON.stringify([config,{...config,name:'重复名称'}]));await page.locator(host+'#saveExternal').click();
    assert.equal(await page.evaluate(()=>window.testStore['cxVideoHelper.settings.v1'].externalBanks.length),1);
    await page.locator(host+'#toggle').click();await checked(page,'input[value=A]');await checked(page,'input[value=C]');
    const requests=await page.evaluate(()=>window.aiRequests);assert.equal(requests.length,1);assert.deepEqual(requests[0].payload.options,['甲','乙','丙']);assert.deepEqual(errors,[]);
  });
  await test('扩展功能：ABC协议、节点及状态校验',async()=>{
    for(const node of ['secure','primary']){
      const config=normalizeConfig(abcConfig('bank-secret',node));
      const request=makeRequest(config,{title:'测试题',type:'multiple',options:[{text:'甲'},{text:'乙'}]});
      assert.deepEqual(JSON.parse(request.body).options,['甲','乙']);assert.equal(JSON.parse(request.body).type,'1');
      assert.deepEqual(parseResponse(config,{code:1,data:{answer:['A','B']}},{}).answers,['A','B']);
      assert.throws(()=>parseResponse(config,{code:0,data:{answer:['A']}},{}));
      assert.throws(()=>normalizeConfig({...config,url:'https://untrusted.example/query'}));
    }
  });
  await test('扩展功能：ABC预设保存及节点切换不泄露密钥',async()=>{
    const {page}=await setup('',{},[],{}, {},{noStart:true});
    await page.locator(host+'#tab-sources').click();
    await page.locator(host+'#presetProvider').selectOption('abc');
    await page.locator(host+'#presetKey').fill('abc-test-secret');await page.locator(host+'#presetSave').click();
    assert.equal(await page.locator(host+'#presetKey').inputValue(),'');
    let config=await page.evaluate(()=>window.testStore['cxVideoHelper.settings.v1'].externalBanks[0]);assert.equal(config.profile,'abc');assert.equal(config.node,'secure');
    await page.locator(host+'#abcNode').selectOption('primary');await page.locator(host+'#presetSave').click();
    config=await page.evaluate(()=>window.testStore['cxVideoHelper.settings.v1'].externalBanks[0]);assert.equal(config.node,'primary');assert.equal(config.data.token,'abc-test-secret');
    assert.ok(!(await page.locator(host+'#logs').textContent()).includes('abc-test-secret'));
    await page.screenshot({path:require('node:path').resolve(__dirname,'../../test-results/extended-services.png')});
  });
  await test('扩展功能：ABC题库实际查询走所选节点并填答',async()=>{
    const {page}=await setup(choice(1,'ABC接口题',['甲','乙']),{externalBanks:[abcConfig('abc-secret','secure')]},[],{external:{'/question/accurateSearch':{body:{code:1,data:{answer:['乙']}}}}});
    await checked(page,'input[value=B]');const request=await page.evaluate(()=>window.aiRequests[0]);assert.equal(request.url,'https://cs.dkjdda.top/question/accurateSearch');assert.equal(request.payload.token,'abc-secret');assert.deepEqual(request.payload.options,['甲','乙']);
  });
  await test('扩展功能：AI聊天连续上下文及文本安全渲染',async()=>{
    const {page}=await setup('',aiSettings,[],{raw:'<img src=x onerror=alert(1)>知识点解释'}, {},{noStart:true});
    await page.locator(host+'#tab-chat').click();await page.locator(host+'#chatInput').fill('解释概念');await page.locator(host+'#chatSend').click();
    await page.locator(host+'#chatStatus').filter({hasText:'回复完成'}).waitFor();
    assert.equal(await page.locator(host+'#chatHistory img').count(),0);
    await page.locator(host+'#chatInput').fill('继续解释');await page.locator(host+'#chatSend').click();
    await page.waitForFunction(()=>window.aiRequests.length===2);const messages=await page.evaluate(()=>window.aiRequests[1].payload.messages);assert.deepEqual(messages.map(m=>m.role),['system','user','assistant','user']);
    await page.screenshot({path:require('node:path').resolve(__dirname,'../../test-results/extended-chat.png')});
  });
  await test('扩展功能：聊天清空取消请求且迟到响应不回填',async()=>{
    const {page}=await setup('',aiSettings,[],{delay:1300}, {},{noStart:true});
    await page.locator(host+'#tab-chat').click();await page.locator(host+'#chatInput').fill('慢回复');await page.locator(host+'#chatSend').click();await page.locator(host+'#chatClear').click();
    await page.waitForTimeout(1500);assert.equal(await page.locator(host+'#chatHistory').textContent(),'');assert.ok(await page.evaluate(()=>window.apiAborts>0));
  });
  const examBody=()=>`<input name="examId" value="900"><input name="questionCount" value="1">${choice(1,'自动交卷题',['甲','乙'])}<button id="submitExam" onclick="window.examSubmits=(window.examSubmits||0)+1;document.getElementById('examConfirm').hidden=false">交卷</button><div id="examConfirm" role="dialog" hidden>确认交卷？<button onclick="window.examConfirms=(window.examConfirms||0)+1;this.parentElement.hidden=true;document.querySelector('[data-submit-state]').dataset.submitState='success'">确定</button></div><div data-submit-state="pending"></div>`;
  await test('扩展功能：整卷填写核对后交卷确认且不重复点击',async()=>{
    const {page}=await setup(examBody(),{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:'/exam-ans/exam/test/reVersionTestStartNew'});
    await page.waitForFunction(()=>window.examConfirms===1);await page.waitForTimeout(1800);assert.deepEqual(await page.evaluate(()=>[window.examSubmits,window.examConfirms]),[1,1]);
  });
  await test('扩展功能：关闭考试交卷开关不交卷',async()=>{
    const {page}=await setup(examBody(),{...aiSettings,examEnabled:true,examSubmit:false},[],{}, {},{path:'/exam-ans/exam/test/reVersionTestStartNew'});await checked(page,'input[value=B]');await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.examSubmits||0),0);
  });
  await test('扩展功能：考试跳到预览后恢复核对记录并自动交卷',async()=>{
    const body=`<input name="examId" value="901"><input name="questionCount" value="1">${choice(1,'预览跳转题',['甲','乙'])}<button onclick="location.href='/exam-ans/mooc2/exam/preview'">下一步</button>`;
    const preview='<input name="examId" value="901"><input name="questionCount" value="1">'+choice(1,'预览跳转题',['甲','乙']).replace('value="B"','value="B" checked')+'<button onclick="window.previewSubmits=(window.previewSubmits||0)+1;this.remove()">交卷</button>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {'/exam-ans/mooc2/exam/preview':preview},{path:'/exam-ans/exam/test/reVersionTestStartNew',persistentStore:true});
    await page.waitForURL('**/exam/preview');
    await page.addScriptTag({path:process.env.CX_TEST_SCRIPT||require('node:path').resolve(__dirname,'../../学习通学习助手.user.js')});
    await page.waitForFunction(()=>window.previewSubmits===1);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);
  });
  await test('扩展功能：队列读取去重及调整顺序持久化',async()=>{
    const link=id=>`https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=${id}&clazzid=9`;
    const {page}=await setup(`<a href="${link(1)}">课程一</a><a href="${link(1)}">重复一</a><a href="${link(2)}">课程二</a>`,{},[],{}, {},{noStart:true,path:'/visit/courses'});
    await page.locator(host+'#tab-queue').click();await page.locator(host+'#queueRead').click();await page.waitForFunction(()=>document.getElementById('cx-video-helper-host').shadowRoot.querySelectorAll('.queue-row').length===2);assert.equal(await page.locator(host+'.queue-row').count(),2);
    await page.locator(host+'.queue-row').first().getByRole('button',{name:'↓',exact:true}).click();const items=await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].items);assert.deepEqual(items.map(item=>item.id),['2:9','1:9']);
    assert.equal(await page.locator(host+'#queuePause').isDisabled(),true);assert.equal(await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].status),'paused');
  });
  await test('扩展功能：课程队列只在全部目录完成后推进',async()=>{
    const {page}=await setup('<div class="posCatalog_select posCatalog_active" id="cur1"><span class="catalog_points_yi">1</span><span class="posCatalog_name">未完成章节</span></div>',{autoNext:true},[],{}, {},{noStart:true,persistentStore:true});
    await page.evaluate(()=>history.replaceState(null,'','/mycourse/studentstudy?courseid=1&clazzid=9'));
    await page.locator(host+'#tab-home').click();await page.locator(host+'#courseQueueSection > summary').click();await page.locator(host+'#queueImport > summary').click();await page.locator(host+'#queueInput').fill('课程一 | https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=1&clazzid=9\n课程二 | https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=2&clazzid=9');await page.locator(host+'#queueAdd').click();await page.locator(host+'#queueStart').click();
    await page.waitForTimeout(3700);assert.ok(page.url().includes('courseid=1'));
    await page.evaluate(()=>document.querySelector('.catalog_points_yi').textContent='0');
    await page.waitForURL('**/*courseid=2*',{timeout:12000});assert.equal(await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].items[0].done),true);
    await page.addScriptTag({path:process.env.CX_TEST_SCRIPT||require('node:path').resolve(__dirname,'../../学习通学习助手.user.js')});
    await page.evaluate(()=>document.querySelector('.catalog_points_yi').textContent='0');
    await page.waitForFunction(()=>window.testStore['cxHelper.courseQueue.v1'].status==='complete',{},{timeout:12000});
    assert.equal(await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].items.every(item=>item.done)),true);
  });
  await test('扩展功能：其他标签页占用队列时不能抢跑',async()=>{
    const {page}=await setup('',{},[],{}, {},{noStart:true});await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1']={status:'running',owner:'other-tab',lease:Date.now()+60000,items:[{id:'1:9',name:'课程一',url:'https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=1&clazzid=9'}]});
    await page.locator(host+'#tab-home').click();await page.locator(host+'#courseQueueSection > summary').click();await page.locator(host+'#queueStatus').filter({hasText:'其他页面'}).waitFor();assert.equal(await page.locator(host+'#queueStart').isDisabled(),true);assert.equal(await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].owner),'other-tab');
  });
};
