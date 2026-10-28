import {describe,it,expect} from 'vitest';
import {parseMarkdownDocument as parse,serializeMarkdownDocument as serialize} from '../src/domain/markdown-document';
import type {RichNode} from '../src/domain/types';
const paragraph=(text:string):RichNode=>({type:'paragraph',content:[{type:'text',text}]});
const doc=(content:RichNode[]):RichNode=>({type:'doc',content});
const find=(node:RichNode,type:string):RichNode[]=>[...(node.type===type?[node]:[]),...(node.content??[]).flatMap(child=>find(child,type))];
describe('Markdown 全页编辑双向转换',()=>{
 it('普通 Markdown 标题、嵌套列表、链接、代码、表格与公式均可编辑',()=>{
  const source='# 学习方法\n\n**重点** 与 *解释* 和 [资料](https://example.com)\n\n1. 外层\n   - 内层\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n| 名称 | 数值 |\n| :--- | ---: |\n| A | `x` |\n\n行内 $x_1^2$\n\n$$\n\\frac{x}{y}\n$$';
  const body=parse(source),next=parse(serialize(body));
  expect(find(next,'heading')[0].attrs?.level).toBe(1);expect(find(next,'orderedList')).toHaveLength(1);expect(find(next,'bulletList')).toHaveLength(1);
  expect(find(next,'codeBlock')[0].content?.[0].text).toContain('A --> B');expect(find(next,'table')).toHaveLength(1);expect(find(next,'mathInline')[0].attrs?.latex).toBe('x_1^2');expect(find(next,'mathBlock')[0].attrs?.latex).toBe('\\frac{x}{y}');
 });
 it('双栏保留两侧内容、比例、公式与围栏内的分隔符',()=>{
  const body=parse('开头\n\n:::columns 3:2\n:::column\n## 左侧\n\n```text\n:::column\n:::\n```\n:::column\n右侧 $a_b$\n:::\n\n结尾');
  const columns=find(body,'columns')[0];expect(columns.attrs?.ratio).toBe('3:2');expect(columns.content).toHaveLength(2);
  const next=parse(serialize(body));expect(find(next,'columns')[0].attrs?.ratio).toBe('3:2');expect(find(next,'codeBlock')[0].content?.[0].text).toBe(':::column\n:::');expect(find(next,'mathInline')[0].attrs?.latex).toBe('a_b');expect(find(body,'text').map(node=>node.text).join('')).toContain('结尾');expect(find(next,'text').map(node=>node.text).join('')).toContain('结尾');
 });
 it('图片、视频、复杂合并表格不会在编辑其它文字后消失',()=>{
  const media:RichNode[]=[{type:'assetImage',attrs:{assetId:'image-id',alt:'图片说明'}},{type:'video',attrs:{assetId:'video-id',alt:'视频说明'}},{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:2,rowspan:1,colwidth:[120,200]},content:[paragraph('合并单元格')]}]}]}];
  const source=serialize(doc([paragraph('原文'),...media]));expect(source).toContain('qingtu-node-json');const next=parse(source.replace('原文','新文字'));expect(next.content?.slice(1)).toEqual(media);
 });
 it('普通文字中的 Markdown 符号、反引号、美元与转义保留为文字',()=>{
  const value='**原样** $literal$ [链接] #标题 & <tag> \\path\n- 原样列表\n1. 原样编号';
  const next=parse(serialize(doc([paragraph(value)])));expect(find(next,'text').map(node=>node.text).join('')).toBe(value);expect(find(next,'mathInline')).toHaveLength(0);expect(find(next,'bulletList')).toHaveLength(0);
 });
 it('未完成的扩展结构阻止提交，空文档可以正常清空',()=>{
  expect(()=>parse(':::columns 3:2\n:::column\n左边')).toThrow('尚未结束');
  expect(()=>parse(':::columns 2:1\n')).toThrow('双栏开头');
  expect(()=>parse('```qingtu-node-json\n{\n```')).toThrow('JSON');
  expect(()=>parse('```qingtu-node-json\n{"type":"script"}\n```')).toThrow('正文结构');
  expect(parse('').content?.[0].type).toBe('paragraph');expect(serialize(doc([{type:'paragraph'}]))).toBe('');
 });
 it('相邻加粗与代码保留原文字，围栏内美元不被解析',()=>{
  const next=parse(serialize(doc([{type:'paragraph',content:[{type:'text',text:' a ',marks:[{type:'bold'}]},{type:'text',text:'` code `',marks:[{type:'code'}]}]},{type:'codeBlock',attrs:{language:'text'},content:[{type:'text',text:'```\n$x$'}]}])));
  expect(find(next,'text').map(node=>node.text).join('')).toBe(' a ` code ````\n$x$');expect(find(next,'mathInline')).toHaveLength(0);
 });
});
