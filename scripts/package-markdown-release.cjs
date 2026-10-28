const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version,dir=path.resolve('releases',version),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>{const source=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');return JSON.parse(source.slice(source.indexOf('{')));};
const source=read(path.join(dir,'源码指纹.json'));
const current=JSON.parse(execFileSync(process.execPath,['scripts/release-manifest.mjs','--fingerprint-only'],{encoding:'utf8'}));
if(current.sourceSnapshotSha256!==source.sourceSnapshotSha256)throw Error('Production source differs from frozen build source');
const unit=read(`.tooling/markdown-${version}-unit.json`),ui=read(`.tooling/markdown-${version}-ui.json`),focused=read(`.tooling/markdown-${version}-final-ui.json`),desktop=read(path.join(dir,'桌面验证.json'));
let regressionFollowUp;
if(ui.stats.unexpected&&version==='0.1.23'){
 const rerun=read(`.tooling/markdown-${version}-ui-rerun.json`),baseline=read(`.tooling/markdown-${version}-drag-baseline.json`),isolated=read(`.tooling/markdown-${version}-drag-final.json`);
 const cases=result=>{const rows=[];const walk=suite=>{for(const spec of suite.specs??[])for(const test of spec.tests??[])rows.push({key:spec.file+':'+spec.title,status:test.status,error:test.results.flatMap(result=>result.errors??[]).map(error=>error.message).join('\n')});for(const child of suite.suites??[])walk(child);};walk(result);return rows;};
 const follow=new Map(cases(rerun).map(test=>[test.key,test])),old=new Map(cases(baseline).map(test=>[test.key,test])),latest=new Map(cases(isolated).map(test=>[test.key,test]));
 const recovered=[],knownExisting=[];
 for(const test of cases(ui).filter(test=>test.status!=='expected')){
  const again=follow.get(test.key);
  if(again?.status==='expected'){recovered.push(test.key);continue;}
  const before=old.get(test.key),after=latest.get(test.key);
  if(test.key.startsWith('home-tabs-connect.spec.ts:向上拖线经过工具栏')&&before?.status==='unexpected'&&after?.status==='unexpected'&&before.error.includes('home-tabs-connect.spec.ts:59:139')&&after.error.includes('home-tabs-connect.spec.ts:59:139'))knownExisting.push(test.key);
  else throw Error('Unresolved regression: '+test.key);
 }
 if(recovered.length!==2||knownExisting.length!==1||rerun.stats.skipped||baseline.errors?.length||isolated.errors?.length)throw Error('Incomplete baseline comparison');
 regressionFollowUp={rerunStats:rerun.stats,recovered,knownExisting,baselineVersion:'0.1.22',baselineSourceSnapshotSha256:read('releases/0.1.22/源码指纹.json').sourceSnapshotSha256,baselineStats:baseline.stats,isolatedCurrentStats:isolated.stats,conclusion:'默认节点与视频用例复测通过；顶部拖线用例在 0.1.22 归档源码和本版均在相同断言超时，作为既有问题记录。完整回归并非全绿。'};
}
if(unit.numFailedTests||unit.numPassedTests!==64||ui.stats.unexpected&&!regressionFollowUp||ui.stats.skipped||ui.stats.flaky||ui.stats.expected+ui.stats.unexpected<95||focused.stats.unexpected||focused.stats.skipped||focused.stats.flaky||focused.stats.expected!==8||desktop.status!=='passed')throw Error('Verification is incomplete');
const binary=path.resolve('.tooling/target/release/qingtu.exe');
if(desktop.buildFlavor==='validation-debug'){if(!desktop.frontendComparison?.identical||hash(desktop.app)!==desktop.exeSha256)throw Error('Independent desktop verification does not match the checked frontend/binary');}
else if(hash(binary)!==desktop.exeSha256)throw Error('Final binary differs from desktop-tested executable');
const installerName=`轻图-${version}-Windows-x64-安装.exe`;
fs.copyFileSync(path.resolve(`.tooling/target/release/bundle/nsis/轻图_${version}_x64-setup.exe`),path.join(dir,installerName));
fs.copyFileSync(binary,path.join(dir,'qingtu.exe'));
fs.copyFileSync(`docs/release/${version}-install.md`,path.join(dir,'安装与更新.md'));
fs.copyFileSync('public/third-party-notices.txt',path.join(dir,'第三方许可.txt'));
const update=path.resolve(`.tooling/release-candidates/markdown-${version}-update`);fs.mkdirSync(update,{recursive:true});
const script=fs.readFileSync('releases/0.1.19/覆盖更新.ps1','utf8').replace(/^\uFEFF/,'').replaceAll('0.1.19',version);
if(!script.includes(installerName))throw Error('Update installer filename mismatch');
fs.writeFileSync(path.join(update,'update.ps1'),'\uFEFF'+script);
fs.writeFileSync(path.join(update,'覆盖更新.cmd'),'@echo off\r\nsetlocal\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0update.ps1"\r\npause\r\nendlocal\r\n','ascii');
for(const file of [installerName,'安装与更新.md','第三方许可.txt','Markdown全页编辑体验.qmap'])fs.copyFileSync(path.join(dir,file),path.join(update,file));
fs.copyFileSync(`.tooling/markdown-${version}-unit.json`,path.join(dir,'单元测试.json'));
fs.copyFileSync(`.tooling/markdown-${version}-ui.json`,path.join(dir,'完整界面回归.json'));
fs.copyFileSync(`.tooling/markdown-${version}-final-ui.json`,path.join(dir,'全页编辑复测.json'));
if(regressionFollowUp){
 for(const [suffix,name]of [['ui-rerun','界面失败复测.json'],['drag-baseline','旧版拖线基线.json'],['drag-final','本版拖线对照.json']])fs.copyFileSync(`.tooling/markdown-${version}-${suffix}.json`,path.join(dir,name));
 fs.writeFileSync(path.join(dir,'回归复测说明.json'),JSON.stringify(regressionFollowUp,null,2)+'\n');
}
const record={version,date:'2026-10-28',distribution:'local-only; not published to GitHub',sourceSnapshotSha256:source.sourceSnapshotSha256,build:{command:'npm run tauri -- build --bundles nsis --config src-tauri/tauri.tools.conf.json',status:'passed',productionExeSha256:hash(binary)},unit:{passed:unit.numPassedTests,failed:unit.numFailedTests},fullUI:ui.stats,finalFeatureUI:focused.stats,desktop:{status:desktop.status,buildFlavor:desktop.buildFlavor,exeSha256:desktop.exeSha256,frontendComparison:desktop.frontendComparison,checks:desktop.checks,windowLayout:desktop.windowLayout,minimumWindow:desktop.minimumWindow},installer:{file:installerName,bytes:fs.statSync(path.join(dir,installerName)).size,sha256:hash(path.join(dir,installerName))},limits:['用户原程序仍在运行，本次桌面验证使用独立应用标识的调试构建；其前端资源与正式构建逐项 SHA256 一致。未在用户原程序目录执行安装。','本次包含现有全部浏览器用例与新增功能复测，不代表干净系统安装、全部长期性能和内存验收已完成。','源码模式通过扩展语法与保留块表示双栏、本地媒体和复杂格式，未承诺完整兼容 Typora 全部语法。']};
if(regressionFollowUp){record.regressionFollowUp=regressionFollowUp;record.limits.push('完整界面回归存在 1 项已在旧版同样复现的拖线自动化断言超时；请参阅回归复测说明，不应解读为全部界面用例通过。');}
fs.writeFileSync(path.join(dir,'验证记录.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({version,installer:path.join(dir,installerName),updateStaging:update,source:source.sourceSnapshotSha256,desktopChecks:desktop.checks.length}));
