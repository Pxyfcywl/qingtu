import {describe,it,expect} from 'vitest';
import {mergePresentationParts,nodeText,paginatePresentation,presentationParts,presentationSections} from '../src/domain/presentation';
import type {RichNode} from '../src/domain/types';
const text=(value:string):RichNode=>({type:'paragraph',content:[{type:'text',text:value}]});
const heading=(value:string,level=2):RichNode=>({type:'heading',attrs:{level},content:[{type:'text',text:value}]});
const doc=(content:RichNode[]):RichNode=>({type:'doc',content});
describe('单卡片演示结构与分页',()=>{
 it('按标题层级建立上下文，深层标题保留在正文',()=>{
  const sections=presentationSections(doc([heading('项目',1),heading('任务一'),heading('需求确认',3),text('正文'),heading('任务二')]),'卡片');
  expect(sections.map(section=>section.title)).toEqual(['项目','任务一','任务二']);expect(sections[1].trail).toEqual(['项目']);expect(sections[1].blocks[0]).toEqual(heading('需求确认',3));
 });
 it('分段不丢 Unicode、空白、公式及行内标记，不修改原文',()=>{
  const node:RichNode={type:'paragraph',content:[{type:'text',text:'说明 😀 '.repeat(120),marks:[{type:'bold'}]},{type:'mathInline',attrs:{latex:'x_1'}},{type:'text',text:'\n结尾'}]};
  const encoded=JSON.stringify(node),parts=presentationParts([node]),merged=mergePresentationParts(parts);
  expect(parts.length).toBeGreaterThan(1);expect(nodeText(merged)).toBe(nodeText(node));expect(JSON.stringify(node)).toBe(encoded);expect(merged.content?.[0].content?.some(node=>node.type==='mathInline')).toBe(true);expect(merged.content?.[0].content?.[0].marks).toEqual([{type:'bold'}]);
 });
 it('列表编号延续、表格重复表头，合并仍保留原始顺序',()=>{
  const list:RichNode={type:'orderedList',attrs:{start:7},content:['甲','乙','丙'].map(value=>({type:'listItem',content:[text(value)]}))};
  const parts=presentationParts([list]);expect(parts[2].node.attrs?.start).toBe(9);expect(mergePresentationParts(parts).content?.[0]).toEqual(list);
  const row=(value:string,header=false):RichNode=>({type:'tableRow',content:[{type:header?'tableHeader':'tableCell',content:[text(value)]}]});
  const table:RichNode={type:'table',content:[row('列名',true),row('第一行'),row('第二行')]};
  const rows=presentationParts([table]);expect(rows).toHaveLength(2);expect(rows[1].node.content?.[0]).toEqual(table.content![0]);expect(mergePresentationParts(rows).content?.[0]).toEqual(table);
 });
 it('双栏和 Mermaid 保持完整，普通代码切分后原文不变',()=>{
  const columns:RichNode={type:'columns',attrs:{ratio:'3:2'},content:[{type:'column',content:[text('左侧')]},{type:'column',content:[text('右侧')]}]},code:RichNode={type:'codeBlock',attrs:{language:'text'},content:[{type:'text',text:Array.from({length:50},(_,i)=>'  line '+i).join('\n')}]};
  const mermaid:RichNode={...code,attrs:{language:'mermaid'}};
  expect(presentationParts([columns,mermaid])).toHaveLength(2);expect(presentationParts([code]).length).toBeGreaterThan(1);expect(nodeText(mergePresentationParts(presentationParts([code])))).toBe(nodeText(code));
 });
 it('测量高度后拆页并继承标题，手动分页不产生空页',async()=>{
  const sections=presentationSections(doc([heading('主题',1),heading('章节'),text('正文。'.repeat(600)),{type:'horizontalRule'},{type:'horizontalRule'},text('手动分页后')]),'卡片');
  const pages=await paginatePresentation(sections,async body=>Math.ceil(nodeText(body).length/80)*40);
  const chapter=pages.filter(page=>page.title==='章节');expect(chapter.length).toBeGreaterThan(2);expect(chapter[1].continuation).toBe(1);expect(chapter.every(page=>page.trail[0]==='主题')).toBe(true);expect(chapter.every(page=>!!nodeText(page.body))).toBe(true);expect(chapter.map(page=>nodeText(page.body)).join('')).toBe('正文。'.repeat(600)+'手动分页后');
 });
 it('超高完整块保留且可识别，子标题不会独自留在上一页',async()=>{
  const pages=await paginatePresentation([{id:0,title:'章节',trail:[],blocks:[text('开头'),heading('小节',3),{type:'columns',content:[]}]}],async body=>body.content?.some(node=>node.type==='columns')?900:(body.content?.length??0)*250);
  expect(pages).toHaveLength(2);expect(pages[1].oversize).toBe(true);expect(pages[1].body.content?.[0].type).toBe('heading');expect(pages[1].body.content?.[1].type).toBe('columns');
 });
 it('取消排版后停止，空正文仍能显示标题页',async()=>{
  const controller=new AbortController();controller.abort();await expect(paginatePresentation(presentationSections(doc([]),'空文档'),async()=>0,controller.signal)).rejects.toThrow();
  const pages=await paginatePresentation(presentationSections(doc([]),'空文档'),async()=>0);expect(pages).toHaveLength(1);expect(pages[0].title).toBe('空文档');
 });
});
