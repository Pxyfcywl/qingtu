import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {sleep} from './native.mjs';
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const nodeHash=doc=>crypto.createHash('sha256').update(JSON.stringify(sorted(doc.nodes))).digest('hex');
export async function saveNew(session,doc){return session.native('save_document',{patch:{document:doc,upserts:Object.values(doc.nodes),removedIds:[],baseRevision:0,commandId:crypto.randomUUID()}});}
export async function waitSaved(session){await session.waitFor('return document.querySelector(".save-indicator")?.textContent.includes("已保存");',[],15000);}
export async function verifyCanceledExport(session,destination){
 await session.execute(`window.dispatchEvent(new CustomEvent('qingtu-export-png',{detail:arguments[0]}));document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`,[destination]);
 await sleep(500);await session.waitFor('return !document.querySelector(".busy-overlay,.react-flow__viewport.exporting");');
 const exists=await fs.stat(destination).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
 if(exists)throw Error('Canceled export still wrote a file');return {fileWritten:false,overlayCleared:true};
}
export async function exerciseDocument(session,doc,readSaved){
 await session.selectDocument(doc.id,doc.title);await sleep(800);
 const root=`[data-node-id="${doc.rootId}"] .branch-toggle`;
 await session.click(root);await session.waitFor('return document.querySelectorAll(".mind-node").length===1;');
 await session.click(root);await session.waitFor('return document.querySelectorAll(".mind-node").length>1;');await sleep(500);
 const id=await session.execute(`const nodes=Array.from(document.querySelectorAll('.mind-node:not(.root-node) .drag-handle'));const selected=nodes.find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.x>140&&r.y>120&&r.right<innerWidth-30&&r.bottom<innerHeight-110;});return selected?.closest('[data-node-id]').dataset.nodeId;`);
 if(!id)throw Error('No visible safe node for Delete/Undo');
 await session.click(`[data-node-id="${id}"] .drag-handle`);
 await session.execute(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));`);
 await session.waitFor('return !document.querySelector(arguments[0]);',[`[data-node-id="${id}"]`]);
 await session.execute(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));`);
 await session.waitFor('return !!document.querySelector(arguments[0]);',[`[data-node-id="${id}"]`]);await waitSaved(session);
 const actual=readSaved?await readSaved(doc.id):await session.native('load_document',{id:doc.id});if(nodeHash(actual)!==nodeHash(doc))throw Error('Delete/Undo or fold changed canonical node data');
 return {deletedAndRestored:id,revision:actual.revision,nodes:Object.keys(actual.nodes).length,verificationMethod:readSaved?'readonly test database snapshot in external harness':'extra full load_document IPC'};
}
