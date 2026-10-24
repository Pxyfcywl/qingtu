import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const files=process.argv.slice(2);if(files.length<2)throw Error('Pass completed baseline/control report files');
const output=path.resolve('.tooling/media-controls',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={status:'running',formalT21Passed:false,scope:'Descriptive same-executable diagnostic comparisons, not replicated causal proof or formal T21. No playback controls also omit audio instrumentation; state-only uses volume .02 and omits RMS.',groups:[],fixtures:[]};let exe,preparation,measurement;
for(const name of ['M','L']){
 const file='.tooling/fixtures/documents/'+name+'.json',bytes=await fs.readFile(file),frozen=await fs.readFile('validation/fixtures/0.1.1/documents/'+name+'.json');
 report.fixtures.push({file,sha256:sha(bytes),matchesFrozenVersion011:bytes.equals(frozen)});if(!bytes.equals(frozen))throw Error('Fixed fixture changed since freeze');
}
for(const file of files){
 const bytes=await fs.readFile(file),r=JSON.parse(bytes),round=r.rounds[0];if(!r.finished||!['passed','failed'].includes(r.status)||r.mode!=='harness-5-cycle-probe-not-T21'||!r.minuteCadence||r.runtimeStyleOverride!==null||r.appVariant!=='production')throw Error('Not a completed production five-cycle probe: '+file);
 if(round.cycles.length!==5||round.cycles.map(c=>c.sample).join(',')!=='M,L,M,L,M')throw Error('Workload cadence mismatch');
 if(round.cycles.some(c=>c.sampleSpanSeconds<30||c.dom.visibility!=='visible'||!c.dom.focused))throw Error('Unmatched observation conditions');
 const method=r.harnessFiles.filter(f=>['scripts/lib/native.mjs','scripts/lib/cdp-execution.mjs','scripts/lib/sampler.mjs','scripts/process-sampler.ps1'].includes(f.file));
 exe??=r.exeSha256;preparation??=sha(Buffer.from(JSON.stringify(r.preparation)));measurement??=JSON.stringify(method);
 if(r.exeSha256!==exe||sha(Buffer.from(JSON.stringify(r.preparation)))!==preparation||JSON.stringify(method)!==measurement)throw Error('Executable/preparation/measurement mismatch');
 const samples=(await fs.readFile(path.join(path.dirname(file),'samples.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);
 const cycles=round.cycles.map(c=>{
  const points=samples.find(s=>s.round===1&&s.cycle===c.index).samples,point=points.toSorted((a,b)=>a.privateBytes-b.privateBytes)[Math.ceil(points.length*.95)-1];
  if(Math.abs(point.privateBytes/1048576-c.memoryP95MiB)>1e-9)throw Error('Cannot reconstruct P95');
  const byRole={};for(const p of point.processes)byRole[p.role]=(byRole[p.role]??0)+p.privateBytes/1048576;
  return {cycle:c.index,sample:c.sample,totalP95MiB:c.memoryP95MiB,byRoleAtTotalP95MiB:byRole,idleCpuPercent:c.idleCpuPercent,pass:c.pass};
 });
 const label=path.basename(path.dirname(file)).includes('no-media')?'no-media':path.basename(path.dirname(file)).includes('media-navigation')?'navigation-only':path.basename(path.dirname(file)).includes('media-state')?'direct-video-no-analyser':'full-video-RMS';
 report.groups.push({label,file,reportSha256:sha(bytes),status:r.status,override:r.runtimeMediaOverride??null,heapGrowthMiB:round.heapGrowthMiB,cycles});
}
report.status='passed';report.exeSha256=exe;report.preparationSha256=preparation;
await fs.writeFile(path.join(output,'comparison.json'),JSON.stringify(report,null,2)+'\n');
const rows=['# 同程序媒体诊断对照','','所有组为相同普通安装程序、同一固定 M/L 和五轮真实分钟节拍。不是正式 T21；控制差异见各原报告，不能由单次对照归因于某一组件。','','| 组别 | M1 | L2 | M3 | L4 | M5 | 回收后堆增长 |','| --- | --- | --- | --- | --- | --- | --- |'];
for(const g of report.groups)rows.push('| '+g.label+' | '+g.cycles.map(c=>c.totalP95MiB.toFixed(2)+' MiB').join(' | ')+' | '+g.heapGrowthMiB.toFixed(3)+' MiB |');
rows.push('','完整视频/RMS 基线及直接播放无分析器均可能失败，旧失败保留。每组报告和所有 P95 原始样本已独立重算，具体进程分解见 comparison.json。');await fs.writeFile(path.join(output,'comparison.md'),rows.join('\n')+'\n');console.log(JSON.stringify({status:report.status,exe,groups:report.groups.map(g=>g.label),output}));
