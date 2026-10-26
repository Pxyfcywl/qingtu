import {test,expect,type Page} from './legacy-fixture';

const source='flowchart LR\n A[提出想法] --> B[完成交付]';
async function openViewer(page:Page,editing=false,code=source){
  await page.goto('/');
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
  await card.getByRole('button',{name:'编辑卡片正文'}).click();
  const area=page.locator('[contenteditable=true]');await expect(area).toBeVisible();
  await area.evaluate((el,code)=>(el as any).editor.commands.setContent({type:'doc',content:[{type:'codeBlock',attrs:{language:'mermaid'},content:[{type:'text',text:code}]}]}),code);
  await expect(area.locator('.diagram-surface svg.pele')).toHaveCount(1);
  if(!editing)await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await card.getByRole('button',{name:'放大图表',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Mermaid 图表预览'});
  await expect(dialog.locator('svg.pele')).toHaveCount(1);
  return {dialog,card,area};
}
async function drag(page:Page,x:number,y:number,dx:number,dy:number){
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();
}

test('打开图表后无需先滚轮缩放，即可从图形或空白处按像素拖动',async({page})=>{
  const {dialog}=await openViewer(page);
  const node=dialog.locator('svg.pele [data-id="A"]');await expect(node).toBeVisible();
  const before=(await node.boundingBox())!;
  await drag(page,before.x+before.width/2,before.y+before.height/2,120,70);
  const after=(await node.boundingBox())!;
  expect(after.x-before.x).toBeCloseTo(120,0);expect(after.y-before.y).toBeCloseTo(70,0);
  const stage=(await dialog.locator('.diagram-viewer-stage').boundingBox())!;
  await drag(page,stage.x+40,stage.y+stage.height-100,-80,-50);
  const blank=(await node.boundingBox())!;
  expect(blank.x-after.x).toBeCloseTo(-80,0);expect(blank.y-after.y).toBeCloseTo(-50,0);
  await page.mouse.move(stage.x+200,stage.y+stage.height-100);
  expect((await node.boundingBox())!.x).toBeCloseTo(blank.x,0);
});

test('缩放以鼠标为中心，反复拖动后可适应窗口，关闭重开恢复初始视图',async({page})=>{
  const {dialog,card}=await openViewer(page);
  const svg=dialog.locator('svg.pele'),node=svg.locator('[data-id="A"]');
  const initial=(await svg.boundingBox())!,before=(await node.boundingBox())!;
  const point={x:before.x+before.width/2,y:before.y+before.height/2};
  await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-250);
  await expect.poll(async()=>(await svg.boundingBox())!.width).toBeGreaterThan(initial.width);
  const anchor=(await node.boundingBox())!;
  expect(anchor.x+anchor.width/2).toBeCloseTo(point.x,0);expect(anchor.y+anchor.height/2).toBeCloseTo(point.y,0);
  for(let i=0;i<4;i++){
    const start=(await svg.boundingBox())!;
    await drag(page,400,400,90,45);
    const end=(await svg.boundingBox())!;
    expect(end.x-start.x).toBeCloseTo(90,0);expect(end.y-start.y).toBeCloseTo(45,0);
  }
  await dialog.getByRole('button',{name:'适应图表窗口'}).click();
  const fitted=(await svg.boundingBox())!;
  expect(fitted.x).toBeCloseTo(initial.x,0);expect(fitted.y).toBeCloseTo(initial.y,0);expect(fitted.width).toBeCloseTo(initial.width,0);
  await dialog.getByRole('button',{name:'放大图表',exact:true}).click();
  await expect.poll(async()=>(await svg.boundingBox())!.width).toBeGreaterThan(fitted.width);
  await dialog.getByRole('button',{name:'缩小图表'}).click();
  expect((await svg.boundingBox())!.width).toBeCloseTo(fitted.width,0);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await card.getByRole('button',{name:'放大图表',exact:true}).click();
  await expect(dialog.locator('svg.pele')).toHaveCount(1);
  expect((await dialog.locator('svg.pele').boundingBox())!.x).toBeCloseTo(initial.x,0);
});

test('编辑中查看宽图，适应状态也能拖动，移到窗口边缘释放后停止，改变窗口可重新适应',async({page})=>{
  const wide='flowchart LR\n'+Array.from({length:15},(_,i)=>` N${i}[步骤 ${i+1}] --> N${i+1}[步骤 ${i+2}]`).join('\n');
  const {dialog,area}=await openViewer(page,true,wide);
  const svg=dialog.locator('svg.pele');const initial=(await svg.boundingBox())!;
  const stage=(await dialog.locator('.diagram-viewer-stage').boundingBox())!;
  expect(initial.width).toBeLessThanOrEqual(stage.width);
  await drag(page,stage.x+stage.width/2,stage.y+stage.height/2,80,50);
  expect((await svg.boundingBox())!.x-initial.x).toBeCloseTo(80,0);
  await page.mouse.move(400,400);await page.mouse.down();await page.mouse.move(400,15,{steps:5});await page.mouse.up();
  const released=(await svg.boundingBox())!;
  await page.mouse.move(600,450);
  expect((await svg.boundingBox())!.y).toBeCloseTo(released.y,0);
  await page.setViewportSize({width:1000,height:700});await dialog.getByRole('button',{name:'适应图表窗口'}).click();
  const fitted=(await svg.boundingBox())!,bounds=(await dialog.locator('.diagram-viewer-stage').boundingBox())!;
  expect(fitted.width).toBeLessThanOrEqual(bounds.width);expect(fitted.x).toBeGreaterThanOrEqual(bounds.x);
  await page.keyboard.press('Escape');await expect(area).toBeVisible();await expect(area.locator('pre code')).toHaveText(wide);
});

test('超长纵向图放大后可以连续拖到最底部，再拖回顶部',async({page})=>{
  const code='flowchart TD\n'+Array.from({length:80},(_,i)=>` N${i}[步骤 ${i+1}] --> N${i+1}[步骤 ${i+2}]`).join('\n');
  const {dialog}=await openViewer(page,false,code),svg=dialog.locator('svg.pele');
  const stage=(await dialog.locator('.diagram-viewer-stage').boundingBox())!;
  await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);
  for(let i=0;i<3;i++)await page.mouse.wheel(0,-500);
  await expect.poll(async()=>(await svg.boundingBox())!.height).toBeGreaterThan(stage.height*4);
  const reach=async(id:string)=>{
    const node=svg.locator(`[data-id="${id}"]`),target=stage.y+stage.height/2;
    for(let i=0;i<70;i++){
      const box=(await node.boundingBox())!,delta=target-box.y-box.height/2;
      if(Math.abs(delta)<2)break;
      const step=Math.max(-stage.height*.55,Math.min(stage.height*.55,delta));
      await drag(page,stage.x+60,stage.y+stage.height*(step<0?.8:.2),0,step);
    }
    const box=(await node.boundingBox())!;
    expect(box.y).toBeGreaterThan(stage.y+16);expect(box.y+box.height).toBeLessThan(stage.y+stage.height-16);
    expect(await node.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  };
  await reach('N80');await reach('N0');
});
