import {spawn} from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
export async function createSampler(app){
 const child=spawn('powershell.exe',['-NoProfile','-File',path.resolve('scripts/process-sampler.ps1'),'-AppPath',path.resolve(app)],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const waiting=[];let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);const lines=readline.createInterface({input:child.stdout});
 lines.on('line',line=>{const job=waiting.shift();if(!job)return;clearTimeout(job.timer);try{const value=JSON.parse(line);if(value.ok===false)job.reject(Error(value.error));else job.resolve(value);}catch(error){job.reject(error);}});
 child.on('exit',code=>{for(const job of waiting.splice(0)){clearTimeout(job.timer);job.reject(Error('Sampler exited '+code+': '+stderr));}});
 const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Sampler response timed out: '+stderr)),15000);waiting.push({resolve,reject,timer});});
 await next();return {async sample(){const result=next();child.stdin.write('{"operation":"sample"}\n');return result;},async close(){if(child.exitCode!==null)return;child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));}};
}
