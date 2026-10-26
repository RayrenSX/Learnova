// Freeze a shared workspace for repeatable integration tests; dependencies stay shared.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const destination=path.join(root,'test-results','study-snapshot-'+Date.now());
const directories=['src','tools','tests','vendor','dist','pintia/src','pintia/tools','pintia/tests'];
const files=['package.json','package-lock.json','pintia/package.json','pintia/package-lock.json','学习通学习助手.user.js','学习助手完整版.user.js','pintia/Pintia代码助手.user.js'];
function inventory(){
  const found=[];
  const visit=directory=>{for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isDirectory())visit(name);else if(entry.isFile())found.push(name);}};
  directories.forEach(visit);found.push(...files);
  return Object.fromEntries(found.sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
}
fs.mkdirSync(destination,{recursive:true});
let manifest;
for(let attempt=0;attempt<3;attempt++) {
  const before=inventory();
  for(const file of Object.keys(before)){const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
  const after=inventory();
  if(JSON.stringify(before)===JSON.stringify(after)){manifest=after;break;}
}
if(!manifest)throw new Error('Workspace kept changing while copying; no stable verification snapshot created');
fs.symlinkSync(path.join(root,'node_modules'),path.join(destination,'node_modules'),'junction');
fs.symlinkSync(path.join(root,'pintia/node_modules'),path.join(destination,'pintia/node_modules'),'junction');
fs.writeFileSync(path.join(destination,'source-manifest.json'),JSON.stringify(manifest,null,2));
console.log(destination);
