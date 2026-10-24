import path from 'node:path';
const name=process.argv[2]??'S';if(!['S','M','L'].includes(name))throw Error('Choose S, M or L');
const base=process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4447';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const session=(await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe')}}}})).sessionId;
try{await new Promise(r=>setTimeout(r,1500));const result=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke("load_document",{id:arguments[0]}).then(doc=>done({ok:true,id:doc.id}),error=>done({error:String(error)}));',args:['benchmark-'+name.toLowerCase()+'-v1']});if(!result.ok)throw Error(result.error);console.log(result);}finally{await req('DELETE',`/session/${session}`).catch(()=>{});}
