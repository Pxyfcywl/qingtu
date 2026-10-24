import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {hashBytes} from './lib/content-fixture.mjs';
const queueFile=path.resolve('.tooling/acceptance-queue-20261016.json');
const root=path.resolve('.tooling/acceptance-diagnostics',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const app=path.resolve('.tooling/install-tests/0.1.2 长期验证/qingtu.exe');
const expected='54666b4b408615fd382949e3550b10dd265e486b3d6401f657c0f72bcc5e671c';
if(hashBytes(await fs.readFile(app))!==expected)throw Error('Diagnostic program changed');
const state={status:'waiting-for-native-queue',started:new Date().toISOString(),queueFile,app,exeSha256:expected,steps:[],scope:'Diagnostics only; never substitute for full release acceptance'};
const save=()=>fs.writeFile(path.join(root,'state.json'),JSON.stringify(state,null,2)+'\n');await save();
async function run(name,args){
 const step={name,args,status:'running',started:new Date().toISOString(),log:path.join(root,name+'.log')};state.steps.push(step);await save();
 const file=await fs.open(step.log,'wx');
 try{Object.assign(step,await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:process.env,stdio:['ignore',file.fd,file.fd],windowsHide:true});child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));}));}
 finally{await file.close();}
 step.finished=new Date().toISOString();step.status=step.code===0?'passed':'failed';await save();return step;
}
try{
 const deadline=Date.now()+150*60000;let queue;
 while(Date.now()<deadline){
  try{queue=JSON.parse(await fs.readFile(queueFile,'utf8'));}catch(error){if(!(error instanceof SyntaxError))throw error;}
  if(queue?.finished)break;await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!queue?.finished)throw Error('Native acceptance queue did not finish');
 state.queueResult={status:queue.status,finished:queue.finished,error:queue.error??null};state.status='running';await save();
 await run('source-fingerprint',['scripts/release-manifest.mjs','--fingerprint-only']);
 // These are reproductions; a red result remains red but does not stop the
 // independent heap investigation against the retained diagnostic executable.
 await run('interaction-reproductions',['node_modules/@playwright/test/cli.js','test','tests/ui/interaction-reliability.spec.ts','--workers=1','--retries=0']);
 for(const [name,extra]of [['original-ipc-audit',[]],['readonly-db-audit',['--verify-via-readonly-db']]]){
  if(hashBytes(await fs.readFile(app))!==expected)throw Error('Diagnostic program changed while waiting');
  const before=new Set(await fs.readdir('.tooling/soak-tests'));
  const step=await run(name,['scripts/desktop-soak.mjs','--probe','--collect-all','--heap-snapshots',...extra]);
  const added=(await fs.readdir('.tooling/soak-tests')).filter(n=>n.startsWith('probe-')&&!before.has(n));
  if(added.length!==1)throw Error('Cannot identify the diagnostic probe report');
  step.report=path.resolve('.tooling/soak-tests',added[0],'report.json');const report=JSON.parse(await fs.readFile(step.report,'utf8'));
  const round=report.rounds[0];if(!round?.snapshotStart||!round?.snapshotEnd)throw Error('Probe did not produce both heap snapshots: '+(report.error??''));
  step.resourceStatus=report.status;step.retainedGrowthMiB=round.heapGrowthMiB;await save();
  for(const phase of ['start','end']){
   const source=phase==='start'?round.snapshotStart.file:round.snapshotEnd.file;
   await run(name+'-'+phase+'-analysis',['scripts/analyze-heap-snapshot.mjs',source,path.join(root,name+'-'+phase+'-heap.json')]);
  }
 }
 state.status='completed';
}catch(error){state.status='failed';state.error=String(error);process.exitCode=1;}
finally{state.finished=new Date().toISOString();await save();console.log(JSON.stringify({root,...state},null,2));}
