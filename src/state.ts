import { useSyncExternalStore } from 'react';
import {Immer} from 'immer';
import { call, libraryInfo } from './bridge';
import { newDocument, validateDocument } from './domain/tree';
import { uid, type Asset, type LibraryInfo, type LibraryWorkspace, type MindDocument,type NodeKind } from './domain/types';
import { commitDrafts,hasComposingDraft } from './editing';
import {cancelOperations} from './operations';

export type AppSnapshot = {
  doc: MindDocument | null; library: LibraryInfo | null; selectedId: string | null; editingId: string | null;
  titleEditing: string | null; error: string; notice: string; saving: 'saved' | 'dirty' | 'saving' | 'error';
  canUndo: boolean; canRedo: boolean; busy: string;
  preferenceSaving:boolean;
};
let snapshot: AppSnapshot = {doc:null,library:null,selectedId:null,editingId:null,titleEditing:null,error:'',notice:'',saving:'saved',canUndo:false,canRedo:false,busy:'',preferenceSaving:false};
const listeners = new Set<() => void>();
export const getState = () => snapshot;
export function patchState(next: Partial<AppSnapshot>) { snapshot = { ...snapshot,...next }; listeners.forEach(f=>f()); }
export const useApp = () => useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getState);
export const useAppValue = <T,>(selector:(state:AppSnapshot)=>T) => useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>selector(snapshot));
const undo: MindDocument[] = [], redo: MindDocument[] = [];
const undoWeights:number[]=[];
let historyBytes=0,lastGroup='',lastEdit=0;
let persisted: MindDocument | null = null;
let baseRevision = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Promise<void> | null = null;
let firstDirty = 0;
let workspaceSave:Promise<void>=Promise.resolve();
export const emptyWorkspace=():LibraryWorkspace=>({folders:[],documentFolders:{},openIds:[]});
export function updateWorkspace(change:(workspace:LibraryWorkspace)=>void):Promise<void> {
  const library=snapshot.library;if(!library)return Promise.resolve();
  const previous=library.workspace??emptyWorkspace(),next=structuredClone(previous);change(next);
  patchState({library:{...library,workspace:next}});
  const save=workspaceSave.catch(()=>{}).then(()=>call<void>('set_library_workspace',{workspace:next}));
  workspaceSave=save.catch(()=>{});
  void save.catch(error=>{if(snapshot.library?.workspace===next)patchState({library:{...snapshot.library,workspace:previous}});showError(error);});
  return save;
}
// Keep unchanged branches shared, without freezing coordinate objects supplied
// by React Flow or changing Immer settings used by another library.
const documentUpdates=new Immer({autoFreeze:false});
export function editDocument(change: (doc: MindDocument) => void,options: { history?: boolean;group?:string } = {}) {
  const before=snapshot.doc;
  if(!before) return;
  try {
    const changed=documentUpdates.produce(before,draft=>{change(draft);});
    if(changed===before)return;
    validateDocument(changed);
    if(changed.nodes===before.nodes&&changed.title===before.title&&changed.layoutMode===before.layoutMode&&changed.viewport.x===before.viewport.x&&changed.viewport.y===before.viewport.y&&changed.viewport.zoom===before.viewport.zoom)return;
    const after={...changed,updatedAt:Date.now()};
    if(options.history!==false) {
      const now=performance.now();const grouped=options.group&&options.group===lastGroup&&now-lastEdit<800&&undo.length>0;
      if(!grouped){
        const changed=Object.keys(before.nodes).filter(id=>before.nodes[id]!==after.nodes[id]);
        const weight=Object.keys(before.nodes).length*32+changed.reduce((sum,id)=>sum+JSON.stringify(before.nodes[id]).length*2,0)+1024;
        undo.push(before);undoWeights.push(weight);historyBytes+=weight;
        while(undo.length>100||historyBytes>20*1024*1024){undo.shift();historyBytes-=undoWeights.shift()??0;}
      }
      lastGroup=options.group??'';lastEdit=now;redo.length=0;
    }
    patchState({doc:after,saving:'dirty',error:'',canUndo:undo.length>0,canRedo:redo.length>0});
    scheduleSave();
  } catch(error) { patchState({error:String(error)}); }
}
function scheduleSave() {
  if(timer) clearTimeout(timer);
  if(!firstDirty) firstDirty=performance.now();
  const saveWhenReady=()=>{if(hasComposingDraft()){timer=setTimeout(saveWhenReady,100);return;}void flushSave().catch(showError);};
  timer=setTimeout(saveWhenReady,Math.max(0,Math.min(300,1000-(performance.now()-firstDirty))));
}
export const showError = (error: unknown) => patchState({error:String(error).replace(/^Error:\s*/,''),busy:''});
export async function setDefaultNodeKind(kind:NodeKind|null) {
  if(snapshot.preferenceSaving||!snapshot.library)return;
  patchState({preferenceSaving:true});
  try{
    const info=await call<Pick<LibraryInfo,'defaultNodeKind'>>('set_default_node_kind',{kind});
    if(snapshot.library)patchState({library:{...snapshot.library,defaultNodeKind:info.defaultNodeKind??null}});
  }catch(error){showError(error);}
  finally{patchState({preferenceSaving:false});}
}
export async function flushSave(): Promise<void> {
  commitDrafts();
  await workspaceSave;
  if(timer) {clearTimeout(timer);timer=null;}
  if(pendingSave) {await pendingSave;return flushSave();}
  if(!snapshot.doc || snapshot.saving==='saved') return;
  const target=snapshot.doc;
  const previous=persisted;
  const upserts=Object.values(target.nodes).filter(n=>previous?.nodes[n.id]!==n);
  const removedIds=Object.keys(previous?.nodes??{}).filter(id=>!target.nodes[id]);
  const {nodes:_,...metadata}=target;
  patchState({saving:'saving'});
  pendingSave=call<{revision:number}>('save_document',{patch:{document:metadata,upserts,removedIds,baseRevision,commandId:uid()}}).then(result=>{
    persisted=target;baseRevision=result.revision;firstDirty=0;
    if(snapshot.library){const entry={id:target.id,title:target.title,updatedAt:target.updatedAt,nodeCount:Object.keys(target.nodes).length};patchState({library:{...snapshot.library,documents:[entry,...snapshot.library.documents.filter(item=>item.id!==target.id)]}});}
    patchState({saving:snapshot.doc===target?'saved':'dirty'});
    if(snapshot.doc!==target) scheduleSave();
  }).catch(error=>{patchState({saving:'error'});throw error;}).finally(()=>{pendingSave=null;});
  return pendingSave;
}
export async function activateDocument(doc: MindDocument,newDoc = false) {
  cancelOperations();
  await flushSave();
  validateDocument(doc);
  undo.length=0;redo.length=0;undoWeights.length=0;historyBytes=0;lastGroup='';persisted=newDoc?null:doc;baseRevision=newDoc?0:doc.revision;
  patchState({doc,selectedId:doc.rootId,editingId:null,titleEditing:null,canUndo:false,canRedo:false,saving:newDoc?'dirty':'saved',busy:'',notice:''});
  if(newDoc) await flushSave();
  if(!snapshot.library?.workspace?.openIds.includes(doc.id))await updateWorkspace(w=>{w.openIds.push(doc.id);});
}
let navigating=false;
export async function openDocument(id:string) {
  if(navigating||snapshot.busy||snapshot.doc?.id===id)return;
  navigating=true;
  try{await flushSave();await activateDocument(await call<MindDocument>('load_document',{id}));}finally{navigating=false;}
}
export async function showHome() {
  if(navigating||snapshot.busy)return;navigating=true;
  try{cancelOperations();await flushSave();patchState({doc:null,selectedId:null,editingId:null,titleEditing:null,canUndo:false,canRedo:false});await refreshLibrary();}finally{navigating=false;}
}
export async function closeDocumentTab(id:string) {
  if(navigating||snapshot.busy)return;navigating=true;
  try{
    await flushSave();const ids=snapshot.library?.workspace?.openIds??[],index=ids.indexOf(id);
    await updateWorkspace(w=>{w.openIds=w.openIds.filter(value=>value!==id);});
    if(snapshot.doc?.id===id){const next=ids[index+1]??ids[index-1];if(next)await activateDocument(await call<MindDocument>('load_document',{id:next}));else patchState({doc:null,selectedId:null,editingId:null,titleEditing:null,canUndo:false,canRedo:false});}
    await refreshLibrary();
  }finally{navigating=false;}
}
export async function createDocument(folderId?:string) {
  if(navigating||snapshot.busy)return;navigating=true;
  try{const doc=newDocument();await activateDocument(doc,true);if(folderId)await updateWorkspace(w=>{w.documentFolders[doc.id]=folderId;});await refreshLibrary();}finally{navigating=false;}
}
export async function deleteLibraryDocument(id:string) {
  if(navigating||snapshot.busy)throw new Error('请等待当前操作完成后再删除');
  navigating=true;
  try{
    await flushSave();patchState({busy:'正在删除思维导图…'});
    await call<void>('delete_document',{id});
    if(snapshot.doc?.id===id){cancelOperations();persisted=null;undo.length=0;redo.length=0;undoWeights.length=0;historyBytes=0;lastGroup='';patchState({doc:null,selectedId:null,editingId:null,titleEditing:null,canUndo:false,canRedo:false,saving:'saved'});}
    if(snapshot.library){const workspace=structuredClone(snapshot.library.workspace??emptyWorkspace());workspace.openIds=workspace.openIds.filter(value=>value!==id);delete workspace.documentFolders[id];patchState({library:{...snapshot.library,workspace,documents:snapshot.library.documents.filter(doc=>doc.id!==id)}});}
    await refreshLibrary();patchState({notice:'思维导图已删除'});
  }finally{navigating=false;patchState({busy:''});}
}
export async function refreshLibrary() {await workspaceSave;patchState({library:await libraryInfo()});}
export function addAsset(asset: Asset) {
  const library=snapshot.library;
  if(library) patchState({library:{...library,assets:[...library.assets.filter(a=>a.id!==asset.id),asset]}});
}
export function undoCommand() {
  try{commitDrafts();}catch(error){showError(error);return;}
  if(!snapshot.doc||!undo.length) return;
  redo.push(snapshot.doc);const doc=undo.pop()!;historyBytes-=undoWeights.pop()??0;lastGroup='';
  patchState({doc,editingId:doc.nodes[snapshot.editingId??'']?snapshot.editingId:null,titleEditing:null,selectedId:doc.nodes[snapshot.selectedId??'']?snapshot.selectedId:doc.rootId,saving:'dirty',canUndo:undo.length>0,canRedo:true});scheduleSave();
}
export function redoCommand() {
  try{commitDrafts();}catch(error){showError(error);return;}
  if(!snapshot.doc||!redo.length) return;
  undo.push(snapshot.doc);undoWeights.push(1024);historyBytes+=1024;const doc=redo.pop()!;lastGroup='';
  patchState({doc,editingId:doc.nodes[snapshot.editingId??'']?snapshot.editingId:null,titleEditing:null,saving:'dirty',canUndo:true,canRedo:redo.length>0});scheduleSave();
}
