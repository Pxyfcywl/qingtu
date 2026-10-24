import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const base=process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4446';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
async function request(method,endpoint,body){const r=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const result=await r.json();if(result.value?.error)throw new Error(JSON.stringify(result.value));return result.value;}
const result=await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}});
const session=result.sessionId;
const execute=(script,args=[])=>request('POST',`/session/${session}/execute/sync`,{script,args});
const asyncScript=(script,args=[])=>request('POST',`/session/${session}/execute/async`,{script,args});
const native=(name,args={})=>asyncScript('const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v}),e=>done({ok:false,error:String(e)}));',[name,args]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={checks:[],status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),browserVersion:result.capabilities?.browserVersion};
const check=(condition,message)=>{if(!condition)throw new Error(message);report.checks.push(message);};
const dir=path.resolve(process.env.QINGTU_REPORT_DIR??'.tooling/release-tests');await fs.mkdir(dir,{recursive:true});
try {
 await sleep(800);let info=await native('bootstrap');check(info.ok,'Release 桌面 IPC 可用');
 if(!info.value.initialized){const init=await native('initialize_storage',{directory:path.join(dir,'自定义存储位置')});check(init.ok,'首次自定义存储位置');await request('POST',`/session/${session}/refresh`,{});}
 else {const example=info.value.documents.find(d=>d.title==='数学学习地图');if(example&&info.value.recentId!==example.id){await native('load_document',{id:example.id});await request('POST',`/session/${session}/refresh`,{});}}
 await sleep(1200);
 report.frontendScripts=await execute('return Array.from(document.querySelectorAll("script[src]")).map(s=>s.src);');
 check(await execute('return !!document.querySelector(".node-card .card-body")'),'Release 卡片和公式已经显示');
 check(await execute('return !document.querySelector("[role=alert]")'),'没有启动错误');
 const result=await asyncScript(`const done=arguments[arguments.length-1];(async()=>{
  const card=Array.from(document.querySelectorAll('.node-card')).find(e=>e.innerText.includes('勾股定理'));if(!card)throw Error('缺少示例卡片');
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  card.querySelector('.body-toggle').click();await frame();const bodyHidden=!card.querySelector('.card-body');
  const childrenVisible=document.body.innerText.includes('证明方法');card.querySelector('.body-toggle').click();await frame();
  card.querySelector('.branch-toggle').click();await frame();const branchesHidden=!document.body.innerText.includes('证明方法');
  const bodyVisible=!!card.querySelector('.card-body');card.querySelector('.branch-toggle').click();await frame();
  card.querySelector('[aria-label="编辑卡片正文"]').click();for(let i=0;i<50&&!document.querySelector('[contenteditable=true]');i++)await new Promise(r=>setTimeout(r,20));
  const editor=!!document.querySelector('[contenteditable=true]');document.querySelector('[aria-label="完成编辑"]')?.click();
  done({ok:true,bodyHidden,childrenVisible,branchesHidden,bodyVisible,editor});
 })().catch(e=>done({ok:false,error:String(e)}));`);
 check(result.ok&&result.bodyHidden&&result.childrenVisible,'收起正文保留后代');check(result.branchesHidden&&result.bodyVisible,'收起后代保留正文');check(result.editor,'真实 WebView2 可打开编辑器');
 const video=await asyncScript(`const done=arguments[arguments.length-1];const btn=document.querySelector('[aria-label="播放视频"]');if(!btn){done({ok:false,error:'没有示例视频'});}else{btn.click();setTimeout(()=>{const video=document.querySelector('video');done({ok:!!video,width:video?.videoWidth,height:video?.videoHeight,error:video?.error?.message});},1200);}`);
 report.video=video;check(video.ok&&video.width>0&&!video.error,'本地 MP4 实际解码播放');
 await execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(200);
 const screenshot=await request('GET',`/session/${session}/screenshot`);await fs.writeFile(path.join(dir,'release-window.png'),Buffer.from(screenshot,'base64'));
 report.video=video;
 const pngPath=path.join(dir,'导图 导出.png');
 await fs.unlink(pngPath).catch(error=>{if(error.code!=='ENOENT')throw error;});
 await execute('window.dispatchEvent(new CustomEvent("qingtu-export-png",{detail:arguments[0]}));',[pngPath]);
 let pngExists=false;
 for(let i=0;i<100;i++){try{const stat=await fs.stat(pngPath);if(stat.size>1000){pngExists=true;break;}}catch{}await sleep(100);}
 check(pngExists,'完整可见结构 PNG 成功导出');
 check(!(await execute('return document.querySelector("[role=alert]")?.textContent')),'导出未触发错误');
 await sleep(500);info=await native('bootstrap');report.library=info.value.storagePath;
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{await fs.writeFile(path.join(dir,'functional.json'),JSON.stringify(report,null,2));await request('DELETE',`/session/${session}`).catch(()=>{});console.log(JSON.stringify(report,null,2));}
