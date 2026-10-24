import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const evidence='releases/验收证据-0.1.1';await fs.mkdir(evidence,{recursive:true});
const copies=[
 ['.tooling/draft-unit-tests.log','前端单测16项.txt'],['.tooling/rust-thumbnails.log','存储恢复18项.txt'],['.tooling/draft-ui-tests.log','界面流程5项.txt'],
 ['.tooling/release-tests/functional.json','安装版功能.json'],['.tooling/release-tests/snapshot-export.json','未保存快照导出.json'],
 ['.tooling/benchmark-native/close-drafts.json','焦点草稿关闭10次.json'],['.tooling/benchmark-native/desktop-integrations.json','单实例与文件关联.json'],
 ['.tooling/benchmark-native/startup-S-final/result.json','S热重启20次.json'],['.tooling/benchmark-native/startup-M-final/result.json','M热重启20次.json'],
 ['.tooling/benchmark-native/project-roundtrip.json','M项目往返20次.json'],['.tooling/benchmark-native/migration.json','资料库迁移.json'],
 ['.tooling/benchmark-native/prepare.json','真实媒体与缩略图.json'],['.tooling/benchmark-native/environment.json','环境.json'],['.tooling/benchmark-native/bundle-sizes.json','JS产物体积.json'],
 ['.tooling/install-tests/install-final-0.1.1.json','安装结果.json'],['.tooling/install-tests/association-regression.json','安装卸载关联回归.json']
];
for(const [source,name]of copies)await fs.copyFile(source,path.join(evidence,name));
await fs.cp('.tooling/fault-tests',path.join(evidence,'强制中断'),{recursive:true});
const rows=['workload,run,metric,milliseconds'];
for(const name of ['S','M']){const r=JSON.parse(await fs.readFile(`.tooling/benchmark-native/startup-${name}-final/result.json`,'utf8'));for(const s of r.Samples)rows.push(`${name},${s.Run},warm_startup,${s.Milliseconds}`);}
const project=JSON.parse(await fs.readFile('.tooling/benchmark-native/project-roundtrip.json','utf8'));for(const s of project.samples){rows.push(`M,${s.run},project_export,${s.exportMs}`);rows.push(`M,${s.run},project_import,${s.importMs}`);}
await fs.writeFile(path.join(evidence,'性能原始样本.csv'),rows.join('\n')+'\n');
const base='validation/fixtures/0.1.1';await fs.mkdir(base,{recursive:true});
async function copyFrozen(source,destination){
 try{await fs.access(destination);throw Error('Frozen archive already exists: '+destination);}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.cp(source,destination,{recursive:true,errorOnExist:true,force:false});
}
await copyFrozen('.tooling/fixtures/media-target',path.join(base,'media'));
await copyFrozen('.tooling/fixtures/documents',path.join(base,'documents'));
await fs.mkdir(path.join(base,'native'),{recursive:true});
for(const name of ['S','M','L','M-expanded','L-expanded'])await fs.copyFile(`.tooling/benchmark-native/loaded-${name}.json`,path.join(base,'native',name+'.json'));
await fs.copyFile('.tooling/benchmark-native/M 完整项目 往返.qmap',path.join(base,'M完整项目.qmap'));
const checks=[];async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else{const bytes=await fs.readFile(file);checks.push({path:path.relative(base,file).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
await walk(base);await fs.writeFile(path.join(base,'checksums.json'),JSON.stringify({version:'0.1.1',createdAt:new Date().toISOString(),files:checks},null,2));
await fs.mkdir('validation/screenshots/0.1.1',{recursive:true});
await fs.copyFile('.tooling/release-tests/release-window.png','validation/screenshots/0.1.1/桌面.png');
await fs.copyFile('.tooling/release-tests/导图 导出.png','validation/screenshots/0.1.1/导出.png');
console.log({evidenceFiles:copies.length,performanceRows:rows.length-1,frozenFiles:checks.length});
