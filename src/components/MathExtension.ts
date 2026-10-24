import {Extension,Node,InputRule} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {Fragment,Slice} from '@tiptap/pm/model';
import {mathNodeView} from './math-node-view';
import 'katex/dist/katex.min.css';
import {convertMathContent,mathTokens,plainMathContent} from '../domain/math-text';
import type {RichNode} from '../domain/types';

export const math=(name:string,inline:boolean)=>Node.create({
  name,group:inline?'inline':'block',inline,atom:true,
  addAttributes(){return {latex:{default:'',parseHTML:element=>element.getAttribute('data-latex')??element.getAttribute('latex')??element.textContent??''}};},
  parseHTML(){return [{tag:`span[data-${name}]`}];},
  renderHTML({node}){return ['span',{[`data-${name}`]:'','data-latex':node.attrs.latex,class:inline?'math-inline':'math-block'},String(node.attrs.latex)];},
  renderText({node}){return inline?`$${node.attrs.latex}$`:`$$\n${node.attrs.latex}\n$$`;},
  addInputRules(){return [new InputRule({
    find:inline?/(?<![\\$])(?:\$([^$\n]+)\$|\\\((.+?)\\\))$/:/(?:\$\$([^$]+)\$\$|\\\[(.+?)\\\])$/,
    handler:({range,match,chain})=>{chain().insertContentAt(range,{type:name,attrs:{latex:(match[1]??match[2]).trim()}}).run();},
  })];},
  addNodeView(){return mathNodeView(name,inline);},
});

// Browsers often copy both rendered glyphs and hidden MathML. Extract the TeX
// annotation once, before ProseMirror flattens that DOM into duplicate text.
export function normalizeMathHTML(html:string):string {
  const doc=new DOMParser().parseFromString(html,'text/html');
  const candidates=doc.querySelectorAll('.katex-display,.katex,mjx-container,math,[data-math],[data-latex],script[type^="math/tex"]');
  for(const element of candidates){
    if(!doc.body.contains(element))continue;
    const annotation=element.querySelector('annotation[encoding="application/x-tex"],annotation[encoding="application/x-latex"]');
    const latex=element.getAttribute('data-latex')??element.getAttribute('data-math')??annotation?.textContent??(element.matches('script')?element.textContent:null);
    if(latex===null||latex===undefined)continue;
    const block=element.matches('.katex-display,[data-mathblock]')||element.getAttribute('display')==='block'||element.getAttribute('display')==='true'||element.getAttribute('type')?.includes('mode=display');
    const replacement=doc.createElement('span');replacement.setAttribute(block?'data-mathBlock':'data-mathInline','');replacement.setAttribute('data-latex',latex);replacement.textContent=latex;element.replaceWith(replacement);
  }
  return doc.body.innerHTML;
}

export const MathClipboard=Extension.create({name:'mathClipboard',
  addProseMirrorPlugins(){const editor=this.editor;return [new Plugin({props:{
    transformPastedHTML:normalizeMathHTML,
    transformPasted(slice,view){
      if(view.state.selection.$from.parent.type.spec.code)return slice;
      const content=convertMathContent((slice.content.toJSON()??[]) as RichNode[]);
      const fragment=Fragment.fromJSON(editor.schema,content),open=Slice.maxOpen(fragment);
      return new Slice(fragment,Math.min(slice.openStart,open.openStart),Math.min(slice.openEnd,open.openEnd));
    },
    handlePaste(view,event){
      const text=event.clipboardData?.getData('text/plain')??'';
      if(event.clipboardData?.getData('text/html')||view.state.selection.$from.parent.type.spec.code||view.state.selection.$from.marks().some(mark=>mark.type.name==='code'))return false;
      if(!mathTokens(text).some(node=>node.type==='mathInline'||node.type==='mathBlock'))return false;
      editor.commands.insertContent(plainMathContent(text));return true;
    },
  }})];},
});
