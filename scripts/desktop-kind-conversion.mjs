import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,waitSaved,nodeHash} from './lib/soak-actions.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve(process.env.QINGTU_REPORT_DIR);await fs.mkdir(output,{recursive:true});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448'),report={caseId:'native-kind-conversion-confirm-cancel-undo',status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[],scope:'Owned-app DOM selection/change events and WebDriver button clicks; not an OS input-method or native select-dialog test'};let original,created;
const assert=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message);};
async function choose(id,kind){
 await session.execute('document.querySelector(arguments[0]).closest(".react-flow__node").click();',[`[data-node-id="${id}"]`]);
 if(!await session.execute('return !!document.querySelector(".inspector");'))await session.click('[aria-label="节点属性"]');
 await session.execute('const select=document.querySelector(".inspector select");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}));',[kind]);
}
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');assert(path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Isolated test configuration');original=info.recentId;
 const image=await session.native('import_asset',{path:path.resolve('public/demo/triangle.png')}),audio=(await session.native('import_asset',{path:path.resolve('public/demo/lesson.mp4')})).id;
 const base={kind:'text',title:'类型测试',body:{type:'doc',content:[{type:'paragraph'}]},side:'right',color:'teal',contentCollapsed:false,childrenCollapsed:false};created='kinds-'+crypto.randomUUID();
 const doc={id:created,schemaVersion:1,title:'类型转换桌面检查',rootId:'kind-root',revision:0,layoutMode:'free',viewport:{x:100,y:100,zoom:1},updatedAt:Date.now(),nodes:{
  'kind-root':{...base,id:'kind-root',parentId:null,childIds:['kind-card','kind-image','kind-video'],position:{x:0,y:160}},
  'kind-card':{...base,id:'kind-card',kind:'card',parentId:'kind-root',childIds:[],position:{x:280,y:0},body:{type:'doc',content:[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}},{type:'assetImage',attrs:{assetId:image.id,alt:'三角形'}}]}},
  'kind-image':{...base,id:'kind-image',kind:'image',assetId:image.id,altText:'图片说明',parentId:'kind-root',childIds:[],position:{x:800,y:0}},
  'kind-video':{...base,id:'kind-video',kind:'video',assetId:audio,altText:'视频说明',parentId:'kind-root',childIds:[],position:{x:800,y:300}}
 }};const fixture=JSON.stringify(doc,null,2)+'\n';await fs.writeFile(path.join(output,'kind-conversion-fixture.json'),fixture);report.fixtureSha256=crypto.createHash('sha256').update(fixture).digest('hex');await saveNew(session,doc);await session.native('load_document',{id:created});await session.refresh();await session.waitFor('return document.querySelectorAll(".mind-node").length===4;');await sleep(300);
 const baseline=await session.native('load_document',{id:created});
 for(const [id,kind,label]of [['kind-image','text','图片媒体'],['kind-video','image','视频媒体'],['kind-card','text','正文']]){
  await choose(id,kind);await session.waitFor('return document.querySelector("dialog[open]")?.textContent.includes(arguments[0]);',[label]);
  assert(await session.execute('return document.activeElement?.textContent==="保留原类型";'),'Initial focus is on retaining '+id);
  await session.click('dialog[open] .secondary-button');await waitSaved(session);assert(nodeHash(await session.native('load_document',{id:created}))===nodeHash(baseline),'Cancel leaves complete node data unchanged: '+id);
  await choose(id,kind);await session.click('dialog[open] .primary-button');await waitSaved(session);const converted=await session.native('load_document',{id:created});assert(converted.nodes[id].kind===kind,'Explicit confirmation applies '+id);
  await session.click('[aria-label="撤销 Ctrl+Z"]');await waitSaved(session);assert(nodeHash(await session.native('load_document',{id:created}))===nodeHash(baseline),'Undo restores media/body/order/coordinates: '+id);
 }
 await choose('kind-image','card');await waitSaved(session);const mapped=await session.native('load_document',{id:created});assert(!await session.execute('return !!document.querySelector("dialog[open]");'),'Lossless image-to-card needs no destructive confirmation');
 assert(mapped.nodes['kind-image'].body.content.some(b=>b.type==='assetImage'&&b.attrs?.assetId===image.id),'Image-to-card embeds original media reference');
 await session.click('[aria-label="撤销 Ctrl+Z"]');await waitSaved(session);await choose('kind-root','card');await waitSaved(session);assert(await session.execute('return document.querySelectorAll(".root-node .node-label").length===1;'),'Root card has exactly one title');
 assert(!await session.execute('return document.querySelector("[role=alert]")?.textContent;'),'No application error');report.browserVersion=session.capabilities.browserVersion;report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{if(original&&session.id){await session.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed'&&created)await session.native('delete_document',{id:created}).catch(()=>{});}await session.close();await fs.writeFile(path.join(output,'kind-conversion.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));}
