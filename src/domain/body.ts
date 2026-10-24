import type { RichNode } from './types';
const allowed=new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','blockquote','codeBlock','hardBreak','horizontalRule','columns','column','mathBlock','mathInline','assetImage','video','table','tableRow','tableCell','tableHeader']);
export function validateBody(root:RichNode) {
  let blocks=0,characters=0;
  const walk=(node:RichNode,depth:number,insideColumns:boolean)=>{
    if(depth>24||!allowed.has(node.type))throw new Error('正文结构无效或层级过深');
    if(node.type!=='text')blocks++;
    characters+=(node.text??'').length+String(node.attrs?.latex??'').length;
    if(blocks>200||characters>20000)throw new Error('正文超过 200 个块或 20000 字符，请拆分卡片');
    if(node.type==='columns') {
      if(insideColumns)throw new Error('双栏不支持嵌套');
      if(node.content?.length!==2||node.content.some(n=>n.type!=='column'))throw new Error('双栏必须包含两栏');
      if(!['1:1','3:2'].includes(String(node.attrs?.ratio)))throw new Error('双栏比例无效');
    }
    if(node.type==='table'&&(!node.content?.length||node.content.some(row=>row.type!=='tableRow')))throw new Error('表格行结构无效');
    if(node.type==='tableRow'&&(!node.content?.length||node.content.some(cell=>!['tableCell','tableHeader'].includes(cell.type))))throw new Error('表格单元格结构无效');
    if(node.type==='tableCell'||node.type==='tableHeader'){
      for(const attr of ['rowspan','colspan']){const value=node.attrs?.[attr]??1;if(!Number.isInteger(value)||Number(value)<1||Number(value)>100)throw new Error('表格合并范围无效');}
      if(!node.content?.length||node.content.some(child=>['text','tableRow','tableCell','tableHeader'].includes(child.type)))throw new Error('表格单元格内容无效');
    }
    for(const child of node.content??[])walk(child,depth+1,insideColumns||node.type==='columns');
  };
  if(root.type!=='doc')throw new Error('正文根节点无效');
  walk(root,0,false);
}
