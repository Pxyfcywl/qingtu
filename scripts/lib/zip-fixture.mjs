// Test fixtures only: ordinary ZIP32 entries with real CRCs and optional raw deflate.
import {crc32,deflateRawSync} from 'node:zlib';
import fs from 'node:fs/promises';
export async function writeFixtureZip(destination,entries){
 const local=[],directory=[];let offset=0;
 for(const entry of entries){
  const name=Buffer.from(entry.name),bytes=entry.bytes??Buffer.alloc(entry.size??0,entry.fill??65);
  const payload=entry.compress?deflateRawSync(bytes):bytes,method=entry.compress?8:0,crc=crc32(bytes);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(method,8);header.writeUInt16LE(0x21,12); // 1980-01-01, valid DOS date
  header.writeUInt32LE(crc,14);header.writeUInt32LE(payload.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(0x21,14);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(payload.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  local.push(header,name,payload);directory.push(central,name);offset+=header.length+name.length+payload.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 await fs.writeFile(destination,Buffer.concat([...local,central,end]));
}
