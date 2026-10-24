import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const base='http://127.0.0.1:4447',app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/最终验证 中文安装目录/qingtu.exe');
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const server=spawn('powershell.exe',['-NoProfile','-File',path.resolve('scripts/test-window-server.ps1'),'-AppPath',app],{windowsHide:true,stdio:['pipe','pipe','inherit']});
const lines=createInterface({input:server.stdout})[Symbol.asyncIterator]();
const first=JSON.parse((await lines.next()).value);if(!first.ready)throw Error('Window test server not ready');
async function windowCommand(operation){server.stdin.write(JSON.stringify({operation})+'\n');const response=JSON.parse((await lines.next()).value);if(!response.ok)throw Error(response.error);return response;}
let session,original,docId;
const create=async()=>{session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;await new Promise(r=>setTimeout(r,1400));};
const execute=(script,args=[])=>req('POST',`/session/${session}/execute/sync`,{script,args});
async function native(command,args={}){const r=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',args:[command,args]});if(!r.ok)throw Error(r.error);return r.value;}
const report={app,time:new Date().toISOString(),exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),samples:[],status:'running',method:'Real WebDriver title input kept focused; normal WM_CLOSE is requested while UI reports unsaved/saving; no Enter, blur or forced process termination.'};
try{
 await create();const info=await native('bootstrap');original=info.recentId;
 const doc=await native('load_document',{id:'benchmark-s-v1'});doc.id='close-test-'+crypto.randomUUID();docId=doc.id;doc.revision=0;
 await native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:'seed-close'}});await native('load_document',{id:doc.id});await req('POST',`/session/${session}/refresh`,{});await new Promise(r=>setTimeout(r,1000));
 for(let run=1;run<=10;run++){
  await execute(`document.querySelector('[data-node-id="S-0"] .node-label').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);await new Promise(r=>setTimeout(r,30));
  const element=await req('POST',`/session/${session}/element`,{using:'css selector',value:'input[aria-label="节点标题"]'});const id=element['element-6066-11e4-a52e-4f735466cecf'];
  const expected=`关闭保存检查第${run}次`;
  await req('POST',`/session/${session}/element/${id}/value`,{text:expected});
  await req('POST',`/session/${session}/element/${id}/value`,{text:'X'});
  const state=await execute('return {status:document.querySelector(".save-indicator")?.textContent,focused:document.activeElement?.matches("input.node-title-input"),value:document.querySelector("input.node-title-input")?.value};');
  if(!state.focused||!['未保存','保存中'].includes(state.status)||state.value!==expected+'X')throw Error('Close precondition was not a focused unsaved draft: '+JSON.stringify(state));
  const closed=await windowCommand('close');if(closed.exitCode!==0)throw Error('Application did not report a clean exit: '+JSON.stringify(closed));await req('DELETE',`/session/${session}`).catch(()=>{});session=null;
  await create();const recovered=await native('load_document',{id:doc.id});
  if(recovered.nodes[doc.rootId].title!==expected+'X'||recovered.title!==expected+'X')throw Error('Title draft was lost on normal close');
  report.samples.push({run,statusBeforeClose:state.status,focusedBeforeClose:state.focused,exitCode:closed.exitCode,recoveredRevision:recovered.revision,persistedTitle:recovered.title});console.log(run,recovered.title);
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{
 if(session){if(original){await native('load_document',{id:original}).catch(()=>{});await req('POST',`/session/${session}/refresh`,{}).catch(()=>{});await new Promise(r=>setTimeout(r,1000));}if(docId&&report.status==='passed')await native('delete_document',{id:docId}).catch(()=>{});await req('DELETE',`/session/${session}`).catch(()=>{});}
 server.stdin.end();await fs.writeFile('.tooling/benchmark-native/close-drafts.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,count:report.samples.length,error:report.error}));
}
