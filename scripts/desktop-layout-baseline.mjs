import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {useCdpExecution} from './lib/cdp-execution.mjs';
import {observeRuntime} from './lib/runtime-observer.mjs';
import {saveNew,nodeHash,waitSaved} from './lib/soak-actions.mjs';
import {visibleModel} from './lib/png-audit.mjs';
import {installLayoutObserver,stableScene,captureWholeLayout} from './lib/layout-capture.mjs';
import {inspectGeometry} from './lib/geometry-oracle.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),root=path.resolve('.tooling/native-geometry',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const samples=(process.env.QINGTU_GEOMETRY_SAMPLES??'S').split(',');if(samples.some(s=>!['S','M','L'].includes(s)))throw Error('Choose S,M,L');
const report={status:'running',caseId:'native-geometry-patrol-baseline',app,exeSha256:sha(await fs.readFile(app)),started:new Date().toISOString(),cases:[],harnessFiles:[],scope:'Normal canvas only, real middle-pointer pans at minimum zoom. Actual DOM rectangles/SVG paths from identical settled global layout across all patrol views. Baselines only; not the T06 six-mutation matrix or performance results.'};
for(const file of ['scripts/desktop-layout-baseline.mjs','scripts/lib/layout-capture.mjs','scripts/lib/geometry-oracle.mjs','scripts/lib/cdp-execution.mjs','scripts/lib/native.mjs'])report.harnessFiles.push({file,sha256:sha(await fs.readFile(file))});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');let diagnostics,transport,monitor,original;const created=[];
try{
 await session.open(app);const info=await session.native('bootstrap');original=info.recentId;if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated configuration');
 diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);const origin=await session.execute('return location.origin;'),target=(await diagnostics.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 const {sessionId}=await diagnostics.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});await diagnostics.request('Page.enable',{},sessionId);
 await diagnostics.request('Page.addScriptToEvaluateOnNewDocument',{source:`(${installLayoutObserver.toString()})();`},sessionId);
 transport=await useCdpExecution(session,diagnostics,sessionId);monitor=await observeRuntime(diagnostics,sessionId);
 for(const name of samples){
  const item={name,status:'running'};report.cases.push(item);
  try{
   const fixtureFile='.tooling/fixtures/documents/'+name+'.json',bytes=await fs.readFile(fixtureFile),doc=JSON.parse(bytes);doc.id='geometry-'+crypto.randomUUID();created.push(doc.id);item.fixture={file:fixtureFile,sha256:sha(bytes),totalNodes:Object.keys(doc.nodes).length,visibleNodes:visibleModel(doc).length};
   await fs.writeFile(path.join(root,name+'-fixture.json'),JSON.stringify(doc,null,2));await saveNew(session,doc);await session.native('load_document',{id:doc.id});await session.refresh();await session.resizeViewport(1440,844);
   await session.waitFor('return !!document.querySelector(".mind-node")&&!document.querySelector(".busy-overlay");',[],30000);
   await stableScene(session);for(let n=0;n<12;n++){const s=await stableScene(session);if(s.viewport.zoom<=.25001)break;await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"out"}));');}
   const capture=await captureWholeLayout(session,diagnostics,sessionId,visibleModel(doc).map(n=>n.id),{onProgress:p=>console.log(JSON.stringify({sample:name,...p}))});
   await fs.writeFile(path.join(root,name+'-capture.json'),JSON.stringify(capture,null,2));item.patrol=capture.history;item.complete=capture.complete;
   if(!capture.complete)throw Error('Could not obtain one settled complete layout across normal viewport pans');
   item.geometry=inspectGeometry(capture.nodes,capture.edges);await waitSaved(session);const saved=await session.native('load_document',{id:doc.id});item.nodeDataUnchanged=nodeHash(saved)===nodeHash(doc);if(!item.nodeDataUnchanged)throw Error('Patrol mutated node data');
   if(!item.geometry.passed)throw Error('Measured geometry contains overlaps or unrelated-node crossings');if(monitor.errors.length)throw Error('Runtime errors during patrol');
   item.status='passed';item.finalViewport=capture.finalScene.viewport;
  }catch(error){item.status='failed';item.error=String(error);process.exitCode=1;}
  console.log(JSON.stringify({sample:name,status:item.status,error:item.error,geometry:item.geometry}));await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));if(item.status!=='passed')break;
 }
 report.runtimeErrors=monitor.errors;report.status=report.cases.length===samples.length&&report.cases.every(c=>c.status==='passed')?'passed':'failed';report.browserVersion=session.capabilities.browserVersion;
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{
 if(original&&session.id)await session.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed')for(const id of created)await session.native('delete_document',{id}).catch(()=>{});
 monitor?.stop();await transport?.restore().catch(()=>{});diagnostics?.close();await session.close();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,root,error:report.error}));
}
