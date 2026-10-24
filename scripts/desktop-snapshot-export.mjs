import fs from 'node:fs/promises';
import path from 'node:path';
const base='http://127.0.0.1:4446';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;
async function native(command,args={}){const r=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',args:[command,args]});if(!r.ok)throw Error(r.error);return r.value;}
const report={app,status:'running',checks:[]};let original,imported;
try{
 await new Promise(r=>setTimeout(r,1200));const info=await native('bootstrap');original=info.recentId;
 const before=await native('load_document',{id:original});const unsaved=structuredClone(before);unsaved.title='尚未写入资料库的恢复内容';unsaved.nodes[unsaved.rootId].title=unsaved.title;
 const destination=path.resolve('.tooling/release-tests/未保存内容 恢复备份.qmap');
 await native('export_snapshot',{document:unsaved,path:destination});
 imported=await native('import_project',{path:destination});
 if(imported.title!==unsaved.title||JSON.stringify(imported.nodes)!==JSON.stringify(unsaved.nodes))throw Error('Snapshot export lost unsaved content');
 report.checks.push('真实桌面 IPC 导出与重新导入未保存快照，正文和全部节点一致');
 const after=await native('load_document',{id:original});if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Snapshot export changed the original document');
 report.checks.push('原资料库文档没有被快照导出改写');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{if(imported)await native('delete_document',{id:imported.id}).catch(()=>{});if(original)await native('load_document',{id:original}).catch(()=>{});await fs.writeFile('.tooling/release-tests/snapshot-export.json',JSON.stringify(report,null,2));await req('DELETE',`/session/${session}`).catch(()=>{});console.log(report);}
