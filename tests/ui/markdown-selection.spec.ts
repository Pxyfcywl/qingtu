import {test,expect,type Page} from './legacy-fixture';

const firstCode='const first = 1;\nconsole.log(first);';
const secondCode='print("second")';
const content=[
  {type:'paragraph',content:[{type:'text',text:'代码前的正文'}]},
  {type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text:firstCode}]},
  {type:'paragraph',content:[{type:'text',text:'代码之间的正文'}]},
  {type:'codeBlock',attrs:{language:'python'},content:[{type:'text',text:secondCode}]},
  {type:'paragraph',content:[{type:'text',text:'代码后的正文'}]},
];
async function open(page:Page){
  await page.goto('/');
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
  await card.getByLabel('编辑卡片正文').click();
  const area=card.locator('[contenteditable=true]');
  await expect(area).toBeVisible();
  await area.evaluate((el,content)=>(el as any).editor.commands.setContent({type:'doc',content}),content);
  return {card,area};
}
const selected=(page:Page)=>page.evaluate(()=>window.getSelection()?.toString());

test('编辑时根据鼠标选择指定代码块，包含高亮文字和空白边缘，输入只替换当前代码',async({page})=>{
  const {area}=await open(page);
  await area.locator('p').first().click();
  await area.locator('pre').first().locator('.hljs-keyword').first().hover();
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe(firstCode);
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe(firstCode);
  await page.keyboard.insertText('replacement');
  await expect(area.locator('pre').first()).toHaveText('replacement');
  await expect(area.locator('pre').nth(1)).toHaveText(secondCode);
  await expect(area.locator('p').first()).toHaveText('代码前的正文');
  await area.locator('pre').nth(1).hover({position:{x:3,y:3}});
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe(secondCode);
  await expect(area).toBeFocused();
});

test('编辑时鼠标在正文就全选当前 MD，即使光标留在代码中',async({page})=>{
  const {area}=await open(page);
  await area.locator('pre').first().click();
  await area.locator('p').first().hover();
  await page.keyboard.press('Alt+a');
  const selection=await area.evaluate(el=>{
    const {doc,selection}=(el as any).editor.state;
    return {from:selection.from,to:selection.to,size:doc.content.size};
  });
  expect(selection).toEqual({from:0,to:selection.size,size:selection.size});
  expect(await selected(page)).toContain(firstCode);
  expect(await selected(page)).toContain(secondCode);
  expect(await selected(page)).toContain('代码后的正文');
});

test('阅读时只选择鼠标所在代码块或整篇正文，不包含卡片标题和编辑按钮',async({page})=>{
  const {card}=await open(page);
  await page.getByLabel('完成编辑',{exact:true}).click();
  const body=card.locator('.rich-doc');
  await expect(body.locator('pre[data-content-loading]')).toHaveCount(0);
  await body.locator('pre').nth(1).hover({position:{x:3,y:3}});
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe(secondCode);
  await body.locator('pre').first().locator('.hljs-keyword').first().hover();
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe(firstCode);
  await body.locator('p').first().hover();
  await page.keyboard.press('Alt+a');
  const text=await selected(page);
  for(const value of ['代码前的正文',firstCode,'代码之间的正文',secondCode,'代码后的正文'])expect(text).toContain(value);
  expect(text).not.toContain('勾股定理');
  expect(text).not.toContain('双击编辑');
  await expect(card.locator('[contenteditable=true]')).toHaveCount(0);
});

test('鼠标移到背景、标题、正文外选项后不改变选区，即使正文仍有焦点',async({page})=>{
  const {card,area}=await open(page);
  await area.locator('pre').first().hover();
  await page.keyboard.press('Alt+a');
  for(const target of [page.locator('.react-flow__pane'),card.locator('.card-header'),page.getByLabel('完成编辑',{exact:true}),page.getByRole('button',{name:'设置',exact:true})]){
    await target.hover({position:{x:3,y:3}});
    await page.keyboard.press('Alt+a');
    expect(await selected(page)).toBe(firstCode);
    await expect(area).toBeFocused();
  }
  // Forget the last in-window position when the pointer leaves the window.
  await area.locator('p').first().hover();
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerout',{relatedTarget:null})));
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe(firstCode);
});

test('空代码块可全选并输入，鼠标停在原地时弹出设置也不选中背后正文',async({page})=>{
  const {area}=await open(page);
  await area.evaluate(el=>(el as any).editor.commands.setContent({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'保留正文'}]},{type:'codeBlock'}]}));
  await area.locator('pre').hover({position:{x:3,y:3}});
  await page.keyboard.press('Alt+a');
  await page.keyboard.insertText('new code');
  await expect(area.locator('pre')).toHaveText('new code');
  await expect(area.locator('p').first()).toHaveText('保留正文');
  await area.locator('pre').hover();
  await page.keyboard.press('Alt+a');
  await area.locator('p').first().hover();
  await page.getByRole('button',{name:'设置',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  await page.keyboard.press('Alt+a');
  expect(await selected(page)).toBe('new code');
});
