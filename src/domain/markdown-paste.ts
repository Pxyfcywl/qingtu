import {marked,type Token,type Tokens} from 'marked';
import type {RichNode} from './types';
import {convertMathContent} from './math-text';
const text=(value:string):RichNode[]=>value?[{type:'text',text:value}]:[];
function inline(tokens:Token[]):RichNode[]{
  return tokens.flatMap(token=>{
    switch(token.type){
      case 'strong':case 'em':case 'del':case 'link':{
        const item=token as Tokens.Strong|Tokens.Link;
        const mark={type:token.type==='strong'?'bold':token.type==='em'?'italic':token.type==='del'?'strike':'link',...(token.type==='link'?{attrs:{href:(token as Tokens.Link).href}}:{})};
        return inline(item.tokens??[]).map(node=>({...node,marks:[...(node.marks??[]),mark]}));
      }
      case 'codespan':return [{type:'text',text:(token as Tokens.Codespan).text,marks:[{type:'code'}]}];
      case 'br':return [{type:'hardBreak'}];
      default:return text('text' in token?String(token.text):token.raw);
    }
  });
}
function blocks(tokens:Token[]):RichNode[]{
  return tokens.flatMap((token):RichNode[]=>{
    switch(token.type){
      case 'space':return [];
      case 'code':{const code=token as Tokens.Code;return [{type:'codeBlock',attrs:{language:code.lang?.split(/\s/)[0]??null},content:text(code.text)}];}
      case 'heading':{const h=token as Tokens.Heading;return [{type:'heading',attrs:{level:h.depth},content:inline(h.tokens)}];}
      case 'paragraph':case 'text':{const p=token as Tokens.Paragraph;return [{type:'paragraph',content:p.tokens?inline(p.tokens):text(p.text)}];}
      case 'list':{const list=token as Tokens.List;return [{type:list.ordered?'orderedList':'bulletList',...(list.ordered?{attrs:{start:list.start||1}}:{}),content:list.items.map(item=>({type:'listItem',content:blocks(item.tokens)}))}];}
      case 'blockquote':return [{type:'blockquote',content:blocks((token as Tokens.Blockquote).tokens)}];
      case 'hr':return [{type:'horizontalRule'}];
      case 'table':{
        const table=token as Tokens.Table;
        const row=(cells:Tokens.TableCell[],header:boolean):RichNode=>({type:'tableRow',content:cells.map((cell,i)=>({type:header?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null,align:table.align[i]??null},content:[{type:'paragraph',content:inline(cell.tokens)}]}))});
        return [{type:'table',content:[row(table.header,true),...table.rows.map(cells=>row(cells,false))]}];
      }
      default:return [{type:'paragraph',content:text(token.raw)}];
    }
  });
}
export function markdownPaste(value:string):RichNode[]|null{
  const source=value.replace(/\r\n?/g,'\n');
  // Plain paragraphs and standalone formulas continue through the existing paste path.
  const tokens=marked.lexer(source,{gfm:true});
  if(!tokens.some(token=>['code','table','heading','list','blockquote','hr'].includes(token.type)))return null;
  return convertMathContent(blocks(tokens));
}
export function tabularPaste(value:string):RichNode[]|null{
  const rows=value.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(row=>row.split('\t'));
  if(rows.length<2||rows[0].length<2||!rows.every(row=>row.length===rows[0].length))return null;
  return [{type:'table',content:rows.map(row=>({type:'tableRow',content:row.map(cell=>({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:'paragraph',content:text(cell)}]}))}))}];
}
