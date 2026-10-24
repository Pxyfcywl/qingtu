import {test,expect,type Page} from './legacy-fixture';

async function selected(page:Page){return page.evaluate(async()=>{const url='/src/state.ts';const {getState}=await import(url);const s=getState();return s.doc.nodes[s.selectedId];});}
async function setup(page:Page){
  await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();await page.locator('.root-node .node-label').click();
  await page.getByRole('button',{name:'节点属性',exact:true}).click();
  await page.getByRole('checkbox',{name:'优先新增：内容卡片（Markdown）',exact:true}).check();
  await expect(page.getByRole('checkbox',{name:'优先新增：内容卡片（Markdown）',exact:true})).toBeEnabled();
}
test('勾选默认 Markdown 卡片后 Tab 和 Enter 沿用该类型，旧节点保持原类型',async({page})=>{
  await setup(page);await expect(page.getByLabel('节点类型')).toHaveValue('text');
  await page.getByRole('button',{name:'关闭节点属性',exact:true}).click();await page.locator('.root-node .node-label').click();
  await page.keyboard.press('Tab');await expect(page.getByRole('textbox',{name:'节点标题',exact:true})).toBeVisible();
  const child=await selected(page);expect(child.kind).toBe('card');
  const input=page.getByRole('textbox',{name:'节点标题',exact:true});await input.fill('默认 MD 子节点');await input.press('Enter');await expect(input).toHaveCount(0);
  await page.keyboard.press('Enter');await expect(page.getByRole('textbox',{name:'节点标题',exact:true})).toBeVisible();
  const sibling=await selected(page);expect(sibling.kind).toBe('card');expect(sibling.parentId).toBe(child.parentId);expect(sibling.id).not.toBe(child.id);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('工具栏和节点旁的＋使用默认类型，显式类型按钮仍按指定类型新增',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'关闭节点属性',exact:true}).click();
  await page.getByRole('button',{name:'添加内容卡片节点 Tab',exact:true}).click();await expect(page.getByRole('textbox',{name:'节点标题',exact:true})).toBeVisible();expect((await selected(page)).kind).toBe('card');
  await page.getByRole('textbox',{name:'节点标题',exact:true}).press('Enter');
  await page.locator('.root-node .node-label').click();await page.locator('.root-node').getByRole('button',{name:'添加子节点',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'节点标题',exact:true})).toBeVisible();expect((await selected(page)).kind).toBe('card');
  await page.getByRole('textbox',{name:'节点标题',exact:true}).press('Enter');
  await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByRole('checkbox',{name:'优先新增：文字',exact:true}).check();await expect(page.getByRole('checkbox',{name:'优先新增：文字',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'关闭节点属性',exact:true}).click();
  await page.getByRole('button',{name:'添加内容卡片',exact:true}).click();await expect(page.getByRole('textbox',{name:'节点标题',exact:true})).toBeVisible();expect((await selected(page)).kind).toBe('card');
});
test('默认类型单选、跨重载保存，可在设置中取消并恢复文字默认',async({page})=>{
  await page.setViewportSize({width:1000,height:640});
  await setup(page);await expect(page.locator('.default-node-kind input:checked')).toHaveCount(1);
  await page.reload();await expect(page.locator('.root-node')).toBeVisible();await page.getByRole('button',{name:'设置',exact:true}).click();
  const bounds=await page.getByRole('dialog',{name:'设置',exact:true}).boundingBox();expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(640);
  const card=page.getByRole('checkbox',{name:'优先新增：内容卡片（Markdown）',exact:true});await expect(card).toBeChecked();
  const image=page.getByRole('checkbox',{name:'优先新增：图片',exact:true});await image.check();await expect(image).toBeEnabled();await expect(card).not.toBeChecked();await expect(page.locator('.default-node-kind input:checked')).toHaveCount(1);
  await image.uncheck();await expect(image).toBeEnabled();await expect(page.locator('.default-node-kind input:checked')).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'添加文字节点 Tab',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'添加文字节点 Tab',exact:true}).click();await expect(page.getByRole('textbox',{name:'节点标题',exact:true})).toBeVisible();expect((await selected(page)).kind).toBe('text');
});
