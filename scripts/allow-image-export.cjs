const fs=require('node:fs');
const original='src-tauri/tauri.conf.json',copy='src-tauri/tauri.conf.next.json';
fs.copyFileSync(original,copy);
const config=JSON.parse(fs.readFileSync(copy,'utf8'));
config.app.security.csp=config.app.security.csp.replace("connect-src ipc: http://ipc.localhost 'self'", "connect-src ipc: http://ipc.localhost 'self' asset: http://asset.localhost");
fs.writeFileSync(copy,JSON.stringify(config,null,2)+'\n');JSON.parse(fs.readFileSync(copy,'utf8'));
fs.renameSync(original,'.tooling/config-backups/tauri.conf.v1.json');fs.renameSync(copy,original);
console.log('Local asset fetch permission configured through a checked copy.');
