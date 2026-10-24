import fs from 'node:fs/promises';
import path from 'node:path';
import {NativeSession,sleep} from './lib/native.mjs';
import {DevTools} from './lib/cdp.mjs';
const app=process.env.QINGTU_TEST_APP??'.tooling/install-tests/tested-0.1.1-qingtu.exe';
const session=new NativeSession();let diagnostics;
try{await session.open(app);const address=session.capabilities['ms:edgeOptions']?.debuggerAddress;if(!address)throw Error('No local debugger address');diagnostics=await DevTools.connect(address);const origin=await session.execute('return location.origin;');await sleep(500);const result={app:path.resolve(app),capabilities:session.capabilities,version:await diagnostics.request('Browser.getVersion'),heaps:await diagnostics.heaps(origin)};await fs.mkdir('.tooling/lifecycle',{recursive:true});await fs.writeFile('.tooling/lifecycle/diagnostics-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify({origin,version:result.version,heaps:result.heaps},null,2));}finally{diagnostics?.close();await session.close();}
