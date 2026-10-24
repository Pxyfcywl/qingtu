import fs from 'node:fs/promises';
import path from 'node:path';
import {NativeSession,sleep} from './lib/native.mjs';
import {hashBytes} from './lib/content-fixture.mjs';
import {nodeHash,waitSaved} from './lib/soak-actions.mjs';
import {projectRejectionFixtures} from './lib/project-rejection-fixtures.mjs';
const app=path.resolve(process.env.QINGTU_TEST_APP??'.tooling/install-tests/0.1.2 验证安装/qingtu.exe');
const root=path.resolve('.tooling/project-rejections',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(root,{recursive:true});
const report={caseId:'T17-native-invalid-project-six-categories-three-each',status:'running',app,exeSha256:hashBytes(await fs.readFile(app)),samples:[],started:new Date().toISOString()};
const session=new NativeSession(process.env.QINGTU_DRIVER_URL??'http://127.0.0.1:4448');
const assert=(value,message)=>{if(!value)throw Error(message);};
async function inventory(library){
 const files=[];
 for(const folder of ['assets','thumbs'])for(const entry of await fs.readdir(path.join(library,folder),{withFileTypes:true})){
  assert(entry.isFile(),'Unexpected nested material directory');const file=path.join(library,folder,entry.name);files.push([folder+'/'+entry.name,hashBytes(await fs.readFile(file))]);
 }
 const stages=(await fs.readdir(library)).filter(n=>n.startsWith('.qingtu-import-')).sort();
 return {files:files.sort((a,b)=>a[0].localeCompare(b[0])),stages};
}
try{
 // Generate before opening: fixture compression and large staging writes never overlap resource tests.
 const fixtures=await projectRejectionFixtures(root);await session.open(app);await session.resizeViewport(1440,844);
 let info=await session.native('bootstrap');assert(info.initialized&&path.resolve(info.configPath).startsWith(path.resolve('.tooling')+path.sep),'Use isolated test configuration');
 report.configPath=info.configPath;report.browserVersion=session.capabilities.browserVersion;
 const control=await session.native('import_project',{path:fixtures.control});await session.native('delete_document',{id:control.id});report.validControl='accepted then deleted';
 if(info.recentId)await session.native('load_document',{id:info.recentId});await session.refresh();await waitSaved(session);await sleep(200);
 info=await session.native('bootstrap');const current=await session.native('load_document',{id:info.recentId}),beforeInventory=await inventory(info.storagePath);
 const title=await session.execute('return document.querySelector(".document-button")?.textContent;');
 for(const sample of fixtures.samples){
  // Follow the real application event -> import action -> native command -> visible error flow.
  await session.native('plugin:event|emit',{event:'open-project',payload:sample.file});
  const error=await session.waitFor('return document.querySelector("[role=alert]")?.textContent;',[],20000);
  assert(new RegExp(sample.expectedError,'i').test(error),'Wrong rejection for '+sample.category+': '+error);
  await session.waitFor('return !document.querySelector(".busy-overlay");');
  const after=await session.native('bootstrap'),loaded=await session.native('load_document',{id:current.id});
  const afterInventory=await inventory(info.storagePath),afterTitle=await session.execute('return document.querySelector(".document-button")?.textContent;');
  assert(JSON.stringify(after.documents)===JSON.stringify(info.documents)&&JSON.stringify(after.assets)===JSON.stringify(info.assets),'Partial database commit');
  assert(nodeHash(loaded)===nodeHash(current)&&loaded.revision===current.revision&&afterTitle===title,'Current document was changed');
  assert(JSON.stringify(afterInventory)===JSON.stringify(beforeInventory),'Import left material/staging changes');
  report.samples.push({...sample,status:'passed',error,currentDocumentUnchanged:true,libraryInventoryUnchanged:true});
  await session.click('.error-toast button');await session.waitFor('return !document.querySelector("[role=alert]");');
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await session.close();report.finished=new Date().toISOString();await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,...report},null,2));}
