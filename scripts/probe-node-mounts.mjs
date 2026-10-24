import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 长期验证/qingtu.exe'),session=new NativeSession('http://127.0.0.1:4448');
const report={app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),started:new Date().toISOString(),stages:[]};
try{
 await session.open(app);const info=await session.native('bootstrap'),source=info.documents.find(d=>d.id==='benchmark-m-v1'),other=info.documents.find(d=>d.id!==source.id&&d.nodeCount<=10);if(!other)throw Error('Need a small reference document');
 await session.native('load_document',{id:other.id});await session.refresh();await sleep(500);
 await session.execute(`window.__mountSamples=[];window.__mountObserver=new MutationObserver(()=>{const nodes=document.querySelectorAll('.mind-node');if(window.__mountSamples.length<300)window.__mountSamples.push({at:performance.now(),nodes:nodes.length,images:document.querySelectorAll('.mind-node img').length});});window.__mountObserver.observe(document.querySelector('.react-flow__viewport'),{subtree:true,childList:true});`);
 await session.selectDocument(source.id,source.title);await sleep(1500);
 report.stages.push({stage:'switch-M',samples:await session.execute('return window.__mountSamples;')});
 await session.click('[data-node-id="M-0"] .branch-toggle');await sleep(300);await session.execute('window.__mountSamples=[];');await session.click('[data-node-id="M-0"] .branch-toggle');await sleep(1500);
 report.stages.push({stage:'unfold-M',samples:await session.execute('window.__mountObserver.disconnect();return window.__mountSamples;')});
 await sleep(600);console.log(JSON.stringify(report.stages.map(s=>({stage:s.stage,maxNodes:Math.max(...s.samples.map(r=>r.nodes)),maxImages:Math.max(...s.samples.map(r=>r.images)),last:s.samples.at(-1)})),null,2));
}finally{await session.close();await fs.writeFile('.tooling/soak-tests/mounts-'+(process.env.QINGTU_PROBE_LABEL??Date.now())+'.json',JSON.stringify(report,null,2));}
