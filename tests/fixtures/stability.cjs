module.exports=async ({test,setup,choice,logContains,aiSettings,assert})=>{
  const program=()=>'<div class="questionLi" id="question1" typeName="程序题"><h3 class="mark_name">程序题</h3><p id="statement">输出相反数。</p><input type="hidden" id="answertype1" value="17"><div class="CodeMirror" style="height:50px" tabindex="0"></div></div>';
  const mount=`<script>window.mountCode=()=>{const element=document.querySelector('.CodeMirror');let value='';element.CodeMirror={getValue:()=>value,getOption:key=>key==='readOnly'?false:'text/x-c',setValue:v=>{value=v},save(){},doc:{history:{done:[]}}};return element.CodeMirror;};window.mountCode();</script>`;
  const draft={text:'int main(void) { return 0; }',confidence:1};
  await test('稳定性：隐藏附件入口可选择文件且不吞并相邻程序题',async()=>{
    const {page}=await setup('<form class="TiMu"><div class="upload-block"><h3>文件附件</h3><input type="file" hidden></div>'+program()+mount+'</form>',{autoAnswer:false});
    await page.locator('#cx-video-helper-host #tab-course').click();
    await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'选择附件'}).waitFor({timeout:4000});
    assert.equal(await page.locator('#cx-video-helper-host #taskList .task-row').count(),2);
    const chooser=page.waitForEvent('filechooser');await page.locator('#cx-video-helper-host #taskList button').filter({hasText:'选择附件'}).click();
    await (await chooser).setFiles({name:'answer.txt',mimeType:'text/plain',buffer:Buffer.from('sample')});
    assert.equal(await page.locator('form input[type=file]').evaluate(el=>el.files.length),1);
  });
  await test('稳定性：录音预览不被自动播放，普通课程视频仍运行',async()=>{
    const {page}=await setup('<div data-cx-special><h3>录音作业</h3><div data-record-audio><button>开始录音</button></div><audio id="preview" src="/recording.mp3"></audio></div><video id="lesson" src="/lesson.mp4"></video>',{autoAnswer:false});
    await page.waitForFunction(()=>document.querySelector('#lesson').playCalls===1,undefined,{timeout:5000});
    assert.equal(await page.locator('#preview').evaluate(media=>media.playCalls),0);
  });
  await test('稳定性：直播开播前等待，状态更新后才播放',async()=>{
    const {page}=await setup('<div data-live><span data-live-state>直播未开始</span><video id="live"></video></div>',{autoAnswer:false});
    await page.waitForTimeout(1600);assert.equal(await page.locator('#live').evaluate(media=>media.playCalls),0);
    await page.locator('[data-live-state]').evaluate(el=>el.textContent='直播进行中');
    await page.waitForFunction(()=>document.querySelector('#live').playCalls===1,undefined,{timeout:5000});
  });
  await test('稳定性：程序题请求期间同节点更换编辑器模型，旧模型不写入',async()=>{
    const {page}=await setup(program()+mount,{...aiSettings,specialCodeAI:true},[],{answer:draft,delay:1500});
    await page.waitForFunction(()=>window.aiRequests.length===1);
    await page.evaluate(()=>{window.oldCode=document.querySelector('.CodeMirror').CodeMirror;window.mountCode();});
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(()=>window.oldCode.getValue()),'');
    assert.equal(await page.locator('.CodeMirror').evaluate(el=>el.CodeMirror.getValue()),'');
  });
  await test('稳定性：同一题目节点换题后自动生成新草稿，旧题状态不阻塞',async()=>{
    const {page}=await setup(program()+mount,{...aiSettings,specialCodeAI:true},[],{answer:draft});
    await logContains(page,'编程代码草稿已回读');
    await page.evaluate(()=>{document.querySelector('#statement').textContent='输出整数的绝对值。';window.mountCode();});
    await page.waitForFunction(()=>window.aiRequests.length===2&&document.querySelector('.CodeMirror').CodeMirror.getValue().includes('int main'),undefined,{timeout:5000});
  });
  await test('稳定性：编程编辑器模型延迟挂载后自动继续，不永久卡住',async()=>{
    const {page}=await setup(program()+mount.replace('window.mountCode();</script>','</script>'),{...aiSettings,specialCodeAI:true},[],{answer:draft});
    await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.aiRequests.length),0);
    await page.evaluate(()=>window.mountCode());
    await page.waitForFunction(()=>window.aiRequests.length===1&&document.querySelector('.CodeMirror').CodeMirror.getValue().includes('int main'),undefined,{timeout:4000});
  });
  await test('稳定性：已播放直播转为等待开播后暂停，恢复开播后继续',async()=>{
    const {page}=await setup('<div data-live><span data-live-state>直播进行中</span><video id="live"></video></div>',{autoAnswer:false});
    await page.waitForFunction(()=>document.querySelector('#live').playCalls===1);
    await page.locator('[data-live-state]').evaluate(el=>el.textContent='等待开播');
    await page.waitForFunction(()=>document.querySelector('#live').paused,undefined,{timeout:4000});
    const count=await page.locator('#live').evaluate(el=>el.playCalls);
    await page.waitForTimeout(1700);assert.equal(await page.locator('#live').evaluate(el=>el.playCalls),count);
    await page.locator('[data-live-state]').evaluate(el=>el.textContent='直播进行中');
    await page.waitForFunction(count=>document.querySelector('#live').playCalls>count,count,{timeout:4000});
  });
  await test('稳定性：题干过长不产生未处理异常，也不影响其他正常题',async()=>{
    const {page,errors}=await setup(program().replace('输出相反数。','长'.repeat(41000))+mount+choice(2,'正常题',['甲','乙']),{...aiSettings,specialCodeAI:true});
    await page.waitForFunction(()=>document.querySelector('input[name=q2][value=B]').checked,undefined,{timeout:6000});
    assert.deepEqual(errors,[]);
  });
  await test('稳定性：听力 source 是备选格式，只发送当前材料一次',async()=>{
    const body=choice(1,'听力材料',['甲','乙']).replace('<ul','<audio id="listen"><source src="/same.mp3" type="audio/mpeg"><source src="/same.ogg" type="audio/ogg"></audio><ul');
    const {page}=await setup(body,{...aiSettings},[],{}, {},{preserveSources:true,blobTypes:{'/same.mp3':'audio/mpeg','/same.ogg':'audio/mpeg'}});
    await page.waitForFunction(()=>document.querySelector('input[value=B]').checked,undefined,{timeout:6000});
    const payload=await page.evaluate(()=>window.aiRequests[0].payload.messages[1].content);
    assert.equal(payload.filter(item=>item.type==='input_audio').length,1);
    assert.equal(await page.evaluate(()=>window.blobRequests.length),1);
  });
  await test('稳定性：OCS jobid 完成状态只作用于匹配的 iframe 任务',async()=>{
    const body='<script>window.attachments=[{jobid:"done",isPassed:true},{property:{_jobid:"todo"},isPassed:false}];</script><div class="ans-job"><iframe id="done" data=\'{"jobid":"done"}\' src="/done.html"></iframe></div><div class="ans-job"><iframe id="todo" data=\'{"_jobid":"todo"}\' src="/todo.html"></iframe></div>';
    const {page,errors}=await setup(body,{autoAnswer:false},[],{}, {'/done.html':'<video id="media"></video>','/todo.html':'<video id="media"></video>'});
    await page.waitForFunction(()=>document.querySelector('#todo').contentDocument.querySelector('video').playCalls===1,undefined,{timeout:4000});
    assert.equal(await page.frameLocator('#done').locator('video').evaluate(el=>el.playCalls),0);
    await page.evaluate(()=>window.attachments[1].isPassed=true);
    await page.waitForFunction(()=>document.querySelector('#todo').contentDocument.querySelector('video').paused,undefined,{timeout:4000});
    assert.deepEqual(errors,[]);
  });
  await test('稳定性：Monaco 动态只读设置阻止旧响应写入模型',async()=>{
    const mount='<script>window.value="";window.readonly=false;const element=document.querySelector(".monaco-editor");const model={getValue:()=>window.value,getAlternativeVersionId:()=>1,getFullModelRange:()=>({}),pushEditOperations:(a,edits)=>{window.value=edits[0].text}};window.monaco={editor:{EditorOption:{readOnly:123},getEditors:()=>[{getDomNode:()=>element,getModel:()=>model,getOption:key=>key===123&&window.readonly}]}};</script>';
    const {page}=await setup(program().replace('<div class="CodeMirror"','<div class="monaco-editor"')+mount,{...aiSettings,specialCodeAI:true},[],{answer:draft,delay:1200});
    await page.waitForFunction(()=>window.aiRequests.length===1);
    await page.evaluate(()=>window.readonly=true);
    await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>window.value),'');
  });
};
