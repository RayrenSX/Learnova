module.exports = async ({test,setup,choice,blank,checked,logContains,aiSettings,assert}) => {
  await test('多模型设置：开启后显示投票模型，关闭隐藏并保留配置',async()=>{
    const prefix='#cx-video-helper-host ';
    const {page}=await setup('',{multiModelEnabled:false,voteModels:'model-a\nmodel-b'},[],{}, {},{noStart:true});
    await page.locator(prefix+'#tab-sources').click();await page.locator(prefix+'#apiSettings > summary').click();
    assert.equal(await page.locator(prefix+'#voteModels').isVisible(),false);
    await page.locator(prefix+'#multiModelEnabled').check();assert.equal(await page.locator(prefix+'#voteModels').isVisible(),true);
    assert.equal(await page.locator(prefix+'#voteModels').inputValue(),'model-a\nmodel-b');
    await page.locator(prefix+'#multiModelEnabled').uncheck();assert.equal(await page.locator(prefix+'#voteModelSettings').isVisible(),false);
    await page.locator(prefix+'#multiModelEnabled').check();assert.equal(await page.locator(prefix+'#voteModels').inputValue(),'model-a\nmodel-b');
    const enabled=await setup('',{multiModelEnabled:true,voteModels:'one\ntwo'},[],{}, {},{noStart:true});
    await enabled.page.locator(prefix+'#tab-sources').click();await enabled.page.locator(prefix+'#apiSettings > summary').click();assert.equal(await enabled.page.locator(prefix+'#voteModels').isVisible(),true);
  });
  const codeQuestion = (id=1) => `<div class="questionLi singleQuesId" id="question${id}" typeName="程序题"><h3 class="mark_name">编程任务 ${id}</h3><p>输入整数，输出相反数。使用 C 语言。</p><input type="hidden" id="answertype${id}" value="17"><textarea hidden class="code-editor"></textarea><div class="CodeMirror" style="min-height:50px" tabindex="0"></div><input type="hidden" id="answer${id}"><a id="runBtn" onclick="window.ran=(window.ran||0)+1">运行</a></div>`;
  const cm = `<script>document.querySelectorAll('.CodeMirror').forEach(e=>{let value='';let revision=0; e.CodeMirror={getValue:()=>value,getOption:key=>key==='readOnly'?false:'text/x-c',doc:{history:{done:[]}},setValue(v){value=v;this.doc.history.done.push(++revision);e.previousElementSibling.value=v;e.parentElement.querySelector('input[id^=answer]:not([id^=answertype])').value=v;},save(){e.previousElementSibling.value=value;}};});</script>`;
  const draft = {text:'int main(void) { return 0; }',confidence:1};
  await test('P1P2 真实结构：TiMu 外层容器不吞并多个 questionLi',async()=>{
    const body='<div class="TiMu">'+choice(1,'第一道题',['甲','乙']).replace('class="TiMu"','class="questionLi"')+choice(2,'第二道题',['甲','乙']).replace('class="TiMu"','class="questionLi"')+'</div>';
    const {page,errors}=await setup(body,{...aiSettings,queryInterval:1000});
    await checked(page,'input[name=q1][value=B]');await checked(page,'input[name=q2][value=B]');
    assert.equal(await page.evaluate(()=>window.aiRequests.length),2);assert.deepEqual(errors,[]);
  });
  await test('P1P2 程序题：CodeMirror 模型写入逐题回读，完整题干与语言送入请求',async()=>{
    const {page,errors}=await setup('<div class="TiMu">'+codeQuestion(1)+codeQuestion(2)+'</div>'+cm,{...aiSettings,specialCodeAI:true},[],{answer:draft});
    await page.waitForFunction(()=>document.querySelectorAll('.CodeMirror').length===2&&[...document.querySelectorAll('.CodeMirror')].every(e=>e.CodeMirror.getValue().includes('int main')));
    assert.equal(await page.locator('#cx-video-helper-host #taskList .task-row').count(),2);
    assert.equal(await page.locator('#answer1').inputValue(),draft.text);
    const requests=await page.evaluate(()=>window.aiRequests.map(r=>JSON.parse(r.payload.messages[1].content)));
    assert.equal(requests.length,2);assert.ok(requests.every(r=>r.statement.includes('输入整数')));assert.ok(requests.every(r=>r.language==='text/x-c'));
    assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.ran||0),0);
  });
  await test('P1P2 草稿保护：暂停取消、编辑再撤销仍不覆盖，不反复自动重试',async()=>{
    const one=await setup(codeQuestion()+cm,{...aiSettings,specialCodeAI:true},[],{answer:draft,delay:1300});
    await one.page.waitForFunction(()=>window.aiRequests.length===1);
    await one.page.locator('#cx-video-helper-host #toggle').click();await one.page.waitForTimeout(1500);
    assert.equal(await one.page.locator('.CodeMirror').evaluate(e=>e.CodeMirror.getValue()),'');
    const two=await setup(codeQuestion()+cm,{...aiSettings,specialCodeAI:true},[],{answer:draft,delay:1300});
    await two.page.waitForFunction(()=>window.aiRequests.length===1);await two.page.locator('.CodeMirror').press('a');await two.page.locator('.CodeMirror').press('Backspace');
    await two.page.waitForTimeout(2200);assert.equal(await two.page.locator('.CodeMirror').evaluate(e=>e.CodeMirror.getValue()),'');
    assert.equal(await two.page.evaluate(()=>window.aiRequests.length),1);
  });
  await test('P1P2 草稿保护：更换配置或替换题目不写入旧响应',async()=>{
    const {page}=await setup(codeQuestion()+cm,{...aiSettings,specialCodeAI:true},[],{answer:draft,delay:1400});
    await page.waitForFunction(()=>window.aiRequests.length===1);
    await page.locator('#cx-video-helper-host #apiSettings > summary').click();await page.locator('#cx-video-helper-host #apiModel').fill('new-model');await page.locator('#cx-video-helper-host #saveApi').click();
    await page.waitForTimeout(1700);assert.equal(await page.locator('.CodeMirror').evaluate(e=>e.CodeMirror.getValue()),'');
  });
  const discussion = '<div data-discussion><div data-discussion-topic>讨论节约用水的具体做法</div><textarea placeholder="回复话题"></textarea><div class="addReply" onclick="window.published=(window.published||0)+1;const r=document.createElement(\'div\');r.className=\'topicDetail_replyItem\';const c=document.createElement(\'div\');c.className=\'replyContent\';c.textContent=document.querySelector(\'textarea\').value;r.appendChild(c);document.body.appendChild(r)">回复</div></div>';
  await test('P1P2 讨论：默认只写草稿，开启发布后以新增对应回复确认',async()=>{
    const one=await setup(discussion,{...aiSettings,discussionEnabled:true},[],{answer:{text:'及时关闭水龙头，发现漏水及时报修。',confidence:1}});
    await logContains(one.page,'草稿已回读');assert.equal(await one.page.evaluate(()=>window.published||0),0);
    const two=await setup(discussion,{...aiSettings,discussionEnabled:true,discussionSubmit:true},[],{answer:{text:'按需用水。',confidence:1}});
    await two.page.waitForFunction(()=>window.published===1);await two.page.waitForTimeout(1600);assert.equal(await two.page.evaluate(()=>window.published),1);
    assert.ok((await two.page.locator('#cx-video-helper-host #taskList').innerText()).includes('新回复'));
  });
  await test('P1P2 签到：唯一原生按钮只点一次，未知反馈不当作成功',async()=>{
    const {page}=await setup('<div data-sign><button id="signBtn" onclick="window.signs=(window.signs||0)+1">签到</button></div>',{signEnabled:true,autoAnswer:false});
    await page.waitForFunction(()=>window.signs===1);await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+20000;});await page.waitForTimeout(1600);
    assert.equal(await page.evaluate(()=>window.signs),1);assert.ok((await page.locator('#cx-video-helper-host #taskList').innerText()).includes('尚未取得平台确认'));
  });
  await test('P1P2 签到：多按钮歧义及已完成状态都不盲点',async()=>{
    for(const body of ['<div data-sign><button id="signBtn" onclick="window.signs=1">签到</button><button>签到</button></div>','<div data-sign data-task-state="success"><button id="signBtn" onclick="window.signs=1">签到</button></div>']){
      const {page}=await setup(body,{signEnabled:true,autoAnswer:false});await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.signs||0),0);
    }
  });
  await test('P1P2 直播：未结束时阻止导航，关闭直播管理不抢播',async()=>{
    const {page}=await setup('<div data-live><video id="live"></video></div><div class="ans-job-finished"></div>',{autoAnswer:false,liveEnabled:true});
    await page.waitForTimeout(4500);assert.equal(await page.evaluate(()=>window.nextClicks),0);
    await page.evaluate(()=>{document.querySelector('[data-live]').setAttribute('data-task-state','success');document.querySelector('#live').finish();});
    await page.waitForFunction(()=>window.nextClicks===1,undefined,{timeout:7000});
  });
  await test('P1P2 直播：相邻完成标记不代表直播完成，关闭管理保留原生播放',async()=>{
    const one=await setup('<div data-live><video id="live"></video></div><div class="ans-job-finished">其他任务完成</div>',{autoAnswer:false,liveEnabled:true});
    await one.page.waitForTimeout(1500);
    assert.ok((await one.page.locator('#cx-video-helper-host #taskList').innerText()).includes('等待平台完成'));
    const two=await setup('<div data-live><video id="live"></video></div>',{autoAnswer:false,liveEnabled:false});
    await two.page.waitForTimeout(1500);assert.equal(await two.page.locator('#live').evaluate(m=>m.playCalls),0);
  });
  await test('P1P2 特殊作业：总开关关闭及已批阅页不生成代码',async()=>{
    for(const item of [{settings:{specialEnabled:false},path:'/mycourse/studentstudy'},{settings:{},path:'/mooc-ans/mooc2/work/view'}]){
      const {page}=await setup(codeQuestion()+cm,{...aiSettings,specialCodeAI:true,...item.settings},[],{answer:draft},{},{path:item.path});
      await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);
    }
  });
  await test('P1P2 特殊作业：运行与暂存不锁住随后提交，保存反馈不代表整题完成',async()=>{
    const body=codeQuestion()+cm+'<button id="saveNative" onclick="window.saved=(window.saved||0)+1;document.getElementById(\'dialogToast\').textContent=\'保存成功\'">暂存</button><div id="dialogToast"></div>';
    const {page}=await setup(body,{autoAnswer:false},[],{}, {},{});
    await page.locator('.questionLi').evaluate(root=>{
      for(const id of ['saveNative','dialogToast'])root.appendChild(document.getElementById(id));
      const submit=document.createElement('button');submit.textContent='提交作业';submit.onclick=()=>window.specialSubmits=(window.specialSubmits||0)+1;root.appendChild(submit);
    });
    // The workbench must pick up controls that arrive after the editor mounts.
    await page.locator('#cx-video-helper-host #tab-course').click();
    await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'运行测试'}).click();
    await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'暂存'}).click();
    await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'核对后提交'}).click();
    assert.deepEqual(await page.evaluate(()=>[window.ran||0,window.saved||0,window.specialSubmits||0]),[1,1,1]);
    assert.equal(await page.evaluate(()=>window.nextClicks),0);
  });
  await test('P1P2 特殊作业：附件与录音调用原生控件，未完成不切章',async()=>{
    const {page}=await setup('<div data-cx-special><h3>语音和文件作业</h3><input type="file"><div data-record-audio><button onclick="window.recording=true">开始录音</button><button onclick="window.recording=false">停止录音</button></div></div><div class="ans-job-finished"></div>',{autoAnswer:false});
    await page.locator('#cx-video-helper-host #tab-course').click();
    await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'开始录音'}).click();assert.equal(await page.evaluate(()=>window.recording),true);
    await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'停止录音'}).click();assert.equal(await page.evaluate(()=>window.recording),false);
    const chooser=page.waitForEvent('filechooser');await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'选择附件'}).click();
    await (await chooser).setFiles({name:'answer.txt',mimeType:'text/plain',buffer:Buffer.from('test fixture')});
    assert.equal(await page.locator('[data-cx-special] input[type=file]').evaluate(e=>e.files[0].name),'answer.txt');await page.waitForTimeout(1400);assert.equal(await page.evaluate(()=>window.nextClicks),0);
  });
  await test('P1P2 直接 PDF：包装页自动启动并按原生阅读入口翻页',async()=>{
    const {page}=await setup('<div id="reader" data-cx-reader><select id="pagejump" onchange="window.reads=(window.reads||0)+1"><option value="1">1</option><option value="2">2</option></select></div>',{enabled:true,autoAnswer:false,readDelay:1000},[],{}, {},{path:'/ananas/modules/pdf/mooc2-resource-index.html',noStart:true});
    await page.waitForFunction(()=>window.reads===1,undefined,{timeout:6000});
  });
  await test('P1P2 听力：音频发送格式正确且不占用播放队列，不缓存',async()=>{
    const body=choice(1,'听录音选择',['甲','乙']).replace('<ul','<audio src="https://media.example/material.mp3"></audio><ul');
    const {page}=await setup(body,{...aiSettings,answerCache:true},[],{}, {},{preserveSources:true});await checked(page,'input[value=B]');
    const request=await page.evaluate(()=>window.aiRequests[0].payload.messages[1].content);
    assert.equal(request.find(p=>p.type==='input_audio').input_audio.format,'mp3');
    assert.equal(await page.locator('audio').evaluate(e=>e.playCalls),0);assert.deepEqual(await page.evaluate(()=>window.testStore['cxHelper.answers.v1']),[]);
  });
  await test('P1P2 相似匹配：轻微拼写差可匹配，否定词或数字变化拒绝',async()=>{
    const one=await setup(choice(1,'国家全称',['中华人民共和国人民政府','其他完全无关选项']),{...aiSettings,fuzzyMatching:true},[],{answer:{answers:['中华人民共和国人名政府'],confidence:1}});
    await checked(one.page,'input[value=A]');
    for(const answer of ['中华人民共和国不是人民政府','标准压力为100千帕时']){
      const {page}=await setup(choice(1,'重要条件',['中华人民共和国是人民政府','标准压力为101千帕时']),{...aiSettings,fuzzyMatching:true},[],{answer:{answers:[answer],confidence:1}});
      await page.waitForTimeout(1400);assert.equal(await page.locator('.TiMu input:checked').count(),0);
    }
  });
  await test('P1P2 多模型：严格多数采用，平票与不足总数多数不填写',async()=>{
    const one=await setup(choice(1,'投票题',['甲','乙']),{...aiSettings,multiModelEnabled:true,voteModels:'one\ntwo\nthree'},[],{byModel:{one:{answers:['A'],confidence:1},two:{answers:['B'],confidence:1},three:{answers:['B'],confidence:1}}});
    await checked(one.page,'input[value=B]');assert.equal(await one.page.evaluate(()=>window.aiRequests.length),3);
    const two=await setup(choice(1,'平票题',['甲','乙']),{...aiSettings,multiModelEnabled:true,voteModels:'one\ntwo',randomFallback:true},[],{byModel:{one:{answers:['A'],confidence:1},two:{answers:['B'],confidence:1}}});
    await logContains(two.page,'未取得配置模型总数的严格多数');assert.equal(await two.page.locator('.TiMu input:checked').count(),0);
  });
  await test('P1P2 手动搜题：本地题库和划选可用，结果不回填原题',async()=>{
    const {page}=await setup(choice(1,'手动搜题题干',['甲','乙']),{autoAnswer:false},[{question:'手动搜题题干',answers:['B']}]);
    await page.evaluate(()=>{const node=document.querySelector('.fontLabel');const range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.locator('#cx-video-helper-host #searchSettings > summary').click();await page.locator('#cx-video-helper-host #useSelection').click();
    assert.equal(await page.locator('#cx-video-helper-host #manualQuestion').inputValue(),'手动搜题题干');
    await page.locator('#cx-video-helper-host #manualOptions').fill('甲\n乙');await page.locator('#cx-video-helper-host #manualSearch').click();
    await page.locator('#cx-video-helper-host #manualResult').filter({hasText:'本地题库'}).waitFor();assert.equal(await page.locator('.TiMu input:checked').count(),0);
  });
  await test('P1P2 虚拟分页：从隐藏题号集取得题量，保存两页后才提交',async()=>{
    const second=choice(2,'虚拟第二题',['甲','乙']);
    const body='<input id="workId" value="virtual-work"><input name="answerwqbid" value="1,2,"><section data-virtualized id="virtualQuestions">'+choice(1,'虚拟第一题',['甲','乙'])+'</section>'
      +'<button data-action="save-work" onclick="window.saves=(window.saves||0)+1;document.getElementById(\'dialogToast\').textContent=\'保存成功\'">暂时保存</button><div id="dialogToast"></div>'
      +`<script>window.secondQuestion=${JSON.stringify(second)}</script><button id="nextQuestion" onclick="window.pages=(window.pages||0)+1;document.getElementById('virtualQuestions').innerHTML=window.secondQuestion;this.hidden=true">下一题</button>`
      +'<button data-action="submit-homework" onclick="window.submitClicks++">提交作业</button>';
    const {page,errors}=await setup(body,{...aiSettings,queryInterval:1000,homeworkAutoSave:true,homeworkNext:true,homeworkSubmit:true},[],{}, {},{path:'/work/doHomeWorkNew'});
    await page.waitForFunction(()=>window.submitClicks===1,undefined,{timeout:10000});
    assert.deepEqual(await page.evaluate(()=>[window.saves,window.pages,window.aiRequests.length]),[2,1,2]);assert.deepEqual(errors,[]);
  });
  await test('P1P2 暂存恢复：重新加载只认可页面回读一致的检查点，变更答案重新查询',async()=>{
    const {readFileSync}=require('node:fs');const {resolve}=require('node:path');
    const installed=readFileSync(resolve(__dirname,'../../学习通学习助手.user.js'),'utf8');
    const metadata='<input id="workId" value="reload-work"><input id="totalQuestionNum" value="1">';
    const body=metadata+choice(1,'暂存恢复题',['甲','乙'])+'<button data-action="save-work" onclick="document.getElementById(\'dialogToast\').textContent=\'保存成功\'">暂时保存</button><div id="dialogToast"></div>';
    const {page,context}=await setup(body,{...aiSettings,homeworkAutoSave:true,overwriteAnswers:true},[],{}, {},{path:'/work/doHomeWorkNew',persistentStore:true});
    await logContains(page,'平台已反馈当前页保存成功');
    const values=await page.evaluate(()=>window.testStore);values['cxVideoHelper.settings.v1'].enabled=false;
    assert.equal(values['cxHelper.homeworkCheckpoints.v1'][0].questions.length,1);
    const md5=require('blueimp-md5');
    assert.equal(values['cxHelper.homeworkCheckpoints.v1'][0].questions[0].key,md5(JSON.stringify(['暂存恢复题','single',[['A','甲'],['B','乙']],0,[]])));
    assert.equal(values['cxHelper.homeworkCheckpoints.v1'][0].questions[0].snapshot,md5(JSON.stringify([[false,true],[],[]])));
    await page.evaluate(()=>{const settings=GM_getValue('cxVideoHelper.settings.v1');settings.enabled=false;GM_setValue('cxVideoHelper.settings.v1',settings);});
    for(const serverAnswer of ['B','A']){
      await page.evaluate(()=>{const settings=GM_getValue('cxVideoHelper.settings.v1');settings.enabled=false;GM_setValue('cxVideoHelper.settings.v1',settings);});
      await context.route('**/work/doHomeWorkNew',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"></head><body>'+body+`<script>window.nextClicks=0;window.submitClicks=0;document.querySelector('input[value=${serverAnswer}]').checked=true;</script></body></html>`}));
      await page.reload();await page.addScriptTag({content:installed});await page.locator('#cx-video-helper-host #toggle').click();
      if(serverAnswer==='B'){await logContains(page,'与暂存检查点一致');assert.equal(await page.evaluate(()=>window.aiRequests.length),0);}
      else {await checked(page,'input[value=B]');assert.equal(await page.evaluate(()=>window.aiRequests.length),1);}
    }
  });
  await test('P1P2 OCS：fetch 按浏览器跨域规则执行，HTTP 错误不采用答案',async()=>{
    const configs=[{name:'fetch-bank',url:'https://bank.example/native-bank',method:'GET',type:'fetch',answerPath:'answers',data:{question:'${title}'}}];
    const one=await setup(choice(1,'浏览器题库',['甲','乙']),{externalBanks:configs},[],{external:{'/native-bank':{nativeFetch:true,body:{answers:['B']}}}});
    await checked(one.page,'input[value=B]');assert.equal(await one.page.evaluate(()=>window.aiRequests.length),0);
    const two=await setup(choice(1,'浏览器题库错误',['甲','乙']),{externalBanks:configs},[],{external:{'/native-bank':{nativeFetch:true,status:500,body:{answers:['B']}}}});
    await two.page.waitForTimeout(1400);assert.equal(await two.page.locator('.TiMu input:checked').count(),0);
  });
  await test('P1P2 OCS：字段转换结果中的代码模板符号保留原文',async()=>{
    const configs=[{name:'literal',url:'https://bank.example/literal',method:'POST',allowCode:true,data:{question:{handler:'return env => env.title + " ${variable}"'},options:'${options}'},handler:'return res => [undefined,res.answers]'}];
    const {page}=await setup(choice(1,'原文保留',['甲','乙']),{externalBanks:configs},[],{external:{'/literal':{body:{answers:['B']}}}});
    await checked(page,'input[value=B]');assert.equal(await page.evaluate(()=>window.aiRequests[0].payload.question),'原文保留 ${variable}');
  });
  await test('P1P2 OCS：隔离 handler 与 data.handler 可用，页面/存储无权限',async()=>{
    const configs=[{name:'OCS',url:'https://bank.example/ocs',method:'post',type:'GM_xmlhttpRequest',allowCode:true,data:{question:{handler:'return env => env.title.toUpperCase()'}},handler:'return res => { if (typeof document !== "undefined" || typeof GM_getValue !== "undefined") throw 1; return [undefined,res.result.answer]; }'}];
    const {page}=await setup(choice(1,'ocs 测试',['甲','乙']),{externalBanks:configs},[],{external:{'/ocs':{body:{result:{answer:'B'}}}}});
    await checked(page,'input[value=B]');assert.equal(await page.evaluate(()=>window.aiRequests[0].payload.question),'OCS 测试');assert.equal(await page.locator('iframe[sandbox]').count(),0);
  });
  await test('P1P2 OCS：无限循环超时清理且不能阻塞页面或发送额外网络',async()=>{
    const configs=[{name:'loop',url:'https://bank.example/loop',method:'POST',allowCode:true,handler:'return res => { while(true){} }'}];
    const {page}=await setup(choice(1,'超时隔离',['甲','乙']),{...aiSettings,externalBanks:configs},[],{external:{'/loop':{body:{answers:['A']}}}});
    await checked(page,'input[value=B]');assert.equal(await page.locator('iframe[sandbox]').count(),0);
  });
};
