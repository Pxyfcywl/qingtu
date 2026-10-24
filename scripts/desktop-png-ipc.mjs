import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession} from './lib/native.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),root=path.resolve('.tooling/png-ipc',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={status:'running',app,exeSha256:sha(await fs.readFile(app)),checks:[],scope:'Real installed command, raw binary and metadata validation; no native Save-dialog claim'};
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');
const output=path.join(root,'中文 空格 😀.png'),encoded=Buffer.from(output).toString('hex'),bytes=await fs.readFile('public/demo/triangle.png');
async function invoke(payload,header,json=false){return session.asyncScript(`const [payload,header,json,path,done]=arguments;const args=json?{path,bytes:payload}:new Uint8Array(payload);window.__TAURI_INTERNALS__.invoke('save_png',args,{headers:header===null?{}:{'x-qingtu-path':header}}).then(()=>done({ok:true}),error=>done({ok:false,error:String(error)}));`,[[...payload],header,json,output]);}
const check=(pass,message)=>{if(!pass)throw Error(message);report.checks.push(message);};
try{
 await session.open(app);const info=await session.native('bootstrap');check(path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Isolated configuration');
 const success=await invoke(bytes,encoded);check(success.ok,'Raw binary command succeeds');check(sha(await fs.readFile(output))===sha(bytes),'Chinese, spaces and emoji path roundtrips without byte changes');
 for(const [name,payload,header,json]of [['JSON array',bytes,encoded,true],['invalid PNG',Buffer.from('not an image'),encoded,false],['missing path',bytes,null,false],['malformed hex',bytes,'invalid',false],['invalid UTF8',bytes,'ff',false],['NUL path',bytes,Buffer.from(output+'\0').toString('hex'),false],['relative path',bytes,Buffer.from('relative.png').toString('hex'),false]]){
  const result=await invoke(payload,header,json);check(!result.ok&&(!json||result.error.includes('二进制')),name+' rejected');check(sha(await fs.readFile(output))===sha(bytes),name+' preserves existing output');
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await session.close();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,root}));}
