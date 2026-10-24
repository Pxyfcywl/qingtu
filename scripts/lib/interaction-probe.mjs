// Runs only in the test page. DOM/rAF timestamps are proxies until checked
// against Windows presentation events; they are never a formal display gate.
export function installInteractionProbe(readScene){
 let pending=null,result=null;
 const correct=p=>{
  const node=document.querySelector(`[data-node-id="${CSS.escape(p.id)}"]`);
  if(!node)return false;
  if(p.kind==='select')return node.classList.contains('is-selected');
  return node.querySelector('.body-toggle')?.getAttribute('aria-expanded')===String(p.expected)&&!!node.querySelector('.card-body')===p.expected;
 };
 const observer=new MutationObserver(()=>{const p=pending;if(p?.started!==undefined&&p.domMs===null&&correct(p))p.domMs=performance.now()-p.started;});
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-expanded']});
 const finish=(p,error)=>{
  if(pending!==p)return;
  clearTimeout(p.timeout);pending=null;
  result={kind:p.kind,id:p.id,trusted:p.trusted,startMs:p.started,pointerTimeStamp:p.pointerTimeStamp,clickMs:p.clickMs,domMs:p.domMs,firstFrameMs:p.firstFrameMs,settledFrameMs:p.settledFrameMs,startSequence:p.sequence,endSequence:p.endSequence,observedFrames:p.frames,error:error??null,visibility:document.visibilityState,focused:document.hasFocus()};
 };
 const frame=p=>{
  if(pending!==p)return;p.frames++;
  try{
   if(document.visibilityState!=='visible'||!document.hasFocus())throw Error('Measurement window not visible and focused');
   const now=performance.now();
   if(correct(p)&&p.firstFrameMs===null)p.firstFrameMs=now-p.started;
   const s=readScene();if(s?.error)throw Error(s.error);
   const afterRequest=p.kind==='select'||s?.sequence>p.sequence;
   if(correct(p)&&s?.complete&&afterRequest){
    const signature=JSON.stringify({sequence:s.sequence,positions:s.positions,nodes:s.nodes});
    p.stable=signature===p.signature?p.stable+1:0;p.signature=signature;
    if(p.stable>=2){p.settledFrameMs=performance.now()-p.started;p.endSequence=s.sequence;finish(p);return;}
   }else p.stable=0;
   requestAnimationFrame(()=>frame(p));
  }catch(error){finish(p,String(error));}
 };
 const down=e=>{
  const p=pending;if(!p||p.started!==undefined||!(e.target instanceof Element)||!e.target.closest(p.selector))return;
  p.started=performance.now();p.pointerTimeStamp=e.timeStamp;p.trusted=e.isTrusted;
  if(!e.isTrusted)finish(p,'Untrusted pointer event');
 };
 const click=e=>{
  const p=pending;if(!p||p.started===undefined||p.clickMs!==null||!(e.target instanceof Element)||!e.target.closest(p.selector))return;
  p.clickMs=performance.now()-p.started;requestAnimationFrame(()=>frame(p));
 };
 document.addEventListener('pointerdown',down,true);document.addEventListener('click',click,true);
 window.__interactionProbe={
  arm(options){
   if(pending)throw Error('Previous measurement still active');
   if(!['select','fold'].includes(options.kind))throw Error('Unknown interaction');
   const s=readScene();if(!s?.complete)throw Error('Layout not ready before arming');
   const node=document.querySelector(options.selector);if(!node)throw Error('Missing target');
   const rect=node.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   if(rect.width<=0||rect.height<=0||x<0||x>=innerWidth||y<0||y>=innerHeight||!node.contains(document.elementFromPoint(x,y)))throw Error('Target center not hit-testable');
   result=null;const p={...options,sequence:s.sequence,clickMs:null,domMs:null,firstFrameMs:null,settledFrameMs:null,signature:null,stable:0,frames:0};
   if(correct(p))throw Error('Interaction outcome already true before input');
   pending=p;p.timeout=setTimeout(()=>finish(p,'Interaction measurement timed out'),10000);
   return {x,y};
  },
  read:()=>result,
  close(){if(pending)finish(pending,'Probe closed');observer.disconnect();document.removeEventListener('pointerdown',down,true);document.removeEventListener('click',click,true);}
 };
}
