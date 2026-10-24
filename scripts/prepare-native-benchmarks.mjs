import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const base='http://127.0.0.1:4447';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:app}}}})).sessionId;
const script=(code,args=[])=>req('POST',`/session/${session}/execute/async`,{script:code,args});
async function native(command,args={}){const r=await script('const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',[command,args]);if(!r.ok)throw Error(r.error);return r.value;}
const root=path.resolve('.tooling/benchmark-native');await fs.mkdir(root,{recursive:true});
const manifest=JSON.parse(await fs.readFile('.tooling/fixtures/documents/manifest.json','utf8'));
const media=JSON.parse(await fs.readFile(path.join(manifest.mediaRoot,'manifest.json'),'utf8'));
const report={app,status:'running',mediaMiB:media.totalMiB,assets:[],documents:[]};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
try{
 await new Promise(r=>setTimeout(r,1000));let info=await native('bootstrap');
 if(!info.initialized){await native('initialize_storage',{directory:path.join(root,'固定样本 资料库')});await req('POST',`/session/${session}/refresh`,{});await new Promise(r=>setTimeout(r,1500));}
 for(const item of media.assets){
  const asset=await native('import_asset',{path:path.join(manifest.mediaRoot,item.file)});if(asset.id!==item.sha256||asset.byteSize!==item.bytes)throw Error('Native asset hash/size mismatch');
  if(item.kind==='video'){
   const file=await native('get_asset_path',{id:asset.id,thumbnail:false});
   const metadata=await script(`const done=arguments[arguments.length-1];const video=document.createElement('video');video.preload='auto';video.muted=true;video.crossOrigin='anonymous';const timer=setTimeout(()=>{video.removeAttribute('src');video.load();done({error:'Decode timeout'});},10000);video.onloadeddata=async()=>{try{const c=document.createElement('canvas');c.width=512;c.height=288;c.getContext('2d').drawImage(video,0,0,512,288);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const metadata={width:video.videoWidth,height:video.videoHeight,duration:video.duration,posterBytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};clearTimeout(timer);video.removeAttribute('src');video.load();done({ok:true,metadata});}catch(e){clearTimeout(timer);done({error:String(e)});}};video.onerror=()=>{clearTimeout(timer);done({error:video.error?.message});};video.src=window.__TAURI_INTERNALS__.convertFileSrc(arguments[0],'asset');`,[file]);
   if(!metadata.ok||metadata.metadata.width!==1280||metadata.metadata.height!==720)throw Error(JSON.stringify(metadata));
   await native('set_asset_metadata',{id:asset.id,metadata:metadata.metadata});
  }
  const thumbPath=await native('get_asset_path',{id:asset.id,thumbnail:true});const thumb=await fs.readFile(thumbPath);
  const width=thumb.readUInt32BE(16),height=thumb.readUInt32BE(20);
  if(thumb.length>200*1024||width>512||height>512||!thumb.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Native thumbnail exceeds limits');
  report.assets.push({id:asset.id,bytes:asset.byteSize,kind:item.kind,thumbnailBytes:thumb.length,thumbnailWidth:width,thumbnailHeight:height,thumbnailSha256:crypto.createHash('sha256').update(thumb).digest('hex')});
 }
 info=await native('bootstrap');
 for(const name of ['S','M','L','M-expanded','L-expanded']){
  const doc=JSON.parse(await fs.readFile('.tooling/fixtures/documents/'+name+'.json','utf8'));
  if(!info.documents.some(d=>d.id===doc.id))await native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:'seed-'+doc.id}});
  const loaded=await native('load_document',{id:doc.id});if(JSON.stringify(canonical(loaded.nodes))!==JSON.stringify(canonical(doc.nodes)))throw Error('Native fixture roundtrip mismatch');
  await fs.writeFile(path.join(root,'loaded-'+name+'.json'),JSON.stringify(loaded));
  report.documents.push({name,id:doc.id,count:Object.keys(loaded.nodes).length});
 }
 await native('load_document',{id:'benchmark-s-v1'});report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{await fs.writeFile(path.join(root,'prepare.json'),JSON.stringify(report,null,2));await req('DELETE',`/session/${session}`).catch(()=>{});console.log(JSON.stringify({status:report.status,assets:report.assets.length,documents:report.documents,error:report.error},null,2));}
