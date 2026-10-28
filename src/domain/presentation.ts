import type {RichNode} from './types';

export const slideSize={width:1280,height:720,bodyWidth:1152,bodyHeight:452};
export type PresentationSection={id:number;title:string;trail:string[];blocks:RichNode[]};
export type PresentationPage={section:number;title:string;trail:string[];continuation:number;body:RichNode;oversize:boolean};
export type PresentationPart={source:number;kind:'inline'|'code'|'list'|'table'|'atomic'|'break';node:RichNode;keepNext?:boolean};
export const nodeText=(node:RichNode):string=>node.type==='text'?node.text??'':node.type==='mathInline'?String(node.attrs?.latex??''):(node.content??[]).map(nodeText).join('');

export function presentationSections(body:RichNode,title:string):PresentationSection[]{
  const blocks=body.content??[],headings=blocks.filter(node=>node.type==='heading');
  const minimum=Math.min(6,...headings.map(node=>Number(node.attrs?.level??1))),boundary=Math.min(6,Math.max(2,minimum+1));
  const root=headings[0]&&Number(headings[0].attrs?.level??1)===1?nodeText(headings[0])||title:title;
  const sections:PresentationSection[]=[];let current:PresentationSection={id:0,title:root||'未命名卡片',trail:[],blocks:[]};
  let stack:{level:number;text:string}[]=[],first=true;
  for(const node of blocks){
    if(node.type!=='heading'||Number(node.attrs?.level??1)>boundary){current.blocks.push(node);continue;}
    const level=Number(node.attrs?.level??1),text=nodeText(node)||'未命名标题';
    while(stack.length&&stack.at(-1)!.level>=level)stack.pop();
    const trail=stack.map(heading=>heading.text);
    if(first&&!current.blocks.length&&level===1){current.title=text;current.trail=[];}
    else{sections.push(current);current={id:sections.length,title:text,trail,blocks:[]};}
    stack.push({level,text});first=false;
  }
  sections.push(current);return sections;
}

function inlineChunks(content:RichNode[],limit=200):RichNode[][]{
  const result:RichNode[][]=[];let current:RichNode[]=[],length=0;
  const flush=()=>{if(current.length)result.push(current);current=[];length=0;};
  for(const node of content){
    if(node.type!=='text'){if(length>=limit)flush();current.push(node);length+=node.type==='hardBreak'?35:24;continue;}
    let remaining=Array.from(node.text??'');
    while(remaining.length){
      if(length>=limit)flush();const available=Math.max(1,limit-length);let end=Math.min(available,remaining.length);
      if(end<remaining.length){const slice=remaining.slice(0,end).join(''),match=[...slice.matchAll(/[。！？；.!?;\s]/g)].at(-1);if(match&&match.index!>=end*.55)end=Array.from(slice.slice(0,match.index!+1)).length;}
      current.push({...node,text:remaining.slice(0,end).join('')});length+=end;remaining=remaining.slice(end);
    }
  }
  flush();return result.length?result:[[]];
}
export function presentationParts(blocks:RichNode[]):PresentationPart[]{
  return blocks.flatMap((node,source):PresentationPart[]=>{
    if(node.type==='horizontalRule')return [{source,kind:'break',node}];
    if(node.type==='paragraph')return inlineChunks(node.content??[]).map(content=>({source,kind:'inline',node:{...node,content}}));
    if(node.type==='codeBlock'&&String(node.attrs?.language??'').toLowerCase()!=='mermaid'){
      const value=Array.from(node.content?.map(child=>child.text??'').join('')??'');const result:PresentationPart[]=[];
      for(let start=0;start<value.length;){let end=Math.min(value.length,start+420),lines=0;for(let at=start;at<end;at++)if(value[at]==='\n'&&++lines===8){end=at+1;break;}
        result.push({source,kind:'code',node:{...node,content:[{type:'text',text:value.slice(start,end).join('')}]}});start=end;}
      return result.length?result:[{source,kind:'atomic',node}];
    }
    if((node.type==='bulletList'||node.type==='orderedList')&&node.content?.length)return node.content.map((item,index)=>({source,kind:'list',node:{...node,attrs:node.type==='orderedList'?{...node.attrs,start:Number(node.attrs?.start??1)+index}:node.attrs,content:[item]}}));
    if(node.type==='table'&&node.content&&node.content.length>1&&node.content[0].content?.every(cell=>cell.type==='tableHeader')&&node.content.every(row=>row.content?.every(cell=>Number(cell.attrs?.rowspan??1)===1)))return node.content.slice(1).map(row=>({source,kind:'table',node:{...node,content:[node.content![0],row]}}));
    return [{source,kind:'atomic',node,keepNext:node.type==='heading'}];
  });
}
export function mergePresentationParts(parts:PresentationPart[]):RichNode{
  const content:RichNode[]=[];let previous:PresentationPart|undefined;
  for(const part of parts){
    if(part.kind==='break')continue;
    if(previous?.source===part.source&&previous.kind===part.kind&&part.kind!=='atomic'){
      const last=content.at(-1)!;
      if(part.kind==='code')last.content=[{type:'text',text:(last.content?.map(node=>node.text??'').join('')??'')+(part.node.content?.map(node=>node.text??'').join('')??'')}];
      else last.content=[...(last.content??[]),...(part.kind==='table'?part.node.content?.slice(1)??[]:part.node.content??[])];
    }else content.push({...part.node,...(part.node.content?{content:[...part.node.content]}:{})});
    previous=part;
  }
  return {type:'doc',content};
}

export async function paginatePresentation(sections:PresentationSection[],measure:(body:RichNode)=>Promise<number>,signal?:AbortSignal,onProgress?:(pages:number)=>void):Promise<PresentationPage[]>{
  const pages:PresentationPage[]=[];
  const add=(section:PresentationSection,parts:PresentationPart[],continuation:number,oversize=false)=>{pages.push({section:section.id,title:section.title,trail:section.trail,continuation,body:mergePresentationParts(parts),oversize});onProgress?.(pages.length);};
  for(const section of sections){
    signal?.throwIfAborted();const parts=presentationParts(section.blocks);let start=0,continuation=0;
    if(!parts.some(part=>part.kind!=='break')){add(section,[],0);continue;}
    while(start<parts.length){
      signal?.throwIfAborted();if(parts[start].kind==='break'){start++;continue;}
      let end=parts.findIndex((part,index)=>index>=start&&part.kind==='break');if(end<0)end=parts.length;
      let low=start+1,high=end,best=start;
      while(low<=high){const middle=Math.floor((low+high)/2);const height=await measure(mergePresentationParts(parts.slice(start,middle)));signal?.throwIfAborted();if(height<=slideSize.bodyHeight){best=middle;low=middle+1;}else high=middle-1;}
      while(best>start&&best<end&&parts[best-1].keepNext)best--;
      if(best===start){best=start+1;while(best<end&&parts[best-1].keepNext)best++;add(section,parts.slice(start,best),continuation++,true);}
      else add(section,parts.slice(start,best),continuation++);
      start=best;
    }
  }
  return pages;
}
