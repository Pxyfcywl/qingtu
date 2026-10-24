import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const base=process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4446';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;
const script=(code,args=[])=>req('POST',`/session/${session}/execute/async`,{script:code,args});
const sync=(code,args=[])=>req('POST',`/session/${session}/execute/sync`,{script:code,args});
async function native(name,args={}){const r=await script('const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',[name,args]);if(!r.ok)throw Error(r.error);return r.value;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const output=path.resolve('.tooling/scale-tests');await fs.mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),app,note:'结构负载检查；复用示例素材，不等同于规范的 50 MiB 固定 M/L 数据和布局稳定性能验收。',workloads:[],status:'running'};
let original;
try {
 await sleep(1200);const info=await native('bootstrap');original=info.recentId;
 const source=await native('load_document',{id:info.documents.find(d=>d.title==='数学学习地图').id});
 for(const config of [{name:'M',total:500,visible:200,depth:8,counts:{text:350,card:100,image:40,video:10}},{name:'L',total:2000,visible:500,depth:12,counts:{text:1750,card:200,image:40,video:10}}]){
  const kinds=Object.entries(config.counts).flatMap(([kind,count])=>Array(count).fill(kind));
  let seed=20261015;for(let i=kinds.length-1;i>1;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=1+seed%i;[kinds[i],kinds[j]]=[kinds[j],kinds[i]];}
  const textIndex=kinds.indexOf('text');[kinds[0],kinds[textIndex]]=[kinds[textIndex],kinds[0]];
  const doc={id:crypto.randomUUID(),schemaVersion:1,title:`${config.name} 结构负载 ${config.total}节点`,rootId:'n0',revision:0,layoutMode:'auto',viewport:{x:200,y:400,zoom:1},updatedAt:Date.now(),nodes:{}};
  const templates=Object.fromEntries(['text','card','image','video'].map(kind=>[kind,Object.values(source.nodes).find(n=>n.kind===kind&&n.id!==source.rootId)]));
  for(let i=0;i<config.total;i++){
   const kind=kinds[i];const node=structuredClone(templates[kind]);node.id='n'+i;node.kind=kind;node.title=kind==='image'||kind==='video'?'':`知识记录 ${i}`;node.childIds=[];node.contentCollapsed=false;node.childrenCollapsed=i===1;node.position={x:0,y:0};node.side='right';
   let parent=0;if(i>=config.visible)parent=1;else if(i>=3&&i<=config.depth+1)parent=i-1;else if(i>config.depth+1)parent=i%3===0?2:0;
   node.parentId=i?'n'+parent:null;doc.nodes[node.id]=node;if(i)doc.nodes[node.parentId].childIds.push(node.id);
  }
  const saved=await native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});
  const loaded=await native('load_document',{id:doc.id});if(Object.keys(loaded.nodes).length!==config.total)throw Error('节点保存数量不一致');
  await fs.writeFile(path.join(output,config.name+'.json'),JSON.stringify(loaded));
  const start=performance.now();await req('POST',`/session/${session}/refresh`,{});
  for(let attempt=0;attempt<100;attempt++){if(await sync('return !!document.querySelector("[data-node-id=n0] .branch-toggle")'))break;await sleep(100);}
  await sleep(1500);
  const shape=await sync('return {nodes:document.querySelectorAll(".mind-node").length,videoSources:document.querySelectorAll("video[src]").length,error:document.querySelector("[role=alert]")?.textContent,title:document.title}');
  if(shape.error||shape.videoSources)throw Error(JSON.stringify(shape));
  const samples=await script(`const done=arguments[arguments.length-1];(async()=>{const samples=[];for(let i=0;i<100;i++){const btn=document.querySelector('[data-node-id=n0] .branch-toggle');if(!btn)throw Error('root not mounted');const t=performance.now();btn.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push(performance.now()-t);if(document.querySelector('[role=alert]'))throw Error('UI error');}done({ok:true,samples});})().catch(e=>done({error:String(e)}));`);
  if(!samples.ok)throw Error(samples.error);
  const final=await native('load_document',{id:doc.id});if(Object.keys(final.nodes).length!==config.total)throw Error('折叠后持久化节点丢失');
  const sorted=[...samples.samples].sort((a,b)=>a-b);
  report.workloads.push({...config,id:doc.id,sha256:crypto.createHash('sha256').update(JSON.stringify(loaded)).digest('hex'),shape,totalScenarioMs:performance.now()-start,measurement:'root click to two requestAnimationFrame callbacks; not a full layout-stability measurement',samplesMs:samples.samples,medianMs:sorted[50],p95Ms:sorted[94],maximumMs:sorted.at(-1),savedRevision:saved.revision});
  console.log(JSON.stringify(report.workloads.at(-1)));
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{if(original)await native('load_document',{id:original}).catch(()=>{});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await req('DELETE',`/session/${session}`).catch(()=>{});}
