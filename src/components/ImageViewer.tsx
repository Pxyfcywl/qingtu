import {useEffect,useRef,useState,useCallback} from 'react';
import {Minus,Plus,X,Maximize} from 'lucide-react';
type View={zoom:number;x:number;y:number};
export default function ImageViewer({url,onClose}:{url:string;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),stage=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0}),[bounds,setBounds]=useState({width:innerWidth,height:innerHeight-56});
  const [view,setView]=useState<View>({zoom:1,x:0,y:0}),current=useRef(view);
  const drag=useRef<{id:number;x:number;y:number}|null>(null),[dragging,setDragging]=useState(false);
  const update=(next:View)=>{current.current=next;setView(next);};
  const fit=size.width?Math.min(Math.max(1,bounds.width-48)/size.width,Math.max(1,bounds.height-48)/size.height):1;
  useEffect(()=>{ref.current?.showModal();const element=stage.current;if(!element)return;const measure=()=>setBounds({width:element.clientWidth,height:element.clientHeight});measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  const zoomAt=useCallback((factor:number,clientX?:number,clientY?:number)=>{
    const rect=stage.current?.getBoundingClientRect();if(!rect)return;
    const old=current.current,zoom=Math.max(Math.min(.1/fit,1),Math.min(Math.max(16/fit,1),old.zoom*factor)),ratio=zoom/old.zoom;
    const x=clientX===undefined?0:clientX-rect.left-rect.width/2,y=clientY===undefined?0:clientY-rect.top-rect.height/2;
    update({zoom,x:x-(x-old.x)*ratio,y:y-(y-old.y)*ratio});
  },[fit]);
  useEffect(()=>{const element=stage.current;if(!element)return;const wheel=(event:WheelEvent)=>{event.preventDefault();event.stopPropagation();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1);zoomAt(Math.exp(-Math.max(-500,Math.min(500,delta))*.002),event.clientX,event.clientY);};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);},[zoomAt]);
  const stopDrag=()=>{drag.current=null;setDragging(false);};
  return <dialog ref={ref} className="image-lightbox image-viewer" aria-label="图片预览" onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>event.stopPropagation()}>
    <div className="image-viewer-tools"><strong>图片预览</strong><span className="image-viewer-hint">滚轮缩放 · 按住左键拖动</span><button aria-label="缩小图片" onClick={()=>zoomAt(1/1.25)}><Minus size={18}/></button><span>{Math.round(fit*view.zoom*100)}%</span><button aria-label="放大图片" onClick={()=>zoomAt(1.25)}><Plus size={18}/></button><button onClick={()=>update({zoom:1/fit,x:0,y:0})}>原始大小</button><button aria-label="适应窗口" onClick={()=>update({zoom:1,x:0,y:0})}><Maximize size={17}/></button><button aria-label="关闭图片预览" onClick={onClose}><X size={22}/></button></div>
    <div ref={stage} className={`image-viewer-stage ${dragging?'is-dragging':''}`} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setDragging(true);}}
      onPointerMove={event=>{const previous=drag.current;if(!previous||previous.id!==event.pointerId)return;const old=current.current;update({...old,x:old.x+event.clientX-previous.x,y:old.y+event.clientY-previous.y});drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};}}
      onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);stopDrag();}} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
      <img src={url} alt="查看原图" draggable={false} style={{width:size.width*fit*view.zoom||undefined,height:size.height*fit*view.zoom||undefined,transform:`translate(-50%,-50%) translate(${view.x}px,${view.y}px)`}} onLoad={event=>{setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});update({zoom:1,x:0,y:0});}}/>
    </div>
  </dialog>;
}
