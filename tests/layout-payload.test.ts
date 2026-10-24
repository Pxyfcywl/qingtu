import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {layoutPrepared,prepareLayout,estimateSize,estimateRenderSize} from '../src/domain/layout';
import {visibleNodes} from '../src/domain/tree';
import type {MindDocument} from '../src/domain/types';
const baseline=JSON.parse(readFileSync('validation/layout-baselines/before-compact-worker.json','utf8'));
const fixed=(name:string):MindDocument=>JSON.parse(readFileSync(`validation/fixtures/0.1.1/documents/${name}.json`,'utf8'));
describe('布局任务只传递可见结构和尺寸',()=>{
 it('长卡片首次渲染边界包含段落间距，布局估算保持稳定',()=>{
  const card={...Object.values(fixed('S').nodes).find(node=>node.kind==='card')!,contentCollapsed:false,
   body:{type:'doc',content:Array.from({length:60},()=>({type:'paragraph',content:[{type:'text',text:'短段落'}]}))}};
  expect(estimateSize(card).height).toBe(1590);
  expect(estimateRenderSize(card).height).toBe(2130);
 });
 it('与原算法在 S、M、L 及全展开图的 10 组坐标完全一致',()=>{
  for(const reference of baseline.cases){const doc=fixed(reference.name);expect(layoutPrepared(prepareLayout(doc,reference.measured)),reference.name).toEqual(reference.positions);}
 });
 it('隐藏后代和多媒体正文不进入任务，M/L 消息小于原图的四分之一',()=>{
  for(const name of ['M','L']){const doc=fixed(name),prepared=prepareLayout(doc);expect(Object.keys(prepared.nodes)).toEqual(visibleNodes(doc).map(n=>n.id));const message=JSON.stringify(prepared);expect(message.length).toBeLessThan(JSON.stringify(doc).length/4);expect(message).not.toContain('assetId');expect(message).not.toContain('latex');}
 });
});
