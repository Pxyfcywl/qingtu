import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {TableCell,TableHeader} from '@tiptap/extension-table';
import {markdownPaste,tabularPaste} from '../domain/markdown-paste';
import {validateBody} from '../domain/body';
import {showError} from '../state';
const alignAttribute={default:null,parseHTML:(element:HTMLElement)=>['left','center','right'].includes(element.style.textAlign)?element.style.textAlign:null,renderHTML:(attrs:Record<string,unknown>)=>['left','center','right'].includes(String(attrs.align))?{style:`text-align:${attrs.align}`}:{}};
export const AlignedCell=TableCell.extend({addAttributes(){return {...this.parent?.(),align:alignAttribute};}});
export const AlignedHeader=TableHeader.extend({addAttributes(){return {...this.parent?.(),align:alignAttribute};}});
export function normalizeCodeHTML(html:string){
  const doc=new DOMParser().parseFromString(html,'text/html');
  for(const pre of doc.querySelectorAll('pre')){const code=pre.querySelector('code');if(code)pre.replaceChildren(code);}
  for(const element of doc.querySelectorAll<HTMLElement>('div[style]')){
    if(!doc.body.contains(element)||element.closest('pre')||!element.style.whiteSpace.startsWith('pre')||!/monospace|consolas|courier/i.test(element.style.fontFamily))continue;
    const lines=(node:Node):string=>node.nodeType===Node.TEXT_NODE?node.textContent??'':node instanceof Element&&node.tagName==='BR'?'\n':Array.from(node.childNodes).map(lines).join('')+(node instanceof Element&&node.tagName==='DIV'?'\n':'');
    const pre=doc.createElement('pre'),code=doc.createElement('code');code.textContent=lines(element).replace(/\n$/,'');pre.append(code);element.replaceWith(pre);
  }
  return doc.body.innerHTML;
}
export const FormattedPaste=Extension.create({name:'formattedPaste',priority:1100,
  addProseMirrorPlugins(){const editor=this.editor;return [new Plugin({props:{transformPastedHTML:normalizeCodeHTML,handlePaste(view,event){
    if(view.state.selection.$from.parent.type.spec.code||view.state.selection.$from.marks().some(mark=>mark.type.name==='code'))return false;
    const clipboard=event.clipboardData,text=clipboard?.getData('text/plain')??'',html=clipboard?.getData('text/html')??'';
    if(!text||/<(?:table|pre)\b|data-pm-slice/i.test(html))return false;
    try{
      const content=markdownPaste(text)??(editor.isActive('table')?null:tabularPaste(text));if(!content)return false;
      validateBody({type:'doc',content});event.preventDefault();editor.commands.insertContent(content);return true;
    }catch(error){event.preventDefault();showError(error);return true;}
  }}})];},
});
