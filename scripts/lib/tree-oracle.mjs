export function inspectTree(doc){
 const entries=Object.entries(doc.nodes),ids=new Set(entries.map(([id])=>id));
 if(!ids.size||ids.size>5000||!ids.has(doc.rootId))throw Error('Invalid node count/root');
 let edges=0,maxDepth=0;const visited=new Set(),pending=[[doc.rootId,null,1]];
 while(pending.length){
  const [id,parent,depth]=pending.pop(),node=doc.nodes[id];
  if(!node||node.id!==id||node.parentId!==parent||visited.has(id)||depth>100)throw Error('Broken tree at '+id);
  if(new Set(node.childIds).size!==node.childIds.length)throw Error('Repeated child at '+id);
  visited.add(id);maxDepth=Math.max(maxDepth,depth);edges+=node.childIds.length;
  for(const child of node.childIds)pending.push([child,id,depth+1]);
 }
 if(visited.size!==ids.size||edges!==ids.size-1)throw Error('Orphan nodes or wrong edge count');
 return {nodes:ids.size,edges,maxDepth};
}
