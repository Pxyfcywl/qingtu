import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const base=process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4447';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;
async function native(command,args={}){const r=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',args:[command,args]});if(!r.ok)throw Error(r.error);return r.value;}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(k=>!['id','revision','updatedAt'].includes(k)||value.schemaVersion===undefined).sort().map(key=>[key,canonical(value[key])])):value;
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:(sorted[9]+sorted[10])/2,p95Ms:sorted[18],maximumMs:sorted.at(-1),targetMs:8000,passed:sorted[18]<=8000};};
const dir=path.resolve(process.env.QINGTU_REPORT_DIR??'.tooling/benchmark-native');await fs.mkdir(dir,{recursive:true});const output=path.join(dir,'M 完整项目 往返.qmap');
const report={app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),time:new Date().toISOString(),mediaMiB:49.347378730773926,samples:[],status:'running',method:'Installed Release IPC request to response; export includes hashes and final replacement, import ends after SQLite commit. Canvas loading is not part of this metric.'};
let original;
try{
 await new Promise(r=>setTimeout(r,1500));const info=await native('bootstrap');original=info.recentId;
 if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated test configuration');
 const doc=await native('load_document',{id:process.env.QINGTU_DOCUMENT_ID??'benchmark-m-v1'});
 for(let run=1;run<=20;run++){
  let start=performance.now();await native('export_snapshot',{document:doc,path:output});const exportMs=performance.now()-start;
  start=performance.now();const imported=await native('import_project',{path:output});const importMs=performance.now()-start;
  if(JSON.stringify(canonical(imported))!==JSON.stringify(canonical(doc)))throw Error('Project semantic roundtrip mismatch');
  await native('delete_document',{id:imported.id});report.samples.push({run,exportMs,importMs,semanticRoundtrip:true});console.log(run,Math.round(exportMs),Math.round(importMs));
 }
 report.export=stats(report.samples.map(s=>s.exportMs));report.import=stats(report.samples.map(s=>s.importMs));report.archiveBytes=(await fs.stat(output)).size;
 if(!report.export.passed||!report.import.passed)throw Error('Project import/export latency exceeds the 8000 ms P95 budget');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{if(original)await native('load_document',{id:original}).catch(()=>{});await fs.writeFile(path.join(dir,'project-roundtrip.json'),JSON.stringify(report,null,2));await req('DELETE',`/session/${session}`).catch(()=>{});console.log(JSON.stringify({status:report.status,export:report.export,import:report.import,error:report.error},null,2));}
