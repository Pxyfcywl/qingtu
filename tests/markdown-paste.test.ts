import {it,expect} from 'vitest';
import {markdownPaste,tabularPaste} from '../src/domain/markdown-paste';
import {validateBody} from '../src/domain/body';
it('保留围栏代码语言、缩进和公式原文，转换相邻表格与单元格样式',()=>{
 const nodes=markdownPaste('```python\ndef add(x):\n    return "$literal$"\n```\n\n| 名称 | 结果 |\n| :--- | ---: |\n| **样例** | `$code$` |')!;
 expect(nodes[0]).toEqual({type:'codeBlock',attrs:{language:'python'},content:[{type:'text',text:'def add(x):\n    return "$literal$"'}]});
 expect(nodes[1].type).toBe('table');expect(nodes[1].content?.[0].content?.[1].attrs?.align).toBe('right');expect(nodes[1].content?.[1].content?.[0].content?.[0].content?.[0].marks?.[0].type).toBe('bold');expect(()=>validateBody({type:'doc',content:nodes})).not.toThrow();
});
it('纯文本与独立公式不抢占原有粘贴，TSV 表格保留空单元格',()=>{
 expect(markdownPaste('普通文字 $x$')).toBeNull();expect(markdownPaste('$$\nx^2\n$$')).toBeNull();
 const table=tabularPaste('A\tB\n1\t\n');expect(table?.[0].content?.[1].content?.[1].content?.[0].content).toEqual([]);expect(()=>validateBody({type:'doc',content:table!})).not.toThrow();expect(tabularPaste('A\tB\n1')).toBeNull();
});
it('无效合并跨度和表格结构被拒绝',()=>{
 const table=tabularPaste('A\tB\n1\t2')!;table[0].content![0].content![0].attrs!.colspan=100000;expect(()=>validateBody({type:'doc',content:table})).toThrow('合并范围');
 expect(()=>validateBody({type:'doc',content:[{type:'table',content:[{type:'paragraph'}]}]})).toThrow('表格行');
});
