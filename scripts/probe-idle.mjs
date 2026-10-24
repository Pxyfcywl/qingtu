import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {createSampler} from './lib/sampler.mjs';
import {mediaDocument,verifyMediaLifecycle} from './lib/media-lifecycle.mjs';
import {saveNew,exerciseDocument} from './lib/soak-actions.mjs';
const session=new NativeSession('http://127.0.0.1:4448'),app=path.resolve('.tooling/install-tests/0.1.2 长期验证/qingtu.exe');let diagnostics,sampler;const report={};
try{
 await session.open(app);diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);
 const origin=await session.execute('return location.origin;'),target=(await diagnostics.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 const {sessionId}=await diagnostics.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const fixture=JSON.parse(await fs.readFile('.tooling/fixtures/documents/M.json','utf8'));fixture.id='idle-'+crypto.randomUUID();fixture.title='空闲定位 '+fixture.id.slice(-6);await saveNew(session,fixture);
 const prep=JSON.parse(await fs.readFile('.tooling/soak-tests/preparation.json','utf8')),a=mediaDocument(prep.audio.id,'idle-'+crypto.randomUUID(),'定位音轨 A'),b=structuredClone(a);b.id='idle-'+crypto.randomUUID();b.title='定位音轨 B';for(const doc of[a,b])await saveNew(session,doc);
 await session.native('load_document',{id:a.id});await session.refresh();await sleep(800);await verifyMediaLifecycle(session,b);await exerciseDocument(session,fixture);await sleep(10000);
 sampler=await createSampler(app);report.before=await sampler.sample();
 await session.execute(`window.__idleChanges={mutations:0,transforms:0,frames:0,last:''};window.__idleObserver=new MutationObserver(rows=>window.__idleChanges.mutations+=rows.length);window.__idleObserver.observe(document.querySelector('.react-flow__viewport'),{subtree:true,attributes:true,childList:true,characterData:true});window.__idleRaf=()=>{const s=window.__idleChanges;s.frames++;const value=document.querySelector('.react-flow__viewport').style.transform;if(value!==s.last)s.transforms++;s.last=value;window.__idleFrame=requestAnimationFrame(window.__idleRaf);};window.__idleFrame=requestAnimationFrame(window.__idleRaf);`);
 await diagnostics.request('Profiler.enable',{},sessionId);await diagnostics.request('Profiler.start',{},sessionId);await sleep(5000);const result=await diagnostics.request('Profiler.stop',{},sessionId);await diagnostics.request('Profiler.disable',{},sessionId);
 report.after=await sampler.sample();report.changes=await session.execute('window.__idleObserver.disconnect();cancelAnimationFrame(window.__idleFrame);return window.__idleChanges;');
 report.nodes=await session.execute('return Array.from(document.querySelectorAll(".mind-node")).map(e=>({id:e.dataset.nodeId,width:e.offsetWidth,height:e.offsetHeight}));');
 report.cpuProfile=result.profile;report.hot=result.profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,20).map(n=>({fn:n.callFrame.functionName,url:n.callFrame.url,hits:n.hitCount,line:n.callFrame.lineNumber}));
 console.log(JSON.stringify({changes:report.changes,hot:report.hot,memoryMiB:[report.before.privateBytes/1048576,report.after.privateBytes/1048576]},null,2));
}finally{if(sampler)await sampler.close();diagnostics?.close();await session.close();await fs.writeFile('.tooling/soak-tests/idle-profile.json',JSON.stringify(report,null,2));}
