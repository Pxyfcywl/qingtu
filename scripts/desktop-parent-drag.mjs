import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,waitSaved} from './lib/soak-actions.mjs';
import {inspectTree} from './lib/tree-oracle.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve('.tooling/parent-drag',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4449');
const report={caseId:'T11-parent-over-descendant-pointer',status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),cases:[],scope:'Actual pointer dragging in automatic and free layouts; dragging edits position, parent changes use inspector. Invalid ancestor reparent is tested separately.'};let original;const ids=[];
const shape=doc=>Object.fromEntries(Object.entries(doc.nodes).map(([id,n])=>[id,{parentId:n.parentId,childIds:n.childIds}]));
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated test config');original=info.recentId;
 const fixture=JSON.parse(await fs.readFile(process.env.QINGTU_STRUCTURE_FIXTURE??'validation/fixtures/0.1.4/structure.json','utf8'));
 for(const mode of ['auto','free']){
  const doc=structuredClone(fixture);doc.id='parent-drag-'+crypto.randomUUID();doc.layoutMode=mode;doc.title='父节点覆盖后代 '+mode;ids.push(doc.id);const input=JSON.stringify(doc,null,2)+'\n';await fs.writeFile(path.join(output,mode+'-input.json'),input);await saveNew(session,doc);await session.native('load_document',{id:doc.id});await session.refresh();await session.waitFor('return document.querySelectorAll(".mind-node").length===5;');await sleep(300);
  let points;
  for(let n=0;n<20;n++){
   await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(100);
   points=await session.execute('return ["a","x"].map(id=>{const r=document.querySelector(`[data-node-id="${id}"] .drag-handle`).getBoundingClientRect();return {id,x:Math.round(r.left+18),y:Math.round(r.top+r.height/2),ok:r.left>85&&r.top>70&&r.right<innerWidth-20&&r.bottom<innerHeight-50};});');
   if(points.every(p=>p.ok))break;
  }
  if(!points.every(p=>p.ok))throw Error('Drag endpoints are outside usable canvas');await waitSaved(session);const before=await session.native('load_document',{id:doc.id}),[a,x]=points;
  await fs.writeFile(path.join(output,mode+'-before.png'),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
  await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'ancestor-drag',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:a.x,y:a.y},{type:'pointerDown',button:0},{type:'pointerMove',duration:20,origin:'viewport',x:a.x+4,y:a.y+4},{type:'pointerMove',duration:200,origin:'viewport',x:x.x,y:x.y},{type:'pointerUp',button:0}]}]});
  await waitSaved(session);const after=await session.native('load_document',{id:doc.id});inspectTree(after);
  const moved=Math.hypot(after.nodes.a.position.x-before.nodes.a.position.x,after.nodes.a.position.y-before.nodes.a.position.y);
  if(after.layoutMode!=='free'||moved<20||!isDeepStrictEqual(shape(before),shape(after)))throw Error('Dragging parent changed tree structure or failed to move');
  const message=await session.execute('return document.querySelector("[role=alert]")?.textContent;');if(message)throw Error(message);
  await fs.writeFile(path.join(output,mode+'-after.png'),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
  report.cases.push({mode,status:'passed',inputSha256:crypto.createHash('sha256').update(input).digest('hex'),points,movedWorldPx:moved,layoutAfter:after.layoutMode,tree:inspectTree(after),parentLinksUnchanged:true});
 }
 report.browserVersion=session.capabilities.browserVersion;report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{if(original&&session.id){await session.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed')for(const id of ids)await session.native('delete_document',{id}).catch(()=>{});}await session.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error,output}));}
