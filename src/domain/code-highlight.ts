import {common,createLowlight} from 'lowlight';
export const lowlight=createLowlight(common);
export function codeTree(code:string,language?:string){
  try{return language&&lowlight.registered(language)?lowlight.highlight(language,code):lowlight.highlightAuto(code);}
  catch{return {type:'root' as const,children:[{type:'text' as const,value:code}]};}
}
