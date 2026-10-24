// One local continuation of this acceptance run; no scheduler or recurring task.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {hashBytes} from './lib/content-fixture.mjs';
const observation=process.argv[2];
if(!observation)throw Error('Pass the exact already-running observation report path');
const output=path.resolve('.tooling/acceptance-queue-20261016.json');
const app=path.resolve('.tooling/install-tests/0.1.2 验证安装/qingtu.exe');
const expected='1b33a75f9226bb9244531186f41101784cda14a40f9d97723160a94a94984f42';
if(hashBytes(await fs.readFile(app))!==expected)throw Error('Installed test program changed');
const state={status:'waiting-for-resource-observation',started:new Date().toISOString(),observation:path.resolve(observation),app,exeSha256:expected,steps:[]};
const save=()=>fs.writeFile(output,JSON.stringify(state,null,2)+'\n');await save();
async function child(args,log){
 const file=await fs.open(log,'wx');
 try{return await new Promise((resolve,reject)=>{
  const proc=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,QINGTU_TEST_APP:app,QINGTU_DRIVER_URL:'http://127.0.0.1:4448'},stdio:['ignore',file.fd,file.fd],windowsHide:true});
  proc.on('error',reject);proc.on('exit',(code,signal)=>resolve({code,signal}));
 });}finally{await file.close();}
}
try{
 const deadline=Date.now()+150*60000;let result;
 while(Date.now()<deadline){
  try{result=JSON.parse(await fs.readFile(observation,'utf8'));}catch(error){if(!(error instanceof SyntaxError))throw error;}
  if(result?.finished&&['passed','failed'].includes(result.status))break;
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!result?.finished)throw Error('Observation did not finish within the continuation wait window');
 state.observationResult={status:result.status,finished:result.finished,error:result.error??null};
 // The observation finally block closes its WebDriver session before writing finished.
 await new Promise(resolve=>setTimeout(resolve,1500));state.status='running';await save();
 for(const script of ['desktop-project-rejections','desktop-content-security']){
  if(hashBytes(await fs.readFile(app))!==expected)throw Error('Installed program changed while waiting');
  const step={script,started:new Date().toISOString(),log:path.resolve(`.tooling/${script}-20261016-${Date.now()}.log`),status:'running'};state.steps.push(step);await save();
  Object.assign(step,await child([`scripts/${script}.mjs`],step.log));step.finished=new Date().toISOString();step.status=step.code===0?'passed':'failed';await save();
  if(step.status==='failed')throw Error(script+' failed; inspect its retained report before continuing');
 }
 state.status='passed';
}catch(error){state.status='failed';state.error=String(error);process.exitCode=1;}
finally{state.finished=new Date().toISOString();await save();console.log(JSON.stringify(state,null,2));}
