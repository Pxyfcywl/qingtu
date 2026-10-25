import { useEditor,EditorContent } from '@tiptap/react';
import { Node,mergeAttributes,type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Bold,Italic,List,ListOrdered,Columns2,Sigma,ImagePlus,Film,Link,Check,Code2,Table2 } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import {TableKit} from '@tiptap/extension-table';
import {DiagramCodeBlock} from './DiagramCodeBlock';
import {lowlight} from '../domain/code-highlight';
import {AlignedCell,AlignedHeader,FormattedPaste} from './FormattedPaste';
import FloatingEditorTools from './FloatingEditorTools';
import {openImagePreview} from './Media';
import { chooseAsset } from '../bridge';
import { addAsset,editDocument,patchState,showError,getState } from '../state';
import { assetUrl } from '../bridge';
import type { RichNode } from '../domain/types';
import { validateBody } from '../domain/body';
import { Plugin } from '@tiptap/pm/state';
import { registerDraft,commitDrafts,takeBodyEditPoint } from '../editing';
import {startOperation} from '../operations';
import {importLocalMedia,importMediaFile,mediaFileKind} from '../media-import';
import {math,MathClipboard} from './MathExtension';
import {Video} from './VideoExtension';
import {AllSelection,TextSelection} from '@tiptap/pm/state';
import '../styles-editor.css';
import {revealEditorCaret} from './editor-scroll';
import {ListNumbers} from './ListNumbers';
import {registerMarkdownSelection} from './markdown-selection';

const Columns=Node.create({name:'columns',group:'block',content:'column{2}',isolating:true,
  addAttributes(){return {ratio:{default:'1:1'}};},
  parseHTML(){return [{tag:'div[data-columns]'}];},
  renderHTML({HTMLAttributes}){return ['div',mergeAttributes({'data-columns':'','class':'rich-columns','data-ratio':HTMLAttributes.ratio}),0];},
  addProseMirrorPlugins(){return [new Plugin({filterTransaction(transaction){if(!transaction.docChanged)return true;try{validateBody(transaction.doc.toJSON());return true;}catch(error){queueMicrotask(()=>showError(error));return false;}}})];}});
const Column=Node.create({name:'column',content:'block+',isolating:true,
  parseHTML(){return [{tag:'div[data-column]'}];},renderHTML(){return ['div',{'data-column':'','class':'rich-column'},0];}});
const AssetImage=Node.create({name:'assetImage',group:'block',atom:true,
  addAttributes(){return {assetId:{default:'',parseHTML:element=>element.getAttribute('data-asset-id')},alt:{default:'',parseHTML:element=>element.getAttribute('data-alt')??''}};},
  parseHTML(){return [{tag:'div[data-asset-image]'}];},
  renderHTML({HTMLAttributes}){return ['div',{'data-asset-image':'','data-asset-id':HTMLAttributes.assetId,'data-alt':HTMLAttributes.alt,class:'editor-asset'},'图片'];},
  addNodeView(){return ({node})=>{const dom=document.createElement('figure');dom.className='editor-asset';const img=document.createElement('img');img.alt=String(node.attrs.alt);dom.append(img);let live=true;
    img.title='点击放大图片';img.onclick=img.ondblclick=event=>{event.preventDefault();event.stopPropagation();openImagePreview(String(node.attrs.assetId));};
    assetUrl(String(node.attrs.assetId),true).then(src=>{if(live)img.src=src;}).catch(()=>{dom.textContent='图片暂不可用';});
    return {dom,destroy(){live=false;}};};}});

export default function BodyEditor({id,body,scrollTop=0}:{id:string;body:RichNode;scrollTop?:number}) {
  const [entryPoint]=useState(()=>takeBodyEditPoint(id));const [,selectionTick]=useState(0);
  const [entryScroll]=useState(scrollTop);
  const originDoc=useRef(getState().doc?.id);
  const last=useRef(JSON.stringify(body));
  const dirty=useRef(false);
  const editorRef=useRef<Editor|null>(null);
  const composing=useRef(false),compositionTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const commit=(current:Editor)=>{
    if(current.isDestroyed||!dirty.current||getState().doc?.id!==originDoc.current||!getState().doc?.nodes[id])return;
    const value=current.getJSON() as RichNode,encoded=JSON.stringify(value);if(encoded===last.current){dirty.current=false;return;}
    validateBody(value);if(encoded.length>150000)throw new Error('正文较长，请拆分为多个节点');
    editDocument(doc=>{doc.nodes[id].body=value;},{history:true,group:'body:'+id});last.current=encoded;dirty.current=false;
  };
  const finishEditing=()=>{const current=editorRef.current;if(!current)return;if(composing.current||current.view.composing){showError('请先确认输入法中的文字，再完成编辑');return;}try{commitDrafts();current.commands.blur();commit(current);patchState({editingId:null});}catch(error){showError(error);}};
  const editor=useEditor({extensions:[StarterKit.configure({undoRedo:false,codeBlock:false}),DiagramCodeBlock.configure({lowlight,enableTabIndentation:true}),TableKit.configure({table:{resizable:false},tableCell:false,tableHeader:false}),AlignedCell,AlignedHeader,FormattedPaste,ListNumbers,Columns,Column,math('mathBlock',false),math('mathInline',true),MathClipboard,AssetImage,Video],
    content:body,autofocus:false,editorProps:{attributes:{class:'rich-doc editor-content nodrag nopan nowheel'},
      handleScrollToSelection(view){const rect=revealEditorCaret(view);window.dispatchEvent(new CustomEvent('qingtu-reveal-caret',{detail:{docId:originDoc.current,rect}}));return true;},
      handleKeyDown(_view,event){
        if(event.key==='Escape'&&!event.isComposing){finishEditing();return true;}
        const current=editorRef.current;
        if(event.key!=='Tab'||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!current)return false;
        // Code blocks own indentation. Other Tab presses stay inside the editor,
        // including the first list item where there is no preceding parent yet.
        if(current.isActive('codeBlock'))return false;
        event.preventDefault();event.stopPropagation();
        if(current.isActive('table')){
          if(event.shiftKey)current.commands.goToPreviousCell();
          else if(!current.commands.goToNextCell())current.chain().addRowAfter().goToNextCell().run();
        }else if(current.isActive('listItem')){
          if(event.shiftKey)current.commands.liftListItem('listItem');else current.commands.sinkListItem('listItem');
        }else if(!event.shiftKey&&current.isActive('paragraph')){
          current.commands.toggleOrderedList();current.commands.sinkListItem('listItem');
        }
        return true;
      },
      handlePaste(_view,event){
        const files=Array.from(event.clipboardData?.files??[]).filter(file=>mediaFileKind(file));
        if(!files.length)return false;
        event.preventDefault();event.stopPropagation();void insertFiles(files);return true;
      },
      handleDrop(view,event,_slice,moved){
        if(moved)return false;const files=Array.from(event.dataTransfer?.files??[]).filter(file=>mediaFileKind(file));if(!files.length)return false;
        event.preventDefault();event.stopPropagation();const position=view.posAtCoords({left:event.clientX,top:event.clientY});
        if(position)view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))));
        void insertFiles(files);return true;
      },
      handleDOMEvents:{compositionstart(){composing.current=true;return false;},compositionend(){composing.current=false;if(compositionTimer.current)clearTimeout(compositionTimer.current);compositionTimer.current=setTimeout(()=>{const current=editorRef.current;if(current&&!current.isDestroyed)try{commit(current);}catch(error){showError(error);}},30);return false;}}},
    onSelectionUpdate(){selectionTick(value=>value+1);},
    onUpdate({editor}) {dirty.current=true;if(!composing.current&&!editor.view.composing)try{commit(editor);}catch(error){showError(error);}},
  },[id]);
  editorRef.current=editor;
  useEffect(()=>{
    if(!editor)return;
    let remove:(()=>void)|undefined;
    // EditorContent mounts the view after render, including StrictMode remounts.
    const frame=requestAnimationFrame(()=>{if(editor.isDestroyed)return;
      remove=registerMarkdownSelection(editor.view.dom,code=>{
        if(editor.isDestroyed||editor.view.composing)return;
        const {doc,tr}=editor.state;
        if(code){
          const position=doc.resolve(editor.view.posAtDOM(code.querySelector('code')??code,0));
          for(let depth=position.depth;depth>0;depth--){
            if(position.node(depth).type.name!=='codeBlock')continue;
            editor.view.dispatch(tr.setSelection(TextSelection.create(doc,position.start(depth),position.end(depth))));
            editor.view.focus();return;
          }
          return;
        }
        editor.view.dispatch(tr.setSelection(new AllSelection(doc)));
        editor.view.focus();
      });
    });
    return()=>{cancelAnimationFrame(frame);remove?.();};
  },[editor]);
  useEffect(()=>{
    if(!editor)return;const frame=requestAnimationFrame(()=>{if(editor.isDestroyed)return;
      const pane=editor.view.dom.closest('.card-body');if(pane)pane.scrollTop=entryScroll;
      const position=entryPoint?editor.view.posAtCoords({left:entryPoint.x,top:entryPoint.y})?.pos:editor.state.doc.content.size;
      if(position!==undefined)editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position))));
      editor.view.focus();
    });return()=>cancelAnimationFrame(frame);
  },[editor,entryPoint,entryScroll]);
  useEffect(()=>{
    if(!editor)return;
    const remove=registerDraft('body:'+id,{commit:()=>commit(editor),composing:()=>composing.current||(!editor.isDestroyed&&editor.view.composing)});
    return()=>{if(compositionTimer.current)clearTimeout(compositionTimer.current);if(!editor.isDestroyed&&!composing.current&&!editor.view.composing)try{commit(editor);}catch(error){showError(error);}remove();};
  },[editor,id]);
  useEffect(()=>{if(!editor)return;const current=getState().doc?.nodes[id]?.body;if(current&&JSON.stringify(current)!==last.current){dirty.current=false;editor.commands.setContent(current,{emitUpdate:false});last.current=JSON.stringify(editor.getJSON());}},[body,editor,id]);
  if(!editor)return null;
  async function insertFiles(files:File[]) {
    const editor=editorRef.current;
    if(!editor||editor.isDestroyed)return;
    try{commitDrafts();}catch(error){showError(error);return;}
    const operation=startOperation('media-import'),storage=getState().library?.storagePath;
    const current=()=>!operation.signal.aborted&&!editor.isDestroyed&&getState().doc?.id===originDoc.current&&getState().library?.storagePath===storage;
    const selection=editor.state.selection.getBookmark();
    try{
      patchState({busy:'正在导入本地媒体…'});
      const assets=[];
      for(const file of files){const asset=await importMediaFile(file,operation.signal);if(!current())return;assets.push(asset);}
      if(!current())return;
      assets.forEach(addAsset);
      editor.view.dispatch(editor.state.tr.setSelection(selection.resolve(editor.state.doc)));
      editor.chain().focus().insertContent(assets.map(asset=>({type:asset.mime.startsWith('video/')?'video':'assetImage',attrs:{assetId:asset.id,alt:asset.name}}))).run();
    }catch(error){if(current())showError(error);}
    finally{if(operation.isCurrent()&&getState().busy==='正在导入本地媒体…')patchState({busy:''});operation.finish();}
  }
  async function insertMedia(kind:'image'|'video') {
    try{commitDrafts();}catch(error){showError(error);return;}
    const operation=startOperation('media-import'),storage=getState().library?.storagePath;
    const current=()=>!operation.signal.aborted&&!editor!.isDestroyed&&getState().doc?.id===originDoc.current&&getState().library?.storagePath===storage;
    try {const path=await chooseAsset(kind);if(!path||!current())return;patchState({busy:'正在导入本地媒体…'});
      const asset=await importLocalMedia(path,kind,operation.signal);if(!current())return;addAsset(asset);
      editor!.chain().focus().insertContent({type:kind==='image'?'assetImage':'video',attrs:{assetId:asset.id,alt:asset.name}}).run();
    }catch(error){if(current())showError(error);}
    finally{if(operation.isCurrent()&&getState().busy==='正在导入本地媒体…')patchState({busy:''});operation.finish();}
  }
  const button=(label:string,icon:React.ReactNode,action:()=>void,active=false)=><button type="button" title={label} aria-label={label} className={active?'active':''} onClick={action}>{icon}</button>;
  return <div className="body-editor nodrag nopan nowheel" onKeyDown={e=>{if(!(e.ctrlKey||e.metaKey))e.stopPropagation();}} onPointerDown={e=>e.stopPropagation()}>
    <FloatingEditorTools id={id}>
      {button('粗体',<Bold size={15}/>,()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
      {button('斜体',<Italic size={15}/>,()=>editor.chain().focus().toggleItalic().run())}
      {button('无序列表',<List size={16}/>,()=>editor.chain().focus().toggleBulletList().run())}
      {button('有序列表',<ListOrdered size={16}/>,()=>editor.chain().focus().toggleOrderedList().run())}
      {button('代码块',<Code2 size={16}/>,()=>editor.chain().focus().toggleCodeBlock().run(),editor.isActive('codeBlock'))}
      {editor.isActive('codeBlock')&&<select aria-label="代码语言" value={editor.getAttributes('codeBlock').language??''} onChange={event=>editor.chain().focus().updateAttributes('codeBlock',{language:event.target.value||null}).run()}><option value="">自动识别语言</option><option value="mermaid">Mermaid 图表</option>{lowlight.listLanguages().map(language=><option key={language} value={language}>{language}</option>)}</select>}
      {button('插入表格',<Table2 size={16}/>,()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run())}
      {editor.isActive('table')&&<><button onClick={()=>editor.chain().focus().addRowAfter().run()}>加行</button><button onClick={()=>editor.chain().focus().addColumnAfter().run()}>加列</button><button onClick={()=>editor.chain().focus().deleteTable().run()}>移除表格</button></>}
      {button('插入公式',<Sigma size={16}/>,()=>editor.chain().focus().insertContent({type:'mathBlock',attrs:{latex:''}}).run())}
      {button('插入双栏',<Columns2 size={16}/>,()=>editor.chain().focus().insertContent({type:'columns',attrs:{ratio:'3:2'},content:[{type:'column',content:[{type:'paragraph'}]},{type:'column',content:[{type:'paragraph'}]}]}).run())}
      {button('切换双栏比例',<span className="ratio-label">1:1</span>,()=>{if(editor.isActive('columns'))editor.chain().focus().updateAttributes('columns',{ratio:editor.getAttributes('columns').ratio==='1:1'?'3:2':'1:1'}).run();else showError('请先把光标放入双栏');})}
      {button('插入图片',<ImagePlus size={16}/>,()=>void insertMedia('image'))}
      {button('插入视频',<Film size={16}/>,()=>void insertMedia('video'))}
      {button('添加链接',<Link size={15}/>,()=>{const href=window.prompt('输入链接地址（https://）','https://');if(href&&/^https?:\/\//i.test(href))editor.chain().focus().setLink({href}).run();})}
      {button('完成编辑',<Check size={16}/>,finishEditing)}
    </FloatingEditorTools>
    <EditorContent editor={editor}/>
    <div className="editor-hint">代码块可选择 Mermaid 图表，或粘贴 ```mermaid 围栏代码 · 列表 Tab 缩进 / Shift+Tab 提升 · Esc 完成编辑</div>
  </div>;
}
