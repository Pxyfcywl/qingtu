import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {NativeSession,sleep} from './lib/native.mjs';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const root=path.resolve('.tooling/default-node',new Date().toISOString().replace(/[:.]/g,'-'));
const app=path.join(root,'app/qingtu.exe'),newApp=path.resolve('.tooling/target/release/qingtu.exe');
await fs.mkdir(path.dirname(app),{recursive:true});
await fs.copyFile('releases/Markdown修复版-2026-10-20/qingtu.exe',app);
const report={status:'running',checks:[],oldSha256:hash(await fs.readFile(app)),newSha256:hash(await fs.readFile(newApp)),root};
const check=(value,label)=>{if(!value)throw Error(label);report.checks.push(label);};
const driver=spawn(path.resolve('.tooling/webdriver/bin/tauri-driver.exe'),['--port','4464','--native-port','9564','--native-driver',path.resolve('.tooling/edgedriver/msedgedriver.exe')],{env:{...process.env,QINGTU_CONFIG_DIR:path.join(root,'config')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const session=new NativeSession('http://127.0.0.1:4464');
const checkbox='input[aria-label="优先新增：内容卡片（Markdown）"]';
try{
  await sleep(800);await session.open(app);
  await session.native('initialize_storage',{directory:path.join(root,'library')});await session.refresh();
  await session.waitFor('return !!document.querySelector(".node-card .katex");');
  const oldInfo=await session.native('bootstrap'),original=await session.native('load_document',{id:oldInfo.recentId});
  const assets=oldInfo.assets;
  await session.close();await sleep(300);
  // Upgrade a private executable in place, preserving the old executable and
  // using exactly the same configuration and library for both versions.
  await fs.copyFile(newApp,app+'.next');check(hash(await fs.readFile(app+'.next'))===report.newSha256,'新版副本替换前哈希校验通过');
  await fs.rename(app,app+'.previous');await fs.rename(app+'.next',app);
  await session.open(app);await session.waitFor('return !!document.querySelector(".root-node");');
  let info=await session.native('bootstrap');
  check(info.initialized&&info.storagePath===oldInfo.storagePath,'原位覆盖程序后自动使用原资料库位置');
  const upgraded=await session.native('load_document',{id:original.id});
  check(isDeepStrictEqual(upgraded.nodes,original.nodes),'0.1.7 到 0.1.8 保留全部旧节点及正文');
  check(isDeepStrictEqual(info.assets,assets),'覆盖更新保留图片和视频素材记录');
  for(const asset of assets)check(await fs.readFile(path.join(root,'library',asset.relativePath)).then(bytes=>hash(bytes)===asset.sha256),'覆盖更新保留素材文件 '+asset.name);
  await session.click('[aria-label="节点属性"]');await session.waitFor('return !!document.querySelector(arguments[0]);',[checkbox]);await session.click(checkbox);
  await session.waitFor('const input=document.querySelector(arguments[0]);return input?.checked&&!input.disabled;',[checkbox]);
  info=await session.native('bootstrap');check(info.defaultNodeKind==='card','勾选 Markdown 卡片通过桌面 IPC 持久保存偏好');
  check(isDeepStrictEqual((await session.native('load_document',{id:original.id})).nodes,original.nodes),'设置默认类型不会修改已有节点');
  await session.click('[aria-label="关闭节点属性"]');await session.click('.root-node .node-label');
  await session.execute('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));');
  check(await session.waitFor('return !!document.querySelector(".node-card input[aria-label=节点标题]");'),'桌面 Tab 新增 Markdown 卡片');
  await session.execute('document.querySelector("input[aria-label=节点标题]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));');
  await session.waitFor('return !document.querySelector("input[aria-label=节点标题]")&&!!document.querySelector(".save-saved");');
  await session.click('.root-node .node-label');await session.click('.root-node [aria-label="添加子节点"]');
  check(await session.waitFor('return !!document.querySelector(".node-card.is-selected input[aria-label=节点标题]");'),'节点旁＋新增默认卡片并选中新节点');
  await session.execute('document.querySelector("input[aria-label=节点标题]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));');
  await session.waitFor('return !document.querySelector("input[aria-label=节点标题]")&&!!document.querySelector(".save-saved");');
  await session.close();await sleep(300);await session.open(app);await session.waitFor('return !!document.querySelector(".document-button")&&!document.querySelector(".startup");');
  info=await session.native('bootstrap');check(info.defaultNodeKind==='card','完全退出并重启后仍记住默认 Markdown 类型');
  const after=await session.native('load_document',{id:original.id});
  check(Object.values(after.nodes).filter(node=>node.kind==='card').length===Object.values(original.nodes).filter(node=>node.kind==='card').length+2,'重启后两次新增的卡片均已保存');
  await session.click('[aria-label="设置"]');await session.waitFor('return !!document.querySelector(arguments[0]);',[checkbox]);
  check(await session.execute('return document.querySelector(arguments[0]).checked;',[checkbox]),'设置窗口和节点属性使用同一默认偏好');
  const screenshot=await session.request('GET',`/session/${session.id}/screenshot`);await fs.writeFile(path.join(root,'preferences.png'),Buffer.from(screenshot,'base64'));
  await session.click(checkbox);await session.waitFor('const input=document.querySelector(arguments[0]);return !input.checked&&!input.disabled;',[checkbox]);
  check((await session.native('bootstrap')).defaultNodeKind===null,'取消默认勾选可持久保存');
  check(!(await session.execute('return document.querySelector("[role=alert]")?.textContent;')),'桌面操作无错误提示');report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await session.close();driver.kill();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportPath:path.join(root,'report.json')},null,2));}
