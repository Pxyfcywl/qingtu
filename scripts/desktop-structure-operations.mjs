import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,waitSaved,nodeHash} from './lib/soak-actions.mjs';
import {inspectTree} from './lib/tree-oracle.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve('.tooling/structure',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4449');
const report={caseId:'T11-native-structure-80',status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),operations:[],checks:[],scope:'Installed app toolbar, keyboard and inspector; DOM events select nodes/dropdowns, WebDriver performs buttons, text and drag. No OS IME claim'};let original,created;
const assert=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message);};
const select=id=>session.execute('document.querySelector(arguments[0]).closest(".react-flow__node").click();',[`[data-node-id="${id}"]`]);
const current=async()=>{await waitSaved(session);const doc=await session.native('load_document',{id:created});inspectTree(doc);return doc;};
async function inspector(){if(!await session.execute('return !!document.querySelector(".inspector");'))await session.click('[aria-label="节点属性"]');}
async function chooseParent(id){await session.execute('const labels=Array.from(document.querySelectorAll(".inspector label")),select=labels.find(e=>e.textContent.includes("移动到父节点")).querySelector("select");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}));',[id]);}
async function title(text){const e=await session.request('POST',`/session/${session.id}/element`,{using:'css selector',value:'.node-title-input'});await session.request('POST',`/session/${session.id}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:'\uE009a\uE000\uE003'+text});await session.execute('document.querySelector(".node-title-input")?.blur();');}
const checkpoint=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');assert(path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Isolated configuration');original=info.recentId;created='structure-'+crypto.randomUUID();
 const basic={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},side:'right',color:'teal',contentCollapsed:false,childrenCollapsed:false};
 const doc={id:created,schemaVersion:1,title:'结构操作检查',rootId:'root',revision:0,layoutMode:'free',viewport:{x:120,y:100,zoom:.9},updatedAt:Date.now(),nodes:{}};
 for(const [id,parent,titleText,x,y,children]of [['root',null,'根节点',0,180,['a','b','c']],['a','root','父节点 A',280,0,['x']],['b','root','父节点 B',280,220,[]],['c','root','空标题测试',280,440,[]],['x','a','子节点 X',680,0,[]]])doc.nodes[id]={...basic,id,parentId:parent,title:titleText,position:{x,y},childIds:children};
 const input=JSON.stringify(doc,null,2)+'\n';await fs.writeFile(path.join(output,'fixture.json'),input);report.fixtureSha256=crypto.createHash('sha256').update(input).digest('hex');await saveNew(session,doc);await session.native('load_document',{id:created});await session.refresh();await session.waitFor('return document.querySelectorAll(".mind-node").length===5;');await sleep(250);
 let previous=await current();const added=[];
 for(let n=1;n<=20;n++){
  await select('root');await session.click('[aria-label="添加文字节点 Tab"]');await session.waitFor('return !!document.querySelector(".node-title-input");');await session.execute('document.querySelector(".node-title-input").blur();');const next=await current(),fresh=Object.keys(next.nodes).filter(id=>!previous.nodes[id]);
  assert(fresh.length===1&&Object.keys(next.nodes).length===Object.keys(previous.nodes).length+1&&next.nodes[fresh[0]].parentId==='root','Add '+n+' creates one valid child');added.push(fresh[0]);report.operations.push({kind:'add',run:n,id:fresh[0],tree:inspectTree(next),hash:nodeHash(next)});previous=next;
 }
 for(const [index,id]of added.entries()){
  await select(id);await session.execute('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true}));');const next=await current();assert(!next.nodes[id]&&Object.keys(next.nodes).length===Object.keys(previous.nodes).length-1,'Delete '+(index+1)+' removes exactly its leaf');report.operations.push({kind:'delete',run:index+1,id,tree:inspectTree(next),hash:nodeHash(next)});previous=next;
 }
 await select('b');await inspector();
 for(let n=1;n<=20;n++){
  const forward=n%2===1,expected=[...previous.nodes.root.childIds],index=expected.indexOf('b'),other=index+(forward?-1:1);[expected[index],expected[other]]=[expected[other],expected[index]];
  await session.execute('Array.from(document.querySelectorAll(".inspector button")).find(b=>b.textContent===arguments[0]).click();',[forward?'向前排序':'向后排序']);const next=await current();assert(JSON.stringify(next.nodes.root.childIds)===JSON.stringify(expected),'Sibling sort '+n+' preserves exact order');report.operations.push({kind:'sort',run:n,order:expected,tree:inspectTree(next),hash:nodeHash(next)});previous=next;
 }
 await select('x');
 for(let n=1;n<=20;n++){
  const target=n%2?'b':'a',oldParent=previous.nodes.x.parentId;await chooseParent(target);const next=await current();assert(next.nodes.x.parentId===target&&!next.nodes[oldParent].childIds.includes('x')&&next.nodes[target].childIds.filter(id=>id==='x').length===1,'Reparent '+n+' updates both parents');report.operations.push({kind:'reparent',run:n,target,tree:inspectTree(next),hash:nodeHash(next)});previous=next;
 }
 await checkpoint();await select('a');await chooseParent('x');await session.waitFor('return document.querySelector("[role=alert]")?.textContent.includes("自身或后代");');assert(nodeHash(await current())===nodeHash(previous),'Moving ancestor under descendant is rejected without mutation');await session.click('.error-toast button');
 await select('root');await session.execute('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true}));');await session.waitFor('return document.querySelector("[role=alert]")?.textContent.includes("根节点不能删除");');assert(nodeHash(await current())===nodeHash(previous),'Root deletion rejected without mutation');await session.click('.error-toast button');
 await session.execute('document.querySelector("[data-node-id=c] .node-label").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));');await session.waitFor('return !!document.querySelector(".node-title-input");');await title('');assert((await current()).nodes.c.title==='','Empty title is saved');
 await session.execute('document.querySelector("[data-node-id=c] .node-label").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));');await session.waitFor('return !!document.querySelector(".node-title-input");');await title('Edited again');assert((await current()).nodes.c.title==='Edited again','Empty node can be edited again');
 report.browserVersion=session.capabilities.browserVersion;report.counts=Object.fromEntries(['add','delete','sort','reparent'].map(kind=>[kind,report.operations.filter(o=>o.kind===kind).length]));report.status='passed';report.remainingScope='Parent-over-descendant pointer drag, automatic-layout geometry and full T12 history are separate checks';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{if(original&&session.id){await session.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed'&&created)await session.native('delete_document',{id:created}).catch(()=>{});}await session.close();await checkpoint();console.log(JSON.stringify({status:report.status,operations:report.operations.length,checks:report.checks.length,error:report.error,output}));}
