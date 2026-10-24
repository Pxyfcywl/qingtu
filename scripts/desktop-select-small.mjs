import path from 'node:path';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:4446';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve('.tooling/target/release/qingtu.exe')}}}})).sessionId;
try{
 await new Promise(r=>setTimeout(r,1500));
 const fixture=JSON.parse(await fs.readFile('.tooling/fixtures/small.json','utf8'));
 const loaded=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke("load_document",{id:arguments[0]}).then(value=>done({ok:true,id:value.id}),error=>done({error:String(error)}));',args:[fixture.id]});
 if(!loaded.ok)throw Error(loaded.error);console.log(loaded);
}finally{await req('DELETE',`/session/${session}`).catch(()=>{});}
