import { makeNode, newDocument } from './domain/tree';
import type { MindDocument, NodeKind, RichNode } from './domain/types';
const text = (s: string): RichNode => ({type:'text',text:s});
const paragraph = (s: string): RichNode => ({type:'paragraph',content:[text(s)]});
export function demoDocument(triangle = 'builtin:triangle',geometry = 'builtin:geometry',lesson='builtin:lesson'): MindDocument {
  const doc = newDocument('数学学习地图');
  const root=doc.nodes[doc.rootId];root.title='数学学习';
  function node(parentId: string,title: string,kind: NodeKind = 'text',color = 'teal') {
    const item=makeNode(doc.nodes[parentId],kind,title);item.color=color;
    doc.nodes[item.id]=item;doc.nodes[parentId].childIds.push(item.id);return item;
  }
  const basics=node(root.id,'基础概念');
  node(basics.id,'随文字自动调整大小的普通节点');
  const trig=node(root.id,'三角函数','card','blue');
  trig.contentCollapsed=true;trig.body={type:'doc',content:[paragraph('研究角与边的关系，在这里展开你的笔记。')]};
  node(trig.id,'正弦','text','blue');node(trig.id,'余弦','text','blue');
  const pyth=node(root.id,'勾股定理','card','orange');
  pyth.body={type:'doc',content:[{type:'columns',attrs:{ratio:'3:2'},content:[
    {type:'column',content:[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}},{type:'bulletList',content:[{type:'listItem',content:[paragraph('适用于直角三角形')]},{type:'listItem',content:[paragraph('c 为斜边')]}]}]},
    {type:'column',content:[{type:'assetImage',attrs:{assetId:triangle,alt:'直角三角形，直角边 a、b，斜边 c'}}]},
  ]}]};
  const proof=node(pyth.id,'证明方法','text','orange');
  node(proof.id,'面积法','text','orange');node(proof.id,'相似三角形','text','orange');
  node(pyth.id,'例题练习','text','orange');
  const image=node(root.id,'','image','teal');image.assetId=geometry;image.altText='勾股定理的几何示意图';
  const video=node(root.id,'','video','rose');video.assetId=lesson;video.altText='点击播放视频讲解';video.childrenCollapsed=true;
  node(video.id,'观看记录','text','rose');node(video.id,'关键步骤','text','rose');node(video.id,'我的疑问','text','rose');
  return doc;
}
