import {test,expect,type Page} from './legacy-fixture';
async function edit(page:Page){await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card).toBeVisible();await card.getByRole('button',{name:'编辑卡片正文'}).click();const editor=page.locator('[contenteditable=true]');await expect(editor).toBeVisible();await editor.evaluate(el=>(el as any).editor.commands.setContent({type:'doc',content:[{type:'paragraph'}]}));return editor;}
async function videoFile(page:Page,event:'paste'|'drop',selector:string){
  await page.locator(selector).evaluate(async(el,event)=>{const blob=await(await fetch('/demo/lesson.mp4')).blob();const data=new DataTransfer();data.items.add(new File([blob],'课程.mp4',{type:'video/mp4'}));
    if(event==='paste')el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    else{const rect=el.getBoundingClientRect(),blank=el.classList.contains('react-flow__pane');el.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true,clientX:rect.left+(blank?750:30),clientY:blank?rect.bottom-220:rect.top+30}));}
  },event);
}
test('公式无需弹窗，源码旁实时预览，保存重载并可再次编辑',async({page})=>{
  const prompts:string[]=[];page.on('dialog',async dialog=>{prompts.push(dialog.type());await dialog.dismiss();});const editor=await edit(page);
  await page.getByRole('button',{name:'插入公式',exact:true}).click();const source=page.getByRole('textbox',{name:'LaTeX 公式',exact:true});await expect(source).toBeVisible();await source.fill('\\frac{x^2}{y}');
  await expect(editor.locator('.math-live-preview .katex')).toHaveCount(1);await expect(editor.locator('.math-live-preview annotation')).toHaveText('\\frac{x^2}{y}');
  await source.fill('a+b=c');await expect(editor.locator('.math-live-preview annotation')).toHaveText('a+b=c');
  await page.getByRole('button',{name:'完成公式编辑',exact:true}).click();await expect(source).toBeHidden();await editor.press('Escape');
  await page.keyboard.press('Control+s');await expect(page.locator('.save-indicator')).toContainText('已保存');await page.reload();
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card.locator('annotation')).toHaveText('a+b=c');await card.getByRole('button',{name:'编辑卡片正文'}).click();await page.locator('[contenteditable=true] .math-live-preview').click();await expect(page.getByRole('textbox',{name:'LaTeX 公式',exact:true})).toHaveValue('a+b=c');expect(prompts).toEqual([]);
});
for(const event of ['paste','drop'] as const)test(`正文直接${event==='paste'?'粘贴':'拖入'} MP4，编辑时可播放，保存后仍可播放`,async({page})=>{
  const editor=await edit(page);await videoFile(page,event,'[contenteditable=true]');const player=editor.locator('video');await expect(player).toBeVisible();await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await player.evaluate((video:HTMLVideoElement)=>video.play());await expect.poll(()=>player.evaluate((video:HTMLVideoElement)=>video.videoWidth)).toBe(640);
  await editor.press('Escape');await page.keyboard.press('Control+s');await expect(page.locator('.save-indicator')).toContainText('已保存');await page.reload();
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await card.getByRole('button',{name:'播放视频',exact:true}).click();await expect.poll(()=>card.locator('video').evaluate((video:HTMLVideoElement)=>video.videoWidth)).toBe(640);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('画布可拖入视频创建节点，选中卡片可粘贴视频到正文',async({page})=>{
  await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();await page.getByText('勾股定理',{exact:true}).click();const before=await page.locator('.node-video').count();await videoFile(page,'drop','.react-flow__pane');await expect(page.locator('.node-video')).toHaveCount(before+1);await expect(page.locator('.busy-overlay')).toHaveCount(0);
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await card.locator('.card-header').click();const id=await card.getAttribute('data-node-id');
  await page.evaluate(async id=>{const url='/src/state.ts';const {patchState}=await import(url);patchState({selectedId:id});},id);await videoFile(page,'paste','body');await expect(card.getByRole('button',{name:'播放视频',exact:true})).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);
});
