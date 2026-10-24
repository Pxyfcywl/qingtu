const operations=new Map<string,AbortController>();
export function startOperation(key:string){
  cancelOperations(key);const controller=new AbortController();operations.set(key,controller);
  return {signal:controller.signal,isCurrent:()=>operations.get(key)===controller,
    finish:()=>{if(operations.get(key)===controller)operations.delete(key);}};
}
export function cancelOperations(key?:string){
  for(const [name,controller]of [...operations])if(key===undefined||name===key){operations.delete(name);controller.abort();}
}
export const hasOperation=(key:string)=>operations.has(key);
