import {Marked,type Token,type Tokens} from 'marked';
import type {RichNode} from './types';
import {validateBody} from './body';

type ExtendedToken=Token&{node?:RichNode;columns?:Token[][];ratio?:string};
const plain=(value:string):RichNode[]=>value?[{type:'text',text:value}]:[];
const empty=():RichNode=>({type:'paragraph'});
function inlines(tokens:Token[]):RichNode[]{
  return tokens.flatMap(token=>{
    if((token as ExtendedToken).node)return [(token as ExtendedToken).node!];
    switch(token.type){
      case 'strong':case 'em':case 'del':case 'link':{
        const t=token as Tokens.Strong|Tokens.Link,link=token as Tokens.Link;
        const mark={type:({strong:'bold',em:'italic',del:'strike',link:'link'} as Record<string,string>)[token.type],...(token.type==='link'?{attrs:{href:link.href,...(link.title?{title:link.title}:{})}}:{})};
        return inlines(t.tokens).map(node=>({...node,marks:[...(node.marks??[]),mark]}));
      }
      case 'codespan':return [{type:'text',text:(token as Tokens.Codespan).text,marks:[{type:'code'}]}];
      case 'br':return [{type:'hardBreak'}];
      case 'image':return plain(token.raw);
      default:return plain('text' in token?String(token.text):token.raw);
    }
  });
}
function blocks(tokens:Token[]):RichNode[]{
  return tokens.flatMap((token):RichNode[]=>{
    if((token as ExtendedToken).columns)return [{type:'columns',attrs:{ratio:(token as ExtendedToken).ratio},content:(token as ExtendedToken).columns!.map(tokens=>{const content=blocks(tokens);return {type:'column',content:content.length?content:[empty()]};})}];
    if((token as ExtendedToken).node)return [(token as ExtendedToken).node!];
    switch(token.type){
      case 'space':return [];
      case 'code':{
        const t=token as Tokens.Code;
        if(t.lang==='qingtu-node-json'){
          let node:RichNode;try{node=JSON.parse(t.text);}catch{throw Error('保留内容块的 JSON 尚未完整，请补全后再保存');}
          if(!node||typeof node!=='object'||node.type==='doc'||node.type==='text')throw Error('保留内容块无效');
          return [node];
        }
        return [{type:'codeBlock',attrs:{language:t.lang?.split(/\s/)[0]??null},content:plain(t.text)}];
      }
      case 'heading':{const t=token as Tokens.Heading;return [{type:'heading',attrs:{level:t.depth},content:inlines(t.tokens)}];}
      case 'paragraph':case 'text':{const t=token as Tokens.Paragraph;return [{type:'paragraph',content:t.tokens?inlines(t.tokens):plain(t.text)}];}
      case 'blockquote':return [{type:'blockquote',content:blocks((token as Tokens.Blockquote).tokens)}];
      case 'list':{const t=token as Tokens.List;return [{type:t.ordered?'orderedList':'bulletList',...(t.ordered?{attrs:{start:t.start||1}}:{}),content:t.items.map(item=>({type:'listItem',content:blocks(item.tokens).length?blocks(item.tokens):[empty()]}))}];}
      case 'hr':return [{type:'horizontalRule'}];
      case 'table':{
        const t=token as Tokens.Table;
        const row=(cells:Tokens.TableCell[],header:boolean):RichNode=>({type:'tableRow',content:cells.map((cell,index)=>({type:header?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null,align:t.align[index]??null},content:[{type:'paragraph',content:inlines(cell.tokens)}]}))});
        return [{type:'table',content:[row(t.header,true),...t.rows.map(cells=>row(cells,false))]}];
      }
      default:return [{type:'paragraph',content:plain(token.raw)}];
    }
  });
}
const parser=new Marked({gfm:true,extensions:[
  {name:'qingtuColumns',level:'block',start:source=>source.indexOf(':::columns'),tokenizer(source){
    if(!source.startsWith(':::columns'))return;
    const header=/^:::columns (1:1|3:2)\n/.exec(source);
    if(!header)throw Error('双栏开头应为 :::columns 1:1 或 :::columns 3:2');
    const lines=source.slice(header[0].length).split('\n'),parts:string[][]=[];let fence='',length=header[0].length;
    for(const line of lines){
      length+=line.length+1;
      const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence='';}
      if(!fence&&line===':::'){
        if(parts.length!==2)throw Error('双栏需要两个 :::column 段落');
        // Keep child tokens on the same lexer. Inline queues are resolved after
        // block tokenization; starting another lexer here would orphan the tail.
        const columns=parts.map(part=>this.lexer.blockTokens(part.join('\n')));
        return {type:'qingtuColumns',raw:source.slice(0,Math.min(length,source.length)),ratio:header[1],columns};
      }
      if(!fence&&line===':::column'){parts.push([]);continue;}
      if(!fence&&line.startsWith(':::columns'))throw Error('双栏不支持嵌套');
      if(parts.length)parts[parts.length-1].push(line);else if(line.trim())throw Error('双栏内请先写 :::column');
    }
    throw Error('双栏尚未结束，请在末尾补上单独一行 :::');
  }},
  {name:'qingtuMathBlock',level:'block',start:source=>source.indexOf('$$'),tokenizer(source){
    const match=/^\$\$\n([\s\S]*?)\n\$\$(?:\n|$)/.exec(source);
    if(match)return {type:'qingtuMathBlock',raw:match[0],node:{type:'mathBlock',attrs:{latex:match[1]}}};
  }},
  {name:'qingtuMathInline',level:'inline',start:source=>source.indexOf('$'),tokenizer(source){
    const match=/^\$([^$\n]+)\$/.exec(source);
    if(match)return {type:'qingtuMathInline',raw:match[0],node:{type:'mathInline',attrs:{latex:match[1]}}};
  }},
]});
export function parseMarkdownDocument(source:string):RichNode{
  if(source.length>150000)throw Error('正文较长，请拆分为多个节点');
  const content=blocks(parser.lexer(source.replace(/\r\n?/g,'\n'))),body={type:'doc',content:content.length?content:[empty()]};
  validateBody(body);return body;
}

const escape=(text:string)=>text.replace(/([\\`*_[\]<>~$#!|])/g,'\\$1').replace(/^(\s*\d+)([.)]) /gm,'$1\\$2 ').replace(/^(\s*)([-+>]) /gm,'$1\\$2 ').replace(/^(:{3})/gm,'\\$1');
const ticks=(text:string,min=1)=>'`'.repeat(Math.max(min,...Array.from(text.matchAll(/`+/g),match=>match[0].length+1)));
function preserved(node:RichNode){const value=JSON.stringify(node,null,2),fence=ticks(value,3);return `${fence}qingtu-node-json\n${value}\n${fence}`;}
function inline(node:RichNode):string{
  if(node.type==='hardBreak')return '  \n';
  if(node.type==='mathInline')return `$${node.attrs?.latex??''}$`;
  let value=escape(node.text??'');
  for(const mark of [...(node.marks??[])].reverse()){
    if(mark.type==='code'){const text=node.text??'',fence=ticks(text);value=fence+(/^`|`$|^ .* $/.test(text)?' '+text+' ':text)+fence;}
    else if(mark.type==='bold')value=`**${value}**`;
    else if(mark.type==='italic')value=`*${value}*`;
    else if(mark.type==='strike')value=`~~${value}~~`;
    else if(mark.type==='link')value=`[${value}](<${String(mark.attrs?.href??'').replace(/>/g,'%3E')}>)`;
  }
  return value;
}
const children=(node:RichNode)=>node.content?.map(inline).join('')??'';
const sequence=(nodes:RichNode[])=>nodes.map(serializeSafely).join('\n\n');
function complexInline(node:RichNode):boolean{
  if(node.type==='mathInline'&&(node.marks?.length||/\$|\n/.test(String(node.attrs?.latex))))return true;
  if(node.type==='text'&&node.marks?.some(mark=>!['bold','italic','strike','code','link'].includes(mark.type)||mark.type==='link'&&mark.attrs?.title))return true;
  if(node.type==='text'&&node.marks?.length&&(/^\s|\s$/.test(node.text??'')||node.marks.length>1&&node.marks.some(mark=>mark.type==='code')))return true;
  return node.content?.some(complexInline)??false;
}
function serialize(node:RichNode):string{
  if(complexInline(node))return preserved(node);
  switch(node.type){
    case 'paragraph':return children(node)||preserved(node);
    case 'heading':return '#'.repeat(Math.max(1,Math.min(6,Number(node.attrs?.level??1))))+' '+children(node);
    case 'horizontalRule':return '---';
    case 'codeBlock':{const value=node.content?.map(child=>child.text??'').join('')??'',fence=ticks(value,3),lang=String(node.attrs?.language??'');return lang==='qingtu-node-json'?preserved(node):`${fence}${lang}\n${value}\n${fence}`;}
    case 'mathBlock':return String(node.attrs?.latex??'').includes('$$')?preserved(node):`$$\n${node.attrs?.latex??''}\n$$`;
    case 'blockquote':return sequence(node.content??[]).split('\n').map(line=>'> '+line).join('\n');
    case 'bulletList':case 'orderedList':return (node.content??[]).map((item,index)=>{const marker=node.type==='orderedList'?`${Number(node.attrs?.start??1)+index}. `:'- ',body=sequence(item.content??[]);return marker+body.split('\n').join('\n'+' '.repeat(marker.length));}).join('\n');
    case 'columns':return `:::columns ${node.attrs?.ratio??'1:1'}\n:::column\n${sequence(node.content?.[0].content??[])}\n:::column\n${sequence(node.content?.[1].content??[])}\n:::`;
    case 'table':{
      const rows=node.content??[],cells=rows.flatMap(row=>row.content??[]);
      if(!rows.length||rows.some(row=>row.content?.length!==rows[0].content?.length)||rows[0].content?.some(cell=>cell.type!=='tableHeader')||rows.slice(1).some(row=>row.content?.some(cell=>cell.type!=='tableCell'))||cells.some(cell=>Number(cell.attrs?.colspan??1)!==1||Number(cell.attrs?.rowspan??1)!==1||cell.attrs?.colwidth||cell.content?.length!==1||cell.content[0].type!=='paragraph'||children(cell.content[0]).includes('\n')))return preserved(node);
      const row=(value:RichNode)=>'| '+value.content!.map(cell=>children(cell.content![0])).join(' | ')+' |';
      return [row(rows[0]),'| '+rows[0].content!.map(cell=>cell.attrs?.align==='center'?':---:':cell.attrs?.align==='right'?'---:':cell.attrs?.align==='left'?':---':'---').join(' | ')+' |',...rows.slice(1).map(row)].join('\n');
    }
    default:return preserved(node);
  }
}
const defaults:Record<string,Record<string,unknown>>={heading:{level:1},orderedList:{start:1,type:null},codeBlock:{language:null},tableCell:{colspan:1,rowspan:1,colwidth:null,align:null},tableHeader:{colspan:1,rowspan:1,colwidth:null,align:null},link:{target:'_blank',rel:'noopener noreferrer nofollow',class:null,title:null}};
function ordered(value:unknown):unknown{if(Array.isArray(value))return value.map(ordered);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)]));return value;}
function canonical(node:RichNode):RichNode{
  const attrs=Object.fromEntries(Object.entries(node.attrs??{}).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(defaults[node.type]?.[key])));
  const content:RichNode[]=[];
  for(const child of node.content??[]){const next=canonical(child),previous=content.at(-1);if(next.type==='text'&&previous?.type==='text'&&JSON.stringify(next.marks)===JSON.stringify(previous.marks))previous.text=(previous.text??'')+(next.text??'');else content.push(next);}
  return {type:node.type,...(node.text!==undefined?{text:node.text}:{}),...(Object.keys(attrs).length?{attrs:ordered(attrs) as Record<string,unknown>}:{}),...(node.marks?.length?{marks:node.marks.map(mark=>canonical(mark)).sort((a,b)=>a.type.localeCompare(b.type))}:{}),...(content.length?{content}:{})};
}
function serializeSafely(node:RichNode):string{
  const source=serialize(node);
  // Prefer readable Markdown, but never silently discard custom attributes or
  // ambiguous adjacent marks when a user edits another part of the source.
  try{const parsed=parseMarkdownDocument(source);if(parsed.content?.length===1&&JSON.stringify(canonical(node))===JSON.stringify(canonical(parsed.content[0])))return source;}catch{/* Retain the original node below. */}
  return preserved(node);
}
export function serializeMarkdownDocument(body:RichNode):string{validateBody(body);if(body.content?.length===1&&body.content[0].type==='paragraph'&&!body.content[0].content?.length)return '';return sequence(body.content??[]);}
