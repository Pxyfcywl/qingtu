import {test as base} from '@playwright/test';
export {expect} from '@playwright/test';
export type {Page} from '@playwright/test';
// Existing editor regressions begin in an open demo. Production now begins at Home.
export const test=base.extend({page:async({page},use)=>{
  const openEditor=async()=>{
    await page.locator('.library-home,.root-node').first().waitFor();
    await page.waitForFunction(()=>!document.querySelector('.startup'));
    await page.evaluate(async()=>{
      const state=await import('/src/state.ts' as string);
      if(state.getState().doc)return;
      const library=state.getState().library;
      if(library?.documents.length){await state.openDocument(library.recentId??library.documents[0].id);}
      else{const {demoDocument}=await import('/src/seed.ts' as string);await state.activateDocument(demoDocument(),true);await state.refreshLibrary();}
    });
  };
  const goto=page.goto.bind(page),reload=page.reload.bind(page);
  page.goto=async(...args)=>{const response=await goto(...args);if(new URL(page.url()).pathname==='/')await openEditor();return response;};
  page.reload=async(...args)=>{const response=await reload(...args);if(new URL(page.url()).pathname==='/')await openEditor();return response;};
  await use(page);
}});
