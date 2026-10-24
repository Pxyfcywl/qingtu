import fs from 'node:fs/promises';
export async function memoryTrace(devtools,file){
 let eventHandler,timer;
 const completed=new Promise((resolve,reject)=>{
  eventHandler=event=>{const message=JSON.parse(event.data);if(message.method==='Tracing.tracingComplete'){clearTimeout(timer);resolve(message.params.stream);}};
  devtools.socket.addEventListener('message',eventHandler);
  timer=setTimeout(()=>reject(Error('Memory trace completion timed out')),15000);
 });
 try{
  await devtools.request('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{includedCategories:['disabled-by-default-memory-infra'],memoryDumpConfig:{triggers:[]}}});
  const dump=await devtools.request('Tracing.requestMemoryDump',{deterministic:false,levelOfDetail:'detailed'});
  await devtools.request('Tracing.end');const handle=await completed;if(!handle)throw Error('Missing trace stream');
  const chunks=[];try{while(true){const part=await devtools.request('IO.read',{handle,size:262144});chunks.push(part.base64Encoded?Buffer.from(part.data,'base64'):Buffer.from(part.data));if(part.eof)break;}}finally{await devtools.request('IO.close',{handle});}
  const bytes=Buffer.concat(chunks);await fs.writeFile(file,bytes);const trace=JSON.parse(bytes.toString('utf8'));
  const names=new Map(trace.traceEvents.filter(e=>e.name==='process_name').map(e=>[e.pid,e.args.name]));
  const processes=trace.traceEvents.filter(e=>e.ph==='v'&&e.args?.dumps).map(event=>{
   const raw=event.args.dumps;
   const allocators=Object.entries(raw.allocators??{}).map(([name,value])=>({name,bytes:parseInt(value.attrs?.size?.value??'0',16),effectiveBytes:parseInt(value.attrs?.effective_size?.value??'0',16)})).filter(row=>row.bytes).sort((a,b)=>b.bytes-a.bytes);
   return {pid:event.pid,name:names.get(event.pid),totals:raw.process_totals,topAllocators:allocators.slice(0,25)};
  });return {dump,traceBytes:bytes.length,processes};
 }finally{clearTimeout(timer);devtools.socket.removeEventListener('message',eventHandler);}
}
