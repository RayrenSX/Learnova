const Bank=require('../../tools/external-bank.cjs');
const fs=require('node:fs'),path=require('node:path');
const script=()=>fs.readFileSync(process.env.CX_TEST_SCRIPT||path.resolve(__dirname,'../../学习通学习助手.user.js'),'utf8');
module.exports=async({test,setup,choice,checked,logContains,aiSettings,assert})=>{
  const host='#cx-video-helper-host ',examPath='/exam-ans/mooc2/exam/preview';
  const startPath='/exam-ans/exam/test/reVersionTestStartNew';
  const realQuestion=(id,title)=>`<div class="questionLi" data="${id}"><h3><span class="colorShallow">(单选题)</span>${title}</h3><input name="type${id}" value="0" type="hidden"><div class="stem_answer">${['甲','乙'].map((text,i)=>`<div class="answerBg" onclick="this.parentElement.querySelectorAll('.check_answer').forEach(n=>n.remove());this.querySelector('.num_option').classList.add('check_answer')"><span class="num_option" data="${String.fromCharCode(65+i)}">${String.fromCharCode(65+i)}</span><span class="answer_p">${text}</span></div>`).join('')}</div></div>`;
  const actualExam=()=>'<input id="testPaperId" value="500"><input id="testUserRelationId" value="900">'+realQuestion(72,'源码原生结构题')+'<i id="answerSheet72"></i><div class="sub-button fr"><a class="completeBtn" onclick="window.submits=(window.submits||0)+1;document.getElementById(\'nativeConfirm\').hidden=false">交卷</a></div><div class="popBottom" id="nativeConfirm" hidden><a onclick="answerDirectSubmit()">确定</a></div><script>window.answerDirectSubmit=()=>{window.confirms=(window.confirms||0)+1;document.getElementById("nativeConfirm").hidden=true;};</script>';
  await test('ABC审查：原服务多空分隔与完整选项文本不误拆',async()=>{
    const config=Bank.abcConfig('test-key');
    for(const value of ['甲###乙',['甲===乙'],['甲---乙'],['甲#乙']])assert.deepEqual(Bank.parseResponse(config,{code:1,data:{answer:value}},{type:'blank',options:[]}).answers,['甲','乙']);
    const q={type:'single',options:[{text:'甲;乙|丙'}]};assert.deepEqual(Bank.parseResponse(config,{code:1,data:{answer:'甲;乙|丙'}},q).answers,['甲;乙|丙']);
    assert.deepEqual(Bank.parseResponse(config,{code:1,data:{answer:'说明;正文|原样'}},{type:'essay'}).answers,['说明;正文|原样']);
    assert.equal(Bank.makeRequest(config,{title:'问答',type:'essay',options:[],workType:'ks',courseId:'99'}).data.type,'2');
    assert.equal(Bank.makeRequest(config,{title:'问答',type:'essay',options:[],workType:'ks',courseId:'99'}).data.workType,'ks');
    assert.equal(Bank.makeRequest(config,{title:'手动搜题',type:'single',options:[]}).data.id,'0');
  });
  await test('ABC审查：原接口HTTP失败不能把响应错误当作答案',async()=>{
    const {page}=await setup(choice(1,'题库失败题',['甲','乙']),{...aiSettings,externalBanks:[Bank.abcConfig('secret')]},[],{external:{'/question/accurateSearch':{status:400,body:{code:1,data:{answer:['甲']}}}}});
    await checked(page,'input[value=B]');await logContains(page,'外部题库未返回可匹配答案');
    assert.equal(await page.evaluate(()=>window.aiRequests[0].headers.t.length),10);
    assert.ok(!(await page.locator(host+'#logs').textContent()).includes('secret'));
  });
  await test('ABC审查：课程列表转接地址、参数大小写及personid',async()=>{
    const body='<a href="/mooc-ans/visit/stucoursemiddle?CourseID=11&ClassID=22&cpi=33">转接课程</a><li class="course" courseid="44" clazzid="55" personid="66"><h3 class="course-name">卡片课程</h3></li><a onclick="window.open(\'/mooc2-ans/mycourse/studentcourse?courseId=77&clazzId=88&cpi=99\')">新版课程</a>';
    const {page}=await setup(body,{},[],{}, {},{noStart:true,path:'/visit/courses'});await page.locator(host+'#tab-queue').click();await page.locator(host+'#queueRead').click();
    await page.waitForFunction(()=>window.testStore['cxHelper.courseQueue.v1']?.items.length===3);const queue=await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1']);assert.deepEqual(queue.items.map(i=>i.id),['11:22','77:88','44:55']);
    assert.equal(new URL(queue.items[2].url).searchParams.get('cpi'),'66');assert.equal(new URL(queue.items[0].url).pathname,'/mooc-ans/visit/stucoursemiddle');
  });
  await test('ABC审查：当前页无课程时通过原平台课程列表接口读取',async()=>{
    const {page}=await setup('',{},[],{external:{'/mooc-ans/visit/courselistdata':{raw:'<li class="course" courseid="123" clazzid="456" personid="789"><h3 class="course-name">远端课程</h3></li>'}}}, {},{noStart:true,path:'/visit/courses'});
    await page.locator(host+'#tab-queue').click();await page.locator(host+'#queueRead').click();await page.waitForFunction(()=>window.testStore['cxHelper.courseQueue.v1']?.items.length===1);
    const item=await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].items[0]);assert.equal(item.id,'123:456');assert.equal(new URL(item.url).searchParams.get('cpi'),'789');
  });
  await test('ABC审查：新版课程目录knowledgeJobCount进入未完成章节',async()=>{
    const {page}=await setup('<div class="chapter_item" id="cur1" onclick="window.entered=(window.entered||0)+1"><input class="knowledgeJobCount" value="2">章节一</div>',{autoAnswer:false,nextDelay:0},[],{}, {},{path:'/mooc2-ans/mycourse/studentcourse?courseid=1&clazzid=2'});
    await page.waitForFunction(()=>window.entered===1,undefined,{timeout:6000});assert.equal(await page.locator(host+'#panel-queue').count(),1);
  });
  await test('ABC审查：课程锁定目录与加载中目录不推进',async()=>{
    const {page}=await setup('<div class="chapter_item" id="cur1" onclick="toOld()"><input class="knowledgeJobCount" value="0"><i class="icon_yiwanc"></i>章节</div><div data-catalog-loading="true"></div>',{autoAnswer:false},[],{}, {},{noStart:true});
    await page.evaluate(()=>history.replaceState(null,'','/mycourse/studentstudy?courseid=1&clazzid=2'));
    await page.locator(host+'#tab-home').click();await page.locator(host+'#courseQueueSection > summary').click();await page.locator(host+'#queueImport > summary').click();await page.locator(host+'#queueInput').fill('https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=1&clazzid=2');await page.locator(host+'#queueAdd').click();await page.locator(host+'#queueStart').click();
    await page.waitForTimeout(3700);assert.equal(await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1'].status),'running');await page.evaluate(()=>document.querySelector('[data-catalog-loading]').remove());
    await page.waitForFunction(()=>window.testStore['cxHelper.courseQueue.v1'].status==='complete',undefined,{timeout:8000});
  });
  await test('ABC审查：有效租约阻止其他页面第一次扫描播放',async()=>{
    const {page}=await setup('<video id="v"></video>',{autoAnswer:false},[],{}, {},{noStart:true});
    await page.evaluate(()=>{history.replaceState(null,'','/mycourse/studentstudy?courseid=1&clazzid=2');window.testStore['cxHelper.courseQueue.v1']={status:'running',owner:'other',lease:Date.now()+60000,current:'1:2',items:[{id:'1:2',name:'课',url:location.href}]};});
    await page.locator(host+'#toggle').click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.getElementById('v').playCalls),0);
    assert.equal(await page.evaluate(()=>window.testStore['cxVideoHelper.settings.v1'].enabled),true);
  });
  await test('ABC审查：课程队列损坏数据不使面板初始化崩溃',async()=>{
    const {page,errors}=await setup('',{},[],{}, {},{noStart:true});await page.evaluate(()=>window.testStore['cxHelper.courseQueue.v1']={status:'paused',items:[null,{}, {url:'javascript:alert(1)'},{url:'https://mooc1.chaoxing.com/mycourse/stu?courseid=1&clazzid=2',name:'有效'}]});
    await page.locator(host+'#tab-home').click();await page.locator(host+'#courseQueueSection > summary').click();await page.waitForFunction(()=>document.getElementById('cx-video-helper-host').shadowRoot.querySelectorAll('.queue-row').length===1);assert.deepEqual(errors,[]);
  });
  await test('ABC审查：直接进入原生整卷预览填写并使用专用确认按钮',async()=>{
    const {page,errors}=await setup(actualExam(),{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:examPath});
    await page.waitForFunction(()=>window.confirms===1);assert.equal(await page.evaluate(()=>window.submits),1);assert.deepEqual(errors,[]);
  });
  await test('ABC审查：整卷预览无题量字段稳定加载后按完整题目范围交卷',async()=>{
    const body=actualExam().replace('<i id="answerSheet72"></i>','');
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:examPath});
    await page.waitForFunction(()=>window.confirms===1);assert.equal(await page.evaluate(()=>window.submits),1);
  });
  await test('ABC审查：考试分页和重复题号不能视为完整试卷',async()=>{
    const body='<input id="testPaperId" value="12"><div class="questionPager"></div>'+choice(1,'分题预览',['甲','乙'])+'<button onclick="window.submits=(window.submits||0)+1">交卷</button>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:examPath});await checked(page,'input[value=B]');await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>window.submits||0),0);
  });
  await test('ABC审查：隐藏的旧交卷确认显示后才能确认且嵌套对话不重复',async()=>{
    const body='<input name="examId" value="77"><input name="questionCount" value="1">'+choice(1,'嵌套确认',['甲','乙'])+'<button onclick="window.submits=1;document.getElementById(\'dialog\').hidden=false">交卷</button><div id="dialog" role="dialog" hidden><div class="modal">确认交卷？<button onclick="window.confirms=(window.confirms||0)+1;document.getElementById(\'dialog\').hidden=true">确定</button></div></div>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:startPath});await page.waitForFunction(()=>window.confirms===1);await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.confirms),1);
  });
  await test('ABC审查：点击交卷后手动改答不继续自动确认',async()=>{
    const body='<input name="examId" value="78"><input name="questionCount" value="1">'+choice(1,'改答后暂停',['甲','乙'])+'<button onclick="window.submits=1;document.querySelector(\'.TiMu input[value=A]\').checked=true;document.getElementById(\'confirm\').hidden=false">交卷</button><div id="confirm" role="dialog" hidden>确认交卷？<button onclick="window.confirms=1">确定</button></div>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:startPath});await page.waitForFunction(()=>window.submits===1);await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>window.confirms||0),0);
  });
  await test('ABC审查：交卷未确认后刷新不再次自动请求交卷',async()=>{
    const body='<input name="examId" value="79"><input name="questionCount" value="1">'+choice(1,'刷新交卷',['甲','乙'])+'<button onclick="window.submits=(window.submits||0)+1">交卷</button>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:startPath,persistentStore:true});await page.waitForFunction(()=>window.submits===1);
    await page.reload();await page.addScriptTag({content:script()});await page.waitForTimeout(2000);assert.equal(await page.evaluate(()=>window.submits||0),0);await logContains(page,'此前已请求考试交卷');
  });
  await test('ABC审查：取消聊天后新请求不被旧请求finally解锁',async()=>{
    const {page}=await setup('',aiSettings,[],{delay:1800}, {},{noStart:true});await page.locator(host+'#tab-chat').click();
    await page.locator(host+'#chatInput').fill('第一条');await page.locator(host+'#chatSend').click();await page.locator(host+'#chatCancel').click();await page.locator(host+'#chatInput').fill('第二条');await page.locator(host+'#chatSend').click();
    await page.waitForTimeout(300);assert.equal(await page.locator(host+'#chatSend').isDisabled(),true);await page.locator(host+'#chatStatus').filter({hasText:'回复完成'}).waitFor();assert.equal(await page.locator(host+'#chatHistory .user').count(),1);
  });
  await test('ABC审查：切换题库服务清空未保存密钥避免发给另一服务',async()=>{
    const {page}=await setup('',{},[],{}, {},{noStart:true});await page.locator(host+'#tab-sources').click();await page.locator(host+'#presetProvider').selectOption('abc');await page.locator(host+'#presetKey').fill('abc-unsaved-secret');await page.locator(host+'#presetProvider').selectOption('n1');
    assert.equal(await page.locator(host+'#presetKey').inputValue(),'');await page.locator(host+'#presetSave').click();assert.deepEqual(await page.evaluate(()=>window.testStore['cxVideoHelper.settings.v1'].externalBanks||[]),[]);
  });
  await test('ABC审查：页面伪造点击不能改题库或开启自动交卷',async()=>{
    const {page}=await setup('',{},[],{}, {},{noStart:true});await page.evaluate(()=>{const root=document.getElementById('cx-video-helper-host').shadowRoot;
      root.getElementById('presetKey').value='forged-secret';root.getElementById('presetSave').click();root.getElementById('examSubmit').checked=true;root.getElementById('examSubmit').dispatchEvent(new Event('change',{bubbles:true}));});
    assert.deepEqual(await page.evaluate(()=>window.testStore['cxVideoHelper.settings.v1'].externalBanks||[]),[]);assert.equal(await page.locator(host+'#examSubmit').isChecked(),false);
  });
  await test('ABC审查：原生逐题考试累计完整题号后才交卷',async()=>{
    const next=realQuestion(73,'逐题第二题');
    const body='<input id="testPaperId" value="501"><input id="testUserRelationId" value="901"><i id="answerSheet72"></i><i id="answerSheet73"></i><div id="questionArea">'+realQuestion(72,'逐题第一题')+'</div>'+
      `<button onclick="getTheNextQuestion(1)">下一题</button><div class="sub-button fr"><a class="completeBtn" onclick="window.submits=(window.submits||0)+1">交卷</a></div><script>window.getTheNextQuestion=()=>{document.getElementById('questionArea').innerHTML=${JSON.stringify(next)};document.querySelector('[onclick=\"getTheNextQuestion(1)\"]').remove();};</script>`;
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true,examNext:true,queryInterval:1000},[],{}, {},{path:startPath});
    await page.waitForFunction(()=>window.submits===1,undefined,{timeout:12000});assert.equal(await page.evaluate(()=>window.aiRequests.length),2);assert.equal(await page.locator('.questionLi').getAttribute('data'),'73');
  });
  await test('ABC审查：预览选项顺序变化不能沿用旧核对记录',async()=>{
    const body='<input name="examId" value="88"><input name="questionCount" value="1">'+choice(1,'换序题',['甲','乙'])+'<button onclick="location.href=\'/exam-ans/mooc2/exam/preview\'">整卷预览</button>';
    const preview='<input name="examId" value="88"><input name="questionCount" value="1">'+choice(1,'换序题',['乙','甲']).replace('value="B"','value="B" checked')+'<button onclick="window.submits=1">交卷</button>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {'/exam-ans/mooc2/exam/preview':preview},{path:startPath,persistentStore:true});await page.waitForURL('**/exam/preview');await page.addScriptTag({content:script()});
    await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>window.submits||0),0);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);
  });
  await test('ABC审查：交卷中的确认框关闭开关后不会自动确认',async()=>{
    const delayed=actualExam().replace("document.getElementById('nativeConfirm').hidden=false", "setTimeout(()=>document.getElementById('nativeConfirm').hidden=false,1500)");
    const {page}=await setup(delayed,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {},{path:examPath});
    await page.waitForFunction(()=>window.submits===1);await page.locator(host+'#tab-answer').click();await page.locator(host+'#examSubmit').uncheck();await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.confirms||0),0);
  });
  await test('ABC审查：聊天失败保留查询期间新输入的草稿',async()=>{
    const {page}=await setup('',aiSettings,[],{delay:1000,status:401}, {},{noStart:true});await page.locator(host+'#tab-chat').click();await page.locator(host+'#chatInput').fill('发送的内容');await page.locator(host+'#chatSend').click();await page.locator(host+'#chatInput').fill('新草稿');
    await page.locator(host+'#chatStatus').filter({hasText:'鉴权失败'}).waitFor();assert.equal(await page.locator(host+'#chatInput').inputValue(),'新草稿');assert.equal(await page.locator(host+'#chatHistory .user').count(),0);
  });
  await test('ABC审查：修改AI模型立即取消聊天并保留输入草稿',async()=>{
    const {page}=await setup('',aiSettings,[],{delay:6000}, {},{noStart:true});await page.locator(host+'#tab-chat').click();await page.locator(host+'#chatInput').fill('正在查询');await page.locator(host+'#chatSend').click();await page.locator(host+'#chatInput').fill('草稿');
    await page.locator(host+'#tab-settings').click();await page.locator(host+'#tab-sources').click();await page.locator(host+'#apiSettings > summary').click();await page.locator(host+'#apiModel').fill('changed-model');await page.locator(host+'#saveApi').click();assert.ok(await page.evaluate(()=>window.apiAborts>0));
    await page.locator(host+'#tab-chat').click();assert.equal(await page.locator(host+'#chatInput').inputValue(),'草稿');assert.equal(await page.locator(host+'#chatSend').isDisabled(),false);
  });
  await test('ABC审查：新版fanyav3课程主页可点击章节入口',async()=>{
    const {page}=await setup('<div data-url="/mooc2-ans/mycourse/studentcourse" onclick="window.opens=(window.opens||0)+1">章节</div>',{autoAnswer:false,nextDelay:100},[],{}, {},{path:'/fanyav3/stu?courseid=1&clazzid=2'});
    await page.waitForFunction(()=>window.opens===1);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);
  });
  await test('ABC审查：窄屏队列与聊天无水平溢出且键盘入口顺序正确',async()=>{
    const {page,errors}=await setup('',{},[],{}, {},{noStart:true});await page.setViewportSize({width:320,height:650});
    for(const tab of ['home','chat']){await page.locator(host+`#tab-${tab}`).click();if(tab==='home')await page.locator(host+'#courseQueueSection > summary').click();assert.ok(await page.locator(host+'.config').evaluate(node=>node.scrollWidth<=node.clientWidth+1));}
    assert.ok(await page.locator(host+'.tabs button').evaluateAll(buttons=>buttons.every(button=>button.scrollWidth<=button.clientWidth+1)));
    await page.locator(host+'#tab-settings').click();await page.locator(host+'#tab-settings').press('ArrowLeft');assert.equal(await page.locator(host+'#tab-chat').getAttribute('aria-selected'),'true');
    await page.screenshot({path:path.resolve(__dirname,'../../test-results/abc-audit-chat-narrow.png')});assert.deepEqual(errors,[]);
  });
  await test('ABC审查：两个真实标签页同时恢复过期队列只允许一页播放',async()=>{
    const {page,context}=await setup('<video id="v"></video>',{autoAnswer:false},[],{}, {},{noStart:true});
    const second=await context.newPage();await second.goto(page.url());await second.evaluate(()=>document.querySelectorAll('video').forEach(window.mockMedia));await second.addScriptTag({content:script()});
    const values=await page.evaluate(()=>window.testStore);
    values['cxHelper.courseQueue.v1']={status:'running',owner:'expired-owner',lease:0,current:'1:2',items:[{url:'https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=1&clazzid=2',name:'队列课'}]};
    await page.evaluate(data=>localStorage.setItem('audit-shared-store',JSON.stringify(data)),values);
    for(const tab of [page,second])await tab.evaluate(()=>{history.replaceState(null,'','/mycourse/studentstudy?courseid=1&clazzid=2');
      window.GM_getValue=(key,fallback)=>JSON.parse(localStorage.getItem('audit-shared-store'))[key]??fallback;
      window.GM_setValue=(key,value)=>{const data=JSON.parse(localStorage.getItem('audit-shared-store'));data[key]=value;localStorage.setItem('audit-shared-store',JSON.stringify(data));};});
    await Promise.all([page.locator(host+'#toggle').click(),second.locator(host+'#toggle').click()]);await page.waitForTimeout(1500);
    const plays=await Promise.all([page,second].map(tab=>tab.evaluate(()=>document.getElementById('v').playCalls)));assert.equal(plays.reduce((sum,value)=>sum+value,0),1);
  });
  await test('ABC审查：重复题号或当前题数超过声明总数不交卷',async()=>{
    const body='<input name="examId" value="89"><input name="questionCount" value="1">'+choice(1,'重复题号一',['甲','乙'])+choice(1,'重复题号二',['甲','乙'])+'<button onclick="window.submits=1">交卷</button>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true,queryInterval:1000},[],{}, {},{path:examPath});await page.waitForFunction(()=>window.aiRequests.length===2);await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.submits||0),0);
  });
  await test('ABC审查：考试开始页先进入可用整卷预览再读取完整题目',async()=>{
    const body='<input id="testPaperId" value="500"><input id="testUserRelationId" value="900"><div class="sub-button"><a class="completeBtn" onclick="topreview()">整卷预览</a></div><script>window.topreview=()=>location.href="/exam-ans/mooc2/exam/preview";</script>';
    const {page}=await setup(body,{...aiSettings,examEnabled:true,examSubmit:true},[],{}, {'/exam-ans/mooc2/exam/preview':actualExam()},{path:startPath,persistentStore:true});
    await page.waitForURL('**/exam/preview');await page.addScriptTag({content:script()});await page.waitForFunction(()=>window.confirms===1);assert.equal(await page.evaluate(()=>window.aiRequests.length),1);
  });
  await test('ABC审查：禁止预览或未开自动交卷时不自动点击预览入口',async()=>{
    for(const disabled of [true,false]){const {page}=await setup('<input id="testPaperId" value="5">'+(disabled?'<div class="mark_info">不允许整卷预览</div>':'')+'<a onclick="topreview()">整卷预览</a><script>window.topreview=()=>window.previews=(window.previews||0)+1;</script>',{...aiSettings,examEnabled:true,examSubmit:disabled},[],{}, {},{path:startPath});await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.previews||0),0);}
  });
};
