import {BaseEdge,EdgeLabelRenderer,getBezierPath,type Edge,type EdgeProps} from '@xyflow/react';
import {beginParentConnection} from './ParentConnector';
import {disconnectParentConnection} from '../domain/graph';
import {commitDrafts} from '../editing';
import {editDocument,showError} from '../state';

export type ParentEdgeType=Edge<{parentTitle:string;childTitle:string;canDisconnect:boolean},'parent'>;
export default function ParentEdge({id,source,target,data,selected,style,...props}:EdgeProps<ParentEdgeType>){
  const [path,x,y]=getBezierPath(props);
  return <>
    <BaseEdge id={id} path={path} interactionWidth={24} style={{...style,strokeWidth:selected?4:style?.strokeWidth}}/>
    {selected&&<EdgeLabelRenderer><div className="parent-edge-tools nodrag nopan" style={{transform:`translate(-50%, -50%) translate(${x}px,${y}px)`}} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
      <span title={`${data?.parentTitle} → ${data?.childTitle}`}>{data?.parentTitle} → {data?.childTitle}</span>
      <button onClick={()=>beginParentConnection(target,undefined,source)}>更换此连线的父节点</button>
      <button disabled={!data?.canDisconnect} title={data?.canDisconnect?'仅断开此连接，保留节点和内容':'唯一父连接不能直接断开，请使用更换父节点'} onClick={()=>{try{commitDrafts();editDocument(doc=>disconnectParentConnection(doc,source,target));}catch(error){showError(error);}}}>断开此父节点连线</button>
    </div></EdgeLabelRenderer>}
  </>;
}
