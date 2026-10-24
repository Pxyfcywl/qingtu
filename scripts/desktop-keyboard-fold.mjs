import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';
import {waitSaved} from './lib/soak-actions.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP),output=path.resolve(process.env.QINGTU_REPORT_DIR);
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4447');
const report={caseId:'native-fold-keyboard-focus-and-anchor',app,exeSha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),status:'running',checks:[]};
const assert=(value,message)=>{if(!value)throw Error(message);report.checks.push(message);};
async function key(value){await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'key',id:'fold-keyboard',actions:[{type:'keyDown',value},{type:'keyUp',value}]}]});await sleep(150);}
let selector='.node-card .body-toggle';
async function state(){return session.execute('const b=document.querySelector(arguments[0]),c=b.closest(".node-card"),h=c.querySelector(".card-header").getBoundingClientRect();return {expanded:b.getAttribute("aria-expanded"),focused:document.activeElement===b,body:!!c.querySelector(".card-body"),x:h.x,y:h.y,height:h.height};',[selector]);}
try{
 await session.open(app);await session.resizeViewport(1440,844);const info=await session.native('bootstrap');
 assert(path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Isolated test configuration');
 const original=await session.native('load_document',{id:info.recentId}),count=Object.keys(original.nodes).length;
 const cardId=Object.values(original.nodes).find(n=>n.kind==='card'&&n.title==='勾股定理')?.id;
 if(!cardId)throw Error('Expected example card not found');selector=`[data-node-id="${cardId}"] .body-toggle`;
 await session.waitFor('return !!document.querySelector(arguments[0]);',[selector]);await sleep(500);
 const before=await state();assert(before.body,'Example card initially expanded');
 await session.execute('document.querySelector(arguments[0]).focus();',[selector]);
 await key('\uE007');await waitSaved(session);const collapsed=await state();
 assert(!collapsed.body&&collapsed.expanded==='false'&&collapsed.focused,'Enter folds body and retains keyboard focus');
 await key(' ');await waitSaved(session);const expanded=await state();
 assert(expanded.body&&expanded.expanded==='true'&&expanded.focused,'Space expands body and retains keyboard focus');
 await key('\uE004');assert(!(await state()).focused,'Tab navigates without adding a node');
 const saved=await session.native('load_document',{id:original.id});assert(Object.keys(saved.nodes).length===count,'Keyboard actions do not create extra nodes');
 const drift=Math.max(Math.hypot(collapsed.x-before.x,collapsed.y-before.y),Math.hypot(expanded.x-before.x,expanded.y-before.y));
 report.geometry={before,collapsed,expanded,maxDriftPx:drift};assert(drift<=2,'Header anchor drift is at most 2 px');
 assert(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'No visible application error');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{await session.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'keyboard-fold.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
