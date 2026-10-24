import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Read an already committed test document outside the WebView. This avoids
// serializing an extra full document through the application solely for a hash.
// It does not replace UI actions, save completion checks or model comparison.
export async function readTestDocument(library,id){
 const file=await fs.realpath(path.join(library,'library.sqlite3'));
 const allowed=await fs.realpath('.tooling'),relative=path.relative(allowed,file);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Only project test databases may be inspected');
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  db.exec('PRAGMA busy_timeout=1000; BEGIN');
  const metadata=db.prepare('SELECT data FROM documents WHERE id=?').get(id);
  if(!metadata)throw Error('Committed test document missing');
  const doc=JSON.parse(metadata.data);doc.nodes=Object.fromEntries(db.prepare('SELECT id,data FROM nodes WHERE doc_id=?').all(id).map(row=>[row.id,JSON.parse(row.data)]));
  db.exec('COMMIT');return doc;
 }finally{db.close();}
}
