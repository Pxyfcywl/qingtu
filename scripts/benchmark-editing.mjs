import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2];
if(mode==='before'||mode==='after'){
 const state=await import('../.tooling/editing-'+mode+'.mjs'),rows=[];
 for(const name of ['S','M','L']){
  const doc=JSON.parse(await fs.readFile(`validation/fixtures/0.1.1/documents/${name}.json`,'utf8'));
  await state.activateDocument(doc);for(let n=0;n<10;n++)state.editDocument(d=>{d.nodes[d.rootId].childrenCollapsed=!d.nodes[d.rootId].childrenCollapsed;},{history:false});await state.flushSave();
  await state.activateDocument(doc);global.gc();const base=process.memoryUsage().heapUsed;let peak=base;const times=[];
  for(let n=0;n<100;n++){const start=performance.now();state.editDocument(d=>{d.nodes[d.rootId].childrenCollapsed=!d.nodes[d.rootId].childrenCollapsed;});times.push(performance.now()-start);peak=Math.max(peak,process.memoryUsage().heapUsed);}
  if(state.getState().error)throw Error(state.getState().error);
  if(JSON.stringify(state.getState().doc.nodes)!==JSON.stringify(doc.nodes))throw Error('Command result mismatch');
  await state.flushSave();global.gc();const retained=process.memoryUsage().heapUsed-base;times.sort((a,b)=>a-b);
  rows.push({sample:name,totalNodes:Object.keys(doc.nodes).length,commands:100,medianMs:times[49],p95Ms:times[94],maxMs:times.at(-1),peakHeapDeltaMiB:(peak-base)/1048576,retainedHeapDeltaMiB:retained/1048576});
 }
 console.log(JSON.stringify(rows));
}else{
 const {build}=await import('esbuild'),oldEntry=path.resolve('.tooling/state-before-cow.ts');
 for(const kind of ['before','after'])await build({entryPoints:[kind==='before'?oldEntry:'src/state.ts'],bundle:true,platform:'node',format:'esm',external:['react'],outfile:`.tooling/editing-${kind}.mjs`,plugins:[{name:'isolated-storage',setup(builder){
  builder.onResolve({filter:/^\.\/bridge$/},()=>({path:'bridge',namespace:'benchmark'}));
  builder.onLoad({filter:/.*/,namespace:'benchmark'},()=>({contents:'export async function call(command,args){return {revision:(args?.patch?.baseRevision??0)+1};}export async function libraryInfo(){return null;}'}));
  builder.onResolve({filter:/^\.\//},args=>args.importer===oldEntry?{path:path.resolve('src',args.path)+'.ts'}:undefined);
 }}]});
 const report={method:'Isolated Node processes; warmup 10 commands, 100 fold commands retaining undo; GC only at baseline/end. Not a WebView2 performance or Private Bytes measurement.',node:process.version,createdAt:new Date().toISOString()};
 for(const kind of ['before','after'])report[kind]=JSON.parse(execFileSync(process.execPath,['--expose-gc',path.resolve('scripts/benchmark-editing.mjs'),kind],{encoding:'utf8',timeout:30000}));
 await fs.writeFile('.tooling/soak-tests/editing-copy-on-write.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
