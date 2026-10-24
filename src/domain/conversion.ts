import {blankBody,type MindNode,type NodeKind,type RichNode} from './types';

export const kindLabels:Record<NodeKind,string>={text:'文字',card:'内容卡片',image:'图片',video:'视频'};
function hasContent(node:RichNode):boolean{
 return !!node.text?.length||!!node.attrs?.assetId||!!node.attrs?.latex||['horizontalRule','table','codeBlock'].includes(node.type)||!!node.content?.some(hasContent);
}
export function planKindChange(source:MindNode,kind:NodeKind):{node:MindNode;affected:string[]}{
 if(source.kind===kind)return {node:source,affected:[]};
 const node=structuredClone(source),affected:string[]=[];node.kind=kind;
 const bodyHasContent=hasContent(source.body);
 if(kind==='card'){
  if(source.assetId&&(source.kind==='image'||source.kind==='video')){
   const media:RichNode={type:source.kind==='image'?'assetImage':'video',attrs:{assetId:source.assetId,...(source.kind==='image'?{alt:source.altText??source.title}:{})}};
   node.body={type:'doc',content:[...(bodyHasContent?node.body.content??[]:[]),media]};
   if(source.altText)node.body.content!.push({type:'paragraph',content:[{type:'text',text:source.altText}]});
  }else{
   if(source.assetId)affected.push('现有媒体');
   if(source.altText)node.body={type:'doc',content:[...(bodyHasContent?node.body.content??[]:[]),{type:'paragraph',content:[{type:'text',text:source.altText}]}]};
  }
  delete node.assetId;delete node.altText;
 }else if(kind==='text'){
  if(bodyHasContent)affected.push('正文');
  if(source.assetId)affected.push(source.kind==='video'?'视频媒体':'图片媒体');
  if(source.altText&&source.altText!==source.title)node.title=[source.title,source.altText].filter(Boolean).join('\n');
  node.body=blankBody();delete node.assetId;delete node.altText;
 }else{
  const blocks=source.body.content?.filter(hasContent)??[];
  const media=blocks.length===1&&blocks[0].type===(kind==='image'?'assetImage':'video')?blocks[0]:undefined;
  if(bodyHasContent&&!media)affected.push('正文');
  if(source.assetId&&source.assetId!==media?.attrs?.assetId)affected.push(source.kind==='video'?'视频媒体':'图片媒体');
  const assetId=media?.attrs?.assetId;
  if(typeof assetId==='string')node.assetId=assetId;else delete node.assetId;
  node.altText=typeof media?.attrs?.alt==='string'?media.attrs.alt:source.altText??source.title;
  node.body=blankBody();
 }
 return {node,affected};
}
