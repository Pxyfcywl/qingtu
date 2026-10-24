import { describe,it,expect } from 'vitest';
import { addChild,descendants,newDocument,removeNode,reparent,validateDocument,visibleNodes } from '../src/domain/tree';
import { demoDocument } from '../src/seed';
import { layoutTree,estimateSize } from '../src/domain/layout';

describe('树与独立折叠',()=>{
  it('四种正文和分支状态的可见集正确',()=>{
    const doc=newDocument();const a=addChild(doc,doc.rootId,'card');addChild(doc,a,'text');
    for(const body of [false,true])for(const children of [false,true]){
      doc.nodes[a].contentCollapsed=body;doc.nodes[a].childrenCollapsed=children;
      expect(visibleNodes(doc).length).toBe(children?2:3);expect(Object.keys(doc.nodes)).toHaveLength(3);
    }
  });
  it('祖先重复折叠不改变后代折叠状态或正文',()=>{
    const doc=demoDocument();const pyth=Object.values(doc.nodes).find(n=>n.title==='勾股定理')!;
    const proof=doc.nodes[pyth.childIds[0]];proof.childrenCollapsed=true;
    const before=JSON.stringify(doc);
    for(let i=0;i<100;i++){pyth.childrenCollapsed=true;visibleNodes(doc);pyth.childrenCollapsed=false;visibleNodes(doc);}
    expect(JSON.stringify(doc)).toBe(before);expect(proof.childrenCollapsed).toBe(true);
  });
  it('拒绝循环改挂并保持结构不变',()=>{
    const doc=newDocument();const a=addChild(doc,doc.rootId,'text');const b=addChild(doc,a,'text');
    const before=JSON.stringify(doc);expect(()=>reparent(doc,a,b)).toThrow();expect(JSON.stringify(doc)).toBe(before);
  });
  it('删除子树并保留兄弟节点，根不可删除',()=>{
    const doc=newDocument();const a=addChild(doc,doc.rootId,'text');addChild(doc,a,'card');const b=addChild(doc,doc.rootId,'text');
    removeNode(doc,a);validateDocument(doc);expect(Object.keys(doc.nodes)).toHaveLength(2);expect(doc.nodes[b]).toBeTruthy();
    expect(()=>removeNode(doc,doc.rootId)).toThrow();
  });
  it('拒绝脱离树、重复引用和超过最大深度',()=>{
    const doc=newDocument();const a=addChild(doc,doc.rootId,'text');doc.nodes[doc.rootId].childIds.push(a);
    expect(()=>validateDocument(doc)).toThrow();
    const deep=newDocument();let parent=deep.rootId;
    for(let i=0;i<99;i++)parent=addChild(deep,parent,'text');
    expect(()=>addChild(deep,parent,'text')).toThrow('深度');
  });
  it('固定种子随机命令始终保持树不变量',()=>{
    let seed=20261015;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let tree=0;tree<100;tree++){
      const doc=newDocument();
      for(let step=0;step<1000;step++){
        const ids=Object.keys(doc.nodes);const id=ids[Math.floor(random()*ids.length)];const action=random();
        if(action<.32&&ids.length<120)addChild(doc,id,'text');
        else if(action<.5&&id!==doc.rootId)removeNode(doc,id);
        else if(action<.75)doc.nodes[id].childrenCollapsed=!doc.nodes[id].childrenCollapsed;
        else {const valid=ids.filter(target=>target!==id&&!descendants(doc,id).includes(target));if(id!==doc.rootId&&valid.length)reparent(doc,id,valid[Math.floor(random()*valid.length)]);}
        validateDocument(doc);const visible=visibleNodes(doc);expect(new Set(visible.map(n=>n.id)).size).toBe(visible.length);
      }
    }
  },30000);
});
describe('动态树布局',()=>{
  it('混合尺寸和左右分支下节点不重叠',()=>{
    const doc=demoDocument();const root=doc.nodes[doc.rootId];doc.nodes[root.childIds[0]].side='left';
    const sizes=Object.fromEntries(visibleNodes(doc).map((n,i)=>[n.id,{width:estimateSize(n,n.id===doc.rootId).width+i*3,height:60+i*17}]));
    const positions=layoutTree(doc,sizes);const ids=Object.keys(positions);
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
      const x=ids[a],y=ids[b],px=positions[x],py=positions[y];
      const overlap=Math.min(px.x+sizes[x].width,py.x+sizes[y].width)-Math.max(px.x,py.x)>0&&Math.min(px.y+sizes[x].height,py.y+sizes[y].height)-Math.max(px.y,py.y)>0;
      expect(overlap,`${x} and ${y}`).toBe(false);
    }
    expect(positions[root.childIds[0]].x).toBeLessThan(0);
  });
  it('布局不修改文档，隐藏后代不出现在坐标结果',()=>{
    const doc=demoDocument();doc.nodes[doc.rootId].childrenCollapsed=true;const before=JSON.stringify(doc);
    expect(Object.keys(layoutTree(doc))).toEqual([doc.rootId]);expect(JSON.stringify(doc)).toBe(before);
  });
});
