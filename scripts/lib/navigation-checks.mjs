import fs from 'node:fs/promises';
import path from 'node:path';
import {sleep} from './native.mjs';
const wheel=(session,x,y,deltaY)=>session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'wheel',id:'navigationWheel',actions:[{type:'scroll',origin:'viewport',x:Math.round(x),y:Math.round(y),deltaX:0,deltaY,duration:200}]}]});
const imageBox=session=>session.execute('const r=document.querySelector(".image-viewer img").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};');
export async function checkImageNavigation(session,{check,shot}){
 await session.click('.node-card .asset-image');await session.waitFor('const img=document.querySelector(".image-viewer img");return img&&img.complete&&img.naturalWidth>0&&img.getBoundingClientRect().width>200;');
 check(await session.execute('const r=document.querySelector(".image-viewer").getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight;'),'单击图片打开覆盖全窗口的原图预览');
 const original=await imageBox(session),point={x:original.x+original.width*.6,y:original.y+original.height*.6};await wheel(session,point.x,point.y,-200);await session.waitFor('return document.querySelector(".image-viewer img").getBoundingClientRect().width>arguments[0];',[original.width]);const zoomed=await imageBox(session);
 check(Math.abs((point.x-zoomed.x)/zoomed.width-.6)<.01&&Math.abs((point.y-zoomed.y)/zoomed.height-.6)<.01,'真实鼠标滚轮以指针所在位置放大图片');
 const center=await session.execute('const r=document.querySelector(".image-viewer-stage").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};');
 await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'pointer',id:'navigationMouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',x:Math.round(center.x),y:Math.round(center.y),duration:80},{type:'pointerDown',button:0},{type:'pointerMove',origin:'viewport',x:Math.round(center.x+100),y:Math.round(center.y-80),duration:180},{type:'pointerUp',button:0}]}]});
 const dragged=await imageBox(session);check(Math.abs(dragged.x-zoomed.x-100)<2&&Math.abs(dragged.y-zoomed.y+80)<2,'真实按住左键可拖动图片，松开后仍保持预览');
 await wheel(session,center.x,center.y,200);await session.waitFor('return document.querySelector(".image-viewer img").getBoundingClientRect().width<arguments[0];',[zoomed.width]);check(true,'滚轮反向转动可缩小图片');await session.click('[aria-label="适应窗口"]');await shot('图片全窗口预览.png');await session.click('[aria-label="关闭图片预览"]');
}
export async function scrollLongCard(session,check){
 const transform=await session.execute('return document.querySelector(".react-flow__viewport").style.transform;');const center=await session.execute('const r=document.querySelector(".card-body").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};');await wheel(session,center.x,center.y,4000);await session.waitFor('return document.querySelector(".card-body").scrollTop>1000;');
 check(await session.execute('return getComputedStyle(document.querySelector(".card-body")).scrollbarWidth==="none";'),'长 Markdown 正文内部可滚动且隐藏右侧滚动条');
 check(await session.execute('return document.querySelector(".react-flow__viewport").style.transform;')===transform,'正文滚轮操作不缩放或平移画布');
}
export async function checkFullExport(session,{root,check}){
 const scrollBefore=await session.execute('return document.querySelector(".card-body").scrollTop;'),file=path.join(root,'完整长卡片.png');await session.execute('window.dispatchEvent(new CustomEvent("qingtu-export-png",{detail:arguments[0]}));',[file]);
 const deadline=Date.now()+30000;let png;while(Date.now()<deadline){try{png=await fs.readFile(file);break;}catch(error){if(error.code!=='ENOENT')throw error;await sleep(100);}}if(!png)throw Error('PNG export timed out');
 await session.waitFor('return !document.querySelector(".busy-overlay");');const height=png.readUInt32BE(20);check(height>2000,`PNG 导出包含完整长正文（高度 ${height} 像素）`);
 await session.waitFor('return Math.abs(document.querySelector(".card-body").scrollTop-arguments[0])<2;',[scrollBefore]);check(true,'导出后正文滚动位置恢复');
}
