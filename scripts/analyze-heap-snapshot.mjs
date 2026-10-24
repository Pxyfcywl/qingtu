import fs from 'node:fs/promises';
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Usage: node scripts/analyze-heap-snapshot.mjs input.heapsnapshot output.json');
const heap=JSON.parse(await fs.readFile(input,'utf8')),meta=heap.snapshot.meta;
const nf=meta.node_fields,ef=meta.edge_fields,nw=nf.length,ew=ef.length;
const at=name=>{const i=nf.indexOf(name);if(i<0)throw Error('Missing heap node field '+name);return i;};
const et=name=>{const i=ef.indexOf(name);if(i<0)throw Error('Missing heap edge field '+name);return i;};
const nt=at('type'),nn=at('name'),ns=at('self_size'),ne=at('edge_count'),ni=at('id');
const type=et('type'),name=et('name_or_index'),to=et('to_node');
const ntypes=meta.node_types[nt],etypes=meta.edge_types[type],nodes=heap.nodes,edges=heap.edges,strings=heap.strings;
const count=nodes.length/nw,edgeCount=edges.length/ew,head=new Int32Array(count).fill(-1),next=new Int32Array(edgeCount),from=new Uint32Array(edgeCount),edgeStarts=new Uint32Array(count+1);
const groups=new Map(),large=[];let edgeIndex=0,totalSelfBytes=0;
function description(index){const base=index*nw;return {index,id:nodes[base+ni],type:ntypes[nodes[base+nt]],name:strings[nodes[base+nn]].slice(0,240),selfBytes:nodes[base+ns]};}
for(let i=0;i<count;i++){
 edgeStarts[i]=edgeIndex;
 const base=i*nw,kind=ntypes[nodes[base+nt]],label=strings[nodes[base+nn]],size=nodes[base+ns];totalSelfBytes+=size;
 // Aggregate literal strings separately; retaining the whole text as a map key
 // would hide the difference between source strings and ordinary object types.
 const key=kind==='string'||kind==='concatenated string'||kind==='sliced string'?kind:kind+':'+label;
 const group=groups.get(key)??{typeAndName:key,count:0,selfBytes:0};group.count++;group.selfBytes+=size;groups.set(key,group);
 if(size>=10000)large.push(i);
 const end=edgeIndex+nodes[base+ne];
 for(;edgeIndex<end;edgeIndex++){const o=edgeIndex*ew,target=edges[o+to]/nw;from[edgeIndex]=i;next[edgeIndex]=head[target];head[target]=edgeIndex;}
}
if(edgeIndex!==edgeCount)throw Error('Heap edge index mismatch');
edgeStarts[count]=edgeIndex;
function retainerPath(target){
 const queue=[target],visited=new Map([[target,null]]);let cursor=0,root=-1;
 while(cursor<queue.length&&visited.size<50000){
  const current=queue[cursor++];if(current===0){root=current;break;}
  for(let e=head[current];e>=0;e=next[e]){
   const kind=etypes[edges[e*ew+type]];if(kind==='weak')continue;
   const parent=from[e];if(visited.has(parent))continue;visited.set(parent,{child:current,edge:e});queue.push(parent);
  }
 }
 if(root<0)return {found:false,visited:visited.size};
 const path=[];let current=root;
 while(true){const link=visited.get(current),node=description(current);if(!link){path.push(node);break;}const o=link.edge*ew,kind=etypes[edges[o+type]],value=edges[o+name];path.push({...node,outgoingEdge:{type:kind,name:kind==='element'||kind==='hidden'?value:strings[value]}});current=link.child;}
 return {found:true,visited:visited.size,path};
}
const largest=large.sort((a,b)=>nodes[b*nw+ns]-nodes[a*nw+ns]).slice(0,12).map(i=>({...description(i),stringCharacters:strings[nodes[i*nw+nn]].length,retainer:retainerPath(i)}));
const modelMaps=[];
for(let i=0;i<count;i++){
 if(ntypes[nodes[i*nw+nt]]!=='object')continue;
 let matched=0,first=-1;
 for(let e=edgeStarts[i];e<edgeStarts[i+1];e++){const o=e*ew;if(etypes[edges[o+type]]==='property'&&/^[ML]-\d+$/.test(strings[edges[o+name]])){matched++;if(first<0)first=edges[o+to]/nw;}}
 if(matched<40)continue;
 let isModel=false;
 for(let e=edgeStarts[first];e<edgeStarts[first+1];e++){const o=e*ew;if(etypes[edges[o+type]]==='property'&&strings[edges[o+name]]==='kind'){isModel=true;break;}}
 if(isModel)modelMaps.push({...description(i),modelNodeProperties:matched});
}
const modelMapSamples=modelMaps.slice(0,10).map(n=>({...n,retainer:retainerPath(n.index)}));
const allGroups=[...groups.values()].sort((a,b)=>b.selfBytes-a.selfBytes);
const report={input,nodeCount:count,edgeCount,totalSelfBytes,allGroups,topGroups:allGroups.slice(0,35),largest,modelMaps:{count:modelMaps.length,samples:modelMapSamples},notes:['Snapshot instrumentation changes memory; this is a diagnostic, not an acceptance result.','Retainer paths exclude weak edges and stop after 50000 visited nodes.','Object ids are not compared across independently attached profiler sessions.','All group counts are retained so later comparisons do not treat a truncated top-list as zero.']};
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({input,nodeCount:count,totalSelfBytes,topGroups:report.topGroups.slice(0,8),largest:largest.slice(0,4).map(x=>({type:x.type,name:x.name,selfBytes:x.selfBytes,retainerFound:x.retainer.found}))},null,2));
