import {test,expect} from './legacy-fixture';
async function mount(page:import('@playwright/test').Page,slow=false){await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();await page.evaluate(async slow=>{const fixture=await import('/tests/ui/playback-fixture.tsx' as string);fixture.mountPlayers(slow);},slow);await expect(page.locator('#player-b button')).toBeVisible();}

test('切换播放释放前一个视频源，返回时保留播放进度',async({page})=>{
 await mount(page);await page.locator('#player-a button').click();const first=page.locator('#player-a video');await expect.poll(()=>first.evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBe(640);
 const position=await first.evaluate(async(v:HTMLVideoElement)=>{v.pause();v.volume=.25;v.muted=true;v.playbackRate=1.25;const time=Math.min(.4,v.duration/3);await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Seek timed out')),3000);v.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});v.currentTime=time;});Reflect.set(window,'retiredVideo',v);return v.currentTime;});
 await page.locator('#player-b button').click();await expect.poll(()=>page.locator('#player-b video').evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBe(640);
 await expect(page.locator('#playback-fixture video[src]')).toHaveCount(1);expect(await page.evaluate(()=>{const v=Reflect.get(window,'retiredVideo') as HTMLVideoElement;return {paused:v.paused,src:v.getAttribute('src')};})).toEqual({paused:true,src:null});
 await page.locator('#player-a button').click();await expect.poll(()=>first.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
 const resumed=await first.evaluate((v:HTMLVideoElement)=>{v.pause();return v.currentTime;});expect(Math.abs(resumed-position)).toBeLessThan(.2);await expect(page.locator('#playback-fixture video[src]')).toHaveCount(1);
 expect(await first.evaluate((v:HTMLVideoElement)=>({volume:v.volume,muted:v.muted,rate:v.playbackRate}))).toEqual({volume:.25,muted:true,rate:1.25});
});

test('快速点播两个视频时只有最后一次请求建立播放源',async({page})=>{
 await mount(page);await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#player-a button')!.click();document.querySelector<HTMLButtonElement>('#player-b button')!.click();});
 await expect(page.locator('#player-b video')).toBeVisible();await expect.poll(()=>page.locator('#player-b video').evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBe(640);await expect(page.locator('#player-a video')).toHaveCount(0);await expect(page.locator('#playback-fixture video[src]')).toHaveCount(1);
});

test('已删除节点的迟到播放地址不会停止当前视频',async({page})=>{
 await page.route('**/src/bridge.ts',route=>route.fulfill({contentType:'application/javascript',body:`export * from '/src/bridge.ts?playback-original';import {assetUrl as actual} from '/src/bridge.ts?playback-original';export function assetUrl(id,thumbnail=false){if(id==='builtin:slow')return new Promise(resolve=>window.resolveSlowPlayback=resolve);return actual(id,thumbnail);}`}));
 await mount(page,true);await page.locator('#player-a button').click();await page.locator('#player-b button').click();await expect.poll(()=>page.locator('#player-b video').evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBe(640);
 await page.evaluate(async()=>{const fixture=await import('/tests/ui/playback-fixture.tsx' as string);fixture.removeFirst();});await expect(page.locator('#player-a')).toHaveCount(0);
 await page.evaluate(()=>Reflect.get(window,'resolveSlowPlayback')('/demo/lesson.mp4'));await page.waitForTimeout(100);await expect(page.locator('#playback-fixture video[src]')).toHaveCount(1);expect(await page.locator('#player-b video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false);
});
