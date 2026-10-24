import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
import {useCdpExecution} from './lib/cdp-execution.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve(process.env.QINGTU_REPORT_DIR,'cdp-transport-validation.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={status:'running',scope:'Test transport equivalence; not an application performance gate',app,exeSha256:hash(await fs.readFile(app)),transportSha256:hash(await fs.readFile('scripts/lib/cdp-execution.mjs')),checks:[]};
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');let diagnostics,transport;
const assert=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message);};
try{
 await session.open(app);const info=await session.native('bootstrap');assert(path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Isolated test configuration');
 const syncScript='return {value:arguments[0],nil:null,yes:true,unicode:"勾股定理",array:[1,{text:"嵌套"}],origin:location.origin};';
 const args=[{x:1,text:'参数',list:[false,null,3.25]}];
 const oldSync=await session.execute(syncScript,args),oldAsync=await session.asyncScript('const done=arguments[arguments.length-1];setTimeout(()=>done(arguments[0]),20);',args);
 const oldDoc=await session.native('load_document',{id:'benchmark-m-v1'});
 let oldError=false;try{await session.execute('throw Error("transport sentinel");');}catch(error){oldError=String(error).includes('transport sentinel');}
 diagnostics=await DevTools.connect(session.capabilities['ms:edgeOptions'].debuggerAddress);
 const origin=await session.execute('return location.origin;');const target=(await diagnostics.request('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith(origin));
 const attached=await diagnostics.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});transport=await useCdpExecution(session,diagnostics,attached.sessionId);
 assert(isDeepStrictEqual(oldSync,await session.execute(syncScript,args)),'Synchronous arguments and nested JSON values match WebDriver');
 assert(isDeepStrictEqual(oldAsync,await session.asyncScript('const done=arguments[arguments.length-1];setTimeout(()=>done(arguments[0]),20);',args)),'Asynchronous callback and arguments match WebDriver');
 assert(isDeepStrictEqual(oldDoc,await session.native('load_document',{id:oldDoc.id})),'Full native document response matches WebDriver');
 let newError=false;try{await session.execute('throw Error("transport sentinel");');}catch(error){newError=String(error).includes('transport sentinel');}
 assert(oldError&&newError,'Synchronous exceptions reject in both transports');
 let asyncError=false;try{await session.asyncScript('throw Error("async sentinel");');}catch(error){asyncError=String(error).includes('async sentinel');}assert(asyncError,'Asynchronous synchronous-body exceptions reject');
 await session.refresh();await session.waitFor('return !!document.querySelector(".react-flow__pane");');assert(await session.execute('return location.origin;')===origin,'Refresh rebinds the new application context');
 assert((await session.native('bootstrap')).recentId===oldDoc.id,'Native commands remain usable after refresh');
 await transport.restore();transport=null;assert(await session.execute('return 42;')===42,'Restoring WebDriver leaves the session usable');
 report.browserVersion=session.capabilities.browserVersion;report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await transport?.restore().catch(()=>{});diagnostics?.close();await session.close();await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
