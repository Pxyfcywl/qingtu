import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page){
  await page.goto('/');await expect(page.locator('.library-home')).toBeVisible();
  return page.evaluate(async()=>{
    const state=await import('/src/state.ts' as string),tree=await import('/src/domain/tree.ts' as string);
    const doc=tree.newDocument('边缘连线测试'),a=tree.addChild(doc,doc.rootId,'text'),b=tree.addChild(doc,doc.rootId,'text'),c=tree.addChild(doc,a,'text');
    doc.layoutMode='free';doc.revision=1;doc.viewport={x:80,y:180,zoom:1};
    doc.nodes[a].title='父 A';doc.nodes[a].position={x:300,y:0};doc.nodes[b].title='父 B';doc.nodes[b].position={x:300,y:230};doc.nodes[c].title='子 C';doc.nodes[c].position={x:650,y:0};
    await state.activateDocument(doc,true);await state.refreshLibrary();return {a,b,c,root:doc.rootId};
  });
}
test('新资料库进入首页，仅提供导图创建入口，空列表不自动生成示例',async({page})=>{
  await page.goto('/');await expect(page.locator('.library-home')).toBeVisible();await expect(page.locator('.mind-node')).toHaveCount(0);await expect(page.locator('.create-map-card')).toHaveCount(1);await expect(page.locator('.library-empty')).toBeVisible();
  await page.screenshot({path:'test-results/0.1.12-首页.png'});
  await page.getByRole('button',{name:/创建新的思维导图/}).click();await expect(page.locator('.root-node')).toBeVisible();await expect(page.locator('.document-tab')).toHaveCount(1);
});
test('文件夹归类、搜索、多个标签和重启保留，关闭标签不删除文件',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.getByRole('textbox',{name:'文件夹名称'}).fill('读论文');await page.getByRole('button',{name:'创建文件夹',exact:true}).click();
  await page.getByRole('button',{name:/创建新的思维导图/}).click();await page.locator('.root-node .node-label').dblclick();await page.getByRole('textbox',{name:'节点标题'}).fill('论文 A');
  await page.getByRole('button',{name:'新建思维导图',exact:true}).click();await page.locator('.root-node .node-label').dblclick();await page.getByRole('textbox',{name:'节点标题'}).fill('导图 B');
  await page.getByRole('button',{name:'切换到 论文 A',exact:true}).click();await expect(page.locator('.root-node')).toContainText('论文 A');await expect(page.locator('.document-tab')).toHaveCount(2);
  await page.getByRole('button',{name:'首页',exact:true}).click();await expect(page.locator('.library-table-row')).toHaveCount(2);await page.getByRole('button',{name:/读论文/}).click();await expect(page.locator('.library-table-row')).toHaveCount(1);await expect(page.locator('.library-open-map')).toContainText('论文 A');
  await page.getByRole('button',{name:/最近使用/}).click();await page.getByLabel('移动 导图 B 到文件夹').selectOption({label:'读论文'});await page.getByLabel('搜索思维导图').fill('论文');await expect(page.locator('.library-table-row')).toHaveCount(1);
  await page.reload();await expect(page.locator('.library-home')).toBeVisible();await expect(page.locator('.document-tab')).toHaveCount(2);await page.getByRole('button',{name:/读论文/}).click();await expect(page.locator('.library-table-row')).toHaveCount(2);
  await page.screenshot({path:'test-results/0.1.12-文件夹与标签.png'});
  await page.getByRole('button',{name:'切换到 论文 A',exact:true}).click();await page.getByRole('button',{name:'关闭标签 论文 A',exact:true}).click();await expect(page.locator('.root-node')).toContainText('导图 B');await page.reload();await expect(page.locator('.document-tab')).toHaveCount(1);await expect(page.locator('.library-table-row')).toHaveCount(2);
  await page.getByRole('button',{name:'关闭标签 导图 B',exact:true}).click();await expect(page.locator('.library-home')).toBeVisible();await expect(page.locator('.document-tab')).toHaveCount(0);
});
test('右上圆点从父连接子，根节点可发起，支持撤销、取消和循环保护',async({page})=>{
  const {a,b,c}=await fixture(page);await page.locator(`[data-node-id="${b}"] .node-label`).click();await page.getByRole('button',{name:'连接到子节点',exact:true}).click();await page.locator(`[data-node-id="${c}"] .node-label`).click();await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
  await page.keyboard.press('Control+z');await expect(page.locator('.additional-parent-edge')).toHaveCount(0);await page.keyboard.press('Control+Shift+z');await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
  await page.locator(`[data-node-id="${c}"] .node-label`).click();await page.keyboard.press('Control+Shift+l');await page.locator(`[data-node-id="${a}"] .node-label`).click();await expect(page.getByRole('alert')).toContainText('循环');
  await page.locator('.root-node .node-label').click();await page.getByRole('button',{name:'连接到子节点',exact:true}).click();await expect(page.locator('.parent-connect-preview')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.parent-connect-preview')).toHaveCount(0);
  await page.locator(`[data-node-id="${c}"] .node-label`).click();await page.keyboard.press('Control+Shift+m');await page.locator(`[data-node-id="${b}"] .node-label`).click();
  await expect(page.locator(`.react-flow__edge[data-id="${b}:${c}"]`)).toHaveCount(1);await expect(page.locator(`.react-flow__edge[data-id="${a}:${c}"]`)).toHaveCount(0);
});
test('按住连线靠近右边缘自动平移，找到屏幕外子节点并连接，取消后停止',async({page})=>{
  const {b,c}=await fixture(page);await page.evaluate(async id=>{const s=await import('/src/state.ts' as string);s.editDocument((d:any)=>{d.nodes[id].position={x:1750,y:230};});},c);
  await page.locator(`[data-node-id="${b}"] .node-label`).click();const start=await page.getByRole('button',{name:'连接到子节点',exact:true}).boundingBox(),pane=await page.locator('.react-flow').boundingBox();
  await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);await page.mouse.down();await page.mouse.move(pane!.x+pane!.width-10,pane!.y+pane!.height/2,{steps:10});
  await expect(page.locator(`[data-node-id="${c}"]`)).toBeVisible({timeout:6000});const target=await page.locator(`[data-node-id="${c}"] .node-label`).boundingBox();await page.mouse.move(target!.x+target!.width/2,target!.y+target!.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('.additional-parent-edge')).toHaveCount(1);await expect(page.locator('.parent-connect-preview')).toHaveCount(0);
  const transform=await page.locator('.react-flow__viewport').getAttribute('style');await page.waitForTimeout(250);expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(transform);
  await page.keyboard.press('Control+s');await page.reload();await page.getByRole('button',{name:'切换到 边缘连线测试',exact:true}).click();await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
});
test('向上拖线经过工具栏、标签栏及窗口上沿持续平移，回到画布可连接并停止',async({page})=>{
  const {b,c}=await fixture(page);
  await page.evaluate(async id=>{const s=await import('/src/state.ts' as string);s.editDocument((d:any)=>{d.nodes[id].position={x:300,y:-950};});},c);
  await page.locator(`[data-node-id="${b}"] .node-label`).click();await page.getByRole('button',{name:'节点属性',exact:true}).click();
  const start=await page.getByRole('button',{name:'连接到子节点',exact:true}).boundingBox(),pane=await page.locator('.react-flow').boundingBox();
  const x=pane!.x+pane!.width/2;
  const viewY=()=>page.evaluate(async()=>{const s=await import('/src/state.ts' as string);return s.getState().doc.viewport.y;});
  await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);await page.mouse.down();await expect(page.locator('.parent-connect-preview')).toBeVisible();
  await page.evaluate(()=>{const shell=document.querySelector('.app-shell')!;if(shell.hasPointerCapture(1))shell.releasePointerCapture(1);});
  await expect(page.locator('.parent-connect-preview')).toBeVisible();
  for(const y of [pane!.y+5,75,20,-10]){
    await page.mouse.move(x,y,{steps:5});const before=await viewY();await expect.poll(viewY).toBeGreaterThan(before+45);await expect(page.locator('.parent-connect-preview')).toBeVisible();
  }
  await expect.poll(async()=>{const box=await page.locator(`[data-node-id="${c}"]`).boundingBox();return box?.y??-10000;},{timeout:4000}).toBeGreaterThan(pane!.y+140);
  // Move away from the edge before taking target coordinates.
  await page.mouse.move(x,pane!.y+pane!.height/2,{steps:5});const stopped=await viewY();await page.waitForTimeout(150);expect(await viewY()).toBeCloseTo(stopped,0);
  await expect(page.locator(`[data-node-id="${c}"]`)).toBeVisible({timeout:4000});const target=await page.locator(`[data-node-id="${c}"] .node-label`).boundingBox();
  await page.mouse.move(target!.x+target!.width/2,target!.y+target!.height/2,{steps:5});await page.mouse.up();await expect(page.locator('.additional-parent-edge')).toHaveCount(1);await expect(page.locator('.parent-connect-preview')).toHaveCount(0);
  const final=await viewY();await page.waitForTimeout(150);expect(await viewY()).toBeCloseTo(final,0);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('点击选点模式在顶部栏继续平移，Esc、右键和失焦均停止',async({page})=>{
  const {b}=await fixture(page);await page.locator(`[data-node-id="${b}"] .node-label`).click();
  const viewY=()=>page.evaluate(async()=>{const s=await import('/src/state.ts' as string);return s.getState().doc.viewport.y;});
  for(const cancel of ['escape','contextmenu','blur']){
    await page.keyboard.press('Control+Shift+l');await expect(page.locator('.parent-connect-preview')).toBeVisible();await page.mouse.move(700,55);const before=await viewY();await expect.poll(viewY).toBeGreaterThan(before+30);
    if(cancel==='escape')await page.keyboard.press('Escape');else if(cancel==='contextmenu')await page.mouse.click(700,55,{button:'right'});else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await expect(page.locator('.parent-connect-preview')).toHaveCount(0);const after=await viewY();await page.waitForTimeout(150);expect(await viewY()).toBeCloseTo(after,0);
  }
});
