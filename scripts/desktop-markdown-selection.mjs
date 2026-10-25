import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';

const root=path.resolve('.tooling/markdown-selection',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const report={app,root,sha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),status:'running',checks:[]};
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4478','--native-port','9578','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4478');
const actions=actions=>session.request('POST',`/session/${session.id}/actions`,{actions});
const hover=async selector=>{
  const point=await session.execute('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x+8,y:r.y+8};',[selector]);
  await actions([{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',x:Math.round(point.x),y:Math.round(point.y),duration:60}]}]);
};
const altA=()=>actions([{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\uE00A'},{type:'keyDown',value:'a'},{type:'keyUp',value:'a'},{type:'keyUp',value:'\uE00A'}]}]);
const selected=()=>session.execute('return getSelection()?.toString();');
const shot=async name=>fs.writeFile(path.join(root,name),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
const first='const first = 1;\nconsole.log(first);',second='print("second")';
const paragraph=text=>({type:'paragraph',content:[{type:'text',text}]});
const content=[paragraph('代码前的正文'),{type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text:first}]},paragraph('代码之间的正文'),{type:'codeBlock',attrs:{language:'python'},content:[{type:'text',text:second}]},paragraph('代码后的正文')];
try{
  await sleep(800);await session.open(app);
  check(!(await session.native('bootstrap')).initialized,'使用独立配置和测试资料库');
  await session.native('initialize_storage',{directory:path.join(root,'library')});
  const base={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},contentCollapsed:false,childrenCollapsed:false,side:'right',color:'teal'};
  const doc={id:crypto.randomUUID(),schemaVersion:1,title:'鼠标范围全选验证',rootId:'root',revision:0,layoutMode:'free',viewport:{x:70,y:70,zoom:1},updatedAt:Date.now(),nodes:{
    root:{...base,id:'root',title:'范围选择',parentId:null,childIds:['card','other'],position:{x:0,y:0}},
    card:{...base,id:'card',kind:'card',title:'当前 MD',parentId:'root',childIds:[],position:{x:250,y:0},preferredWidth:430,body:{type:'doc',content}},
    other:{...base,id:'other',kind:'card',title:'另一篇 MD',parentId:'root',childIds:[],position:{x:740,y:0},preferredWidth:300,body:{type:'doc',content:[paragraph('另一篇的独立正文')]}},
  }};
  await session.native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});
  await session.refresh();await session.waitFor('return !!document.querySelector(".library-open-map");');
  await session.execute('Array.from(document.querySelectorAll(".library-open-map")).find(el=>el.textContent.includes(arguments[0])).click();',[doc.title]);
  await session.waitFor('return !!document.querySelector("[data-node-id=card] pre .hljs-keyword");');
  const card='[data-node-id=card]';
  await hover(card+' pre');await altA();check(await selected()===first,'WebView2 阅读态 Alt+A 仅选择鼠标所在代码块');
  await hover(card+' .rich-doc p');await altA();const all=await selected();
  check(all.includes(first)&&all.includes(second)&&all.includes('代码后的正文')&&!all.includes('另一篇的独立正文')&&!all.includes('双击编辑'),'阅读态正文全选局限于当前 MD');
  await shot('阅读态整篇全选.png');
  await session.click(card+' [aria-label="编辑卡片正文"]');await session.waitFor('return !!document.querySelector("[contenteditable=true]");');
  await hover(card+' pre');await altA();check(await selected()===first,'WebView2 编辑态 Alt+A 仅选择当前代码块');
  await shot('编辑态代码块全选.png');
  for(const selector of ['.react-flow__pane',card+' .card-header','[aria-label="完成编辑"]']){
    await hover(selector);await altA();check(await selected()===first,`鼠标位于 ${selector} 时保持原选区`);
  }
  await hover(card+' .editor-content p');await altA();
  check(await session.execute('const {doc,selection}=document.querySelector("[contenteditable=true]").editor.state;return selection.from===0&&selection.to===doc.content.size;'),'编辑态按鼠标正文位置全选完整 MD');
  await hover('[data-node-id=other] .rich-doc p');await altA();
  check(await selected()==='另一篇的独立正文','焦点留在编辑器时可按鼠标位置全选另一张阅读卡片');
  await hover(card+' pre');await altA();
  await actions([{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'X'},{type:'keyUp',value:'X'}]}]);
  check(await session.execute('const el=document.querySelector("[contenteditable=true]");return el.querySelector("pre").textContent==="X"&&el.querySelectorAll("pre")[1].textContent===arguments[0]&&el.querySelector("p").textContent==="代码前的正文";',[second]),'全选后输入只替换当前代码块，其他代码及正文保留');
  await session.click('[aria-label="完成编辑"]');await session.waitFor('return !!document.querySelector(".save-saved");');
  const saved=await session.native('load_document',{id:doc.id});
  check(saved.nodes.card.body.content.find(node=>node.type==='codeBlock').content[0].text==='X','修改经过桌面 SQLite 正常保存');
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(session.id){await shot('失败.png').catch(()=>{});report.diagnostics=await session.execute('return document.body.innerText;').catch(()=>null);}}
finally{await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
