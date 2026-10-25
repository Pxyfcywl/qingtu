export async function checkDiagramZoom(session,check){
 const selector='.diagram-viewer svg.pele';
 const before=await session.execute('return document.querySelector(arguments[0]).getAttribute("viewBox");',[selector]);
 const point=await session.execute('const r=document.querySelector(".diagram-viewer-stage").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};');
 await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'wheel',id:'diagramWheel',actions:[{type:'scroll',origin:'viewport',...point,deltaX:0,deltaY:-300,duration:200}]}]});
 await session.waitFor('return document.querySelector(arguments[0]).getAttribute("viewBox")!==arguments[1];',[selector,before]);
 check(true,'普通鼠标滚轮缩放图表，无需 Ctrl');
 const zoomed=await session.execute('return document.querySelector(arguments[0]).getAttribute("viewBox");',[selector]);
 await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'diagramMouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',...point,duration:80},{type:'pointerDown',button:0},{type:'pointerMove',origin:'viewport',x:point.x+100,y:point.y+60,duration:200},{type:'pointerUp',button:0}]}]});
 await session.waitFor('return document.querySelector(arguments[0]).getAttribute("viewBox")!==arguments[1];',[selector,zoomed]);
 check(true,'图表放大后按住左键拖动平移');
}

export async function installDiagramExportAudit(session){
 await session.execute('const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){const pixels=this.getContext("2d").getImageData(0,0,this.width,this.height).data;let themed=0;for(let i=0;i<pixels.length;i+=16)if(pixels[i]===66&&pixels[i+1]===168&&pixels[i+2]===146&&pixels[i+3]===255)themed++;window.__diagramExportThemedPixels=themed;return original.apply(this,args);};');
}
