import fs from 'node:fs/promises';
import path from 'node:path';
const base='http://127.0.0.1:4447';
async function req(method,url,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const created=await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/最终验证 中文安装目录/qingtu.exe')}}}});
try{
 await new Promise(r=>setTimeout(r,1500));
 const view=await req('POST',`/session/${created.sessionId}/execute/sync`,{script:'return {devicePixelRatio,innerWidth,innerHeight,screenWidth:screen.width,screenHeight:screen.height,userAgent:navigator.userAgent};',args:[]});
 const file='.tooling/benchmark-native/environment.json';const environment=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));environment.View=view;environment.WebView2=created.capabilities.browserVersion;environment.BrowserName=created.capabilities.browserName;
 await fs.writeFile(file,JSON.stringify(environment,null,2));console.log(view,environment.WebView2);
}finally{await req('DELETE',`/session/${created.sessionId}`).catch(()=>{});}
