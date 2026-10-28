import {test,expect,type Page} from './legacy-fixture';
const viewer=(page:Page)=>page.getByRole('dialog',{name:'Markdown 演示',exact:true});
async function prepare(page:Page,source:string){
 await page.goto('/');const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await card.getByRole('button',{name:'全页编辑卡片',exact:true}).click();await expect(page.locator('.markdown-workspace .tiptap')).toBeVisible();
 await page.getByRole('button',{name:'源码',exact:true}).click();await page.getByRole('textbox',{name:'Markdown 源码'}).fill(source);await expect(page.locator('.markdown-source-error')).toHaveCount(0);
}
async function play(page:Page){await page.getByRole('button',{name:'播放当前 Markdown',exact:true}).click();const dialog=viewer(page);await expect(dialog.locator('.presentation-slide')).toBeVisible({timeout:20000});return dialog;}
const sample='# Markdown 演示示例\n\n项目讨论与验收。\n\n## 任务一\n\n### 需求确认\n\n:::columns 3:2\n:::column\n明确使用要求与边界。\n\n- 设计可复现的验收用例\n- 依据证据判断交付结果\n:::column\n验证路径：\n\n1. 测试用例\n2. 生成动作\n3. 执行验证\n4. 结果评分\n:::\n\n## 图表\n\n```mermaid\nflowchart LR\n A[测试用例] --> B[生成动作] --> C[执行验证] --> D[结果评分]\n```\n\n$$\na^2+b^2=c^2\n$$\n\n## 任务二\n\n实施计划与交付安排。';

test('单卡片演示、标题路径、键盘翻页与目录，退出不改正文',async({page})=>{
 await prepare(page,sample);const before=await page.getByRole('textbox',{name:'Markdown 源码'}).inputValue();const dialog=await play(page);
 await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('Markdown 演示示例');await page.keyboard.press('ArrowRight');await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('任务一');await expect(dialog.locator('.presentation-slide-context')).toContainText('Markdown 演示示例');await expect(dialog.locator('.rich-columns')).toHaveCount(1);
 const body=dialog.locator('.presentation-slide-body');expect(await body.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 await page.screenshot({path:'test-results/presentation-columns.png'});await page.keyboard.press('End');await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('任务二');await page.keyboard.press('Home');await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('Markdown 演示示例');
 await dialog.getByRole('button',{name:'切换演示目录',exact:true}).click();await expect(dialog.locator('.presentation-directory')).toHaveCount(0);
 await dialog.getByRole('button',{name:'全屏',exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===document.documentElement)).toBe(true);await dialog.getByRole('button',{name:'退出全屏',exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Markdown 源码'})).toHaveValue(before);await expect(page.locator('.presentation-measure')).toHaveCount(0);
});
test('长正文和代码实际分页，标题继承且所有代码完整保留',async({page})=>{
 const code=Array.from({length:65},(_,i)=>'    console.log("line-'+i+'");').join('\n');
 await prepare(page,'# 演示\n\n## 长章节\n\n'+('这是一段必须完整保留的长正文，检查分页后的阅读连贯性。'.repeat(45))+'\n\n```javascript\n'+code+'\n```');const dialog=await play(page);
 const count=await dialog.locator('.presentation-directory>button').count();expect(count).toBeGreaterThan(4);let actual='';
 for(let index=1;index<count;index++){
  await dialog.locator('.presentation-directory>button').nth(index).click();await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('长章节');
  if(index>1)await expect(dialog.locator('.presentation-continuation')).toHaveText('续页');
  actual+=await dialog.locator('.presentation-slide-body pre code').allTextContents().then(parts=>parts.join(''));
  expect(await dialog.locator('.presentation-slide-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 }
 expect(actual).toBe(code);await page.keyboard.press('Escape');await expect(page.getByRole('alert')).toHaveCount(0);
});
test('双栏超长时可展开完整阅读，嵌套关闭不退出演示',async({page})=>{
 const left=Array.from({length:20},(_,i)=>'左侧段落 '+i+'，这段内容应当完整保留。').join('\n\n'),right=Array.from({length:20},(_,i)=>'右侧段落 '+i+'，这段内容应当完整保留。').join('\n\n');
 await prepare(page,'# 超长内容\n\n## 双栏\n\n:::columns 3:2\n:::column\n'+left+'\n:::column\n'+right+'\n:::');const dialog=await play(page);await page.keyboard.press('End');await expect(dialog.locator('.presentation-slide')).toHaveAttribute('data-oversize','true');
 await dialog.getByRole('button',{name:'展开长内容',exact:true}).click();const expanded=page.getByRole('dialog',{name:'完整演示内容',exact:true});await expect(expanded).toContainText('左侧段落 19');await expect(expanded).toContainText('右侧段落 19');await page.keyboard.press('Escape');await expect(expanded).toHaveCount(0);await expect(dialog).toBeVisible();await page.keyboard.press('Home');await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('超长内容');await page.keyboard.press('End');await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('双栏');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('图表和公式排版完成再分页，放大图表后回到当前页',async({page})=>{
 await prepare(page,sample);const dialog=await play(page);await dialog.locator('.presentation-directory>button').filter({hasText:'图表'}).first().click();await expect(dialog.locator('.diagram-surface svg')).toHaveCount(1);await expect(dialog.locator('.katex')).toHaveCount(1);
 expect(await dialog.locator('.presentation-slide-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);await dialog.getByRole('button',{name:'放大图表',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mermaid 图表预览'})).toBeVisible();await page.keyboard.press('Escape');await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('图表');
 await page.setViewportSize({width:900,height:640});await expect(dialog.locator('.presentation-directory')).toHaveCount(0);
 const bounds=await dialog.locator('.presentation-page-frame').boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(640);await page.screenshot({path:'test-results/presentation-small.png'});
});
test('无效源码不能开始演示，清空正文可播放标题页，关闭排版释放资源',async({page})=>{
 await prepare(page,'可保存的正文');const source=page.getByRole('textbox',{name:'Markdown 源码'});await source.fill(':::columns 3:2\n:::column\n未完成');await page.getByRole('button',{name:'播放当前 Markdown',exact:true}).click();await expect(viewer(page)).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('尚未结束');
 await source.fill('');const dialog=await play(page);await expect(dialog.locator('.presentation-slide-heading h1')).toHaveText('勾股定理');await expect(dialog.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await source.fill(sample);await page.getByRole('button',{name:'播放当前 Markdown',exact:true}).click();await viewer(page).getByRole('button',{name:'退出演示',exact:true}).click();await expect(page.locator('.presentation-measure')).toHaveCount(0);await expect(source).toBeVisible();
});
