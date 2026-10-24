import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {saveNew} from './lib/soak-actions.mjs';
import {installPngAudit,visibleModel,expectedContents,outputDimensions} from './lib/png-audit.mjs';
import {inspectGeometry} from './lib/geometry-oracle.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),root=path.resolve('.tooling/png-completeness',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={status:'running',app,exeSha256:sha(await fs.readFile(app)),started:new Date().toISOString(),scope:'Installed Release S/M whole visible structure, export-event entry; native Save dialog and formal T06 mutation matrix excluded. Instrumentation observes original drawImage/toBlob without altering arguments/results.',harnessFiles:[],cases:[]};
const ipcFile=path.resolve(process.env.QINGTU_PNG_IPC_VALIDATION),ipcBytes=await fs.readFile(ipcFile),ipc=JSON.parse(ipcBytes);
if(ipc.status!=='passed'||ipc.exeSha256!==report.exeSha256||!ipc.checks.includes('JSON array rejected'))throw Error('Raw IPC contract validation must pass for this exact executable');
report.rawContractValidation={file:ipcFile,sha256:sha(ipcBytes),method:'Same installed backend rejects JSON bodies; successful native export therefore requires a raw binary request'};
for(const file of ['scripts/desktop-png-completeness.mjs','scripts/lib/png-audit.mjs','scripts/lib/native.mjs','scripts/lib/cdp.mjs','scripts/lib/geometry-oracle.mjs'])report.harnessFiles.push({file,sha256:sha(await fs.readFile(file))});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');let diagnostics,original;const created=[];
try{
 await session.open(app);const info=await session.native('bootstrap');original=info.recentId;
 if(!path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep))throw Error('Use isolated test configuration');
 diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);
 const origin=await session.execute('return location.origin;'),target=(await diagnostics.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 const {sessionId}=await diagnostics.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});await diagnostics.request('Page.enable',{},sessionId);
 await diagnostics.request('Page.addScriptToEvaluateOnNewDocument',{source:`(${installPngAudit.toString()})();`},sessionId);
 for(const name of ['S','M']){
  const item={name,status:'running',checks:[]};report.cases.push(item);
  const check=(pass,message)=>{item.checks.push({pass:!!pass,message});};
  try{
   const file='.tooling/fixtures/documents/'+name+'.json',source=await fs.readFile(file),doc=JSON.parse(source);doc.id='png-'+crypto.randomUUID();created.push(doc.id);
   item.fixture={file,sha256:sha(source),totalNodes:Object.keys(doc.nodes).length};await fs.writeFile(path.join(root,name+'-fixture.json'),JSON.stringify(doc,null,2));
   const visible=visibleModel(doc);item.expected={nodes:visible.length,edges:visible.length-1,...expectedContents(visible,info.assets)};
   await saveNew(session,doc);await session.native('load_document',{id:doc.id});await session.refresh();await session.resizeViewport(1440,844);
   await session.waitFor('return !!document.querySelector(".mind-node")&&!document.querySelector(".busy-overlay");',[],30000);
   await sleep(300);item.before=await session.execute('return {mounted:document.querySelectorAll(".mind-node").length,editors:document.querySelectorAll(".react-flow__viewport [contenteditable=true],.react-flow__viewport input").length};');
   const output=path.join(root,name+'.png'),started=performance.now();
   await session.execute('window.dispatchEvent(new CustomEvent("qingtu-export-png",{detail:arguments[0]}));',[output]);
   const deadline=Date.now()+90000;let stat;
   while(Date.now()<deadline){stat=await fs.stat(output).catch(()=>null);if(stat?.size>100)break;const error=await session.execute('return document.querySelector("[role=alert]")?.textContent;');if(error)throw Error(error);await sleep(250);}
   if(!stat)throw Error('No PNG output before deadline');await session.waitFor('return !document.querySelector(".busy-overlay");',[],10000);
   item.elapsedMs=performance.now()-started;
   const audit=await session.execute('return window.__pngAudit;');await fs.writeFile(path.join(root,name+'-audit.json'),JSON.stringify(audit,null,2));
   check(audit.calls.length===1,'Exactly one final raster canvas observed');const capture=audit.calls.at(-1);if(!capture)throw Error('No final canvas audit');
   const ids=visible.map(n=>n.id).sort(),actual=capture.nodes.map(n=>n.id).sort();check(JSON.stringify(ids)===JSON.stringify(actual),'Every visible model node mounted; folded descendants excluded');
   check(item.before.mounted<visible.length,'Fixture includes nodes outside the screen before export');
   check(capture.edges.length===item.expected.edges&&capture.edges.every(e=>e.d),'All expected connector paths exist');
   check(capture.nodes.every(n=>{const model=doc.nodes[n.id];return !['card','text'].includes(model.kind)||n.title===model.title;}),'Every text/card title matches the model');
   const images=capture.nodes.flatMap(n=>n.images);check(images.length===item.expected.images&&images.every(i=>i.complete&&i.width>0&&i.height>0),'Every expected image/poster is decoded');
   check(capture.nodes.reduce((n,x)=>n+x.formulas,0)===item.expected.formulas&&capture.formulaErrors===0,'Every expected formula rendered without error');
   check(capture.liveVideos===0&&capture.editors===0,'Read-only export has no active video or editor');
   check(capture.fontsReady==='loaded','Local fonts ready before rasterization');
   const svg=capture.svg;check(svg&&!svg.parseError,'Raster source SVG parses');
   check(svg?.nodes.length===visible.length&&svg.nodes.every(n=>ids.includes(n.id))&&svg.edges===item.expected.edges,'Cloned SVG retains all nodes and connector paths');
   check(svg?.images.length===item.expected.images&&svg.images.every(i=>i.embedded),'All raster source images embedded');
   check(svg?.formulas===item.expected.formulas&&svg.fontFaces>0,'Cloned SVG retains formulas and embedded fonts');
   const dimensions=outputDimensions(capture.nodes),bytes=await fs.readFile(output);item.dimensions={...dimensions,actualWidth:bytes.readUInt32BE(16),actualHeight:bytes.readUInt32BE(20)};
   check(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Output has a valid PNG signature');
   check(item.dimensions.actualWidth===dimensions.pixelWidth&&item.dimensions.actualHeight===dimensions.pixelHeight,'PNG dimensions match independently measured bounds and output scale');
   check(capture.width===item.dimensions.actualWidth&&capture.height===item.dimensions.actualHeight,'Saved PNG matches raster canvas dimensions');
   check(capture.pixels.dark>100,'Raster contains non-background content');item.pixels=capture.pixels;
   check(ipc.status==='passed','Saved PNG succeeds against the verified backend that rejects JSON byte arrays');
   item.notice=await session.execute('return document.querySelector(".notice-toast")?.textContent??"";');
   check(!dimensions.downscaled||/缩小|缩放|8192|降低|比例/.test(item.notice),'Large export explicitly reports reduced scale');
   const edges=capture.edges.map(e=>{const [source,target]=e.id.split(':');return {...e,source,target};});item.geometry=inspectGeometry(capture.nodes,edges);
   item.output={file:output,bytes:stat.size,sha256:sha(bytes)};item.status=item.checks.every(c=>c.pass)?'passed':'failed';
  }catch(error){item.status='failed';item.error=String(error);}
  console.log(JSON.stringify({name,status:item.status,checks:item.checks.length,failures:item.checks.filter(c=>!c.pass),error:item.error,dimensions:item.dimensions}));
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
 }
 report.status=report.cases.every(c=>c.status==='passed')?'passed':'failed';report.browserVersion=session.capabilities.browserVersion;
}catch(error){report.status='failed';report.error=String(error);}
finally{
 if(original&&session.id)await session.native('load_document',{id:original}).catch(()=>{});
 if(report.status==='passed')for(const id of created)await session.native('delete_document',{id}).catch(()=>{});
 diagnostics?.close();await session.close();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,root,error:report.error}));if(report.status!=='passed')process.exitCode=1;
}
