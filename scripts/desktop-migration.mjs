import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const base='http://127.0.0.1:4447',app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/最终验证 中文安装目录/qingtu.exe');
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
let session;
async function create(){session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;await new Promise(r=>setTimeout(r,1500));}
async function native(command,args={}){const r=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',args:[command,args]});if(!r.ok)throw Error(r.error);return r.value;}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const normalize=value=>JSON.stringify(canonical(value));
const report={app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),time:new Date().toISOString(),checks:[],status:'running'};
let original,writeId;
try{
 await create();const before=await native('bootstrap');original=before.recentId;report.source=before.storagePath;
 const source=await native('load_document',{id:'benchmark-m-v1'});
 const destination=path.resolve('.tooling/benchmark-native/迁移复测 资料库-'+crypto.randomUUID());
 const moved=await native('migrate_storage',{directory:destination});report.destination=moved.storagePath;
 if(moved.storagePath===before.storagePath||!await fs.stat(path.join(before.storagePath,'library.sqlite3')))throw Error('Source library was not retained');
 report.checks.push('原资料库保留，新目录包含中文和空格');
 if(normalize(await native('load_document',{id:source.id}))!==normalize(source))throw Error('Migration changed document contents');
 report.checks.push('500 节点、正文、视口、折叠与顺序完整一致');
 let files=0,bytes=0;const hashes=[];
 for(const folder of ['assets','thumbs'])for(const name of await fs.readdir(path.join(before.storagePath,folder))){const oldFile=await fs.readFile(path.join(before.storagePath,folder,name)),newFile=await fs.readFile(path.join(moved.storagePath,folder,name));const a=crypto.createHash('sha256').update(oldFile).digest('hex'),b=crypto.createHash('sha256').update(newFile).digest('hex');if(a!==b)throw Error('Migrated asset hash mismatch');files++;bytes+=oldFile.length;hashes.push(folder+'/'+name+' '+a);}
 report.files=files;report.assetAndThumbnailBytes=bytes;report.combinedFileHash=crypto.createHash('sha256').update(hashes.sort().join('\n')).digest('hex');report.checks.push('全部原始素材和缩略图逐文件 SHA256 一致');
 const doc=structuredClone(source);writeId=doc.id='migration-write-'+crypto.randomUUID();doc.revision=0;doc.nodes[doc.rootId].title='迁移后保存检查';
 await native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:'migration-write'}});
 await req('DELETE',`/session/${session}`);session=null;await create();
 const reopened=await native('bootstrap');if(reopened.storagePath!==moved.storagePath)throw Error('Storage pointer did not survive restart');
 if(normalize((await native('load_document',{id:writeId})).nodes)!==normalize(doc.nodes))throw Error('Write after migration did not survive restart');
 report.checks.push('迁移后写入新文档，退出重开仍连接新目录且内容一致');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{if(session){if(original){await native('load_document',{id:original}).catch(()=>{});await req('POST',`/session/${session}/refresh`,{}).catch(()=>{});await new Promise(r=>setTimeout(r,1500));}if(writeId&&report.status==='passed')await native('delete_document',{id:writeId}).catch(()=>{});await req('DELETE',`/session/${session}`).catch(()=>{});}await fs.writeFile('.tooling/benchmark-native/migration.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
