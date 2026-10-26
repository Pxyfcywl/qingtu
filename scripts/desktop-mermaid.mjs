import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession,sleep} from './lib/native.mjs';
import {checkDiagramZoom,installDiagramExportAudit} from './lib/diagram-checks.mjs';
import {checkLongDiagramPan} from './lib/long-diagram-checks.mjs';

const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const output=path.resolve('releases',version),root=path.resolve('.tooling','mermaid-'+version,new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});await fs.mkdir(output,{recursive:true});
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const report={status:'running',root,app,buildFlavor:process.env.QINGTU_BUILD_FLAVOR??'validation',exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[]};
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);};
const samples=[
 ['流程图','flowchart LR\n A[提出想法] --> B{技术可行？}\n B -->|可行| C[制作下一版]\n B -->|调整| A\n C --> D[试用反馈]'],
 ['饼图','pie title 每日时间分配\n "学习" : 45\n "开发" : 35\n "休息" : 20'],
 ['时序图','sequenceDiagram\n participant U as 用户\n participant M as 轻图\n participant P as Pele\n U->>M: 粘贴 Mermaid 代码\n M->>P: 本地绘制\n P-->>M: SVG 图表\n M-->>U: 卡片中显示'],
 ['思维导图','mindmap\n root((项目计划))\n  想法\n   收集资料\n   梳理问题\n  开发\n   实现功能\n   测试效果\n  交付\n   打包新版\n   收集反馈'],
 ['甘特图','gantt\n title 功能迭代计划\n dateFormat YYYY-MM-DD\n section 开发\n 接入图表 :done, a, 2026-10-25, 1d\n 效果验证 :active, b, after a, 2d\n section 试用\n 用户反馈 :c, after b, 2d'],
];
const p=text=>({type:'paragraph',content:[{type:'text',text}]}),block=source=>({type:'codeBlock',attrs:{language:'mermaid'},content:[{type:'text',text:source}]});
const base={kind:'text',body:{type:'doc',content:[{type:'paragraph'}]},contentCollapsed:false,childrenCollapsed:false,side:'right',color:'teal'};
const doc={id:crypto.randomUUID(),schemaVersion:1,title:'Mermaid 图表体验 · '+version,rootId:'root',revision:0,layoutMode:'free',viewport:{x:50,y:80,zoom:.7},updatedAt:Date.now(),nodes:{}};
doc.nodes.root={...base,id:'root',title:'Mermaid 图表体验',parentId:null,childIds:samples.map((_,i)=>'diagram-'+i),position:{x:0,y:300}};
samples.forEach(([title,source],i)=>{const id='diagram-'+i;doc.nodes[id]={...base,id,kind:'card',title,parentId:'root',childIds:[],position:{x:300+i%3*570,y:Math.floor(i/3)*800},preferredWidth:520,color:['teal','blue','purple','orange','rose'][i],body:{type:'doc',content:[p('编辑：代码块 → 语言选择 Mermaid 图表。也可直接粘贴围栏代码。'),block(source)]}};});
await fs.writeFile(path.join(output,'Mermaid图表示例.md'),'# Mermaid 图表示例\n\n直接复制带围栏的代码粘贴到轻图正文；也可新建代码块并选择 Mermaid 图表。\n\n'+samples.map(([title,source])=>'## '+title+'\n\n```mermaid\n'+source+'\n```').join('\n\n')+'\n');
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4475','--native-port','9575','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4475');
const shot=async name=>fs.writeFile(path.join(output,name),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
try{
 await sleep(800);await session.open(app);check(!(await session.native('bootstrap')).initialized,'使用隔离配置与资料库验证桌面程序');
 await session.native('initialize_storage',{directory:path.join(root,'library')});
 await session.native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});
 await session.refresh();await session.waitFor('return !!document.querySelector(".library-open-map");');await session.click('.library-open-map');
 await session.waitFor('return document.querySelectorAll(".diagram-surface svg.pele").length===5&&!document.querySelector("[data-content-loading=true],.startup");');
 check(true,'五种中文图表在真实 WebView2 本地渲染');await shot('图表导图预览.png');
 await session.execute('document.querySelector(".diagram-tools button").click();');await session.waitFor('return !!document.querySelector(".diagram-viewer svg.pele");');
 check(await session.execute('const r=document.querySelector(".diagram-viewer").getBoundingClientRect();return Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2;'),'图表放大覆盖全窗口');
 await shot('图表全窗口预览.png');await checkDiagramZoom(session,check,shot);await session.click('[aria-label="关闭图表预览"]');
 const original=await session.execute('return document.querySelector(".react-flow__viewport").style.transform;');
 await session.execute('document.querySelector("[data-node-id=diagram-0] [aria-label=编辑卡片正文]").click();');
 await session.waitFor('return !!document.querySelector("[contenteditable=true] .diagram-surface svg.pele");');
 check(await session.execute('return document.querySelector("[contenteditable=true] pre code").textContent===arguments[0];',[samples[0][1]]),'进入编辑仍保留完整 Mermaid 源码与预览');await shot('图表源码与实时预览.png');
 await session.execute('document.querySelector("[aria-label=完成编辑]").click();');
 await session.waitFor('return !document.querySelector("[contenteditable=true]");');
 check(await session.execute('return document.querySelectorAll(".diagram-surface svg.pele").length===5;'),'完成编辑恢复图表阅读');
 await session.waitFor('return !!document.querySelector(".save-saved");');
 const saved=await session.native('load_document',{id:doc.id});
 const exported=path.join(output,'Mermaid图表体验.qmap');await session.native('export_project',{id:doc.id,path:exported});
 const imported=await session.native('import_project',{path:exported});check(isDeepStrictEqual(imported.nodes,saved.nodes),'项目导出导入保留五类源码与语言属性');
 check(samples.every(([,source],i)=>{const node=imported.nodes['diagram-'+i].body.content.find(n=>n.type==='codeBlock');return node?.attrs.language==='mermaid'&&node.content.map(n=>n.text??'').join('')===source;}),'编辑及保存没有改变图表源码');
 await installDiagramExportAudit(session);
 const png=path.join(output,'图表完整导出.png');await fs.rm(png,{force:true});await session.execute('window.dispatchEvent(new CustomEvent("qingtu-export-png",{detail:arguments[0]}));',[png]);
 for(let i=0;i<250;i++){try{await fs.access(png);break;}catch{}await sleep(100);}
 const bytes=await fs.readFile(png);check(bytes.readUInt32BE(16)>2000&&bytes.readUInt32BE(20)>1000,'PNG 导出包含全部图表');
 await session.waitFor('return !document.querySelector(".busy-overlay");');
 report.themedPixels=await session.execute('return window.__diagramExportThemedPixels;');check(report.themedPixels>100,'PNG 像素保留与阅读相同的 Mermaid 主题色');
 await session.refresh();await session.waitFor('return !!document.querySelector(".library-open-map");');await session.execute('Array.from(document.querySelectorAll(".library-open-map")).find(el=>el.textContent.includes(arguments[0])).click();',[doc.title]);
 await session.waitFor('return document.querySelectorAll(".diagram-surface svg.pele").length===5;');check(true,'关闭重开后五类图表仍显示');
 check(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'桌面操作与导出无错误提示');
 report.longDiagram=await checkLongDiagramPan(session,{check,shot,output});
 report.png={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length};report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(session.id){await shot('桌面失败现场.png').catch(()=>{});report.html=await session.execute('return document.body.innerText;').catch(()=>null);}}
finally{await session.close();driver.kill();await fs.writeFile(path.join(output,'桌面验证.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
