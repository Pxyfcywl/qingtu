import fs from 'node:fs/promises';
import path from 'node:path';
import {contentDocument,paragraph,hashBytes} from './content-fixture.mjs';
import {writeFixtureZip} from './zip-fixture.mjs';
export async function projectRejectionFixtures(root){
 const samples=[],image=await fs.readFile('public/demo/triangle.png'),id=hashBytes(image);
 const asset={id,sha256:id,mime:'image/png',byteSize:image.length,width:image.readUInt32BE(16),height:image.readUInt32BE(20),relativePath:`assets/${id}.png`,name:'triangle.png'};
 async function add(category,index,{doc=contentDocument('坏项目 '+category,{type:'doc',content:[paragraph('原始内容')]}),assets=[],extra=[],manifestVersion=1,documentHash,error}={}){
  const bytes=Buffer.from(JSON.stringify(doc)),manifest={schemaVersion:manifestVersion,documentHash:documentHash??hashBytes(bytes),assets};
  const file=path.join(root,`${category}-${index}.qmap`);
  await writeFixtureZip(file,[{name:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest))},{name:'document.json',bytes},...extra]);
  samples.push({category,index,file,sha256:hashBytes(await fs.readFile(file)),expectedError:error});
 }
 for(let i=1;i<=3;i++){
  const doc=contentDocument('缺失媒体 '+i,{type:'doc',content:[{type:'assetImage',attrs:{assetId:id}}]});
  await add('missing-media',i,{doc,assets:i===1?[]:[{...asset,...(i===3?{thumbnailPath:`thumbs/${id}.png`}:{})}],extra:i===3?[{name:asset.relativePath,bytes:image}]:[],error:'缺少引用素材|找不到|cannot find|No such file'});
  await add('bad-hash',i,i===1?{documentHash:'0'.repeat(64),error:'哈希'}:{doc,assets:[asset],extra:[{name:asset.relativePath,bytes:Buffer.concat([image,Buffer.from('tampered-'+i)])}],error:'哈希'});
  const entry=['../qingtu-escape.png','/qingtu-escape.png','assets\\qingtu-escape.png'][i-1];
  await add('illegal-path',i,{extra:[{name:entry,bytes:Buffer.from('canary')}],error:'非法路径'});
  const deep=contentDocument('超深树 '+i,{type:'doc',content:[paragraph('深度')]}),rootNode=deep.nodes[deep.rootId];deep.nodes={};
  for(let n=0;n<100+i;n++){const nid=n?'depth-'+n:deep.rootId;deep.nodes[nid]={...rootNode,id:nid,kind:'text',parentId:n?(n===1?deep.rootId:'depth-'+(n-1)):null,childIds:n<99+i?['depth-'+(n+1)]:[]};}
  await add('too-deep',i,{doc:deep,error:'树深度'});
  const unknown=contentDocument('未知版本 '+i,{type:'doc',content:[paragraph('版本')]});unknown.schemaVersion=[2,0,999][i-1];
  await add('unknown-schema',i,{doc:unknown,error:'不支持'});
  // Real compressed entries with correct CRC and declared/actual lengths; never fake a size header.
  const sizes=[[90,90,71],[100,100,51],[85,85,81]][i-1];
  await add('unpack-limit',i,{extra:sizes.map((size,j)=>({name:`assets/quota-${j}.bin`,size:size*1048576,fill:64+i,compress:true})),error:'解包超过 250 MiB'});
 }
 const control=path.join(root,'valid-control.qmap'),doc=contentDocument('有效项目对照',{type:'doc',content:[paragraph('有效对照')]});
 const bytes=Buffer.from(JSON.stringify(doc));await writeFixtureZip(control,[{name:'manifest.json',bytes:Buffer.from(JSON.stringify({schemaVersion:1,documentHash:hashBytes(bytes),assets:[]}))},{name:'document.json',bytes}]);
 return {samples,control};
}
