const fs=require('node:fs');
fs.mkdirSync('.tooling/dependency-update',{recursive:true});
fs.copyFileSync('package.json','.tooling/dependency-update/package.json');
fs.copyFileSync('package-lock.json','.tooling/dependency-update/package-lock.json');
const file='.tooling/dependency-update/package.json';const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
pkg.dependencies['@tiptap/pm']=JSON.parse(fs.readFileSync('node_modules/@tiptap/pm/package.json','utf8')).version;
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n');
console.log('Dependency update staged in isolated configuration copies.');
