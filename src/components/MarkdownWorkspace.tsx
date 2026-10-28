import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {getSchema,type Editor} from '@tiptap/core';
import {ArrowLeft,ListTree,Columns2,Code2,BookOpen,Presentation} from 'lucide-react';
import BodyEditor,{bodyExtensions} from './Editor';
import {RichContent} from './RichContent';
import type {MindNode,RichNode} from '../domain/types';
import {parseMarkdownDocument,serializeMarkdownDocument} from '../domain/markdown-document';
import {commitDrafts,registerDraft} from '../editing';
import {editDocument,getState,showError} from '../state';
import '../styles-markdown.css';

type Mode='rich'|'source'|'split';
const MarkdownPresentation=lazy(()=>import('./MarkdownPresentation'));
export default function MarkdownWorkspace({node,onReturn,toolbarContainer}:{node:MindNode;onReturn:()=>void;toolbarContainer:HTMLElement|null}){
  const [mode,setMode]=useState<Mode>('rich'),[source,setSource]=useState(()=>serializeMarkdownDocument(node.body)),[error,setError]=useState('');
  const [outlineVisible,setOutlineVisible]=useState(true);
  const [presentation,setPresentation]=useState<RichNode|null>(null);
  const sourceRef=useRef(source),dirty=useRef(false),composing=useRef(false),lastBody=useRef(JSON.stringify(node.body)),docId=useRef(getState().doc!.id);
  const sourceField=useRef<HTMLTextAreaElement>(null),preview=useRef<HTMLDivElement>(null),editorRef=useRef<Editor|null>(null);
  const schema=useMemo(()=>getSchema(bodyExtensions()),[]);
  const commitSource=()=>{
    if(!dirty.current)return;
    if(composing.current)throw Error('请先确认输入法中的文字');
    const body=parseMarkdownDocument(sourceRef.current);schema.nodeFromJSON(body).check();
    const current=getState();
    if(current.doc?.id!==docId.current||current.doc.nodes[node.id]?.kind!=='card')throw Error('原卡片已变化，请返回导图后重新打开');
    const assets=new Set(current.library?.assets.map(asset=>asset.id));
    const collectAssets=(value:RichNode)=>{if(value.type==='assetImage'||value.type==='video')assets.add(String(value.attrs?.assetId));value.content?.forEach(collectAssets);};
    collectAssets(current.doc.nodes[node.id].body);
    const verifyAssets=(value:RichNode)=>{if(value.type==='assetImage'||value.type==='video'){if(!assets.has(String(value.attrs?.assetId)))throw Error('正文引用了不存在的本地素材，请保留原素材标识');}value.content?.forEach(verifyAssets);};
    verifyAssets(body);
    const encoded=JSON.stringify(body),previous=lastBody.current;lastBody.current=encoded;
    editDocument(doc=>{doc.nodes[node.id].body=body;},{group:'markdown-source:'+node.id});
    if(JSON.stringify(getState().doc?.nodes[node.id]?.body)!==encoded){lastBody.current=previous;throw Error(getState().error||'正文未能更新，请检查内容');}
    dirty.current=false;setError('');
  };
  const commitRef=useRef(commitSource);commitRef.current=commitSource;
  useEffect(()=>registerDraft('markdown-source:'+node.id,{commit:()=>commitRef.current(),composing:()=>composing.current}),[node.id]);
  useEffect(()=>{
    const encoded=JSON.stringify(node.body);
    if(encoded===lastBody.current)return;
    lastBody.current=encoded;dirty.current=false;setError('');
    if(mode!=='rich'){sourceRef.current=serializeMarkdownDocument(node.body);setSource(sourceRef.current);}
  },[node.body,mode]);
  const changeSource=(value:string)=>{
    sourceRef.current=value;dirty.current=true;setSource(value);
    if(!composing.current)try{commitSource();}catch(reason){setError(String(reason).replace(/^Error:\s*/,''));}
  };
  const switchMode=(next:Mode)=>{
    try{commitDrafts();if(next!=='rich'&&mode==='rich'){const body=getState().doc?.nodes[node.id]?.body;if(body){lastBody.current=JSON.stringify(body);sourceRef.current=serializeMarkdownDocument(body);setSource(sourceRef.current);}}setMode(next);}catch(reason){showError(reason);}
  };
  const editorReady=useCallback((editor:Editor|null)=>{editorRef.current=editor;},[]);
  const outline=useMemo(()=>{const result:{text:string;level:number}[]=[];const walk=(value:RichNode)=>{if(value.type==='heading')result.push({text:value.content?.map(child=>child.text??'').join('')||'未命名标题',level:Number(value.attrs?.level??1)});value.content?.forEach(walk);};walk(node.body);return result;},[node.body]);
  const jump=(index:number)=>{
    if(mode==='rich'){
      const editor=editorRef.current;if(!editor)return;let current=0;
      editor.state.doc.descendants((value,pos)=>{if(value.type.name==='heading'&&current++===index){editor.chain().focus().setTextSelection(pos+1).scrollIntoView().run();}return true;});
    }else if(mode==='source'){
      const field=sourceField.current;if(!field)return;const at=source.indexOf('#'.repeat(outline[index].level)+' '+outline[index].text);field.focus();if(at>=0)field.setSelectionRange(at,at);
    }else preview.current?.querySelectorAll('h1,h2,h3,h4,h5,h6')[index]?.scrollIntoView({block:'start',behavior:'smooth'});
  };
  const insertColumns=()=>{
    const field=sourceField.current;if(!field)return;
    const start=field.selectionStart,end=field.selectionEnd,insert='\n\n:::columns 3:2\n:::column\n左栏内容\n:::column\n右栏内容\n:::\n\n';
    changeSource(source.slice(0,start)+insert+source.slice(end));requestAnimationFrame(()=>{field.focus();field.setSelectionRange(start+insert.length,start+insert.length);});
  };
  const present=()=>{try{commitDrafts();const body=getState().doc?.nodes[node.id]?.body;if(body)setPresentation(structuredClone(body));}catch(reason){showError(reason);}};
  return <section className="markdown-workspace" aria-label="Markdown 全页编辑" onKeyDown={event=>{
    if(event.nativeEvent.isComposing)return;
    if((event.ctrlKey||event.metaKey)&&event.key==='/'){event.preventDefault();switchMode(mode==='rich'?'source':'rich');}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&dirty.current){event.stopPropagation();}
    if(event.key==='Escape'){event.stopPropagation();onReturn();}
  }}>
    {toolbarContainer&&createPortal(<div className="markdown-navigation-controls" aria-label="Markdown 编辑导航">
      <div className="markdown-view-modes" aria-label="编辑视图">{([{id:'rich',label:'即时编辑',icon:BookOpen},{id:'source',label:'源码',icon:Code2},{id:'split',label:'分屏',icon:Columns2}] as const).map(({id,label,icon:Icon})=><button key={id} aria-pressed={mode===id} onClick={()=>switchMode(id)}><Icon size={15}/>{label}</button>)}</div>
      <div className="markdown-view-actions"><button aria-label="播放当前 Markdown" title="播放当前 Markdown" onClick={present}><Presentation size={17}/><span>演示</span></button><button aria-label="切换本文大纲" title="切换本文大纲" aria-pressed={outlineVisible} onClick={()=>setOutlineVisible(!outlineVisible)}><ListTree size={17}/></button><button aria-label="返回导图" title="返回导图" onClick={onReturn}><ArrowLeft size={16}/><span>返回导图</span></button></div>
    </div>,toolbarContainer)}
    <div className={`markdown-workspace-layout ${outlineVisible?'':'without-outline'}`}>
      {outlineVisible&&<aside className="markdown-outline"><h2>本文大纲</h2>{outline.length?outline.map((heading,index)=><button key={index} style={{paddingLeft:12+Math.min(heading.level-1,4)*12}} onClick={()=>jump(index)}>{heading.text}</button>):<p>输入标题后会显示在这里</p>}</aside>}
      <div className="markdown-workspace-document">
        {mode==='rich'?<BodyEditor id={node.id} body={node.body} fullPage onFinish={onReturn} onEditorReady={editorReady}/>:<>
          <div className="markdown-source-tools"><button onClick={insertColumns}><Columns2 size={15}/>插入双栏</button><details><summary>扩展语法说明</summary><div>双栏使用 <code>:::columns 3:2</code>，用两个 <code>:::column</code> 分隔左右栏，末尾用 <code>:::</code> 结束。比例也可设为 1:1。图片、视频和复杂格式保存在 <code>qingtu-node-json</code> 块中，切换视图会保留这些内容。</div></details></div>
          {error&&<div className="markdown-source-error" role="status">{error}。草稿保留在当前页，补全后自动同步。</div>}
          <div className={`markdown-source-layout ${mode==='split'?'is-split':''}`}>
            <textarea ref={sourceField} aria-label="Markdown 源码" spellCheck={false} value={source} onChange={event=>changeSource(event.target.value)} onCompositionStart={()=>composing.current=true} onCompositionEnd={event=>{composing.current=false;changeSource(event.currentTarget.value);}} onKeyDown={event=>{if(event.key==='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.nativeEvent.isComposing){event.preventDefault();const field=event.currentTarget,start=field.selectionStart,end=field.selectionEnd;changeSource(source.slice(0,start)+'  '+source.slice(end));requestAnimationFrame(()=>field.setSelectionRange(start+2,start+2));}}}/>
            {mode==='split'&&<div ref={preview} className="markdown-preview" aria-label="Markdown 排版预览"><RichContent body={node.body}/></div>}
          </div>
        </>}
      </div>
    </div>
    {presentation&&<Suspense fallback={null}><MarkdownPresentation body={presentation} title={node.title||'未命名卡片'} documentTitle={getState().doc?.title??''} onClose={()=>setPresentation(null)}/></Suspense>}
  </section>;
}
