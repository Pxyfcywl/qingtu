import {test,expect} from './legacy-fixture';

test('导出首次加载视口外公式时，等待排版完成再生成图片',async({page})=>{
 const base={kind:'text',title:'导出检查',body:{type:'doc',content:[{type:'paragraph'}]},side:'right',color:'teal',contentCollapsed:false,childrenCollapsed:false};
 const doc={id:'cold-formula-export',schemaVersion:1,title:'视口外公式',rootId:'cold-root',revision:1,layoutMode:'free',viewport:{x:150,y:200,zoom:1},updatedAt:0,nodes:{
  'cold-root':{...base,id:'cold-root',parentId:null,childIds:['cold-card'],position:{x:0,y:0}},
  'cold-card':{...base,id:'cold-card',kind:'card',parentId:'cold-root',childIds:[],title:'首次排版',position:{x:10000,y:0},preferredWidth:432,body:{type:'doc',content:[{type:'mathBlock',attrs:{latex:'a^2+b^2=c^2'}}]}}
 }};
 await page.addInitScript(doc=>{
  localStorage.setItem('qingtu-preview',JSON.stringify({docs:{[doc.id]:doc},assets:[]}));
  const audit={canvases:0,svgFormulas:-1};Reflect.set(window,'coldFormulaAudit',audit);
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args:unknown[]){
   const img=args[0];if(document.querySelector('.react-flow__viewport.exporting')&&img instanceof HTMLImageElement&&img.src.startsWith('data:image/svg+xml')){
    const comma=img.src.indexOf(','),xml=decodeURIComponent(img.src.slice(comma+1));audit.svgFormulas=new DOMParser().parseFromString(xml,'image/svg+xml').querySelectorAll('.katex').length;
   }
   return Reflect.apply(draw,this,args);
  };
  const blob=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(...args){if(document.querySelector('.react-flow__viewport.exporting'))audit.canvases++;return Reflect.apply(blob,this,args);};
 },doc);
 let release!:()=>void,requested=false;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/src/components/Formula.tsx*',async route=>{requested=true;await gate;await route.continue();});
 try{
  await page.goto('/');await expect(page.locator('.root-node')).toBeVisible();await expect(page.locator('[data-node-id="cold-card"]')).toHaveCount(0);expect(requested).toBe(false);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('qingtu-export-png',{detail:'cold-formula.png'})));
  await expect.poll(()=>requested).toBe(true);await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>Reflect.get(window,'coldFormulaAudit').canvases)).toBe(0);
  release();await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'coldFormulaAudit').canvases)).toBe(1);
  expect(await page.evaluate(()=>Reflect.get(window,'coldFormulaAudit').svgFormulas)).toBe(1);
 }finally{release();}
});
