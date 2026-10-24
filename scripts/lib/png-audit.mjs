// Observation only: preserve the arguments and result of drawImage/toBlob.
export function installPngAudit(){
 const draw=CanvasRenderingContext2D.prototype.drawImage,blob=HTMLCanvasElement.prototype.toBlob;
 window.__pngAudit={calls:[],svg:null};
 CanvasRenderingContext2D.prototype.drawImage=function(...args){
  const image=args[0];
  if(document.querySelector('.react-flow__viewport.exporting')&&image instanceof HTMLImageElement&&image.src.startsWith('data:image/svg+xml')){
   const uri=image.src,comma=uri.indexOf(',');
   const xml=uri.slice(0,comma).includes(';base64')?atob(uri.slice(comma+1)):decodeURIComponent(uri.slice(comma+1));
   const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
   window.__pngAudit.svg={parseError:!!doc.querySelector('parsererror'),nodes:[...doc.querySelectorAll('[data-node-id]')].map(e=>({id:e.getAttribute('data-node-id'),text:e.textContent})),edges:doc.querySelectorAll('.react-flow__edge-path').length,formulas:doc.querySelectorAll('.katex').length,images:[...doc.querySelectorAll('img')].map(e=>({embedded:e.getAttribute('src')?.startsWith('data:image/'),alt:e.getAttribute('alt')})),fontFaces:(xml.match(/@font-face/g)||[]).length};
  }
  return draw.apply(this,args);
 };
 HTMLCanvasElement.prototype.toBlob=function(...args){
  const viewport=document.querySelector('.react-flow__viewport.exporting');
  if(viewport){
   const nodes=[...viewport.querySelectorAll('.react-flow__node')].map(e=>{const matrix=new DOMMatrixReadOnly(getComputedStyle(e).transform),item=e.querySelector('[data-node-id]');return {id:item?.getAttribute('data-node-id'),x:matrix.e,y:matrix.f,width:e.offsetWidth,height:e.offsetHeight,title:item?.querySelector('.node-label')?.textContent,formulas:item?.querySelectorAll('.katex').length,images:[...item.querySelectorAll('img')].map(i=>({complete:i.complete,width:i.naturalWidth,height:i.naturalHeight}))};});
   const edges=[...viewport.querySelectorAll('.react-flow__edge')].map(e=>({id:e.getAttribute('data-id'),d:e.querySelector('.react-flow__edge-path')?.getAttribute('d')}));
   const ctx=this.getContext('2d'),stride=Math.max(1,Math.floor(Math.max(this.width,this.height)/1024));let dark=0,sampled=0;
   for(let y=0;y<this.height;y+=stride){const row=ctx.getImageData(0,y,this.width,1).data;for(let x=0;x<this.width;x+=stride){const p=x*4;sampled++;if(row[p+3]>128&&Math.min(row[p],row[p+1],row[p+2])<210)dark++;}}
   window.__pngAudit.calls.push({width:this.width,height:this.height,nodes,edges,formulaErrors:viewport.querySelectorAll('.katex-error').length,liveVideos:viewport.querySelectorAll('video[src]').length,editors:viewport.querySelectorAll('[contenteditable=true],input').length,fontsReady:document.fonts.status,pixels:{dark,sampled},svg:window.__pngAudit.svg});
  }
  return blob.apply(this,args);
 };
}

export function visibleModel(doc){
 const result=[],visit=id=>{const item=doc.nodes[id];if(!item)throw Error('Missing fixture node '+id);result.push(item);if(!item.childrenCollapsed)item.childIds.forEach(visit);};visit(doc.rootId);return result;
}
export function expectedContents(nodes,assets){
 const metadata=new Map(assets.map(a=>[a.id,a]));let images=0,formulas=0,videos=0;
 const video=id=>{videos++;if(metadata.get(id)?.thumbnailPath)images++;};
 const body=n=>{if(n.type==='assetImage')images++;if(n.type==='video')video(n.attrs?.assetId);if(['mathBlock','mathInline'].includes(n.type))formulas++;n.content?.forEach(body);};
 for(const n of nodes){if(n.kind==='card'&&!n.contentCollapsed)body(n.body);if(n.kind==='image'&&n.assetId)images++;if(n.kind==='video'&&n.assetId)video(n.assetId);}
 return {images,formulas,videos};
}

export function outputDimensions(nodes){
 const x=Math.min(...nodes.map(n=>n.x)),y=Math.min(...nodes.map(n=>n.y));
 const right=Math.max(...nodes.map(n=>n.x+n.width)),bottom=Math.max(...nodes.map(n=>n.y+n.height));
 const width=Math.ceil(right-x+80),height=Math.ceil(bottom-y+80),ratio=Math.min(2,8192/Math.max(width,height));
 return {x,y,width,height,ratio,pixelWidth:Math.floor(width*ratio),pixelHeight:Math.floor(height*ratio),downscaled:ratio<2};
}
