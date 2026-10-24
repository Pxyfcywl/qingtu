import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
const key=(session,value,shift=false)=>session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'key',id:'listKeyboard',actions:[...(shift?[{type:'keyDown',value:'\uE008'}]:[]),{type:'keyDown',value},{type:'keyUp',value},...(shift?[{type:'keyUp',value:'\uE008'}]:[])]}]});
const selector=(label,editable=true)=>(editable?'[contenteditable=true] ':'')+`li[data-list-number="${label}"]`;
const waitNumber=(session,label,editable=true)=>session.waitFor('return !!document.querySelector(arguments[0]);',[selector(label,editable)]);
export async function checkListIndent(session,{outline,check,shot,root}){
 await session.click('.home-tab');await session.waitFor('return !!document.querySelector(".library-home");');await session.execute('Array.from(document.querySelectorAll(".library-open-map")).find(el=>el.textContent.includes("列表缩进验证")).click();');await waitNumber(session,'2.',false);await session.click('[aria-label="编辑卡片正文"]');await waitNumber(session,'2.');
 await session.click(selector('2.')+' > p');await key(session,'\uE010');await key(session,'\uE004');await waitNumber(session,'1.1');
 check(await session.execute('return document.activeElement?.getAttribute("contenteditable")==="true";'),'真实 Tab 缩进为 1.1，焦点保留在正文');await key(session,'\uE007');
 await session.request('POST',`/session/${session.id}/actions`,{actions:[{type:'key',id:'listKeyboard',actions:Array.from('三级内容').flatMap(value=>[{type:'keyDown',value},{type:'keyUp',value}])}]});await key(session,'\uE004');await session.waitFor('return document.querySelector(arguments[0])?.textContent===arguments[1];',[selector('1.1.1')+' > p','三级内容']);
 check(await session.execute('const li=document.querySelector(arguments[0]);return getComputedStyle(li,"::before").content.includes("1.1.1");',[selector('1.1.1')]),'三级列表显示 1.1.1 实际编号');
 await key(session,'\uE004',true);await waitNumber(session,'1.2');check(true,'真实 Shift+Tab 提升一级并重新编号');await key(session,'\uE004');await waitNumber(session,'1.1.1');await shot('三级列表编辑.png');await session.click('[aria-label="完成编辑"]');await session.waitFor('return !!document.querySelector(".save-saved")&&!!document.querySelector(arguments[0]);',[selector('1.1.1',false)]);
 const saved=await session.native('load_document',{id:outline.id});check(Object.keys(saved.nodes).length===2,'列表 Tab 不会新增导图节点');await shot('三级列表阅读.png');const project=path.join(root,'三级列表.qmap');await session.native('export_project',{id:outline.id,path:project});const imported=await session.native('import_project',{path:project});check(isDeepStrictEqual(imported.nodes.card.body,saved.nodes.card.body),'项目导出导入保留真实列表层级');return saved.nodes.card.body;
}
