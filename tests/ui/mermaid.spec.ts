import {test,expect,type Page} from './legacy-fixture';

const flow='flowchart LR\n  A[提出想法] --> B{技术可行？}\n  B --> C[制作下一版]';
async function edit(page:Page){
  await page.goto('/');
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
  await card.getByRole('button',{name:'编辑卡片正文'}).click();
  const area=page.locator('[contenteditable=true]');await expect(area).toBeVisible();
  await area.evaluate(el=>(el as any).editor.commands.setContent({type:'doc',content:[{type:'paragraph'}]}));
  return {card,area};
}
async function paste(page:Page,text:string){
  await page.locator('[contenteditable=true]').evaluate((el,text)=>{
    const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);
    el.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
  },text);
}
test('Mermaid 围栏粘贴、实时预览、源码保存重载及放大',async({page})=>{
  const {card,area}=await edit(page);
  await paste(page,'```mermaid\n'+flow+'\n```');
  await expect(area.locator('pre code')).toHaveText(flow);
  await expect(area.locator('.diagram-surface svg')).toHaveCount(1);
  await expect(area.locator('.diagram-surface')).toContainText('技术可行');
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await expect(card.locator('.diagram-surface svg')).toHaveCount(1);
  await page.keyboard.press('Control+s');await page.reload();
  await expect(card.locator('.diagram-surface svg')).toHaveCount(1);
  await card.getByRole('button',{name:'放大图表'}).click();
  const dialog=page.getByRole('dialog',{name:'Mermaid 图表预览'});
  await expect(dialog.locator('svg.pele')).toHaveCount(1);await expect(dialog).toContainText('提出想法');
  const svg=dialog.locator('svg.pele'),before=await svg.getAttribute('viewBox');
  await dialog.locator('.diagram-viewer-stage').hover();await page.mouse.wheel(0,-300);
  await expect(svg).not.toHaveAttribute('viewBox',before!);
  const zoomed=await svg.getAttribute('viewBox');
  await page.mouse.move(650,350);await page.mouse.down();await page.mouse.move(750,410,{steps:5});await page.mouse.up();
  await expect(svg).not.toHaveAttribute('viewBox',zoomed!);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await card.locator('summary').click();await expect(card.locator('pre code')).toHaveText(flow);
  await card.getByRole('button',{name:'编辑卡片正文'}).click();await expect(area.locator('pre code')).toHaveText(flow);
});
test('现有代码块可切换 Mermaid 与普通语言，源码及撤销保留',async({page})=>{
  const {area}=await edit(page);
  await area.locator('p').click();await page.getByRole('button',{name:'代码块',exact:true}).click();
  await page.getByRole('combobox',{name:'代码语言'}).selectOption('mermaid');
  await page.keyboard.insertText(flow);await expect(area.locator('.diagram-surface svg')).toHaveCount(1);
  await page.getByRole('combobox',{name:'代码语言'}).selectOption('javascript');
  await expect(area.locator('.diagram-editor-preview')).toBeHidden();await expect(area.locator('pre code')).toHaveText(flow);
  await page.waitForTimeout(850);
  await page.getByRole('combobox',{name:'代码语言'}).selectOption('mermaid');
  await expect(area.locator('.diagram-surface svg')).toHaveCount(1);
  await page.waitForTimeout(850);await page.keyboard.press('Control+z');
  await expect(area.locator('pre')).toHaveAttribute('data-language','javascript');
  await page.keyboard.press('Control+Shift+z');await expect(area.locator('.diagram-surface svg')).toHaveCount(1);
});
test('逐字输入 mermaid 围栏创建图表，语法错误修正后恢复',async({page})=>{
  const {area}=await edit(page);await area.locator('p').click();
  await area.pressSequentially('```mermaid');await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox',{name:'代码语言'})).toHaveValue('mermaid');
  await page.keyboard.insertText('flowchart LR\n A[未完成');
  await expect(area.locator('pre code')).toContainText('未完成');
  await page.keyboard.insertText('] --> B[完成]');await expect(area.locator('.diagram-surface svg')).toHaveCount(1);
  await expect(area.locator('.diagram-surface')).toContainText('完成');
});
test('混合多个图表及普通代码，SVG 标识唯一，导出状态隐藏控件',async({page})=>{
  const {card,area}=await edit(page);
  await paste(page,'```mermaid\n'+flow+'\n```\n\n```python\nprint("Hello")\n```\n\n```mermaid\npie title 时间分配\n "学习" : 60\n "休息" : 40\n```');
  await expect(area.locator('.diagram-surface svg')).toHaveCount(2);
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await expect(card.locator('.diagram-surface svg')).toHaveCount(2);
  await expect(card.locator('pre[data-language=python] .hljs-string')).toHaveText('"Hello"');
  const ids=await card.locator('.diagram-surface svg [id]').evaluateAll(nodes=>nodes.map(n=>n.id));expect(new Set(ids).size).toBe(ids.length);
  await page.locator('.react-flow__viewport').evaluate(el=>el.classList.add('exporting'));
  await expect(card.locator('.diagram-tools').first()).toBeHidden();await expect(card.locator('.diagram-source').first()).toBeHidden();
  await expect(card.locator('.diagram-surface svg').first()).toBeVisible();
  const serialized=await card.locator('.diagram-surface svg').first().evaluate(async el=>{
    const {cloneNode}=await import('/src/vendor/html-to-image/clone-node.js' as string);
    return (await cloneNode(el,{},true)).getAttribute('style');
  });
  expect(serialized).toContain('--pele-surface: #f1f8f5');expect(serialized).toContain('--pele-series-1: #42a892');
});
