import {sleep} from './native.mjs';
import {centerWorld,stableScene} from './layout-capture.mjs';
import {nodeHash,waitSaved} from './soak-actions.mjs';
import {inspectTree} from './tree-oracle.mjs';
import {visibleModel} from './png-audit.mjs';

export async function selectForLayout(session,devtools,target,id){
 await centerWorld(session,devtools,target,id);
 await session.execute('document.querySelector(arguments[0]).closest(".react-flow__node").click();',[`[data-node-id="${id}"]`]);
}
async function inspector(session){if(!await session.execute('return !!document.querySelector(".inspector");'))await session.click('[aria-label="节点属性"]');}
export async function performLayoutAction(context,kind,run){
 const {session:s,devtools,target,documentId,added}=context,previous=context.doc;
 const expected=structuredClone(previous),result={kind,run};let fresh;
 if(kind==='add'){
  await selectForLayout(s,devtools,target,previous.rootId);await s.click('[aria-label="添加文字节点 Tab"]');await s.waitFor('return !!document.querySelector(".node-title-input");');await s.execute('document.querySelector(".node-title-input").blur();');
 }else if(kind==='delete'){
  const id=added.pop();if(!id)throw Error('Delete requires the preceding add workload');await selectForLayout(s,devtools,target,id);await s.execute('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true}));');
  const parent=expected.nodes[id].parentId;expected.nodes[parent].childIds=expected.nodes[parent].childIds.filter(child=>child!==id);delete expected.nodes[id];result.node=id;
 }else if(kind==='fold'){
  const id=context.cardId,field=run%4===1||run%4===2?'contentCollapsed':'childrenCollapsed',button=field==='contentCollapsed'?'.body-toggle':'.branch-toggle';
  await selectForLayout(s,devtools,target,id);result.beforeHeader=await header(s,id);await s.click(`[data-node-id="${id}"] ${button}`);await stableScene(s);result.afterHeader=await header(s,id);result.anchorDrift=Math.hypot(result.beforeHeader.x-result.afterHeader.x,result.beforeHeader.y-result.afterHeader.y);
  if(result.anchorDrift>2)throw Error('Fold anchor drift exceeds 2 CSS px');expected.nodes[id][field]=!previous.nodes[id][field];result.node=id;result.field=field;
 }else if(kind==='width'){
  const id=context.cardId,width=240+(run-1)*20;await selectForLayout(s,devtools,target,id);await inspector(s);
  await s.execute('const input=document.querySelector(".inspector input[type=range]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,String(arguments[0]));input.dispatchEvent(new Event("input",{bubbles:true}));',[width]);expected.nodes[id].preferredWidth=width;result.node=id;result.width=width;
 }else if(kind==='side'){
  const id=previous.nodes[previous.rootId].childIds[0],side=previous.nodes[id].side==='left'?'right':'left';await selectForLayout(s,devtools,target,id);await inspector(s);
  await s.execute('const label=[...document.querySelectorAll(".inspector label")].find(e=>e.textContent.includes("主分支方向")),input=label.querySelector("select");input.value=arguments[0];input.dispatchEvent(new Event("change",{bubbles:true}));',[side]);expected.nodes[id].side=side;result.node=id;result.side=side;
 }else if(kind==='image'){
  await s.refresh();await s.waitFor('return !!document.querySelector(".mind-node")&&!document.querySelector(".busy-overlay");',[],30000);await stableScene(s);result.method='Actual WebView reload followed by normal viewport patrol; observe decoded asset-image load events';
 }else throw Error('Unknown layout workload');
 await sleep(70);await waitSaved(s);const saved=await s.native('load_document',{id:documentId});inspectTree(saved);
 if(kind==='add'){
  const ids=Object.keys(saved.nodes).filter(id=>!previous.nodes[id]);if(ids.length!==1)throw Error('Add must create exactly one node');fresh=ids[0];const node=saved.nodes[fresh];
  if(node.parentId!==previous.rootId||node.kind!=='text'||node.title!=='新想法'||node.childIds.length!==0||node.childrenCollapsed||node.contentCollapsed||!Number.isFinite(node.position.x)||!Number.isFinite(node.position.y))throw Error('New leaf invariant failed');
  expected.nodes[fresh]=node;expected.nodes[previous.rootId].childIds.push(fresh);expected.nodes[previous.rootId].childrenCollapsed=false;added.push(fresh);result.node=fresh;
 }
 if(nodeHash(saved)!==nodeHash(expected))throw Error('Unexpected node-data change in '+kind+' '+run);
 if(saved.layoutMode!=='auto')throw Error('Workload left automatic layout');context.doc=saved;result.modelHash=nodeHash(saved);result.visibleNodes=visibleModel(saved).length;return result;
}
async function header(session,id){return session.execute('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x,y:r.y};',[`[data-node-id="${id}"] .card-header`]);}
