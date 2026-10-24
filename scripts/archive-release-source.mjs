import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fingerprint=JSON.parse((await fs.readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
const label=process.argv[3]??'';if(label&&!/^[a-z][a-z0-9-]{0,23}$/.test(label))throw Error('Use a short lowercase snapshot label');
const target=path.resolve('validation/source',fingerprint.version+'-'+fingerprint.sourceSnapshotSha256.slice(0,8)+(label?'-'+label:''));
try{await fs.access(target);throw Error('Snapshot already exists: '+target);}catch(error){if(error.code!=='ENOENT')throw error;}
const production=new Map(fingerprint.sourceFiles.map(f=>[f.path,f]));
const names=new Set(production.keys());
async function collect(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await collect(file);else if(item.isFile())names.add(file.replaceAll('\\','/'));}}
for(const dir of ['scripts','tests','docs'])await collect(dir);
for(const file of ['README.md','playwright.config.ts','轻图桌面端_需求实现与量化验收规范.md'])names.add(file);
try{await fs.access('validation/fixtures/0.1.4/structure.json');names.add('validation/fixtures/0.1.4/structure.json');}catch(error){if(error.code!=='ENOENT')throw error;}
for(const name of ['安装与使用.md',`安装与使用-${fingerprint.version}.md`,'验收记录.md',`验收记录-${fingerprint.version}.md`,`更新说明-${fingerprint.version}.md`]){
 const file='releases/'+name;try{await fs.access(file);names.add(file);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const records=[];
for(const file of [...names].sort()){
 if(path.isAbsolute(file)||file.split('/').includes('..'))throw Error('Unsafe source path');
 const bytes=await fs.readFile(file),hash=digest(bytes),expected=production.get(file);
 if(expected&&(expected.sha256!==hash||expected.bytes!==bytes.length))throw Error('Source changed during archive: '+file);
 const destination=path.join(target,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes,{flag:'wx'});
 records.push({path:file,bytes:bytes.length,sha256:hash,production:!!expected});
}
const calculated=digest(Buffer.from(records.filter(r=>r.production).map(r=>r.path+'\0'+r.sha256+'\n').join('')));
if(calculated!==fingerprint.sourceSnapshotSha256)throw Error('Fingerprint mismatch');
await fs.writeFile(path.join(target,'source-manifest.json'),JSON.stringify({version:fingerprint.version,sourceSnapshotSha256:calculated,createdAt:new Date().toISOString(),scope:'Production source and supporting scripts/tests/docs; no dependencies, toolchains or frozen binary fixtures',files:records},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({target,files:records.length,production:production.size,sourceSnapshotSha256:calculated}));
