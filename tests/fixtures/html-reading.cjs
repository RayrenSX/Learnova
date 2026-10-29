module.exports=async({test,setup,assert})=>{
  const base='/mooc-ans/ztnodedetailcontroller/visitnodedetail?courseId=77&knowledgeId=100&_from_=1_2_3_enc';
  const book=(height=100,next='?courseId=77&knowledgeId=101&_from_=1_2_3_enc')=>`<div style="float:left;width:20%;height:6000px">长目录</div><div id="courseMainBox" style="margin-left:22%"><div id="contentDescriptionBox"><div class="ans-cc" kid="100" style="height:${height}px">书籍正文</div></div><a class="nodeItem r" href="${next}" onclick="event.preventDefault();window.bookNext=(window.bookNext||0)+1">下一页</a></div>`;
  await test('HTML书籍：正文逐屏阅读后使用原生下一页，长目录不阻塞',async()=>{
    const {page}=await setup(book(1500),{autoAnswer:false,autoRead:true,readDelay:1000,autoNext:true},[],{}, {},{path:base});
    await page.waitForFunction(()=>document.scrollingElement.scrollTop>0,undefined,{timeout:6000});
    assert.equal(await page.evaluate(()=>window.bookNext||0),0);
    await page.waitForFunction(()=>window.bookNext===1,undefined,{timeout:6000});
    await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>window.bookNext),1);assert.equal(await page.evaluate(()=>window.nextClicks),0);
  });
  await test('HTML书籍：暂停、关闭阅读和只答题阻止后续翻页',async()=>{
    for(const settings of [{autoRead:false},{answerOnly:true},{enabled:false}]){
      const {page}=await setup(book(),{autoAnswer:false,readDelay:1000,...settings},[],{}, {},{path:base,noStart:settings.enabled===false});
      await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>window.bookNext||0),0);
    }
    const {page}=await setup(book(5000),{autoAnswer:false,readDelay:1000},[],{}, {},{path:base});
    await page.waitForFunction(()=>document.scrollingElement.scrollTop>0,undefined,{timeout:6000});await page.locator('#cx-video-helper-host #toggle').click();
    const top=await page.evaluate(()=>document.scrollingElement.scrollTop);await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),top);
  });
  await test('HTML书籍：拒绝跨书籍、跨任务来源及外域下一页',async()=>{
    for(const next of ['?courseId=88&knowledgeId=101&_from_=1_2_3_enc','?courseId=77&knowledgeId=101&_from_=9_2_3_enc','https://outside.example/visitnodedetail?courseId=77&knowledgeId=101']){
      const {page}=await setup(book(100,next),{autoAnswer:false,readDelay:1000},[],{}, {},{path:base});await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>window.bookNext||0),0);
    }
  });
  await test('HTML书籍：最后一页等待平台回执，不自行上报或切章',async()=>{
    const body=book().replace(/<a class="nodeItem[\s\S]*?<\/a>/,'');
    const {page}=await setup(body,{autoAnswer:false,readDelay:1000},[],{}, {},{path:base});await page.waitForFunction(()=>document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('logs').textContent.includes('书籍已到最后一页'),undefined,{timeout:6000});
    assert.equal(await page.evaluate(()=>window.nextClicks),0);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);assert.equal(await page.locator('.ans-job-finished').count(),0);
  });
  await test('HTML书籍：专题首页从当前内容进入下一章节，保留原生点击',async()=>{
    const body='<div id="courseMainBox"><div id="contentDescriptionBox"><div class="ans-cc" kid="100">首页正文</div></div></div><ul><li class="course_section"><a href="/mooc-ans/ztnodedetailcontroller/visitnodedetail?courseId=77&knowledgeId=100&_from_=1_2_3_enc">第一节</a></li><li class="course_section"><a href="/mooc-ans/ztnodedetailcontroller/visitnodedetail?courseId=77&knowledgeId=101&_from_=1_2_3_enc" onclick="event.preventDefault();window.bookNext=1">第二节</a></li></ul>';
    const {page}=await setup(body,{autoAnswer:false,readDelay:1000},[],{}, {},{path:'/mooc-ans/zt/portal/book-token?_from_=1_2_3_enc'});await page.waitForFunction(()=>window.bookNext===1,undefined,{timeout:6000});
  });
  await test('HTML书籍：新版去阅读只调用一次原生入口，完成由平台回调决定',async()=>{
    const body='<div class="readInfo"><div class="readZT" onclick="window.bookOpen=(window.bookOpen||0)+1"><span tabindex="0" role="option">去阅读</span></div></div>';
    const {page}=await setup(body,{autoAnswer:false,readDelay:1000},[],{}, {},{path:'/mooc-ans/coursedata/readjobv2/show?jobid=read-1'});await page.waitForFunction(()=>window.bookOpen===1,undefined,{timeout:6000});await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>window.bookOpen),1);assert.equal(await page.locator('.ans-job-finished').count(),0);
  });
  await test('HTML书籍：原生弹窗被拦截后打开同一书籍，保留平台入口回调',async()=>{
    const body='<script>window.open=()=>null;window.GM_openInTab=url=>{window.openedBook=url};</script><div class="readInfo"><div class="readZT" onclick="window.nativeRead=(window.nativeRead||0)+1;top.open(\'/mooc-ans/zt/portal/book?_from_=1_2_3_enc\')"><span tabindex="0">去阅读</span></div></div>';
    const {page}=await setup(body,{autoAnswer:false,readDelay:1000},[],{}, {},{path:'/mooc-ans/coursedata/readjobv2/show?jobid=read-1'});await page.waitForFunction(()=>!!window.openedBook,undefined,{timeout:6000});assert.equal(await page.evaluate(()=>window.nativeRead),1);assert.ok((await page.evaluate(()=>window.openedBook)).includes('/zt/portal/book'));assert.equal(await page.locator('.ans-job-finished').count(),0);
  });
  await test('HTML书籍：独立阅读页遵守跨页共享暂停和阅读开关',async()=>{
    const {page}=await setup(book(9000),{autoAnswer:false,readDelay:1000},[],{}, {},{path:base});await page.waitForFunction(()=>document.scrollingElement.scrollTop>0,undefined,{timeout:6000});
    await page.evaluate(()=>{const key='cxVideoHelper.settings.v1';window.GM_setValue(key,{...window.testStore[key],enabled:false});});
    await page.waitForFunction(()=>document.querySelector('#cx-video-helper-host').shadowRoot.getElementById('toggle').textContent==='开始',undefined,{timeout:3000});
    const top=await page.evaluate(()=>document.scrollingElement.scrollTop);await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),top);
    await page.evaluate(()=>{const key='cxVideoHelper.settings.v1';window.GM_setValue(key,{...window.testStore[key],enabled:true,autoRead:false});});await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),top);
  });
  await test('HTML书籍：HTML根不可滚动时使用body的真实滚动容器',async()=>{
    const {page}=await setup('<style>html,body{height:100%;margin:0}html{overflow:hidden}body{overflow:auto}</style>'+book(1800),{autoAnswer:false,readDelay:1000},[],{}, {},{path:base});
    await page.waitForFunction(()=>document.body.scrollTop>0,undefined,{timeout:6000});await page.waitForFunction(()=>window.bookNext===1,undefined,{timeout:6000});assert.equal(await page.evaluate(()=>document.documentElement.scrollTop),0);
  });
  for(const kind of ['书籍','链接'])await test(`阅读回执：必做${kind}点击后继续等待，仅对应原生完成标记允许切章`,async()=>{
    const path=kind==='书籍'?'/mooc-ans/coursedata/readjobv2/show':'/link.html';
    const root=kind==='书籍'?'<div class="readInfo"><div class="readZT" onclick="parent.opened++"><span tabindex="0">去阅读</span></div></div>':'<div class="ans-hyperlink"><a href="#" onclick="event.preventDefault();parent.opened++">打开链接</a></div>';
    const body=`<script>window.opened=0;window.attachments=[{jobid:'current',job:true,isPassed:false},{jobid:'other',job:true,isPassed:false}];</script><div class="ans-job" id="reading"><iframe data='{"jobid":"current"}' src="${path}"></iframe></div>`;
    const {page}=await setup(body,{autoAnswer:false,readDelay:1000,nextDelay:1000},[],{}, {[path]:root});
    await page.waitForFunction(()=>window.opened===1,undefined,{timeout:6000});await page.waitForTimeout(2300);
    assert.equal(await page.evaluate(()=>window.nextClicks),0);assert.equal(await page.locator('.ans-job-finished').count(),0);
    // A platform acknowledgement for another job cannot finish this one.
    await page.evaluate(()=>window.attachments[1].isPassed=true);await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.nextClicks),0);
    await page.evaluate(()=>{window.attachments[0].isPassed=true;});
    await page.waitForFunction(()=>window.nextClicks===1,undefined,{timeout:6000});assert.equal(await page.evaluate(()=>window.opened),1);
  });
};
