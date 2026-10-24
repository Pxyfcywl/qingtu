type ObjectUrls={createObjectURL:(blob:Blob)=>string;revokeObjectURL:(url:string)=>void};
export function createThumbnailCache(load:(id:string,signal:AbortSignal)=>Promise<Blob>,urls:ObjectUrls=URL){
 type Entry={state:{references:number;controller:AbortController;url:string};promise:Promise<string>};
 const entries=new Map<string,Entry>();
 return {acquire(key:string,id:string){
  let entry=entries.get(key);
  if(!entry){
   const state={references:0,controller:new AbortController(),url:''};
   const created:Entry={state,promise:Promise.resolve().then(()=>{state.controller.signal.throwIfAborted();return load(id,state.controller.signal);}).then(blob=>{
    state.controller.signal.throwIfAborted();state.url=urls.createObjectURL(blob);return state.url;
   }).catch(error=>{if(entries.get(key)===created)entries.delete(key);throw error;})};
   entries.set(key,created);entry=created;
  }
  const current=entry;current.state.references++;let released=false;
  return {promise:current.promise,release(){
   if(released)return;released=true;
   if(--current.state.references===0){
    if(entries.get(key)===current)entries.delete(key);
    current.state.controller.abort();
    if(current.state.url){urls.revokeObjectURL(current.state.url);current.state.url='';}
   }
  }};
 }};
}

// A video lacking a poster may resolve to its original file. Reject the
// response before reading its body; video playback keeps its ranged URL.
export async function readThumbnail(response:Response,signal:AbortSignal):Promise<Blob>{
 const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
 if(!response.ok||!['image/png','image/jpeg','image/webp'].includes(type)){
  await response.body?.cancel();throw Error('缩略图不是受支持的图片');
 }
 const limit=10*1024*1024;
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('图片超过 10 MiB');}
 const reader=response.body?.getReader();if(!reader)throw Error('缩略图没有内容');
 const chunks:BlobPart[]=[];let bytes=0;
 try{
  while(true){signal.throwIfAborted();const value=await reader.read();if(value.done)break;bytes+=value.value.byteLength;
   if(bytes>limit)throw Error('图片超过 10 MiB');chunks.push(new Uint8Array(value.value).buffer);
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 signal.throwIfAborted();if(!bytes)throw Error('缩略图没有内容');return new Blob(chunks,{type});
}
