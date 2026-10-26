const Tools=require('../../src/study-tools.cjs');
async function exportProblemSet(setId,signal,read=fetch,onProgress=()=>{}) {
  if(!/^\d+$/.test(String(setId)))throw new Error('题目集 ID 无效');
  const get=async path=>{
    if(signal.aborted)throw new Error('导出已取消');
    const requestController=new AbortController(),abort=()=>requestController.abort();signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,25000);
    try{
      const response=await read('/api'+path,{method:'GET',credentials:'same-origin',signal:requestController.signal,redirect:'error'});
      if(!response.ok)throw new Error(`题目读取 HTTP ${response.status}；请先在平台打开有权限的题目集`);
      const data=await response.json();if(signal.aborted)throw new Error('导出已取消');return data;
    }catch(e){if(requestController.signal.aborted)throw new Error(signal.aborted?'导出已取消':'题目读取超过 25 秒，请重试');throw e;}
    finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  };
  const exam=await get(`/problem-sets/${setId}/exams`);
  const id=exam.exam?.id;
  if(!id||!/^\d+$/.test(String(id)))throw new Error('没有已存在的可访问考试；请先在平台打开题目集，不会为导出创建考试');
  const summaries=await get(`/problem-sets/${setId}/problem-summaries`);
  if(!summaries.summaries||typeof summaries.summaries!=='object')throw new Error('题型目录无法读取');
  const types=Object.keys(summaries.summaries);if(!types.length||types.length>20||types.some(t=>!/^\d+$/.test(t)&&!/^[A-Z_]+$/.test(t)))throw new Error('题型目录无效');
  const items=[],seen=new Set();
  for(const type of types){onProgress('正在读取题型 '+type);
    const response=await get(`/problem-sets/${setId}/exam-problems?exam_id=${encodeURIComponent(id)}&problem_type=${encodeURIComponent(type)}`);
    if(!Array.isArray(response.problemSetProblems))throw new Error('题目列表结构不支持，未下载不完整题目集');
    if(response.hasMore||response.nextPageToken)throw new Error('题目列表存在未读取分页，未下载不完整题目集');
    const summary=summaries.summaries[type],expected=typeof summary==='number'?summary:Array.isArray(summary)?summary.length:summary?.totalCount;
    const validItems=response.problemSetProblems.filter(Boolean);
    if(Number.isInteger(expected)&&expected>=0&&validItems.length!==expected)throw new Error(`题型 ${type} 仅取得 ${validItems.length}/${expected} 道题，未导出不完整题目集`);
    if(items.length+validItems.length>2000)throw new Error('题目集超过 2000 道题，请分批导出');
    for(const item of response.problemSetProblems){if(!item)continue;const problem=item.problem||item;
      const identity=String(item.id||problem.id||'');if(identity&&seen.has(identity))continue;if(identity)seen.add(identity);
      const details=problem.programmingProblem||problem.functionProblem||problem.codeCompletionProblem||problem.multipleChoiceProblem||problem;
      const statement=problem.content||details.content||details.description||'';
      if(!statement)throw new Error('题目材料缺失，未下载不完整题目集');
      items.push({title:`${item.label||''} ${item.title||problem.title||'题目'}`.trim(),statement:String(statement),options:details.choices||[],answer:'',analysis:'',images:[]});
    }
  }
  if(!items.length)throw new Error('题目集为空');return items;
}
function setMarkdown(title,items) {return '# '+title+'\n\n'+items.map((item,i)=>`## ${i+1}. ${item.title}\n\n${item.statement}\n\n${item.options.map((o,j)=>`${String.fromCharCode(65+j)}. ${typeof o==='string'?o:o.content||o.text||''}`).join('\n')}`).join('\n\n---\n\n');}
function mountExports({root,page,adapter,status}) {
  const section=document.createElement('details');section.id='study-export';section.innerHTML='<summary>题目与用量</summary><div class="actions"><button id="export-current">导出当前题 Markdown</button><button id="export-set">导出题目集 Markdown</button><button id="export-cancel">取消导出</button></div><label><input id="export-my-code" type="checkbox" checked>包含当前本人代码</label><p id="export-status" role="status"></p><div class="actions"><button id="usage-refresh">刷新 AI 用量</button><button id="usage-export">导出用量</button></div><p id="usage-summary"></p>';
  section.open=true;root.getElementById('settings-page').append(section);let controller=null;
  const get=id=>root.getElementById(id),show=text=>{get('export-status').textContent=text;};
  get('export-current').onclick=()=>{try{const route=adapter.route(),statement=adapter.exportStatement();
    let code='';if(get('export-my-code').checked){try{code=adapter.editor().read();}catch{}}
    Tools.save(`${route.setId}-${route.problemId}.md`,`# ${page.document.title}\n\n${statement}\n\n${code?'## 我的代码\n\n'+codeFence(code):''}`);show('当前题已导出');}catch(e){show(e.message);}};
  const cancel=()=>{controller?.abort();controller=null;};get('export-cancel').onclick=()=>{cancel();show('导出已取消');};
  get('export-set').onclick=async()=>{cancel();const own=new AbortController();controller=own;get('export-set').disabled=true;
    try{const setId=adapter.route().setId,items=await exportProblemSet(setId,own.signal,page.fetch.bind(page),text=>{if(controller===own)show(text);});if(own.signal.aborted||controller!==own||adapter.route().setId!==setId)return;Tools.save(`Pintia-${setId}.md`,setMarkdown(`Pintia 题目集 ${setId}`,items));show(`已导出 ${items.length} 道题`);}catch(e){if(controller===own)show(e.message);}finally{get('export-set').disabled=false;}};
  const refresh=()=>{const rows=Tools.usageRows(typeof GM_getValue==='function'?GM_getValue('learnova.usage.v1',[]):[]);const sum=rows.reduce((s,r)=>({requests:s.requests+r.requests,input:s.input+r.input,output:s.output+r.output,unknown:s.unknown+r.requests-r.known}),{requests:0,input:0,output:0,unknown:0});get('usage-summary').textContent=`请求 ${sum.requests} · 输入 ${sum.input} / 输出 ${sum.output} tokens · ${sum.unknown} 次未知`;};
  get('usage-refresh').onclick=refresh;get('usage-export').onclick=()=>Tools.save('Pintia-AI用量.json',JSON.stringify(typeof GM_getValue==='function'?GM_getValue('learnova.usage.v1',[]):[],null,2),'application/json');refresh();
  page.addEventListener('pagehide',cancel,{once:true});
}
function codeFence(code) {const runs=String(code).match(/`+/g)||[];const fence='`'.repeat(Math.max(3,...runs.map(r=>r.length+1)));return fence+'\n'+code+'\n'+fence+'\n';}
module.exports={exportProblemSet,setMarkdown,mountExports,codeFence};
