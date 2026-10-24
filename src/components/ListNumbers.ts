import {Extension} from '@tiptap/core';
import type {Node} from '@tiptap/pm/model';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {orderedListNumbers} from '../domain/list-numbers';
const key=new PluginKey<DecorationSet>('hierarchicalListNumbers');
function decorations(doc:Node){
  const labels=orderedListNumbers(doc.toJSON()),items:Decoration[]=[];
  const walk=(node:Node,pos:number,path:string)=>{
    if(labels[path])items.push(Decoration.node(pos,pos+node.nodeSize,{'data-list-number':labels[path]}));
    node.forEach((child,offset,index)=>walk(child,pos+1+offset,path+'.'+index));
  };
  walk(doc,-1,'root');return DecorationSet.create(doc,items);
}
export const ListNumbers=Extension.create({name:'hierarchicalListNumbers',
  addProseMirrorPlugins(){return [new Plugin({key,state:{init:(_config,state)=>decorations(state.doc),apply:(transaction,current)=>transaction.docChanged?decorations(transaction.doc):current},props:{decorations:state=>key.getState(state)}})];},
});
