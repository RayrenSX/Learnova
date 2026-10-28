const {safeURL,textOf}=require('./study-tools.cjs');
const hostAllowed=url=>/(^|\.)chaoxing\.com$/.test(url.hostname);
function readData(url,signal,request=globalThis.GM_xmlhttpRequest,asJSON=true) {
  if(!safeURL(url,undefined,hostAllowed))return Promise.reject(new Error('课程接口地址无效'));
  return new Promise((resolve,reject)=>{
    let handle,done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const abort=()=>{finish(new Error('读取已取消'));handle?.abort();};
    const timer=setTimeout(()=>{finish(new Error('课程读取超时'));handle?.abort();},25000);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    try {handle=request({method:'GET',url,timeout:20000,onload:r=>{
      try {if(r.status!==200)throw new Error(`课程接口 HTTP ${r.status}`);
        if(r.finalUrl&&new URL(r.finalUrl).origin!==new URL(url).origin)throw new Error('课程接口跳转异常');
        finish(null,asJSON?JSON.parse(r.responseText):r.responseText);}catch(e){finish(e);}
    },onerror:()=>finish(new Error('课程读取失败')),ontimeout:()=>finish(new Error('课程读取超时')),onabort:abort});}catch(e){finish(e);}
  });
}
const readJSON=(url,signal,request)=>readData(url,signal,request,true);
function coursesFrom(json) {
  if(!Array.isArray(json?.channelList))throw new Error('课程列表格式不支持，请先登录学习通');
  const courses=[];
  for(const row of json.channelList){const c=row.content,course=c?.course?.data?.[0],clazz=c?.clazz?.data?.[0]?.id||c?.id||row.key;
    if(course&&/^\d+$/.test(String(course.id))&&/^\d+$/.test(String(clazz)))courses.push({id:String(course.id),clazz:String(clazz),name:String(course.name||'未命名课程'),cpi:String(c.cpi||'')});}
  return [...new Map(courses.map(c=>[`${c.id}:${c.clazz}`,c])).values()];
}
function dateValue(raw) {if(raw===undefined||raw===null||raw==='')return null;const n=Number(raw);const at=Number.isFinite(n)?(n<1e12?n*1000:n):Date.parse(raw);return Number.isFinite(at)?at:null;}
function tasksFrom(json,course) {
  const list=json?.data?.activeList||json?.activeList||(Array.isArray(json?.data)?json.data:Array.isArray(json)?json:null);
  if(!Array.isArray(list))throw new Error('任务列表格式不支持');
  return list.map((item,i)=>{
    const type=({2:'签到',4:'抢答',5:'主题讨论',11:'选人',14:'问卷',17:'直播',23:'随堂练习',35:'分组任务',42:'随堂练习',43:'投票',47:'作业',64:'笔记',77:'AI实践'})[item.activeType??item.type]||'课程活动';
    const url=new URL('https://mooc1.chaoxing.com/visit/stucoursemiddle');url.search=new URLSearchParams({ismooc2:'1',courseid:course.id,clazzid:course.clazz,pageHeader:type==='作业'?'8':'0'}).toString();
    return {id:`${course.id}:${course.clazz}:${item.id||item.activeId||i}`,course:course.name,title:String(item.nameOne||item.name||item.title||type),type,
      // Ended is not proof of submission or completion.
      state:item.isSubmit===true||item.isCompleted===true?'已完成':Number(item.status)===2?'已结束':Number(item.status)===1?'进行中':'未开始',deadline:dateValue(item.endTime),url:url.href};
  });
}
function tasksFromDOM(doc,readAt=Date.now()) {
  const selectors='a[href*="work"],a[href*="exam"],a[href*="active"]';
  return [...doc.querySelectorAll(selectors+',ul.nav > li[data],ul.ks_list > li[data],li[data][onclick*="goTask"],table.dataTable tr.dataTr')].flatMap((link,i)=>{
    const row=link.closest('li,tr,.work-item,.exam-item,.task-item')||link;
    const action=link.querySelector('a[onclick]'),literal=/\bgo\(['"]([^'"]+)['"]\)/.exec(action?.getAttribute('onclick')||'')?.[1];
    const url=safeURL(link.getAttribute('href')||link.getAttribute('data')||literal,doc.baseURI,hostAllowed);
    const title=link.getAttribute('title')||textOf(row.querySelector('[role=option] p,dt,td:nth-child(2)'))||textOf(link);
    if(!url||!title)return [];
    const dates=row.textContent.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/g)||[];
    let deadline=dateValue(row.dataset.deadline||row.querySelector('time')?.dateTime||dates.at(-1));
    const remaining=row.textContent.match(/剩余\s*(?:(\d+)天)?\s*(?:(\d+)小时)?\s*(?:(\d+)分钟)?/);
    const approximate=deadline===null&&remaining&&remaining.slice(1).some(value=>value!==undefined);
    if(approximate)deadline=readAt+((Number(remaining[1]||0)*24+Number(remaining[2]||0))*60+Number(remaining[3]||0))*60000;
    return [{id:url,course:row.dataset.courseName||row.querySelector('[role=option] span:nth-of-type(2)')?.textContent||'全部课程',title,type:/exam/.test(url)||row.matches('tr.dataTr')?'考试':/work/.test(url)?'作业':'课程活动',
      state:/未提交|未完成|未批阅/.test(row.textContent)?'待核对':/已提交|已完成|已批阅|待批阅/.test(row.textContent)?'已完成':/已结束|已截止/.test(row.textContent)?'已结束':'待核对',deadline,...(approximate?{deadlineApproximate:true}:{}),url}];
  });
}
async function loadDashboard(signal,request,onProgress=()=>{}) {
  const courses=coursesFrom(await readJSON('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&mcode=',signal,request)),tasks=[],errors=[];
  for(const [i,course] of courses.entries()){
    if(signal.aborted)throw new Error('读取已取消');onProgress(`读取 ${i+1}/${courses.length}：${course.name}`);
    const url=new URL('https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist');url.search=new URLSearchParams({fid:'0',courseId:course.id,classId:course.clazz,showNotStartedActive:'1'}).toString();
    try {tasks.push(...tasksFrom(await readJSON(url.href,signal,request),course));}catch(e){if(signal.aborted)throw e;errors.push(`${course.name}：${e.message}`);}
  }
  for(const [name,url] of [
    ['全课程作业','https://mooc1-api.chaoxing.com/work/stu-work'],
    ['全课程考试','https://mooc1-api.chaoxing.com/exam-ans/exam/phone/examcode'],
    ['新版考试列表','https://mooc1.chaoxing.com/exam-ans/exam/test/examcode/examlist?edition=1&nohead=0&fid=']]) {
    if(signal.aborted)throw new Error('读取已取消');onProgress('读取 '+name);
    try{const html=await readData(url,signal,request,false);const doc=new DOMParser().parseFromString(html,'text/html');const base=doc.createElement('base');base.href=url;doc.head.prepend(base);
      if(doc.querySelector('input[type=password]')||/登录后查看/.test(doc.body.textContent))throw new Error('需要登录');
      const entries=tasksFromDOM(doc);tasks.push(...entries);
      if(!entries.length&&!/暂无|没有.*(?:作业|考试)|空空如也/.test(doc.body.textContent))errors.push(name+'：未识别列表，请打开原页面核对');
    }catch(e){if(signal.aborted)throw e;errors.push(`${name}：${e.message}`);}
  }
  return {courses,tasks:[...new Map(tasks.map(t=>[t.id,t])).values()],errors,at:Date.now()};
}
module.exports={readJSON,readData,coursesFrom,tasksFrom,dateValue,tasksFromDOM,loadDashboard};
