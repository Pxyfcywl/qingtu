import {sleep} from './native.mjs';
// Diagnostic only: actual video decode/playback and source-release assertions,
// without AudioContext/MediaElementSource/analyser. RMS is explicitly unmeasured.
export async function verifyMediaStateOnly(session,copy,samples=[]){
 await session.execute(`(()=>{
  const saved={},events=new WeakMap();
  const scan=()=>document.querySelectorAll('.asset-video').forEach(video=>{if(events.has(video))return;video.volume=.02;const list=[];events.set(video,list);for(const type of ['play','pause','emptied','loadstart','abort'])video.addEventListener(type,()=>{list.push({type,at:performance.now(),paused:video.paused,hasSrc:!!video.getAttribute('src')});if(list.length>12)list.shift();});});
  const observer=new MutationObserver(scan);observer.observe(document.body,{subtree:true,childList:true});scan();
  window.__mediaStateTest={saved,observer,save:(key,selector)=>saved[key]=document.querySelector(selector),sample:key=>{const v=saved[key];if(!v)throw Error('Missing video state reference '+key);return {rms:null,rmsMeasured:false,paused:v.paused,autoplay:v.autoplay,connected:v.isConnected,ready:v.readyState,network:v.networkState,src:v.getAttribute('src'),currentSrc:v.currentSrc,time:v.currentTime,width:v.videoWidth,height:v.videoHeight,volume:v.volume,error:v.error?.message??null,events:events.get(v)?.slice()??[]};}};
 })();`);
 const selector=id=>`[data-node-id="${id}"]`,save=(key,id)=>session.execute('window.__mediaStateTest.save(arguments[0],arguments[1]);',[key,selector(id)+' video']);
 const read=key=>session.execute('return window.__mediaStateTest.sample(arguments[0]);',[key]);
 const play=async(id,key)=>{
  const exists=await session.execute('return !!document.querySelector(arguments[0]);',[selector(id)+' video']);await session.click(selector(id)+(exists?' video':' [aria-label="播放视频"]'));
  if(exists){const result=await session.asyncScript('const done=arguments[arguments.length-1];document.querySelector(arguments[0]).play().then(()=>done({ok:true}),error=>done({error:String(error)}));',[selector(id)+' video']);if(!result.ok)throw Error(result.error);}
  await session.waitFor('const v=document.querySelector(arguments[0]);return v&&v.readyState>=2&&!v.paused;',[selector(id)+' video']);await save(key,id);await sleep(50);const value=await read(key);
  if(value.width<=0||value.height<=0||value.error)throw Error('Video failed actual decode: '+JSON.stringify(value));samples.push({case:key,phase:'playing',...value});
 };
 const stopped=async key=>{await sleep(180);const value=await read(key);samples.push({case:key,phase:'stopped',...value});if(!value.paused||value.src!==null)throw Error('Hidden video retained playback/source: '+JSON.stringify(value));};
 try{
  await play('aud-a','first');await play('aud-b','second');const first=await read('first');if(!first.paused)throw Error('First video continued after second');samples.push({case:'mutual-exclusion',...first});
  await play('aud-card','body-collapse');await session.click(selector('aud-card')+' .body-toggle');await stopped('body-collapse');
  await session.click(selector('aud-card')+' .body-toggle');await play('aud-card','ancestor-collapse');await session.click(selector('aud-group')+' .branch-toggle');await stopped('ancestor-collapse');await session.click(selector('aud-group')+' .branch-toggle');
  await play('aud-a','same-node-document-switch');await session.execute('const t=window.__mediaStateTest;t.saved["paused-second"]=document.querySelector(arguments[0])??t.saved.second;if(!t.saved["paused-second"])throw Error("Missing original second player reference");',[selector('aud-b')+' video']);await session.selectDocument(copy.id,copy.title);await stopped('same-node-document-switch');await stopped('paused-second');
  if(await session.execute('return document.querySelectorAll(".asset-video[src]").length;'))throw Error('New document mounted video sources');return samples;
 }finally{await session.execute('const t=window.__mediaStateTest;if(t){t.observer.disconnect();for(const v of Object.values(t.saved)){if(v){v.autoplay=false;v.pause();v.removeAttribute("src");v.load();v.pause();}}delete window.__mediaStateTest;}');}
}
