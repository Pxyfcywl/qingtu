export const selectNode=(s,id)=>s.execute('document.querySelector(arguments[0]).closest(".react-flow__node").click();',[`[data-node-id="${id}"]`]);
export async function openInspector(s){if(!await s.execute('return !!document.querySelector(".inspector");'))await s.click('[aria-label="节点属性"]');}
export async function enterText(s,selector,text){
 const element=await s.request('POST',`/session/${s.id}/element`,{using:'css selector',value:selector});
 await s.request('POST',`/session/${s.id}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:'\uE009a\uE000\uE003'+text});
}
export async function pressKey(s,value){await s.request('POST',`/session/${s.id}/actions`,{actions:[{type:'key',id:'history-keyboard',actions:[{type:'keyDown',value},{type:'keyUp',value}]}]});}
export async function dragHeader(s,id,dx,dy){
 const p=await s.execute('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.round(r.left+18),y:Math.round(r.top+r.height/2)};',[`[data-node-id="${id}"] .drag-handle`]);
 await s.request('POST',`/session/${s.id}/actions`,{actions:[{type:'pointer',id:'history-pointer',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:p.x,y:p.y},{type:'pointerDown',button:0},{type:'pointerMove',duration:20,origin:'viewport',x:p.x+4,y:p.y+3},{type:'pointerMove',duration:140,origin:'viewport',x:p.x+dx,y:p.y+dy},{type:'pointerUp',button:0}]}]});
}
export const changeParent=(s,target)=>s.execute('const label=Array.from(document.querySelectorAll(".inspector label")).find(l=>l.textContent.includes("移动到父节点")),select=label.querySelector("select");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}));',[target]);
