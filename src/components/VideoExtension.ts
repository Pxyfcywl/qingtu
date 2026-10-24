import {Node} from '@tiptap/core';
import {assetUrl} from '../bridge';
import {getState} from '../state';
import {claimPlayback,releasePlayback} from '../domain/playback-session';

export const Video=Node.create({name:'video',group:'block',atom:true,
  addAttributes(){return {assetId:{default:'',parseHTML:element=>element.getAttribute('data-asset-id')}};},
  parseHTML(){return [{tag:'div[data-video]'}];},
  renderHTML({node}){return ['div',{'data-video':'','data-asset-id':node.attrs.assetId,class:'editor-video'},'▶ 本地视频'];},
  addNodeView(){return ({node})=>{
    const id=String(node.attrs.assetId),dom=document.createElement('div'),video=document.createElement('video'),error=document.createElement('span'),owner={};let live=true;
    dom.className='editor-video';dom.contentEditable='false';video.controls=true;video.preload='none';video.className='asset-video';video.setAttribute('aria-label','正文视频播放器');
    const stop=()=>{video.pause();releasePlayback(owner);};
    video.onplay=()=>claimPlayback(owner,stop);error.className='editor-video-error';error.hidden=true;error.textContent='此视频无法播放，请使用 H.264 编码的 MP4';
    video.onerror=()=>{if(live&&video.getAttribute('src')){error.hidden=false;stop();}};dom.append(video,error);
    assetUrl(id).then(src=>{if(live)video.src=src;}).catch(()=>{if(live)error.hidden=false;});
    if(getState().library?.assets.find(asset=>asset.id===id)?.thumbnailPath)assetUrl(id,true).then(src=>{if(live)video.poster=src;}).catch(()=>{});
    return {dom,stopEvent:()=>true,ignoreMutation:()=>true,update:next=>next.type.name==='video'&&next.attrs.assetId===id,
      destroy(){live=false;stop();video.onplay=null;video.onerror=null;video.removeAttribute('src');video.load();}};
  };},
});
