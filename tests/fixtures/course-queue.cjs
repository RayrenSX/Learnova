const fs=require('node:fs'),path=require('node:path');
module.exports=async({test,setup,assert})=>{
  const h='#cx-video-helper-host ',key='cxHelper.courseQueue.v1';
  const item=(id,name,extra={})=>({url:`https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=${id}&clazzid=9`,name,selected:true,done:false,...extra});
  const open=async page=>{await page.locator(h+'#tab-home').click();await page.locator(h+'#courseQueueSection > summary').click();};
  await test('目录完成状态：新版绿勾与零任务点正确统计，未完成筛选同步更新',async()=>{
    const body='<h3 class="chapter_title">第一章</h3>'+Array.from({length:3},(_,i)=>`<div class="chapter_item" id="cur${i}" onclick="window.chapterClicks=(window.chapterClicks||0)+1" title="章节${i}"><div class="catalog_name">章节${i}</div>${i===0?'<div class="catalog_state icon_yiwanc"><span class="bntHoverTips">已完成</span></div>':i===1?'<input class="knowledgeJobCount" value="0">':'<input class="knowledgeJobCount" value="2">'}</div>`).join('');
    const {page}=await setup(body,{skipFinished:true},[],{}, {},{noStart:true,path:'/mooc2-ans/mycourse/studentcourse?courseid=1&clazzid=9'});
    await page.locator(h+'#tab-course').click();assert.ok((await page.locator(h+'#courseProgressText').textContent()).includes('2 / 3'));
    await page.locator(h+'#pendingChapters').click();assert.equal(await page.locator(h+'.chapter-link').count(),1);
    await page.evaluate(()=>{const row=document.getElementById('cur2');row.querySelector('input').value='0';row.insertAdjacentHTML('beforeend','<div class="catalog_state icon_yiwanc"></div>');});
    await page.waitForFunction(()=>document.getElementById('cx-video-helper-host').shadowRoot.getElementById('courseProgressText').textContent.includes('3 / 3'));
    assert.equal(await page.locator(h+'.chapter-link').count(),0);
  });
  await test('页面分区：空间页用队列替换目录，隐藏播放控制及无关入口',async()=>{
    for(const url of ['https://i.chaoxing.com/base','https://i.mooc.chaoxing.com/space/index','https://mooc2-ans.chaoxing.com/visit/interaction']){
      const {page,errors}=await setup('',{uiTab:'course'},[],{}, {},{noStart:true,url});
      assert.deepEqual(await page.locator(h+'.tabs > button:visible').allTextContents(),['课程队列','常用','设置']);
      assert.equal(await page.locator(h+'.command-bar').isVisible(),false);assert.equal(await page.locator(h+'.overview').isVisible(),false);
      assert.equal(await page.locator(h+'#queueRead').isVisible(),true);assert.equal(await page.locator(h+'#queueInput').isVisible(),false);
      await page.locator(h+'#tab-queue').press('ArrowRight');assert.equal(await page.locator(h+'#tab-home').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator(h+'#homeworkPanel').isVisible(),false);assert.equal(await page.locator(h+'#learningTools').isVisible(),false);
      await page.locator(h+'#tab-settings').click();assert.equal(await page.locator(h+'#tab-sources').getAttribute('aria-selected'),'true');
      await page.locator(h+'#tab-settings').press('ArrowLeft');assert.equal(await page.locator(h+'#tab-home').getAttribute('aria-selected'),'true');assert.deepEqual(errors,[]);
      if(url.includes('/base')){await page.locator(h+'#tab-queue').click();await page.screenshot({path:path.resolve(__dirname,'../../test-results/space-queue.png')});}
    }
  });
  await test('页面分区：学习页队列位于常用，禁止课程读取且目录无课后作业',async()=>{
    const {page,errors}=await setup('',{},[],{}, {},{noStart:true});await open(page);
    assert.deepEqual(await page.locator(h+'.tabs > button:visible').allTextContents(),['目录','常用','AI 聊天','设置','记录']);
    assert.equal(await page.locator(h+'#queueRead').isVisible(),false);assert.equal(await page.locator(h+'#panel-home #panel-queue').count(),1);
    assert.equal(await page.locator(h+'#panel-course #homeworkPanel').count(),0);
    const count=await page.evaluate(()=>window.aiRequests.length);await page.evaluate(()=>document.getElementById('cx-video-helper-host').shadowRoot.getElementById('queueRead').click());
    assert.equal(await page.evaluate(()=>window.aiRequests.length),count);assert.deepEqual(errors,[]);
  });
  await test('队列审查：封面与标题重复链接取有效名称，读取保留选择和完成状态',async()=>{
    const url=item(1,'').url,body=`<a href="${url}"><img></a><h3><a href="${url}">真实课程名称</a></h3><a href="${item(2,'').url}">新课程</a>`;
    const {page}=await setup(body,{},[],{}, {},{noStart:true,path:'/visit/courses'});
    await page.evaluate(({key,entry})=>window.testStore[key]={status:'paused',items:[entry]}, {key,entry:item(1,'旧名称',{done:true,selected:true})});
    await page.locator(h+'#queueRead').click();await page.waitForFunction(key=>window.testStore[key]?.items.length===2,key);
    const queue=await page.evaluate(key=>window.testStore[key],key);assert.equal(queue.items[0].name,'真实课程名称');assert.equal(queue.items[0].done,true);assert.equal(queue.items[0].selected,true);assert.equal(queue.items[1].selected,false);
    assert.equal(await page.locator(h+'#queueStart').isDisabled(),true);
    await page.locator(h+'#queueSelectAll').click();assert.equal(await page.locator(h+'#queueStart').isDisabled(),false);
    await page.locator(h+'#queueSearch').fill('新课程');assert.equal(await page.locator(h+'.queue-row').count(),1);
    await page.locator(h+'.queue-row').getByRole('button',{name:'移除',exact:true}).click();assert.deepEqual((await page.evaluate(key=>window.testStore[key].items,key)).map(i=>i.name),['真实课程名称']);
  });
  await test('队列审查：暂停后继续当前课程，调整前面顺序不会跳回第一门',async()=>{
    const {page}=await setup('<video id="v"></video>',{autoAnswer:false},[],{}, {},{noStart:true});
    await page.evaluate(({key,items})=>{history.replaceState(null,'','/mycourse/studentstudy?courseid=2&clazzid=9');window.testStore[key]={status:'paused',current:'2:9',items};},{key,items:[item(1,'第一门'),item(2,'正在学的课程')]});
    await open(page);await page.waitForFunction(()=>document.getElementById('cx-video-helper-host').shadowRoot.querySelectorAll('.queue-row').length===2);
    await page.locator(h+'#queueStart').click();await page.waitForFunction(()=>document.getElementById('v').playCalls>0);
    assert.equal(await page.evaluate(key=>window.testStore[key].current,key),'2:9');await page.locator(h+'#queuePause').click();assert.equal(await page.evaluate(()=>document.getElementById('v').paused),true);
    await page.locator(h+'#queueStart').click();await page.waitForFunction(()=>document.getElementById('v').playCalls>1);assert.ok(page.url().includes('courseid=2'));
  });
  await test('队列审查：目录标记与剩余任务矛盾时不完成，零任务稳定后才完成',async()=>{
    const {page}=await setup('<div class="posCatalog_select" id="cur1"><i class="icon_Completed"></i><span class="catalog_points_yi">2</span></div>',{autoAnswer:false},[],{}, {},{noStart:true});
    await page.evaluate(({key,entry})=>{history.replaceState(null,'','/mycourse/studentstudy?courseid=1&clazzid=9');window.testStore[key]={status:'paused',items:[entry]};},{key,entry:item(1,'矛盾目录')});
    await open(page);await page.waitForFunction(()=>!document.getElementById('cx-video-helper-host').shadowRoot.getElementById('queueStart').disabled);await page.locator(h+'#queueStart').click();
    await page.waitForTimeout(3700);assert.equal(await page.evaluate(key=>window.testStore[key].items[0].done,key),false);
    await page.evaluate(()=>document.querySelector('.catalog_points_yi').textContent='0');await page.waitForFunction(key=>window.testStore[key].status==='complete',key,{timeout:8000});
  });
  await test('队列审查：窄屏复选框无叠加滑块，长名称和行操作不溢出',async()=>{
    const {page,errors}=await setup('',{},[],{}, {},{noStart:true,url:'https://i.chaoxing.com/base'});await page.setViewportSize({width:320,height:800});
    await page.evaluate(({key,entry})=>window.testStore[key]={status:'paused',items:[entry]},{key,entry:item(1,'人工智能学院2026级新生适应专题讲座与很长的课程名称')});
    await page.waitForFunction(()=>document.getElementById('cx-video-helper-host').shadowRoot.querySelectorAll('.queue-row').length===1);
    const layout=await page.locator(h+'.queue-row').evaluate(n=>({fits:n.scrollWidth<=n.clientWidth+1,pseudo:getComputedStyle(n.querySelector('input'),'::after').content}));assert.equal(layout.fits,true);assert.ok(['none','normal'].includes(layout.pseudo));assert.deepEqual(errors,[]);
    await page.screenshot({path:path.resolve(__dirname,'../../test-results/space-queue-narrow.png')});
  });
  await test('队列审查：空间已加载课程直接读取，不发多余请求；页面不能伪造启动或删除',async()=>{
    const {page}=await setup(`<a href="${item(1,'').url}">空间课程</a>`,{},[],{}, {},{noStart:true,url:'https://i.chaoxing.com/base'});
    await page.locator(h+'#queueRead').click();assert.equal(await page.locator(h+'.queue-row').count(),1);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);
    await page.locator(h+'.queue-check').check();const before=await page.evaluate(key=>window.testStore[key],key);
    await page.evaluate(()=>{const r=document.getElementById('cx-video-helper-host').shadowRoot;r.getElementById('queueStart').click();r.querySelector('.queue-row-actions button:last-child').click();r.getElementById('queueSelectNone').click();const check=r.querySelector('.queue-check');check.checked=false;check.dispatchEvent(new Event('change'));});
    assert.deepEqual(await page.evaluate(key=>window.testStore[key],key),before);assert.equal(await page.locator(h+'.queue-check').isChecked(),true);
  });
  await test('页面分区：跨域嵌入作业不重复显示窗口，独立作业页仍可操作',async()=>{
    const route='/mooc2/work/list',body='<p>暂无作业</p>';
    const {page,errors}=await setup(`<iframe src="https://mooc2-ans.chaoxing.com${route}"></iframe>`,{},[],{}, {[route]:body},{noStart:true});
    const frame=page.frames().find(f=>f.url().includes(route));assert.ok(frame);
    await frame.addScriptTag({content:fs.readFileSync(process.env.CX_TEST_SCRIPT||path.resolve(__dirname,'../../学习通学习助手.user.js'),'utf8')});
    assert.equal(await frame.locator('#cx-video-helper-host').isVisible(),false);assert.equal(await page.locator('#cx-video-helper-host').isVisible(),true);assert.deepEqual(errors,[]);
    const standalone=await setup(body,{},[],{}, {},{noStart:true,url:'https://mooc2-ans.chaoxing.com'+route});assert.equal(await standalone.page.locator('#cx-video-helper-host').isVisible(),true);
  });
  await test('队列审查：签名章节链接通过课程入口重新获取会话，不复用过期参数',async()=>{
    const {page}=await setup('',{},[],{}, {},{noStart:true,url:'https://i.chaoxing.com/base'});
    await page.evaluate(({key,entry})=>window.testStore[key]={status:'paused',items:[entry]}, {key,entry:item(1,'旧章节',{url:item(1,'').url+'&chapterId=99&enc=expired&cpi=42'})});
    await page.waitForFunction(()=>!document.getElementById('cx-video-helper-host').shadowRoot.getElementById('queueStart').disabled);
    await page.locator(h+'#queueStart').click();await page.waitForURL('**/visit/stucoursemiddle?**');
    const url=new URL(page.url());assert.equal(url.searchParams.get('cpi'),'42');assert.equal(url.searchParams.has('enc'),false);assert.equal(url.searchParams.has('chapterId'),false);
  });
};
