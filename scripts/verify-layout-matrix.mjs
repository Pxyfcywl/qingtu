import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectGeometry} from './lib/geometry-oracle.mjs';
const files=process.argv.slice(2);if(!files.length)throw Error('Pass actual layout-matrix report files');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const summary={status:'running',fullT06GatePassed:false,reports:[],samples:[],cases:0};let expectedExe,harness;
for(const file of files){
 const report=await read(file);if(report.status!=='passed'||report.repetitions!==20)throw Error('Incomplete workload report: '+file);
 expectedExe??=report.exeSha256;harness??=JSON.stringify(report.harnessFiles);
 if(report.exeSha256!==expectedExe||JSON.stringify(report.harnessFiles)!==harness)throw Error('Do not combine different executables or harness revisions');
 for(const sample of report.results){
  if(summary.samples.includes(sample.sample)||sample.status!=='passed'||sample.cases.length!==120)throw Error('Missing or duplicate complete sample');
  for(const kind of ['add','delete','fold','width','side','image']){
   const cases=sample.cases.filter(c=>c.kind===kind);if(cases.length!==20||new Set(cases.map(c=>c.run)).size!==20||cases.some(c=>c.run<1||c.run>20))throw Error('Each workload must have runs 1..20');
   for(const item of cases){
    if(item.status!=='passed'||item.anchorDrift>2||kind==='image'&&item.imageLoads<1)throw Error('Failed operation/anchor/image requirement');
    const capture=await read(path.join(path.dirname(file),item.capture));
    if(!capture.complete||!capture.observations.length||capture.observations.some(o=>o.layoutSha256!==capture.layoutSha256))throw Error('Mixed or incomplete global layouts');
    const model=capture.model,visible=[];const visit=id=>{const n=model.nodes[id];if(!n)throw Error('Missing model node');visible.push(id);if(!n.childrenCollapsed)n.childIds.forEach(visit);};visit(model.rootId);
    const actual=capture.nodes.map(n=>n.id);if(JSON.stringify(actual.sort())!==JSON.stringify(visible.sort()))throw Error('DOM node set differs from model visibility');
    const expectedEdges=visible.filter(id=>model.nodes[id].parentId).map(id=>model.nodes[id].parentId+':'+id).sort();
    if(JSON.stringify(capture.edges.map(e=>e.id).sort())!==JSON.stringify(expectedEdges))throw Error('SVG edge set differs from model structure');
    for(const edge of capture.edges)if(edge.source!==model.nodes[edge.target].parentId)throw Error('Edge endpoint mismatch');
    const measured=inspectGeometry(capture.nodes,capture.edges);if(!measured.passed)throw Error('Independent geometry failure');summary.cases++;
   }
  }
  summary.samples.push(sample.sample);
 }
 summary.reports.push(file);
}
summary.status='passed';summary.exeSha256=expectedExe;summary.fullT06GatePassed=summary.samples.length===3&&['S','M','L'].every(s=>summary.samples.includes(s))&&summary.cases===360;
console.log(JSON.stringify(summary,null,2));
