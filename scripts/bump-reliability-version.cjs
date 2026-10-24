const fs=require('node:fs');
const version='0.1.1',entries=['package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json'];
const staged=[];
for(const file of entries){
 const copy=file+'.version-next',backup='.tooling/config-backups/'+file.replaceAll('/','_')+'.before-0.1.1';
 if(fs.existsSync(backup))throw Error('Backup already exists: '+backup);fs.copyFileSync(file,copy);
 let text=fs.readFileSync(copy,'utf8');
 if(file.endsWith('.json')){const data=JSON.parse(text);if(data.version!=='0.1.0')throw Error('Unexpected source version');data.version=version;if(file==='package-lock.json')data.packages[''].version=version;text=JSON.stringify(data,null,2)+'\n';JSON.parse(text);}
 else{const marker=file.endsWith('Cargo.lock')?'name = "qingtu"\nversion = "0.1.0"':'version = "0.1.0"';if(!text.includes(marker))throw Error('Unexpected Cargo source version');text=text.replace(marker,marker.replace('0.1.0',version));}
 fs.writeFileSync(copy,text);if(!fs.readFileSync(copy,'utf8').includes(version))throw Error('Staged version validation failed');staged.push({file,copy,backup});
}
for(const {file,copy,backup}of staged){fs.renameSync(file,backup);fs.renameSync(copy,file);}
console.log('Version 0.1.1 staged, checked and installed; originals backed up.');
