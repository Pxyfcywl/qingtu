import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const base='http://127.0.0.1:4447',app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/最终验证 中文安装目录/qingtu.exe');
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const server=spawn('powershell.exe',['-NoProfile','-File',path.resolve('scripts/test-window-server.ps1'),'-AppPath',app],{windowsHide:true,stdio:['pipe','pipe','inherit']});
const lines=createInterface({input:server.stdout})[Symbol.asyncIterator]();if(!JSON.parse((await lines.next()).value).ready)throw Error('Window helper unavailable');
async function control(operation,args={}){server.stdin.write(JSON.stringify({operation,...args})+'\n');const r=JSON.parse((await lines.next()).value);if(!r.ok)throw Error(r.error);return r;}
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;
const execute=(script,args=[])=>req('POST',`/session/${session}/execute/sync`,{script,args});
async function native(command,args={}){const r=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',args:[command,args]});if(!r.ok)throw Error(r.error);return r.value;}
const report={app,time:new Date().toISOString(),exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),launches:[],fileOpens:[],status:'running'};
let original;const importedIds=[];
try{
 await new Promise(r=>setTimeout(r,1500));const info=await native('bootstrap');original=info.recentId;
 const primary=(await control('count')).pids;if(primary.length!==1)throw Error('Initial process count is not one');
 const association=await control('association');if(association.command!==`"${app}" "%1"`)throw Error('Installation command does not quote the program path');report.associationCommand=association.command;
 for(let run=1;run<=10;run++){const launched=await control('launch');const current=(await control('count')).pids;if(JSON.stringify(current)!==JSON.stringify(primary))throw Error('Single instance identity changed');report.launches.push({run,primaryProcessId:primary[0],secondaryExitCode:launched.secondaryExitCode});}
 const source=await native('load_document',{id:'benchmark-s-v1'});const file=path.resolve('.tooling/benchmark-native/中文 空格 双击项目.qmap');
 for(let run=1;run<=10;run++){
  const snapshot=structuredClone(source);snapshot.title=`文件关联检查第${run}次`;snapshot.nodes[snapshot.rootId].title=snapshot.title;
  await native('export_snapshot',{document:snapshot,path:file});await control('open-project',{path:file});
  let displayed=false;for(let attempt=0;attempt<100;attempt++){if(await execute('return document.querySelector(".document-button")?.textContent.includes(arguments[0]);',[snapshot.title])){displayed=true;break;}await new Promise(r=>setTimeout(r,50));}
  if(!displayed)throw Error('Associated file did not open in the existing window');
  const current=await native('bootstrap');if(!current.documents.some(d=>d.id===current.recentId&&d.title===snapshot.title)||JSON.stringify((await control('count')).pids)!==JSON.stringify(primary))throw Error('Incorrect file routing or duplicate instance');
  importedIds.push(current.recentId);report.fileOpens.push({run,id:current.recentId,title:snapshot.title,primaryProcessId:primary[0]});
 }
 if(await execute('return !!document.querySelector("[role=alert]");'))throw Error('Desktop integration produced a UI error');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{
 if(original){await native('load_document',{id:original}).catch(()=>{});await req('POST',`/session/${session}/refresh`,{}).catch(()=>{});await new Promise(r=>setTimeout(r,1500));}
 for(const id of importedIds)await native('delete_document',{id}).catch(()=>{});
 await req('DELETE',`/session/${session}`).catch(()=>{});server.stdin.end();await fs.writeFile('.tooling/benchmark-native/desktop-integrations.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,launches:report.launches.length,fileOpens:report.fileOpens.length,error:report.error}));
}
