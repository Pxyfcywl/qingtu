import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
const root=path.resolve('.tooling/library-delete',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const app=path.resolve('.tooling/target/release/qingtu.exe'),report={status:'running',root,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[]};
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4470','--native-port','9570','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4470');
const shot=async name=>fs.writeFile(path.join(root,name),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
const clickText=async(selector,text)=>{await session.execute('Array.from(document.querySelectorAll(arguments[0])).find(e=>e.textContent.includes(arguments[1])).click();',[selector,text]);};
const pointer=async actions=>session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions}]});
const move=(x,y,duration=0)=>({type:'pointerMove',origin:'viewport',x:Math.round(x),y:Math.round(y),duration});
try{
  await sleep(800);await session.open(app);check(!(await session.native('bootstrap')).initialized,'测试使用独立配置和资料库');
  await session.native('initialize_storage',{directory:path.join(root,'library')});await session.refresh();await session.waitFor('return !!document.querySelector(".library-home");');
  check((await session.native('bootstrap')).documents.length===0,'启动首页不生成演示导图');
  const base={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},contentCollapsed:false,childrenCollapsed:false,side:'right',color:'teal'};
  const doc={id:crypto.randomUUID(),schemaVersion:1,title:'桌面子节点连线',rootId:'root',revision:0,layoutMode:'free',viewport:{x:80,y:180,zoom:1},updatedAt:Date.now(),nodes:{
    root:{...base,id:'root',title:'桌面子节点连线',parentId:null,childIds:['a','b'],position:{x:0,y:0}},
    a:{...base,id:'a',title:'父 A',parentId:'root',childIds:['c'],position:{x:300,y:0}},
    b:{...base,id:'b',title:'父 B',parentId:'root',childIds:[],position:{x:300,y:230}},
    c:{...base,id:'c',title:'屏幕外子 C',parentId:'a',childIds:[],position:{x:650,y:230}}
  }};
  const other={...doc,id:crypto.randomUUID(),title:'第二张导图',nodes:{root:{...base,id:'root',title:'第二张导图',parentId:null,childIds:[],position:{x:0,y:0}}}};
  for(const document of [doc,other])await session.native('save_document',{patch:{document,upserts:Object.values(document.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});
  await session.refresh();await session.waitFor('return document.querySelectorAll(".library-table-row").length===2;');
  await session.click('[aria-label="新建文件夹"]');await session.execute('const el=document.querySelector(".folder-modal input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"读论文");el.dispatchEvent(new Event("input",{bubbles:true}));');await session.click('.folder-modal .primary-button');await session.waitFor('return !document.querySelector(".folder-modal");');
  const folder=(await session.native('bootstrap')).workspace.folders[0].id;
  await clickText('.folder-row','最近使用');await session.execute('const el=document.querySelector(".library-table-row select");el.value=arguments[0];el.dispatchEvent(new Event("change",{bubbles:true}));',[folder]);await sleep(200);await clickText('.folder-row','读论文');
  check(await session.execute('return document.querySelectorAll(".library-table-row").length===1;'),'桌面创建文件夹并归类，点击文件夹只显示其中导图');await shot('文件夹首页.png');
  await clickText('.folder-row','最近使用');await clickText('.library-open-map','桌面子节点连线');await session.waitFor('return !!document.querySelector("[data-node-id=b]");');await session.click('[data-node-id="b"] .node-label');
  await sleep(400);await session.click('.parent-connect-point');await session.waitFor('return !!document.querySelector(".parent-connect-preview");');await session.click('[data-node-id="c"] .node-label');
  await session.waitFor('return !!document.querySelector(".additional-parent-edge")&&!!document.querySelector(".save-saved");');
  check((await session.native('load_document',{id:doc.id})).nodes.c.extraParentIds.includes('b'),'实际桌面可从 B 连接子 C，删除前连线正常');
  await session.click('.home-tab');await session.waitFor('return !!document.querySelector(".library-home");');await clickText('.library-open-map','第二张导图');await session.waitFor('return document.querySelector(".document-button")?.textContent.includes("第二张导图");');
  check(await session.execute('return document.querySelectorAll(".document-tab").length===2;'),'打开多张导图形成顶部标签');await session.close();await sleep(300);await session.open(app);await session.waitFor('return !!document.querySelector(".library-home");');
  check(await session.execute('return document.querySelectorAll(".document-tab").length===2;'),'完全退出后重启进入首页，原有两个标签仍保留');await shot('重启保留标签.png');
  await session.click('[aria-label="关闭标签 第二张导图"]');await sleep(300);await session.close();await sleep(300);await session.open(app);await session.waitFor('return !!document.querySelector(".library-home");');
  const info=await session.native('bootstrap');check(info.workspace.openIds.length===1&&info.documents.length===2&&info.workspace.folders.length===1,'关闭标签后重启只保留未关闭标签，导图和文件夹不丢失');
  await session.click('[aria-label="切换到 桌面子节点连线"]');await session.waitFor('return !!document.querySelector(".additional-parent-edge");');check(!await session.execute('return document.querySelector("[role=alert]")?.textContent;'),'桌面重启后连线保留且无错误');await session.click('.home-tab');await session.waitFor('return !!document.querySelector(".library-home");');
  const row=await session.execute('const el=Array.from(document.querySelectorAll(".library-open-map")).find(e=>e.textContent.includes("桌面子节点连线")),r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};');
  await pointer([move(row.x,row.y),{type:'pointerDown',button:2},{type:'pointerUp',button:2}]);await session.waitFor('return !!document.querySelector(".library-context-menu");');await session.click('.delete-menu-item');await session.waitFor('return !!document.querySelector("dialog[open]");');
  check((await session.native('bootstrap')).documents.length===2,'真实右键菜单进入二次确认，尚未删除任何导图');
  check(await session.execute('return document.activeElement?.classList.contains("delete-cancel");'),'确认框默认焦点在取消');await shot('删除二次确认.png');
  await session.click('.delete-cancel');check((await session.native('bootstrap')).documents.length===2,'取消删除保留两张导图');
  await session.click('[aria-label="删除思维导图 桌面子节点连线"]');await session.click('.delete-dialog-actions .danger-button');await session.waitFor('return !document.querySelector("dialog[open]")&&document.querySelectorAll(".library-table-row").length===1;');
  check((await session.native('bootstrap')).workspace.openIds.length===0,'确认删除同步移除原顶部标签');await session.close();await sleep(300);await session.open(app);await session.waitFor('return !!document.querySelector(".library-home");');
  const remaining=await session.native('bootstrap');check(remaining.documents.length===1&&remaining.documents[0].id===other.id&&remaining.workspace.openIds.length===0,'完全退出重启后已删导图不再出现，另一张导图完整保留');await shot('删除完成.png');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(session.id){await shot('失败.png').catch(()=>{});report.diagnostics=await session.execute('return document.body.innerText;').catch(()=>null);}}
finally{await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
