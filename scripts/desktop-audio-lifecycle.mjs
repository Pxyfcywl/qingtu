import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {mediaDocument,verifyMediaLifecycle} from './lib/media-lifecycle.mjs';
const app=process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 验证安装/qingtu.exe',session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4447');
const output=process.env.QINGTU_REPORT_DIR??'.tooling/lifecycle';
const report={app:path.resolve(app),exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),time:new Date().toISOString(),status:'running'};let original;const ids=[];
try{await session.open(app);const info=await session.native('bootstrap');original=info.recentId;
 const asset=await session.native('import_asset',{path:path.resolve('.tooling/fixtures/media-lifecycle/audio.mp4')});report.audioAsset=asset.id;
 const suffix=crypto.randomUUID().slice(-6);const a=mediaDocument(asset.id,'audio-'+crypto.randomUUID(),'音轨生命周期检查 A '+suffix),b=structuredClone(a);b.id='audio-'+crypto.randomUUID();b.title='音轨生命周期检查 B '+suffix;
 for(const doc of [a,b]){await session.native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:doc.id}});ids.push(doc.id);}
 await session.native('load_document',{id:a.id});await session.refresh();await sleep(1000);report.initialSources=await session.execute('return document.querySelectorAll(".asset-video[src]").length;');if(report.initialSources!==0)throw Error('Initial video source mounted');
 report.samples=[];await verifyMediaLifecycle(session,b,report.samples);report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{if(original&&session.id){await session.native('load_document',{id:original}).catch(()=>{});await session.refresh().catch(()=>{});await sleep(1000);}if(report.status==='passed')for(const id of ids)await session.native('delete_document',{id}).catch(()=>{});await session.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'audio-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
