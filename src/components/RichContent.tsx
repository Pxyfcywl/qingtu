import { lazy,memo,Suspense,type ReactNode } from 'react';
import { ImageAsset,VideoAsset } from './Media';
import type { RichNode } from '../domain/types';
import {orderedListNumbers,orderedStart} from '../domain/list-numbers';

const TypesetFormula=lazy(()=>import('./Formula'));
const CodeBlock=lazy(()=>import('./CodeBlock'));
export function Formula({latex,inline=false}:{latex:string;inline?:boolean}) {
  return <Suspense fallback={<span className={inline?'math-inline':'math-block'}>{latex}</span>}><TypesetFormula latex={latex} inline={inline}/></Suspense>;
}
function safeLink(href: string) {try{const url=new URL(href);return ['http:','https:','mailto:'].includes(url.protocol)?href:undefined;}catch{return undefined;}}
function render(node: RichNode,key: string,numbers:Record<string,string>): ReactNode {
  const children=node.content?.map((x,i)=>render(x,key+'.'+i,numbers));
  switch(node.type) {
    case 'doc':return <div key={key} className="rich-doc">{children}</div>;
    case 'text': {
      let text:ReactNode=node.text??'';
      for(const mark of node.marks??[]) {
        if(mark.type==='bold')text=<strong>{text}</strong>;
        if(mark.type==='italic')text=<em>{text}</em>;
        if(mark.type==='strike')text=<s>{text}</s>;
        if(mark.type==='code')text=<code>{text}</code>;
        if(mark.type==='link') {const href=safeLink(String(mark.attrs?.href??''));text=href?<a href={href} onClick={event=>{event.preventDefault();void import('@tauri-apps/plugin-opener').then(m=>m.openUrl(href));}}>{text}</a>:text;}
      }
      return <span key={key}>{text}</span>;
    }
    case 'paragraph':return <p key={key}>{children??<br/>}</p>;
    case 'heading':{const Tag=(`h${Math.max(1,Math.min(6,Number(node.attrs?.level??1)))}`) as 'h1'|'h2'|'h3'|'h4'|'h5'|'h6';return <Tag key={key}>{children}</Tag>;}
    case 'bulletList':return <ul key={key}>{children}</ul>;
    case 'orderedList':return <ol key={key} start={orderedStart(node.attrs?.start)}>{children}</ol>;
    case 'listItem':return <li key={key} data-list-number={numbers[key]}>{children}</li>;
    case 'blockquote':return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock':{const code=node.content?.map(n=>n.text??'').join('')??'';return <Suspense key={key} fallback={<pre data-content-loading="true"><code>{code}</code></pre>}><CodeBlock code={code} language={typeof node.attrs?.language==='string'?node.attrs.language:undefined}/></Suspense>;}
    case 'table':return <div key={key} className="tableWrapper nodrag nowheel"><table><tbody>{children}</tbody></table></div>;
    case 'tableRow':return <tr key={key}>{children}</tr>;
    case 'tableCell':case 'tableHeader':{const Tag=node.type==='tableHeader'?'th':'td';const align=node.attrs?.align;return <Tag key={key} colSpan={Number(node.attrs?.colspan??1)} rowSpan={Number(node.attrs?.rowspan??1)} style={{textAlign:['left','center','right'].includes(String(align))?align as 'left'|'center'|'right':undefined}}>{children}</Tag>;}
    case 'hardBreak':return <br key={key}/>;
    case 'horizontalRule':return <hr key={key}/>;
    case 'columns':return <div key={key} className="rich-columns" data-ratio={String(node.attrs?.ratio??'1:1')}>{children}</div>;
    case 'column':return <div key={key} className="rich-column">{children}</div>;
    case 'mathBlock':case 'mathInline':return <Formula key={key} latex={String(node.attrs?.latex??'')} inline={node.type==='mathInline'}/>;
    case 'assetImage':return <ImageAsset key={key} id={String(node.attrs?.assetId??'')} alt={String(node.attrs?.alt??'')}/>;
    case 'video':return <VideoAsset key={key} id={String(node.attrs?.assetId??'')}/>;
    default:return <span key={key}>{children}</span>;
  }
}
export const RichContent=memo(function RichContent({body}:{body:RichNode}) {return <>{render(body,'root',orderedListNumbers(body))}</>;});
