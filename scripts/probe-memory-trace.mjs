import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {createSampler} from './lib/sampler.mjs';
import {memoryTrace} from './lib/memory-trace.mjs';
import {mediaDocument,verifyMediaLifecycle} from './lib/media-lifecycle.mjs';
import {saveNew,exerciseDocument} from './lib/soak-actions.mjs';
const app=path.resolve('.tooling/install-tests/0.1.2 长期验证/qingtu.exe'),session=new NativeSession('http://127.0.0.1:4448');
const root=path.resolve('.tooling/soak-tests/memory-trace-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const report={app,status:'running',stages:[]};let diagnostics,sampler;
try{
 await session.open(app);diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);sampler=await createSampler(app);
 const graphics=await diagnostics.request('SystemInfo.getInfo');report.graphics=graphics.gpu;
 const fixture=JSON.parse(await fs.readFile('.tooling/fixtures/documents/M.json','utf8'));fixture.id='trace-'+crypto.randomUUID();fixture.title='内存定位 '+fixture.id.slice(-6);await saveNew(session,fixture);
 const preparation=JSON.parse(await fs.readFile('.tooling/soak-tests/preparation.json','utf8')),a=mediaDocument(preparation.audio.id,'trace-'+crypto.randomUUID(),'内存音轨 A '+fixture.id.slice(-6)),b=structuredClone(a);b.id='trace-'+crypto.randomUUID();b.title='内存音轨 B '+fixture.id.slice(-6);for(const doc of[a,b])await saveNew(session,doc);
 await session.native('load_document',{id:fixture.id});await session.refresh();await sleep(10000);
 const capture=async name=>{const memory=await sampler.sample(),trace=await memoryTrace(diagnostics,path.join(root,name+'.json'));report.stages.push({name,memory,trace});console.log(JSON.stringify({stage:name,totalMiB:memory.privateBytes/1048576,processes:trace.processes.map(p=>({name:p.name,pid:p.pid,allocations:p.topAllocators.slice(0,8)}))}));};
 await capture('baseline');await session.selectDocument(a.id,a.title);await verifyMediaLifecycle(session,b);await exerciseDocument(session,fixture);await sleep(10000);await capture('after-cycle');
 await sleep(20000);await capture('idle-30s');report.status='captured';
}catch(error){report.status='failed';report.error=String(error);console.error(error);process.exitCode=1;}
finally{if(sampler)await sampler.close();diagnostics?.close();await session.close();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(root);}
