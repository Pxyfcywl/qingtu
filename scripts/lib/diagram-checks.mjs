export async function checkDiagramZoom(session,check,shot){
 const svg='.diagram-viewer svg.pele',node=svg+' [data-id="A"]';
 const box=selector=>session.execute('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};',[selector]);
 const drag=async(point,dx,dy)=>session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'diagramMouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',x:Math.round(point.x),y:Math.round(point.y),duration:80},{type:'pointerDown',button:0},{type:'pointerMove',origin:'viewport',x:Math.round(point.x+dx),y:Math.round(point.y+dy),duration:200},{type:'pointerUp',button:0}]}]});
 const moved=(before,after,dx,dy)=>Math.abs(after.x-before.x-dx)<2&&Math.abs(after.y-before.y-dy)<2;
 const initial=await box(node),stage=await box('.diagram-viewer-stage');
 await drag({x:initial.x+initial.width/2,y:initial.y+initial.height/2},120,70);
 let current=await box(node);check(moved(initial,current,120,70),'初次打开无需先缩放，拖动图形后节点实际移动 120×70 像素');
 if(shot)await shot('图表直接拖动后.png');
 const blank={x:stage.x+stage.width/2,y:stage.y+stage.height*.75};
 await drag(blank,-80,-50);const fromBlank=await box(node);check(moved(current,fromBlank,-80,-50),'拖动空白区域也可平移图表，节点实际移动 -80×-50 像素');
 const oldSvg=await box(svg);
 await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'wheel',id:'diagramWheel',actions:[{type:'scroll',origin:'viewport',x:Math.round(blank.x),y:Math.round(blank.y),deltaX:0,deltaY:-300,duration:200}]}]});
 check((await box(svg)).width>oldSvg.width,'普通鼠标滚轮实际放大 SVG，无需 Ctrl');
 current=await box(node);await drag(blank,100,60);
 check(moved(current,await box(node),100,60),'缩放后拖动仍按鼠标距离移动 100×60 像素');
 const released=await box(node);
 await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'diagramMouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',x:Math.round(blank.x+200),y:Math.round(blank.y+100),duration:100}]}]});
 check(moved(released,await box(node),0,0),'松开左键后移动鼠标不再移动图表');
 await session.click('[aria-label="适应图表窗口"]');
 check(moved(initial,await box(node),0,0),'适应窗口恢复最初位置和缩放');
}

export async function installDiagramExportAudit(session){
 await session.execute('const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){const pixels=this.getContext("2d").getImageData(0,0,this.width,this.height).data;let themed=0;for(let i=0;i<pixels.length;i+=16)if(pixels[i]===66&&pixels[i+1]===168&&pixels[i+2]===146&&pixels[i+3]===255)themed++;window.__diagramExportThemedPixels=themed;return original.apply(this,args);};');
}
