import path from 'node:path';
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class NativeSession{
 constructor(base='http://127.0.0.1:4447'){this.base=base;}
 async request(method,url,body){const response=await fetch(this.base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result.value??result));return result.value;}
 async open(app){const result=await this.request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve(app)}}}});this.id=result.sessionId;this.capabilities=result.capabilities;await sleep(1500);return this;}
 execute(script,args=[]){return this.request('POST',`/session/${this.id}/execute/sync`,{script,args});}
 asyncScript(script,args=[]){return this.request('POST',`/session/${this.id}/execute/async`,{script,args});}
 async native(command,args={}){const result=await this.asyncScript('const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({error:String(error)}));',[command,args]);if(!result.ok)throw Error(result.error);return result.value;}
 async click(selector){const element=await this.request('POST',`/session/${this.id}/element`,{using:'css selector',value:selector});await this.request('POST',`/session/${this.id}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,{});}
 refresh(){return this.request('POST',`/session/${this.id}/refresh`,{});}
 async resizeViewport(width,height){
  for(let attempt=0;attempt<3;attempt++){
   const viewport=await this.execute('return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};');
   if(viewport.width===width&&viewport.height===height)return viewport;
   const rect=await this.request('GET',`/session/${this.id}/window/rect`);
   await this.request('POST',`/session/${this.id}/window/rect`,{width:rect.width+width-viewport.width,height:rect.height+height-viewport.height});await sleep(150);
  }throw Error('Could not establish the requested viewport');
 }
 async close(){if(this.id){await this.request('DELETE',`/session/${this.id}`).catch(()=>{});this.id=null;}}
 async waitFor(script,args=[],timeout=10000){const deadline=performance.now()+timeout;while(performance.now()<deadline){const value=await this.execute(script,args);if(value)return value;await sleep(50);}throw Error('Condition timed out: '+script);}
 async selectDocument(id,title){await this.click('.document-button');await this.waitFor('return Array.from(document.querySelectorAll(".document-list button")).some(e=>e.textContent.includes(arguments[0]));',[title]);await this.execute('Array.from(document.querySelectorAll(".document-list button")).find(e=>e.textContent.includes(arguments[0])).click();',[title]);await this.waitFor('return document.querySelector(".document-button")?.textContent.includes(arguments[0])&&!document.querySelector(".busy-overlay");',[title]);await sleep(150);const info=await this.native('bootstrap');if(info.recentId!==id)throw Error('Document selection did not reach expected ID');}
}
