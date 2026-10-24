import { useCallback,useEffect,useRef,useState,useLayoutEffect } from 'react';
import { Play, ImageOff, Film, ImagePlus } from 'lucide-react';
import { assetUrl } from '../bridge';
import { useAppValue,getState,patchState } from '../state';
import { createTaskPool } from '../domain/task-pool';
import {createThumbnailCache,readThumbnail} from '../domain/thumbnail-resource';
import {claimPlayback,ownsPlayback,releasePlayback} from '../domain/playback-session';

const releasedVideos=new WeakSet<HTMLVideoElement>();
function releaseVideo(video:HTMLVideoElement){
  if(!releasedVideos.has(video)){releasedVideos.add(video);video.addEventListener('play',()=>video.pause());}
  video.autoplay=false;video.pause();video.removeAttribute('src');video.load();video.pause();
}
const loadImage=createTaskPool(2);
const thumbnails=createThumbnailCache(async(id,signal)=>{
 const url=await assetUrl(id,true);signal.throwIfAborted();
 return readThumbnail(await fetch(url,{signal,cache:'no-store'}),signal);
});
function useThumbnail(id?:string){
  const storagePath=useAppValue(s=>s.library?.storagePath);
  const [state,setState]=useState({src:'',failed:false});
  useEffect(()=>{
    const controller=new AbortController(),signal=controller.signal;let lease:ReturnType<typeof thumbnails.acquire>|undefined;setState({src:'',failed:false});
    if(id)void loadImage(async()=>{
      lease=thumbnails.acquire((storagePath??'')+'\0'+id,id);const url=await lease.promise;signal.throwIfAborted();
      await new Promise<void>((resolve,reject)=>{
        const image=new Image();
        const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
        const abort=()=>{cleanup();image.removeAttribute('src');reject(signal.reason);};
        const timeout=setTimeout(()=>{cleanup();image.removeAttribute('src');reject(new Error('缩略图读取超时'));},10000);
        image.onload=()=>{cleanup();image.removeAttribute('src');resolve();};image.onerror=()=>{cleanup();image.removeAttribute('src');reject(new Error('缩略图读取失败'));};
        signal.addEventListener('abort',abort,{once:true});image.src=url;
      });return url;
    },signal).then(src=>{if(!signal.aborted)setState({src,failed:false});}).catch(()=>{lease?.release();lease=undefined;if(!signal.aborted)setState({src:'',failed:true});});
    return()=>{controller.abort();lease?.release();lease=undefined;};
  },[id,storagePath]);
  return {...state,loading:!!id&&!state.src&&!state.failed};
}
export function ImageAsset({id,alt = '',onOpen}:{id:string;alt?:string;onOpen?:(url:string)=>void}) {
  const asset=useAppValue(s=>s.library?.assets.find(a=>a.id===id));
  const aspectRatio=asset&&Number.isFinite(asset.width)&&Number.isFinite(asset.height)&&asset.width>0&&asset.height>0?`${asset.width} / ${asset.height}`:undefined;
  const {src,failed:loadFailed}=useThumbnail(id);const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[id,src]);
  if(failed||loadFailed) return <span className="media-error"><ImageOff size={24}/> 图片暂时无法读取</span>;
  const preview=(event:React.MouseEvent)=>{event.stopPropagation();const nodeId=(event.currentTarget as HTMLElement).closest('[data-node-id]')?.getAttribute('data-node-id');if(nodeId)patchState({selectedId:nodeId});const origin=getState();assetUrl(id).then(url=>{const current=getState();if(current.doc?.id===origin.doc?.id&&current.library?.storagePath===origin.library?.storagePath){if(onOpen)onOpen(url);else patchState({notice:'image:'+url});}}).catch(()=>setFailed(true));};
  return src ? <img className="asset-image" src={src} alt={alt} title="点击放大 · 滚轮缩放 · 左键拖动" style={{aspectRatio}} onError={()=>setFailed(true)} onClick={preview} onDoubleClick={preview}/> : <span className="media-placeholder" style={aspectRatio?{aspectRatio,minHeight:0}:undefined}/>;
}
export function openImagePreview(id:string){
  const origin=getState();
  void assetUrl(id).then(url=>{const current=getState();if(current.doc?.id===origin.doc?.id&&current.library?.storagePath===origin.library?.storagePath)patchState({notice:'image:'+url});}).catch(error=>patchState({error:String(error)}));
}
export function VideoAsset({id,poster,editable,onAdd}:{id?:string;poster?:string;editable?:boolean;onAdd?:()=>void}) {
  const storagePath=useAppValue(s=>s.library?.storagePath);
  const docId=useAppValue(s=>s.doc?.id);
  const exporting=useAppValue(s=>s.busy==='正在生成导图图片…');
  const thumbnail=useAppValue(s=>s.library?.assets.find(a=>a.id===id)?.thumbnailPath);
  const coverImage=useThumbnail(id&&thumbnail&&!poster?id:undefined);const cover=poster??coverImage.src;
  const [src,setSrc]=useState('');const [failed,setFailed]=useState(false);const ref=useRef<HTMLVideoElement>(null);
  const owner=useRef({}),requests=useRef(0),playback=useRef({time:0,volume:1,muted:false,rate:1});
  const stopPlayback=useCallback((render=true)=>{
    ++requests.current;const video=ref.current;
    if(video&&!releasedVideos.has(video)){playback.current={time:!video.ended&&Number.isFinite(video.currentTime)?video.currentTime:0,volume:video.volume,muted:video.muted,rate:video.playbackRate};releaseVideo(video);}
    releasePlayback(owner.current);if(render)setSrc('');
  },[]);
  useLayoutEffect(()=>{stopPlayback(false);playback.current={time:0,volume:1,muted:false,rate:1};setSrc('');setFailed(false);return()=>stopPlayback(false);},[id,storagePath,docId,stopPlayback]);
  const previous=useRef<HTMLVideoElement|null>(null);
  const bindVideo=useCallback((video:HTMLVideoElement|null)=>{
    if(previous.current&&previous.current!==video)releaseVideo(previous.current);
    if(video){video.volume=playback.current.volume;video.muted=playback.current.muted;video.playbackRate=playback.current.rate;}
    previous.current=video;ref.current=video;
  },[]);
  useEffect(()=>{if(exporting)stopPlayback();},[exporting,stopPlayback]);
  const beginPlayback=()=>{
    if(!id)return;
    const origin=getState(),request=++requests.current;claimPlayback(owner.current,stopPlayback);
    assetUrl(id).then(url=>{
      const current=getState();
      if(request===requests.current&&ownsPlayback(owner.current)&&current.doc?.id===origin.doc?.id&&current.library?.storagePath===origin.library?.storagePath){setFailed(false);setSrc(url);}
    }).catch(()=>{if(request===requests.current&&ownsPlayback(owner.current)){releasePlayback(owner.current);setFailed(true);}});
  };
  if(!id) return <button className="video-empty nodrag" onClick={onAdd} aria-label="添加本地视频"><Film size={30}/><span className="play-circle"><Play size={24} fill="currentColor"/></span><strong>视频节点</strong><span>添加本地 MP4 视频</span></button>;
  if(!src||exporting) return <button className="video-cover nodrag" data-media-loading={coverImage.loading||undefined} aria-label="播放视频" onClick={beginPlayback}>
    {cover?<img src={cover} alt="视频封面"/>:<div className="video-art"><span>a² + b² = c²</span><Film size={64}/></div>}
    <span className="play-circle"><Play size={24} fill="currentColor"/></span><span className="video-caption">{failed?'无法播放，请使用 H.264 MP4 或重新选择文件':playback.current.time>0?'点击继续播放':'点击播放'}</span>
  </button>;
  return <video ref={bindVideo} className="asset-video nodrag nowheel" src={src} crossOrigin="anonymous" controls autoPlay preload="none"
    onLoadedMetadata={event=>{const video=event.currentTarget;if(!ownsPlayback(owner.current)){stopPlayback();return;}if(playback.current.time>0&&Number.isFinite(video.duration)&&playback.current.time<video.duration-.05)video.currentTime=playback.current.time;playback.current.time=0;}}
    onPlay={event=>{if(releasedVideos.has(event.currentTarget)){event.currentTarget.pause();return;}if(!ownsPlayback(owner.current))stopPlayback();}}
    onError={event=>{if(event.currentTarget.getAttribute('src')){setFailed(true);stopPlayback();}}} onDoubleClick={event=>event.stopPropagation()} aria-label="本地视频播放器" tabIndex={editable?0:-1}/>;
}
export function EmptyImage({onAdd}:{onAdd:()=>void}) {return <button className="image-empty nodrag" onClick={onAdd}><ImagePlus size={30}/><span>添加本地图片</span></button>;}
