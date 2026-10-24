import {useMemo} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function Formula({latex,inline=false}:{latex:string;inline?:boolean}) {
  // The module stays lazy. Once loaded, remounting a culled node commits the
  // complete formula immediately rather than measuring temporary plain text.
  const html=useMemo(()=>katex.renderToString(latex,{displayMode:!inline,throwOnError:false,trust:false,maxExpand:500,maxSize:20,strict:'warn'}),[latex,inline]);
  return <span className={inline?'math-inline':'math-block'}><span dangerouslySetInnerHTML={{__html:html}}/></span>;
}
