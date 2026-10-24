// Run the same owned-app scripts through CDP values, without WebDriver's
// script-result console envelopes. App commands, UI actions and assertions
// remain unchanged. This is test transport code, never bundled into the app.
export async function useCdpExecution(session,devtools,targetSession){
 const group='qingtu-acceptance',original={execute:session.execute.bind(session),asyncScript:session.asyncScript.bind(session),refresh:session.refresh.bind(session)};
 let windowObject;
 async function bindWindow(){
  const result=await devtools.request('Runtime.evaluate',{expression:'globalThis',objectGroup:group,returnByValue:false},targetSession);
  if(result.exceptionDetails||!result.result.objectId)throw Error('Could not bind application execution context');windowObject=result.result.objectId;
 }
 async function call(script,args,asyncCallback){
  const body=asyncCallback?`function(){const args=Array.from(arguments);return new Promise((resolve,reject)=>{args.push(resolve);try{(function(){${script}\n}).apply(this,args);}catch(error){reject(error);}});}`:`function(){${script}\n}`;
  const response=await devtools.request('Runtime.callFunctionOn',{objectId:windowObject,functionDeclaration:body,arguments:args.map(value=>({value})),awaitPromise:true,returnByValue:true,objectGroup:group},targetSession,30000);
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
  if(response.result.unserializableValue)throw Error('Unexpected non-JSON test result: '+response.result.unserializableValue);
  return response.result.value;
 }
 await bindWindow();
 session.execute=(script,args=[])=>call(script,args,false);
 session.asyncScript=(script,args=[])=>call(script,args,true);
 session.refresh=async()=>{await devtools.request('Runtime.releaseObjectGroup',{objectGroup:group},targetSession);await original.refresh();await bindWindow();};
 return {restore:async()=>{Object.assign(session,original);await devtools.request('Runtime.releaseObjectGroup',{objectGroup:group},targetSession);}};
}
