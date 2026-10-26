import type {Mounted} from 'pele';
import {diagramOptions} from './diagram-options';
export {openDiagram} from './DiagramViewer';

export const isMermaid=(language?:string|null)=>language?.trim().toLowerCase()==='mermaid';

// One bundled engine for reading, editing, and export. No remote rendering.
export function attachDiagram(container:HTMLElement,source:string){
  let disposed=false,mounted:Mounted|undefined,latest=source;
  container.dataset.contentLoading='true';
  container.textContent='正在绘制图表…';
  const ready=import('pele').then(({mount})=>{
    if(disposed)return;
    container.replaceChildren();
    mounted=mount(container,latest,{...diagramOptions,zoom:false});
    delete container.dataset.contentLoading;
  }).catch(()=>{
    if(disposed)return;
    delete container.dataset.contentLoading;
    container.textContent='图表引擎加载失败，请重新打开卡片；图表源码仍已保留。';
  });
  return {
    ready,
    update(value:string){latest=value;mounted?.update(value);},
    destroy(){disposed=true;mounted?.destroy();delete container.dataset.contentLoading;},
  };
}

