import {diagramOptions} from './diagram-options';

let sequence=0;

export function openDiagram(source:string){
  const dialog=document.createElement('dialog');
  dialog.className='diagram-viewer nodrag nopan nowheel';
  dialog.setAttribute('aria-label','Mermaid 图表预览');
  const tools=document.createElement('div');tools.className='diagram-viewer-tools';
  const title=document.createElement('strong');title.textContent='Mermaid 图表';
  const hint=document.createElement('span');hint.textContent='按住左键拖动 · 滚轮缩放 · Esc 返回';
  const button=(label:string,text:string)=>{
    const element=document.createElement('button');element.type='button';element.textContent=text;
    element.setAttribute('aria-label',label);element.title=label;return element;
  };
  const minus=button('缩小图表','−'),plus=button('放大图表','+'),fitButton=button('适应图表窗口','适应窗口'),close=button('关闭图表预览','关闭');
  const percent=document.createElement('span');percent.className='diagram-viewer-percent';percent.setAttribute('aria-label','图表缩放比例');percent.textContent='—';
  tools.append(title,hint,minus,percent,plus,fitButton,close);
  const stage=document.createElement('div');stage.className='diagram-surface diagram-viewer-stage';
  const content=document.createElement('div');content.className='diagram-viewer-content';
  const loading=document.createElement('div');loading.className='diagram-viewer-message';loading.textContent='正在绘制图表…';
  stage.append(content,loading);dialog.append(tools,stage);document.body.append(dialog);
  let disposed=false,size:{width:number;height:number}|undefined,view={x:0,y:0,zoom:1},changed=false;
  let drag:{id:number;x:number;y:number}|undefined;
  const fitScale=()=>size?Math.min(1,Math.max(1,stage.clientWidth-48)/size.width,Math.max(1,stage.clientHeight-48)/size.height):1;
  const paint=()=>{
    content.style.transform=`translate(-50%,-50%) translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
    percent.textContent=Math.round(view.zoom*100)+'%';
  };
  const fit=()=>{if(!size)return;changed=false;view={x:0,y:0,zoom:fitScale()};paint();};
  const zoomAt=(factor:number,clientX?:number,clientY?:number)=>{
    if(!size)return;
    const rect=stage.getBoundingClientRect(),old=view;
    const zoom=Math.max(Math.min(.05,fitScale()),Math.min(16,old.zoom*factor)),ratio=zoom/old.zoom;
    const x=clientX===undefined?0:clientX-rect.left-rect.width/2,y=clientY===undefined?0:clientY-rect.top-rect.height/2;
    changed=true;view={zoom,x:x-(x-old.x)*ratio,y:y-(y-old.y)*ratio};paint();
  };
  const stopDrag=()=>{
    const previous=drag;drag=undefined;stage.classList.remove('is-dragging');
    if(previous&&stage.hasPointerCapture(previous.id))stage.releasePointerCapture(previous.id);
  };
  stage.addEventListener('pointerdown',event=>{
    if(event.button!==0||!size||drag)return;
    event.preventDefault();stage.setPointerCapture(event.pointerId);drag={id:event.pointerId,x:event.clientX,y:event.clientY};stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    changed=true;view={...view,x:view.x+event.clientX-drag.x,y:view.y+event.clientY-drag.y};
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};paint();
  });
  stage.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)stopDrag();});
  stage.addEventListener('pointercancel',stopDrag);stage.addEventListener('lostpointercapture',stopDrag);
  stage.addEventListener('wheel',event=>{
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
    zoomAt(Math.exp(-Math.max(-500,Math.min(500,delta))*.002),event.clientX,event.clientY);
  },{passive:false});
  minus.onclick=()=>zoomAt(1/1.25);plus.onclick=()=>zoomAt(1.25);fitButton.onclick=fit;
  const observer=new ResizeObserver(()=>{if(!changed)fit();});observer.observe(stage);
  const dispose=()=>{if(disposed)return;disposed=true;stopDrag();observer.disconnect();dialog.close();dialog.remove();};
  close.onclick=dispose;
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dispose();}
  },{capture:true});
  dialog.addEventListener('cancel',event=>{event.preventDefault();dispose();});
  for(const name of ['keydown','pointerdown','pointermove','pointerup','dblclick','wheel'])dialog.addEventListener(name,event=>event.stopPropagation());
  dialog.showModal();close.focus();
  stage.dataset.contentLoading='true';
  void import('pele').then(({render})=>{
    if(disposed)return;
    // Keep the drawing fixed: camera gestures must never trigger a new layout.
    const result=render(source,{...diagramOptions,responsive:false,autoDirection:false,idPrefix:'qingtu-viewer-'+ ++sequence});
    size={width:Math.max(1,result.width),height:Math.max(1,result.height)};
    content.style.width=size.width+'px';content.style.height=size.height+'px';content.innerHTML=result.svg;
    loading.remove();delete stage.dataset.contentLoading;fit();
  }).catch(error=>{
    if(disposed)return;
    loading.textContent=error instanceof Error?error.message:'图表绘制失败，源码仍已保留。';delete stage.dataset.contentLoading;
  });
  return dispose;
}
