const fs=require('node:fs');
const version=process.argv[2];if(!/^\d+\.\d+\.\d+$/.test(version??''))throw Error('Pass an explicit x.y.z version');
const previous=JSON.parse(fs.readFileSync('package.json','utf8')).version;
if(previous===version)throw Error('Version already applied');
const staged=[];
for(const file of ['package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json']){
 const copy=file+'.version-next',backup='.tooling/config-backups/'+file.replaceAll('/','_')+'.before-'+version;
 if(fs.existsSync(backup))throw Error('Backup already exists: '+backup);fs.copyFileSync(file,copy);let content=fs.readFileSync(copy,'utf8');
 if(file.endsWith('.json')){const data=JSON.parse(content);if(data.version!==previous)throw Error('Version mismatch');data.version=version;if(file==='package-lock.json')data.packages[''].version=version;content=JSON.stringify(data,null,2)+'\n';}
 else{const marker=file.endsWith('Cargo.lock')?`name = "qingtu"\nversion = "${previous}"`:`version = "${previous}"`;if(!content.includes(marker))throw Error('Cargo version mismatch');content=content.replace(marker,marker.replace(previous,version));}
 fs.writeFileSync(copy,content);if(!fs.readFileSync(copy,'utf8').includes(version))throw Error('Staged version validation failed');staged.push({file,copy,backup});
}
for(const {file,copy,backup}of staged){fs.renameSync(file,backup);fs.renameSync(copy,file);}console.log(previous+' -> '+version+'; checked copies and backups retained.');
