import {expect,it,vi} from 'vitest';
import {createTaskPool} from '../src/domain/task-pool';
it('多个缩略图任务最多同时执行两个',async()=>{
  vi.useFakeTimers();try{
    const run=createTaskPool(2);let running=0,peak=0;
    const jobs=Array.from({length:10},(_,i)=>run(async()=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,10));running--;return i;},new AbortController().signal));
    await vi.runAllTimersAsync();expect(await Promise.all(jobs)).toEqual(Array.from({length:10},(_,i)=>i));expect(peak).toBe(2);expect(running).toBe(0);
  }finally{vi.useRealTimers();}
});
it('切图取消排队任务不会占用名额或阻止后续图片加载',async()=>{
  const run=createTaskPool(1);let release!:()=>void;let cancelledStarted=false;
  const first=run(()=>new Promise<void>(r=>release=r),new AbortController().signal);
  await Promise.resolve();const abort=new AbortController();
  const cancelled=run(async()=>{cancelledStarted=true;},abort.signal);const rejected=expect(cancelled).rejects.toBeDefined();abort.abort();
  const next=run(async()=>42,new AbortController().signal);release();await first;await rejected;expect(await next).toBe(42);expect(cancelledStarted).toBe(false);
});
