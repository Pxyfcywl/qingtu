import type {MindDocument} from '../../src/domain/types';
import {test,expect,type Page} from './legacy-fixture';
async function fixture(page:Page){
 await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();
 return page.evaluate(async()=>{
   const state=await import('/src/state.ts' as string),tree=await import('/src/domain/tree.ts' as string);const doc=tree.newDocument('多父节点测试'),a=tree.addChild(doc,doc.rootId,'text'),b=tree.addChild(doc,doc.rootId,'text'),shared=tree.addChild(doc,a,'card');
   doc.layoutMode='free';doc.viewport={x:70,y:160,zoom:.8};doc.nodes[a].title='父节点 A';doc.nodes[a].position={x:280,y:0};doc.nodes[b].title='父节点 B';doc.nodes[b].position={x:280,y:240};doc.nodes[shared].title='共享卡片';doc.nodes[shared].position={x:620,y:0};doc.nodes[shared].body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'只保存一份的共用正文'}]}]};await state.activateDocument(doc,true);return {a,b,shared};
 });
}
async function connect(page:Page,shared:string,b:string){
 await page.locator(`[data-node-id="${shared}"] .card-header`).click();await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByRole('combobox',{name:'添加父节点连接',exact:true}).selectOption(b);await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
 await page.getByRole('button',{name:'关闭节点属性',exact:true}).click();
}
async function selectEdge(page:Page,id:string){
 const path=page.locator(`.react-flow__edge[data-id="${id}"] .react-flow__edge-path`);await expect(path).toBeVisible();
 const point=await path.evaluate((element:SVGPathElement)=>{const at=element.getPointAtLength(element.getTotalLength()/2),screen=new DOMPoint(at.x,at.y).matrixTransform(element.getScreenCTM()!);return {x:screen.x,y:screen.y};});await page.mouse.click(point.x,point.y);await expect(page.locator('.parent-edge-tools')).toBeVisible();
}
test('额外父节点连接可保存重载和断开，节点内容只有一份',async({page})=>{
 const {shared,b}=await fixture(page);await connect(page,shared,b);await page.keyboard.press('Control+s');await expect(page.locator('.save-indicator')).toContainText('已保存');await page.reload();
 await expect(page.locator('.additional-parent-edge')).toHaveCount(1);await expect(page.getByText('只保存一份的共用正文',{exact:true})).toHaveCount(1);
 await page.locator(`[data-node-id="${shared}"] .card-header`).click();await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByRole('button',{name:'断开父节点：父节点 B',exact:true}).click();await expect(page.locator('.additional-parent-edge')).toHaveCount(0);await expect(page.getByText('只保存一份的共用正文',{exact:true})).toBeVisible();
});
test('共享节点从展开的父分支可见，删除一个父节点仍保留共享子节点并支持撤销',async({page})=>{
 const {a,b,shared}=await fixture(page);await connect(page,shared,b);
 const parentA=page.locator(`[data-node-id="${a}"]`),parentB=page.locator(`[data-node-id="${b}"]`),node=page.locator(`[data-node-id="${shared}"]`);
 await parentA.getByRole('button',{name:'收起所有子分支',exact:true}).click();await expect(node).toBeVisible();
 await parentB.getByRole('button',{name:'收起所有子分支',exact:true}).click();await expect(node).toHaveCount(0);
 await parentB.getByRole('button',{name:/展开 .* 个后代/}).click();await expect(node).toBeVisible();
 await parentA.locator('.node-label').click();await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByRole('button',{name:'删除节点及后代',exact:true}).click();
 await expect(parentA).toHaveCount(0);await expect(node).toBeVisible();await expect(node).toContainText('只保存一份的共用正文');
 const parent=await page.evaluate(async id=>{const state=await import('/src/state.ts' as string);return state.getState().doc.nodes[id].parentId;},shared);expect(parent).toBe(b);
 await page.getByRole('button',{name:'撤销 Ctrl+Z',exact:true}).click();await expect(parentA).toBeVisible();await expect(node).toBeVisible();
});
test('可拖动连接点新增第二个父节点，拒绝循环',async({page})=>{
 const {a,b,shared}=await fixture(page);const source=page.locator(`[data-node-id="${b}"] [data-handleid="right"]`),target=page.locator(`[data-node-id="${shared}"] [data-handleid="in"]`);
 await page.locator(`[data-node-id="${b}"]`).hover();const s=await source.boundingBox(),t=await target.boundingBox();await page.mouse.move(s!.x+s!.width/2,s!.y+s!.height/2);await page.mouse.down();await page.mouse.move(t!.x+t!.width/2,t!.y+t!.height/2,{steps:20});await page.mouse.up();await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
 await page.locator(`[data-node-id="${a}"] .node-label`).click();await page.getByRole('button',{name:'节点属性',exact:true}).click();await page.getByRole('combobox',{name:'添加父节点连接',exact:true}).selectOption(shared);await expect(page.getByRole('alert')).toContainText('循环');await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
});

test('点击已有主连线可直接改接到画布上的父节点',async({page})=>{
 const {a,b,shared}=await fixture(page);await selectEdge(page,`${a}:${shared}`);await expect(page.getByRole('button',{name:'断开此父节点连线',exact:true})).toBeDisabled();await page.getByRole('button',{name:'更换此连线的父节点',exact:true}).click();await page.locator(`[data-node-id="${b}"] .node-label`).click();await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(0);await expect(page.locator(`.react-flow__edge[data-id="${b}:${shared}"]`)).toHaveCount(1);
});

test('选中主连线按 Delete 仅断开该连接，保留共享节点并提升另一父节点',async({page})=>{
 const {a,b,shared}=await fixture(page);await connect(page,shared,b);await selectEdge(page,`${a}:${shared}`);await page.keyboard.press('Delete');await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(0);await expect(page.locator(`.react-flow__edge[data-id="${b}:${shared}"]`)).toHaveCount(1);await expect(page.locator(`[data-node-id="${shared}"]`)).toContainText('只保存一份的共用正文');
 await page.keyboard.press('Control+z');await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(1);await expect(page.locator('.additional-parent-edge')).toHaveCount(1);
});

test('选中额外连线后更换或断开，只影响该连接',async({page})=>{
 const {a,b,shared}=await fixture(page);await connect(page,shared,b);
 const extra=await page.evaluate(async()=>{const state=await import('/src/state.ts' as string),tree=await import('/src/domain/tree.ts' as string);let id='';state.editDocument((d:MindDocument)=>{id=tree.addChild(d,d.rootId,'text');d.nodes[id].title='父节点 D';d.nodes[id].position={x:280,y:440};});return id;});
 await selectEdge(page,`extra:${b}:${shared}`);await page.getByRole('button',{name:'更换此连线的父节点',exact:true}).click();await page.locator(`[data-node-id="${extra}"] .node-label`).click();await expect(page.locator(`.react-flow__edge[data-id="extra:${b}:${shared}"]`)).toHaveCount(0);await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(1);await expect(page.locator(`.react-flow__edge[data-id="extra:${extra}:${shared}"]`)).toHaveCount(1);
 await selectEdge(page,`extra:${extra}:${shared}`);await page.getByRole('button',{name:'断开此父节点连线',exact:true}).click();await expect(page.locator('.additional-parent-edge')).toHaveCount(0);await expect(page.locator(`[data-node-id="${shared}"]`)).toBeVisible();
});

test('更换父节点拒绝循环，取消或断开唯一父连接不会丢失原节点',async({page})=>{
 const {a,shared}=await fixture(page);await page.locator(`[data-node-id="${a}"] .node-label`).click();await page.keyboard.press('Control+Shift+m');await page.locator(`[data-node-id="${shared}"] .card-header`).click();await expect(page.getByRole('alert')).toContainText('循环');await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(1);
 await page.locator(`[data-node-id="${shared}"] .card-header`).click();await page.keyboard.press('Control+Shift+m');await page.keyboard.press('Escape');await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(1);
 await selectEdge(page,`${a}:${shared}`);await page.keyboard.press('Delete');await expect(page.getByRole('alert')).toContainText('唯一');await expect(page.locator(`[data-node-id="${shared}"]`)).toBeVisible();await expect(page.locator(`.react-flow__edge[data-id="${a}:${shared}"]`)).toHaveCount(1);
});
