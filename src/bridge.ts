import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { Asset, LibraryInfo, LibraryWorkspace, MindDocument,NodeKind } from './domain/types';

export const desktop = isTauri();
export async function savePng(path:string,bytes:ArrayBuffer):Promise<void> {
  if(!desktop)throw new Error('图片导出需要在桌面版中使用');
  const encodedPath=Array.from(new TextEncoder().encode(path),byte=>byte.toString(16).padStart(2,'0')).join('');
  await invoke('save_png',bytes,{headers:{'x-qingtu-path':encodedPath}});
}
type Preview = { docs: Record<string,MindDocument>; assets: Asset[]; workspace?:LibraryWorkspace; images?:Record<string,string>;posters?:Record<string,string>;defaultNodeKind?:NodeKind|null };
let preview: Preview = { docs: {},assets: [] };
if (!desktop && import.meta.env.DEV) {
  try { preview = JSON.parse(localStorage.getItem('qingtu-preview') ?? JSON.stringify(preview)); } catch { /* isolate corrupt preview data */ }
}
export async function call<T>(command: string,args: Record<string,unknown> = {}): Promise<T> {
  if (desktop) return invoke<T>(command,args);
  if (!import.meta.env.DEV) throw new Error('请从桌面安装版打开轻图');
  if(command==='set_library_workspace'){
    const next={...preview,workspace:args.workspace as LibraryWorkspace};localStorage.setItem('qingtu-preview',JSON.stringify(next));preview=next;return null as T;
  }
  if(command==='delete_document'){
    const next=structuredClone(preview),id=args.id as string;delete next.docs[id];
    if(next.workspace){next.workspace.openIds=next.workspace.openIds.filter(value=>value!==id);delete next.workspace.documentFolders[id];}
    localStorage.setItem('qingtu-preview',JSON.stringify(next));preview=next;return null as T;
  }
  if(command==='set_default_node_kind'){
    const kind=args.kind as NodeKind|null;
    if(kind!==null&&!['text','card','image','video'].includes(kind))throw new Error('默认节点类型无效');
    const next={...preview,defaultNodeKind:kind};localStorage.setItem('qingtu-preview',JSON.stringify(next));preview=next;
    return {defaultNodeKind:kind} as T;
  }
  if (command === 'bootstrap') return { initialized: true,defaultNodeKind:preview.defaultNodeKind??null, storagePath: '开发预览 · 数据不属于桌面资料库',configPath:'',recentId:Object.keys(preview.docs).at(-1),assets:preview.assets,
    workspace:preview.workspace,documents:Object.values(preview.docs).map(d => ({id:d.id,title:d.title,updatedAt:d.updatedAt,nodeCount:Object.keys(d.nodes).length})) } as T;
  if (command === 'load_document') return structuredClone(preview.docs[args.id as string]) as T;
  if(command==='set_asset_metadata'){
    const asset=preview.assets.find(item=>item.id===args.id);if(!asset)throw new Error('素材不存在');
    const metadata=args.metadata as {width:number;height:number;duration:number;posterBytes?:number[]};
    const updated={...asset,width:metadata.width,height:metadata.height,duration:metadata.duration};
    if(metadata.posterBytes){preview.posters??={};preview.posters[asset.id]=await blobData(new Blob([new Uint8Array(metadata.posterBytes)],{type:'image/png'}));updated.thumbnailPath=`thumbs/${asset.id}.png`;}
    const next={...preview,assets:preview.assets.map(item=>item.id===asset.id?updated:item)};localStorage.setItem('qingtu-preview',JSON.stringify(next));preview=next;return updated as T;
  }
  if (command === 'save_document') {
    const patch = args.patch as { document: MindDocument; upserts: MindDocument['nodes'][string][]; removedIds: string[]; baseRevision: number };
    const before = preview.docs[patch.document.id];
    const nodes = { ...before?.nodes };
    patch.upserts.forEach(n => nodes[n.id] = n);
    patch.removedIds.forEach(id => delete nodes[id]);
    preview.docs[patch.document.id] = { ...patch.document, nodes, revision: patch.baseRevision + 1 };
    localStorage.setItem('qingtu-preview',JSON.stringify(preview));
    return { revision: patch.baseRevision + 1 } as T;
  }
  if (command === 'ready' || command === 'pending_project') return null as T;
  throw new Error('此功能需要在桌面版中使用');
}
export const libraryInfo = () => call<LibraryInfo>('bootstrap');
const blobData=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
export async function storeClipboardVideo(file:File):Promise<Asset>{
  const bytes=await file.arrayBuffer();
  if(desktop){const name=Array.from(new TextEncoder().encode(file.name||'粘贴视频.mp4'),byte=>byte.toString(16).padStart(2,'0')).join('');return invoke<Asset>('import_clipboard_video',bytes,{headers:{'x-qingtu-video-name':name}});}
  if(!import.meta.env.DEV)throw new Error('请从桌面安装版打开轻图');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const asset:Asset={id:hash,sha256:hash,mime:'video/mp4',byteSize:file.size,width:0,height:0,relativePath:`assets/${hash}.mp4`,name:file.name||'粘贴视频.mp4'};
  const next={...preview,assets:[...preview.assets.filter(item=>item.id!==hash),asset],images:{...preview.images,[hash]:await blobData(new Blob([bytes],{type:'video/mp4'}))}};
  localStorage.setItem('qingtu-preview',JSON.stringify(next));preview=next;return asset;
}
export async function storeClipboardImage(file:File):Promise<Asset> {
  const bytes=await file.arrayBuffer();
  if(desktop){
    const name=Array.from(new TextEncoder().encode(file.name||'粘贴图片'),byte=>byte.toString(16).padStart(2,'0')).join('');
    return invoke<Asset>('import_clipboard_image',bytes,{headers:{'x-qingtu-image-name':name}});
  }
  if(!import.meta.env.DEV)throw new Error('请从桌面安装版打开轻图');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
  const image=await createImageBitmap(file);const {width,height}=image;image.close();
  const extension=file.type==='image/jpeg'?'jpg':file.type==='image/webp'?'webp':'png';
  const asset:Asset={id:hash,sha256:hash,mime:file.type,byteSize:file.size,width,height,relativePath:`assets/${hash}.${extension}`,name:file.name||'粘贴图片'};
  const next={...preview,assets:[...preview.assets.filter(item=>item.id!==hash),asset],images:{...preview.images,[hash]:data}};
  localStorage.setItem('qingtu-preview',JSON.stringify(next));preview=next;return asset;
}
export async function chooseDirectory(title: string): Promise<string | null> {
  if (!desktop) throw new Error('开发预览不能选择本地存储目录');
  const path = await open({ directory:true, multiple:false,title });
  return typeof path === 'string' ? path : null;
}
export async function chooseProject(): Promise<string | null> {
  const path = await open({ multiple:false,filters:[{name:'轻图项目',extensions:['qmap']}],title:'打开轻图项目' });
  return typeof path === 'string' ? path : null;
}
export async function chooseAsset(kind?: 'image' | 'video'): Promise<string | null> {
  if (!desktop) throw new Error('请在桌面版中导入媒体');
  const path = await open({ multiple:false,filters:[{name:kind === 'video' ? '视频' : kind === 'image' ? '图片' : '图片和视频',extensions:kind === 'video' ? ['mp4'] : kind === 'image' ? ['png','jpg','jpeg','webp'] : ['png','jpg','jpeg','webp','mp4']}],title:'添加本地媒体' });
  return typeof path === 'string' ? path : null;
}
export async function savePath(title: string,filename: string,extension: string) {
  return save({title,defaultPath:filename,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});
}
const urls = new Map<string,Promise<string>>();
export function clearAssetUrls() { urls.clear(); }
export function assetUrl(id: string,thumbnail = false): Promise<string> {
  if (id.startsWith('builtin:')) return Promise.resolve('/demo/'+id.slice(8)+(id==='builtin:lesson'?'.mp4':'.png'));
  if(!desktop&&import.meta.env.DEV&&thumbnail&&preview.posters?.[id])return Promise.resolve(preview.posters[id]);
  if(!desktop&&import.meta.env.DEV&&preview.images?.[id])return Promise.resolve(preview.images[id]);
  const key=id+':'+thumbnail;
  if (!urls.has(key)) urls.set(key,call<string>('get_asset_path',{id,thumbnail}).then(path=>convertFileSrc(path)).catch(error=>{urls.delete(key);throw error;}));
  return urls.get(key)!;
}
