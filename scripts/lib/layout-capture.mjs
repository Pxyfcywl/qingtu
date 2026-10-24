import {sleep} from './native.mjs';
import {createHash} from 'node:crypto';

export function installLayoutObserver(){
 const Original=window.Worker;
 const audit=window.__layoutAudit={request:null,result:null,changes:[],requests:0,imageLoads:0};
 document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement&&event.target.classList.contains('asset-image'))audit.imageLoads++;},true);
 window.Worker=class extends Original{
  constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data.positions)audit.result=event.data;});}
  postMessage(...args){
   const next=args[0];
   if(next?.layout){const previous=audit.request?.layout.nodes??{},changed=Object.entries(next.layout.nodes).filter(([id,n])=>JSON.stringify(previous[id])!==JSON.stringify(n)).map(([id])=>id);audit.changes.push({sequence:next.sequence,changed:changed.slice(0,30),count:changed.length,sizes:changed.slice(0,30).map(id=>({id,before:previous[id]?.size,after:next.layout.nodes[id].size}))});if(audit.changes.length>100)audit.changes.shift();audit.request=next;audit.requests++;}
   return super.postMessage(...args);
  }
 };
}

export function scene(){
 const pane=document.querySelector('.react-flow'),viewport=pane?.querySelector('.react-flow__viewport'),a=window.__layoutAudit;
 if(!pane||!viewport||!a?.request||!a.result)return null;
 const rect=pane.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
 const nodes=[...viewport.querySelectorAll('.react-flow__node')].map(el=>{
  const item=el.querySelector('[data-node-id]'),m=new DOMMatrixReadOnly(getComputedStyle(el).transform),r=el.getBoundingClientRect();
  return {id:item?.getAttribute('data-node-id'),x:m.e,y:m.f,width:r.width/matrix.a,height:r.height/matrix.d,measuredWidth:el.offsetWidth,measuredHeight:el.offsetHeight};
 });
 const edges=[...viewport.querySelectorAll('.react-flow__edge')].map(el=>{const id=el.getAttribute('data-id'),[source,target]=id.split(':');return {id,source,target,d:el.querySelector('.react-flow__edge-path')?.getAttribute('d')};});
 const images=[...viewport.querySelectorAll('img')];
 const complete=a.request.sequence===a.result.sequence&&!viewport.querySelector('.media-placeholder,[data-media-loading=true]')&&images.every(i=>i.complete&&i.naturalWidth>0)&&[...viewport.querySelectorAll('.math-block,.math-inline')].every(e=>e.querySelector('.katex'))&&document.fonts.status==='loaded';
 return {complete,nodes,edges,pane:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},viewport:{x:matrix.e,y:matrix.f,zoom:matrix.a},positions:a.result.positions,layout:a.request.layout,sequence:a.result.sequence,requests:a.requests,error:document.querySelector('[role=alert]')?.textContent??null};
}
const sceneScript=`return (${scene.toString()})();`;
const signature=s=>JSON.stringify({positions:s.positions,layout:s.layout});
export async function stableScene(session,timeout=12000){
 const deadline=Date.now()+timeout;let last='',stable=0;
 while(Date.now()<deadline){const current=await session.execute(sceneScript);if(current?.error)throw Error(current.error);if(current?.complete){const value=signature(current)+'|'+JSON.stringify(current.nodes);stable=value===last?stable+1:0;last=value;if(stable>=2)return current;}else stable=0;await sleep(45);}
 throw Error('Layout/media did not settle before geometry capture');
}

export async function centerWorld(session,devtools,cdpSession,id){
 for(let n=0;n<100;n++){
  const s=await stableScene(session),p=s.positions[id],size=s.layout.nodes[id]?.size;if(!p||!size)throw Error('Target is hidden: '+id);
  const delta={x:s.pane.width/2-s.viewport.x-(p.x+size.width/2)*s.viewport.zoom,y:s.pane.height/2-s.viewport.y-(p.y+size.height/2)*s.viewport.zoom};
  if(Math.abs(delta.x)<2&&Math.abs(delta.y)<2)return s;
  const start={x:Math.round(s.pane.x+s.pane.width/2),y:Math.round(s.pane.y+s.pane.height/2)},end={x:Math.round(start.x+Math.max(-s.pane.width*.4,Math.min(s.pane.width*.4,delta.x))),y:Math.round(start.y+Math.max(-s.pane.height*.4,Math.min(s.pane.height*.4,delta.y)))};
  await devtools.request('Input.dispatchMouseEvent',{type:'mousePressed',button:'middle',buttons:4,clickCount:1,...start},cdpSession);
  await devtools.request('Input.dispatchMouseEvent',{type:'mouseMoved',button:'none',buttons:4,...end},cdpSession);
  await devtools.request('Input.dispatchMouseEvent',{type:'mouseReleased',button:'middle',buttons:0,clickCount:1,...end},cdpSession);
  await sleep(35);
 }
 throw Error('Could not pan to '+id);
}

export async function captureWholeLayout(session,devtools,cdpSession,ids,{maxPasses=4,onProgress}={}){
 const expected=new Set(ids),history=[];let best;
 for(let pass=0;pass<maxPasses;pass++){
  const nodes=new Map(),edges=new Map(),visited=new Set(),observations=[];let firstSignature,invalidated=false,views=0,sequenceStart;
  while(visited.size<expected.size){
   let s=await stableScene(session);const candidates=ids.filter(id=>!visited.has(id));
   const target=candidates.sort((a,b)=>s.positions[a].y-s.positions[b].y||s.positions[a].x-s.positions[b].x)[0];
   s=await centerWorld(session,devtools,cdpSession,target);views++;
   const current=signature(s);if(firstSignature===undefined){firstSignature=current;sequenceStart=s.sequence;}else if(current!==firstSignature)invalidated=true;
   observations.push({target,sequence:s.sequence,layoutSha256:createHash('sha256').update(current).digest('hex'),nodeIds:s.nodes.map(n=>n.id),edgeIds:s.edges.map(e=>e.id)});
   for(const node of s.nodes)if(expected.has(node.id)){nodes.set(node.id,node);visited.add(node.id);}
   for(const edge of s.edges)if(edge.d)edges.set(edge.id,edge);
   if(!visited.has(target))throw Error('Panning did not mount '+target);
   if(views>expected.size)throw Error('Geometry patrol made no coverage progress');
  }
  const final=await stableScene(session);if(signature(final)!==firstSignature)invalidated=true;
  const item={pass:pass+1,views,covered:nodes.size,edges:edges.size,sequenceStart,sequenceEnd:final.sequence,unchangedLayoutAcrossViews:!invalidated};history.push(item);onProgress?.(item);
  best={nodes:[...nodes.values()],edges:[...edges.values()],history,observations,layoutSha256:createHash('sha256').update(signature(final)).digest('hex'),finalScene:{viewport:final.viewport,sequence:final.sequence},complete:!invalidated&&nodes.size===ids.length&&edges.size===ids.length-1};
  if(best.complete)return best;
 }
 best.changes=await session.execute('return window.__layoutAudit.changes;');return best;
}
