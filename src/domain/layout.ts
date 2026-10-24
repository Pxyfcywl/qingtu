import { visibleNodes } from './tree';
import type { MindDocument, MindNode, RichNode } from './types';
import {visibleHierarchy} from './graph';
export type Size = { width: number; height: number };
export type Positions = Record<string, { x: number; y: number }>;
export type LayoutData={rootId:string;nodes:Record<string,{childIds:string[];side:'left'|'right';size:Size}>};
function blockHeight(block: RichNode, renderBounds=false): number {
  if (block.type === 'columns') return Math.max(48,...(block.content ?? []).map(child=>blockHeight(child,renderBounds)));
  if (block.type === 'mathBlock') return 60;
  if (['image','assetImage','video'].includes(block.type)) return 160;
  if(renderBounds&&block.type==='codeBlock')return 24+Math.max(1,(block.content??[]).map(node=>node.text??'').join('').split('\n').length)*20;
  if (block.content?.some(x => x.type !== 'text' && x.type !== 'mathInline')) return block.content.reduce((n,x) => n + blockHeight(x,renderBounds),0);
  const lines=Math.ceil((block.content ?? []).map(x => x.text ?? '').join('').length / 28);
  return renderBounds?9+Math.max(25,lines*25):Math.max(25,lines*24);
}
export function estimateSize(node: MindNode, root = false): Size {
  if (root) return { width: Math.max(190, Math.min(320,node.title.length * 22 + 65)), height: 68 };
  if (node.kind === 'text') return { width: Math.max(100,Math.min(320,node.title.length * 15 + 48)), height: 48 + Math.floor(node.title.length / 18)*22 };
  if (node.kind !== 'card') return { width: node.preferredWidth ?? 280, height: (node.preferredWidth ?? 280)*.67 };
  return { width: node.preferredWidth ?? 432, height: node.contentCollapsed ? 56 : 90 + blockHeight(node.body) };
}
// Before the first DOM measurement, include paragraph spacing so a saved viewport
// near a long card's bottom does not cull the entire card. Layout keeps its stable
// estimates until the real dimensions arrive from ResizeObserver.
export function estimateRenderSize(node:MindNode,root=false):Size{
  const size=estimateSize(node,root);
  return !root&&node.kind==='card'&&!node.contentCollapsed?{...size,height:Math.max(size.height,90+blockHeight(node.body,true))}:size;
}
export function layoutTree(doc: MindDocument, measured: Record<string, Size> = {}): Positions {
  return layoutPrepared(prepareLayout(doc,measured));
}
export function prepareLayout(doc:MindDocument,measured:Record<string,Size>={}):LayoutData{
  if(Object.values(doc.nodes).some(node=>node.extraParentIds?.length)){
    const visible=visibleHierarchy(doc);return {rootId:doc.rootId,nodes:Object.fromEntries(visible.nodes.map(node=>[node.id,{childIds:visible.children[node.id],side:node.side,size:measured[node.id]??estimateSize(node,node.id===doc.rootId)}]))};
  }
  return {rootId:doc.rootId,nodes:Object.fromEntries(visibleNodes(doc).map(node=>[node.id,{
    childIds:node.childrenCollapsed?[]:node.childIds,side:node.side,size:measured[node.id]??estimateSize(node,node.id===doc.rootId),
  }]))};
}
export function layoutPrepared(doc:LayoutData):Positions{
  const ids = new Set(Object.keys(doc.nodes));
  const size = (id: string) => doc.nodes[id].size;
  const positions: Positions = { [doc.rootId]: { x: 0, y: 0 } };
  const root = doc.nodes[doc.rootId];
  const gap = 28;
  for (const side of ['left','right'] as const) {
    const children = root.childIds.filter(id => doc.nodes[id].side === side);
    const heights = new Map<string, number>();
    const column: number[] = [];
    const childrenOf = (id: string) => doc.nodes[id].childIds.filter(x => ids.has(x));
    const measure = (id: string, depth: number): number => {
      column[depth] = Math.max(column[depth] ?? 0, size(id).width);
      const childHeights = childrenOf(id).map(x => measure(x, depth+1));
      const value = Math.max(size(id).height,childHeights.reduce((a,b) => a+b,0) + Math.max(0,childHeights.length-1)*gap);
      heights.set(id,value);
      return value;
    };
    const total = children.reduce((sum,id) => sum + measure(id,0),0) + Math.max(0,children.length-1)*gap;
    const offsets: number[] = [size(doc.rootId).width + 80];
    for (let i=1;i<column.length;i++) offsets[i] = offsets[i-1] + column[i-1]+80;
    const place = (id: string, top: number, depth: number) => {
      const nodeSize = size(id);
      positions[id] = { x: side === 'right' ? offsets[depth] : -(offsets[depth]-size(doc.rootId).width)-nodeSize.width,
        y: top + (heights.get(id)!-nodeSize.height)/2 };
      const children = childrenOf(id);
      const childTotal = children.reduce((n,c) => n+heights.get(c)!,0)+Math.max(0,children.length-1)*gap;
      let y = top+(heights.get(id)!-childTotal)/2;
      for (const child of children) { place(child,y,depth+1); y += heights.get(child)!+gap; }
    };
    let top = size(doc.rootId).height/2 - total/2;
    for (const child of children) { place(child,top,0); top += heights.get(child)!+gap; }
  }
  return positions;
}
