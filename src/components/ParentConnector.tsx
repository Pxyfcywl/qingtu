import {useEffect,useRef,useState} from 'react';
import {Panel,ViewportPortal,useReactFlow,useViewport} from '@xyflow/react';
import {commitDrafts} from '../editing';
import {addParentConnection,replaceParentConnection} from '../domain/graph';
import {editDocument,getState,patchState,showError,useApp} from '../state';
import type {FlowNode} from './MindNode';
import '../styles-connections.css';

type Point={x:number;y:number};
type Mode='add'|'replace'|'child';
type Connection={childId:string;docId:string;start:Point;mode:Mode;oldParentId:string};
export function beginParentConnection(id:string,event?:{clientX:number;clientY:number;shiftKey?:boolean},oldParentId?:string){
  window.dispatchEvent(new CustomEvent('qingtu-connect-parent',{detail:{id,point:event?{x:event.clientX,y:event.clientY}:undefined,mode:oldParentId||event?.shiftKey?'replace':'add',oldParentId}}));
}
export function beginChildConnection(id:string,event?:{clientX:number;clientY:number;pointerId?:number}){
  window.dispatchEvent(new CustomEvent('qingtu-connect-parent',{detail:{id,point:event?{x:event.clientX,y:event.clientY}:undefined,pointerId:event?.pointerId,mode:'child'}}));
}
export default function ParentConnector(){
  const {doc,selectedId,editingId,titleEditing,busy}=useApp();
  const flow=useReactFlow<FlowNode>(),viewport=useViewport();
  const [active,setActive]=useState<Connection|null>(null),[pointer,setPointer]=useState<Point>({x:0,y:0}),[target,setTarget]=useState<string|null>(null);
  const suppressClickUntil=useRef(0);
  const initialDrag=useRef(false),pointerRef=useRef<Point>({x:0,y:0});
  const capture=useRef<{element:HTMLElement;pointerId:number}|null>(null),pointerPresent=useRef(true);
  const releaseCapture=()=>{const held=capture.current;capture.current=null;if(held?.element.hasPointerCapture(held.pointerId))held.element.releasePointerCapture(held.pointerId);};
  const cancel=()=>{setActive(null);setTarget(null);};
  const start=(id:string,point?:Point,mode:Mode='add',oldParentId?:string)=>{
    const state=getState(),node=state.doc?.nodes[id];
    if(!node||state.busy||document.querySelector('.modal-backdrop,dialog[open]'))return;
    if(mode!=='child'&&!node.parentId){patchState({notice:'根节点不能添加父节点'});return;}
    try{
      commitDrafts();const element=document.querySelector(`[data-node-id="${CSS.escape(id)}"] .parent-connect-point`),rect=element?.getBoundingClientRect();
      const position=point??(rect?{x:rect.x+rect.width/2,y:rect.y+rect.height/2}:{x:innerWidth/2,y:innerHeight/2});
      window.dispatchEvent(new Event('qingtu-clear-edge-selection'));
      patchState({selectedId:id,editingId:null,titleEditing:null,error:''});initialDrag.current=!!point;pointerRef.current=position;setPointer(position);setTarget(null);setActive({childId:id,docId:state.doc!.id,start:position,mode,oldParentId:oldParentId??node.parentId??''});
    }catch(error){showError(error);}
  };
  useEffect(()=>{
    const begin=(event:Event)=>{
      const {id,point,mode,oldParentId,pointerId}=(event as CustomEvent<{id:string;point?:Point;mode:Mode;oldParentId?:string;pointerId?:number}>).detail;
      start(id,point,mode,oldParentId);pointerPresent.current=true;
      // Capture on the stable shell: the originating node may be culled as we pan.
      const element=document.querySelector<HTMLElement>('.app-shell');
      if(element&&pointerId!==undefined&&!getState().busy){releaseCapture();element.setPointerCapture(pointerId);capture.current={element,pointerId};}
    };
    const key=(event:KeyboardEvent)=>{
      if(event.isComposing)return;
      if(active&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();return;}
      if((event.ctrlKey||event.metaKey)&&event.shiftKey&&!event.altKey&&['KeyL','KeyM'].includes(event.code)){
        if((event.target as Element)?.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('.modal-backdrop,dialog[open]'))return;
        event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;const mode=event.code==='KeyM'?'replace':'child';if(active?.mode===mode)cancel();else if(getState().selectedId)start(getState().selectedId!,undefined,mode);
      }
    };
    const click=(event:MouseEvent)=>{if(performance.now()<suppressClickUntil.current){suppressClickUntil.current=0;event.preventDefault();event.stopImmediatePropagation();}};
    window.addEventListener('qingtu-connect-parent',begin);window.addEventListener('keydown',key,true);window.addEventListener('click',click,true);
    return()=>{window.removeEventListener('qingtu-connect-parent',begin);window.removeEventListener('keydown',key,true);window.removeEventListener('click',click,true);};
  },[active,flow]);
  useEffect(()=>{if(active&&(active.docId!==doc?.id||!doc.nodes[active.childId]||selectedId!==active.childId||editingId||titleEditing||busy))cancel();},[active,doc?.id,doc?.nodes,selectedId,editingId,titleEditing,busy]);
  useEffect(()=>{
    if(!active)return;
    const hit=(event:PointerEvent)=>document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
    const finish=(parent:string)=>{
      const current=getState().doc,child=current?.nodes[active.childId];cancel();suppressClickUntil.current=performance.now()+400;
      if(!current||current.id!==active.docId||!child)return;
      if(active.mode==='child'&&(current.nodes[parent]?.parentId===active.childId||current.nodes[parent]?.extraParentIds?.includes(active.childId))){patchState({notice:'已存在该子节点连接'});return;}
      if(active.mode==='add'&&(parent===child.parentId||child.extraParentIds?.includes(parent))){patchState({notice:'已存在该父节点连接'});return;}
      try{commitDrafts();editDocument(d=>active.mode==='child'?addParentConnection(d,active.childId,parent):active.mode==='replace'?replaceParentConnection(d,active.oldParentId,parent,active.childId):addParentConnection(d,parent,active.childId));}catch(error){showError(error);}
    };
    const move=(event:PointerEvent)=>{
      const held=capture.current;
      if(initialDrag.current&&held){
        if(!(event.buttons&1)){initialDrag.current=false;releaseCapture();cancel();return;}
        // WebView may temporarily lose capture while the left button is held.
        if(!held.element.hasPointerCapture(held.pointerId))held.element.setPointerCapture(held.pointerId);
      }
      pointerPresent.current=true;pointerRef.current={x:event.clientX,y:event.clientY};setPointer(pointerRef.current);const id=hit(event);setTarget(id&&id!==active.childId?id:null);
    };
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;const id=hit(event);if(!id)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(id===active.childId){if((event.target as Element).closest('.parent-connect-point')){cancel();suppressClickUntil.current=performance.now()+400;}else finish(id);}else finish(id);
    };
    const up=(event:PointerEvent)=>{
      if(event.button!==0)return;const id=hit(event);
      if(id&&id!==active.childId){event.preventDefault();event.stopImmediatePropagation();finish(id);}
      else if(initialDrag.current&&Math.hypot(event.clientX-active.start.x,event.clientY-active.start.y)>6){cancel();suppressClickUntil.current=performance.now()+400;}
      initialDrag.current=false;
      releaseCapture();
    };
    const context=(event:MouseEvent)=>{event.preventDefault();cancel();};
    const blur=()=>cancel();
    const leave=()=>{if(!initialDrag.current)pointerPresent.current=false;};
    const lost=(event:PointerEvent)=>{if(initialDrag.current&&!(event.buttons&1)){initialDrag.current=false;cancel();}};
    window.addEventListener('pointermove',move,true);window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',blur);window.addEventListener('blur',blur);window.addEventListener('contextmenu',context,true);
    document.addEventListener('pointerleave',leave);window.addEventListener('lostpointercapture',lost);
    return()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',blur);window.removeEventListener('blur',blur);window.removeEventListener('contextmenu',context,true);document.removeEventListener('pointerleave',leave);window.removeEventListener('lostpointercapture',lost);releaseCapture();};
  },[active,flow]);
  useEffect(()=>{
    if(!active)return;
    let frame=0,last=performance.now();
    const tick=(now:number)=>{
      const bounds=document.querySelector('.react-flow')?.getBoundingClientRect(),point=pointerRef.current,elapsed=Math.min(32,now-last)/1000;last=now;
      // The toolbar and document tabs belong to the upward edge zone too.
      // A held pointer can report negative client Y over the native title bar.
      if(bounds&&pointerPresent.current&&point.x>=bounds.left&&point.x<=bounds.right&&(point.y>=0||initialDrag.current&&!!capture.current)&&point.y<=bounds.bottom){
        const speed=(value:number,min:number,max:number)=>Math.max(-700,Math.min(700,value<min+64?700*(1-(value-min)/64):value>max-64?-700*(1-(max-value)/64):0));
        const dx=speed(point.x,bounds.left,bounds.right)*elapsed,dy=speed(point.y,bounds.top,bounds.bottom)*elapsed;
        if(dx||dy){const view=flow.getViewport();void flow.setViewport({...view,x:view.x+dx,y:view.y+dy},{duration:0});const id=document.elementFromPoint(point.x,point.y)?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;setTarget(id&&id!==active.childId?id:null);}
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[active,flow]);
  useEffect(()=>{
    const element=target?document.querySelector(`[data-node-id="${CSS.escape(target)}"]`):null;element?.classList.add('parent-connect-target');
    return()=>element?.classList.remove('parent-connect-target');
  },[target]);
  if(!active||active.docId!==doc?.id)return null;
  const node=flow.getNode(active.childId);if(!node)return null;
  const from={x:node.position.x+(node.measured?.width??node.initialWidth??160)-21,y:node.position.y};
  // Convert on every viewport update so the preview follows zoom and pan.
  const to=flow.screenToFlowPosition(pointer),bend=Math.max(60,Math.abs(to.x-from.x)*.4);
  return <>
    <ViewportPortal><svg className="parent-connect-preview" aria-hidden="true"><path d={`M ${from.x},${from.y} C ${from.x+bend},${from.y-60} ${to.x-bend},${to.y} ${to.x},${to.y}`}/><circle cx={to.x} cy={to.y} r={5/viewport.zoom}/></svg></ViewportPortal>
    <Panel position="top-center" className="parent-connect-hint">{active.mode!=='child'&&<div className="parent-connect-modes"><button aria-pressed={active.mode==='add'} onClick={()=>setActive({...active,mode:'add'})}>添加父节点</button><button aria-pressed={active.mode==='replace'} onClick={()=>setActive({...active,mode:'replace'})}>更换父节点</button></div>}<span role="status">{active.mode==='child'?`从「${doc.nodes[active.childId]?.title||'未命名节点'}」连接子节点：点击或拖到目标节点；靠近边缘自动平移`:active.mode==='replace'?`将「${doc.nodes[active.oldParentId]?.title||'原父节点'} → ${doc.nodes[active.childId]?.title||'未命名节点'}」改连到：点击新父节点`:`为「${doc.nodes[active.childId]?.title||'未命名节点'}」添加父节点：点击目标节点`}</span><button onClick={cancel}>取消 · Esc</button></Panel>
  </>;
}
