import { call,chooseAsset,chooseProject,savePath } from './bridge';
import { getState,editDocument,patchState,showError,addAsset,flushSave,activateDocument,refreshLibrary } from './state';
import { addChild,removeNode,reparent } from './domain/tree';
import type { NodeKind,MindDocument,Asset } from './domain/types';
import { commitDrafts } from './editing';
import {startOperation} from './operations';
import {importLocalMedia,importMediaFile} from './media-import';

export function addNode(requestedKind?:NodeKind,parentId?:string,sibling=false) {
  try{commitDrafts();}catch(error){showError(error);return;}
  const current=getState();if(!current.doc)return;
  const kind=requestedKind??current.library?.defaultNodeKind??'text';
  let id=parentId??current.selectedId??current.doc.rootId;
  if(sibling)id=current.doc.nodes[id].parentId??current.doc.rootId;
  let created='';
  editDocument(doc=>{created=addChild(doc,id,kind);});
  if(created){patchState({selectedId:created,titleEditing:kind==='text'||kind==='card'?created:null,editingId:null});
    if(kind==='image'||kind==='video')void replaceMedia(created);}
}
export function deleteSelected() {
  try{commitDrafts();}catch(error){showError(error);return;}
  const s=getState();if(!s.doc||!s.selectedId)return;
  const parent=s.doc.nodes[s.selectedId]?.parentId;
  editDocument(d=>removeNode(d,s.selectedId!));if(parent)patchState({selectedId:parent,editingId:null,titleEditing:null});
}
export async function importFiles(files:File[],targetId?:string,drop?:{position:{x:number;y:number};positions:Record<string,{x:number;y:number}>}){
  try{commitDrafts();}catch(error){showError(error);return;}
  const origin=getState(),docId=origin.doc?.id,storage=origin.library?.storagePath,target=targetId??origin.selectedId??origin.doc?.rootId;
  if(!origin.doc||!target)return;
  const operation=startOperation('media-import');const current=()=>!operation.signal.aborted&&getState().doc?.id===docId&&getState().library?.storagePath===storage&&!!getState().doc?.nodes[target];
  try{patchState({busy:'正在导入本地媒体…'});const assets:Asset[]=[];
    for(const file of files){const asset=await importMediaFile(file,operation.signal);if(!current())return;assets.push(asset);}
    if(!current())return;assets.forEach(addAsset);let selected=target;
    editDocument(doc=>{const node=doc.nodes[target],intoCard=node.kind==='card'&&!drop;if(drop){doc.layoutMode='free';for(const [id,position] of Object.entries(drop.positions))if(doc.nodes[id])doc.nodes[id].position=position;}
      for(const [index,asset] of assets.entries()){
      const kind=asset.mime.startsWith('video/')?'video':'image';
      if(intoCard)(node.body.content??=[]).push({type:kind==='video'?'video':'assetImage',attrs:{assetId:asset.id,alt:asset.name}});
      else{const id=addChild(doc,target,kind);doc.nodes[id].assetId=asset.id;doc.nodes[id].altText=asset.name;if(drop)doc.nodes[id].position={x:drop.position.x+index*35,y:drop.position.y+index*35};selected=id;}
    }if(intoCard)node.contentCollapsed=false;});patchState({selectedId:selected,editingId:null,titleEditing:null});
  }catch(error){if(current())showError(error);}
  finally{if(operation.isCurrent()&&getState().busy==='正在导入本地媒体…')patchState({busy:''});operation.finish();}
}
export function moveToParent(target:string) {
  try{commitDrafts();}catch(error){showError(error);return;}
  const s=getState();if(!s.selectedId)return;
  editDocument(d=>reparent(d,s.selectedId!,target));
}
export async function replaceMedia(id:string) {
  try{commitDrafts();}catch(error){showError(error);return;}
  const origin=getState(),docId=origin.doc?.id,storage=origin.library?.storagePath;
  const kind=origin.doc?.nodes[id]?.kind;if(kind!=='image'&&kind!=='video')return;
  const operation=startOperation('media-import');
  const current=()=>!operation.signal.aborted&&getState().doc?.id===docId&&getState().library?.storagePath===storage&&getState().doc?.nodes[id]?.kind===kind;
  try {
    const path=await chooseAsset(kind);if(!path||!current())return;
    patchState({busy:'正在导入本地媒体…'});
    const asset=await importLocalMedia(path,kind,operation.signal);if(!current())return;
    addAsset(asset);editDocument(d=>{if(d.nodes[id]){d.nodes[id].assetId=asset.id;d.nodes[id].altText=asset.name;}});
  }catch(error){if(current())showError(error);}
  finally{if(operation.isCurrent()&&getState().busy==='正在导入本地媒体…')patchState({busy:''});operation.finish();}
}
export async function importProject(path?:string) {
  try {
    const filename=path??await chooseProject();if(!filename)return;
    await flushSave();patchState({busy:'正在校验并打开项目…'});
    const doc=await call<MindDocument>('import_project',{path:filename});
    await refreshLibrary();await activateDocument(doc);patchState({busy:'',notice:'项目已作为新文档导入，原文件保持不变'});
  }catch(error){showError(error);}
}
export async function exportProject() {
  try {
    commitDrafts();
    const initial=getState().doc;if(!initial)return;
    const path=await savePath('导出完整项目',initial.title+'.qmap','qmap');if(!path)return;
    const doc=getState().doc;if(!doc||doc.id!==initial.id)throw new Error('当前文档已切换，请重新导出');
    patchState({busy:'正在导出完整项目…'});await call('export_snapshot',{document:doc,path});
    patchState({busy:'',notice:getState().saving==='saved'?'项目已导出，包含全部内容和原始媒体':'当前内容已导出；资料库仍有未保存内容，请保留备份'});
  }catch(error){showError(error);}
}
export async function exportPng() {
  try {
    commitDrafts();
    const doc=getState().doc;if(!doc)return;patchState({editingId:null,titleEditing:null});
    const path=await savePath('导出可见导图',doc.title+'.png','png');if(!path)return;
    if(getState().doc?.id!==doc.id)throw new Error('当前文档已切换，请重新导出');
    patchState({busy:'正在生成导图图片…'});
    window.dispatchEvent(new CustomEvent('qingtu-export-png',{detail:path}));
  }catch(error){showError(error);}
}
