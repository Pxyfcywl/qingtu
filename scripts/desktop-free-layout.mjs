import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,waitSaved} from './lib/soak-actions.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 长期验证/qingtu.exe'),session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');
const root=path.resolve('.tooling/free-layout/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const report={caseId:'T07-native-drag-20',status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),samples:[]};let original,created;
const snapshot=async id=>session.execute(`const element=document.querySelector('[data-node-id="'+CSS.escape(arguments[0])+'"]');if(!element)return null;const rect=element.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(getComputedStyle(element.closest('.react-flow__node')).transform);return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,worldX:matrix.m41,worldY:matrix.m42,viewport:document.querySelector('.react-flow__viewport').style.transform};`,[id]);
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');original=info.recentId;
 const doc=JSON.parse(await fs.readFile('validation/fixtures/0.1.1/documents/S.json','utf8'));doc.id='free-'+crypto.randomUUID();doc.title='自由布局量化 '+doc.id.slice(-6);created=doc.id;await saveNew(session,doc);await session.native('load_document',{id:doc.id});await session.refresh();await sleep(1000);
 await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(1000);await waitSaved(session);
 const candidates=await session.execute(`return Array.from(document.querySelectorAll('.mind-node:not(.root-node) .drag-handle')).map(element=>{const r=element.getBoundingClientRect();return {id:element.closest('[data-node-id]').dataset.nodeId,x:Math.round(r.x+Math.min(20,r.width/3)),y:Math.round(r.y+r.height/2),right:r.right,bottom:r.bottom};}).filter(p=>p.x>120&&p.y>100&&p.right<innerWidth-40&&p.bottom<innerHeight-100);`);
 if(candidates.length<20)throw Error('Fewer than 20 safely visible draggable nodes: '+candidates.length);
 report.viewport=await session.execute('return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};');report.fixedInputSha256=crypto.createHash('sha256').update(await fs.readFile('validation/fixtures/0.1.1/documents/S.json')).digest('hex');
 await fs.writeFile(path.join(root,'before.png'),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
 for(const item of candidates.slice(0,20)){
  const before=await snapshot(item.id);
  await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'layout-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:item.x,y:item.y},{type:'pointerDown',button:0},{type:'pointerMove',duration:0,origin:'viewport',x:item.x+4,y:item.y+4},{type:'pointerMove',duration:100,origin:'viewport',x:item.x+24,y:item.y+18},{type:'pointerUp',button:0}]}]});
  await sleep(100);await waitSaved(session);const after=await snapshot(item.id),saved=await session.native('load_document',{id:doc.id});
  if(saved.layoutMode!=='free'||!after||Math.hypot(after.x-before.x,after.y-before.y)<8)throw Error('Node drag did not commit in free mode: '+item.id);
  const position=saved.nodes[item.id].position,error=Math.hypot(position.x-after.worldX,position.y-after.worldY);
  if(error>1)throw Error('Saved free coordinate differs from actual canvas by '+error);
  report.samples.push({id:item.id,before,after,saved:position,saveErrorPx:error});
 }
 const branch=`[data-node-id="${doc.rootId}"] .branch-toggle`;await session.click(branch);await session.waitFor('return document.querySelectorAll(".mind-node").length===1;');await session.click(branch);await session.waitFor('return document.querySelectorAll(".mind-node").length>1;');await sleep(500);await waitSaved(session);
 for(const item of report.samples){const restored=await snapshot(item.id);if(!restored)throw Error('Dragged node missing after expansion: '+item.id);item.restored=restored;item.restoreErrorPx=Math.hypot(restored.worldX-item.saved.x,restored.worldY-item.saved.y);item.anchorDriftPx=Math.hypot(restored.x-item.after.x,restored.y-item.after.y);if(item.restoreErrorPx>1||item.anchorDriftPx>2)throw Error('Fold/restore drifted: '+item.id);}
 const alert=await session.execute('return document.querySelector("[role=alert]")?.textContent;');if(alert)throw Error(alert);
 await fs.writeFile(path.join(root,'after.png'),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));report.status='passed';
}catch(error){report.status='failed';report.error=String(error);console.error(error);process.exitCode=1;}
finally{if(session.id){await session.request('DELETE',`/session/${session.id}/actions`).catch(()=>{});if(original){await session.native('load_document',{id:original}).catch(()=>{});await session.refresh().catch(()=>{});await sleep(500);}if(created&&report.status==='passed')await session.native('delete_document',{id:created});}await session.close();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,nodes:report.samples.length,error:report.error,report:root},null,2));}
