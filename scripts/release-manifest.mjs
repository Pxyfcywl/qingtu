import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){const hash=crypto.createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
async function files(dir){const result=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){if(['target','gen','node_modules'].includes(item.name))continue;const file=path.join(dir,item.name);if(item.isDirectory())result.push(...await files(file));else if(item.isFile())result.push(file);}return result;}
async function writeChecksums(){const lines=[];for(const file of (await files('releases')).filter(f=>!f.endsWith('SHA256SUMS.txt')).sort())lines.push(await hashFile(file)+'  '+path.relative('releases',file).replaceAll('\\','/'));await fs.writeFile('releases/SHA256SUMS.txt',lines.join('\n')+'\n');}
if(process.argv.includes('--checksums-only')){await writeChecksums();console.log('Release file checksums refreshed; verification manifest unchanged.');process.exit(0);}
const rootArg=process.argv.indexOf('--source-root');
if(rootArg>=0&&(!process.argv[rootArg+1]||process.argv[rootArg+1].startsWith('--')))throw Error('Pass an explicit source snapshot directory');
const sourceRoot=path.resolve(rootArg>=0?process.argv[rootArg+1]:'.');
const version=JSON.parse(await fs.readFile(path.join(sourceRoot,'package.json'),'utf8')).version;
const sources=[...await files(path.join(sourceRoot,'src')),...await files(path.join(sourceRoot,'src-tauri')),...await files(path.join(sourceRoot,'public')),...['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html'].map(f=>path.join(sourceRoot,f))].sort();
const sourceFiles=[];for(const file of sources){const bytes=await fs.readFile(file);sourceFiles.push({path:path.relative(sourceRoot,file).replaceAll('\\','/'),bytes:bytes.length,sha256:digest(bytes)});}
const sourceSnapshotSha256=digest(Buffer.from(sourceFiles.map(f=>f.path+'\0'+f.sha256+'\n').join('')));
if(process.argv.includes('--fingerprint-only')){console.log(JSON.stringify({version,sourceSnapshotSha256,sourceFiles},null,2));process.exit(0);}
const verificationPath=`releases/验收证据-${version}/verification.json`;
const record=JSON.parse(await fs.readFile(verificationPath,'utf8'));
if(record.version!==version||record.sourceSnapshotSha256!==sourceSnapshotSha256)throw Error('Verification record does not match the current source/version');
if(typeof record.verification?.fullSpecificationGatesPassed!=='boolean')throw Error('Verification record must explicitly state whether all specification gates passed');
const artifacts=[];for(const file of [`releases/轻图-${version}-Windows-x64-安装.exe`,`releases/轻图-${version}-Windows-x64-离线安装.exe`,`.tooling/release-builds/${version}/qingtu.exe`,`.tooling/install-tests/tested-${version}-qingtu.exe`]){const stat=await fs.stat(file);artifacts.push({path:file.replaceAll('\\','/'),bytes:stat.size,mib:Math.round(stat.size/1048576*100)/100,sha256:await hashFile(file)});}
const tested=artifacts.find(a=>a.path.endsWith(`tested-${version}-qingtu.exe`));
if(record.installedExeSha256!==tested.sha256)throw Error('Verification record does not match the retained installed executable');
const build=artifacts.find(a=>a.path.startsWith('.tooling/release-builds/'));
let binaryComparison={identical:build.sha256===tested.sha256};
if(!binaryComparison.identical){
 const original=await fs.readFile(build.path),installed=await fs.readFile(tested.path);
 const unknown=Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK'),nsis=Buffer.from('__TAURI_BUNDLE_TYPE_VAR_NSS');
 const marker=original.indexOf(unknown);
 if(marker<0||original.indexOf(unknown,marker+1)>=0)throw Error('Missing or ambiguous Tauri bundle marker');
 const expected=Buffer.from(original);nsis.copy(expected,marker);
 if(!expected.equals(installed))throw Error('Installed executable differs beyond the expected Tauri NSIS bundle marker');
 binaryComparison={identical:false,onlyDifference:'Tauri bundle type marker UNK -> NSS',markerOffset:marker};
}
const manifest={product:'轻图',version,channel:record.verification.fullSpecificationGatesPassed?'desktop-release':'desktop-preview',platform:'Windows x64',createdAt:new Date().toISOString(),sourceSnapshotSha256,sourceSnapshotMethod:'SHA256 of sorted relative-path + NUL + per-file SHA256 + LF; no Git repository',sourceFiles,artifacts,verification:record.verification,verificationRecord:verificationPath,notes:['Small and offline installers contain the same application source; each artifact hash is listed separately.','The preserved production build is used because the shared target directory may contain a diagnostic build.','Test counts and scope come from the versioned source/executable-bound record, not hard-coded previous-release results.',...(record.notes??[])]};
try{const previous=await fs.readFile('releases/构建清单.json','utf8');const prior=JSON.parse(previous);if(prior.version!==version){const history=`releases/构建清单-${prior.version}.json`;try{await fs.writeFile(history,previous,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||await fs.readFile(history,'utf8')!==previous)throw error;}}}catch(error){if(error.code!=='ENOENT')throw error;}
manifest.productionToInstalledBinary=binaryComparison;
manifest.sourceOrigin=path.relative(process.cwd(),sourceRoot).replaceAll('\\','/')||'working-tree';
if(record.sourceArchive)manifest.sourceArchive=record.sourceArchive;
await fs.writeFile(`releases/构建清单-${version}.json`,JSON.stringify(manifest,null,2)+'\n');
if(!process.argv.includes('--versioned-only'))await fs.writeFile('releases/构建清单.json',JSON.stringify(manifest,null,2)+'\n');
await writeChecksums();
console.log(JSON.stringify({sourceSnapshotSha256,artifacts},null,2));
