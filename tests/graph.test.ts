import {it,expect} from 'vitest';
import {addChild,newDocument,validateDocument,visibleNodes,removeNode,reparent} from '../src/domain/tree';
import {addParentConnection,removeParentConnection,replaceParentConnection,disconnectParentConnection} from '../src/domain/graph';
import {layoutTree} from '../src/domain/layout';
const fixture=()=>{const doc=newDocument(),a=addChild(doc,doc.rootId,'text'),b=addChild(doc,doc.rootId,'text'),shared=addChild(doc,a,'card');addParentConnection(doc,b,shared);return {doc,a,b,shared};};
it('更换主父节点一次移除旧连接，合并已有父连接并保留内容和后代',()=>{
 const {doc,a,b,shared}=fixture(),child=addChild(doc,shared,'text');reparent(doc,b,a);const body=structuredClone(doc.nodes[shared].body),position={...doc.nodes[shared].position};
 replaceParentConnection(doc,a,b,shared);validateDocument(doc);expect(doc.nodes[a].childIds).toContain(b);expect(doc.nodes[a].childIds).not.toContain(shared);expect(doc.nodes[b].childIds.filter(id=>id===shared)).toHaveLength(1);expect(doc.nodes[shared].parentId).toBe(b);expect(doc.nodes[shared].extraParentIds).toBeUndefined();expect(doc.nodes[shared].body).toEqual(body);expect(doc.nodes[shared].position).toEqual(position);expect(doc.nodes[child].parentId).toBe(shared);
});
it('仅更换指定额外父连接，不影响主父节点和其他父连接',()=>{
 const {doc,a,b,shared}=fixture(),c=addChild(doc,doc.rootId,'text'),d=addChild(doc,doc.rootId,'text');addParentConnection(doc,c,shared);
 replaceParentConnection(doc,b,d,shared);validateDocument(doc);expect(doc.nodes[shared].parentId).toBe(a);expect(doc.nodes[shared].extraParentIds).toEqual([d,c]);
 replaceParentConnection(doc,d,c,shared);validateDocument(doc);expect(doc.nodes[shared].extraParentIds).toEqual([c]);replaceParentConnection(doc,c,a,shared);validateDocument(doc);expect(doc.nodes[shared].extraParentIds).toBeUndefined();
});
it('无效更换不丢失旧连接，更换到相同父节点保持原结构',()=>{
 const {doc,a,b,shared}=fixture(),child=addChild(doc,shared,'text'),before=JSON.stringify(doc);
 expect(()=>replaceParentConnection(doc,a,child,shared)).toThrow('循环');expect(JSON.stringify(doc)).toBe(before);expect(()=>replaceParentConnection(doc,b,'missing',shared)).toThrow();expect(JSON.stringify(doc)).toBe(before);expect(()=>replaceParentConnection(doc,'missing',a,shared)).toThrow('已变化');expect(JSON.stringify(doc)).toBe(before);
 replaceParentConnection(doc,a,a,shared);expect(JSON.stringify(doc)).toBe(before);
});
it('断开主父连接时提升仍存在的父节点，断开额外连接不删除节点',()=>{
 const {doc,a,b,shared}=fixture(),c=addChild(doc,doc.rootId,'text'),child=addChild(doc,shared,'text');addParentConnection(doc,c,shared);
 disconnectParentConnection(doc,a,shared);validateDocument(doc);expect(doc.nodes[shared].parentId).toBe(b);expect(doc.nodes[shared].extraParentIds).toEqual([c]);expect(doc.nodes[a].childIds).not.toContain(shared);expect(doc.nodes[child]).toBeTruthy();
 disconnectParentConnection(doc,c,shared);validateDocument(doc);expect(doc.nodes[shared]).toBeTruthy();expect(doc.nodes[shared].extraParentIds).toBeUndefined();
});
it('不能直接断开唯一父连接，避免节点与内容成为孤立数据',()=>{
 const {doc,a,b,shared}=fixture();disconnectParentConnection(doc,b,shared);const before=JSON.stringify(doc);expect(()=>disconnectParentConnection(doc,a,shared)).toThrow('唯一');expect(JSON.stringify(doc)).toBe(before);expect(()=>disconnectParentConnection(doc,a,doc.rootId)).toThrow();
});
it('多父连接共享同一节点且折叠一个父分支仍可从另一分支看到',()=>{
 const {doc,a,b,shared}=fixture();validateDocument(doc);expect(visibleNodes(doc)).toHaveLength(4);
 doc.nodes[a].childrenCollapsed=true;expect(visibleNodes(doc).map(n=>n.id)).toContain(shared);expect(Object.keys(layoutTree(doc))).toHaveLength(4);
 doc.nodes[b].childrenCollapsed=true;expect(visibleNodes(doc).map(n=>n.id)).not.toContain(shared);
 doc.nodes[b].childrenCollapsed=false;expect(visibleNodes(doc).filter(n=>n.id===shared)).toHaveLength(1);
});
it('删除父分支保留仍有父节点的共享内容，删除节点会清理全部连接',()=>{
 const {doc,a,b,shared}=fixture(),child=addChild(doc,shared,'text');doc.nodes[shared].body.content!.push({type:'mathBlock',attrs:{latex:'x^2'}});
 const body=structuredClone(doc.nodes[shared].body);removeNode(doc,a);validateDocument(doc);expect(doc.nodes[shared].parentId).toBe(b);expect(doc.nodes[shared].body).toEqual(body);expect(doc.nodes[child]).toBeTruthy();expect(doc.nodes[shared].extraParentIds).toBeUndefined();
 removeNode(doc,shared);validateDocument(doc);expect(doc.nodes[shared]).toBeUndefined();expect(doc.nodes[child]).toBeUndefined();
});
it('拒绝循环和无效连接，重复添加不生成重复边，断开不会删除内容',()=>{
 const {doc,a,b,shared}=fixture(),before=JSON.stringify(doc);
 expect(()=>addParentConnection(doc,shared,a)).toThrow('循环');expect(JSON.stringify(doc)).toBe(before);
 expect(()=>reparent(doc,b,shared)).toThrow();expect(JSON.stringify(doc)).toBe(before);
 addParentConnection(doc,b,shared);expect(doc.nodes[shared].extraParentIds).toEqual([b]);
 removeParentConnection(doc,b,shared);validateDocument(doc);expect(doc.nodes[shared]).toBeTruthy();expect(doc.nodes[shared].extraParentIds).toBeUndefined();
});
it('共享节点布局没有重复放置或重叠，不能给根节点连接父节点',()=>{
 const {doc,a,shared}=fixture();expect(()=>addParentConnection(doc,a,doc.rootId)).toThrow();
 const size={width:180,height:80},positions=layoutTree(doc,Object.fromEntries(Object.keys(doc.nodes).map(id=>[id,size]))),ids=Object.keys(positions);
 expect(ids).toHaveLength(4);for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const p=positions[ids[i]],q=positions[ids[j]];expect(Math.abs(p.x-q.x)<180&&Math.abs(p.y-q.y)<80).toBe(false);}
 doc.nodes[shared].extraParentIds=[a];expect(()=>validateDocument(doc)).toThrow('重复');
});
