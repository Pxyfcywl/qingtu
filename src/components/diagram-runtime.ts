import type {Mounted} from 'pele';

export const isMermaid=(language?:string|null)=>language?.trim().toLowerCase()==='mermaid';

// One bundled engine for reading, editing, and export. No remote rendering.
export function attachDiagram(container:HTMLElement,source:string,zoom=false){
  let disposed=false,mounted:Mounted|undefined,latest=source;
  container.dataset.contentLoading='true';
  container.textContent='正在绘制图表…';
  const ready=import('pele').then(({mount})=>{
    if(disposed)return;
    container.replaceChildren();
    mounted=mount(container,latest,{zoom,links:false,images:false,fontFamily:'"Microsoft YaHei", sans-serif',limit:20000,maxEdges:1000});
    delete container.dataset.contentLoading;
  }).catch(()=>{
    if(disposed)return;
    delete container.dataset.contentLoading;
    container.textContent='图表引擎加载失败，请重新打开卡片；图表源码仍已保留。';
  });
  return {
    ready,
    update(value:string){latest=value;mounted?.update(value);},
    zoomBy(factor:number){mounted?.zoom?.zoomBy(factor);},
    destroy(){disposed=true;mounted?.destroy();delete container.dataset.contentLoading;},
  };
}

export function openDiagram(source:string){
  const dialog=document.createElement('dialog');
  dialog.className='diagram-viewer nodrag nopan nowheel';
  dialog.setAttribute('aria-label','Mermaid 图表预览');
  const tools=document.createElement('div');tools.className='diagram-viewer-tools';
  const title=document.createElement('strong');title.textContent='Mermaid 图表';
  const hint=document.createElement('span');hint.textContent='滚轮缩放 · 拖动平移 · Esc 返回';
  const close=document.createElement('button');close.type='button';close.textContent='关闭';close.setAttribute('aria-label','关闭图表预览');
  tools.append(title,hint,close);
  const stage=document.createElement('div');stage.className='diagram-surface diagram-viewer-stage';
  dialog.append(tools,stage);document.body.append(dialog);
  const diagram=attachDiagram(stage,source,true);
  // Pele reserves its own wheel handler for Ctrl/pinch. In this dedicated
  // viewer, ordinary wheel gestures can zoom without moving the main canvas.
  stage.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey)return;
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
    diagram.zoomBy(Math.exp(-Math.max(-500,Math.min(500,delta))*.002));
  },{passive:false});
  const dispose=()=>{diagram.destroy();dialog.close();dialog.remove();};
  close.onclick=dispose;
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dispose();}
  },{capture:true});
  dialog.addEventListener('cancel',event=>{event.preventDefault();dispose();});
  for(const name of ['keydown','pointerdown','dblclick','wheel'])dialog.addEventListener(name,event=>event.stopPropagation());
  dialog.showModal();close.focus();
  return dispose;
}
