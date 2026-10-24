import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const folder='.tooling/fixtures/media-lifecycle';await fs.mkdir(folder,{recursive:true});
try{const manifest=JSON.parse(await fs.readFile(folder+'/manifest.json','utf8'));const bytes=await fs.readFile(folder+'/audio.mp4');if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Frozen audio fixture mismatch');console.log(manifest);process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.setContent('<button>Start fixture</button>');await page.getByRole('button').click();
 const result=await page.evaluate(async()=>{
  const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination(),tone=ctx.createOscillator(),gain=ctx.createGain();tone.frequency.value=440;gain.gain.value=.05;tone.connect(gain).connect(destination);await ctx.resume();tone.start();
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const paint=canvas.getContext('2d');
  const stream=canvas.captureStream(15);destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
  const mime=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw Error('Audio MP4 encoding unsupported');
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:180000,audioBitsPerSecond:64000}),chunks=[];
  const finished=new Promise(resolve=>recorder.onstop=()=>resolve(new Blob(chunks,{type:mime})));recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  let frames=0;const draw=()=>{paint.fillStyle='#214e59';paint.fillRect(0,0,640,360);paint.fillStyle='#a4e2cf';paint.fillRect(40,280,560*(frames++%120)/120,20);paint.fillStyle='#fff';paint.font='28px sans-serif';paint.fillText('Local audio lifecycle test / 440 Hz',45,120);};draw();
  recorder.start();const interval=setInterval(draw,1000/15);await new Promise(r=>setTimeout(r,8000));clearInterval(interval);recorder.stop();const blob=await finished;tone.stop();stream.getTracks().forEach(t=>t.stop());await ctx.close();return {mime,audioTracks:1,width:640,height:360,frames,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
 });
 const bytes=Buffer.from(result.bytes);delete result.bytes;const manifest={...result,byteSize:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),createdAt:new Date().toISOString(),note:'Own synthetic video plus 440 Hz audio. Generator output is connected only to MediaStreamDestination, not speakers.'};
 await fs.writeFile(folder+'/audio.mp4',bytes);await fs.writeFile(folder+'/manifest.json',JSON.stringify(manifest,null,2));console.log(manifest);
}finally{await browser.close();}
