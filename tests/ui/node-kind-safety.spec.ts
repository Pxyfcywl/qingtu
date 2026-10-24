import {test,expect} from './legacy-fixture';

for(const [kind,next] of [['image','text'],['video','image']] as const){
 test(`${kind} 节点已有媒体时，类型变化必须先解释受影响的内容`,async({page})=>{
  await page.goto('/');await expect(page.locator('.startup')).toHaveCount(0);
  const node=page.locator('.node-'+kind).first();await expect(node).toBeVisible();
  const id=await node.getAttribute('data-node-id');
  const before=await page.evaluate(async id=>{
   const state:typeof import('../../src/state')=await import('/src/state.ts' as string);
   return state.getState().doc!.nodes[id!];
  },id);expect(before.assetId).toBeTruthy();
  await node.click({position:{x:12,y:12}});if(kind==='image')await page.getByLabel('关闭图片预览').click();await page.getByRole('button',{name:'节点属性',exact:true}).click();
  await page.getByLabel('节点类型').selectOption(next);
  const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText(/图片媒体|视频媒体/);await expect(dialog.getByRole('button',{name:'保留原类型'})).toBeFocused();
  await dialog.getByRole('button',{name:'保留原类型'}).click();
  await expect(page.getByLabel('节点类型')).toHaveValue(kind);
  const after=await page.evaluate(async id=>{
   const state:typeof import('../../src/state')=await import('/src/state.ts' as string);
   return state.getState().doc!.nodes[id!];
  },id);expect(after).toEqual(before);
  await page.getByLabel('节点类型').selectOption(next);await dialog.getByRole('button',{name:'确认转换'}).click();
  await expect(page.getByLabel('节点类型')).toHaveValue(next);
  await page.getByRole('button',{name:'撤销 Ctrl+Z',exact:true}).click();
  await expect(page.getByLabel('节点类型')).toHaveValue(kind);
  const restored=await page.evaluate(async id=>{const state:typeof import('../../src/state')=await import('/src/state.ts' as string);return state.getState().doc!.nodes[id!];},id);expect(restored).toEqual(before);
 });
}

test('文字可无损转为卡片，已有正文的卡片转为文字时给出解释',async({page})=>{
 await page.goto('/');await expect(page.locator('.startup')).toHaveCount(0);const node=page.locator('.node-text').filter({has:page.getByText('基础概念',{exact:true})});await expect(node).toBeVisible();
 const id=await node.getAttribute('data-node-id'),title=await node.locator('.node-label').innerText();
 await node.click();await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByLabel('节点类型').selectOption('card');
 await expect(page.locator(`[data-node-id="${id}"] .card-header .node-label`)).toHaveText(title);
 const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await card.locator('.card-header').click();
 await page.getByLabel('节点类型').selectOption('text');await expect(page.getByRole('alertdialog')).toContainText('正文');
 await page.getByRole('button',{name:'保留原类型'}).click();await expect(page.getByLabel('节点类型')).toHaveValue('card');
});

test('纯图片转为卡片时无损嵌入媒体，根节点转卡片只出现一个标题',async({page})=>{
 await page.goto('/');await expect(page.locator('.startup')).toHaveCount(0);const image=page.locator('.node-image').first(),id=await image.getAttribute('data-node-id');
 await image.click({position:{x:12,y:12}});await page.getByLabel('关闭图片预览').click();await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByLabel('节点类型').selectOption('card');
 await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.locator(`[data-node-id="${id}"] .card-body img`)).toBeVisible();
 await page.locator('.root-node .node-label').click();await page.getByLabel('节点类型').selectOption('card');await expect(page.locator('.root-node .node-label')).toHaveCount(1);
});
