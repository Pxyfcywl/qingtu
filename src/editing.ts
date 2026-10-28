type Draft={commit:()=>void;composing:()=>boolean};
const drafts=new Map<string,Draft>();
const bodyPoints=new Map<string,{x:number;y:number}>();
export function recordBodyEditPoint(id:string,point:{x:number;y:number}){bodyPoints.set(id,point);}
export function takeBodyEditPoint(id:string){const point=bodyPoints.get(id);bodyPoints.delete(id);return point;}
export function openMarkdownCard(id:string){commitDrafts();window.dispatchEvent(new CustomEvent('qingtu-open-markdown',{detail:id}));}
export function registerDraft(id:string,draft:Draft){drafts.set(id,draft);return()=>{if(drafts.get(id)===draft)drafts.delete(id);};}
export function hasComposingDraft(){return [...drafts.values()].some(draft=>draft.composing());}
export function commitDrafts(){
  if(hasComposingDraft())throw new Error('请先确认输入法中的文字，再保存、切换或关闭窗口');
  for(const draft of [...drafts.values()])draft.commit();
}
