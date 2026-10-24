import type {RichNode} from './types';
export function orderedStart(value:unknown):number{
  return typeof value==='number'&&Number.isSafeInteger(value)?value:1;
}
// Presentation only: keep list nesting and start values in the saved document,
// and derive labels again after indentation, undo or reopening.
export function orderedListNumbers(body:RichNode):Record<string,string>{
  const labels:Record<string,string>={};
  const walk=(node:RichNode,key:string,parents:number[])=>{
    if(node.type==='orderedList'){
      const start=orderedStart(node.attrs?.start);
      node.content?.forEach((item,index)=>{
        const numbers=[...parents,start+index],path=key+'.'+index;
        if(item.type==='listItem')labels[path]=numbers.join('.')+(numbers.length===1?'.':'');
        walk(item,path,numbers);
      });
    }else node.content?.forEach((child,index)=>walk(child,key+'.'+index,parents));
  };
  walk(body,'root',[]);return labels;
}
