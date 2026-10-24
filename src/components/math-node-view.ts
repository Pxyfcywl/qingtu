import type {NodeViewRenderer} from '@tiptap/core';
import katex from 'katex';

export const mathNodeView=(name:string,inline:boolean):NodeViewRenderer=>({node,view,getPos})=>{
  let current=node,composing=false,live=true;
  const dom=document.createElement('span');dom.className=inline?'math-inline editor-math':'math-block editor-math';dom.contentEditable='false';
  const controls=document.createElement('span');controls.className='math-source';controls.hidden=true;
  const label=document.createElement('label');label.textContent='LaTeX 公式';
  const input=document.createElement('textarea');input.setAttribute('aria-label','LaTeX 公式');input.rows=3;input.spellcheck=false;input.placeholder='例如 \\frac{x}{y}';label.append(input);
  const done=document.createElement('button');done.type='button';done.textContent='完成';done.setAttribute('aria-label','完成公式编辑');
  const preview=document.createElement('span');preview.className='math-live-preview';preview.setAttribute('aria-label','公式实时预览');preview.title='点击编辑公式';
  controls.append(label,done);dom.append(controls,preview);
  const render=(latex:string)=>{preview.innerHTML=latex?katex.renderToString(latex,{displayMode:!inline,throwOnError:false,trust:false,maxExpand:500,maxSize:20,strict:'warn'}):'<span class="math-empty">输入公式，右侧实时预览</span>';};
  const open=()=>{controls.hidden=false;dom.classList.add('is-math-editing');input.value=String(current.attrs.latex);input.focus();};
  const close=()=>{controls.hidden=true;dom.classList.remove('is-math-editing');view.focus();};
  const apply=()=>{render(input.value);if(composing)return;const pos=getPos();if(typeof pos==='number'&&input.value!==current.attrs.latex)view.dispatch(view.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,latex:input.value}));};
  input.addEventListener('input',apply);input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>{composing=false;apply();});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close();}});
  done.onclick=event=>{event.stopPropagation();if(!composing)close();};
  preview.onclick=event=>{event.stopPropagation();open();};dom.ondblclick=event=>{event.stopPropagation();if(controls.hidden)open();};
  input.value=String(current.attrs.latex);render(input.value);
  if(!input.value)queueMicrotask(()=>{if(live&&dom.isConnected)open();});
  return {dom,stopEvent:event=>controls.contains(event.target as globalThis.Node),ignoreMutation:mutation=>mutation.type!=='selection',
    update(next){if(next.type.name!==name)return false;current=next;if(!composing&&input.value!==next.attrs.latex)input.value=String(next.attrs.latex);render(String(next.attrs.latex));return true;},destroy(){live=false;}};
};
