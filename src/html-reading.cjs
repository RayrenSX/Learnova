// Native HTML subject books: use the site's read entry, scroll and next links.
// Completion is owned by the platform; no readlog or finish-job calls here.
function pageURL(doc) { try { return new URL(doc.URL); } catch { return null; } }
function subjectURL(raw, base) {
  try {
    const url=new URL(raw,base);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && /(^|\.)chaoxing\.com$/i.test(url.hostname)
      && /^\/(?:mooc-ans\/)?(?:zt\/portal\/[^/]+|ztnodedetailcontroller\/visitnodedetail)\/?$/.test(url.pathname) ? url : null;
  } catch { return null; }
}
function subjectPage(doc) { return Boolean(subjectURL(doc.URL)); }
function scrollContainer(root) {
  const doc=root.ownerDocument;
  for(let node=root.parentElement;node;node=node.parentElement){
    if(node.scrollHeight>node.clientHeight+1 && /auto|scroll/.test(doc.defaultView.getComputedStyle(node).overflowY))return node;
  }
  return doc.scrollingElement;
}
function sameSubject(from,to,book) {
  return to.origin===from.origin && to.searchParams.get('courseId')===book
    && to.searchParams.get('_from_')===from.searchParams.get('_from_')
    && to.searchParams.get('_fromV2_')===from.searchParams.get('_fromV2_');
}
function subject(doc) {
  const url=subjectURL(doc.URL),main=doc.querySelector('#courseMainBox'),root=main?.querySelector('#contentDescriptionBox, #caContentBox .ans-cc');
  if (!url || !root || (!root.textContent.trim()&&!root.querySelector('img,video,audio'))) return null;
  const links=[...doc.querySelectorAll('.course_section a[href]')].map(element=>({element,url:subjectURL(element.getAttribute('href'),url)})).filter(x=>x.url);
  const book=url.searchParams.get('courseId') || links[0]?.url.searchParams.get('courseId');
  if(!book || !/^\d+$/.test(book))return null;
  const current=url.searchParams.get('knowledgeId') || root.querySelector('[kid]')?.getAttribute('kid') || root.getAttribute('kid') || main.querySelector('.ans-cc[kid]')?.getAttribute('kid');
  if(!current || !/^\d+$/.test(current))return null;
  let next=[...main.querySelectorAll('a.nodeItem[href]')].find(e=>e.textContent.replace(/\s/g,'')==='下一页');
  let target=next&&subjectURL(next.getAttribute('href'),url);
  if (!target) {
    const index=links.findIndex(x=>x.url.searchParams.get('knowledgeId')===current);
    if(index>=0&&index+1<links.length){next=links[index+1].element;target=links[index+1].url;}
  }
  if(target && (!sameSubject(url,target,book) || target.searchParams.get('knowledgeId')===current))return null;
  return {kind:'subject',root,main,scroller:scrollContainer(root),identity:`${book}:${current}`,title:doc.querySelector('#nodeTitleEle')?.textContent.trim() || '',next:target?next:null};
}
function entry(doc) {
  const url=pageURL(doc);
  if(!url || !/(^|\.)chaoxing\.com$/i.test(url.hostname) || !/^\/(?:mooc-ans\/)?coursedata\/readjobv2\/show\/?$/.test(url.pathname))return null;
  const root=doc.querySelector('.readInfo'),tile=root?.querySelector('.readZT');
  if(!tile)return null;
  const control=[...tile.querySelectorAll('span,[role=button],button,a')].find(e=>e.textContent.trim()==='去阅读');
  return control?{kind:'entry',root,control,identity:doc.URL}:null;
}
module.exports={subjectURL,subjectPage,subject,entry};
