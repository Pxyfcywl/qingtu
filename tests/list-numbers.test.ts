import {it,expect} from 'vitest';
import {orderedListNumbers,orderedStart} from '../src/domain/list-numbers';
import type {RichNode} from '../src/domain/types';
const paragraph:RichNode={type:'paragraph'},item=(...content:RichNode[]):RichNode=>({type:'listItem',content:[paragraph,...content]}),list=(...content:RichNode[]):RichNode=>({type:'orderedList',content});
it('三级列表按父项编号生成，序号随真实层级和同级条目变化',()=>{
 const body={type:'doc',content:[list(item(list(item(list(item(),item())),item())),item())]};
 expect(Object.values(orderedListNumbers(body))).toEqual(['1.','1.1','1.1.1','1.1.2','1.2','2.']);
});
it('保留非默认起始编号，分开的有序列表从各自起点编号',()=>{
 const first={...list(item(list(item())),item()),attrs:{start:3}},second={...list(item()),attrs:{start:8}};
 expect(Object.values(orderedListNumbers({type:'doc',content:[first,paragraph,second]}))).toEqual(['3.','3.1','4.','8.']);
 expect(orderedStart(0)).toBe(0);expect(orderedStart(-2)).toBe(-2);expect(orderedStart('3')).toBe(1);expect(orderedStart(Number.NaN)).toBe(1);
});
it('无序列表自身不产生编号，计算不会改写保存的正文',()=>{
 const body={type:'doc',content:[{type:'bulletList',content:[item(list(item()))]},list(item())]},before=structuredClone(body);
 expect(Object.values(orderedListNumbers(body))).toEqual(['1.','1.']);expect(body).toEqual(before);
});
