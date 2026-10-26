import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkLongDiagramPan(session,{check,shot,output}){
 const source='flowchart TD\n'+Array.from({length:80},(_,i)=>` N${i}[步骤 ${i+1}] --> N${i+1}[步骤 ${i+2}]`).join('\n');
 await fs.writeFile(path.join(output,'超长图平移示例.md'),'```mermaid\n'+source+'\n```\n');
 await session.execute('document.querySelector("[data-node-id=diagram-0] [aria-label=编辑卡片正文]").click();');
 await session.waitFor('return !!document.querySelector("[contenteditable=true]");');
 await session.execute('document.querySelector("[contenteditable=true]").editor.commands.setContent({type:"doc",content:[{type:"codeBlock",attrs:{language:"mermaid"},content:[{type:"text",text:arguments[0]}]}]});',[source]);
 await session.waitFor('return !!document.querySelector("[contenteditable=true] .diagram-surface svg.pele");');
 await session.execute('document.querySelector("[contenteditable=true] .diagram-tools button").click();');
 await session.waitFor('return !!document.querySelector(".diagram-viewer svg.pele");');
 const box=selector=>session.execute('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};',[selector]);
 const stage=await box('.diagram-viewer-stage');
 for(let i=0;i<3;i++)await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'wheel',id:'longDiagramWheel',actions:[{type:'scroll',origin:'viewport',x:Math.round(stage.x+stage.width/2),y:Math.round(stage.y+stage.height/2),deltaX:0,deltaY:-500,duration:100}]}]});
 const enlarged=await box('.diagram-viewer svg.pele');
 check(enlarged.height>stage.height*4,'81 个节点的纵向图放大到超过窗口高度四倍');
 const gestures={};
 for(const id of ['N80','N0']){
   const selector=`.diagram-viewer svg.pele [data-id="${id}"]`;
   let count=0;
   for(;count<70;count++){
     const node=await box(selector),delta=stage.y+stage.height/2-node.y-node.height/2;
     if(Math.abs(delta)<2)break;
     const step=Math.max(-stage.height*.55,Math.min(stage.height*.55,delta));
     const x=Math.round(stage.x+60),y=Math.round(stage.y+stage.height*(step<0?.8:.2));
     await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'longDiagramMouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',x,y,duration:30},{type:'pointerDown',button:0},{type:'pointerMove',origin:'viewport',x,y:Math.round(y+step),duration:100},{type:'pointerUp',button:0}]}]});
   }
   const node=await box(selector);
   const hit=await session.execute('const e=document.querySelector(arguments[0]),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));',[selector]);
   check(node.y>=stage.y+16&&node.y+node.height<=stage.y+stage.height-16&&hit,id==='N80'?'连续拖动后，最后一个节点（步骤 81）完整进入窗口并可命中':'继续反向拖动可回到第一个节点（步骤 1）');
   gestures[id]=count;
   await shot(id==='N80'?'超长图放大后底部.png':'超长图拖回顶部.png');
 }
 check(Math.abs((await box('.diagram-viewer svg.pele')).height-enlarged.height)<2,'长图移动到两端时保持放大比例，不自动缩小');
 await session.click('[aria-label="关闭图表预览"]');
 return {nodes:81,svgHeight:enlarged.height,stageHeight:stage.height,gestures};
}
