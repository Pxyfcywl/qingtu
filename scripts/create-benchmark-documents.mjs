import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const mediaRoot=path.resolve(process.env.QINGTU_BENCH_MEDIA??'.tooling/fixtures/media-target');
const media=JSON.parse(await fs.readFile(path.join(mediaRoot,'manifest.json'),'utf8'));
if(media.assets.length!==50||media.totalMiB<45||media.totalMiB>55)throw Error('Expected approximately 50 MiB of 40 distinct images and 10 videos');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const triangleHash=digest(await fs.readFile('public/demo/triangle.png'));
const images=media.assets.filter(a=>a.kind==='image'),videos=media.assets.filter(a=>a.kind==='video');
const root=path.resolve('.tooling/fixtures/documents');await fs.mkdir(root,{recursive:true});
const text=length=>'先观察已知条件再用公式建立数量关系记录推导步骤并通过例题检查结论'.repeat(Math.ceil(length/10)).slice(0,length);
const paragraph=length=>({type:'paragraph',content:[{type:'text',text:text(length)}]});
const specs=[{name:'S',total:40,visible:40,depth:5,counts:{text:25,card:10,image:4,video:1},formula:2,list:2,columns:2},{name:'M',total:500,visible:200,depth:8,counts:{text:350,card:100,image:40,video:10},formula:20,list:20,columns:20},{name:'L',total:2000,visible:500,depth:12,counts:{text:1750,card:200,image:40,video:10},formula:60,list:40,columns:40}];
const manifest={createdAt:new Date().toISOString(),seed:20261015,mediaRoot,mediaManifestSha256:digest(await fs.readFile(path.join(mediaRoot,'manifest.json'))),documents:[]};
for(const spec of specs){
 const kinds=Object.entries(spec.counts).flatMap(([kind,count])=>Array(count).fill(kind));let seed=20261015;
 for(let i=kinds.length-1;i>1;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=1+seed%i;[kinds[i],kinds[j]]=[kinds[j],kinds[i]];}
 const swapText=index=>{if(kinds[index]!=='text'){const other=kinds.findIndex((kind,i)=>i!==0&&i!==index&&kind==='text');[kinds[index],kinds[other]]=[kinds[other],kinds[index]];}};
 swapText(0);const folded=spec.visible<spec.total?spec.visible-1:-1;if(folded>0)swapText(folded);
 const doc={id:`benchmark-${spec.name.toLowerCase()}-v1`,schemaVersion:1,title:`${spec.name} 固定验收样本`,rootId:`${spec.name}-0`,revision:0,layoutMode:'auto',viewport:{x:600,y:400,zoom:.7},updatedAt:0,nodes:{}};
 const lengths=Array(spec.total-1).fill(Math.floor((spec.total*12-80)/(spec.total-1)));for(let i=0;i<(spec.total*12-80)%(spec.total-1);i++)lengths[i]++;lengths.push(80);
 let cardIndex=0,imageIndex=0,videoIndex=0;
 for(let i=0;i<spec.total;i++){
  const kind=kinds[i],id=`${spec.name}-${i}`;
  let body={type:'doc',content:[{type:'paragraph'}]};let assetId;
  if(kind==='card'){
   const ordinal=cardIndex++;
   if(ordinal<spec.formula){const latex='a^2+b^2=c^2';body={type:'doc',content:[{type:'mathBlock',attrs:{latex}},paragraph(400-latex.length)]};}
   else if(ordinal<spec.formula+spec.list)body={type:'doc',content:[{type:'bulletList',content:Array.from({length:4},()=>({type:'listItem',content:[paragraph(100)]}))}]};
   else if(ordinal<spec.formula+spec.list+spec.columns)body={type:'doc',content:[{type:'columns',attrs:{ratio:ordinal%2?'1:1':'3:2'},content:[{type:'column',content:[paragraph(200)]},{type:'column',content:[paragraph(200)]}]}]};
   else body={type:'doc',content:[paragraph(400)]};
   if(spec.name==='S'&&ordinal===0)body={type:'doc',content:[{type:'columns',attrs:{ratio:'3:2'},content:[{type:'column',content:[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}},paragraph(400-'a^2+b^2=c^2'.length)]},{type:'column',content:[{type:'assetImage',attrs:{assetId:triangleHash,alt:'勾股定理示意图'}}]}]}]};
  }
  if(kind==='image'){const choices=spec.name==='S'?[{sha256:triangleHash},...images.slice(0,3)]:images;assetId=choices[imageIndex++].sha256;}
  if(kind==='video')assetId=videos[videoIndex++].sha256;
  let parent=0;
  if(i>=spec.visible)parent=i===spec.visible?folded:spec.visible+Math.floor((i-spec.visible-1)/4);
  else if(i>6&&i!==folded)parent=1+Math.floor((i-7)/4);
  doc.nodes[id]={id,kind,parentId:i?`${spec.name}-${parent}`:null,childIds:[],title:text(lengths[i]),body,side:'right',color:['teal','blue','orange','rose','purple'][i%5],position:{x:0,y:0},contentCollapsed:false,childrenCollapsed:i===folded,...(assetId?{assetId}:{}),...(kind==='card'?{preferredWidth:432}:{})};
 }
 for(const node of Object.values(doc.nodes))if(node.parentId)doc.nodes[node.parentId].childIds.push(node.id);
 const chainStart=spec.visible-spec.depth+1;
 for(let i=chainStart;i<spec.visible-1;i++){const node=doc.nodes[`${spec.name}-${i}`];const previous=doc.nodes[node.parentId];previous.childIds=previous.childIds.filter(id=>id!==node.id);node.parentId=`${spec.name}-${i===chainStart?1:i-1}`;doc.nodes[node.parentId].childIds.push(node.id);}
 const rootNode=doc.nodes[doc.rootId];rootNode.childIds.forEach((id,index)=>{doc.nodes[id].side=index%2?'left':'right';});
 const seen=new Set(),visible=[];let depth=0;const stack=[[doc.rootId,1,true]];
 while(stack.length){const [id,d,isVisible]=stack.pop();if(seen.has(id))throw Error('Fixture cycle');seen.add(id);depth=Math.max(depth,d);const node=doc.nodes[id];if(isVisible)visible.push(id);for(const child of node.childIds)stack.push([child,d+1,isVisible&&!node.childrenCollapsed]);}
 if(seen.size!==spec.total||visible.length!==spec.visible||depth!==spec.depth)throw Error(JSON.stringify({name:spec.name,count:seen.size,visible:visible.length,depth}));
 const bytes=Buffer.from(JSON.stringify(doc));await fs.writeFile(path.join(root,spec.name+'.json'),bytes);
 const all=structuredClone(doc);all.id+='-expanded';all.title+=' 全展开';Object.values(all.nodes).forEach(n=>n.childrenCollapsed=false);await fs.writeFile(path.join(root,spec.name+'-expanded.json'),JSON.stringify(all));
 manifest.documents.push({...spec,sha256:digest(bytes),visibleNodeIds:visible,titleMean:12,titleMaximum:80,cardCharacters:400,mediaMiB:spec.name==='S'?null:media.totalMiB});
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));console.log(manifest.documents.map(({name,total,visible,depth,mediaMiB})=>({name,total,visible,depth,mediaMiB})));
