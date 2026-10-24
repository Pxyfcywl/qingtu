import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { ReactFlow,Background,BackgroundVariant,MiniMap,Controls,applyNodeChanges,useReactFlow,Position,getNodesBounds,getViewportForBounds,type Edge,type OnNodesChange } from '@xyflow/react';
import { MindNode,type FlowNode } from './MindNode';
import ParentConnector from './ParentConnector';
import ParentEdge from './ParentEdge';
import { useApp,editDocument,patchState,getState,showError } from '../state';
import { savePng } from '../bridge';
import { visibleNodes,descendants } from '../domain/tree';
import { estimateRenderSize,prepareLayout,type Positions,type Size } from '../domain/layout';
import type { MindDocument } from '../domain/types';
import { commitDrafts } from '../editing';
import {startOperation,cancelOperations} from '../operations';
import {importFiles} from '../actions';
import {mediaFileKind} from '../media-import';
import {addParentConnection,disconnectParentConnection,graphChildren,graphDescendants,visibleHierarchy} from '../domain/graph';
import '@xyflow/react/dist/style.css';

const nodeTypes={mind:MindNode};
const edgeTypes={parent:ParentEdge};
const emptyPositions:Positions={};
function initialHandles(size:Size,root:boolean,direction:'left'|'right'):NonNullable<FlowNode['handles']>{
  const handle=(id:string,type:'source'|'target',position:Position)=>({id,type,position,x:position===Position.Left?-2.5:size.width-2.5,y:size.height/2-2.5,width:5,height:5});
  return [handle('right','source',Position.Right),...(!root?[handle('in','target',direction==='left'?Position.Right:Position.Left)]:[]),...(root||direction==='left'?[handle('left','source',Position.Left)]:[])];
}
const colors:Record<string,string>={teal:'#69cbb2',blue:'#79aaff',orange:'#f5b28b',rose:'#f19fa7',purple:'#b5a0e7'};
export function Canvas({onMedia,onPane,onReady}:{onMedia:(id:string)=>void;onPane:()=>void;onReady:()=>void}) {
  const {doc,selectedId,titleEditing}=useApp();
  const [nodes,setNodes]=useState<FlowNode[]>([]);
  const [selectedEdge,setSelectedEdge]=useState<{docId:string;parent:string;child:string}|null>(null);
  useEffect(()=>{const clear=()=>setSelectedEdge(null);window.addEventListener('qingtu-clear-edge-selection',clear);return()=>window.removeEventListener('qingtu-clear-edge-selection',clear);},[]);
  useEffect(()=>{
    if(!selectedEdge)return;const child=doc?.nodes[selectedEdge.child];
    if(selectedEdge.docId!==doc?.id||!child||child.parentId!==selectedEdge.parent&&!child.extraParentIds?.includes(selectedEdge.parent))setSelectedEdge(null);
  },[selectedEdge,doc?.id,doc?.nodes]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!selectedEdge||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!['Delete','Backspace'].includes(event.key))return;
      if((event.target as Element).closest('input,textarea,select,button,a,[contenteditable="true"]')||document.querySelector('.modal-backdrop,dialog[open]'))return;
      event.preventDefault();event.stopImmediatePropagation();const current=getState();if(current.busy||current.doc?.id!==selectedEdge.docId)return;
      try{commitDrafts();editDocument(d=>disconnectParentConnection(d,selectedEdge.parent,selectedEdge.child));}catch(error){showError(error);}
    };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[selectedEdge]);
  const [layout,setLayout]=useState<{docId:string;positions:Positions}>({docId:'',positions:emptyPositions});
  const positions=layout.docId===doc?.id?layout.positions:emptyPositions;
  const [measureTick,setMeasureTick]=useState(0);
  const sizes=useRef<Record<string,Size>>({});
  const worker=useRef<Worker|null>(null);const sequence=useRef(0);
  const layoutPending=useRef(false);
  const layoutDocument=useRef('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const anchor=useRef<{id:string;x:number;y:number;focus?:string}|null>(null);
  const compensatingViewport=useRef(false);
  const flow=useReactFlow<FlowNode>();const readyDocument=useRef('');
  const viewportAdjusted=useRef('');
  const dragging=useRef(false);
  type ExportRequest={path:string;docId:string;operation:ReturnType<typeof startOperation>};
  const [exportRequest,setExportRequest]=useState<ExportRequest|null>(null);
  const activeExport=useRef<ExportRequest|null>(null);const exportPath=exportRequest?.path??'';
  const fitCanvas=useCallback((padding:number,maxZoom:number,minZoom:number)=>{
    const current=getState().doc,items=flow.getNodes(),pane=document.querySelector<HTMLElement>('.react-flow');
    if(!current||!pane||layoutPending.current||!items.length||items.some(n=>current.nodes[n.id]!==n.data.item))return false;
    const viewport=getViewportForBounds(getNodesBounds(items),pane.clientWidth,pane.clientHeight,minZoom,maxZoom,padding);
    // fitView queues work against a later node batch. Capture these bounds now,
    // so a request from the previous document cannot fit a newly opened graph.
    void flow.setViewport(viewport,{duration:0});return true;
  },[flow]);
  useEffect(()=>{
    const instance=new Worker(new URL('../domain/layout.worker.ts',import.meta.url),{type:'module'});
    worker.current=instance;
    instance.onmessage=event=>{if(event.data.sequence===sequence.current&&layoutDocument.current===getState().doc?.id){layoutPending.current=false;if(event.data.error)showError(event.data.error);else setLayout({docId:layoutDocument.current,positions:event.data.positions});}};
    return()=>{instance.terminate();worker.current=null;};
  },[]);
  useLayoutEffect(()=>{sizes.current={};anchor.current=null;viewportAdjusted.current='';},[doc?.id]);
  useLayoutEffect(()=>{if(anchor.current?.id!==selectedId)anchor.current=null;},[selectedId]);
  useEffect(()=>{
    if(!doc||doc.layoutMode!=='auto'){++sequence.current;layoutDocument.current=doc?.id??'';layoutPending.current=false;return;}
    if(dragging.current)return;
    const element=selectedId?document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selectedId)}"]`):null;
    const focusedNode=document.activeElement?.closest('[data-node-id]')?.getAttribute('data-node-id');
    const interacting=!!selectedId&&focusedNode===selectedId;
    if(interacting)viewportAdjusted.current=doc.id;
    if(!anchor.current&&element&&(readyDocument.current===doc.id||interacting)){
      const rect=element.getBoundingClientRect(),active=document.activeElement;
      const focus=active?.matches('.body-toggle')?'.body-toggle':active?.matches('.branch-toggle')?'.branch-toggle':undefined;
      anchor.current={id:selectedId!,x:rect.x,y:rect.y,focus};
    }
    const seq=++sequence.current;
    layoutDocument.current=doc.id;
    layoutPending.current=true;
    worker.current?.postMessage({layout:prepareLayout(doc,sizes.current),sequence:seq});
  },[doc?.nodes,doc?.layoutMode,doc?.id,measureTick]);
  const visible=useMemo(()=>doc?visibleNodes(doc):[],[doc?.nodes,doc?.rootId]);
  // Let viewport culling use layout coordinates, rather than briefly mounting
  // every new or expanded node at its initial placeholder position.
  const positioned=useMemo(()=>doc?.layoutMode==='free'?visible:visible.filter(node=>positions[node.id]),[visible,positions,doc?.layoutMode]);
  const directions=useMemo(()=>{
    const result:Record<string,'left'|'right'>={};
    if(doc){const parents=visibleHierarchy(doc).parents;for(const node of visible){let current=node;while(parents[current.id]&&parents[current.id]!==doc.rootId)current=doc.nodes[parents[current.id]!];result[node.id]=current.side;}}
    return result;
  },[visible,doc?.rootId]);
  const connections=useMemo(()=>doc?graphChildren(doc):{},[doc?.nodes]);
  const multipleParents=useMemo(()=>doc&&Object.values(doc.nodes).some(node=>node.extraParentIds?.length),[doc?.nodes]);
  useEffect(()=>{
    if(!doc)return;
    setNodes(previous=>{
      const byId=new Map(previous.map(n=>[n.id,n]));
      return positioned.map(item=>{
        const root=item.id===doc.rootId;
        const pos=doc.layoutMode==='free'?item.position:positions[item.id];
        const old=byId.get(item.id);
        const direction=directions[item.id]??'right';
        const count=multipleParents?graphDescendants(connections,item.id).length:item.childIds.length?descendants(doc,item.id).length:0;
        const data=old&&old.data.item===item&&old.data.direction===direction&&old.data.count===count?old.data:{item,root,direction,count,onMedia};
        if(old&&old.data===data&&old.position.x===pos.x&&old.position.y===pos.y&&old.selected===(selectedId===item.id))return old;
        const size=sizes.current[item.id]??estimateRenderSize(item,root);
        return { ...old,id:item.id,type:'mind' as const,position:pos,data,selected:selectedId===item.id,
          dragHandle:item.kind==='image'||item.kind==='video'?undefined:'.drag-handle',
          initialWidth:size.width,initialHeight:size.height,measured:old?.measured??size,handles:initialHandles(size,root,direction) };
      });
    });
  },[positioned,positions,selectedId,doc?.layoutMode,directions,onMedia]);
  useEffect(()=>{
    if(!doc||!titleEditing)return;
    const node=nodes.find(item=>item.id===titleEditing),pane=document.querySelector('.react-flow');
    if(!node||!pane||node.data.item!==doc.nodes[titleEditing])return;
    const viewport=flow.getViewport(),bounds=pane.getBoundingClientRect(),width=node.measured?.width??node.initialWidth??160,height=Math.min(node.measured?.height??node.initialHeight??64,64);
    const x=viewport.x+node.position.x*viewport.zoom,y=viewport.y+node.position.y*viewport.zoom;
    if(x>=80&&y>=24&&x+width*viewport.zoom<=bounds.width-24&&y+height*viewport.zoom<=bounds.height-24)return;
    anchor.current=null;viewportAdjusted.current=doc.id;
    void flow.setCenter(node.position.x+width/2,node.position.y+height/2,{zoom:viewport.zoom,duration:0});
  },[nodes,titleEditing,doc?.id,flow]);
  const edges=useMemo<Edge[]>(()=>{
    if(!doc)return[];
    const visibleIds=new Set(positioned.map(n=>n.id));
    const edgeDetails=(parent:string,child:string)=>({selected:selectedEdge?.docId===doc.id&&selectedEdge.parent===parent&&selectedEdge.child===child,data:{parentTitle:doc.nodes[parent].title||'未命名节点',childTitle:doc.nodes[child].title||'未命名节点',canDisconnect:parent!==doc.nodes[child].parentId||!!doc.nodes[child].extraParentIds?.length}});
    const primary:Edge[]=positioned.filter(n=>n.parentId&&visibleIds.has(n.parentId)&&!doc.nodes[n.parentId].childrenCollapsed).map(n=>({id:`${n.parentId}:${n.id}`,source:n.parentId!,target:n.id,
      sourceHandle:n.parentId===doc.rootId?directions[n.id]:directions[n.parentId!],targetHandle:'in',type:'parent',selectable:true,...edgeDetails(n.parentId!,n.id),
      style:{stroke:colors[n.color]??colors.teal,strokeWidth:2.5}}));
    const additional:Edge[]=positioned.flatMap(node=>(node.extraParentIds??[]).filter(parent=>visibleIds.has(parent)&&!doc.nodes[parent].childrenCollapsed).map(parent=>({id:`extra:${parent}:${node.id}`,source:parent,target:node.id,sourceHandle:parent===doc.rootId?directions[node.id]:directions[parent],targetHandle:'in',type:'parent',selectable:true,...edgeDetails(parent,node.id),className:'additional-parent-edge',style:{stroke:colors[node.color]??colors.teal,strokeWidth:2.5}})));
    return [...primary,...additional];
  },[positioned,directions,selectedEdge]);
  useEffect(()=>{
    const reveal=(event:Event)=>{
      const {docId,rect}=(event as CustomEvent<{docId:string;rect:{top:number;bottom:number;left:number;right:number}}>).detail;
      const current=getState();if(current.doc?.id!==docId||!current.editingId)return;
      const bounds=document.querySelector('.react-flow')?.getBoundingClientRect();if(!bounds)return;
      const dy=rect.top<bounds.top+85?bounds.top+85-rect.top:rect.bottom>bounds.bottom-35?bounds.bottom-35-rect.bottom:0;
      const dx=rect.left<bounds.left+85?bounds.left+85-rect.left:rect.right>bounds.right-24?bounds.right-24-rect.right:0;
      if(!dx&&!dy)return;anchor.current=null;viewportAdjusted.current=docId;const viewport=flow.getViewport();void flow.setViewport({...viewport,x:viewport.x+dx,y:viewport.y+dy},{duration:0});
    };window.addEventListener('qingtu-reveal-caret',reveal);return()=>window.removeEventListener('qingtu-reveal-caret',reveal);
  },[flow]);
  useLayoutEffect(()=>{
    if(!anchor.current)return;
    const frame=requestAnimationFrame(()=>{
      const current=anchor.current;if(!current)return;
      const element=document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.id)}"]`);
      const viewport=flow.getViewport(),pane=document.querySelector('.react-flow'),node=nodes.find(n=>n.id===current.id);
      if(!pane||!node)return;
      const origin=pane.getBoundingClientRect();
      // A layout can briefly cull the focused node before viewport compensation.
      // Its accepted world position still lets us restore the same screen point.
      const rect=element?.getBoundingClientRect()??{x:origin.x+viewport.x+node.position.x*viewport.zoom,y:origin.y+viewport.y+node.position.y*viewport.zoom};
      const restoreFocus=()=>{if(anchor.current===current&&current.focus&&document.hasFocus()&&document.activeElement===document.body)document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.id)}"] ${current.focus}`)?.focus({preventScroll:true});};
      if(Math.hypot(current.x-rect.x,current.y-rect.y)<.05){restoreFocus();return;}
      compensatingViewport.current=true;
      void flow.setViewport({...viewport,x:viewport.x+current.x-rect.x,y:viewport.y+current.y-rect.y},{duration:0}).finally(()=>{compensatingViewport.current=false;requestAnimationFrame(restoreFocus);});
    });return()=>cancelAnimationFrame(frame);
  },[nodes]);
  useEffect(()=>{
    if(!doc||!nodes.length||readyDocument.current===doc.id)return;
    if(doc.layoutMode==='auto'&&!positions[doc.rootId])return;
    let disposed=false,frame=0,stable=0,last='',viewApplied=false,finalFit=false;
    const started=performance.now();
    const sample=()=>{
      if(disposed||getState().doc?.id!==doc.id)return;
      if(performance.now()-started>10000){showError('部分内容尚未加载完成，请检查素材或重新打开文档');return;}
      const elements=Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'));
      const images=Array.from(document.querySelectorAll<HTMLImageElement>('.react-flow__viewport img'));
      const formulas=Array.from(document.querySelectorAll<HTMLElement>('.react-flow__viewport .math-block,.react-flow__viewport .math-inline'));
      const currentNodes=flow.getNodes(),currentDocument=getState().doc;
      // An old viewport near a formerly unbounded card's bottom can become empty
      // after the card switches to internal scrolling. Recover only during opening,
      // before a user has moved the canvas, and leave ordinary saved views intact.
      if(!elements.length&&doc.revision>0&&viewportAdjusted.current!==doc.id&&performance.now()-started>500&&!layoutPending.current&&!timer.current&&visible.some(node=>node.kind==='card'&&!node.contentCollapsed&&estimateRenderSize(node).height>560)){
        if(fitCanvas(.17,1,.3)){viewportAdjusted.current=doc.id;viewApplied=true;}
      }
      const complete=elements.length>0&&currentNodes.every(n=>currentDocument?.nodes[n.id]===n.data.item)&&!layoutPending.current&&!timer.current&&!document.querySelector('.react-flow__viewport .media-placeholder,.react-flow__viewport [data-media-loading="true"],[data-content-loading="true"]')&&document.fonts.status==='loaded'&&images.every(img=>img.complete&&img.naturalWidth>0)&&formulas.every(el=>el.querySelector('.katex,.katex-error'));
      const signature=sequence.current+'|'+elements.map(el=>el.style.transform+':'+el.offsetWidth+':'+el.offsetHeight).join('|');
      stable=complete&&last===signature?stable+1:0;last=signature;
      if(complete&&!viewApplied){stable=0;if(viewportAdjusted.current===doc.id)viewApplied=true;else if(doc.revision>0){void flow.setViewport(doc.viewport,{duration:0});viewApplied=true;}else viewApplied=fitCanvas(.17,1,.3);}
      else if(stable>=2){
        if(doc.revision===0&&!finalFit&&viewportAdjusted.current!==doc.id){finalFit=fitCanvas(.17,1,.3);stable=0;}
        else{readyDocument.current=doc.id;onReady();return;}
      }
      frame=requestAnimationFrame(sample);
    };
    frame=requestAnimationFrame(sample);
    return()=>{disposed=true;cancelAnimationFrame(frame);};
  },[nodes,positions,doc?.id,fitCanvas]);
  const onNodesChange:OnNodesChange<FlowNode>=useCallback(changes=>{
    setNodes(current=>applyNodeChanges(changes.filter(c=>c.type!=='select'),current));
    let changed=false;
    for(const change of changes) if(change.type==='dimensions'&&change.dimensions){
      const old=sizes.current[change.id],next=change.dimensions;
      if(!old||Math.abs(old.width-next.width)>=1||Math.abs(old.height-next.height)>=1){sizes.current[change.id]=next;changed=true;}
    }
    if(changed){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=null;setMeasureTick(t=>t+1);},16);}
  },[]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{
    const handle=(event:Event)=>{
      const type=(event as CustomEvent).detail;
      if(type==='fit'&&fitCanvas(.18,1.25,.25)){anchor.current=null;viewportAdjusted.current=getState().doc?.id??'';}
      if(type==='in')void flow.zoomIn({duration:0});if(type==='out')void flow.zoomOut({duration:0});
      if(type==='layout'){editDocument(d=>{d.layoutMode='auto';});setMeasureTick(n=>n+1);}
    };window.addEventListener('qingtu-canvas',handle);return()=>window.removeEventListener('qingtu-canvas',handle);
  },[flow,fitCanvas]);
  useEffect(()=>{
    const handler=(event:Event)=>{const current=getState().doc;if(!current)return;const request={path:(event as CustomEvent<string>).detail,docId:current.id,operation:startOperation('png-export')};activeExport.current=request;setExportRequest(request);patchState({busy:'正在生成导图图片…'});};
    window.addEventListener('qingtu-export-png',handler);return()=>window.removeEventListener('qingtu-export-png',handler);
  },[]);
  useEffect(()=>{
    if(!exportRequest)return;const request=exportRequest;
    const ensureCurrent=()=>{request.operation.signal.throwIfAborted();if(getState().doc?.id!==request.docId)throw new DOMException('文档已切换','AbortError');};
    const clear=()=>{if(activeExport.current===request){activeExport.current=null;document.querySelector('.react-flow__viewport')?.classList.remove('exporting');setExportRequest(null);if(getState().busy==='正在生成导图图片…')patchState({busy:''});}};
    request.operation.signal.addEventListener('abort',clear,{once:true});
    const render=async()=>{
      let clearImageCache:(()=>void)|undefined;
      try {
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        ensureCurrent();
        const viewport=document.querySelector<HTMLElement>('.react-flow__viewport');if(!viewport)throw new Error('画布尚未准备好');
        viewport.classList.add('exporting');
        const deadline=performance.now()+15000;let stable=0,last='';
        while(stable<2){
          ensureCurrent();
          if(performance.now()>deadline)throw new Error('等待导出内容加载超时，请检查素材后重试');
          const pending=viewport.querySelector('.media-placeholder,[data-media-loading="true"],[data-content-loading="true"]');
          const formulasReady=Array.from(viewport.querySelectorAll('.math-block,.math-inline')).every(element=>element.querySelector('.katex,.katex-error'));
          const signature=sequence.current+'|'+Array.from(viewport.querySelectorAll<HTMLElement>('.react-flow__node')).map(el=>el.style.transform+':'+el.offsetWidth+':'+el.offsetHeight).join('|');
          stable=!pending&&formulasReady&&document.fonts.status==='loaded'&&!layoutPending.current&&!timer.current&&last===signature?stable+1:0;last=signature;
          await new Promise(resolve=>requestAnimationFrame(resolve));
        }
        const imgs=Array.from(viewport.querySelectorAll<HTMLImageElement>('img'));
        await Promise.all(imgs.map(img=>{img.loading='eager';return img.complete?Promise.resolve():new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('图片读取失败'));setTimeout(()=>reject(new Error('图片读取超时')),10000);});}));
        await document.fonts.ready;
        ensureCurrent();
        const bounds=getNodesBounds(flow.getNodes());
        const width=Math.ceil(bounds.width+80),height=Math.ceil(bounds.height+80);const pixelRatio=Math.min(2,8192/Math.max(width,height));
        const {toBlob,clearResourceCache}=await import('../vendor/html-to-image');clearImageCache=clearResourceCache;
        ensureCurrent();
        const blob=await toBlob(viewport,{backgroundColor:'#fafcfc',width,height,pixelRatio,
          style:{width:width+'px',height:height+'px',transform:`translate(${40-bounds.x}px,${40-bounds.y}px) scale(1)`},
          filter:element=>!(element instanceof HTMLElement&&element.matches('.quick-add,.parent-connect-point,.parent-edge-tools,.react-flow__resize-control,.card-insert-tools'))});
        if(!blob||blob.size<100)throw new Error('图片导出为空');
        const bytes=await blob.arrayBuffer();ensureCurrent();
        await savePng(request.path,bytes);ensureCurrent();
        patchState({busy:'',notice:pixelRatio<2?'导图图片已导出；为适应 8192 像素上限，已降低导出比例':'导图图片已导出'});
      }catch(error){if(!request.operation.signal.aborted&&getState().doc?.id===request.docId)showError(error);}finally{clearImageCache?.();request.operation.signal.removeEventListener('abort',clear);clear();request.operation.finish();}
    };void render();
  },[exportRequest]);
  useEffect(()=>()=>cancelOperations('png-export'),[]);
  if(!doc)return <div className="canvas-empty"/>;
  return <ReactFlow<FlowNode> nodes={doc.layoutMode==='auto'&&layout.docId!==doc.id?[]:nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
    onDragOver={event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}}}
    onDrop={event=>{const files=Array.from(event.dataTransfer.files).filter(file=>mediaFileKind(file));if(!files.length)return;event.preventDefault();event.stopPropagation();if(getState().busy)return;const target=(event.target as HTMLElement).closest('[data-node-id]')?.getAttribute('data-node-id')??undefined;
      const drop=target?undefined:{position:flow.screenToFlowPosition({x:event.clientX,y:event.clientY}),positions:Object.fromEntries(flow.getNodes().map(node=>[node.id,{...node.position}]))};void importFiles(files,target,drop);}}
    minZoom={.25} maxZoom={2} deleteKeyCode={null} multiSelectionKeyCode={null} selectionKeyCode={null}
    panActivationKeyCode="Space" panOnDrag={[0,1]} zoomOnDoubleClick={false} nodesConnectable
    onConnect={connection=>{try{commitDrafts();if(connection.source&&connection.target)editDocument(current=>addParentConnection(current,connection.source!,connection.target!));}catch(error){showError(error);}}}
    onlyRenderVisibleElements={!exportPath} proOptions={{hideAttribution:true}}
    onFocusCapture={event=>{
      const target=event.target;if(!(target instanceof HTMLElement)||!target.closest('[data-node-id]'))return;
      const pane=document.querySelector('.react-flow');if(!pane)return;
      if(target.matches('[contenteditable="true"]'))return;
      const bounds=pane.getBoundingClientRect(),padding=20,rect=target.getBoundingClientRect();

      const dx=rect.left<bounds.left+padding?bounds.left+padding-rect.left:rect.right>bounds.right-padding?bounds.right-padding-rect.right:0;
      const dy=rect.top<bounds.top+padding?bounds.top+padding-rect.top:rect.bottom>bounds.bottom-padding?bounds.bottom-padding-rect.bottom:0;
      if(Math.abs(dx)<.05&&Math.abs(dy)<.05)return;
      anchor.current=null;viewportAdjusted.current=doc.id;const viewport=flow.getViewport();
      void flow.setViewport({...viewport,x:viewport.x+dx,y:viewport.y+dy},{duration:0});
    }}
    onEdgeClick={(event,edge)=>{event.stopPropagation();try{commitDrafts();patchState({selectedId:edge.target,editingId:null,titleEditing:null});setSelectedEdge({docId:doc.id,parent:edge.source,child:edge.target});}catch(error){showError(error);}}}
    onNodeClick={(_,node)=>{setSelectedEdge(null);patchState({selectedId:node.id});}} onPaneClick={()=>{try{commitDrafts();anchor.current=null;setSelectedEdge(null);patchState({editingId:null,titleEditing:null});onPane();}catch(error){showError(error);}}}
    onNodeDragStart={()=>{setSelectedEdge(null);dragging.current=true;anchor.current=null;viewportAdjusted.current=doc.id;}}
    onNodeDragStop={(_,node)=>{dragging.current=false;
      const current=flow.getNodes();editDocument(d=>{d.layoutMode='free';for(const n of current)if(d.nodes[n.id])d.nodes[n.id].position=n.id===node.id?node.position:n.position;});}}
    onMoveStart={event=>{if(event){viewportAdjusted.current=doc.id;anchor.current=null;}}}
    onMoveEnd={(_,viewport)=>{if(!compensatingViewport.current)anchor.current=null;if(getState().doc)editDocument(d=>{d.viewport=viewport;},{history:false});}}
    aria-label="思维导图画布">
    <ParentConnector/>
    <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dce5e9"/>
    <MiniMap nodeColor={n=>colors[(n.data.item as FlowNode['data']['item']).color]??colors.teal} pannable zoomable maskColor="rgba(244,248,249,.75)"/>
    <Controls showInteractive={false} showFitView={false}/>
  </ReactFlow>;
}
export function canvasAction(action:string) {window.dispatchEvent(new CustomEvent('qingtu-canvas',{detail:action}));}
export function capturePositions(doc:MindDocument,nodes:FlowNode[]) {for(const n of nodes)if(doc.nodes[n.id])doc.nodes[n.id].position=n.position;}
