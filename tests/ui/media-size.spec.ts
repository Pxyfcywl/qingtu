import {test,expect} from './legacy-fixture';

for(const kind of ['node','body'] as const){
 test(`${kind} 图片解码前预留真实比例，加载前后高度一致`,async({page})=>{
  await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();
  const encoded=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=320;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#25877e';ctx.fillRect(0,0,80,320);return canvas.toDataURL('image/png').split(',')[1];});
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let requested=false;
  await page.route(`**/demo/reserved-${kind}.png`,async route=>{requested=true;await gate;await route.fulfill({contentType:'image/png',body:Buffer.from(encoded,'base64')});});
  await page.evaluate(async kind=>{const fixture=await import('/tests/ui/media-size-fixture.tsx' as string);fixture.mountImage(kind,80,320);},kind);
  const placeholder=page.locator('#reservation-fixture .media-placeholder');await expect(placeholder).toBeVisible();await expect.poll(()=>requested).toBe(true);
  const before=await placeholder.boundingBox();release();
  const image=page.locator('#reservation-fixture img');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth)).toBe(80);
  const after=await image.boundingBox();expect(Math.abs(before!.height-after!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.height-(kind==='node'?500:1120))).toBeLessThanOrEqual(1);
 });
}

test('已加载的公式重新进入画布时，首帧就是排版后的尺寸',async({page})=>{
 await page.goto('/');await expect(page.locator('.katex').first()).toBeVisible();
 await page.evaluate(async()=>{const fixture=await import('/tests/ui/media-size-fixture.tsx' as string);fixture.mountFormula();});
 await expect(page.locator('#formula-fixture .katex')).toBeVisible();await page.waitForTimeout(100);
 const sizes=await page.evaluate(()=>(window as unknown as {formulaSizes:number[]}).formulaSizes);expect(sizes.length).toBeGreaterThan(0);expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThanOrEqual(1);
});
