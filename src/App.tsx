import { useCallback,useEffect,useState,useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { GitBranch,Undo2,Redo2,Plus,PanelTop,ImagePlus,Film,Settings,FolderOpen,Download,ChevronDown,Check,LoaderCircle,LayoutGrid,MousePointer2,Maximize,Keyboard,X,Folder,ArrowRight,FilePlus2,Trash2,Search,ChevronRight,AlertCircle } from 'lucide-react';
import { Canvas,canvasAction } from './components/Canvas';
import { desktop,call,chooseDirectory,clearAssetUrls } from './bridge';
import { useApp,patchState,showError,refreshLibrary,activateDocument,flushSave,createDocument,openDocument,showHome,closeDocumentTab,editDocument,undoCommand,redoCommand,getState,setDefaultNodeKind } from './state';
import { addNode,deleteSelected,replaceMedia,importProject,exportProject,exportPng,moveToParent,importFiles } from './actions';
import {mediaFileKind} from './media-import';
import LibraryHome from './components/LibraryHome';
import type { LibraryInfo,MindDocument,MindNode,NodeKind } from './domain/types';
import {kindLabels,planKindChange} from './domain/conversion';
import { registerDraft,commitDrafts } from './editing';
import {cancelOperations,hasOperation} from './operations';
import {version as appVersion} from '../package.json';
import DefaultNodeKind from './components/DefaultNodeKind';
import ParentsEditor from './components/ParentsEditor';
import ImageViewer from './components/ImageViewer';
import {installMarkdownSelection} from './components/markdown-selection';

function Button({title,children,onClick,disabled=false,className=''}:{title:string;children:React.ReactNode;onClick:()=>void;disabled?:boolean;className?:string}) {
  return <button className={`tool-button ${className}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>;
}
export default function App() {
  const state=useApp();const {doc,library}=state;
  const [settings,setSettings]=useState(false);const [files,setFiles]=useState(false);const [exportMenu,setExportMenu]=useState(false);
  const [inspector,setInspector]=useState(false);const [help,setHelp]=useState(false);const [storage,setStorage]=useState('');
  const [onboarding,setOnboarding]=useState(false);const [search,setSearch]=useState('');
  const [starting,setStarting]=useState(true);
  const [pendingConversion,setPendingConversion]=useState<{documentId:string;source:MindNode;plan:ReturnType<typeof planKindChange>}|null>(null);
  const conversionDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=conversionDialog.current;if(!pendingConversion||!dialog)return;dialog.showModal();dialog.querySelector<HTMLButtonElement>('.secondary-button')?.focus();return()=>{if(dialog.open)dialog.close();};},[pendingConversion]);
  const compositionActive=useRef(false);
  useEffect(()=>installMarkdownSelection(()=>!!getState().busy||compositionActive.current),[]);
  useEffect(()=>registerDraft('window-input',{commit:()=>{},composing:()=>compositionActive.current}),[]);
  const onMedia=useCallback((id:string)=>void replaceMedia(id),[]);
  async function openInitial(info:LibraryInfo) {
    patchState({library:info});
    if(info.startupError)showError('无法连接原资料库：'+info.startupError+'。请选择原存储位置重新连接，或选择新位置。');
    if(!info.initialized){setOnboarding(true);setStarting(false);return;}
    setStarting(false);void call('ready').catch(showError);
    const pending=await call<string|null>('pending_project');if(pending)await importProject(pending);
  }
  useEffect(()=>{void call<LibraryInfo>('bootstrap').then(openInitial).catch(e=>{showError(e);setStarting(false);});},[]);
  useEffect(()=>{
    if(!desktop)return;
    let dispose:(()=>void)|undefined;
    import('@tauri-apps/api/event').then(({listen})=>listen<string>('open-project',event=>void importProject(event.payload))).then(fn=>dispose=fn);
    return()=>dispose?.();
  },[]);
  useEffect(()=>{
    if(!desktop)return;
    void import('@tauri-apps/api/window').then(({getCurrentWindow})=>getCurrentWindow().setTitle(doc?`${doc.title} - 轻图`:'轻图 - 首页'));
  },[doc?.title]);
  useEffect(()=>{
    if(!desktop)return;let dispose:(()=>void)|undefined;let closing=false;
    import('@tauri-apps/api/window').then(({getCurrentWindow})=>getCurrentWindow().onCloseRequested(async event=>{
      if(closing)return;event.preventDefault();
      if(hasOperation('media-import')){patchState({error:'素材操作尚未完成，请等待完成或先取消导入，再关闭窗口'});return;}
      try{await flushSave();closing=true;await getCurrentWindow().destroy();}catch(error){closing=false;showError(error);}
    })).then(fn=>dispose=fn);return()=>dispose?.();
  },[]);
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      if(event.isComposing)return;
      if(document.querySelector('dialog[open]')){if((event.ctrlKey||event.metaKey)&&['s','z'].includes(event.key.toLowerCase()))event.preventDefault();return;}
      if(getState().busy){if(event.key==='Escape'&&(hasOperation('media-import')||hasOperation('png-export'))){cancelOperations();patchState({busy:'',error:'',notice:'操作已取消'});}event.preventDefault();return;}
      const interactive=(event.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable="true"],[role="button"]');
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void flushSave().catch(showError);return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redoCommand():undoCommand();return;}
      if(!getState().doc)return;
      if(interactive||event.altKey||event.ctrlKey||event.metaKey)return;
      if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();addNode();}
      if(event.key==='Enter'){event.preventDefault();addNode(undefined,undefined,true);}
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelected();}
      if(event.key==='Escape'){try{commitDrafts();}catch(error){showError(error);return;}setSettings(false);setFiles(false);setHelp(false);patchState({editingId:null,titleEditing:null,notice:''});}
    };
    const add=(event:Event)=>addNode(undefined,(event as CustomEvent).detail);
    window.addEventListener('keydown',handle);window.addEventListener('qingtu-add-child',add);
    return()=>{window.removeEventListener('keydown',handle);window.removeEventListener('qingtu-add-child',add);};
  },[]);
  useEffect(()=>{if(state.notice&&!state.notice.startsWith('image:')){const t=setTimeout(()=>patchState({notice:''}),4500);return()=>clearTimeout(t);}},[state.notice]);
  useEffect(()=>{const paste=(event:ClipboardEvent)=>{
    if(getState().busy||document.querySelector('dialog[open],.modal-backdrop')||(event.target instanceof Element&&event.target.closest('input,textarea,[contenteditable="true"]')))return;
    const files=Array.from(event.clipboardData?.files??[]).filter(file=>mediaFileKind(file));if(!files.length)return;event.preventDefault();void importFiles(files);
  };window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);},[]);
  const initialize=async()=>{
    try{if(!storage){showError('请先选择资料库存储位置');return;}patchState({busy:'正在建立本地资料库…'});
      const info=await call<LibraryInfo>('initialize_storage',{directory:storage});setOnboarding(false);await openInitial(info);patchState({busy:''});
    }catch(error){showError(error);}
  };
  const selectStorage=async()=>{try{const directory=await chooseDirectory('选择存储位置或已有的轻图资料库');if(directory){const existing=await call<boolean>('storage_exists',{directory});setStorage(existing?directory:directory.replace(/[\\/]$/,'')+'\\轻图资料库');}}catch(error){showError(error);}};
  const migrate=async()=>{
    try{const directory=await chooseDirectory('选择一个空文件夹作为新存储位置');if(!directory)return;cancelOperations();await flushSave();
      patchState({busy:'正在复制并校验资料库，请勿关闭…'});
      const info=await call<LibraryInfo>('migrate_storage',{directory});clearAssetUrls();patchState({library:info,busy:'',notice:'存储位置已更新；原目录保留，可手动备份'});
      if(doc)await activateDocument(await call<MindDocument>('load_document',{id:doc.id}));
    }catch(error){showError(error);}
  };
  const requestKindChange=(kind:NodeKind)=>{
    try{
      commitDrafts();const current=getState(),document=current.doc,node=document?.nodes[current.selectedId??''];
      if(!document||!node||node.kind===kind)return;
      const plan=planKindChange(node,kind);
      if(plan.affected.length)setPendingConversion({documentId:document.id,source:node,plan});
      else{editDocument(d=>{d.nodes[node.id]=plan.node;});patchState({editingId:null,titleEditing:null});}
    }catch(error){showError(error);}
  };
  const confirmKindChange=()=>{
    const pending=pendingConversion;if(!pending)return;
    const current=getState().doc;setPendingConversion(null);
    if(current?.id!==pending.documentId||current.nodes[pending.source.id]!==pending.source){showError('节点内容已经变化，请重新选择转换类型');return;}
    editDocument(d=>{d.nodes[pending.source.id]=pending.plan.node;});patchState({editingId:null,titleEditing:null});
  };
  const selected=doc?.nodes[state.selectedId??''];
  const ready=useCallback(()=>{void call('ready').catch(showError);},[]);
  return <div className="app-shell" onCompositionStartCapture={()=>compositionActive.current=true} onCompositionEndCapture={()=>compositionActive.current=false}>
    <nav className="document-tabs" aria-label="已打开的思维导图" inert={!!state.busy}>
      <button className={`home-tab ${!doc?'active':''}`} onClick={()=>{setFiles(false);void showHome().catch(showError);}}><FolderOpen size={16}/>首页</button>
      <div className="document-tab-list">{(library?.workspace?.openIds??[]).map(id=>{const item=library?.documents.find(item=>item.id===id);if(!item&&doc?.id!==id)return null;const title=doc?.id===id?doc.title:item!.title;return <div key={id} className={`document-tab ${doc?.id===id?'active':''}`}><button aria-label={`切换到 ${title}`} aria-current={doc?.id===id?'page':undefined} onClick={()=>{setFiles(false);void openDocument(id).catch(showError);}}><GitBranch size={15}/><span>{title}</span></button><button className="tab-close" aria-label={`关闭标签 ${title}`} title="关闭此标签（保留导图文件）" onClick={()=>void closeDocumentTab(id).catch(showError)}><X size={13}/></button></div>;})}</div>
      <button className="new-map-tab" title="新建思维导图" aria-label="新建思维导图" onClick={()=>void createDocument().catch(showError)}><Plus size={18}/></button>
    </nav>
    <header className="topbar">
      <div className="brand"><GitBranch size={28}/><strong>轻图</strong><span className="brand-divider"/></div>
      <button className="document-button" onClick={()=>{setFiles(!files);void refreshLibrary().catch(showError);}}><span>{doc?.title??'让思路自然展开'}</span><ChevronDown size={16}/></button>
      {doc&&<button className={`save-indicator save-${state.saving}`} onClick={()=>void flushSave().catch(showError)} title="Ctrl+S 保存">{state.saving==='saved'?<Check size={13}/>:state.saving==='error'?<AlertCircle size={14}/>:<LoaderCircle className={state.saving==='saving'?'spin':''} size={14}/>}<span>{({saved:'已保存',dirty:'未保存',saving:'保存中',error:'保存失败'})[state.saving]}</span></button>}
      <div className="topbar-spacer"/>
      <Button title="撤销 Ctrl+Z" onClick={undoCommand} disabled={!doc||!state.canUndo}><Undo2 size={19}/></Button>
      <Button title="重做 Ctrl+Shift+Z" onClick={redoCommand} disabled={!doc||!state.canRedo}><Redo2 size={19}/></Button>
      <span className="toolbar-divider"/>
      <Button disabled={!doc} title="自动整理布局" onClick={()=>canvasAction('layout')}><LayoutGrid size={18}/><span>布局</span></Button>
      <div className="dropdown-wrap"><Button disabled={!doc} title="导出" onClick={()=>setExportMenu(!exportMenu)}><Download size={18}/><span>导出</span><ChevronDown size={13}/></Button>
        {exportMenu&&<div className="dropdown-menu"><button onClick={()=>{setExportMenu(false);void exportProject();}}><Folder size={17}/>完整项目 .qmap<span>含原始媒体</span></button><button onClick={()=>{setExportMenu(false);void exportPng();}}><ImagePlus size={17}/>导图图片 .png<span>当前可见结构</span></button></div>}
      </div>
      <Button title="设置" onClick={()=>setSettings(true)}><Settings size={18}/></Button>
    </header>
    {!desktop&&<div className="preview-label">开发预览 · 正式功能请使用桌面安装版</div>}
    <main className="workspace" inert={!!state.busy}>
      <ReactFlowProvider>{doc?<Canvas key={doc.id} onMedia={onMedia} onPane={()=>{setExportMenu(false);}} onReady={ready}/>:!starting&&<LibraryHome/>}</ReactFlowProvider>
      {doc&&<>
        <nav className="canvas-toolbar" aria-label="节点工具栏">
          <Button title="选择和拖动" onClick={()=>patchState({editingId:null})} className="active"><MousePointer2 size={20}/></Button>
          <span className="rail-divider"/>
          <Button title={`添加${kindLabels[library?.defaultNodeKind??'text']}节点 Tab`} onClick={()=>addNode()}><Plus size={21}/></Button>
          <Button title="添加内容卡片" onClick={()=>addNode('card')}><PanelTop size={20}/></Button>
          <Button title="添加图片节点" onClick={()=>addNode('image')}><ImagePlus size={20}/></Button>
          <Button title="添加视频节点" onClick={()=>addNode('video')}><Film size={20}/></Button>
          <span className="rail-divider"/>
          <Button title="节点属性" onClick={()=>setInspector(!inspector)}><Settings size={19}/></Button>
          <Button title="打开项目" onClick={()=>void importProject()}><FolderOpen size={20}/></Button>
        </nav>
        <div className="canvas-hint"><span className="hint-dot"/>{doc.layoutMode==='auto'?'自动布局':'自由布局'}<span>·</span>双击编辑<span>·</span>空格拖动画布</div>
        <button className="help-button" title="快捷键" onClick={()=>setHelp(true)}><Keyboard size={18}/></button>
        <button className="fit-button" title="适应画布" onClick={()=>canvasAction('fit')}><Maximize size={17}/></button>
      </>}
      {starting&&<div className="startup"><GitBranch size={42}/><span>正在展开你的思路…</span></div>}
      {files&&<aside className="files-panel"><div className="panel-heading"><h2>我的导图</h2><Button title="关闭文档列表" onClick={()=>setFiles(false)}><X size={18}/></Button></div>
        <div className="file-actions"><button onClick={()=>{void createDocument().catch(showError);setFiles(false);}}><FilePlus2 size={17}/>新建导图</button><button onClick={()=>{setFiles(false);void importProject();}}><FolderOpen size={17}/>打开项目</button></div>
        <label className="search-field"><Search size={16}/><input placeholder="搜索导图" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <div className="document-list">{library?.documents.filter(d=>d.title.includes(search)).map(d=><button className={d.id===doc?.id?'selected':''} key={d.id} onClick={()=>{void openDocument(d.id).then(()=>setFiles(false)).catch(showError);}}><div className="file-icon"><GitBranch size={20}/></div><div><strong>{d.title}</strong><small>{d.nodeCount} 个节点 · {new Date(d.updatedAt).toLocaleDateString()}</small></div><ChevronRight size={15}/></button>)}</div>
      </aside>}
      {inspector&&selected&&<aside className="inspector"><div className="panel-heading"><h2>节点属性</h2><Button title="关闭节点属性" onClick={()=>setInspector(false)}><X size={18}/></Button></div>
        <label>节点名称<input value={selected.title} onChange={e=>editDocument(d=>{d.nodes[selected.id].title=e.target.value;if(selected.id===d.rootId)d.title=e.target.value||'未命名思维导图';},{group:'title:'+selected.id})}/></label>
        <label>节点类型<select value={selected.kind} onChange={e=>requestKindChange(e.target.value as NodeKind)}><option value="text">文字</option><option value="card">内容卡片（Markdown）</option><option value="image">图片</option><option value="video">视频</option></select></label>
        <DefaultNodeKind value={library?.defaultNodeKind??null} saving={state.preferenceSaving} onChange={kind=>void setDefaultNodeKind(kind)}/>
        <ParentsEditor doc={doc!} node={selected}/>
        {selected.parentId===doc?.rootId&&<label>主分支方向<select value={selected.side} onChange={e=>{const side=e.target.value as 'left'|'right';editDocument(d=>{d.nodes[selected.id].side=side;});}}><option value="right">向右展开</option><option value="left">向左展开</option></select></label>}
        <label>主题颜色<div className="color-options">{['teal','blue','orange','rose','purple'].map(color=><button key={color} className={`swatch color-${color} ${selected.color===color?'chosen':''}`} aria-label={'颜色 '+color} onClick={()=>editDocument(d=>d.nodes[selected.id].color=color)}/>)}</div></label>
        {selected.kind!=='text'&&<label>节点宽度 {selected.preferredWidth??(selected.kind==='card'?432:280)} px<input type="range" min={selected.kind==='card'?240:160} max="640" value={selected.preferredWidth??(selected.kind==='card'?432:280)} onChange={e=>editDocument(d=>{d.nodes[selected.id].preferredWidth=Number(e.target.value);})}/></label>}
        {selected.parentId&&<label>移动到父节点<select value={selected.parentId} onChange={e=>moveToParent(e.target.value)}>{Object.values(doc!.nodes).filter(n=>n.id!==selected.id).map(n=><option value={n.id} key={n.id}>{n.title||'媒体节点'}</option>)}</select></label>}
        {selected.parentId&&<div className="file-actions"><button onClick={()=>editDocument(d=>{const list=d.nodes[selected.parentId!].childIds;const index=list.indexOf(selected.id);if(index>0)[list[index-1],list[index]]=[list[index],list[index-1]];})}>向前排序</button><button onClick={()=>editDocument(d=>{const list=d.nodes[selected.parentId!].childIds;const index=list.indexOf(selected.id);if(index<list.length-1)[list[index+1],list[index]]=[list[index],list[index+1]];})}>向后排序</button></div>}
        {(selected.kind==='image'||selected.kind==='video')&&<label>媒体说明<input value={selected.altText??''} onChange={e=>editDocument(d=>{d.nodes[selected.id].altText=e.target.value;},{group:'alt:'+selected.id})}/></label>}
        {(selected.kind==='image'||selected.kind==='video')&&<button className="secondary-button" onClick={()=>void replaceMedia(selected.id)}>选择或替换媒体</button>}
        {selected.parentId&&<button className="danger-button" onClick={deleteSelected}><Trash2 size={16}/>删除节点及后代</button>}
      </aside>}
    </main>
    {pendingConversion&&<dialog ref={conversionDialog} className="settings-modal kind-conversion" role="alertdialog" aria-labelledby="kind-change-title" aria-describedby="kind-change-description" onCancel={()=>setPendingConversion(null)}>
      <h1 id="kind-change-title">转换为{kindLabels[pendingConversion.plan.node.kind]}</h1>
      <p id="kind-change-description">确认后将从当前节点移除：{pendingConversion.plan.affected.join('、')}。转换后可通过撤销恢复。</p>
      <button className="primary-button" onClick={confirmKindChange}>确认转换</button>
      <button className="secondary-button" onClick={()=>setPendingConversion(null)}>保留原类型</button>
    </dialog>}
    {(onboarding||settings)&&<div className="modal-backdrop"><section className="settings-modal" role="dialog" aria-modal="true" aria-label={onboarding?'选择存储位置':'设置'}>
      {!onboarding&&<button className="modal-close" onClick={()=>setSettings(false)}><X size={20}/></button>}
      <div className="settings-symbol">{onboarding?<GitBranch size={30}/>:<Folder size={28}/>}</div>
      <h1>{onboarding?'欢迎使用轻图':'存储与偏好'}</h1>
      <p className="modal-subtitle">{onboarding?'从一个想法开始，让知识自然展开。':'你的导图与媒体，都在自己选择的位置。'}</p>
      {onboarding?<><label className="field-label">资料库存储位置</label><button className="directory-picker" onClick={()=>void selectStorage()}><FolderOpen size={20}/><span>{storage||'选择文件夹…'}</span><ChevronRight size={17}/></button>
        <p className="field-note">会在所选位置创建“轻图资料库”。文档、图片和视频都保存在这里，之后可在设置中迁移。</p>
        <button className="primary-button" onClick={()=>void initialize()} disabled={!storage||!!state.busy}>开始使用<ArrowRight size={17}/></button></>:
        <><label className="field-label">当前存储位置</label><div className="storage-path"><FolderOpen size={20}/><span>{library?.storagePath}</span></div>
          <button className="secondary-button" onClick={()=>void migrate()}>更改存储位置并迁移数据</button><p className="field-note">迁移会复制并逐个校验文件。原目录保留，完成后可自行备份或清理。目标请选择空文件夹。</p>
          <DefaultNodeKind value={library?.defaultNodeKind??null} saving={state.preferenceSaving} onChange={kind=>void setDefaultNodeKind(kind)}/>
          <div className="settings-separator"/><div className="preference"><strong>完全本地</strong><span>不需要账号，安装后可离线使用</span></div><div className="preference"><strong>轻图 {appVersion}</strong><span>安装位置和存储位置相互独立</span></div></>}
    </section></div>}
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="help-modal" onClick={e=>e.stopPropagation()}><h2>让操作更顺手</h2>{[['Ctrl + Shift + L','从选中节点连接子节点'],['Ctrl + Shift + M','更换选中节点的父节点'],['连线时靠近画布边缘','自动平移以寻找屏幕外节点'],['点击连线，再按 Delete','断开此连接，保留节点'],['Esc','取消连线'],['Tab','画布添加子节点；正文缩进列表'],['Shift + Tab','正文列表提升一级'],['Enter','画布添加同级节点；列表添加同级条目'],['Delete','删除节点和后代'],['Ctrl + Z','撤销'],['Ctrl + Shift + Z','重做'],['Ctrl + S','立即保存'],['Space + 拖动','平移画布'],['双击','编辑标题或正文']].map(([key,value])=><div className="shortcut" key={key}><span>{value}</span><kbd>{key}</kbd></div>)}<button className="primary-button" onClick={()=>setHelp(false)}>知道了</button></section></div>}
    {state.error&&<div className="error-toast" role="alert"><AlertCircle size={19}/><span>{state.error}</span><button onClick={()=>patchState({error:''})}><X size={16}/></button></div>}
    {state.notice&&!state.notice.startsWith('image:')&&<div className="notice-toast"><Check size={17}/>{state.notice}</div>}
    {state.notice.startsWith('image:')&&<ImageViewer key={state.notice} url={state.notice.slice(6)} onClose={()=>patchState({notice:''})}/>}
    {state.busy&&<div className="busy-overlay" role="status"><div><LoaderCircle size={27} className="spin"/><span>{state.busy}</span>{(state.busy==='正在导入本地媒体…'||state.busy==='正在生成导图图片…')&&<button className="secondary-button" onClick={()=>{cancelOperations();patchState({busy:'',error:'',notice:'操作已取消，原文件保留'});}}>取消操作</button>}</div></div>}
  </div>;
}
