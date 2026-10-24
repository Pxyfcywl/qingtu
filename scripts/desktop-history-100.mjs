import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,waitSaved} from './lib/soak-actions.mjs';
import {inspectTree} from './lib/tree-oracle.mjs';
import {selectNode,openInspector,enterText,pressKey,dragHeader,changeParent} from './lib/history-ui.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve('.tooling/history',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const logical=doc=>sorted(Object.fromEntries(['id','schemaVersion','title','rootId','layoutMode','viewport','nodes'].map(key=>[key,doc[key]])));
const hash=doc=>digest(JSON.stringify(logical(doc)));
const report={caseId:'T12-native-100-mixed-undo-redo',status:'running',phase:'setup',app,exeSha256:digest(await fs.readFile(app)),commands:[],undo:[],redo:[],scope:'100 installed-app operations, every undo/redo compared with its expected full logical snapshot. Native text entry is not a real IME test.'};
const s=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4449');let original,created;const snapshots=[];
const checkpoint=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function current(){await waitSaved(s);const doc=await s.native('load_document',{id:created});inspectTree(doc);return doc;}
async function command(name,action){
 const before=snapshots.at(-1);await action();const after=await current();if(hash(before)===hash(after))throw Error('Expected a real logical change: '+name);snapshots.push(after);report.commands.push({index:report.commands.length+1,name,hash:hash(after),tree:inspectTree(after)});
}
try{
 await s.open(app);await s.resizeViewport(1440,844);const info=await s.native('bootstrap');if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated configuration');original=info.recentId;
 const image=await s.native('import_asset',{path:path.resolve('public/demo/triangle.png')}),base={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},side:'right',color:'teal',contentCollapsed:false,childrenCollapsed:false};created='history-'+crypto.randomUUID();
 const doc={id:created,schemaVersion:1,title:'原生混合历史检查',rootId:'root',revision:0,updatedAt:Date.now(),layoutMode:'free',viewport:{x:120,y:100,zoom:.85},nodes:{}};
 for(const [id,parent,title,x,y,children]of [['root',null,'历史检查',0,240,['a','b','c']],['a','root','图片卡片',280,0,[]],['b','root','带后代的分支',700,0,['x']],['c','root','可编辑卡片',280,460,[]],['x','b','后代 X',1000,200,[]]])doc.nodes[id]={...base,id,parentId:parent,title,position:{x,y},childIds:children};
 Object.assign(doc.nodes.a,{kind:'card',preferredWidth:320,body:{type:'doc',content:[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}},{type:'assetImage',attrs:{assetId:image.id,alt:'原始素材'}}]}});
 Object.assign(doc.nodes.c,{kind:'card',preferredWidth:320,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Initial body'}]}]}});
 await fs.writeFile(path.join(output,'fixture.json'),JSON.stringify(doc,null,2)+'\n');await saveNew(s,doc);await s.native('load_document',{id:created});await s.refresh();await s.waitFor('return document.querySelectorAll(".mind-node").length===5&&!document.querySelector(".media-placeholder");');await sleep(500);snapshots.push(await current());await fs.writeFile(path.join(output,'initial.json'),JSON.stringify(snapshots[0],null,2)+'\n');report.initialHash=hash(snapshots[0]);report.phase='commands';
 for(let round=1;round<=10;round++){
  let added;
  await command('add-'+round,async()=>{const before=snapshots.at(-1);await selectNode(s,'root');await s.click('[aria-label="添加文字节点 Tab"]');await s.waitFor('return !!document.querySelector(".node-title-input");');added=await s.execute('return document.querySelector(".node-title-input").closest("[data-node-id]").dataset.nodeId;');if(before.nodes[added])throw Error('Added ID already exists');await s.execute('document.querySelector(".node-title-input").blur();');});
  await command('body-fold-'+round,()=>s.click('[data-node-id="a"] .body-toggle'));
  await command('descendants-fold-'+round,()=>s.click('[data-node-id="b"] .branch-toggle'));
  await command('width-'+round,async()=>{await selectNode(s,'a');await openInspector(s);await s.execute('document.querySelector(".inspector input[type=range]").focus();');await pressKey(s,'\uE014');});
  await command('title-'+round,async()=>{await s.execute('document.querySelector("[data-node-id=c] .node-label").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));');await s.waitFor('return !!document.querySelector(".node-title-input");');await enterText(s,'.node-title-input','Title '+round);await s.execute('document.querySelector(".node-title-input").blur();');});
  await command('body-'+round,async()=>{await s.execute('document.querySelector("[data-node-id=c] .card-body").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));');await s.waitFor('return !!document.querySelector("[contenteditable=true]");');await enterText(s,'[contenteditable=true]','Body '+round);await s.click('[aria-label="完成编辑"]');});
  await command('sort-'+round,async()=>{await selectNode(s,'b');await openInspector(s);const index=snapshots.at(-1).nodes.root.childIds.indexOf('b');await s.execute('Array.from(document.querySelectorAll(".inspector button")).find(b=>b.textContent===arguments[0]).click();',[index===0?'向后排序':'向前排序']);});
  await command('drag-'+round,()=>dragHeader(s,'c',round%2?18:-18,round%2?-8:8));
  await command('reparent-'+round,async()=>{await selectNode(s,added);await openInspector(s);await changeParent(s,'b');});
  await command('delete-'+round,async()=>{await selectNode(s,added);await s.execute('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true}));');});
  await checkpoint();console.log('mixed commands '+report.commands.length+'/100');
 }
 report.finalHash=hash(snapshots.at(-1));await fs.writeFile(path.join(output,'final.json'),JSON.stringify(snapshots.at(-1),null,2)+'\n');
 for(const phase of ['undo','redo']){
  report.phase=phase;
  for(let n=1;n<=100;n++){
   const selector=phase==='undo'?'[aria-label="撤销 Ctrl+Z"]':'[aria-label="重做 Ctrl+Shift+Z"]';if(await s.execute('return document.querySelector(arguments[0]).disabled;',[selector]))throw Error(phase+' disabled early at '+n);await s.click(selector);const actual=await current(),expected=snapshots[phase==='undo'?100-n:n];
   if(hash(actual)!==hash(expected)){await fs.writeFile(path.join(output,phase+'-mismatch-'+n+'.json'),JSON.stringify({actual,expected},null,2));throw Error(phase+' logical snapshot differs at '+n);}report[phase].push({index:n,hash:hash(actual)});
   if(n%10===0){await checkpoint();console.log(phase+' '+n+'/100');}
  }
 }
 const mediaPath=await s.native('get_asset_path',{id:image.id,thumbnail:false});report.mediaSha256=digest(await fs.readFile(mediaPath));if(report.mediaSha256!==image.id)throw Error('Original media hash changed');report.browserVersion=s.capabilities.browserVersion;report.phase='complete';report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{if(original&&s.id){await s.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed'&&created)await s.native('delete_document',{id:created}).catch(()=>{});}await s.close();await checkpoint();console.log(JSON.stringify({status:report.status,phase:report.phase,commands:report.commands.length,undo:report.undo.length,redo:report.redo.length,error:report.error,output}));}
