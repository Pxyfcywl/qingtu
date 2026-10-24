import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const endpoint='http://127.0.0.1:4446';
async function req(method,url,body){const r=await fetch(endpoint+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(v.value?.error)throw Error(JSON.stringify(v.value));return v.value;}
const created=await req('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve('.tooling/target/release/qingtu.exe')}}}});
const session=created.sessionId;
async function native(name,args={}){const r=await req('POST',`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error)}));',args:[name,args]});if(!r.ok)throw Error(r.error);return r.value;}
try{
 await new Promise(r=>setTimeout(r,1500));const info=await native('bootstrap');
 const source=await native('load_document',{id:info.documents.find(d=>d.title==='数学学习地图')?.id??info.documents[0].id});
 const doc=structuredClone(source);doc.id=crypto.randomUUID();doc.title='S40 真实内容验收样例';doc.revision=0;
 const all=Object.values(doc.nodes);all.forEach(n=>n.childrenCollapsed=false);
 const root=doc.nodes[doc.rootId];
 const counts=()=>Object.values(doc.nodes).reduce((sum,n)=>(sum[n.kind]++,sum),{text:0,card:0,image:0,video:0});
 const sampleText='学习时先理解问题，再画出关系，记录关键条件，并用例题检查推导过程。';
 const blank=()=>({type:'doc',content:[{type:'paragraph'}]});
 for(const [kind,target] of Object.entries({card:10,image:4,video:1,text:25})){
   while(counts()[kind]<target){const id=crypto.randomUUID();const index=Object.keys(doc.nodes).length;
     const parent=index%2===0?root:doc.nodes[root.childIds[0]];
     const node={id,kind,parentId:parent.id,childIds:[],title:`知识整理与学习记录${index}`,body:blank(),side:'right',color:['teal','blue','orange','rose'][index%4],position:{x:300,y:80},contentCollapsed:false,childrenCollapsed:false};
     if(kind==='card')node.body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:sampleText.repeat(20).slice(0,490)}]}]};
     if(kind==='image'){node.assetId=info.assets.find(a=>a.mime.startsWith('image/')).id;node.title='';}
     if(kind==='video'){node.assetId=info.assets.find(a=>a.mime==='video/mp4').id;node.title='';}
     doc.nodes[id]=node;parent.childIds.push(id);
   }
 }
 const result=await native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});
 const loaded=await native('load_document',{id:doc.id});const hash=crypto.createHash('sha256').update(JSON.stringify(loaded)).digest('hex');
 await fs.mkdir('.tooling/fixtures',{recursive:true});await fs.writeFile('.tooling/fixtures/small.json',JSON.stringify(loaded,null,2));
 await fs.writeFile('.tooling/fixtures/small-manifest.json',JSON.stringify({id:doc.id,counts:counts(),hash,revision:result.revision,note:'40 real content nodes; image bytes reused. S workload only, not M/L 50 MiB benchmark.'},null,2));
 console.log({id:doc.id,counts:counts(),hash});
}finally{await req('DELETE',`/session/${session}`).catch(()=>{});}
