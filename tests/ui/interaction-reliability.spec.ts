import {test,expect} from './legacy-fixture';

test.afterEach(async({page},info)=>{
 if(info.status===info.expectedStatus)return;
 const state=await page.evaluate(async()=>{
  const module:typeof import('../../src/state')=await import('/src/state.ts' as string),s=module.getState();
  return {saving:s.saving,selectedId:s.selectedId,titleEditing:s.titleEditing,viewport:s.doc?.viewport,nodes:Object.values(s.doc?.nodes??{}).map(n=>({id:n.id,title:n.title,childrenCollapsed:n.childrenCollapsed,contentCollapsed:n.contentCollapsed})),activeElement:document.activeElement?.outerHTML.slice(0,600)};
 });
 await info.attach('interaction-failure-state',{body:JSON.stringify(state,null,2),contentType:'application/json'});
});

test('折叠按钮接受 Enter 和 Space，Tab 导航不新增节点',async({page})=>{
 await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card).toBeVisible();
 const initialCount=await page.evaluate(async()=>{const state:typeof import('../../src/state')=await import('/src/state.ts' as string);return Object.keys(state.getState().doc!.nodes).length;});
 const toggle=card.locator('.body-toggle');await toggle.focus();
 await expect.poll(async()=>{const target=await toggle.boundingBox(),pane=await page.locator('.react-flow').boundingBox();return !!target&&!!pane&&target.y>=pane.y&&target.y+target.height<=pane.y+pane.height;}).toBe(true);
 await page.keyboard.press('Enter');
 await expect(card.locator('.card-body')).toHaveCount(0);await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(toggle).toBeFocused();
 await page.keyboard.press('Space');await expect(card.locator('.card-body')).toBeVisible();await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Tab');await expect(toggle).not.toBeFocused();await page.keyboard.press('Shift+Tab');await expect(toggle).toBeFocused();
 const after=await page.evaluate(async()=>{const state:typeof import('../../src/state')=await import('/src/state.ts' as string);return {count:Object.keys(state.getState().doc!.nodes).length,titleEditing:state.getState().titleEditing};});
 expect(after.count).toBe(initialCount);expect(after.titleEditing).toBeNull();await expect(page.getByRole('alert')).toHaveCount(0);
});

test('保存尚未完成时平移画布，完成后仍保存用户的新视口',async({page})=>{
 // Hold only the persistence boundary, while the actual React Flow pointer
 // interaction and state/save logic continue to run unchanged.
 await page.route(/\/src\/bridge\.ts$/,route=>route.fulfill({contentType:'application/javascript',body:`
 export * from '/src/bridge.ts?acceptance-original';
 import {call as originalCall} from '/src/bridge.ts?acceptance-original';
 export async function call(command,args){
  if(command==='save_document'&&window.__holdAcceptanceSave){
   window.__saveBoundaryEntered=true;
   await new Promise(resolve=>window.__releaseAcceptanceSave=resolve);
  }
  return originalCall(command,args);
 }`}));
 await page.goto('/');await expect(page.locator('.startup')).toHaveCount(0);await expect(page.locator('.root-node')).toBeVisible();await page.waitForTimeout(500);
 await page.evaluate(async()=>{
  const state:typeof import('../../src/state')=await import('/src/state.ts' as string);
  (window as any).__holdAcceptanceSave=true;
  state.editDocument(doc=>{doc.nodes[doc.rootId].title+=' 保存中';});
  (window as any).__pendingAcceptanceSave=state.flushSave();
 });
 await expect.poll(()=>page.evaluate(()=>(window as any).__saveBoundaryEntered===true)).toBe(true);
 const before=await page.locator('.react-flow__viewport').evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {x:m.e,y:m.f,zoom:m.a};});
 const pane=await page.locator('.react-flow__pane').boundingBox();if(!pane)throw Error('Missing canvas pane');
 await page.mouse.move(pane.x+150,pane.y+18);await page.mouse.down();await page.mouse.move(pane.x+230,pane.y+63,{steps:10});await page.mouse.up();
 const actual=await page.locator('.react-flow__viewport').evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {x:m.e,y:m.f,zoom:m.a};});
 expect(Math.abs(actual.x-before.x-80)).toBeLessThanOrEqual(1);expect(Math.abs(actual.y-before.y-45)).toBeLessThanOrEqual(1);
 await page.evaluate(async()=>{(window as any).__holdAcceptanceSave=false;(window as any).__releaseAcceptanceSave();await (window as any).__pendingAcceptanceSave;});
 await expect(page.locator('.save-indicator')).toContainText('已保存');
 const result=await page.evaluate(async()=>{
  const state:typeof import('../../src/state')=await import('/src/state.ts' as string);const doc=state.getState().doc!;
  const saved=JSON.parse(localStorage.getItem('qingtu-preview')!).docs[doc.id];return {current:doc.viewport,persisted:saved.viewport};
 });
 expect(result.persisted).toEqual(result.current);
 for(const viewport of [result.current,result.persisted]){
  // CSSOM rounds matrix coefficients to six decimals; persisted precision
  // is checked exactly against the current model immediately above.
  expect(Math.abs(viewport.x-actual.x)).toBeLessThanOrEqual(1);expect(Math.abs(viewport.y-actual.y)).toBeLessThanOrEqual(1);expect(Math.abs(viewport.zoom-actual.zoom)).toBeLessThanOrEqual(.000001);
 }
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('80 字根标题和普通标题完整换行，文字保持在节点内部',async({page})=>{
 await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();
 const titles=await page.evaluate(async()=>{
  const state:typeof import('../../src/state')=await import('/src/state.ts' as string);
  const root='根标题换行验证文字'.repeat(9).slice(0,80),plain='普通标题换行验证字'.repeat(9).slice(0,80);
  state.editDocument(doc=>{doc.nodes[doc.rootId].title=root;const node=Object.values(doc.nodes).find(n=>n.kind==='text'&&n.parentId===doc.rootId)!;node.title=plain;});return {root,plain};
 });
 for(const title of [titles.root,titles.plain]){
  const label=page.getByText(title,{exact:true}).filter({visible:true}).first();await expect(label).toBeVisible();
  const geometry=await label.evaluate(el=>{
   const node=el.closest('.mind-node')!,r=el.getBoundingClientRect(),n=node.getBoundingClientRect();
   return {scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,label:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},node:{left:n.left,right:n.right,top:n.top,bottom:n.bottom}};
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
  expect(geometry.label.left).toBeGreaterThanOrEqual(geometry.node.left-1);expect(geometry.label.right).toBeLessThanOrEqual(geometry.node.right+1);
  expect(geometry.label.top).toBeGreaterThanOrEqual(geometry.node.top-1);expect(geometry.label.bottom).toBeLessThanOrEqual(geometry.node.bottom+1);
 }
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('未选中卡片也以被点击的标题为锚点折叠，自动布局漂移不超过 2 px',async({page})=>{
 await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card).toBeVisible();await expect(page.locator('.root-node.is-selected')).toHaveCount(1);await page.waitForTimeout(500);
 const header=card.locator('.card-header'),before=await header.boundingBox();if(!before)throw Error('Missing card header');
 for(const closed of [true,false]){
  await card.locator('.body-toggle').click();await expect(card.locator('.card-body')).toHaveCount(closed?0:1);
  await expect(page.locator('.save-indicator')).toContainText('已保存');
  const actual=await header.boundingBox();if(!actual)throw Error('Header lost after fold');
  expect(Math.hypot(actual.x-before.x,actual.y-before.y)).toBeLessThanOrEqual(2);expect(Math.abs(actual.height-before.height)).toBeLessThanOrEqual(1);
 }
 await expect(page.getByRole('alert')).toHaveCount(0);
});
