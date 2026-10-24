export async function observeRuntime(devtools,sessionId){
 const errors=[],consoleActivity={messages:0,stringCharacters:0,errorMessages:0};
 const listener=event=>{
  const message=JSON.parse(event.data);if(message.sessionId!==sessionId)return;
  if(message.method==='Runtime.exceptionThrown'){
   const detail=message.params.exceptionDetails;errors.push({kind:'exception',text:detail.text,description:detail.exception?.description?.slice(0,2000),url:detail.url,line:detail.lineNumber});
  }
  if(message.method==='Runtime.consoleAPICalled'){
   consoleActivity.messages++;const args=message.params.args??[];
   for(const arg of args)if(typeof arg.value==='string')consoleActivity.stringCharacters+=arg.value.length;
   if(message.params.type==='error'){consoleActivity.errorMessages++;errors.push({kind:'console-error',text:args.map(a=>String(a.value??a.description??'')).join(' ').slice(0,2000)});}
  }
 };
 devtools.socket.addEventListener('message',listener);
 try{await devtools.request('Runtime.enable',{},sessionId);}catch(error){devtools.socket.removeEventListener('message',listener);throw error;}
 return {errors,consoleActivity,stop:()=>devtools.socket.removeEventListener('message',listener)};
}
