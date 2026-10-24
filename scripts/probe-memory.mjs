import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {createSampler} from './lib/sampler.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 长期验证/qingtu.exe');
const session=new NativeSession('http://127.0.0.1:4448');const report={app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),started:new Date().toISOString(),samples:[]};let sampler;
try{
 await session.open(app);await session.resizeViewport(1440,844);await session.native('load_document',{id:'benchmark-m-v1'});await session.refresh();await sleep(10000);
 report.viewport=await session.execute('return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,nodes:document.querySelectorAll(".mind-node").length};');
 sampler=await createSampler(app);const started=performance.now();
 for(let index=0;index<32;index++){const remaining=started+index*1000-performance.now();if(remaining>0)await sleep(remaining);report.samples.push(await sampler.sample());}
 const sorted=report.samples.map(s=>s.privateBytes/1048576).sort((a,b)=>a-b);report.p95MiB=sorted[Math.ceil(sorted.length*.95)-1];
 console.log(JSON.stringify({app,viewport:report.viewport,p95MiB:report.p95MiB,first:report.samples[0],last:report.samples.at(-1)},null,2));
}finally{if(sampler)await sampler.close();await session.close();await fs.writeFile('.tooling/soak-tests/memory-probe-'+(process.env.QINGTU_PROBE_LABEL??'diagnostic')+'.json',JSON.stringify(report,null,2));}
