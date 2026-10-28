import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ListTree,Maximize,Minimize,X,Expand} from 'lucide-react';
import type {RichNode} from '../domain/types';
import {paginatePresentation,presentationSections,slideSize,type PresentationPage} from '../domain/presentation';
import {presentationMeasurer} from './presentation-measure';
import {RichContent} from './RichContent';
import '../styles-presentation.css';

function ExpandedContent({page,onClose}:{page:PresentationPage;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useLayoutEffect(()=>{const dialog=ref.current!,previous=document.activeElement as HTMLElement|null;dialog.showModal();return()=>{dialog.close();if(previous?.isConnected)previous.focus();};},[]);
  return <dialog ref={ref} className="presentation-expanded" aria-label="完整演示内容" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}} onKeyDown={event=>event.stopPropagation()}><header><strong>{page.title}</strong><button onClick={onClose}><X size={18}/>返回演示</button></header><div className="presentation-expanded-body"><RichContent body={page.body}/></div></dialog>;
}
export default function MarkdownPresentation({body,title,documentTitle,onClose}:{body:RichNode;title:string;documentTitle:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),stage=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
  const navigationAnchor=useRef<HTMLButtonElement>(null);
  const [pages,setPages]=useState<PresentationPage[]>([]),[current,setCurrent]=useState(0),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const [outline,setOutline]=useState(()=>window.innerWidth>=1100),[scale,setScale]=useState(.7),[controls,setControls]=useState(true),[expanded,setExpanded]=useState(false),[overflow,setOverflow]=useState(false),[fullscreen,setFullscreen]=useState(()=>!!document.fullscreenElement);
  const ownsFullscreen=useRef(false);
  const hideTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const sections=useMemo(()=>presentationSections(body,title),[body,title]);
  const page=pages[current];
  const reveal=()=>{setControls(true);if(hideTimer.current)clearTimeout(hideTimer.current);hideTimer.current=setTimeout(()=>setControls(false),2200);};
  const go=(index:number)=>{setCurrent(Math.max(0,Math.min(pages.length-1,index)));navigationAnchor.current?.focus({preventScroll:true});reveal();};
  useEffect(()=>{
    const target=dialog.current!,previous=document.activeElement as HTMLElement|null;target.showModal();
    const resize=()=>{if(innerWidth<1100)setOutline(false);};window.addEventListener('resize',resize);
    const fullscreenChange=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',fullscreenChange);
    return()=>{window.removeEventListener('resize',resize);document.removeEventListener('fullscreenchange',fullscreenChange);if(hideTimer.current)clearTimeout(hideTimer.current);if(ownsFullscreen.current&&document.fullscreenElement)void document.exitFullscreen().catch(()=>{});target.close();previous?.focus();};
  },[]);
  useEffect(()=>{
    const controller=new AbortController(),measure=presentationMeasurer(controller.signal);setPages([]);setError('');
    void Promise.resolve().then(()=>paginatePresentation(sections,measure.measure,controller.signal,setProgress)).then(value=>{if(!controller.signal.aborted){setPages(value);setCurrent(0);}}).catch(reason=>{if(!controller.signal.aborted)setError(String(reason).replace(/^Error:\s*/,''));}).finally(()=>measure.dispose());
    return()=>controller.abort();
  },[sections]);
  useLayoutEffect(()=>{
    const target=stage.current;if(!target)return;
    const resize=()=>setScale(Math.max(.1,Math.min((target.clientWidth-40)/slideSize.width,(target.clientHeight-64)/slideSize.height)));
    const observer=new ResizeObserver(resize);observer.observe(target);resize();return()=>observer.disconnect();
  },[outline,pages.length]);
  useEffect(()=>{
    const target=content.current;if(!target)return;let frame=0;
    const inspect=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setOverflow(target.scrollHeight>target.clientHeight+2||target.scrollWidth>target.clientWidth+2||!!Array.from(target.querySelectorAll<HTMLElement>('.math-block,.tableWrapper,pre')).find(element=>element.scrollWidth>element.clientWidth+2)));};
    const observer=new ResizeObserver(inspect),mutation=new MutationObserver(inspect);observer.observe(target);if(target.firstElementChild)observer.observe(target.firstElementChild);mutation.observe(target,{subtree:true,childList:true,attributes:true});inspect();target.scrollTop=0;
    return()=>{observer.disconnect();mutation.disconnect();cancelAnimationFrame(frame);};
  },[page]);
  const toggleFullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();ownsFullscreen.current=false;}else{await document.documentElement.requestFullscreen();ownsFullscreen.current=true;}}catch{setError('当前窗口无法进入系统全屏，可继续在演示窗口播放');}};
  return <dialog ref={dialog} className="markdown-presentation" aria-label="Markdown 演示" onCancel={event=>{event.preventDefault();onClose();}} onPointerMove={reveal} onFocusCapture={reveal} onKeyDown={event=>{
    event.stopPropagation();if(event.nativeEvent.isComposing||event.ctrlKey||event.metaKey||event.altKey||document.activeElement?.closest('video,input,textarea,select,[contenteditable=true]'))return;
    if(['ArrowRight','PageDown',' ','ArrowDown'].includes(event.key)){event.preventDefault();go(current+1);}
    else if(['ArrowLeft','PageUp','ArrowUp'].includes(event.key)){event.preventDefault();go(current-1);}
    else if(event.key==='Home'){event.preventDefault();go(0);}else if(event.key==='End'){event.preventDefault();go(pages.length-1);}
  }}>
    <div className="presentation-shell">
      <header className="presentation-topbar"><strong>轻图 · 演示</strong><span>{title}</span><div><button ref={navigationAnchor} aria-label="切换演示目录" aria-pressed={outline} onClick={()=>setOutline(!outline)}><ListTree size={17}/></button><button onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize size={17}/>:<Maximize size={17}/>}<span>{fullscreen?'退出全屏':'全屏'}</span></button><button onClick={onClose}><X size={18}/>退出演示</button></div></header>
      <div className={`presentation-layout ${outline?'with-directory':''}`}>
        {outline&&<aside className="presentation-directory" aria-label="演示目录"><h2>演示目录</h2>{pages.map((entry,index)=><button key={index} className={index===current?'is-current':''} aria-current={index===current?'page':undefined} onClick={()=>{go(index);if(innerWidth<1100)setOutline(false);}}><small>{String(index+1).padStart(2,'0')}</small><span><em>{entry.trail.at(-1)||documentTitle}</em><strong>{entry.title}{entry.continuation?'（续）':''}</strong><i className="presentation-thumbnail-lines"/></span></button>)}</aside>}
        <div ref={stage} className="presentation-stage">
          {!page?<div className="presentation-loading" role="status">{error||`正在排版${progress?' · 已完成 '+progress+' 页':'…'}`}</div>:<div className="presentation-page-frame" style={{width:slideSize.width*scale,height:slideSize.height*scale}}>
            <article className="presentation-slide" aria-label={`演示第 ${current+1} 页`} style={{transform:`scale(${scale})`}} data-page={current+1} data-oversize={page.oversize||overflow}>
              <div className="presentation-slide-context"><span title={[documentTitle,...page.trail].join(' / ')}>{[documentTitle,...page.trail].filter((value,index,array)=>value&&array.indexOf(value)===index).join(' / ')}</span><span>{String(current+1).padStart(2,'0')} / {String(pages.length).padStart(2,'0')}</span></div>
              <div className="presentation-slide-heading"><h1 title={page.title} style={{fontSize:page.title.length>44?32:44}}>{page.title}</h1>{page.continuation>0&&<span className="presentation-continuation">续页</span>}{(page.oversize||overflow)&&<button className="presentation-expand" onClick={()=>setExpanded(true)}><Expand size={17}/>展开长内容</button>}</div>
              <div ref={content} className="presentation-body presentation-slide-body" key={current}><RichContent body={page.body}/></div>
              <div className="presentation-next">{pages[current+1]?`下一页：${[...pages[current+1].trail,pages[current+1].title].join(' · ')}${pages[current+1].continuation?'（续）':''}`:'演示结束'}</div>
            </article>
          </div>}
          {page&&<nav className="presentation-controls" aria-label="演示翻页" data-hidden={!controls}><button aria-label="上一页" disabled={current===0} onClick={()=>go(current-1)}><ArrowLeft size={19}/></button><button onClick={()=>setOutline(!outline)}>目录</button><span aria-live="polite">{current+1} / {pages.length}</span><button aria-label="下一页" disabled={current===pages.length-1} onClick={()=>go(current+1)}><ArrowRight size={19}/></button></nav>}
        </div>
      </div>
      {error&&page&&<div className="presentation-message" role="status">{error}</div>}
    </div>
    {expanded&&page&&<ExpandedContent page={page} onClose={()=>setExpanded(false)}/>}
  </dialog>;
}
