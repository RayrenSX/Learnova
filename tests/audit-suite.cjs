// Run the complete isolated suite in four disjoint processes, then verify coverage.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
(async()=>{
  const total=4;
  const exits=process.argv.includes('--aggregate') ? [] : await Promise.all(Array.from({length:total},(_,i)=>new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(__dirname,'run.cjs')],{cwd:root,env:{...process.env,CX_TEST_FILTER:'',CX_TEST_SHARD:`${i+1}/${total}`},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>process.stdout.write(`[${i+1}] ${data}`));
    child.stderr.on('data',data=>process.stderr.write(`[${i+1}] ${data}`));
    child.on('error',error=>{console.error(error);resolve(1);});child.on('exit',resolve);
  })));
  const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'学习通学习助手.user.js'))).digest('hex');
  const shards=Array.from({length:total},(_,i)=>JSON.parse(fs.readFileSync(path.join(root,`test-results/report-shard-${i+1}-${total}.json`),'utf8')));
  if(shards.some(s=>s.scriptSha256!==digest))throw new Error('Shard artifact hash mismatch');
  const results=shards.flatMap(s=>s.results);
  if(new Set(results.map(r=>r.name)).size!==results.length)throw new Error('Duplicate scenario coverage');
  const scenarioCount=shards[0].scenarioCount;
  if(!Number.isInteger(scenarioCount)||shards.some(s=>s.scenarioCount!==scenarioCount)||results.length!==scenarioCount
    || new Set(results.map(r=>r.index)).size!==scenarioCount || results.some(r=>r.index<0||r.index>=scenarioCount))throw new Error('Incomplete scenario coverage');
  results.sort((a,b)=>a.index-b.index);
  const result={environment:shards[0].environment,version:shards[0].version,scriptSha256:digest,filter:null,shards:total,results};
  fs.writeFileSync(path.join(root,'test-results/report.json'),JSON.stringify(result,null,2));
  console.log(`COMPLETE ${results.filter(r=>r.passed).length}/${results.length} full-suite scenarios`);
  if(exits.some(code=>code!==0)||results.some(r=>!r.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
