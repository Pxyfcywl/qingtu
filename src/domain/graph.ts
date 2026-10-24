import type {MindDocument,MindNode} from './types';
export function graphChildren(doc:MindDocument):Record<string,string[]> {
  const result=Object.fromEntries(Object.values(doc.nodes).map(node=>[node.id,[...node.childIds]]));
  for(const node of Object.values(doc.nodes))for(const parent of node.extraParentIds??[])if(result[parent])result[parent].push(node.id);
  return result;
}
export function graphDescendants(children:Record<string,string[]>,id:string):string[]{
  const seen=new Set([id]),result:string[]=[],stack=[...(children[id]??[])];
  while(stack.length){const next=stack.pop()!;if(seen.has(next))continue;seen.add(next);result.push(next);stack.push(...(children[next]??[]));}return result;
}
export function validateParentConnections(doc:MindDocument){
  for(const node of Object.values(doc.nodes))if(node.extraParentIds!==undefined&&!Array.isArray(node.extraParentIds))throw new Error('父节点连接列表无效');
  const children=graphChildren(doc),incoming:Record<string,number>={},depth:Record<string,number>={[doc.rootId]:1};
  for(const node of Object.values(doc.nodes)){
    const extra=node.extraParentIds??[];
    if(!Array.isArray(extra)||extra.length>32)throw new Error('每个节点最多支持 32 个额外父节点');
    const seen=new Set<string>();
    for(const parent of extra){if(typeof parent!=='string'||!doc.nodes[parent]||parent===node.id||parent===node.parentId||seen.has(parent)||node.id===doc.rootId)throw new Error('父节点连接无效或重复');seen.add(parent);}
    incoming[node.id]=(node.parentId?1:0)+extra.length;
  }
  const queue=[doc.rootId];let count=0;
  for(let index=0;index<queue.length;index++){
    const id=queue[index];count++;if(depth[id]>100)throw new Error('节点深度不能超过 100');
    for(const child of children[id]){depth[child]=Math.max(depth[child]??0,depth[id]+1);if(--incoming[child]===0)queue.push(child);}
  }
  if(count!==Object.keys(doc.nodes).length)throw new Error('父节点连接不能形成循环');
}
export function addParentConnection(doc:MindDocument,parent:string,child:string){
  const node=doc.nodes[child];if(!node||!doc.nodes[parent]||child===doc.rootId||parent===child)throw new Error('父节点连接无效');
  if(node.parentId===parent||node.extraParentIds?.includes(parent))return;
  if(graphDescendants(graphChildren(doc),child).includes(parent))throw new Error('不能连接到后代，父节点连接不能形成循环');
  if((node.extraParentIds?.length??0)>=32)throw new Error('每个节点最多支持 32 个额外父节点');
  // Validate the proposed graph before changing the caller's document.
  const extra=[...(node.extraParentIds??[]),parent];validateParentConnections({...doc,nodes:{...doc.nodes,[child]:{...node,extraParentIds:extra}}});node.extraParentIds=extra;
}
export function removeParentConnection(doc:MindDocument,parent:string,child:string){
  const node=doc.nodes[child];if(!node)return;node.extraParentIds=node.extraParentIds?.filter(id=>id!==parent);
  if(!node.extraParentIds?.length)delete node.extraParentIds;
}
export function replaceParentConnection(doc:MindDocument,oldParent:string,newParent:string,child:string){
  const node=doc.nodes[child];
  if(!node||child===doc.rootId||!doc.nodes[newParent]||newParent===child)throw new Error('父节点连接无效');
  if(node.parentId!==oldParent&&!node.extraParentIds?.includes(oldParent))throw new Error('原父节点连接已变化，请重新选择连线');
  if(oldParent===newParent)return;
  const next={...node,extraParentIds:node.extraParentIds?[...node.extraParentIds]:undefined};
  const updates:Record<string,MindNode>={[child]:next};
  if(node.parentId===oldParent){
    next.parentId=newParent;next.extraParentIds=next.extraParentIds?.filter(parent=>parent!==newParent);
    updates[oldParent]={...doc.nodes[oldParent],childIds:doc.nodes[oldParent].childIds.filter(id=>id!==child)};
    updates[newParent]={...doc.nodes[newParent],childIds:[...doc.nodes[newParent].childIds,child],childrenCollapsed:false};
  }else{
    const alreadyConnected=newParent===node.parentId||node.extraParentIds?.includes(newParent);
    next.extraParentIds=next.extraParentIds?.flatMap(parent=>parent===oldParent?(alreadyConnected?[]:[newParent]):[parent]);
    updates[newParent]={...doc.nodes[newParent],childrenCollapsed:false};
  }
  if(!next.extraParentIds?.length)delete next.extraParentIds;
  // Validate the complete replacement before removing the old connection.
  validateParentConnections({...doc,nodes:{...doc.nodes,...updates}});
  for(const [id,item]of Object.entries(updates))doc.nodes[id]=item;
}
export function disconnectParentConnection(doc:MindDocument,parent:string,child:string){
  const node=doc.nodes[child];if(!node||child===doc.rootId)throw new Error('父节点连接无效');
  if(node.parentId!==parent){removeParentConnection(doc,parent,child);return;}
  const replacement=node.extraParentIds?.[0];
  if(!replacement)throw new Error('这是节点唯一的父连接，请先更换父节点或添加其他父连接');
  replaceParentConnection(doc,parent,replacement,child);
}
export function visibleHierarchy(doc:MindDocument){
  const graph=graphChildren(doc),nodes:MindNode[]=[],parents:Record<string,string|null>={},children:Record<string,string[]>={},seen=new Set<string>();
  const stack:{id:string;parent:string|null}[]=[{id:doc.rootId,parent:null}];
  while(stack.length){const {id,parent}=stack.pop()!;if(seen.has(id))continue;seen.add(id);const node=doc.nodes[id];if(!node)throw new Error('节点引用不存在');nodes.push(node);parents[id]=parent;children[id]??=[];if(parent)(children[parent]??=[]).push(id);
    if(!node.childrenCollapsed)for(const child of [...graph[id]].reverse())stack.push({id:child,parent:id});
  }
  return {nodes,parents,children};
}
