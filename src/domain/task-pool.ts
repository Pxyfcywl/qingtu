export function createTaskPool(limit:number) {
  let active=0;
  const waiting:{start:()=>void;cancel:()=>void;signal:AbortSignal}[]=[];
  const pump=()=>{while(active<limit&&waiting.length){const item=waiting.shift()!;item.signal.removeEventListener('abort',item.cancel);active++;item.start();}};
  return async function run<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{
    signal.throwIfAborted();
    await new Promise<void>((resolve,reject)=>{
      const item={signal,start:resolve,cancel:()=>{const index=waiting.indexOf(item);if(index>=0)waiting.splice(index,1);reject(signal.reason);}};
      waiting.push(item);signal.addEventListener('abort',item.cancel,{once:true});pump();
    });
    try{signal.throwIfAborted();return await work();}finally{active--;pump();}
  };
}
