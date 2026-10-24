import {describe,it,expect} from 'vitest';
import {planKindChange} from '../src/domain/conversion';
import {blankBody,type MindNode} from '../src/domain/types';
const base:MindNode={id:'node',kind:'text',title:'勾股定理',parentId:'root',childIds:['child'],body:blankBody(),contentCollapsed:false,childrenCollapsed:true,side:'left',position:{x:42,y:57},color:'orange'};
describe('节点类型转换的内容保护',()=>{
 it('无损文字转卡片保留标题、关系、折叠、位置，原节点不变',()=>{
  const before=structuredClone(base),plan=planKindChange(base,'card');expect(plan.affected).toEqual([]);expect(plan.node).toEqual({...base,kind:'card'});expect(base).toEqual(before);
 });
 it('图片转卡片保存原始素材引用和说明',()=>{
  const source={...base,kind:'image' as const,assetId:'image-sha',altText:'直角三角形'},plan=planKindChange(source,'card');expect(plan.affected).toEqual([]);
  expect(plan.node.body.content).toEqual([{type:'assetImage',attrs:{assetId:'image-sha',alt:'直角三角形'}},{type:'paragraph',content:[{type:'text',text:'直角三角形'}]}]);expect(plan.node.assetId).toBeUndefined();expect(source.assetId).toBe('image-sha');
 });
 it('视频转文字与异类媒体都报告将移除的源，文字保留说明',()=>{
  const source={...base,kind:'video' as const,assetId:'video-sha',altText:'演示视频'};
  const text=planKindChange(source,'text'),image=planKindChange(source,'image');expect(text.affected).toEqual(['视频媒体']);expect(text.node.title).toBe('勾股定理\n演示视频');expect(image.affected).toEqual(['视频媒体']);expect(image.node.assetId).toBeUndefined();expect(source.assetId).toBe('video-sha');
 });
 it('正文中的公式、分隔线、空表格和代码框不会被当作空正文静默移除',()=>{
  for(const content of [[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}}],[{type:'horizontalRule'}],[{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph'}]}]}]}],[{type:'codeBlock'}]]){
   const source={...base,kind:'card' as const,body:{type:'doc',content}};expect(planKindChange(source,'text').affected).toEqual(['正文']);
  }
 });
 it('只含一个图片的卡片可无损转纯图片，混合文字则需要确认',()=>{
  const image={type:'assetImage',attrs:{assetId:'image-sha',alt:'三角形'}},source={...base,kind:'card' as const,body:{type:'doc',content:[image]}};
  const plan=planKindChange(source,'image');expect(plan.affected).toEqual([]);expect(plan.node.assetId).toBe('image-sha');expect(plan.node.altText).toBe('三角形');
  expect(planKindChange({...source,body:{type:'doc',content:[image,{type:'paragraph',content:[{type:'text',text:'说明'}]}]}},'image').affected).toEqual(['正文']);
 });
});
