module.exports = async function({test,setup,choice,checked,logContains,aiSettings,assert}) {
  const path='/mooc-ans/mooc2/work/dowork';
  const question=(id,title,type='0',typeName='单选题')=>`<div class="questionLi" data-question-id="${id}" typeName="${typeName}"><h3 class="mark_name"><span class="question-number">${id}.</span><span>(${typeName},5分)</span>${title}</h3><input type="hidden" name="answertype${id}" value="${type}"><div class="stem_answer">${['甲','乙','丙'].map((t,i)=>`<div class="answerBg" onclick="this.parentElement.querySelectorAll('.check_answer').forEach(n=>n.remove());this.insertAdjacentHTML('beforeend','<i class=check_answer></i>')"><span class="num_option" data="${String.fromCharCode(65+i)}"></span><div class="answer_p">${t}</div></div>`).join('')}</div></div>`;
  const metadata=total=>`<input id="workId" value="work-42"><input id="totalQuestionNum" value="${total}">`;
  const save=`<button data-action="save-work" onclick="window.saveClicks=(window.saveClicks||0)+1;setTimeout(()=>{document.getElementById('dialogToast').textContent='保存成功';},100)">暂时保存</button><div id="dialogToast"></div>`;
  const submit='<button class="Btn_blue_1" onclick="window.submitClicks++;const box=document.getElementById(\'submitted\');box.setAttribute(\'data-submit-state\',\'success\');box.textContent=\'提交成功\'">提交作业</button><div id="submitted"></div>';
  await test('课后作业：列表入口展示并过滤外站、截止和锁定，支持嵌套列表',async()=>{
    const list='<ul class="workList"><li data="/mooc-ans/mooc2/work/dowork?workId=1" onclick="window.openedWork=1"><p>第一份作业</p><p>未交</p></li><li data="/mooc-ans/mooc2/work/dowork?workId=2"><p>截止作业</p><p>已截止</p></li><li data="https://outside.example/work/dowork"><p>外部站点</p><p>未交</p></li></ul>';
    const one=await setup(list,{},[],{}, {},{path:'/mooc2/work/list'});
    await one.page.locator('#cx-video-helper-host #homeworkList button').filter({hasText:'第一份作业'}).waitFor({state:'attached'});
    assert.equal(await one.page.locator('#cx-video-helper-host #homeworkList button').count(),2);
    assert.equal(await one.page.locator('#cx-video-helper-host #homeworkList button').filter({hasText:'截止作业'}).isDisabled(),true);
    assert.equal(await one.page.locator('#cx-video-helper-host #panel-course #homeworkPanel').count(),0);
    assert.equal(await one.page.locator('#cx-video-helper-host #panel-home #homeworkPanel').count(),1);
    await one.page.locator('#cx-video-helper-host #tab-home').click();
    await one.page.locator('#cx-video-helper-host #homeworkPanel > summary').click();
    await one.page.locator('#cx-video-helper-host #homeworkList button').filter({hasText:'第一份作业'}).click();assert.equal(await one.page.evaluate(()=>window.openedWork),1);
    const two=await setup('<iframe src="/mooc2/work/list"></iframe>',{},[],{}, {'/mooc2/work/list':list});
    await two.page.locator('#cx-video-helper-host #homeworkList button').filter({hasText:'第一份作业'}).waitFor({state:'attached'});
  });
  await test('课后作业：新版真实结构提取题干题型，使用现有AI填写回读',async()=>{
    const {page,errors}=await setup(metadata(1)+question(1,'课后作业正文'),{...aiSettings},[],{}, {},{path});
    await logContains(page,'已填写（AI）');
    const payload=await page.evaluate(()=>JSON.parse(window.aiRequests[0].payload.messages[1].content));
    assert.equal(payload.question,'课后作业正文');assert.equal(payload.type,'single');assert.deepEqual(payload.options.map(o=>o.text),['甲','乙','丙']);
    assert.equal(await page.locator('.answerBg').nth(1).locator('.check_answer').count(),1);assert.deepEqual(errors,[]);
  });
  await test('章节测验：doHomeWorkNew 任务 iframe 不受独立课后作业开关阻断',async()=>{
    const taskPath='/mooc-ans/work/doHomeWorkNew?courseId=267603740&workId=56423473&api=1&knowledgeid=705035958&jobid=work-c4b53e6f33a546f499d5991b94069cc9&originJobId=work-c4b53e6f33a546f499d5991b94069cc9';
    const body='<div class="ans-job"><iframe src="'+taskPath+'"></iframe></div>';
    const {page,errors}=await setup(body,{...aiSettings,homeworkEnabled:false,autoSubmit:false},[],{}, {[new URL(taskPath,'https://mooc1.chaoxing.com').pathname]:question(1,'章节任务正文')});
    await logContains(page,'已填写（AI）');
    const frame=page.frames().find(item=>item.url().includes('/work/doHomeWorkNew'));
    assert.equal(await frame.locator('.answerBg').nth(1).locator('.check_answer').count(),1);
    assert.equal(await page.evaluate(()=>window.nextClicks),0);
    assert.deepEqual(errors,[]);
  });
  await test('课后作业：独立提交开关默认关闭，不继承章节提交，暂存需明确开关',async()=>{
    const {page}=await setup(metadata(1)+question(1,'独立提交')+save+submit,{...aiSettings,autoSubmit:true},[],{}, {},{path});
    await logContains(page,'已填写（AI）');await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(()=>window.submitClicks),0);assert.equal(await page.evaluate(()=>window.saveClicks||0),0);
  });
  await test('课后作业：已提交与已批阅页只查看，关闭作业处理不查询，不自动重做',async()=>{
    for(const item of [{path:'/mooc-ans/mooc2/work/view',body:''},{path,body:'<div class="workStatus">待批阅</div>'},{path,body:'',disabled:true}]){
      const {page}=await setup(item.body+metadata(1)+question(1,'只读题'),{...aiSettings,homeworkEnabled:!item.disabled,homeworkSubmit:true},[],{}, {},{path:item.path});
      await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);assert.equal(await page.locator('.check_answer').count(),0);
    }
  });
  await test('课后作业：自动暂存必须取得点击后的新成功反馈',async()=>{
    const {page}=await setup(metadata(1)+question(1,'暂存题')+save,{...aiSettings,homeworkAutoSave:true},[],{}, {},{path});
    await logContains(page,'平台已反馈当前页保存成功');assert.equal(await page.evaluate(()=>window.saveClicks),1);
    await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.saveClicks),1);
  });
  await test('课后作业：旧保存提示不能作为本次确认，超时不翻页，暂停取消观察器',async()=>{
    const body=metadata(2)+question(1,'旧提示')+'<div id="dialogToast">保存成功</div><button data-action="save-work" onclick="window.saveClicks=(window.saveClicks||0)+1">暂时保存</button><button id="nextQuestion" onclick="window.pageClicks=(window.pageClicks||0)+1">下一题</button>';
    const {page}=await setup(body,{...aiSettings,homeworkAutoSave:true,homeworkNext:true},[],{}, {},{path});
    await page.waitForFunction(()=>window.saveClicks===1);await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+20000;});
    await logContains(page,'暂存未得到平台确认');assert.equal(await page.evaluate(()=>window.pageClicks||0),0);
    await page.locator('#cx-video-helper-host #toggle').click();await page.evaluate(()=>document.getElementById('dialogToast').textContent='保存成功');await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.pageClicks||0),0);
  });
  await test('课后作业：保存确认后分题翻页，整份题号集确认后才允许独立提交',async()=>{
    const q2=question(2,'第二题');
    const body=metadata(2)+'<div data-cx-question-index><i data-question-id="1"></i><i data-question-id="2"></i></div><section id="workQuestions">'+question(1,'第一题')+'</section>'+save+
      `<script>window.nextHomework=${JSON.stringify(q2)}</script><button id="nextQuestion" onclick="window.pageClicks=(window.pageClicks||0)+1;document.getElementById('workQuestions').innerHTML=window.nextHomework;this.hidden=true">下一题</button>`+submit;
    const {page}=await setup(body,{...aiSettings,queryInterval:1000,homeworkAutoSave:true,homeworkNext:true,homeworkSubmit:true},[],{}, {},{path});
    await page.waitForFunction(()=>window.submitClicks===1,undefined,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.pageClicks),1);assert.equal(await page.evaluate(()=>window.saveClicks),2);assert.equal(await page.evaluate(()=>window.aiRequests.length),2);
    await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.submitClicks),1);
  });
  await test('课后作业：未知整份题量不自动提交，重复题号与隐藏未答题不误完成',async()=>{
    for(const body of [question(1,'题量未知'),metadata(2)+question(1,'重复题号')+question(1,'重复题号'),metadata(2)+question(1,'可见题')+question(2,'隐藏题').replace('class="questionLi"','class="questionLi" hidden')]){
      const {page}=await setup(body+submit,{...aiSettings,queryInterval:1000,homeworkSubmit:true},[],{}, {},{path});
      await logContains(page,'已填写（AI）');await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>window.submitClicks),0);
    }
  });
  await test('课后作业：保存中用户修改后不接受旧确认或翻页',async()=>{
    const slowSave=save.replace('},100)','},1800)');
    const {page}=await setup(metadata(2)+question(1,'修改保护')+slowSave+'<button id="nextQuestion" onclick="window.pageClicks=(window.pageClicks||0)+1">下一题</button>',{...aiSettings,homeworkAutoSave:true,homeworkNext:true},[],{}, {},{path});
    await page.waitForFunction(()=>window.saveClicks===1);await page.locator('.answerBg').first().click();await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(()=>window.pageClicks||0),0);
  });
  await test('课后作业：父页面内作业可填写但不会切课程章节，考试仍不自动交卷',async()=>{
    const {page}=await setup('<iframe src="/mooc2/work/dowork"></iframe>',{...aiSettings},[],{}, {'/mooc2/work/dowork':metadata(1)+question(1,'框架作业')});
    await logContains(page,'已填写（AI）');assert.equal(await page.evaluate(()=>window.nextClicks),0);
    const {page:exam}=await setup('<input name="examId" value="1">'+choice(1,'考试界限',['甲','乙'])+'<button id="submitExam" onclick="window.submitClicks++">提交作业</button>',
      {...aiSettings,examEnabled:true,homeworkSubmit:true},[],{}, {},{path:'/exam-ans/mooc2/exam/preview'});
    await page.waitForTimeout(1000);assert.equal(await exam.evaluate(()=>window.submitClicks),0);
  });
  await test('课后作业：新旧作业路由按已保存开启状态自动启动，无需手动点击开始',async()=>{
    for(const route of ['/work/doHomeWorkNew','/mooc-ans/mooc2/work/dowork']){
      const {page}=await setup(metadata(1)+question(1,'自动启动作业'),{...aiSettings,enabled:true},[],{}, {},{path:route,noStart:true});
      await logContains(page,'已填写（AI）');assert.equal(await page.evaluate(()=>window.aiRequests.length),1);
    }
  });
  await test('课后作业：课程原生菜单可进入作业，详情页入口可以查看，多个保存按钮不盲点',async()=>{
    const one=await setup('<div onclick="window.workMenuClicks=(window.workMenuClicks||0)+1"><span class="nav_content">作业</span></div>');
    await one.page.locator('#cx-video-helper-host #tab-home').click();await one.page.locator('#cx-video-helper-host #homeworkPanel > summary').click();await one.page.locator('#cx-video-helper-host #homeworkList button').click();
    assert.equal(await one.page.evaluate(()=>window.workMenuClicks),1);
    const two=await setup('<a href="/work/doHomeWorkNew?workId=42">开始作业</a>',{},[],{}, {},{path:'/mooc2/work/detail'});
    assert.equal(await two.page.locator('#cx-video-helper-host #homeworkList button').count(),1);
    const three=await setup(metadata(1)+question(1,'歧义保存')+save+'<button data-action="save-work" onclick="window.wrongSave=true">保存作业</button>',
      {...aiSettings,homeworkAutoSave:true},[],{}, {},{path});
    await logContains(three.page,'已填写（AI）');await three.page.waitForTimeout(1000);
    assert.equal(await three.page.evaluate(()=>Boolean(window.wrongSave)||(window.saveClicks||0)>0),false);
  });
  await test('课后作业：关闭翻页开关与保存中切换作业阻止旧反馈触发导航',async()=>{
    const slow=save.replace('},100)','},1700)');
    const {page}=await setup(metadata(2)+question(1,'切换作业')+slow+'<button id="nextQuestion" onclick="window.pageClicks=(window.pageClicks||0)+1">下一题</button>',
      {...aiSettings,homeworkAutoSave:true,homeworkNext:true},[],{}, {},{path});
    await page.waitForFunction(()=>window.saveClicks===1);
    await page.evaluate(()=>{document.getElementById('workId').value='different-work';document.querySelector('.questionLi').remove();});
    await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>window.pageClicks||0),0);
  });
};
