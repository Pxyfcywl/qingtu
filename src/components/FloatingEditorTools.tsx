import {useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {useViewport} from '@xyflow/react';
export default function FloatingEditorTools({id,children}:{id:string;children:React.ReactNode}){
  const viewport=useViewport(),[position,setPosition]=useState<{top:number;left:number;width:number}|null>(null);
  useLayoutEffect(()=>{
    const update=()=>{const pane=document.querySelector('.react-flow')?.getBoundingClientRect(),node=document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();if(!pane||!node)return;const width=Math.min(560,pane.width-110);setPosition({top:pane.top+12,left:Math.max(pane.left+80,Math.min(node.left,pane.right-width-16)),width});};
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);
  },[id,viewport.x,viewport.y,viewport.zoom]);
  return position?createPortal(<div className="editor-tools floating-editor-tools" style={position} aria-label="正文格式工具栏" onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>{if(!(event.target instanceof HTMLSelectElement))event.preventDefault();}}>{children}</div>,document.body):null;
}
