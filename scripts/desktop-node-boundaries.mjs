import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession} from './lib/native.mjs';
import {saveNew,waitSaved} from './lib/soak-actions.mjs';
import {hashBytes} from './lib/content-fixture.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 验证安装/qingtu.exe');
const output=path.resolve('.tooling/node-boundaries',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={caseId:'F01-native-node-depth-boundaries',status:'running',app,exeSha256:hashBytes(await fs.readFile(app)),checks:[],started:new Date().toISOString(),scope:'5000 mixed nodes: native save/reopen and real UI add refusal; depth 100/101: native persistence. Not a layout/performance benchmark.'};
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448'),ids=[];let original;
const assert=(value,message)=>{if(!value)throw Error(message);};
async function fixture(name){const file=path.resolve('validation/fixtures/0.1.2/boundaries',name+'.json'),bytes=await fs.readFile(file);report.inputs??=[];report.inputs.push({name,sha256:hashBytes(bytes)});return JSON.parse(bytes);}
async function rejectReplacement(current,replacement,expected){
 replacement.id=current.id;replacement.revision=current.revision;let error;
 try{await session.native('save_document',{patch:{document:replacement,upserts:Object.values(replacement.nodes),removedIds:[],baseRevision:current.revision,commandId:crypto.randomUUID()}});}catch(e){error=String(e);}
 assert(error&&expected.test(error),'Wrong/missing native rejection: '+error);
 const after=await session.native('load_document',{id:current.id});assert(isDeepStrictEqual(after,current),'Rejected native replacement altered committed document');return error;
}
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');
 assert(info.initialized&&path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Use isolated test configuration');original=info.recentId;
 report.configPath=info.configPath;report.browserVersion=session.capabilities.browserVersion;
 const x=await fixture('X-5000');x.id='node-boundary-'+crypto.randomUUID();await saveNew(session,x);ids.push(x.id);
 const saved=await session.native('load_document',{id:x.id});assert(Object.keys(saved.nodes).length===5000&&isDeepStrictEqual(saved.nodes,x.nodes),'5000-node native round trip changed nodes');
 await session.refresh();await session.waitFor('return document.querySelector(".root-node .branch-toggle")?.textContent.includes("4999");',[],20000);await waitSaved(session);
 report.checks.push({case:'native-5000-save-and-reopen',status:'passed',nodes:5000,revision:saved.revision,collapsedDescendants:4999});
 const before=await session.native('load_document',{id:x.id});await session.click('[aria-label="添加文字节点 Tab"]');
 const error=await session.waitFor('return document.querySelector("[role=alert]")?.textContent;');assert(error.includes('5000'),'Missing capacity explanation');
 assert(await session.execute('return !document.querySelector(".node-title-input");'),'Rejected add created a title editor');
 assert(isDeepStrictEqual(await session.native('load_document',{id:x.id}),before),'Rejected UI add changed persisted document');
 const screenshot='capacity-refusal.png';await fs.writeFile(path.join(output,screenshot),Buffer.from(await session.request('GET',`/session/${session.id}/screenshot`),'base64'));
 report.checks.push({case:'real-ui-5001st-add-refused',status:'passed',error,screenshot,committedDocumentUnchanged:true});await session.click('.error-toast button');
 const bad=await fixture('X-5001-invalid'),countError=await rejectReplacement(before,bad,/节点数量/);report.checks.push({case:'native-5001-replacement-refused',status:'passed',error:countError,committedDocumentUnchanged:true});
 const depth=await fixture('depth-100');depth.id='depth-boundary-'+crypto.randomUUID();await saveNew(session,depth);ids.push(depth.id);
 const depthSaved=await session.native('load_document',{id:depth.id});assert(isDeepStrictEqual(depthSaved.nodes,depth.nodes),'Depth-100 persisted nodes changed');report.checks.push({case:'native-depth-100-save-and-reopen',status:'passed',nodes:100});
 const tooDeep=await fixture('depth-101-invalid'),depthError=await rejectReplacement(depthSaved,tooDeep,/树深度/);report.checks.push({case:'native-depth-101-replacement-refused',status:'passed',error:depthError,committedDocumentUnchanged:true});
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{
 if(session.id&&original){await session.native('load_document',{id:original}).catch(()=>{});await session.refresh().catch(()=>{});}
 if(report.status==='passed')for(const id of ids)await session.native('delete_document',{id});
 report.retainedTestDocuments=report.status==='passed'?[]:ids;await session.close();report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...report},null,2));
}
