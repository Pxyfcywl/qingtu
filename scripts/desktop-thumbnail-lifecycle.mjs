import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {saveNew,waitSaved} from './lib/soak-actions.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve(process.env.QINGTU_REPORT_DIR,'thumbnail-lifecycle');if(!output.startsWith(path.resolve('.tooling')+path.sep))throw Error('Use a project test output directory');await fs.mkdir(output,{recursive:true});
const report={caseId:'native-shared-thumbnail-revoke-and-repeated-png',status:'running',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[],exports:[]};
report.scope='Three-node shared-image fixture; lifecycle and repeated PNG checks, not M/L resource or complete T08/T10 acceptance';report.harnessFiles=[];for(const file of ['scripts/desktop-thumbnail-lifecycle.mjs','scripts/lib/native.mjs','scripts/lib/cdp.mjs','scripts/lib/soak-actions.mjs'])report.harnessFiles.push({file,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');let diagnostics,original,created;
const assert=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message);};
const audit=()=>session.execute('const a=window.__thumbnailAudit;return {active:[...a.active],created:a.created,revoked:a.revoked,blobFetches:a.blobFetches};');
try{
 await session.open(app);const info=await session.native('bootstrap');assert(path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Isolated test configuration');original=info.recentId;
 const asset=await session.native('import_asset',{path:path.resolve('public/demo/triangle.png')}),id='thumbnail-'+crypto.randomUUID();created=id;
 const node={kind:'text',title:'资源检查',body:{type:'doc',content:[{type:'paragraph'}]},side:'right',color:'teal',contentCollapsed:false,childrenCollapsed:false};
 const doc={id,schemaVersion:1,title:'缩略图资源检查',rootId:'thumb-root',revision:0,layoutMode:'free',viewport:{x:120,y:100,zoom:1},updatedAt:Date.now(),nodes:{
  'thumb-root':{...node,id:'thumb-root',parentId:null,childIds:['thumb-card','thumb-image'],position:{x:0,y:150}},
  'thumb-card':{...node,id:'thumb-card',kind:'card',title:'共享图片卡片',parentId:'thumb-root',childIds:[],position:{x:280,y:0},body:{type:'doc',content:[{type:'assetImage',attrs:{assetId:asset.id,alt:'共享三角形'}}]}},
  'thumb-image':{...node,id:'thumb-image',kind:'image',assetId:asset.id,parentId:'thumb-root',childIds:[],position:{x:780,y:0}}
 }};const fixture=JSON.stringify(doc,null,2)+'\n';await fs.writeFile(path.join(output,'fixture.json'),fixture);report.fixture={path:path.join(output,'fixture.json'),sha256:crypto.createHash('sha256').update(fixture).digest('hex'),assetId:asset.id};await saveNew(session,doc);await session.native('load_document',{id});
 diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);const origin=await session.execute('return location.origin;');const target=(await diagnostics.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 const {sessionId}=await diagnostics.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});await diagnostics.request('Page.enable',{},sessionId);
 await diagnostics.request('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const active=new Set(),a=window.__thumbnailAudit={active,created:[],revoked:[],blobFetches:0,violations:[]};window.addEventListener("securitypolicyviolation",e=>a.violations.push({directive:e.violatedDirective,blocked:e.blockedURI,source:e.sourceFile,line:e.lineNumber}));const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),fetchOriginal=window.fetch.bind(window);URL.createObjectURL=blob=>{const url=create(blob);active.add(url);a.created.push({url,size:blob.size,type:blob.type});return url;};URL.revokeObjectURL=url=>{active.delete(url);a.revoked.push(url);return revoke(url);};window.fetch=(...args)=>{if(String(args[0]).startsWith('blob:'))a.blobFetches++;return fetchOriginal(...args);};})();`},sessionId);
 await session.refresh();await session.resizeViewport(1440,844);report.frontendScripts=await session.execute('return Array.from(document.querySelectorAll("script[src]")).map(s=>s.src);');
 await session.waitFor('return document.querySelectorAll(".asset-image").length===2&&Array.from(document.querySelectorAll(".asset-image")).every(i=>i.complete&&i.naturalWidth>0);');
 const urls=await session.execute('return Array.from(document.querySelectorAll(".asset-image")).map(i=>i.src);');assert(urls[0].startsWith('blob:')&&urls[0]===urls[1],'Two nodes share one thumbnail Blob URL');assert((await audit()).active.length===1,'Exactly one live thumbnail URL');
 await session.click('[data-node-id="thumb-card"] .body-toggle');await waitSaved(session);assert((await audit()).active.includes(urls[0]),'Folding one consumer retains the other consumer');
 await session.click('[data-node-id="thumb-card"] .body-toggle');await session.waitFor('return document.querySelectorAll(".asset-image").length===2;');
 await session.click('[data-node-id="thumb-root"] .branch-toggle');await session.waitFor('return window.__thumbnailAudit.active.size===0;');assert((await audit()).revoked.includes(urls[0]),'Last consumer disappearing revokes the URL');
 await session.click('[data-node-id="thumb-root"] .branch-toggle');await session.waitFor('return document.querySelectorAll(".asset-image").length===2&&Array.from(document.querySelectorAll(".asset-image")).every(i=>i.complete&&i.naturalWidth>0);');
 const next=await session.execute('return document.querySelector(".asset-image").src;');assert(next!==urls[0]&&(await audit()).active.length===1,'Reopening creates one fresh shared URL');
 for(let n=1;n<=3;n++){
  const before=await audit(),file=path.join(output,`export-${n}.png`);await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});await session.execute('window.dispatchEvent(new CustomEvent("qingtu-export-png",{detail:arguments[0]}));',[file]);
  let stat;for(let i=0;i<150;i++){stat=await fs.stat(file).catch(()=>null);if(stat?.size>1000)break;if(i%5===0){const message=await session.execute('return document.querySelector("[role=alert]")?.textContent??"";');if(message)throw Error('PNG export failed: '+message);}await sleep(100);}
  await session.waitFor('return !document.querySelector(".busy-overlay");');assert(stat?.size>1000,'PNG export '+n+' contains output');
  const after=await audit();assert(after.blobFetches>before.blobFetches,'PNG export '+n+' reloads released encoding cache');assert(after.active.length===1,'PNG export '+n+' leaves one live thumbnail URL');report.exports.push({file,bytes:stat.size,before,after});
 }
 report.browserVersion=session.capabilities.browserVersion;report.finalAudit=await audit();report.status='passed';
}catch(error){report.status='failed';report.error=String(error);report.dom=await session.execute('return {violations:window.__thumbnailAudit?.violations,blobFetches:window.__thumbnailAudit?.blobFetches,message:document.querySelector("[role=alert]")?.textContent,images:Array.from(document.querySelectorAll("img")).map(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight})),text:document.body.innerText.slice(-1500)};').catch(error=>({captureError:String(error)}));process.exitCode=1;}
finally{if(original&&session.id){await session.native('load_document',{id:original}).catch(()=>{});if(report.status==='passed'&&created)await session.native('delete_document',{id:created}).catch(()=>{});}diagnostics?.close();await session.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,output}));}
