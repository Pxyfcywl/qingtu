import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function capturePageHeap(devtools,origin,file){
 const target=(await devtools.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 if(!target)throw Error('Application page target missing');
 const {sessionId}=await devtools.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const chunks=[];
 const listener=event=>{const message=JSON.parse(event.data);if(message.sessionId===sessionId&&message.method==='HeapProfiler.addHeapSnapshotChunk')chunks.push(message.params.chunk);};
 devtools.socket.addEventListener('message',listener);
 try{
  await devtools.request('HeapProfiler.collectGarbage',{},sessionId);
  await devtools.request('HeapProfiler.takeHeapSnapshot',{reportProgress:false,captureNumericValue:true},sessionId,60000);
  const bytes=Buffer.from(chunks.join(''));if(!bytes.length)throw Error('Empty heap snapshot');
  await fs.writeFile(file,bytes,{flag:'wx'});
  return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'Diagnostic snapshot; never use this run as formal resource acceptance'};
 }finally{devtools.socket.removeEventListener('message',listener);await devtools.request('Target.detachFromTarget',{sessionId});}
}
