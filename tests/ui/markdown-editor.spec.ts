import {test,expect,type Page} from './legacy-fixture';

async function openEditor(page:Page){
  await page.goto('/');await expect(page.getByText('勾股定理',{exact:true})).toBeVisible();
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await card.getByRole('button',{name:'编辑卡片正文'}).click();
  const editor=page.locator('[contenteditable=true]');await expect(editor).toBeVisible();
  await editor.evaluate(el=>(el as any).editor.commands.setContent({type:'doc',content:[{type:'paragraph'}]}));return editor;
}
async function paste(page:Page,text:string,html=''){
  await page.locator('[contenteditable=true]').evaluate((el,{text,html})=>{const data=new DataTransfer();data.setData('text/plain',text);if(html)data.setData('text/html',html);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},{text,html});
}

test('逐字输入 $$x$$ 和行内公式，在编辑及完成后均排版',async({page})=>{
  const editor=await openEditor(page);await editor.pressSequentially('$$x$$');
  await expect(editor.locator('.math-block .katex')).toHaveCount(1);
  await editor.press('ArrowDown');await editor.press('End');await editor.press('Enter');await editor.pressSequentially('text $y^2$ end');
  await expect(editor.locator('.math-inline .katex')).toHaveCount(1);
  await editor.press('Escape');await expect(editor).toHaveCount(0);
  const body=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});
  await expect(body.locator('.math-block .katex')).toHaveCount(1);await expect(body.locator('.math-inline .katex')).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('粘贴混合文本和多行公式，保存重载及复制仍保留源码',async({page})=>{
  const editor=await openEditor(page);await paste(page,'说明 $a^2+b^2$\n$$\n\\frac{x}{y}=z\n$$\n结尾 \\(c\\)');
  await expect(editor.locator('.katex')).toHaveCount(3);await expect(editor).toContainText('结尾');
  const copied=await editor.evaluate(el=>{const tiptap=(el as any).editor;return tiptap.getText();});
  expect(copied).toContain('$a^2+b^2$');expect(copied).toContain('\\frac{x}{y}=z');
  await editor.press('Control+s');await page.reload();
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card.locator('.katex')).toHaveCount(3);await card.getByRole('button',{name:'编辑卡片正文'}).click();await expect(page.locator('[contenteditable=true] .katex')).toHaveCount(3);
});
test('从 KaTeX 网页复制公式去掉重复字形并保留粗体',async({page})=>{
  const editor=await openEditor(page);
  await paste(page,'重复字形不应出现','<p><strong>说明</strong><span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">重复字形</span></span> 后文 $y$</p><span class="katex-display"><span class="katex"><math><semantics><annotation encoding="application/x-tex">\\frac{1}{2}</annotation></semantics></math></span></span>');
  await expect(editor.locator('.katex')).toHaveCount(3);await expect(editor.locator('strong')).toHaveText('说明');await expect(editor).not.toContainText('重复字形');await expect(editor.locator('.math-block')).toHaveCount(1);
});
test('内部复制粘贴保留公式源码和图片素材 ID',async({page})=>{
  const editor=await openEditor(page);
  await paste(page,'','<span data-mathblock data-latex="a^2">a^2</span><p><span data-mathinline data-latex="b">b</span></p><div data-asset-image data-asset-id="builtin:triangle" data-alt="三角形">图片</div>');
  await expect(editor.locator('.katex')).toHaveCount(2);await expect(editor.locator('.editor-asset img')).toHaveAttribute('src',/triangle.png$/);await expect(editor.locator('.editor-asset img')).toHaveAttribute('alt','三角形');
});
test('代码及转义公式保持原文，HTML 中美元公式可以转换',async({page})=>{
  const editor=await openEditor(page);await paste(page,'','<pre><code>$$code$$</code></pre><p><code>$literal$</code> \\$escaped$ 和 $$z$$</p>');
  await expect(editor.locator('pre')).toContainText('$$code$$');await expect(editor.locator('p code')).toHaveText('$literal$');await expect(editor).toContainText('\\$escaped$');await expect(editor.locator('.katex')).toHaveCount(1);
});
test('截图可粘贴、撤销重做，保存重载后图片仍显示',async({page})=>{
  const editor=await openEditor(page);await editor.pressSequentially('图片前');
  await page.waitForTimeout(850);
  await editor.evaluate(async el=>{const bytes=await (await fetch('/demo/triangle.png')).blob();const data=new DataTransfer();data.items.add(new File([bytes],'截图.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect(editor.locator('.editor-asset img')).toHaveCount(1);await expect.poll(()=>editor.locator('.editor-asset img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);await page.waitForTimeout(850);
  await editor.press('Control+z');await expect(editor.locator('.editor-asset img')).toHaveCount(0);await expect(editor).toContainText('图片前');
  await editor.press('Control+Shift+z');await expect(editor.locator('.editor-asset img')).toHaveCount(1);
  await editor.press('Control+s');await page.reload();
  const card=page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})});await expect(card.locator('.asset-image')).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('超过大小限制的粘贴图片给出错误并保留正文',async({page})=>{
  const editor=await openEditor(page);await editor.pressSequentially('保留正文');
  await editor.evaluate(el=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(10*1024*1024+1)],'过大.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect(page.getByRole('alert')).toContainText('10 MiB');await expect(editor).toContainText('保留正文');await expect(editor.locator('img')).toHaveCount(0);await expect(page.locator('.busy-overlay')).toHaveCount(0);
});
