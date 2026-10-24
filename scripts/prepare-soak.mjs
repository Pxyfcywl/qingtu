import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,nodeHash} from './lib/soak-actions.mjs';
const root=path.resolve('.tooling/soak-tests');await fs.mkdir(root,{recursive:true});
const app=path.resolve('.tooling/install-tests/0.1.2 长期验证/qingtu.exe');
const session=new NativeSession('http://127.0.0.1:4448');const report={status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),documents:[]};
try{
 await session.open(app);let info=await session.native('bootstrap');
 if(!info.initialized){await session.native('initialize_storage',{directory:path.join(root,'资料库')});await session.refresh();await sleep(1200);}
 info=await session.native('bootstrap');
 const archive=path.resolve('validation/fixtures/0.1.1/M完整项目.qmap');
 const imported=await session.native('import_project',{path:archive});
 report.archive={bytes:(await fs.stat(archive)).size,sha256:crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex')};
 for(const name of ['M','L']){
  const doc=JSON.parse(await fs.readFile('.tooling/fixtures/documents/'+name+'.json','utf8'));
  if(!info.documents.some(d=>d.id===doc.id))await saveNew(session,doc);
  const loaded=await session.native('load_document',{id:doc.id});if(nodeHash(loaded)!==nodeHash(doc))throw Error('Soak fixture does not match original '+name);
  report.documents.push({name,id:doc.id,nodes:Object.keys(doc.nodes).length,nodeHash:nodeHash(doc)});
 }
 if(imported.id)await session.native('delete_document',{id:imported.id});
 report.audio=await session.native('import_asset',{path:path.resolve('.tooling/fixtures/media-lifecycle/audio.mp4')});
 info=await session.native('bootstrap');report.storagePath=info.storagePath;report.assets=info.assets.map(a=>({id:a.id,byteSize:a.byteSize,mime:a.mime}));
 await session.native('load_document',{id:'benchmark-m-v1'});report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await session.close();await fs.writeFile(path.join(root,'preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,documents:report.documents,assets:report.assets?.length,error:report.error},null,2));}
