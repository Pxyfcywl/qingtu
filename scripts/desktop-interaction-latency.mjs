import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {useCdpExecution} from './lib/cdp-execution.mjs';
import {observeRuntime} from './lib/runtime-observer.mjs';
import {saveNew,waitSaved,nodeHash} from './lib/soak-actions.mjs';
import {installLayoutObserver,scene,stableScene,centerWorld} from './lib/layout-capture.mjs';
import {visibleModel} from './lib/png-audit.mjs';
import {installInteractionProbe} from './lib/interaction-probe.mjs';
const names=(process.env.QINGTU_LATENCY_SAMPLES??'S,M,L').split(',');
if(names.some(n=>!['S','M','L'].includes(n))||new Set(names).size!==names.length)throw Error('Choose distinct fixed samples');
const app=path.resolve(process.env.QINGTU_TEST_APP),root=path.resolve('.tooling/interaction-latency',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={status:'running',formalPresentationGatePassed:false,app,exeSha256:sha(await fs.readFile(app)),started:new Date().toISOString(),scope:'Installed Release; 10 warmups then 100 trusted pointer interactions per workload/sample. Event-capture start, DOM mutation, first correct rAF, and two successive unchanged scene transitions. DOM/rAF proxy only; Windows presentation correlation remains required. Body fold only, not all fold/selection states or full T06 geometry.',harnessFiles:[],samples:[]};
for(const file of ['scripts/desktop-interaction-latency.mjs','scripts/lib/interaction-probe.mjs','scripts/lib/layout-capture.mjs','scripts/lib/cdp-execution.mjs','scripts/lib/cdp.mjs','scripts/lib/native.mjs','scripts/lib/soak-actions.mjs','scripts/lib/png-audit.mjs','scripts/lib/runtime-observer.mjs']){
 const bytes=await fs.readFile(file);report.harnessFiles.push({file,sha256:sha(bytes)});const out=path.join(root,'harness',file);await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,bytes);
}
const checkpoint=()=>fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
const stats=values=>{const s=values.toSorted((a,b)=>a-b);return {count:s.length,medianMs:(s[49]+s[50])/2,p95Ms:s[94],maxMs:s.at(-1)};};
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');let devtools,transport,monitor,original;const created=[];
try{
 await session.open(app);const info=await session.native('bootstrap');original=info.recentId;
 if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated test config');
 devtools=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);const origin=await session.execute('return location.origin;');
 const page=(await devtools.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));const {sessionId:target}=await devtools.request('Target.attachToTarget',{targetId:page.targetId,flatten:true});
 await devtools.request('Page.enable',{},target);
 await devtools.request('Page.addScriptToEvaluateOnNewDocument',{source:`(${installLayoutObserver.toString()})();(${installInteractionProbe.toString()})(${scene.toString()});`},target);
 transport=await useCdpExecution(session,devtools,target);monitor=await observeRuntime(devtools,target);report.browserVersion=session.capabilities.browserVersion;
 for(const name of names){
  const file='.tooling/fixtures/documents/'+name+'.json',bytes=await fs.readFile(file),doc=JSON.parse(bytes);doc.id='latency-'+crypto.randomUUID();created.push(doc.id);
  const item={name,status:'running',fixture:{file,sha256:sha(bytes),totalNodes:Object.keys(doc.nodes).length},workloads:[]};report.samples.push(item);await saveNew(session,doc);await session.native('load_document',{id:doc.id});await session.refresh();await session.resizeViewport(1440,844);await stableScene(session);
  const visible=visibleModel(doc),ids=[doc.rootId,visible.find(n=>n.parentId===doc.rootId&&['text','card'].includes(n.kind))?.id],card=visible.find(n=>n.kind==='card');
  if(!ids[1]||!card)throw Error('Required fixture nodes missing');
  for(const kind of ['select','fold']){
   const workload={kind,status:'running',warmup:[],observations:[]};item.workloads.push(workload);await checkpoint();
   if(kind==='select'){await centerWorld(session,devtools,target,ids[1]);await session.click(`[data-node-id="${ids[1]}"] .drag-handle`);}
   for(let n=0;n<110;n++){
    const id=kind==='select'?ids[n%2]:card.id;await centerWorld(session,devtools,target,id);await waitSaved(session);
    const selector=`[data-node-id="${id}"] ${kind==='select'?'.drag-handle':'.body-toggle'}`;
    const expected=kind==='fold'?await session.execute('return document.querySelector(arguments[0]).getAttribute("aria-expanded")!=="true";',[selector]):undefined;
    const position=await session.execute('return window.__interactionProbe.arm(arguments[0]);',[{id,kind,selector,...(expected===undefined?{}:{expected})}]);
    await devtools.request('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...position},target);
    await devtools.request('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...position},target);
    await session.waitFor('return !!window.__interactionProbe.read();',[],15000);const value=await session.execute('return window.__interactionProbe.read();');
    if(value.error||!value.trusted||value.firstFrameMs===null||value.settledFrameMs===null)throw Error('Invalid measurement: '+JSON.stringify(value));
    (n<10?workload.warmup:workload.observations).push(value);if(monitor.errors.length)throw Error('Runtime exception');
    if((n+1)%10===0){await checkpoint();console.log(JSON.stringify({name,kind,completed:n+1}));}
   }
   workload.firstFrame=stats(workload.observations.map(v=>v.firstFrameMs));workload.settledFrame=stats(workload.observations.map(v=>v.settledFrameMs));
   workload.proxyFeedbackWithin50ms=workload.firstFrame.p95Ms<=50;workload.proxyLayoutWithinTarget=workload.settledFrame.p95Ms<=(name==='S'?100:name==='M'?200:600);workload.status='measured';await waitSaved(session);
  }
  const saved=await session.native('load_document',{id:doc.id});if(nodeHash(saved)!==nodeHash(doc))throw Error('Even fold count did not restore canonical node state');item.status='measured';await checkpoint();
 }
 report.status='measured';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{
 report.runtimeErrors=monitor?.errors??[];
 if(original&&session.id){await session.native('load_document',{id:original}).catch(()=>{});await session.refresh().catch(()=>{});}
 if(report.status==='measured')for(const id of created)await session.native('delete_document',{id}).catch(()=>{});
 monitor?.stop();await transport?.restore().catch(()=>{});devtools?.close();await session.close();report.finished=new Date().toISOString();await checkpoint();console.log(JSON.stringify({status:report.status,root,error:report.error}));
}
