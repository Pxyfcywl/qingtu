import {it,expect} from 'vitest';
import {validateBody} from '../src/domain/body';
import {demoDocument} from '../src/seed';
it('真实双栏示例保持有效，拒绝嵌套和未知块',()=>{
  const doc=demoDocument();const body=Object.values(doc.nodes).find(n=>n.title==='勾股定理')!.body;
  expect(()=>validateBody(body)).not.toThrow();
  const nested=structuredClone(body);nested.content![0].content![0].content=[structuredClone(body.content![0])];
  expect(()=>validateBody(nested)).toThrow('嵌套');
  expect(()=>validateBody({type:'doc',content:[{type:'script'}]})).toThrow();
});
it('过大正文被拒绝而非截断',()=>{
  expect(()=>validateBody({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'字'.repeat(20001)}]}]})).toThrow('20000');
});
