import {useEffect,useRef,useState} from 'react';
import {Clock,Folder,FolderPlus,GitBranch,Plus,Search,ChevronRight,FilePlus2,Trash2,X} from 'lucide-react';
import {createDocument,deleteLibraryDocument,emptyWorkspace,openDocument,showError,updateWorkspace,useApp} from '../state';
import {uid} from '../domain/types';
import '../styles-library.css';

export default function LibraryHome(){
  const {library}=useApp();
  const workspace=library?.workspace??emptyWorkspace();
  const [folder,setFolder]=useState('all'),[search,setSearch]=useState(''),[newFolder,setNewFolder]=useState(false),[name,setName]=useState('');
  const [menu,setMenu]=useState<{id:string;title:string;x:number;y:number}|null>(null);
  const [pendingDelete,setPendingDelete]=useState<{id:string;title:string}|null>(null),[deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const deleteDialog=useRef<HTMLDialogElement>(null),menuRef=useRef<HTMLDivElement>(null);
  const requestDelete=(doc:{id:string;title:string})=>{setMenu(null);setDeleteError('');setPendingDelete({id:doc.id,title:doc.title});};
  useEffect(()=>{
    if(!menu)return;menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss=(event:Event)=>{if(!menuRef.current?.contains(event.target as Node))setMenu(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMenu(null);}};
    window.addEventListener('pointerdown',dismiss);window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss);window.removeEventListener('keydown',key);};
  },[menu]);
  useEffect(()=>{
    const dialog=deleteDialog.current;if(!pendingDelete||!dialog)return;
    dialog.showModal();dialog.querySelector<HTMLButtonElement>('.delete-cancel')?.focus();
    return()=>{if(dialog.open)dialog.close();};
  },[pendingDelete]);
  const confirmDelete=async()=>{
    if(!pendingDelete||deleting)return;setDeleting(true);
    try{await deleteLibraryDocument(pendingDelete.id);setPendingDelete(null);}catch(error){setDeleteError(String(error).replace(/^Error:\s*/,''));}finally{setDeleting(false);}
  };
  const title=folder==='all'?'最近使用':folder==='unfiled'?'未分类':workspace.folders.find(item=>item.id===folder)?.name??'最近使用';
  const documents=(library?.documents??[]).filter(doc=>(folder==='all'||(folder==='unfiled'?!workspace.documentFolders[doc.id]:workspace.documentFolders[doc.id]===folder))&&doc.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a,b)=>b.updatedAt-a.updatedAt);
  const addFolder=async(event:React.FormEvent)=>{
    event.preventDefault();const value=name.trim();if(!value)return;
    if(workspace.folders.some(item=>item.name===value)){showError('已存在同名文件夹');return;}
    const id=uid();try{await updateWorkspace(w=>{w.folders.push({id,name:value});});setFolder(id);setName('');setNewFolder(false);}catch{/* State reports persistence errors. */}
  };
  return <div className="library-home">
    <aside className="library-sidebar" aria-label="导图文件夹">
      <div className="library-brand"><GitBranch size={27}/><strong>轻图</strong><span>让思路自然展开</span></div>
      <button className={`folder-row ${folder==='all'?'chosen':''}`} onClick={()=>setFolder('all')}><Clock size={18}/>最近使用<span>{library?.documents.length??0}</span></button>
      <div className="folder-heading"><span>文件夹</span><button title="新建文件夹" aria-label="新建文件夹" onClick={()=>setNewFolder(true)}><FolderPlus size={17}/></button></div>
      <button className={`folder-row ${folder==='unfiled'?'chosen':''}`} onClick={()=>setFolder('unfiled')}><Folder size={18}/>未分类<span>{library?.documents.filter(doc=>!workspace.documentFolders[doc.id]).length??0}</span></button>
      {workspace.folders.map(item=><button key={item.id} className={`folder-row ${folder===item.id?'chosen':''}`} onClick={()=>setFolder(item.id)}><ChevronRight size={13}/><Folder size={18}/><b>{item.name}</b><span>{library?.documents.filter(doc=>workspace.documentFolders[doc.id]===item.id).length??0}</span></button>)}
      <div className="library-local"><span className="hint-dot"/>本地资料库 · 自动保存</div>
    </aside>
    <section className="library-main">
      <div className="home-welcome"><h1>{new Date().getHours()<12?'上午好。':new Date().getHours()<18?'下午好。':'晚上好。'}<span>从一个想法开始。</span></h1><p>把想法连起来，让思路清晰展开。</p></div>
      <button className="create-map-card" onClick={()=>void createDocument(workspace.folders.some(item=>item.id===folder)?folder:undefined).catch(showError)}><span className="create-map-icon"><GitBranch size={28}/><Plus size={15}/></span><strong>创建新的思维导图</strong><span>记录灵感，梳理思路</span><span className="create-map-arrow">↗</span></button>
      <div className="library-list-tools"><h2>{title}<small>{documents.length} 个思维导图</small></h2><label className="search-field"><Search size={17}/><input aria-label="搜索思维导图" placeholder="搜索思维导图名称…" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
      <div className="library-table" role="table" aria-label="思维导图列表"><div className="library-table-head" role="row"><span>名称</span><span>文件夹</span><span>修改时间 ↓</span><span>节点</span></div>
        {documents.map(doc=><div className="library-table-row" key={doc.id} role="row" onContextMenu={event=>{event.preventDefault();setMenu({id:doc.id,title:doc.title,x:Math.min(event.clientX,innerWidth-210),y:Math.min(event.clientY,innerHeight-105)});}}><button className="library-open-map" onClick={()=>void openDocument(doc.id).catch(showError)}><span className="file-icon"><GitBranch size={20}/></span><strong>{doc.title}</strong></button><select aria-label={`移动 ${doc.title} 到文件夹`} value={workspace.documentFolders[doc.id]??''} onChange={event=>{const id=event.target.value;void updateWorkspace(w=>{if(id)w.documentFolders[doc.id]=id;else delete w.documentFolders[doc.id];}).catch(()=>{});}}><option value="">未分类</option>{workspace.folders.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><time>{new Date(doc.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time><div className="library-row-actions"><span>{doc.nodeCount}</span><button className="delete-map-button" aria-label={`删除思维导图 ${doc.title}`} title="删除思维导图" onClick={()=>requestDelete(doc)}><Trash2 size={16}/></button></div></div>)}
        {!documents.length&&<div className="library-empty"><FilePlus2 size={34}/><strong>{search?'没有找到匹配的导图':'这里还没有思维导图'}</strong><span>{search?'试试其他名称。':'点击上方卡片，创建你的第一张导图。'}</span></div>}
      </div>
    </section>
    {menu&&<div ref={menuRef} role="menu" aria-label="思维导图操作" className="library-context-menu" style={{left:menu.x,top:menu.y}}><button role="menuitem" onClick={()=>{setMenu(null);void openDocument(menu.id).catch(showError);}}><Folder size={16}/>打开思维导图</button><button role="menuitem" className="delete-menu-item" onClick={()=>requestDelete(menu)}><Trash2 size={16}/>删除思维导图</button></div>}
    {pendingDelete&&<dialog ref={deleteDialog} className="settings-modal delete-map-dialog" role="alertdialog" aria-labelledby="delete-map-title" aria-describedby="delete-map-description" onCancel={event=>{if(deleting)event.preventDefault();else setPendingDelete(null);}}>
      <div className="delete-map-symbol"><Trash2 size={26}/></div><h1 id="delete-map-title">删除思维导图？</h1>
      <p id="delete-map-description">确定删除「{pendingDelete.title}」吗？该思维导图及其节点内容将从资料库中删除，顶部标签也会移除。此操作无法撤销。</p>
      {deleteError&&<p role="alert" className="delete-map-error">删除未完成：{deleteError}</p>}
      <div className="delete-dialog-actions"><button className="secondary-button delete-cancel" disabled={deleting} onClick={()=>setPendingDelete(null)}>取消</button><button className="danger-button" disabled={deleting} onClick={()=>void confirmDelete()}>{deleting?'正在删除…':'确认删除'}</button></div>
    </dialog>}
    {newFolder&&<div className="modal-backdrop"><form className="settings-modal folder-modal" onSubmit={event=>void addFolder(event)} role="dialog" aria-modal="true" aria-label="新建文件夹"><button className="modal-close" type="button" aria-label="取消新建文件夹" onClick={()=>setNewFolder(false)}><X size={20}/></button><FolderPlus size={30}/><h1>新建文件夹</h1><label>文件夹名称<input autoFocus maxLength={100} value={name} onChange={event=>setName(event.target.value)} placeholder="例如：读论文"/></label><button className="primary-button" type="submit" disabled={!name.trim()}>创建文件夹</button></form></div>}
  </div>;
}
