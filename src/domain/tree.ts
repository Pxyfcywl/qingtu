import { blankBody, uid, type MindDocument, type MindNode, type NodeKind } from './types';
import { validateBody } from './body';
import {visibleHierarchy,validateParentConnections,graphChildren,graphDescendants} from './graph';

export function descendants(doc: MindDocument, id: string): string[] {
  const result: string[] = [];
  const stack = [...(doc.nodes[id]?.childIds ?? [])];
  const visited = new Set<string>();
  while (stack.length) {
    const child = stack.pop()!;
    if (visited.has(child)) throw new Error('节点存在循环引用');
    visited.add(child);
    result.push(child);
    stack.push(...(doc.nodes[child]?.childIds ?? []));
  }
  return result;
}
export function visibleNodes(doc: MindDocument): MindNode[] {
  if(Object.values(doc.nodes).some(node=>node.extraParentIds?.length))return visibleHierarchy(doc).nodes;
  const result: MindNode[] = [];
  const stack = [doc.rootId];
  const visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) throw new Error('节点结构无效');
    visited.add(id);
    const node = doc.nodes[id];
    if (!node) throw new Error('节点引用不存在');
    result.push(node);
    if (!node.childrenCollapsed) stack.push(...[...node.childIds].reverse());
  }
  return result;
}
export function validateDocument(doc: MindDocument): void {
  if (doc.schemaVersion !== 1) throw new Error('不支持此项目版本');
  const all = Object.keys(doc.nodes);
  if (!all.length || all.length > 5000) throw new Error('节点数量必须为 1 至 5000');
  if (!doc.nodes[doc.rootId] || doc.nodes[doc.rootId].parentId !== null) throw new Error('根节点无效');
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > 100) throw new Error('节点深度不能超过 100');
    const node = doc.nodes[id];
    if (!node || node.id !== id || seen.has(id)) throw new Error('存在重复、循环或缺失节点');
    seen.add(id);
    if (!['text', 'card', 'image', 'video'].includes(node.kind)) throw new Error('节点类型无效');
    if(node.kind==='card')validateBody(node.body);
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error('位置无效');
    for (const child of node.childIds) {
      if (doc.nodes[child]?.parentId !== id) throw new Error('父子关系不一致');
      walk(child, depth + 1);
    }
  };
  walk(doc.rootId, 1);
  if (seen.size !== all.length) throw new Error('存在没有连接的节点');
  if(Object.values(doc.nodes).some(node=>node.extraParentIds!==undefined))validateParentConnections(doc);
}
export function makeNode(parent: MindNode | null, kind: NodeKind, title = '新想法'): MindNode {
  return {
    id: uid(), kind, parentId: parent?.id ?? null, childIds: [], title,
    body: blankBody(), contentCollapsed: false, childrenCollapsed: false,
    side: parent?.side ?? 'right', color: parent?.color ?? 'teal',
    position: { x: (parent?.position.x ?? -100) + 300, y: (parent?.position.y ?? 0) + 80 },
  };
}
export function addChild(doc: MindDocument, parentId: string, kind: NodeKind): string {
  if (Object.keys(doc.nodes).length >= 5000) throw new Error('最多支持 5000 个节点');
  const parent = doc.nodes[parentId];
  if (!parent) throw new Error('请先选择父节点');
  const node = makeNode(parent, kind, kind === 'card' ? '内容卡片' : kind === 'text' ? '新想法' : '');
  if (parentId === doc.rootId) {
    node.color = ['teal','blue','orange','rose','purple'][parent.childIds.length % 5];
  }
  doc.nodes[node.id] = node;
  parent.childIds.push(node.id);
  parent.childrenCollapsed = false;
  validateDocument(doc);
  return node.id;
}
export function removeNode(doc: MindDocument, id: string) {
  const node = doc.nodes[id];
  if (!node || id === doc.rootId) throw new Error('根节点不能删除');
  if(Object.values(doc.nodes).some(item=>item.extraParentIds?.length)){
    const graph=graphChildren(doc),survivors=new Set<string>(),stack=[doc.rootId];
    while(stack.length){const next=stack.pop()!;if(next===id||survivors.has(next))continue;survivors.add(next);stack.push(...graph[next]);}
    for(const item of Object.values(doc.nodes))if(survivors.has(item.id)){
      item.childIds=item.childIds.filter(child=>survivors.has(child));
      item.extraParentIds=item.extraParentIds?.filter(parent=>survivors.has(parent));
      if(item.parentId&&!survivors.has(item.parentId)){const parent=item.extraParentIds![0];item.parentId=parent;doc.nodes[parent].childIds.push(item.id);item.extraParentIds=item.extraParentIds!.filter(value=>value!==parent);}
      if(!item.extraParentIds?.length)delete item.extraParentIds;
    }
    for(const key of Object.keys(doc.nodes))if(!survivors.has(key))delete doc.nodes[key];return;
  }
  doc.nodes[node.parentId!].childIds = doc.nodes[node.parentId!].childIds.filter(x => x !== id);
  for (const child of [...descendants(doc, id), id]) delete doc.nodes[child];
}
export function reparent(doc: MindDocument, id: string, target: string) {
  if (id === doc.rootId || id === target || descendants(doc, id).includes(target)) throw new Error('不能移动到自身或后代');
  if(graphDescendants(graphChildren(doc),id).includes(target))throw new Error('不能移动到自身或后代');
  const node = doc.nodes[id];
  if (!node || !doc.nodes[target]) throw new Error('节点不存在');
  doc.nodes[node.parentId!].childIds = doc.nodes[node.parentId!].childIds.filter(x => x !== id);
  doc.nodes[target].childIds.push(id);
  node.parentId = target;
  node.extraParentIds=node.extraParentIds?.filter(parent=>parent!==target);if(!node.extraParentIds?.length)delete node.extraParentIds;
  doc.nodes[target].childrenCollapsed = false;
  validateDocument(doc);
}
export function newDocument(title = '未命名思维导图'): MindDocument {
  const root = makeNode(null, 'text', title);
  root.position = { x: 0, y: 0 };
  return { id: uid(), schemaVersion: 1, title, rootId: root.id, revision: 0, layoutMode: 'auto',
    viewport: { x: 150, y: 200, zoom: 1 }, nodes: { [root.id]: root }, updatedAt: Date.now() };
}
