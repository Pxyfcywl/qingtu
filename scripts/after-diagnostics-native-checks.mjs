import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {hashBytes} from './lib/content-fixture.mjs';
const dependency=path.resolve('.tooling/acceptance-diagnostics/2026-10-15T18-33-41-897Z/state.json');
const output=path.resolve('.tooling/after-diagnostics-native-20261016.json');
const app=path.resolve('.tooling/install-tests/0.1.2 验证安装/qingtu.exe');
const expected='1b33a75f9226bb9244531186f41101784cda14a40f9d97723160a94a94984f42';
if(hashBytes(await fs.readFile(app))!==expected)throw Error('Installed program changed');
const state={status:'waiting-for-independent-diagnostics',dependency,app,exeSha256:expected,started:new Date().toISOString(),steps:[],scope:'This one native batch covers only the body matrix and node/depth boundaries; full specification still has other gates'};
const save=()=>fs.writeFile(output,JSON.stringify(state,null,2)+'\n');await save();
try{
 const deadline=Date.now()+150*60000;let prior;
 while(Date.now()<deadline){
  try{prior=JSON.parse(await fs.readFile(dependency,'utf8'));}catch(error){if(!(error instanceof SyntaxError))throw error;}
  if(prior?.finished)break;await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!prior?.finished)throw Error('Diagnostic continuation did not finish');
 if(prior.status!=='completed')throw Error('Inspect incomplete diagnostic continuation before starting more native sessions');
 state.dependencyResult={status:prior.status,finished:prior.finished};state.status='running';await save();
 for(const [script,folder]of [['desktop-body-matrix','body-matrix'],['desktop-node-boundaries','node-boundaries']]){
  if(hashBytes(await fs.readFile(app))!==expected)throw Error('Installed program changed while waiting');
  const before=new Set(await fs.readdir(path.join('.tooling',folder)).catch(error=>{if(error.code==='ENOENT')return [];throw error;}));
  const step={script,started:new Date().toISOString(),status:'running',log:path.resolve(`.tooling/${script}-20261016-${Date.now()}.log`)};state.steps.push(step);await save();
  const file=await fs.open(step.log,'wx');
  try{Object.assign(step,await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[`scripts/${script}.mjs`],{cwd:process.cwd(),env:{...process.env,QINGTU_TEST_APP:app,QINGTU_DRIVER_URL:'http://127.0.0.1:4448'},stdio:['ignore',file.fd,file.fd],windowsHide:true});child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));
  }));}finally{await file.close();}
  const added=(await fs.readdir(path.join('.tooling',folder))).filter(n=>!before.has(n));
  if(added.length!==1)throw Error('Cannot identify native report directory');
  step.report=path.resolve('.tooling',folder,added[0],'report.json');const report=JSON.parse(await fs.readFile(step.report,'utf8'));
  step.finished=new Date().toISOString();step.status=step.code===0&&report.status==='passed'&&report.exeSha256===expected?'passed':'failed';await save();
  if(step.status!=='passed')throw Error(script+' failed; inspect retained inputs and report');
 }
 state.status='passed';
}catch(error){state.status='failed';state.error=String(error);process.exitCode=1;}
finally{state.finished=new Date().toISOString();await save();console.log(JSON.stringify(state,null,2));}
