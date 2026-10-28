const fs=require('node:fs'),path=require('node:path');
const [version,previous]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+$/.test(version??'')||!/^\d+\.\d+\.\d+$/.test(previous??'')||version===previous)throw Error('Pass new version and expected previous version');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.resolve('.tooling/config-backups',`markdown-${stamp}`),stage=path.resolve('.tooling/config-staging',`markdown-${stamp}`);
const files=['package.json','package-lock.json','src-tauri/tauri.conf.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock'];
for(const file of files){
 const original=path.resolve(file),saved=path.join(backup,file),copy=path.join(stage,file);
 fs.mkdirSync(path.dirname(saved),{recursive:true});fs.mkdirSync(path.dirname(copy),{recursive:true});fs.copyFileSync(original,saved);fs.copyFileSync(original,copy);
 let source=fs.readFileSync(copy,'utf8');
 if(file.endsWith('.json')){
  const value=JSON.parse(source);if(value.version!==previous)throw Error(`Unexpected version in ${file}`);value.version=version;
  if(file==='package-lock.json'){if(value.packages[''].version!==previous)throw Error('Lockfile root mismatch');value.packages[''].version=version;}
  source=JSON.stringify(value,null,2)+'\n';fs.writeFileSync(copy,source);if(JSON.parse(fs.readFileSync(copy,'utf8')).version!==version)throw Error('Staging verification failed');
 }else{
  const prefix=file.endsWith('.lock')?'(name = "qingtu"\\r?\\nversion = ")':'(\\[package\\]\\r?\\nname = "qingtu"\\r?\\nversion = ")';
  const match=new RegExp(prefix+previous.replaceAll('.','\\.')+'("\\r?\\n)');
  if(!match.test(source))throw Error(`Unexpected package version in ${file}`);source=source.replace(match,(_match,prefix,suffix)=>prefix+version+suffix);fs.writeFileSync(copy,source);
  if(!fs.readFileSync(copy,'utf8').includes(`version = "${version}"`))throw Error('Staging verification failed');
 }
}
for(const file of files)fs.renameSync(path.join(stage,file),path.resolve(file));
console.log(JSON.stringify({version,backup,checkedCopies:files}));
