import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 const bytes=await page.evaluate(async()=>{
   const mime=['video/mp4;codecs=avc1.42001E','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
   if(!mime)throw new Error('This WebView engine cannot encode the MP4 fixture');
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;const context=canvas.getContext('2d');
   const stream=canvas.captureStream(20);const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:400000});const chunks=[];
   const finished=new Promise(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));});
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.start();
   let frame=0;await new Promise(resolve=>{const draw=()=>{
     context.fillStyle='#31485a';context.fillRect(0,0,640,400);context.strokeStyle='#a6ddce';context.lineWidth=4;
     context.beginPath();context.moveTo(180,80);context.lineTo(180,310);context.lineTo(420,310);context.closePath();context.stroke();
     context.strokeStyle='#b3c4db';context.strokeRect(180,287,23,23);
     context.fillStyle='#dbeeea';context.font='italic 32px Georgia';context.fillText('a² + b² = c²',340,75);context.fillText('a',142,205);context.fillText('b',291,350);context.fillText('c',315,188);
     context.fillStyle='#82c7b2';context.fillRect(0,390,640*Math.min(frame/60,1),10);frame++;
     if(frame>=60){resolve();return;}setTimeout(draw,50);
   };draw();});
   recorder.stop();const blob=await finished;stream.getTracks().forEach(track=>track.stop());return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await fs.writeFile('public/demo/lesson.mp4',Buffer.from(bytes));console.log('Own MP4 fixture created:',bytes.length,'bytes');
}finally{await browser.close();}
