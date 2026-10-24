import {test,expect} from './legacy-fixture';
test.afterEach(async({page},info)=>{
  if(info.status!==info.expectedStatus){await info.attach('preview-state',{body:await page.evaluate(()=>localStorage.getItem('qingtu-preview')??''),contentType:'application/json'});}
});
test('本地 MP4 样例可解码和跳转',async({page})=>{
  await page.goto('/');
  const metadata=await page.evaluate(()=>new Promise<{width:number;height:number;duration:number}>((resolve,reject)=>{
    const video=document.createElement('video');video.muted=true;video.preload='auto';
    video.onloadedmetadata=()=>{const result={width:video.videoWidth,height:video.videoHeight,duration:video.duration};video.currentTime=1;video.onseeked=()=>{video.pause();video.removeAttribute('src');video.load();resolve(result);};};
    video.onerror=()=>reject(new Error(video.error?.message));video.src='/demo/lesson.mp4';
    setTimeout(()=>reject(new Error('Video decode timeout')),5000);
  }));
  expect(metadata.width).toBe(640);expect(metadata.height).toBe(400);expect(metadata.duration).toBeGreaterThan(2);
});
test('双栏在正文可用宽度 359 和 360 像素正确切换',async({page})=>{
  await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
  await expect(card.locator('.rich-columns')).toBeVisible();
  for(const [width,columns] of [[359,1],[359.5,1],[359.9,1],[360,2],[361,2]]) {
    await card.evaluate((element,value)=>{(element as HTMLElement).style.width=`${value+34}px`;},width);
    const layout=await card.locator('.rich-columns').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(layout,`content width ${width}`).toBe(columns);
  }
});
test('概念图节点、独立折叠和编辑流程',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.message);});
  await page.goto('/');
  await expect(page.getByText('勾股定理',{exact:true})).toBeVisible();
  await expect(page.locator('.startup')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-results/preview-main.png',fullPage:true});
  const card=page.locator('.mind-node').filter({has:page.getByText('勾股定理',{exact:true})});
  await card.getByRole('button',{name:'收起正文',exact:true}).click();
  await expect(card.locator('.card-body')).toHaveCount(0);
  await expect(page.getByText('证明方法',{exact:true})).toBeVisible();
  await card.getByRole('button',{name:'展开正文',exact:true}).click();
  await expect(card.locator('.card-body')).toBeVisible();
  await card.getByRole('button',{name:'收起所有子分支',exact:true}).click();
  await expect(page.getByText('证明方法',{exact:true})).toHaveCount(0);
  await expect(card.locator('.card-body')).toBeVisible();
  await card.getByRole('button',{name:/展开 4 个后代/}).click();
  await expect(page.getByText('证明方法',{exact:true})).toBeVisible();
  await card.getByRole('button',{name:'编辑卡片正文'}).click();
  await expect(page.locator('[contenteditable="true"]')).toBeVisible();
  await page.locator('[contenteditable="true"]').press('End');
  await page.keyboard.insertText('这是一段撤销测试');
  await expect(page.locator('[contenteditable="true"]')).toContainText('这是一段撤销测试');
  await page.keyboard.press('Control+z');
  await expect(page.locator('[contenteditable="true"]')).not.toContainText('这是一段撤销测试');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('[contenteditable="true"]')).toContainText('这是一段撤销测试');
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await page.getByRole('button',{name:'添加内容卡片',exact:true}).click();
  await page.locator('input[aria-label="节点标题"]').fill('我的学习笔记');
  await page.locator('input[aria-label="节点标题"]').press('Enter');
  await expect(page.getByText('我的学习笔记',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('标题输入保持焦点时 Ctrl+S 可以保存草稿',async({page})=>{
  await page.goto('/');const root=page.locator('.root-node');await root.locator('.node-label').dblclick();
  const input=page.getByRole('textbox',{name:'节点标题'});await input.fill('需要保留的标题草稿');await input.press('Control+s');
  await expect(input).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>{const preview=JSON.parse(localStorage.getItem('qingtu-preview')??'{"docs":{}}');return Object.values(preview.docs).some((doc:any)=>doc.nodes[doc.rootId].title==='需要保留的标题草稿');})).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('组合输入尚未结束时不保存正文，结束后保留完整文字',async({page})=>{
  await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await card.getByRole('button',{name:'编辑卡片正文'}).click();
  const editor=page.locator('[contenteditable=true]');await expect(editor).toBeVisible();await editor.press('End');
  await editor.dispatchEvent('compositionstart',{data:''});await page.keyboard.insertText('组合输入保留测试');await page.waitForTimeout(700);
  const stored=()=>page.evaluate(()=>localStorage.getItem('qingtu-preview')??'');
  expect(await stored()).not.toContain('组合输入保留测试');
  await editor.dispatchEvent('compositionend',{data:'组合输入保留测试'});
  await expect.poll(stored).toContain('组合输入保留测试');await expect(editor).toContainText('组合输入保留测试');
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
});

test('正文图片可查看原图，损坏视频会回到可重试的明确提示',async({page})=>{
  await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
  await card.locator('.asset-image').dblclick();await expect(page.locator('.image-lightbox img')).toBeVisible();await expect(page.locator('.image-lightbox img')).toHaveAttribute('src',/triangle\.png$/);await page.keyboard.press('Escape');
  await page.route('**/demo/lesson.mp4',route=>route.fulfill({contentType:'video/mp4',body:'broken video'}));
  await page.getByRole('button',{name:'播放视频',exact:true}).click();await expect(page.locator('.video-caption')).toContainText('无法播放');await expect(page.locator('.asset-video')).toHaveCount(0);
});

test('复制文档保留相同节点 ID 时，切换会释放旧视频源',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'播放视频',exact:true}).click();const video=page.locator('.asset-video');await expect(video).toBeVisible();
  await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.videoWidth)).toBe(640);
  await page.evaluate(async()=>{
    const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);(window as any).__oldVideo=document.querySelector('.asset-video');const copy=structuredClone(state.getState().doc!);copy.id=crypto.randomUUID();copy.title='包含相同节点 ID 的副本';await state.activateDocument(copy,true);
  });
  await expect(page.locator('.asset-video')).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>({paused:(window as any).__oldVideo.paused,src:(window as any).__oldVideo.getAttribute('src')}))).toEqual({paused:true,src:null});
  await expect(page.getByRole('button',{name:'播放视频',exact:true})).toBeVisible();
});

test('图片导出尚未完成时切图，会清理旧任务而不导出新文档',async({page})=>{
  await page.goto('/');await expect(page.getByText('勾股定理',{exact:true})).toBeVisible();
  await page.evaluate(async()=>{
    const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);window.dispatchEvent(new CustomEvent('qingtu-export-png',{detail:'cancelled.png'}));const copy=structuredClone(state.getState().doc!);copy.id=crypto.randomUUID();copy.title='导出途中切换的文档';await state.activateDocument(copy,true);
  });
  await expect(page.locator('.busy-overlay')).toHaveCount(0);await expect(page.locator('.react-flow__viewport.exporting')).toHaveCount(0);await page.waitForTimeout(250);
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.document-button')).toContainText('导出途中切换的文档');
});
