import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,waitSaved} from './lib/soak-actions.mjs';
import {paragraph,hashBytes} from './lib/content-fixture.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 验证安装/qingtu.exe');
const layoutMode=process.env.QINGTU_LAYOUT_MODE??'free';if(!['auto','free'].includes(layoutMode))throw Error('Choose auto or free layout');
const includeVideo=process.env.QINGTU_MATRIX_VIDEO==='1';
const output=path.resolve('.tooling/body-matrix',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={caseId:'T01-T04-native-fold-column-width-save-reopen-matrix',status:'running',app,exeSha256:hashBytes(await fs.readFile(app)),layoutMode,includeVideo,cases:[],started:new Date().toISOString(),scope:`${layoutMode} layout: two ratios, three widths, four collapse states; does not replace real IME or all editor operations`};
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448'),ids=[];let original;
const assert=(value,message)=>{if(!value)throw Error(message);};
function fixture(ratio,width,assetId,videoId){
 const base={kind:'text',title:'双栏验收',body:{type:'doc',content:[paragraph('')]},side:'right',color:'teal',contentCollapsed:false,childrenCollapsed:false};
 const root={...base,id:'matrix-root',parentId:null,childIds:['matrix-card'],position:{x:0,y:0}};
 const body={type:'doc',content:[{type:'columns',attrs:{ratio},content:[{type:'column',content:[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}},{type:'bulletList',content:['适用于直角三角形','c 为斜边'].map(text=>({type:'listItem',content:[paragraph(text)]}))},paragraph('左栏普通文字应当换行。'.repeat(3))]},{type:'column',content:[{type:'assetImage',attrs:{assetId,alt:'勾股定理三角形示意图'}},paragraph('右栏图片保持原始比例。')]}]}]};
 if(videoId)body.content[0].content[1].content.push({type:'video',attrs:{assetId:videoId}});
 const card={...base,id:'matrix-card',kind:'card',title:'勾股定理',parentId:root.id,childIds:['matrix-child'],body,preferredWidth:width+34,position:{x:300,y:0},color:'orange'};
 const child={...base,id:'matrix-child',parentId:card.id,childIds:[],title:'子节点继续显示',position:{x:780,y:0}};
 return {id:'body-matrix-'+crypto.randomUUID(),schemaVersion:1,title:`双栏矩阵 ${ratio} ${width}`,rootId:root.id,revision:0,updatedAt:0,layoutMode,viewport:{x:150,y:140,zoom:1},nodes:Object.fromEntries([root,card,child].map(n=>[n.id,n]))};
}
async function geometry(){return session.execute(`const card=document.querySelector('[data-node-id="matrix-card"]'),header=card?.querySelector('.card-header'),body=card?.querySelector('.card-body>.rich-doc'),columns=body?.querySelector('.rich-columns'),image=body?.querySelector('img');const r=header?.getBoundingClientRect();return {title:header?.querySelector('.node-label')?.textContent,header:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,bodyVisible:!!body,childVisible:!!document.querySelector('[data-node-id="matrix-child"]'),availableWidth:body?parseFloat(getComputedStyle(body).width)-parseFloat(getComputedStyle(body).paddingLeft)-parseFloat(getComputedStyle(body).paddingRight)-parseFloat(getComputedStyle(body).borderLeftWidth)-parseFloat(getComputedStyle(body).borderRightWidth):null,columns:columns?getComputedStyle(columns).gridTemplateColumns.split(' ').length:null,ratio:columns?.getAttribute('data-ratio'),overflow:body?[body,...body.querySelectorAll('p,li,.rich-column')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.tagName):[],image:image?{width:image.width,height:image.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight}:null,error:document.querySelector('[role=alert]')?.textContent??null};`);}
async function ensureCanvasVisible(){
 if(layoutMode!=='auto')return;
 for(let n=0;n<20;n++){
  if(await session.execute('const r=document.querySelector("[data-node-id=matrix-card] .card-header")?.getBoundingClientRect();return !!r&&r.left>80&&r.top>80&&r.right<innerWidth-30&&r.bottom<innerHeight-60;')){await waitSaved(session);return;}
  await session.execute('window.dispatchEvent(new CustomEvent("qingtu-canvas",{detail:"fit"}));');await sleep(100);
 }throw Error('Could not place automatic-layout test header inside usable viewport');
}
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');
 assert(info.initialized&&path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Use isolated test configuration');original=info.recentId;
 report.browserVersion=session.capabilities.browserVersion;report.configPath=info.configPath;
 const asset=await session.native('import_asset',{path:path.resolve('public/demo/triangle.png')}),videoId=includeVideo?info.assets.find(a=>a.mime?.startsWith('video/'))?.id:undefined;
 assert(!includeVideo||videoId,'Video fixture needs an existing seeded video');
 for(const ratio of ['1:1','3:2'])for(const width of [359,360,361]){
  const doc=fixture(ratio,width,asset.id,videoId);await saveNew(session,doc);ids.push(doc.id);await session.native('load_document',{id:doc.id});await session.refresh();
  await session.waitFor('const image=document.querySelector("[data-node-id=matrix-card] img");return image?.complete&&image.naturalWidth>0&&document.querySelector(".katex");');await sleep(150);await ensureCanvasVisible();
  // Borders are quantized to device pixels (for example 0.8 CSS px at DPR
  // 1.25). Establish the requested content width rather than rounding it.
  let initial=await geometry();
  if(Math.abs(initial.availableWidth-width)>.05){
   const current=await session.native('load_document',{id:doc.id});
   const card={...current.nodes['matrix-card'],preferredWidth:current.nodes['matrix-card'].preferredWidth+width-initial.availableWidth};
   await session.native('save_document',{patch:{document:current,upserts:[card],removedIds:[],baseRevision:current.revision,commandId:crypto.randomUUID()}});
   await session.refresh();await session.waitFor('const image=document.querySelector("[data-node-id=matrix-card] img");return image?.complete&&image.naturalWidth>0&&document.querySelector(".katex");');initial=await geometry();
  }
  assert(Math.abs(initial.availableWidth-width)<=.05,'Could not establish exact content width');
  for(const [index,[bodyClosed,childrenClosed]]of [[false,false],[true,false],[true,true],[false,true]].entries()){
   if(index===1)await session.click('[data-node-id="matrix-card"] .body-toggle');
   if(index===2)await session.click('[data-node-id="matrix-card"] .branch-toggle');
   if(index===3)await session.click('[data-node-id="matrix-card"] .body-toggle');
   await waitSaved(session);const saved=await session.native('load_document',{id:doc.id}),node=saved.nodes['matrix-card'];
   assert(node.contentCollapsed===bodyClosed&&node.childrenCollapsed===childrenClosed,'Saved fold flags differ');
   assert(isDeepStrictEqual(node.body,doc.nodes['matrix-card'].body),'Body/order/formula/asset changed');
   await session.refresh();await session.waitFor('return !!document.querySelector("[data-node-id=matrix-card] .card-header");');
   if(!bodyClosed)await session.waitFor('const image=document.querySelector("[data-node-id=matrix-card] img");return image?.complete&&image.naturalWidth>0&&document.querySelector(".katex");');await sleep(100);
   const actual=await geometry();assert(!actual.error&&actual.title==='勾股定理'&&actual.bodyVisible===!bodyClosed&&actual.childVisible===!childrenClosed,'Reopened visible state differs: '+JSON.stringify(actual));
   if(includeVideo){const video=await session.execute('const b=document.querySelector("[data-node-id=matrix-card] [aria-label=播放视频]");return {control:!!b,sources:document.querySelectorAll("[data-node-id=matrix-card] video[src]").length};');assert(video.control===!bodyClosed&&video.sources===0,'Body video control/source state differs');actual.video=video;}
   assert(Math.abs(actual.header.height-initial.header.height)<=1,'Title header height changed with collapse');
   if(!bodyClosed){
    assert(Math.abs(actual.availableWidth-width)<=.05&&actual.columns===(width<360?1:2)&&actual.ratio===ratio,'Wrong responsive columns: '+JSON.stringify(actual));
    assert(actual.overflow.length===0,'Ordinary body content overflow');const image=actual.image;
    assert(image&&Math.abs(image.width/image.height-image.naturalWidth/image.naturalHeight)<.03,'Image aspect ratio changed');
   }
   const screenshot=`ratio-${ratio.replace(':','-')}-width-${width}-state-${index}.png`;
   await fs.writeFile(path.join(output,screenshot),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
   report.cases.push({ratio,width,bodyClosed,childrenClosed,status:'passed',savedRevision:saved.revision,screenshot,...actual});
   await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{
 if(session.id&&original){await session.native('load_document',{id:original}).catch(()=>{});await session.refresh().catch(()=>{});}
 if(report.status==='passed')for(const id of ids)await session.native('delete_document',{id});
 report.retainedTestDocuments=report.status==='passed'?[]:ids;await session.close();report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,status:report.status,cases:report.cases.length,error:report.error},null,2));
}
