import {useEffect,useRef} from 'react';
import {attachDiagram,openDiagram} from './diagram-runtime';
import '../styles-diagrams.css';

export default function DiagramBlock({code}:{code:string}){
  const ref=useRef<HTMLDivElement>(null),close=useRef<(()=>void)|undefined>(undefined);
  useEffect(()=>{const diagram=attachDiagram(ref.current!,code);return()=>diagram.destroy();},[code]);
  useEffect(()=>()=>close.current?.(),[]);
  return <figure className="diagram-block nodrag nopan nowheel">
    <figcaption className="diagram-tools"><span>Mermaid 图表</span><button type="button" onDoubleClick={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();close.current?.();close.current=openDiagram(code);}}>放大图表</button></figcaption>
    <div ref={ref} className="diagram-surface" data-content-loading="true"/>
    <details className="diagram-source"><summary onDoubleClick={event=>event.stopPropagation()}>查看源码</summary><pre data-language="mermaid"><code>{code}</code></pre></details>
  </figure>;
}
