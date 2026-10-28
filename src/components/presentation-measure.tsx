import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {RichContent} from './RichContent';
import type {RichNode} from '../domain/types';
import {slideSize} from '../domain/presentation';

const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
export function presentationMeasurer(signal:AbortSignal){
  const host=document.createElement('div');host.className='presentation-measure presentation-body';host.style.width=slideSize.bodyWidth+'px';host.setAttribute('aria-hidden','true');host.inert=true;document.body.append(host);
  const root=createRoot(host);let disposed=false,first=true;
  return {
    async measure(body:RichNode){
      signal.throwIfAborted();flushSync(()=>root.render(<RichContent body={body}/>));await frame();
      // Await actual code/diagram rendering and reserved media boxes. Later
      // candidates reuse loaded modules and cached thumbnail resources.
      const deadline=performance.now()+(first?6000:900);first=false;let previous=-1,stable=0;
      do{
        signal.throwIfAborted();await frame();const height=host.getBoundingClientRect().height;
        const loading=!!host.querySelector('[data-content-loading=true],.media-placeholder,[data-media-loading=true]');
        stable=height===previous&&!loading?stable+1:0;previous=height;
        if(stable>=2)break;
      }while(performance.now()<deadline);
      await document.fonts.ready;signal.throwIfAborted();
      return Math.ceil(host.getBoundingClientRect().height);
    },
    dispose(){if(disposed)return;disposed=true;root.unmount();host.remove();},
  };
}
