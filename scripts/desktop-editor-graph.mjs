import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession,sleep} from './lib/native.mjs';
const root=path.resolve('.tooling/editor-graph',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const app=path.resolve('.tooling/target/release/qingtu.exe'),report={status:'running',exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[],root};
const check=(value,label)=>{if(!value)throw Error(label);report.checks.push(label);};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4465','--native-port','9565','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4465');
async function screenshot(name){await fs.writeFile(path.join(root,name),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));}
try{
 await sleep(800);await session.open(app);check(!(await session.native('bootstrap')).initialized,'独立测试配置，不连接用户资料库');
 await session.native('initialize_storage',{directory:path.join(root,'library')});await session.refresh();await session.waitFor('return !!document.querySelector(".node-card .katex");');
 let info=await session.native('bootstrap'),doc=await session.native('load_document',{id:info.recentId});const shared=Object.values(doc.nodes).find(node=>node.title==='勾股定理'),parent=Object.values(doc.nodes).find(node=>node.title==='基础概念');
 await session.execute('window.prompt=()=>{throw Error("Unexpected formula prompt")};Array.from(document.querySelectorAll(".node-card")).find(el=>el.textContent.includes("勾股定理")).querySelector("[aria-label=编辑卡片正文]").click();');
 await session.waitFor('return !!document.querySelector("[contenteditable=true]");');
 await session.execute('const el=document.querySelector("[contenteditable=true]");el.editor.commands.setContent({type:"doc",content:[{type:"paragraph"}]});document.querySelector("[aria-label=插入公式]").click();');
 await session.waitFor('return !!document.querySelector(".math-source textarea");');
 await session.execute('const input=document.querySelector(".math-source textarea");input.value=arguments[0];input.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:arguments[0]}));',['\\frac{x^2}{y}+z']);
 check(await session.waitFor('return document.querySelector(".math-live-preview annotation")?.textContent===arguments[0];',['\\frac{x^2}{y}+z']),'公式源码修改后在桌面窗口实时排版，无输入弹窗');
 check(await session.execute('const input=document.querySelector(".math-source").getBoundingClientRect(),preview=document.querySelector(".math-live-preview").getBoundingClientRect();return preview.x>input.x;'),'公式源码与预览并排显示');await screenshot('formula-live.png');
 await session.execute('document.querySelector("[aria-label=完成公式编辑]").click();const el=document.querySelector("[contenteditable=true]");el.editor.commands.focus("end");');
 const bytes=Array.from(await fs.readFile('public/demo/lesson.mp4'));
 await session.execute('const el=document.querySelector("[contenteditable=true]"),rect=el.getBoundingClientRect(),data=new DataTransfer();data.items.add(new File([new Uint8Array(arguments[0])],"拖入视频.mp4",{type:"video/mp4"}));el.dispatchEvent(new DragEvent("drop",{dataTransfer:data,bubbles:true,cancelable:true,clientX:rect.left+30,clientY:rect.bottom-8}));',[bytes]);
 check(await session.waitFor('return !!document.querySelector(".editor-video video[src]")&&!document.querySelector(".busy-overlay");'),'拖入视频通过真实二进制 IPC 落盘，编辑区显示播放器');
 const played=await session.asyncScript('const done=arguments[arguments.length-1],video=document.querySelector(".editor-video video");video.muted=true;video.play().then(()=>{done({width:video.videoWidth,height:video.videoHeight});},error=>done({error:String(error)}));');check(played.width===640&&!played.error,'拖入的本地 MP4 在编辑区实际解码播放');
 await session.execute('document.querySelector(".editor-video video").pause();document.querySelector("[contenteditable=true]").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
 await session.waitFor('return !document.querySelector("[contenteditable=true]")&&!!document.querySelector(".save-saved");');
 await session.click('[aria-label="节点属性"]');await session.waitFor('return !!document.querySelector("select[aria-label=添加父节点连接]");');
 await session.execute('const select=document.querySelector("select[aria-label=添加父节点连接]");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}));',[parent.id]);
 await session.waitFor('return !!document.querySelector(".save-saved");');doc=await session.native('load_document',{id:doc.id});
 check(doc.nodes[shared.id].extraParentIds?.includes(parent.id),'新增第二个父节点后连接保存至 SQLite');
 const body=JSON.stringify(doc.nodes[shared.id].body);check(body.includes('\\\\frac{x^2}{y}+z')&&body.includes('video'),'公式与视频正文完整保存');
 await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(200);await screenshot('shared-parent.png');
 const project=path.join(root,'公式视频共享节点.qmap');await session.native('export_project',{id:doc.id,path:project});const imported=await session.native('import_project',{path:project});check(isDeepStrictEqual(imported.nodes,doc.nodes),'项目导出导入保留公式、视频和多父连接');
 await session.close();await sleep(300);await session.open(app);await session.waitFor('return !document.querySelector(".startup")&&!!document.querySelector(".save-saved");');
 info=await session.native('bootstrap');const reopened=await session.native('load_document',{id:info.recentId});check(reopened.nodes[shared.id].extraParentIds?.includes(parent.id)&&JSON.stringify(reopened.nodes[shared.id].body)===JSON.stringify(doc.nodes[shared.id].body),'完全退出并重启后共享连接、公式与视频仍完整');
 check(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'桌面操作无错误提示');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(session.id)report.diagnostics=await session.execute('return {error:document.querySelector("[role=alert]")?.textContent,editor:document.querySelector("[contenteditable=true]")?.editor.getJSON()};').catch(()=>null);}
finally{await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportPath:path.join(root,'report.json')},null,2));}
