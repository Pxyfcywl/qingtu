const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.QINGTU_SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname,'..');
const targets = [
 ['public/demo/triangle.png',480,360,`<rect width="480" height="360" rx="22" fill="#fafcfb"/><path d="M120 60V290H370Z" fill="#e7f4fa" stroke="#3f5c78" stroke-width="3"/><path d="M120 267H143V290" fill="none" stroke="#3f5c78" stroke-width="3"/><g font-family="Georgia" font-style="italic" font-size="32" fill="#20384d"><text x="88" y="180">a</text><text x="237" y="325">b</text><text x="270" y="156">c</text></g>`],
 ['public/demo/geometry.png',600,420,`<rect width="600" height="420" fill="#fcf7ed"/><g stroke="#6d776e" stroke-width="2"><path d="M235 210V330H355Z" fill="#fff"/><path d="M235 210L355 330L475 210L355 90Z" fill="#f5c4bb"/><path d="M115 210H235V330H115Z" fill="#c3dcc5"/><path d="M235 330H355V410H235Z" fill="#bfd8ec"/></g><g font-family="Georgia" font-size="33" fill="#33494b"><text x="156" y="279">a²</text><text x="278" y="380">b²</text><text x="350" y="219">c²</text></g><path d="M235 309H256V330" fill="none" stroke="#6d776e" stroke-width="2"/>`],
 ['src-tauri/icons/icon.png',256,256,`<rect width="256" height="256" rx="60" fill="#168c86"/><g fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"><path d="M72 128H126M126 128L177 67M126 128L177 189"/></g><g fill="#fff"><circle cx="64" cy="128" r="24"/><circle cx="184" cy="60" r="23"/><circle cx="184" cy="196" r="23"/></g>`],
];
(async()=>{
 for(const [file,w,h,content] of targets){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${content}</svg>`)).png().toFile(target);}
 const png=fs.readFileSync(path.join(root,'src-tauri/icons/icon.png'));
 const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
 fs.writeFileSync(path.join(root,'src-tauri/icons/icon.ico'),Buffer.concat([header,png]));
 console.log('Artwork and desktop icons created.');
})();
