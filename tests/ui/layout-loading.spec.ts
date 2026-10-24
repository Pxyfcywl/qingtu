import {test,expect} from './legacy-fixture';

test.afterEach(async({page},info)=>{
 if(info.status===info.expectedStatus)return;
 await info.attach('mount-peaks',{body:JSON.stringify(await page.evaluate(()=>(window as any).__mountProbe??null),null,2),contentType:'application/json'});
});

test('大分支加载、展开和同节点 ID 切图时，按布局坐标裁剪节点',async({page})=>{
 await page.goto('/');await expect(page.locator('.startup')).toHaveCount(0);await expect(page.locator('.root-node')).toBeVisible();
 const rootId=await page.evaluate(async()=>{
  const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);
  const doc=structuredClone(state.getState().doc!);doc.id=crypto.randomUUID();doc.title='布局加载检查';doc.revision=1;doc.viewport={x:500,y:300,zoom:1};
  const root=doc.nodes[doc.rootId];root.position={x:0,y:0};root.childIds=[];root.childrenCollapsed=false;doc.nodes={[root.id]:root};
  for(let index=1;index<200;index++){const id='mount-'+index;root.childIds.push(id);doc.nodes[id]={...root,id,parentId:root.id,title:'分支 '+index,childIds:[],side:'right',position:{x:0,y:0}};}
  const probe={max:0,changes:0,peaks:[] as unknown[]};(window as any).__mountProbe=probe;
  const observer=new MutationObserver(()=>{const count=document.querySelectorAll('.mind-node').length;if(count>probe.max){probe.max=count;probe.peaks.push({count,transform:document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform,doc:state.getState().doc?.title,revision:state.getState().doc?.revision,modelViewport:state.getState().doc?.viewport});}probe.changes++;});observer.observe(document.querySelector('.react-flow__viewport')!,{subtree:true,childList:true});(window as any).__mountObserver=observer;
  await state.activateDocument(doc,true);return root.id;
 });
 await expect(page.locator('.document-button')).toContainText('布局加载检查');
 const branch=page.locator(`[data-node-id="${rootId}"] .branch-toggle`);
 await expect(branch).toBeVisible();await page.waitForTimeout(500);
 expect(await page.evaluate(()=>(window as any).__mountProbe.max)).toBeLessThan(35);
 for(let index=0;index<2;index++){
  await branch.click();await expect(page.locator('.mind-node')).toHaveCount(1);await branch.click();
  await expect.poll(()=>page.locator('.mind-node').count()).toBeGreaterThan(1);await page.waitForTimeout(250);
 }
 await page.evaluate(async()=>{const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);const copy=structuredClone(state.getState().doc!);copy.id=crypto.randomUUID();copy.title='相同结构副本';await state.activateDocument(copy,true);});
 await expect(page.locator('.document-button')).toContainText('相同结构副本');await expect(branch).toBeVisible();await page.waitForTimeout(300);
 expect(await page.evaluate(()=>{(window as any).__mountObserver.disconnect();return (window as any).__mountProbe.max;})).toBeLessThan(35);
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('自动布局尚未完成时切到自由文档，不遗留布局等待状态',async({page})=>{
 await page.addInitScript(()=>{const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(...args:any[]){if((window as any).__slowLayout)setTimeout(()=>Reflect.apply(original,this,args),500);else Reflect.apply(original,this,args);};});
 await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();await page.waitForTimeout(500);
 await page.evaluate(async()=>{const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);(window as any).__slowLayout=true;const copy=structuredClone(state.getState().doc!);copy.id=crypto.randomUUID();copy.title='尚在计算的自动图';await state.activateDocument(copy,true);});
 await page.waitForTimeout(100);
 await page.evaluate(async()=>{const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);const copy=structuredClone(state.getState().doc!);copy.id=crypto.randomUUID();copy.title='自由布局副本';copy.layoutMode='free';await state.activateDocument(copy,true);});
 await expect(page.locator('.document-button')).toContainText('自由布局副本');await expect(page.locator('.root-node')).toBeVisible();await page.waitForTimeout(11000);
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('自动布局新增视口外的节点后，标题进入视口且可以直接编辑',async({page})=>{
 await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();
 await page.evaluate(async()=>{
  const state:typeof import('../../src/state')=await import('/src/state.ts' as string),doc=structuredClone(state.getState().doc!);doc.id=crypto.randomUUID();doc.title='新增视口外节点';doc.revision=1;doc.layoutMode='auto';doc.viewport={x:500,y:300,zoom:1};
  const root=doc.nodes[doc.rootId];root.childIds=[];root.childrenCollapsed=false;doc.nodes={[root.id]:root};
  for(let n=1;n<=50;n++){const id='offscreen-'+n;root.childIds.push(id);doc.nodes[id]={...root,id,parentId:root.id,childIds:[],kind:'text',title:'分支 '+n,side:'right'};}
  await state.activateDocument(doc,true);
 });
 await expect(page.locator('.document-button')).toContainText('新增视口外节点');await expect(page.locator('.root-node')).toBeVisible();await expect(page.locator('.save-indicator')).toContainText('已保存');
 await page.getByRole('button',{name:'添加文字节点 Tab',exact:true}).click();
 const input=page.getByRole('textbox',{name:'节点标题',exact:true});await expect(input).toBeVisible();await expect(input).toBeFocused();
 const rect=await input.boundingBox(),pane=await page.locator('.react-flow').boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(pane!.x);expect(rect!.y).toBeGreaterThanOrEqual(pane!.y);expect(rect!.y+rect!.height).toBeLessThanOrEqual(pane!.y+pane!.height);
 await input.fill('新节点可以输入');await input.press('Enter');await expect(page.getByText('新节点可以输入',{exact:true})).toBeVisible();
});

test('拖动转为自由布局后，折叠恢复保留坐标且画布仍可操作',async({page})=>{
 await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card).toBeVisible();await page.waitForTimeout(300);
 const header=await card.locator('.card-header').boundingBox();if(!header)throw Error('Missing card geometry');
 await page.mouse.move(header.x+50,header.y+20);await page.mouse.down();await page.mouse.move(header.x+54,header.y+24);
 const dragStart=await card.boundingBox();if(!dragStart)throw Error('Missing drag geometry');
 await page.mouse.move(header.x+174,header.y+104,{steps:8});await page.mouse.up();
 const moved=await card.boundingBox();if(!moved)throw Error('Dragged card disappeared');expect(Math.abs(moved.x-dragStart.x-120)).toBeLessThanOrEqual(1);expect(Math.abs(moved.y-dragStart.y-80)).toBeLessThanOrEqual(1);
 const saved=await page.evaluate(async()=>{const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);const doc=state.getState().doc!;const node=Object.values(doc.nodes).find(n=>n.title==='勾股定理')!;return {mode:doc.layoutMode,position:node.position,viewport:document.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform};});expect(saved.mode).toBe('free');
 const rootBranch=page.locator('.root-node .branch-toggle');await rootBranch.click();await expect(card).toHaveCount(0);await rootBranch.click();await expect(card).toBeVisible();
 const restored=await card.boundingBox();expect(Math.abs(restored!.x-moved.x)).toBeLessThanOrEqual(1);expect(Math.abs(restored!.y-moved.y)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(async()=>{const sourceUrl='/src/state.ts';const state:typeof import('../../src/state')=await import(sourceUrl);return Object.values(state.getState().doc!.nodes).find(n=>n.title==='勾股定理')!.position;})).toEqual(saved.position);await expect(page.getByRole('alert')).toHaveCount(0);
});
