import {codeTree} from '../domain/code-highlight';
import type {RootContent} from 'hast';
import DiagramBlock from './DiagramBlock';
import {isMermaid} from './diagram-runtime';
function token(node:RootContent,index:number):React.ReactNode{
  if(node.type==='text')return node.value;
  if(node.type==='element')return <span key={index} className={Array.isArray(node.properties.className)?node.properties.className.join(' '):undefined}>{node.children.map(token)}</span>;
  return null;
}
export default function CodeBlock({code,language}:{code:string;language?:string}){
  if(isMermaid(language))return <DiagramBlock code={code}/>;
  const tree=codeTree(code,language);
  return <pre data-language={language||tree.data?.language||undefined}><code className={`hljs ${language?'language-'+language:''}`}>{tree.children.map(token)}</code></pre>;
}
