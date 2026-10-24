import {call,assetUrl,storeClipboardImage,storeClipboardVideo} from './bridge';
import type {Asset} from './domain/types';
export async function importClipboardImage(file:File,signal:AbortSignal):Promise<Asset>{
  signal.throwIfAborted();
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('粘贴图片支持 PNG、JPEG、WebP 格式');
  if(!file.size||file.size>10*1024*1024)throw new Error('图片为空或超过 10 MiB，请缩小后再粘贴');
  const image=await createImageBitmap(file);const pixels=image.width*image.height;image.close();signal.throwIfAborted();
  if(pixels>20_000_000)throw new Error('图片不能超过 2000 万像素');
  const asset=await storeClipboardImage(file);signal.throwIfAborted();return asset;
}
export async function importLocalMedia(path:string,kind:'image'|'video',signal:AbortSignal):Promise<Asset>{
  signal.throwIfAborted();let asset=await call<Asset>('import_asset',{path});signal.throwIfAborted();
  if(kind==='video')asset=await enrichVideo(asset,signal);
  return asset;
}
export function mediaFileKind(file:File):'image'|'video'|null {
  if(file.type.startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(file.name))return 'image';
  if(file.type.startsWith('video/')||/\.mp4$/i.test(file.name))return 'video';return null;
}
export async function importMediaFile(file:File,signal:AbortSignal):Promise<Asset>{
  const kind=mediaFileKind(file);if(kind==='image'){
    const normalized=file.type?file:new File([file],file.name,{type:/\.webp$/i.test(file.name)?'image/webp':/\.jpe?g$/i.test(file.name)?'image/jpeg':'image/png'});
    return importClipboardImage(normalized,signal);
  }
  signal.throwIfAborted();if(kind!=='video'||(!/\.mp4$/i.test(file.name)&&file.type!=='video/mp4'))throw new Error('视频支持 MP4 格式，请使用 H.264 编码的 MP4');
  if(!file.size||file.size>100*1024*1024)throw new Error('视频为空或超过 100 MiB');
  let asset=await storeClipboardVideo(file);signal.throwIfAborted();asset=await enrichVideo(asset,signal);return asset;
}
async function enrichVideo(asset:Asset,signal:AbortSignal):Promise<Asset>{
    const src=await assetUrl(asset.id);signal.throwIfAborted();
    const metadata=await new Promise<{width:number;height:number;duration:number;posterBytes?:number[]}>((resolve,reject)=>{
      const video=document.createElement('video');video.preload='auto';video.crossOrigin='anonymous';video.muted=true;let finished=false;
      const release=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);video.onloadeddata=null;video.onerror=null;video.removeAttribute('src');video.load();};
      const fail=(error:unknown)=>{if(finished)return;finished=true;release();reject(error);};
      const abort=()=>fail(signal.reason);
      const timeout=setTimeout(()=>fail(new Error('读取视频超时，请检查格式')),15000);
      signal.addEventListener('abort',abort,{once:true});
      video.onloadeddata=async()=>{
        if(!video.videoWidth||!video.videoHeight||!Number.isFinite(video.duration)){fail(new Error('无法读取视频尺寸或时长'));return;}
        const value:{width:number;height:number;duration:number;posterBytes?:number[]}={width:video.videoWidth,height:video.videoHeight,duration:video.duration};
        try{
          const ratio=Math.min(1,512/Math.max(value.width,value.height)),canvas=document.createElement('canvas');canvas.width=Math.round(value.width*ratio);canvas.height=Math.round(value.height*ratio);
          canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));
          if(blob)value.posterBytes=Array.from(new Uint8Array(await blob.arrayBuffer()));
        }catch{/* The decoded video remains usable if poster capture is unavailable. */}
        if(finished)return;signal.throwIfAborted();finished=true;release();resolve(value);
      };
      video.onerror=()=>fail(new Error('此视频编码无法播放，请使用 H.264 编码的 MP4'));video.src=src;
    });
    signal.throwIfAborted();asset=await call<Asset>('set_asset_metadata',{id:asset.id,metadata});signal.throwIfAborted();
  return asset;
}
