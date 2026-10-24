import type {MindDocument,MindNode} from '../domain/types';
import {addParentConnection,removeParentConnection} from '../domain/graph';
import {editDocument,showError} from '../state';
import {commitDrafts} from '../editing';
import {beginParentConnection} from './ParentConnector';

export default function ParentsEditor({doc,node}:{doc:MindDocument;node:MindNode}){
  if(!node.parentId)return null;
  const label=(id:string)=>doc.nodes[id]?.title||'未命名节点';
  const add=(parent:string)=>{if(!parent)return;try{commitDrafts();editDocument(current=>addParentConnection(current,parent,node.id));}catch(error){showError(error);}};
  return <fieldset className="parent-connections"><legend>父节点连接</legend>
    <div className="parent-row"><span>{label(node.parentId)}</span><small>主父节点</small><button onClick={()=>beginParentConnection(node.id,undefined,node.parentId!)}>画布更换</button></div>
    {(node.extraParentIds??[]).map(parent=><div className="parent-row" key={parent}><span>{label(parent)}</span><button aria-label={`断开父节点：${label(parent)}`} onClick={()=>editDocument(current=>removeParentConnection(current,parent,node.id))}>断开</button></div>)}
    <label>添加父节点连接<select aria-label="添加父节点连接" value="" onChange={event=>add(event.target.value)}><option value="">选择已有节点…</option>{Object.values(doc.nodes).filter(item=>item.id!==node.id&&item.id!==node.parentId&&!node.extraParentIds?.includes(item.id)).map(item=><option key={item.id} value={item.id}>{label(item.id)}</option>)}</select></label>
    <p>拖动右上角圆点连接子节点，靠近边缘或进入顶部栏可自动平移。Ctrl+Shift+M 更换父节点；点击已有连线可更换或断开该连接。</p>
  </fieldset>;
}
