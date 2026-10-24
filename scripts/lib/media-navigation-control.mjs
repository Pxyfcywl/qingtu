import {sleep} from './native.mjs';
// Diagnostic control: keep the audio-document visits and fold operations,
// but never attach a video source or create AudioContext/analyser objects.
export async function verifyMediaNavigationOnly(session,copy,samples=[]){
 const observe=async phase=>{const value=await session.execute('return {sources:document.querySelectorAll(".asset-video[src]").length,videos:document.querySelectorAll(".asset-video").length,context:!!window.__audioTest};');if(value.sources||value.videos||value.context)throw Error('Navigation-only control unexpectedly mounted playback/instrumentation');samples.push({phase,...value,playback:false,rmsMeasured:false});};
 await observe('start');
 for(const [id,button]of [['aud-card','.body-toggle'],['aud-card','.body-toggle'],['aud-group','.branch-toggle'],['aud-group','.branch-toggle']]){
  await session.click(`[data-node-id="${id}"] ${button}`);await sleep(100);await observe(id+button);
 }
 await session.selectDocument(copy.id,copy.title);await observe('same-node-document-switch');return samples;
}
