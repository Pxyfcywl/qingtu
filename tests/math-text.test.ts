import {it,expect} from 'vitest';
import {mathTokens,plainMathContent,convertMathContent} from '../src/domain/math-text';

it('识别混合文本中的行内、独立及多行公式并保留 LaTeX 反斜杠',()=>{
  const nodes=plainMathContent('前文 $a^2$ 后文\n$$\n\\frac{x}{y} + z\n$$\n结束 \\(b\\) 和 \\[c\\]');
  expect(nodes.filter(n=>n.type==='mathBlock').map(n=>n.attrs?.latex)).toEqual(['\\frac{x}{y} + z','c']);
  expect(JSON.stringify(nodes)).toContain('mathInline');expect(JSON.stringify(nodes)).toContain('结束');
});
it('不转换代码、转义美元符号和未闭合公式',()=>{
  for(const text of ['`$x$`','```tex\n$$x$$\n```','\\$x$','$$x','价格 $ 5 和 $ 10'])expect(mathTokens(text)).toEqual([{type:'text',text}]);
});
it('粘贴 HTML 保留列表和文字格式，代码不转换',()=>{
  const result=convertMathContent([{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'结果 $x$。',marks:[{type:'bold'}]}]}]}]},{type:'codeBlock',content:[{type:'text',text:'$$x$$'}]}]);
  expect(result[0].content![0].content![0].content![1]).toEqual({type:'mathInline',attrs:{latex:'x'},marks:[{type:'bold'}]});
  expect(result[1].content![0].text).toBe('$$x$$');
});
