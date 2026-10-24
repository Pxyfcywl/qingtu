import {it,expect,vi} from 'vitest';
import {createThumbnailCache,readThumbnail} from '../src/domain/thumbnail-resource';
const blob=()=>new Blob(['image'],{type:'image/png'});
function objectUrls(){let n=0;return {createObjectURL:vi.fn(()=>`blob:test-${++n}`),revokeObjectURL:vi.fn()};}
it('重复图片共享一个 URL，最后一个使用者释放后才撤销',async()=>{
 const urls=objectUrls(),load=vi.fn(async()=>blob()),cache=createThumbnailCache(load,urls),a=cache.acquire('store/image','image'),b=cache.acquire('store/image','image');
 expect(await a.promise).toBe(await b.promise);expect(load).toHaveBeenCalledTimes(1);a.release();a.release();expect(urls.revokeObjectURL).not.toHaveBeenCalled();b.release();expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-1');
 const c=cache.acquire('store/image','image');expect(await c.promise).toBe('blob:test-2');expect(load).toHaveBeenCalledTimes(2);c.release();
});
it('最后一个使用者在加载中消失，即使迟到返回也不能创建 URL',async()=>{
 let finish!:(value:Blob)=>void;const pending=new Promise<Blob>(resolve=>finish=resolve),urls=objectUrls(),cache=createThumbnailCache(async()=>pending,urls),a=cache.acquire('a','image');
 await Promise.resolve();a.release();finish(blob());await expect(a.promise).rejects.toMatchObject({name:'AbortError'});expect(urls.createObjectURL).not.toHaveBeenCalled();
});
it('单个使用者退出不会中断其他使用者；最后退出才中断',async()=>{
 let signal!:AbortSignal;const urls=objectUrls(),cache=createThumbnailCache(async(_id,s)=>{signal=s;return blob();},urls),a=cache.acquire('a','image'),b=cache.acquire('a','image');await a.promise;
 a.release();expect(signal.aborted).toBe(false);b.release();expect(signal.aborted).toBe(true);
});
it('加载失败可重试，旧租用者释放不干扰新请求',async()=>{
 const urls=objectUrls(),load=vi.fn().mockRejectedValueOnce(Error('missing')).mockResolvedValue(blob()),cache=createThumbnailCache(load,urls),old=cache.acquire('a','image');await expect(old.promise).rejects.toThrow('missing');
 const next=cache.acquire('a','image');await next.promise;old.release();expect(urls.revokeObjectURL).not.toHaveBeenCalled();next.release();expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
});
it('不同资料库即使素材 ID 相同也分开持有，全部释放',async()=>{
 const urls=objectUrls(),load=vi.fn(async()=>blob()),cache=createThumbnailCache(load,urls),a=cache.acquire('store1/image','image'),b=cache.acquire('store2/image','image');expect(await a.promise).not.toBe(await b.promise);expect(load).toHaveBeenCalledTimes(2);a.release();b.release();expect(urls.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('视频缺封面时先拒绝媒体类型，不读取整个视频到 JS',async()=>{
 let cancelled=false;const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'video/mp4'}}),reader=vi.spyOn(response.body!,'getReader');
 await expect(readThumbnail(response,new AbortController().signal)).rejects.toThrow('缩略图不是');expect(reader).not.toHaveBeenCalled();expect(cancelled).toBe(true);
});
it('支持 PNG/JPEG/WebP 的实际字节，拒绝 SVG 与空内容',async()=>{
 for(const type of ['image/png','image/jpeg','image/webp']){const result=await readThumbnail(new Response('bytes',{headers:{'content-type':type}}),new AbortController().signal);expect(result.type).toBe(type);expect(await result.text()).toBe('bytes');}
 await expect(readThumbnail(new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}),new AbortController().signal)).rejects.toThrow('缩略图不是');
 await expect(readThumbnail(new Response('',{headers:{'content-type':'image/png'}}),new AbortController().signal)).rejects.toThrow('没有内容');
});
it('流式读取拒绝实际 10 MiB 加一，即使没有 Content-Length',async()=>{
 const signal=new AbortController().signal,headers={'content-type':'image/png'},limit=10*1024*1024;
 expect((await readThumbnail(new Response(new Uint8Array(limit),{headers}),signal)).size).toBe(limit);
 await expect(readThumbnail(new Response(new Uint8Array(limit+1),{headers}),signal)).rejects.toThrow('超过 10 MiB');
});
it('加载开始前取消不会读取字节',async()=>{
 const controller=new AbortController();controller.abort();await expect(readThumbnail(new Response('bytes',{headers:{'content-type':'image/png'}}),controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
