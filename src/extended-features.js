// Learnova service presets, chat, course scheduling and exam submission.
// Independently implemented against public page controls and service protocols.
  const COURSE_QUEUE_KEY = 'cxHelper.courseQueue.v1';
  function spacePage() {
    if(courseURL(location.href))return false;
    const path=location.pathname;
    return /^(?:i|i\.mooc)\.chaoxing\.com$/i.test(location.hostname)&&/^\/(?:$|base\/?$|space(?:\/|$))/.test(path)
      || /(^|\.)chaoxing\.com$/i.test(location.hostname)&&/^\/(?:mooc-ans\/)?visit\/(?:courses|interaction)(?:\/|$)/.test(path);
  }
  const queueOwner = typeof crypto.randomUUID==='function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  let queueBusy = null, queueCompletion = '', queueCompletionAt = 0, queueWasOwned = false, queueFollower = false, queueClaimTimer;
  let queueReadBusy = false, queueFeedback = '';
  let extendedShadow, chatController, chatGeneration = 0, queueRenderSignature='';
  const chatMessages = [];
  const examAttempts = new WeakMap(), examLedgers = new Map(), examPreviewScopes = new WeakMap();
  function queueState() {
    const value = readStore(COURSE_QUEUE_KEY, {});
    if(!value || !Array.isArray(value.items))return {items:[],status:'paused',owner:'',lease:0};
    const seen=new Set(),items=value.items.slice(0,100).flatMap(item=>{
      const parsed=item && courseURL(item.url);if(!parsed||seen.has(parsed.id))return [];seen.add(parsed.id);
      return [{...parsed,name:String(item.name||`课程 ${parsed.id}`).slice(0,160),selected:item.selected!==false,done:item.done===true}];
    });
    const status=['running','paused','complete'].includes(value.status)?value.status:'paused';
    return {...value,items,status,owner:typeof value.owner==='string'?value.owner:'',lease:Number.isFinite(value.lease)?value.lease:0,
      current:typeof value.current==='string'?value.current:'',message:typeof value.message==='string'?value.message:''};
  }
  function courseURL(raw, base = location.href) {
    try {
      const url = new URL(raw,base);
      if (!/^https?:$/.test(url.protocol) || !/(^|\.)chaoxing\.com$/i.test(url.hostname) || url.username || url.password) return null;
      if(/^\/(?:mooc2?-ans\/)?mycourse\/transfer\/?$/.test(url.pathname)) {
        const refer=url.searchParams.get('refer');if(!refer || /\/transfer(?:\?|$)/.test(refer))return null;const target=courseURL(refer,url.origin);return target?{...target,url:url.href}:null;
      }
      if (!/^\/(?:(?:mooc2?-ans\/)?mycourse\/(?:stu|studentcourse|studentstudy)|(?:mooc2?-ans\/)?visit\/stucoursemiddle|fanyav3\/stu)\/?$/.test(url.pathname)) return null;
      const params=new Map([...url.searchParams].map(([key,value])=>[key.toLowerCase(),value]));
      const course = params.get('courseid');
      const clazz = params.get('clazzid') || params.get('classid');
      if (!course || !clazz || !/^\d+$/.test(course) || !/^\d+$/.test(clazz)) return null;
      url.searchParams.set('courseid',course);url.searchParams.set('clazzid',clazz);
      return {id:`${course}:${clazz}`,url:url.href};
    } catch { return null; }
  }
  function courseContext(raw,doc) {
    const params=new Map([...new URL(raw).searchParams].map(([key,value])=>[key.toLowerCase(),value]));
    const read=(...names)=>names.map(name=>params.get(name.toLowerCase()) || doc?.getElementById(name)?.value || doc?.querySelector(`input[name="${name}"]`)?.value).find(Boolean)||'';
    return {course:read('courseid','courseId'),clazz:read('clazzid','clazzId','classid','classId'),cpi:read('cpi')};
  }
  function currentQueueCourse() {
    const parsed=courseURL(location.href);if(parsed)return parsed;
    const context=courseContext(location.href,document),url=new URL(location.href);if(!context.course||!context.clazz)return null;
    url.searchParams.set('courseid',context.course);url.searchParams.set('clazzid',context.clazz);return courseURL(url.href);
  }
  function queueSave(queue) { queue.updatedAt = Date.now(); writeStore(COURSE_QUEUE_KEY,queue); renderCourseQueue(); }
  function resetQueueProgress() {queueCompletion='';queueCompletionAt=0;queueBusy=null;clearTimeout(queueClaimTimer);}
  function queuePause(message = '课程队列已暂停') {
    resetQueueProgress();queueFollower=false;
    const queue = queueState(); queue.status='paused'; queue.owner=''; queue.lease=0; queue.message=message; queueSave(queue);
  }
  function pauseOwnedQueue() {const queue=queueState();if(queue.status==='running'&&queue.owner===queueOwner)queuePause('学习已暂停，点击继续恢复队列');}
  function queueMayStudy() {
    const queue=queueState(),current=currentQueueCourse();
    if(queue.status!=='running'||!current||current.id!==queue.current||queue.owner===queueOwner)return true;
    if(queue.lease<=Date.now()){
      queue.owner=queueOwner;queue.lease=Date.now()+15000;queueWasOwned=true;queueSave(queue);
      clearTimeout(queueClaimTimer);queueClaimTimer=setTimeout(()=>{
        const fresh=queueState();if(fresh.status==='running'&&fresh.owner===queueOwner&&fresh.current===current.id&&settings.enabled&&!state.disposed){queueFollower=false;start();}
      },180);
    }
    queueFollower=true;state.running=false;syncBackground();resetContext();
    once('queue-follower','课程队列正在另一页面运行，本页等待其释放运行权');renderStatus();return false;
  }
  function savedExamLedger(id) {
    try { const saved=JSON.parse(sessionStorage.getItem('cxHelper.examLedger:'+id)||'null');
      return saved && saved.scope===cacheScope() && saved.at<=Date.now() && Date.now()-saved.at<2*60*60*1000 && Array.isArray(saved.entries)&&saved.entries.length<=2000?new Map(saved.entries):new Map();
    } catch { return new Map(); }
  }
  function saveExamLedger(id,ledger) {
    try { sessionStorage.setItem('cxHelper.examLedger:'+id,JSON.stringify({scope:cacheScope(),at:Date.now(),entries:[...ledger]})); } catch {}
  }
  function renderCourseQueue() {
    if (!extendedShadow) return;
    const get=id=>extendedShadow.getElementById(id),queue=queueState(),list=get('queueItems'),running=queue.status==='running';
    const selected=queue.items.filter(item=>item.selected),pending=selected.filter(item=>!item.done),completed=selected.length-pending.length;
    const remote=running&&queue.owner!==queueOwner&&queue.lease>Date.now();
    const query=get('queueSearch').value.trim().toLowerCase(),filter=get('queueFilter').value;
    const signature=JSON.stringify([queue.status,queue.message,queue.current,queue.items,remote,Boolean(queueBusy),queueReadBusy,queueFeedback,query,filter]);if(signature===queueRenderSignature)return;queueRenderSignature=signature;
    get('queueStatus').textContent=queueFeedback || (remote?'队列正在其他页面运行，可在此暂停队列。':queueBusy?'正在打开下一门课程…':queue.message || (queue.items.length?'勾选需要学习的课程，然后开始队列。':'读取账号课程，或展开下方“手动添加课程”。'));
    get('queueState').textContent=remote?'其他页面运行':({running:'运行中',paused:'已暂停',complete:'已完成'})[queue.status];
    get('queueSummary').textContent=`已选 ${selected.length} / ${queue.items.length} 门 · 已完成 ${completed} 门 · 待学习 ${pending.length} 门`;
    get('queueProgress').max=Math.max(1,selected.length);get('queueProgress').value=completed;
    const current=queue.items.find(item=>item.id===queue.current&&item.selected&&!item.done);
    get('queueCurrent').textContent=current?`${running?'当前学习':'上次学习'}：${current.name}`:'';get('queueCurrent').hidden=!current;
    get('queueStart').textContent=running?'队列运行中':current?'继续队列':'开始队列';get('queueStart').disabled=running||queueReadBusy||!pending.length;
    get('queuePause').disabled=!running&&!queueReadBusy;
    get('queueRead').hidden=!spacePage();get('queueRead').disabled=!spacePage()||running||queueReadBusy;get('queueRead').textContent=queueReadBusy?'正在读取…':'读取空间课程';
    for(const id of ['queueSelectAll','queueSelectNone','queueAdd','queueReset','queueClear'])get(id).disabled=running||queueReadBusy||(['queueReset','queueClear','queueSelectAll','queueSelectNone'].includes(id)&&!queue.items.length);
    get('queueInput').disabled=running||queueReadBusy;get('queueEditHint').hidden=!running;
    const focused=extendedShadow.activeElement?.dataset.queueFocus;
    list.replaceChildren();
    let visibleCount=0,position=0;
    queue.items.forEach((item,index)=>{
      if(item.selected&&!item.done)position++;
      if(query&&!item.name.toLowerCase().includes(query))return;
      if(filter==='selected'&&!item.selected || filter==='pending'&&(!item.selected||item.done) || filter==='done'&&!item.done)return;
      visibleCount++;
      const row=document.createElement('div');row.className='queue-row';row.dataset.courseId=item.id;row.dataset.current=String(item.id===queue.current&&item.selected&&!item.done);
      const label=document.createElement('label'),check=document.createElement('input'),body=document.createElement('span'),name=document.createElement('span'),meta=document.createElement('small');
      label.className='queue-course';check.className='queue-check';check.type='checkbox';check.checked=item.selected;check.disabled=running||queueReadBusy;check.dataset.queueFocus=item.id+':select';check.setAttribute('aria-label',`选择课程：${item.name}`);
      name.className='queue-name';name.textContent=item.name;
      meta.textContent=item.done?'已完成':!item.selected?'未选择':item.id===queue.current?(running?'正在学习':'上次学习'):`第 ${position} 门待学习`;
      body.className='queue-course-text';body.append(name,meta);label.append(check,body);row.append(label);
      check.onchange=event=>{if(!event.isTrusted){queueRenderSignature='';renderCourseQueue();return;}editCourseQueue(fresh=>{const entry=fresh.items.find(entry=>entry.id===item.id);if(entry)entry.selected=check.checked;},'已更新所选课程');};
      const actions=document.createElement('div');actions.className='queue-row-actions';row.append(actions);
      for (const [text,action] of [['↑','up'],['↓','down'],['移除','remove']]) {
        const button=document.createElement('button');button.textContent=text;button.className='small';button.title=`${({up:'上移',down:'下移',remove:'移除'})[action]}：${item.name}`;button.dataset.queueFocus=item.id+':'+action;
        button.disabled=running||queueReadBusy||action==='up'&&index===0||action==='down'&&index===queue.items.length-1;
        button.onclick=event=>{if(!trustedClick(event,button))return;editCourseQueue(fresh=>{const at=fresh.items.findIndex(entry=>entry.id===item.id);if(at<0)return;
          if(action==='remove')fresh.items.splice(at,1);else {const next=at+(action==='up'?-1:1);if(next<0||next>=fresh.items.length)return;[fresh.items[at],fresh.items[next]]=[fresh.items[next],fresh.items[at]];}
        },action==='remove'?'已移除课程':'已调整学习顺序');};actions.append(button);
      }
      list.append(row);
    });
    if(!visibleCount){const empty=document.createElement('p');empty.className='queue-empty';empty.textContent=queue.items.length?'没有符合筛选条件的课程':'还没有课程，先读取账号课程或手动添加。';list.append(empty);}
    if(focused)[...list.querySelectorAll('[data-queue-focus]')].find(node=>node.dataset.queueFocus===focused)?.focus({preventScroll:true});
  }
  function editCourseQueue(edit,message) {
    const queue=queueState();if(queue.status==='running'||queueReadBusy)return;
    edit(queue);if(!queue.items.some(item=>item.id===queue.current&&item.selected&&!item.done))queue.current='';
    queue.status='paused';queue.owner='';queue.lease=0;queue.message=message;queueFeedback='';resetQueueProgress();queueSave(queue);
  }
  function addQueueCourses(entries,{selectNew=true}={}) {
    const queue=queueState(); if(queue.status==='running')throw new Error('请先暂停队列再编辑');
    let added=0,updated=0;const seen=new Set();
    for(const entry of entries) {
      const parsed=courseURL(entry.url);if(!parsed||seen.has(parsed.id))continue;seen.add(parsed.id);
      const existing=queue.items.find(item=>item.id===parsed.id),name=String(entry.name || '').trim().slice(0,160);
      if(existing){if(name&&name!==existing.name){existing.name=name;updated++;}continue;}
      if(queue.items.length>=100)continue;
      queue.items.push({...parsed,name:name||`课程 ${parsed.id}`,selected:selectNew,done:false});added++;
    }
    queueFeedback='';queue.message=`新增 ${added} 门，更新 ${updated} 门，共 ${queue.items.length} 门${selectNew?'':'；勾选需要学习的课程'}`;queue.status='paused';queueSave(queue);
  }
  function readCourseLinks(doc, base = doc.URL || location.href) {
    const result=[];
    for(const link of doc.querySelectorAll('a[href],a[onclick]')) {
      const raw=link.getAttribute('href'),literal=/(?:location(?:\.href)?\s*=\s*|window\.open\(\s*)['"]([^'"]+)['"]/.exec(link.getAttribute('onclick')||'')?.[1];
      const parsed=courseURL(raw,base)||courseURL(literal,base);if(!parsed)continue;
      const card=link.closest('.course, .course-item, .courseItem, li') || link;
      result.push({...parsed,name:link.getAttribute('title') || card.querySelector('h3, .course-name, .courseName')?.textContent.trim() || link.textContent.trim()});
    }
    // Chaoxing course cards also expose their identifiers independently of onclick code.
    for(const card of doc.querySelectorAll('[courseid][clazzid], [data-courseid][data-clazzid]')) {
      const course=card.getAttribute('courseid') || card.dataset.courseid, clazz=card.getAttribute('clazzid') || card.dataset.clazzid;
      const origin=/^mooc[\w-]*\.chaoxing\.com$/i.test(new URL(base).hostname)?new URL(base).origin:'https://mooc1.chaoxing.com';
      const url=new URL('/mycourse/stu',origin);url.searchParams.set('courseid',course);url.searchParams.set('clazzid',clazz);url.searchParams.set('ismooc2','1');
      const cpi=card.getAttribute('cpi') || card.dataset.cpi || card.getAttribute('personid');if(cpi)url.searchParams.set('cpi',cpi);
      result.push({url:url.href,name:card.querySelector('h3, .course-name')?.textContent.trim() || card.getAttribute('title')});
    }
    const unique=new Map();
    for(const entry of result){const parsed=courseURL(entry.url,base);if(!parsed)continue;const old=unique.get(parsed.id);if(!old||!old.name&&entry.name)unique.set(parsed.id,{...entry,...parsed});}
    return [...unique.values()];
  }
  async function loadQueueCourses(signal) {
    if(!spacePage())throw new Error('请回到学习通空间页读取课程');
    let error;
    const origins=[...new Set([location.origin,...[...document.querySelectorAll('iframe[src]')].flatMap(frame=>{try{const url=new URL(frame.src);return /^mooc[\w-]*\.chaoxing\.com$/.test(url.hostname)&&/\/visit\/(?:interaction|courses)/.test(url.pathname)?[url.origin]:[];}catch{return [];}}),'https://mooc1.chaoxing.com'])].filter(origin=>/^https:\/\/mooc[\w-]*\.chaoxing\.com$/.test(origin));
    const urls=origins.flatMap(origin=>['/mooc2-ans/visit/courselistdata','/mooc-ans/visit/courselistdata','/visit/courselistdata'].map(path=>origin+path));
    for(const url of urls) {
      if(signal.aborted)throw new Error('课程读取已取消');
      try {
        const html=await new Promise((resolve,reject)=>{
          let handle,settled=false;
          const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(value);};
          const abort=()=>{finish(new Error('课程读取已取消'));handle?.abort();};
          const timer=setTimeout(()=>{finish(new Error('课程列表读取超时'));handle?.abort();},20000);signal.addEventListener('abort',abort,{once:true});
          try {handle=GM_xmlhttpRequest({method:'POST',url,timeout:18000,headers:{'Content-Type':'application/x-www-form-urlencoded'},
            data:new URLSearchParams({courseType:'1',courseFolderId:'0',query:'',pageHeader:'0',single:'0',superstarClass:'',isFirefly:'0',courseLevelLabelId:'0',fid:'',from:''}).toString(),
            onload:response=>{try{
              if(response.status!==200)throw new Error(`课程列表 HTTP ${response.status}`);
              const final=new URL(response.finalUrl||url);if(!/(^|\.)chaoxing\.com$/.test(final.hostname)||/passport|login/i.test(final.href)||/<title>\s*用户登录/.test(response.responseText))throw new Error('请先登录学习通再读取课程');
              finish(null,{text:response.responseText,url:final.href});
            }catch(error){finish(error);}},onerror:()=>finish(new Error('课程列表连接失败')),ontimeout:()=>finish(new Error('课程列表读取超时')),onabort:abort});}catch(error){finish(error);}
        });
        const entries=readCourseLinks(new DOMParser().parseFromString(html.text,'text/html'),html.url);
        if(entries.length)return entries;error=new Error('课程列表为空或页面结构尚未适配');
      }catch(cause){error=cause;if(signal.aborted)throw cause;}
    }
    throw error;
  }
  async function startCourseQueue() {
    const queue=queueState();
    if(queue.owner && queue.owner!==queueOwner && queue.lease>Date.now())throw new Error('队列正在另一页面运行，请先在那里暂停');
    if(queue.status==='running'&&queue.owner===queueOwner)return;
    const item=queue.items.find(item=>item.id===queue.current&&item.selected&&!item.done)||queue.items.find(item=>item.selected&&!item.done);if(!item)throw new Error('请添加并勾选未完成课程');
    if(!settings.autoNext || settings.answerOnly)throw new Error('请开启自动切章并切换到学习模式');
    resetQueueProgress();queueFeedback='';queueFollower=false;
    queue.status='running';queue.owner=queueOwner;queue.lease=Date.now()+15000;queue.current=item.id;queue.message=`正在学习 ${item.name}`;queueWasOwned=true;queueSave(queue);
    await wait(180);
    const fresh=queueState();if(fresh.owner!==queueOwner||fresh.status!=='running'||fresh.current!==item.id)return;
    settings.enabled=true;writeStore(KEY,settings);
    if(currentQueueCourse()?.id!==item.id)navigateQueueCourse(item);else {start();if(!state.running&&!queueFollower)queuePause('当前页面不能开始学习，请在课程页继续');}
  }
  function navigateQueueCourse(item) {
    // Keep enabled for the destination page, but stop this page from scheduling a
    // chapter navigation while the course navigation is in flight.
    queueBusy={id:item.id,at:Date.now()};queueCompletion='';queueCompletionAt=0;
    state.running=false;clearTimeout(state.timer);state.timer=0;syncBackground();resetContext();renderStatus();renderCourseQueue();
    try {
      const url=new URL(courseURL(item.url).url);
      // Chapter links contain expiring signatures. Re-enter through the course
      // gateway so the platform creates fresh chapter/session parameters.
      if([...url.searchParams.keys()].some(key=>/^(?:enc|chapterid|knowledgeid)$/i.test(key))){
        const context=courseContext(url.href),entry=new URL('/visit/stucoursemiddle',url.origin);
        entry.searchParams.set('courseid',context.course);entry.searchParams.set('clazzid',context.clazz);entry.searchParams.set('ismooc2','1');if(context.cpi)entry.searchParams.set('cpi',context.cpi);
        location.assign(entry.href);
      }else location.assign(url.href);
    }
    catch {queuePause('打开课程失败，点击继续队列可重试');stop();}
  }
  function queueCatalogComplete(result) {
    if(result.blocked.length || result.unfinished.length || state.answerBusy || result.docs.some(auxiliaryBlocking) || verificationPage(result.docs))return '';
    if([...state.media.values()].some(record=>!record.done))return '';
    const selector='.posCatalog_select[id^="cur"], .chapter_item[id^="cur"], .chapter_item[onclick*="toOld"]';
    const sources=result.docs.filter(doc=>{
      const context=courseContext(doc.URL,doc),current=currentQueueCourse()?.id;
      return (!context.course||!context.clazz||`${context.course}:${context.clazz}`===current)&&doc.querySelector(selector);
    });
    const doc=sources.includes(document)?document:sources.length===1?sources[0]:null;if(!doc)return '';
    const rows=[...doc.querySelectorAll(selector)].filter(row=>!row.parentElement.closest(selector));
    if(!rows.length || doc.querySelector('.catalog-loading, [data-catalog-loading="true"], .catalog-load-more, [data-catalog-has-more="true"]'))return '';
    if(new Set(rows.map(row=>row.id)).size!==rows.length || !rows.every(row=>{
      const counts=[row.querySelector('.catalog_points_yi')?.textContent.trim(),...row.querySelectorAll('input.knowledgeJobCount, input[name="notFinishJobCount"]')].map(value=>typeof value==='string'?value:value?.value).filter(value=>value!==undefined);
      if(counts.some(value=>/^\d+$/.test(value)&&Number(value)>0))return false;
      const marked=Boolean(row.querySelector('.icon_Completed, .icon_yiwanc'));
      if(row.matches('.locked,[aria-disabled="true"]')||row.querySelector('.icon_lock,.catalog_lock'))return marked;
      return marked||counts.length>0&&counts.every(value=>/^0$/.test(value));
    }))return '';
    return currentQueueCourse()?.id+':'+rows.map(row=>row.id).join('|');
  }
  function tickCourseQueue(result) {
    const queue=queueState();if(queue.status!=='running')return;
    const current=currentQueueCourse();if(!current)return;
    if(queue.owner!==queueOwner && queue.lease>Date.now())return;
    if(current.id!==queue.current) {if(queue.owner===queueOwner&&!queueBusy)queuePause('已离开队列当前课程，点击继续可返回');return; }
    if(queue.owner!==queueOwner){queue.owner=queueOwner;queue.lease=Date.now()+15000;queueWasOwned=true;queueSave(queue);return;}
    if(queue.lease<Date.now()+8000){queue.lease=Date.now()+15000;queueSave(queue);}
    if(!settings.autoNext||settings.answerOnly){queuePause('自动切章已关闭或已切换只答题，队列暂停');return;}
    const complete=queueCatalogComplete(result);
    if(!complete){queueCompletion='';queueCompletionAt=0;return;}
    if(queueCompletion!==complete){queueCompletion=complete;queueCompletionAt=Date.now();return;}
    if(Date.now()-queueCompletionAt<3000||queueBusy)return;
    queueBusy=true;
    const fresh=queueState();if(fresh.status!=='running'||fresh.owner!==queueOwner){queueBusy=false;return;}
    const item=fresh.items.find(item=>item.id===fresh.current);if(item)item.done=true;
    const next=fresh.items.find(item=>item.selected!==false&&!item.done);
    if(next){fresh.current=next.id;fresh.lease=Date.now()+15000;fresh.message=`正在学习 ${next.name}`;queueSave(fresh);navigateQueueCourse(next);}
    else {fresh.status='complete';fresh.owner='';fresh.lease=0;fresh.message='所选课程均已由平台标记完成';queueWasOwned=false;resetQueueProgress();queueSave(fresh);desktopNotice('queue-done',fresh.message);}
  }
  function buildCourseQueue(shadow) {
    const panel=shadow.getElementById('panel-queue');
    panel.querySelector('.section-intro').textContent='勾选课程后按列表顺序学习，平台确认整门课程任务完成后继续下一门。';
    panel.insertAdjacentHTML('beforeend',`<div class="queue-overview"><div class="queue-overview-head"><strong id="queueState"></strong><span id="queueSummary"></span></div><progress id="queueProgress" aria-label="所选课程完成进度" max="1" value="0"></progress><p id="queueCurrent"></p><p id="queueStatus" class="hint" role="status" aria-live="polite"></p></div>
      <div class="queue-toolbar"><button id="queueRead">读取空间课程</button><button id="queueStart" class="primary">开始队列</button><button id="queuePause">暂停队列</button></div>
      <div class="queue-filters"><input id="queueSearch" type="search" placeholder="搜索课程名称" aria-label="搜索队列课程"><select id="queueFilter" aria-label="筛选队列课程"><option value="all">全部课程</option><option value="selected">已选课程</option><option value="pending">待学习</option><option value="done">已完成</option></select></div>
      <div class="queue-selection"><button id="queueSelectAll" class="small">全选</button><button id="queueSelectNone" class="small">取消全选</button><span id="queueEditHint" class="hint" hidden>暂停队列后可选择、排序或移除课程</span></div><div id="queueItems"></div>
      <details id="queueImport"><summary>手动添加课程</summary><label class="field"><span>每行一个课程链接，也可填写：名称 | 链接</span><textarea id="queueInput" rows="3" placeholder="粘贴学习通课程链接"></textarea></label><button id="queueAdd">添加到队列</button></details>
      <details id="queueManage"><summary>更多管理操作</summary><p class="hint">清空队列只移除这里的列表；重置记录后，可重新学习已完成课程。</p><div class="actions"><button id="queueReset">重置完成记录</button><button id="queueClear">清空队列</button></div></details>`);
    const style=document.createElement('style');style.textContent=`
      #panel-queue .queue-overview{background:#fff;border:1px solid #e2e8f0;border-radius:9px;padding:12px;margin:12px 0}
      #panel-queue .queue-overview-head{display:flex;gap:8px;justify-content:space-between;align-items:baseline;flex-wrap:wrap}#queueState{font-size:12px;color:#315bd5}#queueSummary{font-size:11px;color:#6d7c93;line-height:1.6}#queueCurrent{font-size:12px;line-height:1.7;overflow-wrap:anywhere;margin:9px 0 0}
      #queueProgress{display:block;width:100%;height:5px;border:0;border-radius:5px;overflow:hidden;margin:10px 0;background:#e7edf7;accent-color:#527ae0}#queueProgress::-webkit-progress-bar{background:#e7edf7}#queueProgress::-webkit-progress-value{background:#527ae0}
      #panel-queue .queue-toolbar{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}#panel-queue .queue-toolbar button{flex:1;white-space:normal;min-width:70px;margin:0;font-size:12px;padding:9px 6px}
      #panel-queue .queue-filters{display:flex;gap:8px;margin:12px 0 6px}#queueSearch{flex:1;min-width:0}#queueFilter{flex:0 0 105px;width:105px;font-size:11px}#panel-queue .queue-selection{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px}#panel-queue .queue-selection button{margin:0}
      #queueItems .queue-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:11px 8px;margin:0 0 6px;background:#fff;border:1px solid #e2e8f0;border-radius:8px}#queueItems .queue-row[data-current=true]{border-color:#b6c9f5;background:#f6f9ff}
      #queueItems .queue-course{display:flex;align-items:flex-start;gap:9px;min-width:0;cursor:pointer}#queueItems .queue-course-text{display:flex;flex-direction:column;gap:3px;min-width:0}#queueItems .queue-name{font-size:12px;line-height:1.6;color:#34435c;overflow-wrap:anywhere}#queueItems small{font-size:10px;line-height:1.5;color:#8491a5}
      #queueItems input.queue-check{appearance:auto;-webkit-appearance:auto;position:static;flex:0 0 16px;width:16px;height:16px;margin:3px 0 0;border-radius:3px;accent-color:#315bd5;box-shadow:none}#queueItems input.queue-check::after{content:none;display:none}
      #queueItems .queue-row-actions{display:flex;gap:4px;align-items:center}#queueItems .queue-row-actions button{margin:0;padding:5px 7px;min-width:25px;font-size:10px}#queueItems .queue-empty{padding:24px 12px;text-align:center;border:1px dashed #dce3ed;border-radius:8px;font-size:12px;line-height:1.8;color:#8591a4}
      #panel-queue [hidden]{display:none!important}#queueImport textarea{min-height:70px}#panel-queue details{margin-top:12px}
      :host([data-dock-narrow=true]) #queueItems .queue-row{grid-template-columns:minmax(0,1fr)}:host([data-dock-narrow=true]) #queueItems .queue-row-actions{justify-content:flex-end}
      @media(max-width:360px){#queueItems .queue-row{grid-template-columns:minmax(0,1fr)}#queueItems .queue-row-actions{justify-content:flex-end}#panel-queue .queue-filters{flex-wrap:wrap}#queueFilter{flex:1;width:auto}}
    `;shadow.append(style);
    const get=id=>shadow.getElementById(id),queueError=error=>{queueFeedback=error.message;renderCourseQueue();};
    get('queueSearch').oninput=get('queueFilter').onchange=()=>renderCourseQueue();
    get('queueSelectAll').onclick=event=>{if(trustedClick(event,get('queueSelectAll')))editCourseQueue(queue=>queue.items.forEach(item=>item.selected=true),'已选择全部课程');};
    get('queueSelectNone').onclick=event=>{if(trustedClick(event,get('queueSelectNone')))editCourseQueue(queue=>queue.items.forEach(item=>item.selected=false),'已取消全部选择');};
    get('queueRead').onclick=async event=>{
      if(!trustedClick(event,get('queueRead')))return;
      if(!spacePage()||queueReadBusy||queueState().status==='running')return;
      const controller=new AbortController();state.queueReadController?.abort();state.queueReadController=controller;queueReadBusy=true;queueFeedback='正在读取空间课程列表…';renderCourseQueue();
      try {
        let entries=collect(document).docs.flatMap(doc=>readCourseLinks(doc));const fromPage=entries.length>0;
        if(!fromPage)entries=await loadQueueCourses(controller.signal);
        if(controller.signal.aborted||state.queueReadController!==controller)return;
        addQueueCourses(entries,{selectNew:false});
        if(fromPage)queueFeedback='已读取当前空间中加载的课程；文件夹内课程请展开后再读取。原有选择与完成记录保留。';
      }catch(error){if(!controller.signal.aborted)queueError(error);}
      finally{if(state.queueReadController===controller){queueReadBusy=false;state.queueReadController=null;renderCourseQueue();}}
    };
    get('queueAdd').onclick=event=>{if(!trustedClick(event,get('queueAdd')))return;try{
      if(queueReadBusy||queueState().status==='running')return;
      const entries=get('queueInput').value.split(/\r?\n/).filter(line=>line.trim()).map(line=>{const match=line.match(/^(.*?)\s*\|\s*(https?:\/\/.*)$/);return match?{name:match[1],url:match[2]}:{url:line.trim()};});
      if(!entries.length||entries.some(entry=>!courseURL(entry.url)))throw new Error('请输入带 courseid 和 clazzid 的有效学习通课程链接');
      addQueueCourses(entries);get('queueInput').value='';get('queueImport').open=false;
    }catch(error){queueError(error);}};
    get('queueStart').onclick=event=>{if(trustedClick(event,get('queueStart')))startCourseQueue().catch(queueError);};
    get('queuePause').onclick=event=>{if(!trustedClick(event,get('queuePause')))return;state.queueReadController?.abort();state.queueReadController=null;queueReadBusy=false;queueFeedback='';queuePause();if(state.running)stop();};
    for(const [id,clear]of [['queueClear',true],['queueReset',false]])get(id).onclick=event=>{if(trustedClick(event,get(id)))editCourseQueue(queue=>{if(clear)queue.items=[];else queue.items.forEach(item=>item.done=false);queue.current='';},clear?'队列已清空':'完成记录已重置');};
    renderCourseQueue();
    if(!spacePage()){
      const section=document.createElement('details');section.id='courseQueueSection';section.innerHTML='<summary id="courseQueueHeading">课程队列</summary><p class="hint">读取课程请到学习通空间页；这里可查看、暂停或继续已保存的队列。</p>';
      section.append(panel);panel.querySelector('h3').hidden=true;panel.setAttribute('aria-labelledby','courseQueueHeading');shadow.getElementById('panel-home').append(section);
    }
    const timer=setInterval(()=>{
      const queue=queueState(),current=currentQueueCourse();
      if(queueBusy&&queue.status==='running'&&queue.owner===queueOwner){
        if(current?.id===queueBusy.id){resetQueueProgress();start();}
        else if(Date.now()-queueBusy.at>=10000){queuePause('课程切换未生效，点击继续队列可重试');stop();}
      }
      if(queue.status==='running'&&queue.owner===queueOwner&&current?.id===queue.current&&queue.lease<Date.now()+8000){queue.lease=Date.now()+15000;queueSave(queue);}
      if(queueFollower&&queue.status==='running'&&queue.lease<=Date.now()&&current?.id===queue.current){queueFollower=false;start();}
      if(queueWasOwned&&queue.status==='paused'){queueWasOwned=false;if(state.running)stop();}
      if(queue.status==='running'&&queue.owner!==queueOwner&&queue.lease>Date.now()&&current?.id===queue.current&&state.running){queueWasOwned=false;queueMayStudy();}
      renderCourseQueue();
    },1000);
    window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(timer);clearTimeout(queueClaimTimer);cancelChat();state.queueReadController?.abort();const queue=queueState();if(queue.owner===queueOwner&&queue.status==='running'){queue.lease=0;writeStore(COURSE_QUEUE_KEY,queue);}});
  }
  function examIdentity(doc) {
    const url=new URL(doc.URL),read=(...names)=>names.map(name=>doc.getElementById(name)?.value || doc.querySelector(`input[name="${name}"]`)?.value || url.searchParams.get(name)).find(Boolean);
    const paper=read('testPaperId','examRelationId','tId','examId','testId'),attempt=read('testUserRelationId','examRelationAnswerId','id');
    return paper?`${url.origin}:${paper}:${attempt||''}`:null;
  }
  function examConfirmButtons(doc) {
    const dedicated=[...doc.querySelectorAll('.popBottom a[onclick*="answerDirectSubmit"], a[onclick*="answerDirectSubmit"], a.confirm[onclick*="finalSubmit"]')].filter(enabled);
    const generic=[...doc.querySelectorAll('[role="dialog"], .layui-layer-dialog, .popDiv, .popbox, .modal, #confirmSubmit, #submitTest')]
      .filter(dialog=>visible(dialog)&&/交卷|提交试卷|提交考试/.test(dialog.textContent)&&!/人脸|验证码|登录|退出|删除|异常|错误|失败/.test(dialog.textContent))
      .flatMap(dialog=>[...dialog.querySelectorAll('button,a,input[type="button"]')]).filter(button=>enabled(button)&&/^(?:确定|确认|提交|确认提交|交卷|确认交卷|提交试卷)$/.test((button.textContent||button.value||'').replace(/\s/g,'')));
    return [...new Set([...dedicated,...generic])];
  }
  function examAttemptMarker(id,write) {
    try {const key='cxHelper.examSubmit:'+id;if(write===null){sessionStorage.removeItem(key);return null;}
      if(write){sessionStorage.setItem(key,JSON.stringify({at:Date.now()}));return write;}
      const value=JSON.parse(sessionStorage.getItem(key)||'null');return value&&value.at<=Date.now()&&Date.now()-value.at<2*60*60*1000?value:null;
    }catch{return null;}
  }
  function retryExamSubmission(doc) {
    if(!examDocument(doc)||platformSubmissionState(doc)==='acknowledged')return;
    const id=examIdentity(doc),attempt=examAttempts.get(doc);if(!id||(!attempt&&!examAttemptMarker(id)))return;
    if(examConfirmButtons(doc).length){log('考试交卷确认窗口仍在，请先核对并处理该窗口');return;}
    if(attempt&&!attempt.done&&Date.now()-attempt.at<15000)return;
    examAttempts.delete(doc);examAttemptMarker(id,null);log('已按手动重试请求解除未确认交卷记录');
  }
  function enterExamPreview(doc) {
    if(!/\/exam\/test\/reVersionTestStartNew\/?$/.test(new URL(doc.URL).pathname)
      || /不允许整卷预览|禁止整卷预览/.test(doc.querySelector('.mark_info')?.textContent||''))return false;
    const buttons=[...doc.querySelectorAll('a,button,input[type="button"]')].filter(button=>enabled(button)
      && (/^(?:整卷预览|预览试卷)$/.test((button.textContent||button.value||'').replace(/\s/g,'')) || /\btopreview\s*\(/.test(button.getAttribute('onclick')||'')));
    if(buttons.length!==1)return false;
    const button=buttons[0];if(examNavigation.get(button)==='preview')return true;
    examNavigation.set(button,'preview');button.click();log('进入整卷预览以读取完整考试题目');return true;
  }
  function processExamSubmission(doc) {
    if(!examDocument(doc)||!settings.examEnabled||!settings.examSubmit||!settings.autoAnswer||!state.running||state.answerBusy||verificationPage([doc]))return;
    const id=examIdentity(doc);if(!id)return;
    if(!examAttempts.has(doc)&&!examAttemptMarker(id)&&enterExamPreview(doc))return;
    let ledger=examLedgers.get(id);if(!ledger){ledger=savedExamLedger(id);examLedgers.set(id,ledger);}
    const roots=questionRoots(doc);
    const currentIds=roots.map(root=>CXHomework.questionId(root)),scopeInvalid=currentIds.some(id=>!id)||new Set(currentIds).size!==currentIds.length;
    const preview=/\/exam\/preview\/?$/.test(new URL(doc.URL).pathname);
    for(const root of roots){const q=parseQuestion(root),record=state.questions.get(root),qid=CXHomework.questionId(root);
      if(!qid)continue;
      const fingerprint=CXFontCodec.sourceFingerprint(snapshot(q)),question=CXFontCodec.sourceFingerprint(q.key);
      if(record?.key===q.key&&record.status==='filled'&&record.snapshot===snapshot(q))ledger.set(qid,{snapshot:fingerprint,question});
      else if(!preview || !ledger.has(qid) || ledger.get(qid).question!==question || ledger.get(qid).snapshot!==fingerprint)ledger.delete(qid);
    }
    saveExamLedger(id,ledger);
    const attempt=examAttempts.get(doc);
    if(attempt){
      if(platformSubmissionState(doc)==='acknowledged'){if(!attempt.done)log('平台已确认考试交卷','success');attempt.done=true;examLedgers.delete(id);examAttemptMarker(id,null);try{sessionStorage.removeItem('cxHelper.examLedger:'+id);}catch{}return;}
      if(Date.now()-attempt.at>15000){if(!attempt.done)log('交卷结果未确认，请在考试页面核对','warn');attempt.done=true;return;}
      if(attempt.done)return;
      if(scopeInvalid||JSON.stringify([...ledger])!==attempt.ledger) {attempt.done=true;log('考试答案已变化，停止交卷确认；请核对后手动确认或重试','warn');return;}
      const confirmations=examConfirmButtons(doc).filter(button=>!attempt.existing.has(button));
      if(!attempt.confirmed&&confirmations.length===1){attempt.confirmed=true;confirmations[0].click();log('已确认考试交卷，等待平台结果');}return;
    }
    if(examAttemptMarker(id)){once('exam-previous-submit:'+id,'此前已请求考试交卷，结果未确认；请先核对平台状态，必要时点击重试');return;}
    const count=doc.querySelector('[data-question-count], #totalQuestionNum, input[name="totalQuestionNum"], input[name="questionCount"]');
    const cards=[...doc.querySelectorAll('.answerCard [data-questionid], .answerCard [data-question-id], .answer-card [data-question-id], .answer-card [data-questionid]')];
    const sheet=[...doc.querySelectorAll('[id^="answerSheet"]')].map(node=>/^answerSheet(\d+)$/.exec(node.id)?.[1]).filter(Boolean);
    const ids=[...new Set([...cards.map(node=>node.getAttribute('data-questionid')||node.dataset.questionId),...sheet].filter(Boolean))];
    let total=Number(count?.value||count?.dataset.questionCount||ids.length);
    if(!total&&preview&&roots.length&&doc.readyState==='complete'&&!doc.querySelector('.question-pagination,.questionPager,[data-cx-question-pages], [data-question-loading="true"]')) {
      const all=CXHomework.roots(doc,QUESTION_SELECTOR),keys=all.map(root=>CXHomework.questionId(root));
      const signature=JSON.stringify(keys.map((qid,i)=>[qid,parseQuestion(all[i]).key]));let scope=examPreviewScopes.get(doc);
      if(!scope||scope.signature!==signature){scope={signature,at:Date.now()};examPreviewScopes.set(doc,scope);}
      if(keys.every(Boolean)&&new Set(keys).size===keys.length&&Date.now()-scope.at>=2000)total=all.length;
    }
    if(!Number.isInteger(total)||total<1 || (ids.length&&ids.length!==total)) {if(preview)once('exam-preview-unknown:'+id,'整卷预览无法确认完整题量，请手动交卷或返回答题页核对');return;}
    const ready=ids.length?ids.every(qid=>ledger.has(qid)):ledger.size===total;
    if(scopeInvalid || roots.length>total || !ready || (preview&&!roots.length) || platformSubmissionState(doc)==='acknowledged') {if(preview)once('exam-preview-incomplete:'+id,'整卷预览缺少完整答题核对记录，请手动交卷或返回答题页完成核对');return;}
    const buttons=[...doc.querySelectorAll('button,a,input[type="button"], [role="button"]')].filter(button=>enabled(button)&&!button.closest('[role="dialog"],.modal,.layui-layer-dialog')
      &&(/^(?:交卷|提交试卷|提交考试|确认交卷|整卷预览|预览试卷)$/.test((button.textContent||button.value||'').replace(/\s/g,''))
        || button.matches('#submitExam,#submitTest,[data-action="submit-exam"]')&&/^提交$/.test((button.textContent||button.value||'').trim())));
    const finish=examFinishStep(doc);
    if(!buttons.length&&finish&&!examNextButton(doc)) {
      if(examNavigation.get(finish)==='preview')return;examNavigation.set(finish,'preview');finish.click();log('考试题目已核对，进入交卷下一步');return;
    }
    if(buttons.length!==1)return;
    const button=buttons[0];
    if(/预览/.test(button.textContent||button.value||'')) {
      if(examNavigation.get(button)==='preview')return;examNavigation.set(button,'preview');button.click();log('考试题目已核对，进入整卷预览');return;
    }
    examAttempts.set(doc,{at:Date.now(),existing:new Set(examConfirmButtons(doc)),confirmed:false,ledger:JSON.stringify([...ledger])});examAttemptMarker(id,true);button.click();log('整份考试答案已填写并核对，已请求交卷');
  }
  function cancelChat() {
    const pending=Boolean(chatController);chatGeneration++;chatController?.abort();chatController=null;
    if(extendedShadow&&pending){const input=extendedShadow.getElementById('chatInput');
      if(chatMessages.at(-1)?.role==='user'){const message=chatMessages.pop();if(!input.value.trim())input.value=message.content;}
      renderChat();extendedShadow.getElementById('chatSend').disabled=false;extendedShadow.getElementById('chatStatus').textContent='回复已取消';
    }
  }
  function renderChat() {
    const list=extendedShadow.getElementById('chatHistory');list.replaceChildren();
    for(const message of chatMessages){const row=document.createElement('div');row.className=`chat-message ${message.role}`;
      const name=document.createElement('b');name.textContent=message.role==='user'?'你':'AI';const content=document.createElement('div');content.textContent=message.content;row.append(name,content);list.append(row);}
    list.scrollTop=list.scrollHeight;
  }
  async function sendChat() {
    const input=extendedShadow.getElementById('chatInput'),feedback=extendedShadow.getElementById('chatStatus'),send=extendedShadow.getElementById('chatSend');
    const text=input.value.trim();if(!text||chatController)return;
    if(text.length>20000){feedback.textContent='单条消息最多 20000 字';return;}
    if(!settings.apiUrl||!settings.apiModel){feedback.textContent='请先在 AI / 题库中配置接口与模型';return;}
    if(chatMessages.reduce((n,m)=>n+m.content.length,0)+text.length>100000){feedback.textContent='会话已达到长度上限，请清空后继续';return;}
    const history=[...chatMessages,{role:'user',content:text}],controller=new AbortController(),generation=++chatGeneration,revision=state.configRevision;
    chatController=controller;send.disabled=true;feedback.textContent='正在回复…';chatMessages.push({role:'user',content:text});input.value='';renderChat();
    try {
      const raw=await requestAI(endpoint(settings.apiUrl),{model:settings.apiModel,stream:false,messages:[{role:'system',content:'你是学习助手，请用清晰准确的语言回答问题。不确定时说明不确定。'},...history]},controller.signal);
      if(controller.signal.aborted||generation!==chatGeneration||revision!==state.configRevision)throw new Error('会话已取消或接口设置已变化');
      const reply=raw.choices?.[0]?.message?.content;
      if(typeof reply!=='string'||!reply.trim())throw new Error('接口没有返回文本回复');
      chatMessages.push({role:'assistant',content:reply.slice(0,100000)});renderChat();feedback.textContent='回复完成';
    } catch(error){if(generation===chatGeneration){chatMessages.pop();if(!input.value.trim())input.value=text;renderChat();feedback.textContent=controller.signal.aborted?'已取消':error.message;}}
    finally{if(generation===chatGeneration){chatController=null;send.disabled=false;}}
  }
  function buildExtendedFeatures(shadow) {
    extendedShadow=shadow;
    const style=document.createElement('style');style.textContent='.tabs{grid-template-columns:repeat(6,minmax(0,1fr))}.queue-row{display:flex;gap:4px;align-items:center;padding:7px 0;border-bottom:1px solid #e6ebf1}.queue-row label{flex:1;min-width:0;overflow-wrap:anywhere}.queue-row input[type=checkbox]{appearance:auto;width:15px;height:15px}.chat-history{max-height:350px;overflow:auto}.chat-message{padding:10px;margin:7px 0;border-radius:8px;background:#fff;border:1px solid #e2e8f0}.chat-message.user{background:#edf2ff}.chat-message div{white-space:pre-wrap;overflow-wrap:anywhere}';shadow.append(style);
    style.textContent+=':host([data-page=study]) .tabs{grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;padding:0 8px}.tabs button{font-size:11px;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.3}';
    const sources=shadow.getElementById('panel-sources'),service=document.createElement('section');service.id='bank-online';
    service.innerHTML=`<label class="field"><span>题库服务</span><select id="presetProvider"><option value="ocs">自定义 / OCS 题库</option><option value="abc">ABC 题库</option><option value="n1">N1 搜题助手</option></select></label><div id="presetFields">
      <label class="field" id="abcNodeRow"><span>ABC 节点</span><select id="abcNode"><option value="secure">节点 2 · HTTPS</option><option value="primary">默认节点 · HTTP 明文</option></select></label>
      <p class="hint">使用对应服务自己的密钥与配额。ABC 默认节点使用 HTTP，会明文传输题目和密钥；推荐 HTTPS 节点。不会复用 AI 密钥。</p>
      <label class="field"><span>题库密钥（留空保留）</span><input id="presetKey" type="password" autocomplete="new-password"></label>
      <div class="actions"><button id="presetSave">保存服务 / 切换节点</button><button id="presetTest">测试题库</button><button id="presetRemove">移除此服务</button></div><p id="presetStatus" class="hint" role="status"></p></div>`;
    const management=document.createElement('details');management.id='bankSettings';management.open=true;
    management.innerHTML='<summary>题库管理</summary><p class="hint">先选择在线服务；已有题目可本地导入，查询记录在缓存中管理。</p><div class="bank-tabs" role="tablist" aria-label="题库管理"></div>';
    const flatten=(detail,id)=>{const section=document.createElement('section');section.id=id||detail.id;for(const child of [...detail.children])if(child.tagName!=='SUMMARY')section.append(child);detail.replaceWith(section);return section;};
    const external=flatten(shadow.getElementById('externalSettings'));
    service.append(external);
    const local=flatten(refs.importBank.closest('details'),'bank-local'),cache=flatten(shadow.getElementById('cacheSettings'));
    for(const [id,label,section] of [['online','在线题库',service],['local','本地题库',local],['cache','答案缓存',cache]]){
      const button=document.createElement('button');button.id='bank-tab-'+id;button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',section.id);section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',button.id);management.querySelector('.bank-tabs').append(button);management.append(section);
      button.onclick=()=>{for(const tab of management.querySelectorAll('[role=tab]')){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;shadow.getElementById(tab.getAttribute('aria-controls')).hidden=!active;}};
      button.onkeydown=event=>{const tabs=[...management.querySelectorAll('[role=tab]')],index=tabs.indexOf(button);let next;if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];if(event.key==='Home')next=tabs[0];if(event.key==='End')next=tabs.at(-1);if(next){event.preventDefault();next.click();next.focus();}};
    }
    // Configure the model first, then answer sources; optional web search comes last.
    sources.append(shadow.getElementById('apiSettings'),management,shadow.getElementById('searchSettings'));
    shadow.getElementById('bank-tab-online').click();
    style.textContent+='#bankSettings>.bank-tabs{display:flex;gap:4px;padding:4px;background:#f1f4fa;border-radius:8px;margin:12px 0}#bankSettings>.bank-tabs button{flex:1;min-width:0;margin:0;padding:8px 3px;border:0;background:transparent;box-shadow:none;font-size:12px}#bankSettings>.bank-tabs button[aria-selected=true]{background:#fff;color:#315bd5;box-shadow:0 1px 4px #243d6814}#bankSettings>section{padding:0;border:0;background:transparent}#bankSettings [hidden]{display:none!important}';
    const get=id=>shadow.getElementById(id),provider=get('presetProvider'),node=get('abcNode'),key=get('presetKey'),status=get('presetStatus');
    const sync=()=>{const existing=settings.externalBanks.find(item=>item.profile===provider.value);get('presetFields').hidden=provider.value==='ocs';external.hidden=provider.value!=='ocs';get('abcNodeRow').hidden=provider.value!=='abc';node.value=existing?.node||'secure';status.textContent=existing?'密钥已配置，不回显；可选择节点后保存':'尚未配置此服务';};provider.onchange=()=>{key.value='';sync();};
    provider.value='ocs';sync();
    const save=()=>{
      const profile=provider.value,existing=settings.externalBanks.find(item=>item.profile===profile),secret=key.value.trim()||(profile==='abc'?existing?.data.token:existing?.data.key);
      const config=profile==='abc'?CXExternalBank.abcConfig(secret,node.value):CXExternalBank.n1Config(secret);
      settings.externalBanks=validateBanks([config,...settings.externalBanks.filter(item=>item.profile!==profile)]);key.value='';invalidateAnswers();writeStore(KEY,settings);renderPrivateSettings();status.textContent='服务与节点已保存';return config;
    };
    get('presetSave').onclick=event=>{if(!trustedClick(event,get('presetSave')))return;try{save();}catch(error){status.textContent=error.message;}};
    get('presetRemove').onclick=event=>{if(!trustedClick(event,get('presetRemove')))return;settings.externalBanks=settings.externalBanks.filter(item=>item.profile!==provider.value);key.value='';invalidateAnswers();writeStore(KEY,settings);renderPrivateSettings();sync();};
    get('presetTest').onclick=async event=>{if(!trustedClick(event,get('presetTest')))return;let controller;try{const config=save();controller=new AbortController();state.manualController?.abort();state.manualController=controller;get('presetTest').disabled=true;status.textContent='测试中，成功可能消耗配额…';
      const q={title:'1+1等于多少？',type:'single',options:[{text:'1',label:'A',value:'A'},{text:'2',label:'B',value:'B'}],groups:[],editors:[]};
      if(config.profile==='n1'){q.title='与高血压发病有关的饮食因素是()';q.options=['动物蛋白摄入过多','植物蛋白摄入过多','素食过多','钙盐过多','钠盐食入过多'].map((text,i)=>({text,label:String.fromCharCode(65+i),value:String.fromCharCode(65+i)}));}
      const result=await requestBank(config,q,controller.signal);status.textContent=`测试成功：${result.answers.join(' / ')}（来源：${result.source}）`+(result.quota?.remaining!==undefined?`；剩余次数 ${result.quota.remaining}`:'');
    }catch(error){status.textContent=error.message;}finally{get('presetTest').disabled=false;}};
    const exam=document.createElement('div');exam.className='setting-card';exam.innerHTML='<h4>考试自动交卷</h4><div class="row"><label for="examSubmit">整份答案核对后自动交卷</label><input id="examSubmit" type="checkbox"></div><p class="hint">需同时开启考试处理与自动答题。识别到完整题量、全部答案填写并回读一致后，点击交卷及其确认。分页题量未知时等待人工核对。</p>';shadow.getElementById('panel-answer').append(exam);
    get('examSubmit').checked=Boolean(settings.examSubmit);get('examSubmit').onchange=event=>{if(!event.isTrusted){get('examSubmit').checked=Boolean(settings.examSubmit);return;}settings.examSubmit=get('examSubmit').checked;writeStore(KEY,settings);};
    document.addEventListener('input',event=>{if(!event.isTrusted||!examDocument(document))return;const id=examIdentity(document),root=event.target.closest?.(QUESTION_SELECTOR);if(!id||!root)return;const ledger=examLedgers.get(id)||savedExamLedger(id);ledger.delete(CXHomework.questionId(root));examLedgers.set(id,ledger);saveExamLedger(id,ledger);},true);
    // Replace historical copy now that submission is an explicit option.
    for(const hint of shadow.querySelectorAll('.hint'))if(/考试必须手动交卷|考试.*不会.*交卷/.test(hint.textContent))hint.textContent='考试处理、自动翻题与自动交卷分别控制；交卷开关默认关闭。';
    const chat=shadow.getElementById('panel-chat');chat.insertAdjacentHTML('beforeend','<p class="hint">使用 AI / 题库中保存的接口与模型；对话保留在当前页面。Ctrl+Enter 发送。</p><div id="chatHistory" class="chat-history" aria-live="polite"></div><label class="field"><span>消息</span><textarea id="chatInput" rows="3" placeholder="解释考点、总结知识或继续追问"></textarea></label><div class="actions"><button id="chatSend" class="primary">发送</button><button id="chatCancel">停止回复</button><button id="chatClear">清空对话</button></div><p id="chatStatus" class="hint" role="status"></p>');
    get('chatSend').onclick=sendChat;get('chatInput').onkeydown=event=>{if(event.ctrlKey&&event.key==='Enter'){event.preventDefault();void sendChat();}};
    get('chatCancel').onclick=()=>{if(chatController){cancelChat();get('chatStatus').textContent='已停止回复';}};
    get('chatClear').onclick=()=>{cancelChat();chatMessages.length=0;renderChat();get('chatSend').disabled=false;get('chatStatus').textContent='对话已清空';};
    buildCourseQueue(shadow);
  }
