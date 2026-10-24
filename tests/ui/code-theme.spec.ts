import {test,expect} from './legacy-fixture';
import type {Locator} from '@playwright/test';
const samples=[
 {language:'java',code:'// Java example\npublic class Hello {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n        int count = 42;\n    }\n}'},
 {language:'python',code:'# Python example\ndef hello(name):\n    count = 42\n    return "Hello, " + name'},
 {language:'javascript',code:'// JavaScript example\nfunction hello(name) {\n    const count = 42;\n    return "Hello, " + name;\n}'},
];
async function checkColors(pre:Locator){
 await expect(pre).toHaveCSS('background-color','rgb(30, 30, 30)');
 await expect(pre).toHaveCSS('color','rgb(212, 212, 212)');
 for(const [token,color]of [['keyword','86, 156, 214'],['string','206, 145, 120'],['number','181, 206, 168'],['comment','106, 153, 85']]){
  await expect(pre.locator('.hljs-'+token).first()).toHaveCSS('color',`rgb(${color})`);
 }
}
for(const sample of samples)test(`${sample.language} 代码在编辑、阅读和重载后使用 VS Code 风格配色`,async({page})=>{
 await page.goto('/');await page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})}).getByRole('button',{name:'编辑卡片正文'}).click();const area=page.locator('[contenteditable=true]');await expect(area).toBeVisible();
 await area.evaluate((element,sample)=>{
  const editor=(element as any).editor;editor.commands.setContent({type:'doc',content:[{type:'paragraph'}]});const clipboardData=new DataTransfer();clipboardData.setData('text/plain','```'+sample.language+'\n'+sample.code+'\n```');element.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
 },sample);
 await checkColors(area.locator('pre'));await expect(area.locator('pre')).toHaveText(sample.code);
 if(sample.language==='java')await expect(area.locator('.hljs-title.class_').first()).toHaveCSS('color','rgb(78, 201, 176)');
 else await expect(area.locator('.hljs-title.function_').first()).toHaveCSS('color','rgb(220, 220, 170)');
 await page.getByRole('button',{name:'完成编辑',exact:true}).click();const pre=page.locator(`.node-card pre[data-language="${sample.language}"]`);await checkColors(pre);await page.keyboard.press('Control+s');await page.reload();await checkColors(pre);await expect(pre).toHaveText(sample.code);
});
test('逐字输入 Java 围栏后回车创建代码块，输入时立即高亮',async({page})=>{
 await page.goto('/');await page.locator('.node-card').filter({has:page.getByText('勾股定理',{exact:true})}).getByRole('button',{name:'编辑卡片正文'}).click();const area=page.locator('[contenteditable=true]');await expect(area).toBeVisible();
 await area.evaluate(element=>(element as any).editor.commands.setContent({type:'doc',content:[{type:'paragraph'}]}));await area.locator('p').click();await area.pressSequentially('```java');await page.keyboard.press('Enter');await expect(area.locator('pre code')).toHaveAttribute('class',/language-java/);await page.keyboard.insertText(samples[0].code);await checkColors(area.locator('pre'));
});
