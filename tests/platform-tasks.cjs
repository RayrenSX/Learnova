const assert=require('node:assert/strict');
const {nativeTask,nativeFinished}=require('../src/platform-tasks.cjs');
function fixture(raw,attachments) {
  const parent={attachments};parent.parent=parent;
  const win={parent,frameElement:{getAttribute:()=>raw}};
  return {nodeType:9,defaultView:win};
}
const passed={jobid:'done',isPassed:true,job:true,property:{mid:'material',module:'video',name:'已完成'}};
const pending={property:{_jobid:42},isPassed:false};
assert.equal(nativeTask(fixture('{"jobid":42}',[passed,pending])).passed,false);
assert.equal(nativeFinished(fixture('{"_jobid":"done"}',[passed,pending])),true);
assert.equal(nativeFinished(fixture('{"jobid":"other"}',[passed,pending])),false);
for (const raw of ['{bad','[]','{}','{"jobid":{}}','{"jobid":true}','{"jobid":""}']) {
  assert.equal(nativeTask(fixture(raw,[{jobid:{},isPassed:true},passed])),null);
}
assert.equal(nativeTask(fixture('{"jobid":"done"}',[passed,{...passed,isPassed:false}])),null);
const conflict=fixture('{"jobid":"done"}',[passed]);
conflict.defaultView.attachments=[passed,{...passed,isPassed:false}];
assert.equal(nativeTask(conflict),null); // A farther ancestor must not hide conflicting metadata.
const denied=fixture('{"jobid":"done"}',null);
Object.defineProperty(denied.defaultView.parent,'attachments',{get(){throw new Error('Cross-origin');}});
assert.equal(nativeTask(denied),null);
assert.equal(nativeTask(fixture('{"jobid":"done"}',[null,{},passed])).id,'done');
assert.equal(nativeTask(fixture('{"jobid":"done"}',[{...passed,isPassed:'false'}])).passed,false);
const sandboxed=fixture('{"jobid":"done"}',[passed]);
global.document=sandboxed;global.unsafeWindow=sandboxed.defaultView;
sandboxed.defaultView={parent:null}; // The userscript world cannot see page attachment globals.
try {assert.equal(nativeTask(sandboxed).passed,true);} finally {delete global.document;delete global.unsafeWindow;}
console.log('PASS native task identity, malformed/ambiguous metadata and inaccessible ancestors');
