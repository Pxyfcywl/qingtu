import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
const root=path.resolve('.tooling/parent-point',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const app=path.resolve('.tooling/target/release/qingtu.exe'),report={status:'running',exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[],root,inputScope:'WebDriver element clicks and keyboard actions; drag uses DOM PointerEvent injection. Browser UI suite separately verifies real mouse drags.'};
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4465','--native-port','9565','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4465');
const actions=items=>session.request('POST',`/session/${session.id}/actions`,{actions:items});
const center=selector=>session.execute('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};',[selector]);
const key=async(value,modifiers=[])=>{await actions([{type:'key',id:'keyboard',actions:[...modifiers.map(value=>({type:'keyDown',value})),{type:'keyDown',value},{type:'keyUp',value},...modifiers.toReversed().map(value=>({type:'keyUp',value}))]}]);};
async function screenshot(name){await fs.writeFile(path.join(root,name),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));}
try{
 await sleep(800);await session.open(app);check(!(await session.native('bootstrap')).initialized,'独立资料库，不连接用户资料');
 await session.native('initialize_storage',{directory:path.join(root,'library')});await session.refresh();await session.waitFor('return !!document.querySelector(".root-node")&&!document.querySelector(".startup");');
 const base={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},contentCollapsed:false,childrenCollapsed:false,side:'right',color:'teal',extraParentIds:[]};
 const doc={id:crypto.randomUUID(),schemaVersion:1,title:'直接连线桌面验证',rootId:'root',revision:0,layoutMode:'free',viewport:{x:120,y:180,zoom:.9},updatedAt:Date.now(),nodes:{
  root:{...base,id:'root',title:'知识地图',parentId:null,childIds:['a','b'],position:{x:0,y:0}},
  a:{...base,id:'a',title:'原父节点',parentId:'root',childIds:['shared'],position:{x:300,y:0}},
  b:{...base,id:'b',title:'新增父节点',parentId:'root',childIds:[],position:{x:300,y:260}},
  shared:{...base,id:'shared',title:'共享知识卡片',kind:'card',parentId:'a',childIds:[],position:{x:600,y:0},body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'同一个节点，可以直接连到多个父节点。'}]}]}}
 }};
 await session.native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});await session.native('load_document',{id:doc.id});await session.refresh();await session.waitFor('return document.querySelectorAll(".mind-node").length===4&&!document.querySelector(".startup");');
 await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(300);
 await session.click('[data-node-id="shared"] .card-header');await session.waitFor('return !!document.querySelector(".parent-connect-point");');check(true,'选中节点后右上角显示独立连接点');
 const source=await center('.parent-connect-point'),target=await center('[data-node-id="b"] .node-label');
 report.viewport=await session.execute('return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};');
 await session.execute('document.querySelector(".parent-connect-point").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,buttons:1,clientX:arguments[0].x,clientY:arguments[0].y}));',[source]);await session.waitFor('return !!document.querySelector(".parent-connect-preview");');
 await session.execute('document.querySelector("[data-node-id=b]").dispatchEvent(new PointerEvent("pointermove",{bubbles:true,cancelable:true,buttons:1,clientX:arguments[0].x,clientY:arguments[0].y}));',[target]);
 check(await session.waitFor('return !!document.querySelector(".parent-connect-preview")&&!!document.querySelector("[data-node-id=b].parent-connect-target");'),'拖动 PointerEvent 在桌面显示预览线并高亮整个目标节点');await screenshot('连线预览.png');
 await session.execute('document.querySelector("[data-node-id=b]").dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,button:0,clientX:arguments[0].x,clientY:arguments[0].y}));',[target]);await session.waitFor('return !!document.querySelector(".additional-parent-edge")&&!!document.querySelector(".save-saved");');
 const connected=await session.native('load_document',{id:doc.id});check(connected.nodes.shared.extraParentIds.includes('b')&&connected.nodes.b.position.x===300&&connected.nodes.b.position.y===260,'拖到父节点建立共享连接并保存，节点位置不变');
 await key('z',['\uE009']);await session.waitFor('return !document.querySelector(".additional-parent-edge");');check(true,'直接连线支持撤销');
 await key('l',['\uE009','\uE008']);await session.waitFor('return !!document.querySelector(".parent-connect-preview");');await key('\uE00C');await session.waitFor('return !document.querySelector(".parent-connect-preview");');check(true,'Ctrl+Shift+L 拉出连线，Esc 取消');
 await key('l',['\uE009','\uE008']);await session.waitFor('return !!document.querySelector(".parent-connect-preview");');await session.click('[data-node-id="b"] .node-label');await session.waitFor('return !!document.querySelector(".additional-parent-edge")&&!!document.querySelector(".save-saved");');check(true,'快捷键后直接点击父节点即可连接');await screenshot('连接完成.png');
 await session.close();await sleep(300);await session.open(app);await session.waitFor('return !!document.querySelector(".additional-parent-edge")&&!document.querySelector(".startup");');const reopened=await session.native('load_document',{id:doc.id});check(reopened.nodes.shared.extraParentIds.includes('b')&&reopened.nodes.shared.body.content[0].content[0].text.includes('同一个节点'),'关闭并重新打开后，共享连接和正文保留');
 check(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'桌面操作无错误提示');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(session.id){await screenshot('失败.png').catch(()=>{});report.diagnostics=await session.execute('return {error:document.querySelector("[role=alert]")?.textContent,body:document.body.innerText,pointerLog:window.__pointerLog};').catch(()=>null);}}
finally{await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportPath:path.join(root,'report.json')},null,2));}
