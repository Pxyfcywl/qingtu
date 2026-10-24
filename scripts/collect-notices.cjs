const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const groups=new Map();const noText=[];
function collect(directory,label,license){
 const files=fs.readdirSync(directory,{withFileTypes:true}).filter(f=>f.isFile()&&/^(licen[sc]e|copying|notice|ofl)([-._]|$)/i.test(f.name));
 if(!files.length){noText.push(`${label} — ${license||'See original package metadata'}`);return;}
 for(const file of files){const text=fs.readFileSync(path.join(directory,file.name),'utf8');if(text.length>500000)continue;
  const hash=crypto.createHash('sha256').update(text).digest('hex');if(!groups.has(hash))groups.set(hash,{text,labels:[]});groups.get(hash).labels.push(label+' / '+file.name);
 }
}
for(const entry of fs.readdirSync('node_modules',{withFileTypes:true})){
 if(entry.name.startsWith('.'))continue;
 const directories=entry.name.startsWith('@')?fs.readdirSync(path.join('node_modules',entry.name)).map(name=>path.join('node_modules',entry.name,name)):[path.join('node_modules',entry.name)];
 for(const directory of directories){const file=path.join(directory,'package.json');if(!fs.existsSync(file))continue;const pkg=JSON.parse(fs.readFileSync(file,'utf8'));collect(directory,`npm ${pkg.name}@${pkg.version}`,pkg.license);}
}
const registries=fs.readdirSync('.tooling/cargo/registry/src').map(name=>path.join('.tooling/cargo/registry/src',name));
const lock=fs.readFileSync('src-tauri/Cargo.lock','utf8');
for(const section of lock.split('[[package]]').slice(1)){
 const name=section.match(/^name = "([^"]+)"/m)?.[1],version=section.match(/^version = "([^"]+)"/m)?.[1];if(!name||!version||name==='qingtu')continue;
 const dir=registries.map(root=>path.join(root,`${name}-${version}`)).find(p=>fs.existsSync(p));if(!dir)continue;
 const manifest=fs.readFileSync(path.join(dir,'Cargo.toml'),'utf8');collect(dir,`Rust ${name}@${version}`,manifest.match(/^license = "([^"]+)"/m)?.[1]);
}
let output='Qingtu — Third Party Notices\n\nThis distribution uses open source software. Notices below include runtime and build dependencies for completeness.\n\n';
for(const group of groups.values())output+='='.repeat(75)+'\n'+group.labels.join('\n')+'\n\n'+group.text+'\n\n';
output+='Packages with license metadata but no top-level notice file:\n'+noText.join('\n')+'\n';
fs.writeFileSync('public/third-party-notices.txt',output);fs.writeFileSync('releases/第三方许可.txt',output);console.log('Notices written:',Buffer.byteLength(output),'bytes;',groups.size,'distinct texts');
