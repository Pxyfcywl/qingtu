import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page){
  await page.goto('/');await expect(page.locator('.library-home')).toBeVisible();
  return page.evaluate(async()=>{
    const state=await import('/src/state.ts' as string),tree=await import('/src/domain/tree.ts' as string);
    const first=tree.newDocument('待删除导图'),other=tree.newDocument('保留的导图');await state.activateDocument(first,true);await state.activateDocument(other,true);await state.refreshLibrary();
    await state.updateWorkspace((w:any)=>{w.folders.push({id:'folder',name:'论文'});w.documentFolders[first.id]='folder';});await state.showHome();return first.id;
  });
}
test('右键删除必须二次确认，取消和 Esc 均保留导图，默认焦点在取消',async({page})=>{
  await fixture(page);const row=page.locator('.library-table-row').filter({hasText:'待删除导图'});
  await row.click({button:'right'});await expect(page.getByRole('menu',{name:'思维导图操作'})).toBeVisible();await page.getByRole('menuitem',{name:'删除思维导图',exact:true}).click();
  const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('待删除导图');await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();await expect(page.locator('.library-table-row')).toHaveCount(2);await expect(page.locator('.document-tab')).toHaveCount(2);
  await page.screenshot({path:'test-results/0.1.13-删除确认.png'});await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row).toBeVisible();
  await page.getByRole('button',{name:'删除思维导图 待删除导图',exact:true}).click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await page.reload();await expect(row).toBeVisible();await expect(page.locator('.document-tab')).toHaveCount(2);
});
test('确认删除后移除列表、文件夹归属和标签，重启保持且另一张导图可打开',async({page})=>{
  const id=await fixture(page);await page.getByRole('button',{name:/论文/}).click();await page.getByRole('button',{name:'删除思维导图 待删除导图',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.locator('.library-table-row')).toHaveCount(0);await expect(page.locator('.document-tab')).toHaveCount(1);
  expect(await page.evaluate(id=>{const value=JSON.parse(localStorage.getItem('qingtu-preview')!);return {document:!!value.docs[id],folder:!!value.workspace.documentFolders[id],tab:value.workspace.openIds.includes(id)};},id)).toEqual({document:false,folder:false,tab:false});
  await page.reload();await expect(page.locator('.library-table-row')).toHaveCount(1);await expect(page.locator('.document-tab')).toHaveCount(1);await page.getByRole('button',{name:'切换到 保留的导图',exact:true}).click();await expect(page.locator('.root-node')).toContainText('保留的导图');
});
test('存储删除失败时保留导图、标签和确认框，可以取消后重试',async({page})=>{
  await fixture(page);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='qingtu-preview')throw new DOMException('模拟磁盘写入失败','QuotaExceededError');return original.call(this,key,value);};});
  await page.getByRole('button',{name:'删除思维导图 待删除导图',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByRole('alert')).toContainText('模拟磁盘写入失败');await expect(page.getByRole('alertdialog')).toBeVisible();await expect(page.locator('.library-table-row')).toHaveCount(2);await expect(page.locator('.document-tab')).toHaveCount(2);await page.getByRole('button',{name:'取消',exact:true}).click();await page.reload();await expect(page.locator('.library-table-row')).toHaveCount(2);
});
