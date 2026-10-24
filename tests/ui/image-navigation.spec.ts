import {test,expect} from './legacy-fixture';
test('单击图片全窗口预览，鼠标位置缩放和左键四向拖动不影响画布',async({page})=>{
 await page.goto('/');await expect(page.locator('.startup')).toHaveCount(0);await expect(page.locator('.node-card .asset-image')).toBeVisible();const canvas=page.locator('.react-flow__viewport');await expect.poll(()=>canvas.getAttribute('style')).not.toBe('transform: translate(0px, 0px) scale(1);');await page.waitForTimeout(500);const transform=await canvas.getAttribute('style');
 await page.locator('.node-card .asset-image').click();const viewer=page.getByRole('dialog',{name:'图片预览'}),image=viewer.locator('img'),stage=viewer.locator('.image-viewer-stage');await expect(viewer).toBeVisible();
 const screen=page.viewportSize()!,frame=await viewer.boundingBox();expect(frame!.width).toBe(screen.width);expect(frame!.height).toBe(screen.height);
 await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);await expect.poll(async()=>(await image.boundingBox())!.width).toBeGreaterThan(200);const before=(await image.boundingBox())!,x=before.x+before.width*.6,y=before.y+before.height*.6;await page.mouse.move(x,y);await page.mouse.wheel(0,-200);await expect.poll(async()=>(await image.boundingBox())!.width).toBeGreaterThan(before.width);
 const zoomed=(await image.boundingBox())!;expect((x-zoomed.x)/zoomed.width).toBeCloseTo(.6,2);expect((y-zoomed.y)/zoomed.height).toBeCloseTo(.6,2);
 await page.mouse.move(screen.width/2,screen.height/2);await page.mouse.down();await page.mouse.move(screen.width/2+100,screen.height/2-70,{steps:6});await page.mouse.up();
 await expect.poll(async()=>(await image.boundingBox())!.x).toBeCloseTo(zoomed.x+100,0);const moved=(await image.boundingBox())!;expect(moved.y).toBeCloseTo(zoomed.y-70,0);await expect(viewer).toBeVisible();
 await page.mouse.move(screen.width/2,screen.height/2);await page.mouse.down();await page.mouse.move(screen.width/2-70,screen.height/2+90,{steps:6});await page.mouse.up();await expect.poll(async()=>(await image.boundingBox())!.x).toBeCloseTo(moved.x-70,0);
 await page.mouse.wheel(0,200);await expect.poll(async()=>(await image.boundingBox())!.width).toBeLessThan(zoomed.width);await page.getByLabel('适应窗口',{exact:true}).click();await expect.poll(async()=>(await image.boundingBox())!.width).toBeCloseTo(before.width,0);await expect(stage).toHaveCSS('overflow','hidden');
 await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);expect(await canvas.getAttribute('style')).toBe(transform);
});
test('编辑中的图片也可单击预览，关闭后保留编辑状态',async({page})=>{
 await page.goto('/');await page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})}).getByLabel('编辑卡片正文').click();const area=page.locator('[contenteditable=true]');await expect(area.locator('img')).toBeVisible();await area.locator('img').click();await expect(page.getByRole('dialog',{name:'图片预览'})).toBeVisible();await page.getByLabel('关闭图片预览').click();await expect(area).toBeVisible();await expect(page.getByLabel('正文格式工具栏')).toBeVisible();
});
