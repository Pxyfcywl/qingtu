import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession,sleep} from './lib/native.mjs';
const root=path.resolve('.tooling/parent-replace',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const app=path.resolve('.tooling/target/release/qingtu.exe'),report={status:'running',exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[],root,inputScope:'WebDriver element clicks and keyboard; SVG edge selection uses DOM click injection. Browser UI suite covers real Shift-drag and edge clicks.'};
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4465','--native-port','9565','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4465');
const key=(value,modifiers=[])=>session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'key',id:'keyboard',actions:[...modifiers.map(value=>({type:'keyDown',value})),{type:'keyDown',value},{type:'keyUp',value},...modifiers.toReversed().map(value=>({type:'keyUp',value}))]}]});
async function screenshot(name){await fs.writeFile(path.join(root,name),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));}
async function edge(id){await session.execute('document.querySelector(arguments[0]).dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));',[`.react-flow__edge[data-id="${id}"]`]);await session.waitFor('return !!document.querySelector(".parent-edge-tools");');}
try{
 await sleep(800);await session.open(app);check(!(await session.native('bootstrap')).initialized,'独立资料库，不读取用户导图');await session.native('initialize_storage',{directory:path.join(root,'library')});await session.refresh();await session.waitFor('return !!document.querySelector(".root-node")&&!document.querySelector(".startup");');
 const base={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},contentCollapsed:false,childrenCollapsed:false,side:'right',color:'teal'};
 const doc={id:crypto.randomUUID(),schemaVersion:1,title:'画布更换父节点验证',rootId:'root',revision:0,layoutMode:'free',viewport:{x:120,y:180,zoom:.9},updatedAt:Date.now(),nodes:{
  root:{...base,id:'root',title:'知识地图',parentId:null,childIds:['a'],position:{x:0,y:0}},
  a:{...base,id:'a',title:'A',parentId:'root',childIds:['b','c'],position:{x:300,y:0}},
  b:{...base,id:'b',title:'B',parentId:'a',childIds:[],position:{x:300,y:260}},
  c:{...base,id:'c',title:'C · 共享知识卡片',kind:'card',parentId:'a',childIds:[],position:{x:600,y:0},body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'更换父节点时，这份正文完整保留。'}]}]}}
 }};
 await session.native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});await session.native('load_document',{id:doc.id});await session.refresh();await session.waitFor('return document.querySelectorAll(".mind-node").length===4&&!document.querySelector(".startup");');await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(300);
 const read=async()=>{await session.waitFor('return !!document.querySelector(".save-saved");');return session.native('load_document',{id:doc.id});};
 await session.click('[data-node-id="c"] .card-header');await key('m',['\uE009','\uE008']);check(await session.waitFor('return document.querySelector(".parent-connect-hint")?.textContent.includes("改连到");'),'Ctrl+Shift+M 进入更换父节点模式');await screenshot('更换父节点预览.png');await session.click('[data-node-id="b"] .node-label');let saved=await read();check(saved.nodes.c.parentId==='b'&&saved.nodes.a.childIds.includes('b')&&!saved.nodes.a.childIds.includes('c')&&saved.nodes.b.childIds.includes('c'),'A→B、A→C 一次改为 A→B→C，旧 A→C 已移除');check(isDeepStrictEqual(saved.nodes.c.body,doc.nodes.c.body)&&isDeepStrictEqual(saved.nodes.c.position,doc.nodes.c.position),'更换保留正文和自由布局位置');await screenshot('更换完成.png');
 await key('z',['\uE009']);saved=await read();check(saved.nodes.c.parentId==='a','更换父节点可撤销');
 await edge('a:c');check(await session.execute('return document.querySelector(".parent-edge-tools button:last-child").disabled;'),'唯一父连接不能直接断开');await session.click('.parent-edge-tools button:first-of-type');await session.click('[data-node-id="b"] .node-label');saved=await read();check(saved.nodes.c.parentId==='b','点击原有主连线可直接改接到 B');
 await key('l',['\uE009','\uE008']);await session.waitFor('return !!document.querySelector(".parent-connect-preview");');await session.click('[data-node-id="a"] .node-label');saved=await read();check(saved.nodes.c.extraParentIds.includes('a'),'添加父节点仍与更换操作独立');
 await edge('extra:a:c');await session.click('.parent-edge-tools button:first-of-type');await session.click('.root-node .node-label');saved=await read();check(saved.nodes.c.parentId==='b'&&saved.nodes.c.extraParentIds.includes('root')&&!saved.nodes.c.extraParentIds.includes('a'),'只更换选中的额外父连接，主父连接不变');
 await edge('b:c');await session.click('.parent-edge-tools button:last-child');saved=await read();check(saved.nodes.c.parentId==='root'&&!saved.nodes.c.extraParentIds?.length&&saved.nodes.b.childIds.length===0&&Object.keys(saved.nodes).length===4,'断开原主连接后提升另一父节点，节点和正文保留');
 const project=path.join(root,'更换父连接.qmap');await session.native('export_project',{id:doc.id,path:project});const imported=await session.native('import_project',{path:project});check(isDeepStrictEqual(imported.nodes,saved.nodes),'项目导出导入保留修改后的连接');
 await session.close();await sleep(300);await session.open(app);await session.waitFor('return !!document.querySelector(".save-saved")&&!document.querySelector(".startup");');const info=await session.native('bootstrap'),reopened=await session.native('load_document',{id:info.recentId});check(reopened.nodes.c.parentId==='root'&&isDeepStrictEqual(reopened.nodes.c.body,doc.nodes.c.body),'完全退出重启后连接及正文保留');check(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'桌面操作无错误提示');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(session.id){await screenshot('失败.png').catch(()=>{});report.diagnostics=await session.execute('return {error:document.querySelector("[role=alert]")?.textContent,body:document.body.innerText};').catch(()=>null);}}
finally{await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportPath:path.join(root,'report.json')},null,2));}
