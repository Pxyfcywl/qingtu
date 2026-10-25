import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {attachDiagram,isMermaid,openDiagram} from './diagram-runtime';
import '../styles-diagrams.css';

// Preserve the existing codeBlock schema, clipboard semantics and Lowlight marks.
export const DiagramCodeBlock=CodeBlockLowlight.extend({
  addNodeView(){return ({node})=>{
    let current=node,diagram:ReturnType<typeof attachDiagram>|undefined,timer:ReturnType<typeof setTimeout>|undefined,close:(()=>void)|undefined;
    const dom=document.createElement('div');dom.className='editor-code-block';
    const pre=document.createElement('pre'),code=document.createElement('code');pre.append(code);
    const preview=document.createElement('section');preview.className='diagram-block diagram-editor-preview';preview.contentEditable='false';
    const tools=document.createElement('div');tools.className='diagram-tools';
    const label=document.createElement('span');label.textContent='Mermaid 实时预览';
    const button=document.createElement('button');button.type='button';button.textContent='放大图表';
    button.onclick=event=>{event.preventDefault();event.stopPropagation();close?.();close=openDiagram(current.textContent);};
    tools.append(label,button);
    const surface=document.createElement('div');surface.className='diagram-surface';preview.append(tools,surface);dom.append(pre,preview);
    const refresh=()=>{
      const language=String(current.attrs.language??'');pre.dataset.language=language;code.className=language?'language-'+language:'';
      const active=isMermaid(language);preview.hidden=!active;dom.classList.toggle('has-diagram',active);
      if(timer)clearTimeout(timer);
      if(!active){diagram?.destroy();diagram=undefined;surface.replaceChildren();return;}
      if(!diagram)diagram=attachDiagram(surface,current.textContent);
      else timer=setTimeout(()=>diagram?.update(current.textContent),150);
    };
    refresh();
    return {dom,contentDOM:code,
      update(next){if(next.type!==current.type)return false;current=next;refresh();return true;},
      stopEvent(event){return preview.contains(event.target as globalThis.Node);},
      ignoreMutation(mutation){return mutation.type!=='selection'&&!code.contains(mutation.target);},
      destroy(){if(timer)clearTimeout(timer);diagram?.destroy();close?.();},
    };
  };},
});
