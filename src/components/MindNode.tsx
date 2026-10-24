import { lazy,Suspense,memo,useRef,useEffect,useLayoutEffect,useState } from 'react';
import { Handle,Position,NodeResizer,type NodeProps,type Node } from '@xyflow/react';
import { ChevronDown,ChevronUp,GraduationCap,BookOpen,Triangle,Plus,Image as ImageIcon,Film,Sigma,List } from 'lucide-react';
import type { MindNode as Item } from '../domain/types';
import { editDocument,getState,patchState,useAppValue,showError } from '../state';
import { registerDraft,commitDrafts,recordBodyEditPoint } from '../editing';
import { RichContent } from './RichContent';
import { EmptyImage,ImageAsset,VideoAsset } from './Media';
import {beginChildConnection} from './ParentConnector';
const BodyEditor=lazy(()=>import('./Editor'));
export type FlowNode = Node<{item:Item;root:boolean;direction:'left'|'right';count:number;onMedia:(id:string)=>void},'mind'>;

export const MindNode=memo(function MindNode({data,selected}:NodeProps<FlowNode>) {
  const {item,root,direction,count,onMedia}=data;
  const editing=useAppValue(s=>s.editingId===item.id);
  const titleEditing=useAppValue(s=>s.titleEditing===item.id);
  const exporting=useAppValue(s=>s.busy==='正在生成导图图片…');
  const [title,setTitle]=useState(item.title);
  const [editingHeight,setEditingHeight]=useState(0);
  const [loadingHeight,setLoadingHeight]=useState(0),[editingScroll,setEditingScroll]=useState(0);
  const bodyRef=useRef<HTMLDivElement>(null),bodyScroll=useRef(0);
  useLayoutEffect(()=>{if(!exporting&&bodyRef.current)bodyRef.current.scrollTop=bodyScroll.current;},[editing,item.contentCollapsed,exporting]);
  const titleDraft=useRef(item.title);
  const composing=useRef(false);const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{setTitle(item.title);titleDraft.current=item.title;},[item.title]);
  useEffect(()=>{if(titleEditing)input.current?.select();},[titleEditing]);
  const persistTitle=(value:string)=>editDocument(doc=>{if(doc.nodes[item.id]){doc.nodes[item.id].title=value;if(root)doc.title=value||'未命名思维导图';}},{group:'title:'+item.id});
  useEffect(()=>{if(titleEditing)return registerDraft('title:'+item.id,{commit:()=>persistTitle(titleDraft.current),composing:()=>composing.current});},[titleEditing,item.id,root]);
  const commitTitle=()=>{
    if(composing.current)return;
    persistTitle(titleDraft.current);
    patchState({titleEditing:null});
  };
  const toggleBody=()=>{
    const active=document.activeElement as HTMLElement|null;
    if(active?.closest('input,textarea,[contenteditable="true"]'))active.blur();
    try{commitDrafts();}catch(error){showError(error);return;}
    patchState({selectedId:item.id,editingId:null});editDocument(doc=>{doc.nodes[item.id].contentCollapsed=!item.contentCollapsed;});
  };
  const toggleChildren=()=>{
    try{commitDrafts();}catch(error){showError(error);return;}
    patchState({selectedId:item.id,editingId:null});
    editDocument(doc=>{doc.nodes[item.id].childrenCollapsed=!item.childrenCollapsed;});
  };
  const beginBodyEditing=(point?:{x:number;y:number})=>{try{commitDrafts();const pane=bodyRef.current;setEditingHeight(pane?.offsetHeight??0);setLoadingHeight(pane?.scrollHeight??0);setEditingScroll(pane?.scrollTop??0);if(point)recordBodyEditPoint(item.id,point);patchState({selectedId:item.id,editingId:item.id,titleEditing:null});}catch(error){showError(error);}};
  const label=<>{root?<GraduationCap size={30}/>:item.kind==='card'?<Triangle size={21}/>:item.parentId===getState().doc?.rootId?<BookOpen size={19}/>:null}
    {titleEditing?<input ref={input} className="node-title-input nodrag nopan" aria-label="节点标题" value={title} onChange={e=>{titleDraft.current=e.target.value;setTitle(e.target.value);if(!composing.current)persistTitle(e.target.value);}} onCompositionStart={()=>composing.current=true} onCompositionEnd={e=>{composing.current=false;titleDraft.current=e.currentTarget.value;setTitle(e.currentTarget.value);persistTitle(e.currentTarget.value);}}
      onBlur={commitTitle} onKeyDown={e=>{if(!((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'))e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent.isComposing)commitTitle();if(e.key==='Escape'&&!e.nativeEvent.isComposing){persistTitle(titleDraft.current);patchState({titleEditing:null});}}}/>:<span className="node-label" onDoubleClick={e=>{e.stopPropagation();try{commitDrafts();patchState({titleEditing:item.id,editingId:null});}catch(error){showError(error);}}}>{item.title||'未命名'}</span>}</>;
  return <article className={`mind-node node-${item.kind} color-${item.color} ${root?'root-node':''} ${selected?'is-selected':''} ${editing?'is-editing':''}`}
    style={{width:item.kind==='card'?item.preferredWidth??432:item.kind==='text'?undefined:item.preferredWidth??280}} data-node-id={item.id}
    onKeyDown={event=>{if(!event.ctrlKey&&!event.metaKey&&(event.target as HTMLElement).closest('button,a,input,select,textarea,video,audio,[contenteditable="true"]'))event.stopPropagation();}}>
    {item.kind!=='text'&&<NodeResizer isVisible={!!selected&&!editing} minWidth={item.kind==='card'?240:160} maxWidth={640} minHeight={item.contentCollapsed?56:120}
      shouldResize={(_,params)=>params.width>=160} onResizeEnd={(_,params)=>editDocument(doc=>{doc.nodes[item.id].preferredWidth=params.width;})}/>} 
    {!root&&<Handle type="target" position={direction==='left'?Position.Right:Position.Left} className="node-handle" id="in"/>}
    <Handle type="source" position={Position.Right} className="node-handle" id="right"/>
    {root&&<Handle type="source" position={Position.Left} className="node-handle" id="left"/>}
    {!root&&direction==='left'&&<Handle type="source" position={Position.Left} className="node-handle" id="left"/>}
    {selected&&!editing&&!titleEditing&&<button className="parent-connect-point nodrag nopan" aria-label="连接到子节点" title="拖到已有子节点，或点击后选择子节点 · Ctrl+Shift+L；靠近画布边缘自动平移" onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();beginChildConnection(item.id,event);}} onClick={event=>{event.preventDefault();event.stopPropagation();if(event.detail===0)beginChildConnection(item.id,{clientX:event.currentTarget.getBoundingClientRect().x+9,clientY:event.currentTarget.getBoundingClientRect().y+9});}}><span/></button>}
    {item.kind==='text'&&<div className="text-node drag-handle">{label}</div>}
    {item.kind==='card'&&<>
      <header className="card-header drag-handle">{label}<button className="body-toggle nodrag" onClick={event=>{event.stopPropagation();toggleBody();}} aria-label={item.contentCollapsed?'展开正文':'收起正文'} aria-expanded={!item.contentCollapsed} title="仅展开或收起卡片正文">{item.contentCollapsed?<ChevronDown size={19}/>:<ChevronUp size={19}/>}</button></header>
      {!item.contentCollapsed&&<div ref={bodyRef} className="card-body nodrag nowheel nopan" style={editing?{minHeight:`min(${editingHeight}px,clamp(220px,60vh,560px))`}:undefined} onScroll={event=>{if(!exporting)bodyScroll.current=event.currentTarget.scrollTop;}} onDoubleClick={event=>{event.stopPropagation();if(!editing)beginBodyEditing({x:event.clientX,y:event.clientY});}}>
        {editing?<Suspense fallback={<div className="editor-loading" style={{minHeight:loadingHeight}}>正在打开编辑器…</div>}><BodyEditor id={item.id} body={item.body} scrollTop={editingScroll}/></Suspense>:<RichContent body={item.body}/>}
        {!editing&&<footer className="card-insert-tools"><button title="编辑正文" aria-label="编辑卡片正文" onClick={event=>{event.stopPropagation();beginBodyEditing();}}><ImageIcon size={17}/><Film size={17}/><Sigma size={18}/><List size={18}/><span>双击编辑</span></button></footer>}
      </div>}
    </>}
    {item.kind==='image'&&(item.assetId?<ImageAsset id={item.assetId} alt={item.altText??'图片节点'} onOpen={url=>patchState({notice:'image:'+url})}/>:<EmptyImage onAdd={()=>onMedia(item.id)}/>)}
    {item.kind==='video'&&<VideoAsset id={item.assetId} onAdd={()=>onMedia(item.id)}/>}
    {count>0&&<button className={`branch-toggle nodrag side-${direction}`} onClick={event=>{event.stopPropagation();toggleChildren();}} aria-label={item.childrenCollapsed?`展开 ${count} 个后代`:'收起所有子分支'} aria-expanded={!item.childrenCollapsed} title={item.childrenCollapsed?`展开 ${count} 个隐藏后代`:'折叠所有后代节点'}>{item.childrenCollapsed?<span>+{count}</span>:<span className="minus-mark"/>}</button>}
    {selected&&!editing&&<button className={`quick-add nodrag side-${direction}`} aria-label="添加子节点" title="添加子节点 Tab" onClick={event=>{event.stopPropagation();window.dispatchEvent(new CustomEvent('qingtu-add-child',{detail:item.id}));}}><Plus size={14}/></button>}
  </article>;
});
