import {test,expect,type Page} from './legacy-fixture';
const card=(page:Page)=>page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
async function open(page:Page){await page.goto('/');await card(page).getByRole('button',{name:'全页编辑卡片',exact:true}).click();await expect(page.getByRole('region',{name:'Markdown 全页编辑'})).toBeVisible();await expect(page.locator('.markdown-workspace [contenteditable=true]')).toBeVisible();}
const content='# 学习方法\n\n开头的说明。\n\n:::columns 3:2\n:::column\n## 核心原则\n\n- 主动回忆\n- 间隔练习\n:::column\n## 实践步骤\n\n1. 明确目标\n2. 完成练习\n:::\n\n## 每周复盘\n\n每周日整理本周收获。\n\n$$\na^2+b^2=c^2\n$$\n\n```mermaid\nflowchart LR\n A --> B\n```';
async function source(page:Page){await page.getByRole('button',{name:'源码',exact:true}).click();return page.getByRole('textbox',{name:'Markdown 源码'});}

test('卡片独立标签、顶部入口及原有双栏媒体保留',async({page})=>{
 await open(page);await expect(page.locator('.markdown-tab.active')).toContainText('勾股定理 · Markdown');await expect(page.locator('.react-flow')).toHaveCount(0);
 const editor=page.locator('.markdown-workspace [contenteditable=true]');await expect(editor.locator('[data-columns]')).toHaveCount(1);await expect(editor.locator('.editor-asset')).toHaveCount(1);
 const field=await source(page);await expect(field).toContainText(':::columns 3:2');await expect(field).toContainText('qingtu-node-json');await field.fill((await field.inputValue())+'\n\n保留媒体并追加正文');
 await expect(page.locator('.markdown-source-error')).toHaveCount(0);await page.getByRole('button',{name:'返回导图',exact:true}).click();await expect(card(page)).toContainText('保留媒体并追加正文');
 await card(page).locator('.card-header').click();await page.getByRole('button',{name:'Markdown 全页编辑',exact:true}).click();await expect(page.locator('.markdown-workspace .editor-asset')).toHaveCount(1);
});
test('源码修改同步回卡片，保存重载保留双栏公式和 Mermaid',async({page})=>{
 await open(page);const field=await source(page);await field.fill(content);await page.getByRole('button',{name:'分屏',exact:true}).click();
 await expect(page.locator('.markdown-preview h1')).toHaveText('学习方法');await expect(page.locator('.markdown-preview .rich-columns')).toHaveAttribute('data-ratio','3:2');await expect(page.locator('.markdown-preview .katex')).toHaveCount(1);
 await expect(page.locator('.markdown-preview .diagram-surface svg')).toHaveCount(1);await page.getByRole('button',{name:'返回导图',exact:true}).click();
 await expect(card(page)).toContainText('主动回忆');await page.keyboard.press('Control+s');await expect(page.locator('.save-indicator')).toContainText('已保存');await page.reload();
 await expect(card(page).locator('.rich-columns')).toHaveAttribute('data-ratio','3:2');await expect(card(page)).toContainText('每周日整理本周收获');await expect(card(page).locator('.katex')).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('即时编辑、双栏工具、源码互相同步，撤销重做回到对应正文',async({page})=>{
 await open(page);const field=await source(page);await field.fill(content);await page.getByRole('button',{name:'即时编辑',exact:true}).click();
 const editor=page.locator('.markdown-workspace [contenteditable=true]');await editor.locator('h1').click();await page.keyboard.press('End');await page.keyboard.type(' updated');await expect(editor.locator('h1')).toHaveText('学习方法 updated');
 await page.keyboard.press('Control+z');await expect(editor.locator('h1')).toHaveText('学习方法');await page.keyboard.press('Control+Shift+z');await expect(editor.locator('h1')).toHaveText('学习方法 updated');
 const next=await source(page);await expect(next).toContainText('# 学习方法 updated');await next.press('Control+/');await expect(editor).toBeVisible();await editor.locator('[data-column] p').first().click();
 await page.getByRole('button',{name:'切换双栏比例',exact:true}).click();await expect(editor.locator('[data-columns]')).toHaveAttribute('data-ratio','1:1');
});
test('未完成双栏不覆盖正文且阻止离页，补全后可关闭标签',async({page})=>{
 await open(page);const field=await source(page);await field.fill('安全正文');await field.fill(':::columns 3:2\n:::column\n尚未完成');
 await expect(page.locator('.markdown-source-error')).toContainText('双栏尚未结束');await page.getByRole('button',{name:'返回导图',exact:true}).click();await expect(field).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('尚未结束');await page.locator('.home-tab').click();await expect(field).toBeVisible();
 await field.fill('已补全正文');await page.getByRole('button',{name:'关闭 Markdown 勾股定理',exact:true}).click();await expect(page.locator('.markdown-workspace')).toHaveCount(0);await expect(card(page)).toContainText('已补全正文');
});
test('多个卡片的标签独立，切换导图与首页不会串改',async({page})=>{
 await open(page);await (await source(page)).fill('第一张卡片的独立正文');await page.getByRole('button',{name:'返回导图',exact:true}).click();
 const other=page.locator('.node-card').filter({has:page.getByText('三角函数',{exact:true})});await other.getByRole('button',{name:'全页编辑卡片',exact:true}).click();await (await source(page)).fill('第二张卡片的独立正文');
 await page.getByRole('button',{name:'切换 Markdown 勾股定理',exact:true}).click();await expect(page.locator('.markdown-workspace [contenteditable=true]')).toContainText('第一张卡片的独立正文');
 await page.locator('.home-tab').click();await expect(page.locator('.library-home')).toBeVisible();await page.getByRole('button',{name:'切换 Markdown 三角函数',exact:true}).click();await expect(page.locator('.markdown-workspace [contenteditable=true]')).toContainText('第二张卡片的独立正文');
});
test('源码输入法完成后提交，编辑长文可滚动，大纲可导航',async({page})=>{
 await open(page);const field=await source(page);await field.fill(content);await field.dispatchEvent('compositionstart');await field.fill(content+'\n\n输入法文字');
 await page.getByRole('button',{name:'返回导图',exact:true}).click();await expect(field).toBeVisible();await field.dispatchEvent('compositionend');await page.getByRole('button',{name:'即时编辑',exact:true}).click();
 const editor=page.locator('.markdown-workspace [contenteditable=true]');await expect(editor).toContainText('输入法文字');
 await editor.evaluate(el=>(el as any).editor.commands.setContent({type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'顶部'}]},...Array.from({length:65},(_,i)=>({type:'paragraph',content:[{type:'text',text:'长文段落 '+i}]})),{type:'heading',attrs:{level:2},content:[{type:'text',text:'末尾'}]}]}));
 await page.locator('.markdown-outline').getByRole('button',{name:'末尾',exact:true}).click();await expect(editor.locator('h2')).toBeInViewport();await page.screenshot({path:'test-results/markdown-workspace-long.png'});
 await page.getByRole('button',{name:'切换本文大纲',exact:true}).click();await expect(page.locator('.markdown-outline')).toHaveCount(0);
});
test('跨导图返回卡片标签，继续编辑的是原卡片',async({page})=>{
 await open(page);await (await source(page)).fill('跨导图之前的正文');await page.getByRole('button',{name:'新建思维导图',exact:true}).click();await expect(page.locator('.root-node')).toBeVisible();
 await page.getByRole('button',{name:'切换 Markdown 勾股定理',exact:true}).click();await expect(page.locator('.markdown-workspace [contenteditable=true]')).toContainText('跨导图之前的正文');
 await (await source(page)).fill('跨导图之后的正文');await page.getByRole('button',{name:'返回导图',exact:true}).click();await expect(card(page)).toContainText('跨导图之后的正文');
});
test('编辑导航合并到主导航栏，删除重复标题行且窄窗口不重叠',async({page})=>{
 await open(page);await (await source(page)).fill(content);await page.getByRole('button',{name:'即时编辑',exact:true}).click();
 await expect(page.locator('.markdown-workspace-bar,.markdown-breadcrumb')).toHaveCount(0);
 for(const width of [1440,1100,900]){
  await page.setViewportSize({width,height:920});
  await expect(page.locator('.topbar').getByRole('button',{name:'即时编辑',exact:true})).toBeVisible();
  const layout=await page.evaluate(()=>{
   const bounds=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect();
   const header=bounds('.topbar'),controls=bounds('.markdown-navigation-controls'),save=bounds('.save-indicator'),undo=bounds('.topbar [aria-label="撤销 Ctrl+Z"]'),format=bounds('.markdown-format-tools');
   return {height:header.height,extraRow:format.top-header.bottom,leftGap:controls.left-save.right,rightGap:undo.left-controls.right,overflow:document.documentElement.scrollWidth-innerWidth};
  });
  expect(layout.height).toBe(56);expect(Math.abs(layout.extraRow)).toBeLessThan(1);expect(layout.leftGap).toBeGreaterThanOrEqual(0);expect(layout.rightGap).toBeGreaterThanOrEqual(0);expect(layout.overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.markdown-workspace .editor-hint,.markdown-workspace-footer')).toHaveCount(0);
  expect(await page.locator('.markdown-workspace .tiptap').evaluate(el=>Math.abs(el.parentElement!.getBoundingClientRect().bottom-innerHeight))).toBeLessThan(1);
 }
 await page.locator('.topbar').getByRole('button',{name:'源码',exact:true}).click();await expect(page.getByRole('textbox',{name:'Markdown 源码'})).toContainText('学习方法');
 expect(await page.getByRole('textbox',{name:'Markdown 源码'}).evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight))).toBeLessThan(1);
 await page.locator('.topbar').getByRole('button',{name:'分屏',exact:true}).click();await expect(page.locator('.markdown-preview h1')).toHaveText('学习方法');
 expect(await page.locator('.markdown-preview').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight))).toBeLessThan(1);
 await page.locator('.topbar').getByRole('button',{name:'切换本文大纲'}).click();await expect(page.locator('.markdown-outline')).toHaveCount(0);
 await page.locator('.topbar').getByRole('button',{name:'返回导图',exact:true}).click();await expect(card(page)).toContainText('主动回忆');await expect(page.locator('.markdown-navigation-controls')).toHaveCount(0);
});
