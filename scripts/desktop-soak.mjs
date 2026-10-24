import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {createSampler} from './lib/sampler.mjs';
import {mediaDocument,verifyMediaLifecycle} from './lib/media-lifecycle.mjs';
import {verifyMediaNavigationOnly} from './lib/media-navigation-control.mjs';
import {verifyMediaStateOnly} from './lib/media-state-control.mjs';
import {saveNew,exerciseDocument,verifyCanceledExport} from './lib/soak-actions.mjs';
const probe=process.argv.includes('--probe');
const skipMedia=process.argv.includes('--probe-skip-media');
if(skipMedia&&!probe)throw Error('Skipping media is restricted to diagnostic probes; formal T21 is unchanged');
const mediaNavigationOnly=process.argv.includes('--probe-media-navigation-only');
if(mediaNavigationOnly&&!probe)throw Error('Media navigation control is restricted to diagnostic probes; formal T21 is unchanged');
if(skipMedia&&mediaNavigationOnly)throw Error('Choose one media control');
const mediaStateOnly=process.argv.includes('--probe-media-state-only');
if(mediaStateOnly&&!probe)throw Error('Media state control is restricted to diagnostic probes; formal T21 is unchanged');
if(mediaStateOnly&&(skipMedia||mediaNavigationOnly))throw Error('Choose one media control');
const collectAll=process.argv.includes('--collect-all');
const verifyInHarness=process.argv.includes('--verify-via-readonly-db');
const captureHeaps=process.argv.includes('--heap-snapshots');
if(captureHeaps&&!probe&&!process.argv.includes('--smoke'))throw Error('Heap snapshots are restricted to diagnostic probes');
const discardConsole=process.argv.includes('--discard-driver-console');
if(discardConsole&&!probe&&!process.argv.includes('--smoke'))throw Error('Console retention control is restricted to diagnostic probes until validated');
const cdpExecution=process.argv.includes('--cdp-execution');
const transportValidationIndex=process.argv.indexOf('--transport-validation');
if(cdpExecution&&!probe&&!process.argv.includes('--smoke')&&(transportValidationIndex<0||!process.argv[transportValidationIndex+1]||process.argv[transportValidationIndex+1].startsWith('--')))throw Error('Formal CDP transport requires an executable-bound equivalence validation report');
const probeCyclesIndex=process.argv.indexOf('--probe-cycles'),probeCycles=probeCyclesIndex<0?3:Number(process.argv[probeCyclesIndex+1]);
const probeRealCadence=process.argv.includes('--probe-real-cadence');
if((probeCyclesIndex>=0||probeRealCadence)&&!probe)throw Error('Probe cycle controls cannot change formal T21');
if(!Number.isInteger(probeCycles)||probeCycles<3||probeCycles>30)throw Error('Probe cycles must be an integer between 3 and 30');
const smoke=process.argv.includes('--smoke')||probe,roundCount=smoke?1:3,cycles=probe?probeCycles:smoke?1:30;
const timedCadence=!smoke||probeRealCadence;
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 长期验证/qingtu.exe');
const appVariant=process.env.QINGTU_APP_VARIANT??'diagnostic';if(!['diagnostic','production'].includes(appVariant))throw Error('Choose diagnostic or production app variant');
const styleProbe=process.env.QINGTU_PROBE_STYLE==='box-shadow';
if(styleProbe&&!smoke)throw Error('Runtime style overrides are restricted to harness probes');
const root=path.resolve('.tooling/soak-tests',(smoke?(probe?'probe':'smoke')+(styleProbe?'-box-shadow':'')+(skipMedia?'-no-media':'')+(mediaNavigationOnly?'-media-navigation':'')+(mediaStateOnly?'-media-state':''):'formal')+'-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const preparation=JSON.parse(await fs.readFile('.tooling/soak-tests/preparation.json','utf8'));
if(preparation.status!=='passed')throw Error('Fixed sample preparation has not passed');
const report={status:'running',mode:smoke?(probe?`harness-${cycles}-cycle-probe-not-T21`:'harness-smoke-not-T21'):'T21-30min-x3',minuteCadence:timedCadence,runtimeStyleOverride:styleProbe?'replace node filter with box-shadow':null,started:new Date().toISOString(),app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),appVariant,diagnosticDifferences:appVariant==='diagnostic'?['application identifier','product name','no .qmap registration']:[],preparation,rounds:[]};
report.runtimeMediaOverride=skipMedia?'Diagnostic control omits media-document visits, playback lifecycle AND AudioContext/analyser instrumentation; cannot attribute any difference to production playback alone':mediaNavigationOnly?'Diagnostic control retains media-document visits and folds, omits playback and AudioContext/analyser instrumentation':null;
if(mediaStateOnly)report.runtimeMediaOverride='Diagnostic control retains actual decode/playback, navigation and source-release checks; no AudioContext/analyser/RMS assertions; each test video volume=0.02';
if(cdpExecution&&!smoke){
 const file=path.resolve(process.argv[transportValidationIndex+1]),bytes=await fs.readFile(file),validation=JSON.parse(bytes);
 const helperSha=crypto.createHash('sha256').update(await fs.readFile('scripts/lib/cdp-execution.mjs')).digest('hex');
 if(validation.status!=='passed'||validation.exeSha256!==report.exeSha256||validation.transportSha256!==helperSha)throw Error('Transport validation must match this exact installed executable and helper');
 report.transportValidation={file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),checks:validation.checks,transportSha256:helperSha};
}
report.resourceFailurePolicy=collectAll?'record failure and finish observation; never convert failure to pass':'stop on first failed gate';
report.documentVerificationMethod=verifyInHarness?'readonly test database snapshot in external harness':'extra full load_document IPC';
report.heapSnapshotDiagnostic=captureHeaps;
report.consoleCachePolicy=discardConsole?'discard console history after retaining errors in external harness':'unchanged';
report.scriptTransport=cdpExecution?'CDP by value; same script/command assertions':'WebDriver script result envelopes';
report.harnessFiles=[];for(const file of ['scripts/desktop-soak.mjs','scripts/lib/soak-actions.mjs','scripts/lib/media-lifecycle.mjs','scripts/lib/media-navigation-control.mjs','scripts/lib/media-state-control.mjs','scripts/lib/cdp.mjs','scripts/lib/runtime-observer.mjs','scripts/lib/cdp-execution.mjs','scripts/lib/native.mjs','scripts/lib/sampler.mjs','scripts/process-sampler.ps1']){const bytes=await fs.readFile(file);report.harnessFiles.push({file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});const saved=path.join(root,'harness',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,bytes);}
const checkpoint=()=>fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
const p95=values=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const progress=message=>console.log(new Date().toISOString()+' '+message);
let session,diagnostics,sampler,runtimeMonitor,executionTransport;
try{
 for(let round=1;round<=roundCount;round++){
  session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');await session.open(app);await session.resizeViewport(1440,844);
  let readSaved;
  if(verifyInHarness){const {readTestDocument}=await import('./lib/read-test-document.mjs');const info=await session.native('bootstrap');readSaved=id=>readTestDocument(info.storagePath,id);}
  diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);
  const origin=await session.execute('return location.origin;');
  const target=(await diagnostics.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
  const attached=await diagnostics.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  session.click=async selector=>{
   const position=await session.execute('const e=document.querySelector(arguments[0]);if(!e)throw Error("Missing clickable element");const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};',[selector]);
   await diagnostics.request('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...position},attached.sessionId);
   await diagnostics.request('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...position},attached.sessionId);
  };
  if(cdpExecution){const {useCdpExecution}=await import('./lib/cdp-execution.mjs');executionTransport=await useCdpExecution(session,diagnostics,attached.sessionId);}
  sampler=await createSampler(app);const suffix=crypto.randomUUID().slice(-6),ids=[],docs={};
  const item={round,status:'running',cycles:[],started:new Date().toISOString()};report.rounds.push(item);
  if(discardConsole||cdpExecution){const {observeRuntime}=await import('./lib/runtime-observer.mjs');runtimeMonitor=await observeRuntime(diagnostics,attached.sessionId);item.runtimeErrors=runtimeMonitor.errors;item.consoleActivity=runtimeMonitor.consoleActivity;}
  for(const name of ['M','L']){const doc=JSON.parse(await fs.readFile('.tooling/fixtures/documents/'+name+'.json','utf8'));doc.id='soak-'+crypto.randomUUID();doc.title=`稳定检查 ${round}-${name}-${suffix}`;await saveNew(session,doc);docs[name]=doc;ids.push(doc.id);}
  const audio=mediaDocument(preparation.audio.id,'soak-'+crypto.randomUUID(),'音频检查 A '+suffix),copy=structuredClone(audio);copy.id='soak-'+crypto.randomUUID();copy.title='音频检查 B '+suffix;
  for(const doc of [audio,copy]){await saveNew(session,doc);ids.push(doc.id);}
  await session.native('load_document',{id:docs.M.id});await session.refresh();
  if(styleProbe)await session.execute('const style=document.createElement("style");style.textContent=".mind-node{filter:none!important;box-shadow:0 3px 5px #3a57680a!important}";document.head.append(style);');
  await sleep(10000);
  item.environment={capabilities:session.capabilities,browser:await diagnostics.request('Browser.getVersion'),viewport:await session.execute('return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};'),frontendScripts:await session.execute('return Array.from(document.querySelectorAll("script[src]")).map(s=>s.src);')};
  if(discardConsole)await diagnostics.request('Runtime.discardConsoleEntries',{},attached.sessionId);
  item.heapStart=await diagnostics.heaps(origin);item.initialMemory=await sampler.sample();
  if(captureHeaps){const {capturePageHeap}=await import('./lib/heap-snapshot.mjs');item.snapshotStart=await capturePageHeap(diagnostics,origin,path.join(root,`heap-${round}-start.heapsnapshot`));}
  const started=Date.now();await checkpoint();progress(`round ${round} baseline; ${cycles} minute cycle(s)`);
  for(let index=0;index<cycles;index++){
   const cycleStart=Date.now(),name=index%2===0?'M':'L',cycle={index:index+1,sample:name,started:new Date().toISOString(),audio:[]};
   if(index&&cycleStart-started>index*60000+15000&&timedCadence)throw Error('Minute schedule interrupted or fell behind by more than 15 seconds');
   if(skipMedia)cycle.mediaControl='Playback and audio instrumentation omitted for causal control';
   else{await session.selectDocument(audio.id,audio.title);if(mediaNavigationOnly)await verifyMediaNavigationOnly(session,copy,cycle.audio);else if(mediaStateOnly)await verifyMediaStateOnly(session,copy,cycle.audio);else await verifyMediaLifecycle(session,copy,cycle.audio);}
   cycle.canceledExport=await verifyCanceledExport(session,path.join(root,`canceled-${round}-${index}.png`));
   cycle.document=await exerciseDocument(session,docs[name],readSaved);
   if(discardConsole)await diagnostics.request('Runtime.discardConsoleEntries',{},attached.sessionId);
   await sleep(10000);
   const samples=[],samplingStart=performance.now();for(let n=0;n<32;n++){const delay=samplingStart+n*1000-performance.now();if(delay>0)await sleep(delay);samples.push(await sampler.sample());}
   await fs.appendFile(path.join(root,'samples.ndjson'),JSON.stringify({round,cycle:index+1,sample:name,samples})+'\n');
   const first=samples[0],last=samples.at(-1),span=last.monotonic-first.monotonic;
   cycle.memoryP95MiB=p95(samples.map(s=>s.privateBytes/1048576));cycle.idleCpuPercent=(last.cpuSeconds-first.cpuSeconds)/span/last.logicalCores*100;cycle.sampleSpanSeconds=span;
   cycle.dom=await session.execute('return {nodes:document.querySelectorAll(".mind-node").length,videoSources:document.querySelectorAll(".asset-video[src]").length,visibility:document.visibilityState,focused:document.hasFocus(),error:document.querySelector("[role=alert]")?.textContent??null};');
   cycle.elapsedMs=Date.now()-cycleStart;cycle.pass=cycle.memoryP95MiB<=(name==='M'?450:700)&&cycle.idleCpuPercent<=1&&cycle.dom.videoSources===0&&!cycle.dom.error&&(!runtimeMonitor||runtimeMonitor.errors.length===0);
   if(name==='L'&&!item.heapL){if(discardConsole)await diagnostics.request('Runtime.discardConsoleEntries',{},attached.sessionId);item.heapL=await diagnostics.heaps(origin);if(item.heapL.usedBytes>250*1048576)cycle.pass=false;}
   item.cycles.push(cycle);await checkpoint();progress(`round ${round} cycle ${index+1}/${cycles} ${name}: private P95=${cycle.memoryP95MiB.toFixed(1)} MiB idle CPU=${cycle.idleCpuPercent.toFixed(3)}% ${cycle.pass?'PASS':'FAIL'}`);
   if(cycle.dom.videoSources!==0||cycle.dom.error||runtimeMonitor?.errors.length)throw Error('Unexpected live source, application error or runtime exception');
   if(!cycle.pass&&!collectAll)throw Error('Long-run resource or runtime gate failed');
   if(timedCadence){const remaining=started+(index+1)*60000-Date.now();if(remaining>0)await sleep(remaining);}
  }
  item.exerciseDurationMs=Date.now()-started;
  await session.selectDocument(docs.M.id,docs.M.title);await sleep(10000);if(discardConsole)await diagnostics.request('Runtime.discardConsoleEntries',{},attached.sessionId);item.heapEnd=await diagnostics.heaps(origin);
  item.heapGrowthMiB=(item.heapEnd.usedBytes-item.heapStart.usedBytes)/1048576;
  if(captureHeaps){const {capturePageHeap}=await import('./lib/heap-snapshot.mjs');item.snapshotEnd=await capturePageHeap(diagnostics,origin,path.join(root,`heap-${round}-end.heapsnapshot`));}
  item.status=item.heapGrowthMiB<=20&&item.heapEnd.usedBytes<=150*1048576&&item.cycles.every(cycle=>cycle.pass)?'passed':'failed';item.finished=new Date().toISOString();await checkpoint();
  if(item.status!=='passed'&&!collectAll)throw Error('Long-run resource or retained heap gate failed');
  await session.native('load_document',{id:'benchmark-m-v1'});await session.refresh();await sleep(500);
  if(item.status==='passed')for(const id of ids)await session.native('delete_document',{id});else item.retainedTestDocuments=ids;
  await sampler.close();sampler=null;runtimeMonitor?.stop();runtimeMonitor=null;await executionTransport?.restore();executionTransport=null;diagnostics.close();diagnostics=null;await session.close();session=null;
  progress(`round ${round} ${item.status}; retained growth=${item.heapGrowthMiB.toFixed(3)} MiB`);
 }
 report.status=report.rounds.every(round=>round.status==='passed')?'passed':'failed';if(report.status==='failed')process.exitCode=1;
}catch(error){report.status='failed';report.error=String(error);if(report.rounds.at(-1)?.status==='running'){report.rounds.at(-1).status='failed';report.rounds.at(-1).error=String(error);}console.error(error);process.exitCode=1;}
finally{if(sampler)await sampler.close().catch(e=>console.error(e));runtimeMonitor?.stop();await executionTransport?.restore().catch(()=>{});diagnostics?.close();await session?.close();report.finished=new Date().toISOString();await checkpoint();progress(report.mode+' '+report.status+' '+root);}
