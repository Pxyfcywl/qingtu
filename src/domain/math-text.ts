import type {RichNode} from './types';

// Scan delimiters before splitting lines so display equations can contain newlines.
export function mathTokens(text:string):RichNode[] {
  const result:RichNode[]=[];let start=0,index=0;
  const escaped=(at:number)=>{let count=0;while(at>0&&text[--at]==='\\')count++;return count%2===1;};
  const plain=(end:number)=>{if(end>start)result.push({type:'text',text:text.slice(start,end)});};
  while(index<text.length){
    if(escaped(index)){index++;continue;}
    if(text[index]==='`'){
      const ticks=/^`+/.exec(text.slice(index))![0],end=text.indexOf(ticks,index+ticks.length);
      index=end<0?text.length:end+ticks.length;continue;
    }
    const open=['$$','\\[','\\(','$'].find(delimiter=>text.startsWith(delimiter,index));
    if(!open){index++;continue;}
    const close=open==='\\['?'\\]':open==='\\('?'\\)':open,block=open==='$$'||open==='\\[';
    // Single dollars must not consume part of an unmatched display delimiter.
    if(open==='$'&&(text[index-1]==='$'||text[index+1]==='$')){index++;continue;}
    let end=index+open.length;
    while((end=text.indexOf(close,end))>=0){
      if(!escaped(end)&&(close!=='$'||(text[end-1]!=='$'&&text[end+1]!=='$')))break;
      end+=close.length;
    }
    if(end<0){index+=open.length;continue;}
    const latex=text.slice(index+open.length,end);
    if(!latex.trim()||(!block&&(latex.includes('\n')||/^\s|\s$/.test(latex)))){index+=open.length;continue;}
    plain(index);result.push({type:block?'mathBlock':'mathInline',attrs:{latex:latex.trim()}});
    index=end+close.length;start=index;
  }
  plain(text.length);return result;
}

function splitBlocks(tokens:RichNode[],template:RichNode={type:'paragraph'}):RichNode[] {
  const blocks:RichNode[]=[];let inline:RichNode[]=[];
  const flush=(empty=false)=>{if(inline.length||empty)blocks.push({...template,content:inline});inline=[];};
  for(const token of tokens){
    if(token.type==='mathBlock'){flush();blocks.push(token);}
    else if(token.type==='text'&&token.text?.includes('\n')){
      const lines=token.text.split('\n');lines.forEach((text,i)=>{if(i)flush(true);if(text)inline.push({...token,text});});
    }else inline.push(token);
  }
  flush();return blocks.length?blocks:[{...template,content:[]}];
}

export function plainMathContent(text:string):RichNode[] {
  return splitBlocks(mathTokens(text.replace(/\r\n?/g,'\n')));
}

// Preserve existing marks, lists, code and custom nodes on rich HTML paste.
export function convertMathContent(nodes:RichNode[]):RichNode[] {
  return nodes.flatMap(node=>{
    if(node.type==='codeBlock'||node.type==='mathInline'||node.type==='mathBlock')return [node];
    if(node.type==='paragraph'||node.type==='heading'){
      const content=(node.content??[]).flatMap(child=>child.type==='text'&&!child.marks?.some(mark=>mark.type==='code')
        ?mathTokens(child.text??'').map(token=>({...token,marks:child.marks})): [child]);
      return splitBlocks(content,{...node,content:undefined});
    }
    return [{...node,...(node.content?{content:convertMathContent(node.content)}:{})}];
  });
}
