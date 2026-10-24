import {test,expect} from './legacy-fixture';

test('PNG 资源编码缓存可在每次导出结束后释放',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const module=await import('/src/vendor/html-to-image/dataurl.js' as string),original=window.fetch;let requests=0;
  const url='/demo/triangle.png?export-cache-audit';
  window.fetch=(...args)=>{if(String(args[0]).includes('export-cache-audit'))requests++;return original(...args);};
  try{
   module.clearResourceCache();const first=await module.resourceToDataURL(url,'image/png',{}),second=await module.resourceToDataURL(url,'image/png',{}),beforeClear=requests;
   module.clearResourceCache();const third=await module.resourceToDataURL(url,'image/png',{});
   return {first,second,third,beforeClear,afterClear:requests};
  }finally{module.clearResourceCache();window.fetch=original;}
 });
 expect(result.first).toMatch(/^data:image\/png;base64,/);expect(result.second).toBe(result.first);expect(result.third).toBe(result.first);expect(result.beforeClear).toBe(1);expect(result.afterClear).toBe(2);
});
