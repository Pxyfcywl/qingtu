import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {isDeepStrictEqual} from 'node:util';
import {hashBytes} from './lib/content-fixture.mjs';
const compiled=await build({entryPoints:['src/domain/tree.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const tree=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const base=JSON.parse(await fs.readFile('validation/fixtures/0.1.1/documents/L.json','utf8'));
const root=path.resolve('validation/fixtures/0.1.2/boundaries');await fs.mkdir(root,{recursive:true});
const doc=structuredClone(base);doc.id='boundary-x5000-v1';doc.title='X 5000 节点边界';doc.revision=0;doc.updatedAt=0;doc.nodes[doc.rootId].childrenCollapsed=true;
for(let i=2000;i<5000;i++){
 const id='X-leaf-'+i;doc.nodes[id]={id,kind:'text',parentId:doc.rootId,childIds:[],title:'边界节点 '+i,body:{type:'doc',content:[{type:'paragraph'}]},side:i%2?'left':'right',color:'teal',position:{x:400,y:(i-2000)*60},contentCollapsed:false,childrenCollapsed:false};doc.nodes[doc.rootId].childIds.push(id);
}
const report={status:'running',scope:'Frontend domain limit checks only; X reuses frozen L mixed media plus 3000 text nodes, not a substitute for native/performance acceptance',checks:[],fixtures:[],sourceSha256:hashBytes(await fs.readFile('src/domain/tree.ts')),baseSha256:hashBytes(await fs.readFile('validation/fixtures/0.1.1/documents/L.json'))};
async function frozen(name,value){
 const bytes=Buffer.from(JSON.stringify(value)),file=path.join(root,name+'.json');
 try{await fs.writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||!bytes.equals(await fs.readFile(file)))throw error;}
 report.fixtures.push({name,file:path.relative(process.cwd(),file).replaceAll('\\','/'),bytes:bytes.length,sha256:hashBytes(bytes)});
}
const assert=(value,message)=>{if(!value)throw Error(message);};
function rejected(label,fn,pattern){let error;try{fn();}catch(e){error=String(e);}assert(error&&pattern.test(error),'Wrong/missing rejection: '+label);report.checks.push({label,status:'passed',error});}
try{
 tree.validateDocument(doc);assert(Object.keys(doc.nodes).length===5000,'Wrong fixture count');assert(tree.descendants(doc,doc.rootId).length===4999,'Descendant traversal lost nodes');
 report.checks.push({label:'Mixed 5000-node tree validates; all 4999 descendants traversed',status:'passed'});await frozen('X-5000',doc);
 const before=structuredClone(doc);rejected('5001st add is refused',()=>tree.addChild(doc,doc.rootId,'text'),/5000/);assert(isDeepStrictEqual(doc,before),'Rejected add changed document');
 rejected('Root deletion refused at capacity',()=>tree.removeNode(doc,doc.rootId),/根节点/);assert(isDeepStrictEqual(doc,before),'Root deletion changed document');
 const parent=Object.values(doc.nodes).find(n=>n.parentId&&n.childIds.length);rejected('Cycle-producing reparent refused at capacity',()=>tree.reparent(doc,parent.id,parent.childIds[0]),/后代/);assert(isDeepStrictEqual(doc,before),'Rejected reparent changed document');
 const last=structuredClone(doc);tree.removeNode(last,'X-leaf-4999');const added=tree.addChild(last,last.rootId,'text');assert(last.nodes[added]&&Object.keys(last.nodes).length===5000,'4999 -> 5000 failed');tree.validateDocument(last);report.checks.push({label:'Last admissible child can be added at 4999 nodes',status:'passed'});
 const excessive=structuredClone(doc),extra={...structuredClone(doc.nodes['X-leaf-4999']),id:'X-leaf-5000'};excessive.nodes[extra.id]=extra;excessive.nodes[excessive.rootId].childIds.push(extra.id);excessive.id='boundary-x5001-v1';excessive.title='X 5001 节点应拒绝';
 rejected('Loaded 5001-node document refused',()=>tree.validateDocument(excessive),/5000/);await frozen('X-5001-invalid',excessive);
 for(const depth of [100,101]){
  const chain=structuredClone(doc);chain.id='boundary-depth-'+depth;chain.title='深度边界 '+depth;chain.rootId='depth-0';chain.nodes={};
  for(let i=0;i<depth;i++){const id='depth-'+i;chain.nodes[id]={...structuredClone(doc.nodes['X-leaf-4999']),id,parentId:i?'depth-'+(i-1):null,childIds:i<depth-1?['depth-'+(i+1)]:[],title:'层级 '+i};}
  if(depth===100){tree.validateDocument(chain);report.checks.push({label:'Depth 100 validates',status:'passed'});}else rejected('Depth 101 refused',()=>tree.validateDocument(chain),/100/);
  await frozen('depth-'+depth+(depth===101?'-invalid':''),chain);
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(root,'domain-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
