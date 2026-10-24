import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {saveNew,nodeHash} from './lib/soak-actions.mjs';
import {contentDocument,paragraph,hashBytes} from './lib/content-fixture.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 验证安装/qingtu.exe');
const root=path.resolve('.tooling/content-security',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');
const report={caseId:'T20-native-content-five-per-category',status:'running',app,exeSha256:hashBytes(await fs.readFile(app)),testScriptSha256:hashBytes(await fs.readFile('scripts/desktop-content-security.mjs')),samples:[],started:new Date().toISOString()};
const ids=[];let original;
const assert=(value,message)=>{if(!value)throw Error(message);};
async function rejected(command,args){let error;try{await session.native(command,args);}catch(e){error=String(e);}assert(error,'Unexpectedly accepted '+command);return error;}
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');
 assert(info.initialized&&path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Use an isolated test configuration');original=info.recentId;
 report.browserVersion=session.capabilities.browserVersion;report.configPath=info.configPath;
 const execute='window.__securityExecutionCount=(window.__securityExecutionCount??0)+1';
 const scripts=[`<script>${execute}</script>`,`<img src=x onerror="${execute}">`,`<svg onload="${execute}"></svg>`,`<iframe srcdoc="<script>${execute}</script>"></iframe>`,`</span><a onclick="${execute}">click</a>`];
 const urls=[`javascript:${execute}`,`data:text/html,<script>${execute}</script>`,`vbscript:msgbox(1)`,'file:///C:/Windows/win.ini','ms-settings:'];
 const formulas=['\\href{javascript:alert(1)}{x}','\\includegraphics{https://qingtu-invalid.example/x.png}','\\htmlClass{owned}{x}','\\htmlStyle{background:url(https://qingtu-invalid.example/x)}{x}','\\def\\a{\\a}\\a'];
 const groups=[['script',scripts.map(paragraph)],['url',urls.map((href,i)=>({type:'paragraph',content:[{type:'text',text:'危险链接 '+i,marks:[{type:'link',attrs:{href}}]}]}))],['formula',formulas.map(latex=>({type:'mathBlock',attrs:{latex}}))]];
 for(const [category,content] of groups){
  const doc=contentDocument('安全内容 '+category,{type:'doc',content});await saveNew(session,doc);ids.push(doc.id);
  await session.native('load_document',{id:doc.id});await session.refresh();
  await session.waitFor('return !!document.querySelector(".node-card .rich-doc");');
  // A script executing during startup is also caught: every fixture only increments this sentinel.
  await sleep(500);if(category==='formula')await session.waitFor('return [...document.querySelectorAll(".math-block")].length===5&&[...document.querySelectorAll(".math-block")].every(e=>e.querySelector("span"));');
  const actual=await session.execute(`const body=document.querySelector('.node-card .rich-doc');return {executions:window.__securityExecutionCount??0,links:[...body.querySelectorAll('a')].map(a=>a.getAttribute('href')),injectedElements:body.querySelectorAll('script,iframe,svg,img[onerror],[onclick],[onload],.owned').length,formulas:body.querySelectorAll('.math-block').length,health:!!document.querySelector('[data-node-id="health"]'),error:document.querySelector('[role=alert]')?.textContent??null,text:body.textContent};`);
  assert(actual.executions===0&&actual.injectedElements===0&&actual.links.length===0&&actual.health&&!actual.error,'Unsafe rendering: '+JSON.stringify(actual));
  if(category==='script')for(const sample of scripts)assert(actual.text.includes(sample),'Script text was not preserved literally');
  assert(nodeHash(await session.native('load_document',{id:doc.id}))===nodeHash(doc),'Content changed after rendering');
  for(let i=0;i<5;i++)report.samples.push({category,index:i+1,payload:category==='script'?scripts[i]:category==='url'?urls[i]:formulas[i],result:'inert; healthy sibling and stored nodes unchanged'});
  await fs.writeFile(path.join(root,category+'.png'),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
 }
 const before=await session.native('bootstrap');
 for(const [index,id] of ['../../outside','C:\\Windows\\win.ini','/etc/passwd','..\\..\\outside','..%2f..%2foutside'].entries()){
  const error=await rejected('get_asset_path',{id,thumbnail:false});report.samples.push({category:'asset-path',index:index+1,payload:id,error});
 }
 for(const [index,ext]of ['png','jpg','webp','mp4','mp4'].entries()){
  const bytes=Buffer.from(`<script>${execute}</script> fake ${ext} ${index}`),file=path.join(root,`fake-${index}.${ext}`);await fs.writeFile(file,bytes);
  const error=await rejected('import_asset',{path:file});report.samples.push({category:'fake-media',index:index+1,payload:file,sha256:hashBytes(bytes),error});
 }
 const sqlError=await rejected('execute_sql',{sql:'SELECT 1'});
 const lookupPayload="x' OR 1=1 --",lookupError=await rejected('get_asset_path',{id:lookupPayload,thumbnail:false});
 const after=await session.native('bootstrap');assert(JSON.stringify(before.documents)===JSON.stringify(after.documents)&&JSON.stringify(before.assets)===JSON.stringify(after.assets),'Rejected input changed library');
 report.arbitrarySqlCommand={error:sqlError};report.parameterizedAssetLookup={payload:lookupPayload,error:lookupError};report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{
 if(session.id&&original){await session.native('load_document',{id:original}).catch(()=>{});await session.refresh().catch(()=>{});}
 if(report.status==='passed')for(const id of ids)await session.native('delete_document',{id});
 report.retainedTestDocuments=report.status==='passed'?[]:ids;await session.close();report.finished=new Date().toISOString();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,...report},null,2));
}
