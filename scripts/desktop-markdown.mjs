import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NativeSession,sleep} from './lib/native.mjs';

const root=path.resolve('.tooling/markdown-fix',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(root,{recursive:true});
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/target/release/qingtu.exe');
const report={app,sha256:crypto.createHash('sha256').update(await fs.readFile(app)).digest('hex'),checks:[],status:'running'};
const check=(condition,message)=>{if(!condition)throw Error(message);report.checks.push(message);};
const env={...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4463','--native-port','9563','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env,windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4463');
try{
  await sleep(800);await session.open(app);
  let info=await session.native('bootstrap');check(!info.initialized,'独立测试配置，未连接用户资料库');
  await session.native('initialize_storage',{directory:path.join(root,'library')});await session.refresh();
  await session.waitFor('return !!document.querySelector(".node-card .card-body .katex");');
  await session.execute('Array.from(document.querySelectorAll(".node-card")).find(el=>el.textContent.includes("勾股定理")).querySelector("[aria-label=编辑卡片正文]").click();');
  await session.waitFor('return !!document.querySelector("[contenteditable=true]");');
  await session.execute('const el=document.querySelector("[contenteditable=true]");el.editor.commands.setContent({type:"doc",content:[{type:"paragraph"}]});el.editor.commands.focus("end");');
  const element=await session.request('POST',`/session/${session.id}/element`,{using:'css selector',value:'[contenteditable=true]'});
  await session.request('POST',`/session/${session.id}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:'$$x$$'});
  check(await session.waitFor('return document.querySelectorAll("[contenteditable=true] .math-block .katex").length===1;'),'真实 WebView2 键盘输入 $$x$$ 排版成功');
  // The input rule selects the new formula. Move to a fresh paragraph before
  // pasting, otherwise paste correctly replaces that selected formula.
  await session.request('POST',`/session/${session.id}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:'\uE015\uE010\uE007'});
  await sleep(900);
  const image=Array.from(await fs.readFile('public/demo/triangle.png'));
  await session.execute('const data=new DataTransfer();data.items.add(new File([new Uint8Array(arguments[0])],"截图.png",{type:"image/png"}));document.querySelector("[contenteditable=true]").dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));',[image]);
  check(await session.waitFor('const img=document.querySelector("[contenteditable=true] .editor-asset img");return img?.complete&&img.naturalWidth>0&&!document.querySelector(".busy-overlay");'),'图片粘贴经过二进制 IPC 导入资料库并显示');
  report.beforeFormulaPaste=await session.execute('return document.querySelector("[contenteditable=true]").editor.getJSON();');
  await session.execute('const el=document.querySelector("[contenteditable=true]");el.editor.commands.focus("end");const data=new DataTransfer();data.setData("text/plain",arguments[0]);el.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));',['前文 $a^2$\n$$\n\\frac{x}{y}\n$$ 后文']);
  check(await session.waitFor('return document.querySelectorAll("[contenteditable=true] .katex").length===3;'),'粘贴混合文本和多行 LaTeX 公式正确排版');
  await session.execute('document.querySelector("[contenteditable=true]").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
  await session.waitFor('return !document.querySelector("[contenteditable=true]")&&document.querySelector(".save-saved")?.textContent.includes("已保存");',[],15000);
  info=await session.native('bootstrap');const saved=await session.native('load_document',{id:info.recentId});
  const card=Object.values(saved.nodes).find(node=>node.title==='勾股定理');
  const body=JSON.stringify(card.body);check(body.includes('mathBlock')&&body.includes('mathInline')&&body.includes('assetImage'),'公式及图片引用已保存至 SQLite');
  const project=path.join(root,'图片公式.qmap');await session.native('export_project',{id:saved.id,path:project});
  const imported=await session.native('import_project',{path:project});
  check(JSON.stringify(imported.nodes)===JSON.stringify(saved.nodes),'项目导出导入保留全部公式和图片');
  await session.refresh();
  check(await session.waitFor('return document.querySelectorAll(".node-card .katex").length>=3&&Array.from(document.querySelectorAll(".node-card img")).some(img=>img.complete&&img.naturalWidth>0);'),'重新加载桌面窗口后公式和图片保持可见');
  check(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'桌面操作无错误提示');
  const screenshot=await session.request('GET',`/session/${session.id}/screenshot`);await fs.writeFile(path.join(root,'window.png'),Buffer.from(screenshot,'base64'));
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;
  if(session.id)report.diagnostics=await session.execute('const el=document.querySelector("[contenteditable=true]");return {body:el?.editor.getJSON(),html:el?.innerHTML,error:document.querySelector("[role=alert]")?.textContent};').catch(()=>null);
}
finally{
  await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportPath:path.join(root,'report.json')},null,2));
}
