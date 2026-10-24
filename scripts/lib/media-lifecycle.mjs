import {sleep} from './native.mjs';
export function mediaDocument(assetId,id,title){
 const node=(id,kind,parentId,position,title='')=>({id,kind,parentId,position,title,childIds:[],body:{type:'doc',content:[{type:'paragraph'}]},side:'right',color:kind==='card'?'orange':'teal',contentCollapsed:false,childrenCollapsed:false});
 const root=node('aud-root','text',null,{x:0,y:150},'媒体生命周期验证');root.childIds=['aud-group','aud-a','aud-b'];
 const group=node('aud-group','text',root.id,{x:0,y:-100},'视频分支');group.childIds=['aud-card'];
 const card=node('aud-card','card',group.id,{x:300,y:-100},'正文中的音轨视频');card.preferredWidth=320;card.body={type:'doc',content:[{type:'video',attrs:{assetId}}]};
 const a=node('aud-a','video',root.id,{x:300,y:260}),b=node('aud-b','video',root.id,{x:650,y:260});a.assetId=b.assetId=assetId;
 return {id,schemaVersion:1,title,rootId:root.id,revision:0,layoutMode:'free',viewport:{x:160,y:160,zoom:1},updatedAt:0,nodes:Object.fromEntries([root,group,card,a,b].map(n=>[n.id,n]))};
}
export async function installAudioProbe(session){
 await session.execute(`(()=>{
  const ctx=new AudioContext(),probes=new Map(),saved={};let error='';
  const capture=video=>{if(probes.has(video))return;try{const source=ctx.createMediaElementSource(video),analyser=ctx.createAnalyser(),sink=ctx.createGain(),events=[];analyser.fftSize=2048;sink.gain.value=0;source.connect(analyser).connect(sink).connect(ctx.destination);probes.set(video,{source,analyser,sink,events});for(const type of ['play','pause','emptied','loadstart','abort'])video.addEventListener(type,()=>{events.push({type,at:performance.now(),paused:video.paused,autoplay:video.autoplay,hasSrc:!!video.getAttribute('src'),ready:video.readyState,network:video.networkState});if(events.length>12)events.shift();});void ctx.resume().catch(e=>error=String(e));}catch(e){error=String(e);}};
  const scan=()=>document.querySelectorAll('.asset-video').forEach(capture);const observer=new MutationObserver(scan);observer.observe(document.body,{subtree:true,childList:true});scan();
  const sample=video=>{if(!video)throw Error('Missing saved video');const probe=probes.get(video);if(!probe)throw Error('Audio probe missing: '+error);const values=new Float32Array(probe.analyser.fftSize);probe.analyser.getFloatTimeDomainData(values);return {rms:Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length),paused:video.paused,autoplay:video.autoplay,connected:video.isConnected,ready:video.readyState,network:video.networkState,currentSrc:video.currentSrc,src:video.getAttribute('src'),time:video.currentTime,liveSources:document.querySelectorAll('.asset-video[src]').length,playingVideos:Array.from(document.querySelectorAll('.asset-video')).filter(v=>!v.paused).length,context:ctx.state,error,events:probe.events.slice()};};
  window.__audioTest={ctx,probes,saved,observer,save:(key,selector)=>saved[key]=document.querySelector(selector),sample,sampleSaved:key=>sample(saved[key])};
 })();`);
}
export async function cleanupAudioProbe(session){const result=await session.asyncScript(`const done=arguments[arguments.length-1];(async()=>{const test=window.__audioTest;if(test){test.observer.disconnect();for(const [video,probe]of test.probes){video.autoplay=false;video.pause();video.removeAttribute('src');video.load();video.pause();probe.source.disconnect();probe.analyser.disconnect();probe.sink.disconnect();}if(test.ctx.state!=='closed')await test.ctx.close();delete window.__audioTest;}done(true);})().catch(e=>done({error:String(e)}));`);if(result?.error)throw Error('Audio probe cleanup failed: '+result.error);}
export async function verifyMediaLifecycle(session,copy,samples=[]){
 const selector=id=>`[data-node-id="${id}"]`;
 const save=async(key,id)=>session.execute('window.__audioTest.save(arguments[0],arguments[1]);',[key,selector(id)+' video']);
 const read=async key=>session.execute('return window.__audioTest.sampleSaved(arguments[0]);',[key]);
 const play=async(id,key)=>{
  const exists=await session.execute('return !!document.querySelector(arguments[0]);',[selector(id)+' video']);
  await session.click(selector(id)+(exists?' video':' [aria-label="播放视频"]'));
  if(exists){const result=await session.asyncScript(`const done=arguments[arguments.length-1];document.querySelector(arguments[0]).play().then(()=>done({ok:true}),e=>done({error:String(e)}));`,[selector(id)+' video']);if(!result.ok)throw Error(result.error);}
  await session.waitFor('const v=document.querySelector(arguments[0]);return v&&v.readyState>=2&&!v.paused;',[selector(id)+' video']);await save(key,id);
  let value;for(let i=0;i<30;i++){await sleep(50);value=await read(key);if(value.rms>.001)break;}if(!(value.rms>.001)||value.error||value.playingVideos>1)throw Error('Actual audio signal/one-player assertion failed: '+JSON.stringify(value));samples.push({case:key,phase:'playing',...value});
 };
 const stopped=async key=>{await sleep(180);const value=await read(key);samples.push({case:key,phase:'stopped',...value});if(!value.paused||value.src!==null||value.rms>.0001)throw Error('Hidden video '+key+' retained a source or audio signal: '+JSON.stringify(value));};
 await installAudioProbe(session);
 try{
  await play('aud-a','first');await play('aud-b','second');const first=await read('first');if(!first.paused||first.rms>.0001)throw Error('First video continued after second playback');samples.push({case:'mutual-exclusion',...first});
  await play('aud-card','body-collapse');await session.click(selector('aud-card')+' .body-toggle');await stopped('body-collapse');
  await session.click(selector('aud-card')+' .body-toggle');await play('aud-card','ancestor-collapse');await session.click(selector('aud-group')+' .branch-toggle');await stopped('ancestor-collapse');await session.click(selector('aud-group')+' .branch-toggle');
  await play('aud-a','same-node-document-switch');await session.execute('const t=window.__audioTest;t.saved["paused-second"]=document.querySelector(arguments[0])??t.saved.second;if(!t.saved["paused-second"])throw Error("Missing original second player reference");',[selector('aud-b')+' video']);await session.selectDocument(copy.id,copy.title);await stopped('same-node-document-switch');await stopped('paused-second');
  if(await session.execute('return document.querySelectorAll(".asset-video[src]").length;'))throw Error('New document mounted video sources automatically');
  return samples;
 }finally{await cleanupAudioProbe(session);}
}
