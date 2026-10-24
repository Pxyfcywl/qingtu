import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(process.env.QINGTU_SHARP_MODULE || 'sharp');
const probe=process.argv.includes('--probe');
const canonical=probe||process.argv.includes('--canonical');
const root=path.resolve(probe?'.tooling/fixtures/media-probe':canonical?'.tooling/fixtures/media-target':'.tooling/fixtures/media');await fs.mkdir(root,{recursive:true});
const manifestFile=path.join(root,'manifest.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
try{const existing=JSON.parse(await fs.readFile(manifestFile,'utf8'));for(const asset of existing.assets){if(hash(await fs.readFile(path.join(root,asset.file)))!==asset.sha256)throw Error('Existing fixture hash mismatch');}console.log('Frozen media already available:',existing.totalBytes);process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const assets=[];
if(canonical){const previous=JSON.parse(await fs.readFile('.tooling/fixtures/media/manifest.json','utf8'));for(const item of previous.assets.filter(a=>a.kind==='image')){await fs.copyFile(path.resolve('.tooling/fixtures/media',item.file),path.join(root,item.file));assets.push(item);}}
for(let index=0;index<40;index++){
 if(canonical)break;
 const raw=Buffer.alloc(1024*768*3);let seed=20261015+index;
 for(let i=0;i<raw.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;raw[i]=seed>>>24;}
 const image=sharp(raw,{raw:{width:1024,height:768,channels:3}});
 let best,delta=Infinity;
 for(let quality=30;quality<=60;quality+=3){const bytes=await image.clone().jpeg({quality,chromaSubsampling:'4:2:0'}).toBuffer();const distance=Math.abs(bytes.length-256*1024);if(distance<delta){best=bytes;delta=distance;}}
 const file=`image-${String(index).padStart(2,'0')}.jpg`;await fs.writeFile(path.join(root,file),best);
 assets.push({kind:'image',file,width:1024,height:768,bytes:best.length,sha256:hash(best)});
}
console.log('40 distinct JPEG images generated.');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(let batch=0;batch<(probe?1:2);batch++){
  const results=await Promise.all(Array.from({length:probe?1:5},async(_,offset)=>{
   const index=batch*5+offset;const page=await browser.newPage();
   try{return await page.evaluate(async ({index,canonical})=>{
    const mime=['video/mp4;codecs=avc1.42001E','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw Error('MP4 encoder unavailable');
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
    const fps=canonical?13:20;const noise=document.createElement('canvas');noise.width=160;noise.height=90;const nctx=noise.getContext('2d');const pixels=nctx.createImageData(noise.width,noise.height);
    const stream=canvas.captureStream(fps);const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1677722,videoBitrateMode:'constant'});const chunks=[];
    const finished=new Promise(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    let seed=20261015+index,frames=0;const start=performance.now();
    const draw=()=>{for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i]=seed>>>24;pixels.data[i+1]=seed>>>16;pixels.data[i+2]=seed>>>8;pixels.data[i+3]=255;}nctx.putImageData(pixels,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(noise,0,0,1280,720);ctx.fillStyle='#143b4c';ctx.fillRect(40,40,720,90);ctx.fillStyle='#fff';ctx.font='32px sans-serif';ctx.fillText(`Qingtu local benchmark ${index+1} / frame ${frames++}`,60,95);};
    draw();recorder.start();const interval=setInterval(draw,1000/fps);await new Promise(r=>setTimeout(r,20000));clearInterval(interval);recorder.stop();const blob=await finished;stream.getTracks().forEach(t=>t.stop());
    const url=URL.createObjectURL(blob);const video=document.createElement('video');video.preload='metadata';video.src=url;
    const dimensions=await new Promise((resolve,reject)=>{video.onloadedmetadata=()=>resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});video.onerror=()=>reject(Error('Encoded fixture not decodable'));});video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
    return {index,mime,frames,elapsedMs:performance.now()-start,...dimensions,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
   },{index,canonical});}finally{await page.close();}
  }));
  for(const result of results){const {bytes,...meta}=result;const buffer=Buffer.from(bytes);const file=`video-${String(result.index).padStart(2,'0')}.mp4`;await fs.writeFile(path.join(root,file),buffer);assets.push({kind:'video',file,...meta,bytes:buffer.length,sha256:hash(buffer)});console.log(file,buffer.length,'bytes',result.duration,'seconds');}
 }
}finally{await browser.close();}
if(new Set(assets.map(a=>a.sha256)).size!==(probe?41:50))throw Error('Fixture content is not distinct');
const totalBytes=assets.reduce((n,a)=>n+a.bytes,0);
const manifest={createdAt:new Date().toISOString(),seed:20261015,totalBytes,totalMiB:totalBytes/1048576,assets,note:'Own synthetic image/video content. Freeze these exact bytes and manifest for all subsequent measurements.'};
await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2));console.log('Frozen media total:',manifest.totalMiB,'MiB');
