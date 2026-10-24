import fs from 'node:fs/promises';
import path from 'node:path';
const base='http://127.0.0.1:4444';
async function request(method,endpoint,body){
  const response=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(data.value?.error)throw new Error(JSON.stringify(data.value));return data.value;
}
const app=path.resolve('.tooling/target/debug/qingtu.exe');
const result=await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app},'ms:edgeOptions':{args:[]}}}});
const session=result.sessionId;
const command=(name,args={})=>request('POST',`/session/${session}/execute/async`,{script:`const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v}),e=>done({ok:false,error:String(e)}));`,args:[name,args]});
const execute=(script,args=[])=>request('POST',`/session/${session}/execute/sync`,{script,args});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={started:new Date().toISOString(),checks:[]};
function check(condition,message){if(!condition)throw new Error(message);report.checks.push(message);}
try {
  await sleep(1500);
  const info=await command('bootstrap');check(info.ok,'桌面 IPC bootstrap 成功');
  if(!info.value.initialized){
    const target=path.resolve('.tooling/desktop-tests/资料库存储 自定义');
    const init=await command('initialize_storage',{directory:target});check(init.ok,'自定义中文空格存储目录初始化成功');
    await request('POST',`/session/${session}/refresh`,{});await sleep(2000);
  }
  const status=await execute('return {title:document.title,cards:document.querySelectorAll(".node-card").length,error:document.querySelector("[role=alert]")?.textContent,body:document.body.innerText.slice(0,2000)}');
  check(status.cards>=2,'真实 WebView2 渲染内容卡片');check(!status.error,'桌面窗口没有错误提示');
  const screenshot=await request('GET',`/session/${session}/screenshot`);
  await fs.mkdir('.tooling/desktop-tests',{recursive:true});await fs.writeFile('.tooling/desktop-tests/window.png',Buffer.from(screenshot,'base64'));
  const library=(await command('bootstrap')).value;check(library.documents.length>0,'示例导图已经保存到 SQLite');
  const id=library.documents[0].id;const original=await command('load_document',{id});check(original.ok,'可从 SQLite 读回导图');
  const destination=path.resolve('.tooling/desktop-tests/项目 备份.qmap');
  const exported=await command('export_project',{id,path:destination});check(exported.ok,'完整项目导出成功');
  const imported=await command('import_project',{path:destination});check(imported.ok,'完整项目导入成功');
  check(JSON.stringify(original.value.nodes)===JSON.stringify(imported.value.nodes),'项目往返节点与素材引用一致');
  const moved=path.resolve('.tooling/desktop-tests/迁移后的 资料库');
  const migration=await command('migrate_storage',{directory:moved});check(migration.ok,'自定义资料库迁移成功');
  const reloaded=await command('load_document',{id});check(reloaded.ok&&JSON.stringify(reloaded.value.nodes)===JSON.stringify(original.value.nodes),'迁移后文档内容完整');
  report.storagePath=migration.value.storagePath;report.status='passed';
} catch(error){report.status='failed';report.error=String(error);throw error;}
finally {
  await fs.mkdir('.tooling/desktop-tests',{recursive:true});await fs.writeFile('.tooling/desktop-tests/report.json',JSON.stringify(report,null,2));
  await request('DELETE',`/session/${session}`).catch(()=>{});
  console.log(JSON.stringify(report,null,2));
}
