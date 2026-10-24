import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {useCdpExecution} from './lib/cdp-execution.mjs';
import {observeRuntime} from './lib/runtime-observer.mjs';
import {saveNew} from './lib/soak-actions.mjs';
import {visibleModel} from './lib/png-audit.mjs';
import {installLayoutObserver,stableScene,captureWholeLayout} from './lib/layout-capture.mjs';
import {performLayoutAction} from './lib/layout-actions.mjs';
import {inspectGeometry} from './lib/geometry-oracle.mjs';
const samples=(process.env.QINGTU_GEOMETRY_SAMPLES??'S,M,L').split(',');if(samples.some(s=>!['S','M','L'].includes(s))||new Set(samples).size!==samples.length)throw Error('Choose distinct S,M,L samples');
const kinds=['add','delete','fold','width','side','image'],app=path.resolve(process.env.QINGTU_TEST_APP),root=path.resolve('.tooling/layout-matrix',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={status:'running',fullT06GatePassed:false,caseId:'T06-native-mutations',app,exeSha256:sha(await fs.readFile(app)),samples,kinds,repetitions:20,started:new Date().toISOString(),results:[],harnessFiles:[],scope:'Selected S/M/L samples, six workloads x20. Normal canvas only, native pointer pans; actual DOM rectangles and SVG cubic paths must share one identical settled global layout. DOM selection/range/dropdown events, WebDriver toolbar/fold clicks. Image workload reloads actual media, not a native file-picker test. No latency/resource claim.'};
for(const file of ['scripts/desktop-layout-matrix.mjs','scripts/lib/layout-actions.mjs','scripts/lib/layout-capture.mjs','scripts/lib/geometry-oracle.mjs','scripts/lib/cdp-execution.mjs','scripts/lib/native.mjs','scripts/lib/cdp.mjs','scripts/lib/runtime-observer.mjs','scripts/lib/soak-actions.mjs','scripts/lib/tree-oracle.mjs','scripts/lib/png-audit.mjs','scripts/verify-layout-matrix.mjs']){
 const bytes=await fs.readFile(file);report.harnessFiles.push({file,sha256:sha(bytes)});const saved=path.join(root,'harness',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,bytes);
}
const checkpoint=()=>fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');await checkpoint();
const s=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');let devtools,transport,monitor,original;const created=[];
try{
 await s.open(app);const info=await s.native('bootstrap');original=info.recentId;if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated test configuration');
 devtools=await DevTools.connect(s.capabilities['ms:edgeOptions'].debuggerAddress);const origin=await s.execute('return location.origin;'),page=(await devtools.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 const {sessionId:target}=await devtools.request('Target.attachToTarget',{targetId:page.targetId,flatten:true});await devtools.request('Page.enable',{},target);await devtools.request('Page.addScriptToEvaluateOnNewDocument',{source:`(${installLayoutObserver.toString()})();`},target);
 transport=await useCdpExecution(s,devtools,target);monitor=await observeRuntime(devtools,target);report.browserVersion=s.capabilities.browserVersion;
 for(const name of samples){
  const fixtureFile='.tooling/fixtures/documents/'+name+'.json',bytes=await fs.readFile(fixtureFile),doc=JSON.parse(bytes);doc.id='layout-matrix-'+crypto.randomUUID();created.push(doc.id);
  const item={sample:name,fixture:{file:fixtureFile,sha256:sha(bytes),totalNodes:Object.keys(doc.nodes).length},status:'running',cases:[]};report.results.push(item);
  await fs.writeFile(path.join(root,name+'-fixture.json'),JSON.stringify(doc,null,2));await saveNew(s,doc);await s.native('load_document',{id:doc.id});await s.refresh();await s.resizeViewport(1440,844);await s.waitFor('return !!document.querySelector(".mind-node")&&!document.querySelector(".busy-overlay");',[],30000);
  for(let n=0;n<12;n++){if((await stableScene(s)).viewport.zoom<=.25001)break;await s.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"out"}));');}
  const baseline=await captureWholeLayout(s,devtools,target,visibleModel(doc).map(n=>n.id));await fs.writeFile(path.join(root,name+'-baseline.json'),JSON.stringify(baseline,null,2));if(!baseline.complete||!inspectGeometry(baseline.nodes,baseline.edges).passed)throw Error('Baseline geometry not complete and valid');
  const cardId=visibleModel(doc).find(n=>n.kind==='card'&&n.childIds.length)?.id;if(!cardId)throw Error('Fixture has no foldable card');const context={session:s,devtools,target,documentId:doc.id,doc,cardId,added:[]};
  for(const kind of kinds)for(let run=1;run<=20;run++){
   const result={kind,run,status:'running'};item.cases.push(result);await checkpoint();
   try{
    Object.assign(result,await performLayoutAction(context,kind,run));const ids=visibleModel(context.doc).map(n=>n.id),capture=await captureWholeLayout(s,devtools,target,ids);
    capture.model={rootId:context.doc.rootId,nodes:Object.fromEntries(Object.values(context.doc.nodes).map(n=>[n.id,{id:n.id,parentId:n.parentId,childIds:n.childIds,childrenCollapsed:n.childrenCollapsed}]))};
    const file=name+'-'+kind+'-'+String(run).padStart(2,'0')+'.json';await fs.writeFile(path.join(root,file),JSON.stringify(capture,null,2));result.capture=file;result.patrol=capture.history;
    if(!capture.complete)throw Error('Cannot prove one complete stable normal layout');result.geometry=inspectGeometry(capture.nodes,capture.edges);if(!result.geometry.passed)throw Error('Node overlap or curve crossing detected');
    if(kind==='image'){result.imageLoads=await s.execute('return window.__layoutAudit.imageLoads;');if(result.imageLoads<1)throw Error('Image workload observed no actual decoded image load');}
    if(monitor.errors.length)throw Error('Runtime errors recorded');result.status='passed';
   }catch(error){result.status='failed';result.error=String(error);throw error;}
   await checkpoint();console.log(JSON.stringify({sample:name,kind,run,status:result.status,nodes:result.geometry.nodes,edges:result.geometry.edges,passes:result.patrol.length}));
  }
  item.status='passed';await checkpoint();
 }
 report.status='passed';report.fullT06GatePassed=samples.length===3&&['S','M','L'].every(name=>samples.includes(name))&&report.results.reduce((n,r)=>n+r.cases.length,0)===360;
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{
 report.runtimeErrors=monitor?.errors??[];if(original&&s.id)await s.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed')for(const id of created)await s.native('delete_document',{id}).catch(()=>{});
 monitor?.stop();await transport?.restore().catch(()=>{});devtools?.close();await s.close();report.finished=new Date().toISOString();await checkpoint();console.log(JSON.stringify({status:report.status,fullT06GatePassed:report.fullT06GatePassed,root,error:report.error}));
}
