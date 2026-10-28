// Portable study data and document utilities. No remote executable dependencies.
const encoder = new TextEncoder();
const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function safeURL(raw, base, allowed) {
  if(typeof raw!=='string'||!raw.trim())return null;
  try {const url=new URL(raw,base);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&(!allowed||allowed(url))?url.href:null;}catch{return null;}
}
function filename(value) {return String(value||'学习资料').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120);}
function imageURL(raw,base) {
  return /^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(String(raw))&&String(raw).length<=12*1024*1024?String(raw):safeURL(raw,base);
}
function save(name,content,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=filename(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function textOf(node) {
  if(!node)return '';
  const copy=node.cloneNode(true);
  copy.querySelectorAll('.katex').forEach(n=>{const math=n.querySelector('math');if(math){const value=math.cloneNode(true);value.querySelectorAll('annotation,annotation-xml').forEach(a=>a.remove());n.replaceWith(value.textContent);}});
  copy.querySelectorAll('script,style,button,input,.katex-html,[aria-hidden="true"]').forEach(n=>n.remove());
  copy.querySelectorAll('img').forEach(n=>n.replaceWith(` [图片：${n.alt||n.getAttribute('src')||''}] `));
  copy.querySelectorAll('br,p,div,li,pre,h1,h2,h3,tr').forEach(n=>n.append('\n'));
  return copy.textContent.replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
const QUESTION_ROOTS='.TiMu,.questionLi,.u-questionItem,[class*="questionBody"],.examPaper_subject,.subjectDet,.question-item';
function questions(doc, selector=QUESTION_ROOTS,readText=textOf) {
  const nodes=[...doc.querySelectorAll(selector)];
  return nodes.filter(node=>!nodes.some(other=>other!==node&&node.contains(other))).map((node,index)=>{
    let heading=node.querySelector('.fontLabel,.mark_name,.j-title .j-richTxt,[class*="questionInfo"],.subject_title,.subject_describe,.question-title,.question-stem,.qtContent,[data-question-title],.stem,.qeustion-content,.question-name .html-content-box,.titleTest span:not(.xvhao),.Zy_TItle,h2,h3');
    if(!heading){heading=node.cloneNode(true);heading.querySelectorAll('.mark_answer,.correctAnswerContent,.correct-answer,.rightAnswer,[data-role="correct-answer"],.correctAnswer,.correctAnswerBx,.myAnswerBx,.user-answer,.analysisDiv,.mark_answer_analysis,.analysis,.answer-analysis,.Zy_ulTop,.mark_letter,.choices,.options,.option-list,.optionList,.option-item,.answerBg,[data-cx-option],input,textarea,[contenteditable=true]').forEach(n=>n.remove());}
    const optionNodes=[...node.querySelectorAll('.Zy_ulTop li,.mark_letter li,.choices li,.option,.subject_item,.answerBg,[data-cx-option],.nodeLab,.option-item,.option-result,.optionList > div,[class*="index-module__optionBody"]')]
      .filter((n,i,a)=>!a.some(other=>other!==n&&other.contains(n)));
    const options=optionNodes.map((n,i)=>{
      const content=n.querySelector(':scope > .after');if(content)return readText(content);
      return readText(n).replace(new RegExp(`^${String.fromCharCode(65+i)}[.．、:：)）]\\s*`),'');
    });
    const answerNode=node.querySelector('.correctAnswerContent,.correct-answer,.rightAnswer,[data-role="correct-answer"],.correctAnswerBx .answerCon,.mark_answer .colorGreen,.correctAnswer,[data-correct-answer]');
    const userNode=node.querySelector('.myAnswerBx .answerCon,.user-answer,.mark_answer .colorDeep');
    const selected=optionNodes.flatMap((n,i)=>{
      const marked=e=>e.matches('input:checked,[aria-checked="true"],[aria-selected="true"]')||[...e.classList].some(name=>name==='selected'||/^check_answer(?:_|$)/.test(name));
      return marked(n)||[...n.querySelectorAll('input,[aria-checked],[aria-selected],[class]')].some(marked)?[String.fromCharCode(65+i)]:[];
    });
    if(!selected.length)selected.push(...[...node.querySelectorAll('input:checked')].map(n=>n.value));
    const answerFields=[...node.querySelectorAll('input[type=hidden]')].filter(n=>/^answer\d+$/.test(n.name||n.id));
    const hiddenAnswers=answerFields.map(n=>n.value).filter(Boolean);
    const inputs=[...node.querySelectorAll('textarea,input[type=text],input:not([type]),[contenteditable=true]')].map(n=>n.value??n.textContent).filter(Boolean);
    const imageNodes=[...node.querySelectorAll('img')].filter(n=>!n.matches('[aria-hidden=true],[role=presentation],.icon,.avatar,.loading'));
    const inAnswer=n=>Boolean(n.closest('.mark_answer,.correctAnswerContent,.correct-answer,.rightAnswer,[data-role="correct-answer"],.correctAnswerBx,.myAnswerBx,.analysisDiv,.mark_answer_analysis,.analysis,.answer-analysis'));
    const imageRecord=n=>({url:imageURL(n.currentSrc||n.getAttribute('src'),doc.baseURI),alt:n.alt||'题图'});
    const answerId=answerFields[0]&&(answerFields[0].name||answerFields[0].id).slice('answer'.length);
    return {id:node.dataset.questionid||node.dataset.questionId||answerId||node.dataset.id||node.getAttribute('data')||node.id||'',title:readText(heading)||`题目 ${index+1}`,options,answer:answerNode?readText(answerNode):'',userAnswer:userNode?readText(userNode):[...(selected.length?selected:hiddenAnswers),...inputs].join('\n'),
      analysis:readText(node.querySelector('.analysisDiv,.mark_answer_analysis,.analysis,.answer-analysis')),
      images:imageNodes.filter(n=>!inAnswer(n)).map(imageRecord).filter(n=>n.url),answerImages:imageNodes.filter(inAnswer).map(imageRecord).filter(n=>n.url)};
  });
}
function documentCount(doc) {
  const nodes=[...doc.querySelectorAll('#totalQuestionNum,#questionCount,input[name=totalQuestionNum],input[name=questionCount],[data-question-count],[data-total-question]')];
  const counts=nodes.map(node=>Number(node.value||node.getAttribute('data-question-count')||node.getAttribute('data-total-question'))).filter(count=>Number.isInteger(count)&&count>0&&count<=10000);
  for(const node of doc.querySelectorAll('p')){
    if(node.closest(QUESTION_ROOTS))continue;
    const match=node.textContent.trim().match(/^题量\s*[:：]\s*(\d+)(?=\s|满分|$)/);if(match){const count=Number(match[1]);if(count>0&&count<=10000)counts.push(count);}
  }
  const cards=[...doc.querySelectorAll('.answerCard [data-questionid],.answerCard [data-question-id],.answer-card [data-question-id],.topicNumber_list li[data]')];
  const ids=cards.map(node=>node.getAttribute('data-questionid')||node.getAttribute('data-question-id')||node.getAttribute('data')).filter(Boolean);
  if(!ids.length){const hidden=doc.querySelector('#questionIds,input[name=answerwqbid]');const raw=hidden?.value?.replace(/,$/,'');if(raw&&/^\d+(?:,\d+)*$/.test(raw))ids.push(...raw.split(','));}
  if(ids.length!==new Set(ids).size||counts.some(count=>count!==counts[0])||ids.length&&counts.length&&ids.length!==counts[0])throw new Error('完整题量或题号集合互相冲突，请在平台核对');
  return counts[0]||ids.length||null;
}
async function collectDocument(doc,signal,read=fetch,onProgress=()=>{},readQuestions=questions) {
  const firstURL=doc.baseURI,origin=new URL(firstURL).origin,visited=new Set(),pending=[firstURL],records=new Map();let expected=documentCount(doc),pages=0;
  const pagination='.pagination a[href],.pageNum a[href],.page-num a[href],.topicNumber_list a[href],.answerCard a[href],[data-question-page][href]';
  const contextURL=new URL(firstURL),identityKeys=['workId','workid','examId','examid','knowledgeid','knowledgeId','courseId','courseid','clazzId','clazzid'];
  const valid=url=>url.origin===origin&&url.pathname===contextURL.pathname&&identityKeys.every(key=>!contextURL.searchParams.has(key)||url.searchParams.get(key)===contextURL.searchParams.get(key));
  while(pending.length) {
    if(signal.aborted)throw new Error('导出读取已取消');if(pages>=100)throw new Error('超过 100 页，未导出不完整试卷');
    const url=pending.shift();if(visited.has(url))continue;visited.add(url);let current=doc;
    if(pages){const response=await read(url,{method:'GET',credentials:'same-origin',redirect:'error',signal});if(!response.ok)throw new Error(`分页读取 HTTP ${response.status}`);
      const html=await response.text();if(signal.aborted)throw new Error('导出读取已取消');current=new DOMParser().parseFromString(html,'text/html');const base=current.createElement('base');base.href=url;current.head.prepend(base);
      if(current.querySelector('input[type=password]'))throw new Error('分页返回登录页面，停止导出');
      if(current.querySelector('.font-cxsecret'))throw new Error('分页包含尚未解码的字体，请先在原页加载后导出');}
    const count=documentCount(current);if(expected&&count&&expected!==count)throw new Error('分页题量不一致，未导出');expected=expected||count;
    const items=readQuestions(current);if(!items.length)throw new Error('分页未读取到题目，未导出不完整试卷');
    items.forEach((item,i)=>{const key=item.id||JSON.stringify([item.title,item.options,item.images]);const previous=records.get(key);if(previous&&JSON.stringify(previous)!==JSON.stringify(item))throw new Error('同题号材料不一致，请在平台核对');records.set(key,item);});
    pages++;onProgress(`已读取 ${pages} 页、${records.size}${expected?'/'+expected:''} 道题`);
    for(const anchor of current.querySelectorAll(pagination)){const href=safeURL(anchor.getAttribute('href'),url,valid);if(href&&!visited.has(href)&&!pending.includes(href))pending.push(href);}
  }
  if(expected&&records.size!==expected)throw new Error(`当前只取得 ${records.size}/${expected} 道题；分页没有只读链接，请逐页加载，未导出不完整试卷`);
  return {items:[...records.values()],pages,expected,complete:expected!==null};
}
function markdown(title,items,answers=true) {
  return `# ${title}\n\n`+items.map((q,i)=>`## ${i+1}. ${q.title}\n\n${(q.options||[]).map((o,j)=>`${String.fromCharCode(65+j)}. ${o}`).join('\n')}\n\n${(q.images||[]).map(img=>`![${String(img.alt||'题图').replace(/[\[\]]/g,'')}](<${img.url}>)`).join('\n')}\n`+
    (answers?`${q.answer?`\n### 参考答案\n\n${q.answer}\n`:''}${q.userAnswer?`\n### 我的作答\n\n${q.userAnswer}\n`:''}${q.analysis?`\n### 解析\n\n${q.analysis}\n`:''}${(q.answerImages||[]).map(img=>`\n![答案或解析图](<${img.url}>)\n`).join('')}`:'')).join('\n---\n\n');
}
function crc32(bytes) {let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(entries) {
  const chunks=[],central=[];let offset=0,size=0;
  for(const [name,value] of Object.entries(entries)) {
    const key=encoder.encode(name),body=typeof value==='string'?encoder.encode(value):value;
    const local=new Uint8Array(30+key.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint32(14,crc32(body),true);lv.setUint32(18,body.length,true);lv.setUint32(22,body.length,true);lv.setUint16(26,key.length,true);local.set(key,30);
    const item=new Uint8Array(46+key.length),cv=new DataView(item.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc32(body),true);cv.setUint32(20,body.length,true);cv.setUint32(24,body.length,true);cv.setUint16(28,key.length,true);cv.setUint32(42,offset,true);item.set(key,46);
    chunks.push(local,body);central.push(item);offset+=local.length+body.length;size+=item.length;
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,central.length,true);view.setUint16(10,central.length,true);view.setUint32(12,size,true);view.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
async function docx(title,items,answers=true,readImage) {
  const entries={},relationships=[],images=[];
  let imageBytes=0;
  const paragraph=(text,bold=false)=>`<w:p><w:r>${bold?'<w:rPr><w:b/></w:rPr>':''}${String(text??'').split('\n').map((line,i)=>(i?'<w:br/>':'')+`<w:t xml:space="preserve">${xml(line)}</w:t>`).join('')}</w:r></w:p>`;
  let body=paragraph(title,true);
  for(const [index,q] of items.entries()) {
    body+=paragraph(`${index+1}. ${q.title}`,true)+(q.options||[]).map((o,i)=>paragraph(`${String.fromCharCode(65+i)}. ${o}`)).join('');
    for(const img of [...(q.images||[]),...(answers?q.answerImages||[]:[])]) {
      let loaded;try {loaded=readImage&&await readImage(img.url);}catch{}
      const image=loaded?.blob||loaded;
      if(!image||!['image/png','image/jpeg'].includes(image.type)||image.size>5*1024*1024||imageBytes+image.size>30*1024*1024){body+=paragraph(`[图片：${img.alt||'题图'}] ${img.url}`);continue;}
      imageBytes+=image.size;
      const id=images.length+1,ext=image.type==='image/jpeg'?'jpg':'png',width=loaded.width||600,height=loaded.height||360;
      const scale=Math.min(480/width,650/height,1),cx=Math.round(width*scale*9525),cy=Math.round(height*scale*9525);
      images.push(image);entries[`word/media/image${id}.${ext}`]=new Uint8Array(await image.arrayBuffer());
      relationships.push(`<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${id}.${ext}"/>`);
      body+=`<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xml(img.alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    }
    if(answers){if(q.answer)body+=paragraph(`参考答案：${q.answer}`);if(q.userAnswer)body+=paragraph(`我的作答：${q.userAnswer}`);if(q.analysis)body+=paragraph(`解析：${q.analysis}`);}
  }
  entries['[Content_Types].xml']='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  entries['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  entries['word/_rels/document.xml.rels']=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`;
  entries['word/document.xml']=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  return zip(entries);
}
async function loadImage(raw,signal,request=globalThis.GM_xmlhttpRequest) {
  const url=imageURL(raw,globalThis.location?.href);if(!url)throw new Error('图片地址不支持');
  let blob;
  if(url.startsWith('data:')){const response=await fetch(url,{signal});blob=await response.blob();}
  else blob=await new Promise((resolve,reject)=>{
    let handle,settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const abort=()=>{finish(new Error('图片读取已取消'));handle?.abort();};const timer=setTimeout(()=>{finish(new Error('图片读取超时'));handle?.abort();},15000);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    try{handle=request({method:'GET',url,responseType:'blob',timeout:12000,anonymous:true,onload:r=>{
      if(r.status!==200||typeof r.response?.arrayBuffer!=='function'||!/^image\/(png|jpeg|gif|webp|bmp)$/.test(r.response.type)||r.response.size>5*1024*1024){finish(new Error('图片格式或大小不支持'));return;}finish(null,r.response);
    },onerror:()=>finish(new Error('图片读取失败')),ontimeout:()=>finish(new Error('图片读取超时')),onabort:abort});}catch{finish(new Error('图片请求不可用'));}
  });
  if(signal?.aborted)throw new Error('图片读取已取消');if(blob.size>5*1024*1024)throw new Error('图片过大');
  const bitmap=await createImageBitmap(blob);try{
    if(signal?.aborted)throw new Error('图片读取已取消');const width=bitmap.width,height=bitmap.height;if(!width||!height||width*height>25000000)throw new Error('图片尺寸过大');
    if(['image/png','image/jpeg'].includes(blob.type))return {blob,width,height};
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(bitmap,0,0);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('图片转换失败');return {blob:png,width,height};
  }finally{bitmap.close();}
}
function usageRows(value) {
  return Array.isArray(value)?value.filter(row=>row&&typeof row.date==='string'&&typeof row.service==='string'&&typeof row.model==='string'&&['requests','failed','known','input','output','total'].every(key=>Number.isFinite(row[key])&&row[key]>=0)):[];
}
function flashcards(raw) {
  let cards;try{cards=JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('复习卡片需要有效 JSON 数组');}
  if(!Array.isArray(cards)||!cards.length||cards.length>100||cards.some(card=>!card||['question','answer','source'].some(key=>typeof card[key]!=='string'||!card[key].trim()||card[key].length>20000)))throw new Error('卡片必须包含问题、答案和资料依据，最多 100 张');
  return cards.map(({question,answer,source})=>({question,answer,source}));
}
function cardsTSV(cards) {const clean=value=>String(value).replace(/&/g,'&amp;').replace(/[<>]/g,c=>c==='<'?'&lt;':'&gt;').replace(/\t/g,' ').replace(/\r?\n/g,'<br>');return cards.map(c=>`${clean(c.question)}\t${clean(c.answer)}\t${clean(c.source)}`).join('\n');}
function recordUsage(store,service,model,usage,failed=false) {
  const key='learnova.usage.v1',rows=usageRows(store.get(key,[]));
  const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;let row=rows.find(r=>r.date===date&&r.service===service&&r.model===model);
  if(!row){row={date,service,model,requests:0,failed:0,known:0,input:0,output:0,total:0};rows.push(row);}
  row.requests++;if(failed)row.failed++;
  const input=usage?.prompt_tokens??usage?.input_tokens,output=usage?.completion_tokens??usage?.output_tokens;
  if(Number.isFinite(input)&&input>=0&&Number.isFinite(output)&&output>=0){row.known++;row.input+=input;row.output+=output;row.total+=Number.isFinite(usage.total_tokens)&&usage.total_tokens>=0?usage.total_tokens:input+output;}
  store.set(key,rows.slice(-300));return rows;
}
function pasteAssist(doc,enabled=true,page=doc.defaultView) {
  const events=['paste','copy','cut','contextmenu'],handler=event=>{
    if(!event.isTrusted||!event.target.closest?.('input,textarea,[contenteditable=true],.CodeMirror,.cm-editor,.monaco-editor,.edui-editor'))return;
    const text=event.clipboardData?.getData('text/plain');
    if(event.type==='paste'&&typeof text==='string') {
      if(event.target.closest('[readonly],[disabled],[aria-readonly=true],[contenteditable=false]'))return;
      const cm=event.target.closest('.CodeMirror')?.CodeMirror;
      const view=event.target.closest('.cm-editor')&&require('./editor-models.cjs').cmView(event.target.closest('.cm-editor'));
      if(cm&&cm.getOption?.('readOnly'))return;
      if(cm?.replaceSelection){event.preventDefault();cm.replaceSelection(text,'end','+input');}
      else if(view&&!view.state.readOnly){event.preventDefault();view.dispatch(view.state.replaceSelection(text));}
      else if(event.target.closest('.monaco-editor')){
        const editors=(page.monaco?.editor?.getEditors?.()||[]).filter(editor=>editor.getDomNode()?.contains(event.target));
        if(editors.length!==1)return;const editor=editors[0],readOnly=editor.getRawOptions?.().readOnly||editor.getOption?.(page.monaco.editor.EditorOption?.readOnly??91);
        if(readOnly||!editor.getSelection?.()||!editor.executeEdits)return;
        event.preventDefault();editor.pushUndoStop?.();editor.executeEdits('learnova-paste',[{range:editor.getSelection(),text,forceMoveMarkers:true}]);editor.pushUndoStop?.();
      }else if(event.target.closest('.ace_editor')?.env?.editor){
        const editor=event.target.closest('.ace_editor').env.editor;if(editor.getReadOnly?.())return;event.preventDefault();editor.insert(text);
      }else if(event.target.closest('[contenteditable=true]')){
        let win=page,editor=null;for(let depth=0;win&&depth<5&&!editor;depth++){
          try{editor=Object.values(win.UE?.instants||{}).find(instance=>instance.body?.ownerDocument===doc&&instance.body.contains(event.target));if(win===win.parent)break;win=win.parent;}catch{break;}
        }
        if(editor?.execCommand){event.preventDefault();editor.execCommand('inserthtml',text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/\r?\n/g,'<br>'));editor.fireEvent?.('contentchange');editor.sync?.();}
      }
    }
    event.stopImmediatePropagation();
  };
  if(enabled)events.forEach(type=>page.addEventListener(type,handler,true));
  return ()=>events.forEach(type=>page.removeEventListener(type,handler,true));
}
module.exports={safeURL,imageURL,filename,save,textOf,questions,documentCount,collectDocument,markdown,zip,docx,loadImage,usageRows,recordUsage,flashcards,cardsTSV,pasteAssist};
