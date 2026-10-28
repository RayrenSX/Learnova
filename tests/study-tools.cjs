const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildSync}=require('esbuild');
const {chromium}=require('playwright');
const Tools=require('../src/study-tools.cjs');
const Dashboard=require('../src/course-dashboard.cjs');
const Export=require('../pintia/src/study-export.cjs');
const root=path.resolve(__dirname,'..');
const testRoot=path.join(root,'test-results','study-tools');fs.mkdirSync(testRoot,{recursive:true});
const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL '+name+': '+e.stack);}};
function unzipStored(buffer){
 const entries={};let offset=0;while(buffer.readUInt32LE(offset)===0x04034b50){assert.equal(buffer.readUInt16LE(offset+8),0);const size=buffer.readUInt32LE(offset+18),namesize=buffer.readUInt16LE(offset+26),extrasize=buffer.readUInt16LE(offset+28),name=buffer.subarray(offset+30,offset+30+namesize).toString();const start=offset+30+namesize+extrasize;entries[name]=buffer.subarray(start,start+size);offset=start+size;}
 assert.equal(buffer.readUInt32LE(offset),0x02014b50);return entries;
}
(async()=>{
 await check('Usage handles Chat/Responses fields, unknown values, failure and corrupt persisted rows without storing secrets',()=>{
   const values={};const store={get:(k,f)=>values[k]??f,set:(k,v)=>values[k]=v};
   Tools.recordUsage(store,'AI','model',{prompt_tokens:10,completion_tokens:4,total_tokens:14});
   Tools.recordUsage(store,'AI','model',{input_tokens:5,output_tokens:3});
   Tools.recordUsage(store,'AI','model',undefined,true);
   const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
   assert.deepEqual(values['learnova.usage.v1'][0],{date,service:'AI',model:'model',requests:3,failed:1,known:2,input:15,output:7,total:22});
   values['learnova.usage.v1']=[null,{},...values['learnova.usage.v1']];
   Tools.recordUsage(store,'AI','model',{prompt_tokens:-1,completion_tokens:3});assert.equal(values['learnova.usage.v1'].length,1);assert.equal(values['learnova.usage.v1'][0].known,2);
 });
 await check('Dashboard course normalization deduplicates classes; an ended activity is not marked submitted',()=>{
   const json={channelList:[{content:{course:{data:[{id:1,name:'课程'}]},clazz:{data:[{id:2}]},cpi:3}},{content:{course:{data:[{id:1}]},id:2}},{content:{}}]};
   const courses=Dashboard.coursesFrom(json);assert.equal(courses.length,1);
   const tasks=Dashboard.tasksFrom({data:{activeList:[{id:1,nameOne:'作业',activeType:47,status:2,endTime:1700000000},{id:2,name:'已交',status:1,isSubmit:true}]}},courses[0]);
   assert.equal(tasks[0].state,'已结束');assert.equal(tasks[1].state,'已完成');assert.equal(tasks[0].deadline,1700000000000);assert.match(tasks[0].url,/pageHeader=8/);
   assert.throws(()=>Dashboard.coursesFrom({status:false}),/格式/);
 });
 await check('Live activity types distinguish discussion, pick-student, voting and AI practice',()=>{
   const tasks=Dashboard.tasksFrom({data:{activeList:[{id:1,activeType:5},{id:2,activeType:11},{id:3,activeType:43},{id:4,activeType:77}]}},{id:'1',clazz:'2',name:'课程'});
   assert.deepEqual(tasks.map(t=>t.type),['主题讨论','选人','投票','AI实践']);
 });
 await check('Pintia set exporter uses only credentialed GETs, preserves raw Markdown and refuses missing exams or partial lists',async()=>{
   const calls=[],signal=new AbortController().signal;
   const read=async(url,options)=>{calls.push({url,options});const data=url.endsWith('/exams')?{exam:{id:'22'}}:url.endsWith('problem-summaries')?{summaries:{7:{}}}:{problemSetProblems:[{id:'3',label:'7-1',title:'代码题',content:'公式 $x^2$\n```c\nint main(){}\n```'}]};return {ok:true,json:async()=>data};};
   const items=await Export.exportProblemSet('11',signal,read);assert.equal(items.length,1);assert.ok(calls.every(c=>c.options.method==='GET'&&c.options.credentials==='same-origin'));assert.ok(!calls.some(c=>c.options.body));assert.match(Export.setMarkdown('题集',items),/公式 \$x\^2\$/);
   await assert.rejects(Export.exportProblemSet('11',signal,async()=>({ok:true,json:async()=>({exam:null})})),/已存在/);
   let i=0;await assert.rejects(Export.exportProblemSet('11',signal,async()=>({ok:true,json:async()=>++i===1?{exam:{id:22}}:i===2?{summaries:{7:1}}:{problemSetProblems:[],hasMore:true}})),/分页/);
   const cancel=new AbortController();cancel.abort();let sent=false;await assert.rejects(Export.exportProblemSet('11',cancel.signal,async()=>{sent=true;}),/取消/);assert.equal(sent,false);
   assert.ok(Export.codeFence('```\ncode').startsWith('````\n'));
 });
 let docx;
 await check('Generated DOCX is an actual OOXML ZIP with escaped text, image relationships, proportional dimensions and no-answer edition',async()=>{
   const png=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],{type:'image/png'});
   const items=[{title:'中文 <script> & 数学\x01',options:['A < B','C > D'],answer:'正确答案',userAnswer:'本人答案',analysis:'解析文本',images:[{url:'https://images.example/test.png',alt:'图一'}]}];
   docx=Buffer.from(await (await Tools.docx('试卷',items,true,async()=>({blob:png,width:800,height:200}))).arrayBuffer());
   fs.writeFileSync(path.join(testRoot,'with-answers.docx'),docx);const entries=unzipStored(docx);assert.ok(entries['[Content_Types].xml']);assert.ok(entries['word/media/image1.png']);
   const xml=entries['word/document.xml'].toString();assert.ok(xml.includes('&lt;script&gt; &amp;'));assert.ok(!xml.includes('\x01'));assert.ok(xml.includes('参考答案：正确答案'));assert.ok(xml.includes('我的作答：本人答案'));assert.match(xml,/<wp:extent cx="4572000" cy="1143000"/);
   const plain=Buffer.from(await (await Tools.docx('练习版',items,false)).arrayBuffer());fs.writeFileSync(path.join(testRoot,'practice.docx'),plain);const noAnswers=unzipStored(plain)['word/document.xml'].toString();assert.ok(!/正确答案|本人答案|解析文本/.test(noAnswers));assert.ok(noAnswers.includes('图片：图一'));
 });
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{
   const page=await browser.newPage({viewport:{width:1100,height:900}});
   await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html><body>fixture</body></html>'}));
   await page.goto('https://mooc1.chaoxing.com/work?workId=7');
   const utilities=buildSync({entryPoints:[path.join(root,'src/study-tools.cjs')],bundle:true,write:false,platform:'browser',format:'iife',globalName:'StudyTools'}).outputFiles[0].text;
   const dashboard=buildSync({entryPoints:[path.join(root,'src/course-dashboard.cjs')],bundle:true,write:false,platform:'browser',format:'iife',globalName:'CourseDashboard'}).outputFiles[0].text;
   const adapters=buildSync({entryPoints:[path.join(root,'src/course-platforms.cjs')],bundle:true,write:false,platform:'browser',format:'iife',globalName:'Platforms'}).outputFiles[0].text;
   await page.addScriptTag({content:utilities+'\n'+dashboard+'\n'+adapters});
   await check('Review-page extraction separates reference/my answers, keeps images and strips answers in practice Markdown',async()=>{
     const data=await page.evaluate(()=>{document.body.innerHTML='<div class="TiMu"><div class="questionLi" data="12"><h3 class="mark_name">1. 图形题<img src="/diagram.png" alt="题图"></h3><ul class="mark_letter"><li>A. 甲</li><li>B. 乙</li></ul><div class="mark_answer"><span class="colorGreen">B</span><span class="colorDeep">A</span></div><div class="analysisDiv">完整解析</div></div></div>';
       document.querySelector('.analysisDiv').insertAdjacentHTML('beforeend','<img src="/answer-diagram.png">');const items=StudyTools.questions(document);return {items,practice:StudyTools.markdown('练习',items,false)};});
     assert.equal(data.items.length,1);assert.equal(data.items[0].answer,'B');assert.equal(data.items[0].userAnswer,'A');assert.equal(data.items[0].images[0].url,'https://mooc1.chaoxing.com/diagram.png');assert.equal(data.items[0].answerImages.length,1);assert.ok(!data.practice.includes('完整解析'));assert.ok(!data.practice.includes('参考答案'));assert.ok(!data.practice.includes('answer-diagram'));
   });
   await check('Live chapter quiz exports ARIA and hidden-field answers without duplicate option labels',async()=>{
     const data=await page.evaluate(()=>{document.body.innerHTML='<div class="TiMu"><div class="Zy_TItle">章节单选</div><ul class="Zy_ulTop"><li role="radio"><label class="before">A</label><a class="after">第一项</a></li><li role="radio" aria-checked="true"><label class="before">B</label><a class="after">第二项</a></li></ul><input type="hidden" name="answer123" value="B"><input type="hidden" name="answertype123" value="0"></div><div class="TiMu"><h3>判断题</h3><ul class="Zy_ulTop"><li>A. 对</li><li>B. 错</li></ul><input type="hidden" name="answer456" value="false"></div>';
       const items=StudyTools.questions(document);return {items,withAnswers:StudyTools.markdown('章节',items),practice:StudyTools.markdown('章节',items,false)};});
     assert.deepEqual(data.items[0].options,['第一项','第二项']);assert.equal(data.items[0].userAnswer,'B');assert.equal(data.items[0].id,'123');assert.equal(data.items[1].id,'456');assert.equal(data.items[1].userAnswer,'false');assert.deepEqual(data.items[1].options,['对','错']);assert.match(data.withAnswers,/我的作答\n\nB/);assert.ok(!/我的作答|false/.test(data.practice));assert.ok(!data.withAnswers.includes('A. A'));
   });
   await check('Chapter export uses answer field identities and visible question counts when data stores question types',async()=>{
     const data=await page.evaluate(async()=>{const doc=new DOMParser().parseFromString('<input id="totalQuestionNum" value="encrypted-count"><p>题量: 2 满分: 100.0</p><div class="TiMu" data="0"><h3>第一题</h3><input type="hidden" name="answer123" value="A"></div><div class="TiMu" data="0"><h3>第二题</h3><input type="hidden" name="answer456" value="B"></div>','text/html');const base=doc.createElement('base');base.href='https://mooc1.chaoxing.com/work?knowledgeid=7';doc.head.append(base);const result=await StudyTools.collectDocument(doc,new AbortController().signal);doc.body.insertAdjacentHTML('beforeend','<p>题量: 3 满分: 100.0</p>');let conflict='';try{StudyTools.documentCount(doc);}catch(e){conflict=e.message;}return {result,conflict};});
     assert.equal(data.result.complete,true);assert.equal(data.result.expected,2);assert.deepEqual(data.result.items.map(item=>item.id),['123','456']);assert.match(data.conflict,/冲突/);
   });
   await check('Full document export follows read-only same-document pagination, verifies counts, rejects missing pages and cancels',async()=>{
     const result=await page.evaluate(async()=>{
       const doc=new DOMParser().parseFromString('<input id="totalQuestionNum" value="2"><div class="questionLi" data="q1"><h3>第一页</h3></div><div class="pagination"><a href="?workId=7&page=2">2</a><a href="https://other.example/work?workId=7">外部</a></div>','text/html');const base=doc.createElement('base');base.href='https://mooc1.chaoxing.com/work?workId=7';doc.head.append(base);
       const calls=[];const read=async(url,options)=>{calls.push({url,method:options.method});return {ok:true,text:async()=>'<input id="totalQuestionNum" value="2"><div class="questionLi" data="q2"><h3>第二页</h3></div>'};};
       const all=await StudyTools.collectDocument(doc,new AbortController().signal,read);
       doc.querySelector('.pagination').remove();let missing;try{await StudyTools.collectDocument(doc,new AbortController().signal,read);}catch(e){missing=e.message;}
       const cancelled=new AbortController();cancelled.abort();let cancelledMessage;try{await StudyTools.collectDocument(doc,cancelled.signal,read);}catch(e){cancelledMessage=e.message;}
       return {all,calls,missing,cancelledMessage};
     });
     assert.equal(result.all.items.length,2);assert.equal(result.all.complete,true);assert.equal(result.calls.length,1);assert.equal(result.calls[0].method,'GET');assert.match(result.missing,/1\/2/);assert.match(result.cancelledMessage,/取消/);
   });
   await check('Original Chaoxing homework/exam row adapters keep only safe links, parse last deadline and preserve unknown state',async()=>{
     const tasks=await page.evaluate(()=>{
       document.body.innerHTML='<ul class="nav"><li data="https://mooc1-api.chaoxing.com/work/edit?courseId=1&clazzId=2"><div role="option"><p>作业一</p><span>未提交</span><span>课程甲</span><span class="fr">2026-10-01 09:00 至 2026-10-31 23:59</span></div></li></ul><ul class="ks_list"><li data="/exam/open?examId=8"><dl><dt>期末</dt><dd>2026-11-01 12:00</dd></dl><span class="ks_state">待批阅</span></li></ul><a href="javascript:alert(1)">work</a>';
       return CourseDashboard.tasksFromDOM(document);
     });
     assert.equal(tasks.length,2);assert.equal(tasks[0].title,'作业一');assert.equal(tasks[0].course,'课程甲');assert.equal(tasks[0].state,'待核对');assert.equal(tasks[1].state,'已完成');assert.equal(tasks[1].type,'考试');assert.ok(tasks[0].deadline);
   });
   await check('Live all-course homework rows preserve ARIA-hidden content and derive approximate remaining deadlines',async()=>{
     const tasks=await page.evaluate(()=>{
       document.body.innerHTML='<ul><li onclick="goTask(this)" data="https://mooc1-api.chaoxing.com/mooc-ans/android/mtaskmsgspecial?courseId=1&clazzId=2&type=work"><div role="option"><p aria-hidden="true">实验报告03</p><span class="status" aria-hidden="true">未提交</span><span aria-hidden="true">《程序设计基础...》</span><span class="fr" aria-hidden="true">剩余135小时26分钟</span><span aria-label="作业名称实验报告03"></span></div></li></ul>';
       return CourseDashboard.tasksFromDOM(document,1700000000000);
     });
     assert.equal(tasks.length,1);assert.equal(tasks[0].title,'实验报告03');assert.equal(tasks[0].course,'《程序设计基础...》');assert.equal(tasks[0].state,'待核对');assert.equal(tasks[0].deadline,1700000000000+(135*60+26)*60000);assert.equal(tasks[0].deadlineApproximate,true);
   });
   await check('DOCX XML is well-formed and media relationships refer to included files',async()=>{
     const entries=unzipStored(docx),xmls=Object.entries(entries).filter(([name])=>/\.xml$|\.rels$/.test(name)).map(([name,body])=>({name,text:body.toString()}));
     const invalid=await page.evaluate(xmls=>xmls.filter(({text})=>new DOMParser().parseFromString(text,'application/xml').querySelector('parsererror')).map(x=>x.name),xmls);assert.deepEqual(invalid,[]);
     assert.ok(entries['word/_rels/document.xml.rels'].toString().includes('media/image1.png'));
   });
   await check('Three platform adapters parse real selector families and apply model-native values without submission',async()=>{
     const states=await page.evaluate(async()=>{
       const fixtures=[
         ['study.zhihuishu.com','<div class="examPaper_subject"><div class="subject_describe"><div>判断图形</div></div><div class="subject_node"><label class="nodeLab"><input type="radio" name="z">甲</label><label class="nodeLab"><input type="radio" name="z">乙</label></div></div>'],
         ['zjy2.icve.com.cn','<div class="subjectDet"><h3>多选题</h3><div class="optionList"><div><label><input type="checkbox">甲</label></div><div><label><input type="checkbox">乙</label></div></div></div>'],
         ['www.icourse163.org','<div class="u-questionItem"><div class="j-title"><div class="j-richTxt">填空题</div></div><div class="inputArea"><textarea></textarea></div></div>']
       ];const result=[];
       for(const [host,html]of fixtures){document.body.innerHTML=html;const adapter=Platforms.adapterFor(host),q=Platforms.parse(document.querySelector(adapter.root),adapter);const answers=q.type==='multiple'?['A','B']:q.options.length?['B']:['完整答案'];await Platforms.fill(q,answers,()=>{if(!Platforms.freshQuestion(q,adapter))throw new Error('stale');});result.push({type:q.type,selected:q.options.filter(o=>o.input?.checked).length,text:q.editors[0]?.value});}
       return result;
     });
     assert.equal(states[0].selected,1);assert.equal(states[1].selected,2);assert.equal(states[2].text,'完整答案');
   });
   await check('Platform answer guards reject same-text editor replacement, disabled targets, stale image and ambiguous text',async()=>{
     const data=await page.evaluate(()=>{document.body.innerHTML='<div class="u-questionItem"><div class="j-title"><div class="j-richTxt">问题<img alt="图" src="/one.png"></div></div><ul class="choices"><li><label><input type="radio" disabled>重复</label></li><li><label><input type="radio">重复</label></li></ul></div>';
       const adapter=Platforms.adapterFor('www.icourse163.org'),q=Platforms.parse(document.querySelector(adapter.root),adapter);let disabled=false,ambiguous=false;try{Platforms.resolveAnswers(q,['A']);}catch{disabled=true;}try{Platforms.resolveAnswers(q,['重复']);}catch{ambiguous=true;}
       const old=q.options[1].input;q.options[1].element.querySelector('label').innerHTML='<input type="radio">重复';const replacementFresh=Platforms.freshQuestion(q,adapter);old.remove();document.querySelector('img').src='/two.png';return {disabled,ambiguous,replacementFresh,imageFresh:Platforms.freshQuestion(q,adapter)};});
     assert.deepEqual(data,{disabled:true,ambiguous:true,replacementFresh:false,imageFresh:false});
   });
   await check('Combined bundle launches all three platform workbenches and query/apply stays explicit',async()=>{
     const combined=fs.readFileSync(path.join(root,'学习助手完整版.user.js'),'utf8');
     for(const [host,fixture]of [
       ['study.zhihuishu.com','<div class="examPaper_subject"><div class="subject_describe">平台题</div><div class="subject_node"><label class="nodeLab"><input type="radio" name="answer">甲</label><label class="nodeLab"><input type="radio" name="answer">乙</label></div></div>'],
       ['zjy2.icve.com.cn','<div class="subjectDet"><h3>平台题</h3><div class="optionList"><div><input type="radio" name="answer">甲</div><div><input type="radio" name="answer">乙</div></div></div>'],
       ['www.icourse163.org','<div class="u-questionItem"><div class="j-title"><div class="j-richTxt">平台题</div></div><ul class="choices"><li><input type="radio" name="answer">甲</li><li><input type="radio" name="answer">乙</li></ul></div>']
     ]) {
       await page.goto('https://'+host+'/course');await page.evaluate(fixture=>{
         document.body.innerHTML=fixture;window.testStores={'learnova.course-platforms.v1':{apiUrl:'https://ai.example/v1',apiModel:'test-model',apiKey:'not-a-real-key',keyOrigin:'https://ai.example'}};window.platformRequests=[];
         window.GM_getValue=(k,f)=>window.testStores[k]??f;window.GM_setValue=(k,v)=>window.testStores[k]=v;window.GM_registerMenuCommand=()=>{};
         window.GM_xmlhttpRequest=options=>{const timer=setTimeout(()=>{
           if(options.url.includes('github.com')){options.onload({status:200,responseText:'// @version 0.0.0'});return;}
           window.platformRequests.push(options.url);options.onload({status:200,finalUrl:options.url,responseText:JSON.stringify({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:'{"answers":["B"],"confidence":0.99}'}}]})});
         },40);return {abort(){clearTimeout(timer);options.onabort?.();}};};
       },fixture);
       await page.addScriptTag({content:combined});const ui=page.locator('#learnova-course-workbench');await ui.locator('#query').click();await ui.locator('#status').filter({hasText:'答案已展示'}).waitFor();assert.equal(await page.locator('input[name=answer]:checked').count(),0);await ui.locator('#apply').click();await ui.locator('#status').filter({hasText:'已填写并回读'}).waitFor();assert.equal(await page.locator('input[name=answer]:checked').count(),1);assert.equal(await page.locator('input[name=answer]').nth(1).isChecked(),true);
       assert.equal(await page.evaluate(()=>window.platformRequests.length),1);assert.ok((await ui.locator('#usage').textContent()).includes('15'));
     }
   });
   await check('Platform vision sends bounded inline image data and keeps the narrow workbench inside the viewport',async()=>{
     await page.evaluate(async()=>{
       const canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;canvas.getContext('2d').fillRect(0,0,20,10);const img=document.createElement('img');img.alt='图形';img.src=canvas.toDataURL();document.querySelector('.j-richTxt').append(img);await img.decode();
       const original=window.GM_xmlhttpRequest;window.GM_xmlhttpRequest=options=>{if(options.data)window.lastVisionPayload=JSON.parse(options.data);return original(options);};
     });
     const ui=page.locator('#learnova-course-workbench');await ui.locator('#refresh').click();await ui.locator('#query').click();await ui.locator('#status').filter({hasText:'答案已展示'}).waitFor();
     const image=await page.evaluate(()=>window.lastVisionPayload.messages[1].content.find(p=>p.type==='image_url'));assert.match(image.image_url.url,/^data:image\/png;base64,/);
     await page.setViewportSize({width:390,height:844});const box=await ui.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await page.screenshot({path:path.join(testRoot,'platform-narrow.png')});
   });
 }finally{await browser.close();}
 fs.writeFileSync(path.join(testRoot,'report.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
 console.log(`${results.filter(x=>x.passed).length}/${results.length} study tools checks passed`);if(results.some(x=>!x.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
