import { afterEach,beforeEach,expect,it,vi } from 'vitest';
vi.mock('../src/bridge',()=>({call:vi.fn(),libraryInfo:vi.fn(),chooseAsset:vi.fn(),chooseProject:vi.fn(),assetUrl:vi.fn(),savePath:vi.fn()}));
import { call,savePath,chooseAsset } from '../src/bridge';
import { activateDocument,editDocument,getState,undoCommand,redoCommand,flushSave,patchState,setDefaultNodeKind } from '../src/state';
import { exportProject,replaceMedia,addNode } from '../src/actions';
import { demoDocument } from '../src/seed';
import { addChild,removeNode,reparent,validateDocument } from '../src/domain/tree';
import type { MindDocument } from '../src/domain/types';
import { registerDraft } from '../src/editing';
const normalized=(doc:MindDocument)=>{const {updatedAt:_,...rest}=doc;return JSON.parse(JSON.stringify(rest));};
beforeEach(async()=>{
  vi.useFakeTimers();vi.mocked(call).mockImplementation(async(command,args)=>command==='save_document'?{revision:(args?.patch as {baseRevision:number}).baseRevision+1}:undefined as never);
  await activateDocument(demoDocument());
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});

it('100 个混合命令可完整撤销和重做，保留顺序、正文、素材引用与坐标',()=>{
  const original=normalized(getState().doc!);const card=Object.values(getState().doc!.nodes).find(n=>n.title==='勾股定理')!.id;
  const other=getState().doc!.nodes[getState().doc!.rootId].childIds.find(id=>id!==card)!;
  let created='';
  for(let i=0;i<100;i++)editDocument(doc=>{
    const root=doc.nodes[doc.rootId];
    switch(i%10){
      case 0:created=addChild(doc,doc.rootId,'card');break;
      case 1:doc.nodes[card].body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:`正文修改 ${i}`}]}]};break;
      case 2:doc.layoutMode='free';doc.nodes[card].position.x+=7;doc.nodes[card].position.y-=3;break;
      case 3:doc.nodes[card].childrenCollapsed=!doc.nodes[card].childrenCollapsed;break;
      case 4:doc.nodes[card].contentCollapsed=!doc.nodes[card].contentCollapsed;break;
      case 5:reparent(doc,created,other);break;
      case 6:removeNode(doc,created);break;
      case 7:root.childIds.reverse();break;
      case 8:doc.nodes[card].color=doc.nodes[card].color==='teal'?'purple':'teal';break;
      case 9:doc.nodes[card].title=`知识卡片 ${i}`;break;
    }
  });
  expect(getState().error).toBe('');const final=normalized(getState().doc!);
  for(let i=0;i<100;i++){expect(getState().canUndo).toBe(true);undoCommand();validateDocument(getState().doc!);}
  expect(getState().canUndo).toBe(false);expect(normalized(getState().doc!)).toEqual(original);
  for(let i=0;i<100;i++){expect(getState().canRedo).toBe(true);redoCommand();validateDocument(getState().doc!);}
  expect(getState().canRedo).toBe(false);expect(normalized(getState().doc!)).toEqual(final);
});

it('资料库保存失败后仍可导出当前未保存内容，不能误标为已保存',async()=>{
  vi.mocked(call).mockImplementation(async(command)=>{if(command==='save_document')throw Error('database is readonly');return undefined as never;});
  editDocument(doc=>{doc.nodes[doc.rootId].title='需要恢复的未保存修改';});
  await expect(flushSave()).rejects.toThrow('readonly');expect(getState().saving).toBe('error');
  vi.mocked(savePath).mockResolvedValue('E:\\test\\恢复备份.qmap');
  await exportProject();
  expect(call).toHaveBeenCalledWith('export_snapshot',expect.objectContaining({document:expect.objectContaining({nodes:expect.objectContaining({[getState().doc!.rootId]:expect.objectContaining({title:'需要恢复的未保存修改'})})}),path:'E:\\test\\恢复备份.qmap'}));
  expect(getState().saving).toBe('error');expect(getState().notice).toContain('资料库仍有未保存内容');
});

it('保存会先提交编辑器草稿，输入法组合期间不会提交半成品',async()=>{
  let composing=true;const remove=registerDraft('test-draft',{composing:()=>composing,commit:()=>editDocument(doc=>{doc.nodes[doc.rootId].title='确认后的完整标题';})});
  try{
    vi.mocked(call).mockClear();await expect(flushSave()).rejects.toThrow('输入法');expect(call).not.toHaveBeenCalled();
    composing=false;await flushSave();expect(getState().saving).toBe('saved');
    expect(call).toHaveBeenCalledWith('save_document',expect.objectContaining({patch:expect.objectContaining({upserts:expect.arrayContaining([expect.objectContaining({title:'确认后的完整标题'})])})}));
  }finally{remove();}
});

it('自动保存会等待组合输入完成，超时后不会变成零间隔忙循环',async()=>{
  let composing=true;const remove=registerDraft('test-composition',{composing:()=>composing,commit:()=>{}});
  try{
    vi.mocked(call).mockClear();editDocument(doc=>{doc.nodes[doc.rootId].title='等待输入完成';});
    await vi.advanceTimersByTimeAsync(1600);expect(call).not.toHaveBeenCalled();
    composing=false;await vi.advanceTimersByTimeAsync(100);expect(getState().saving).toBe('saved');expect(call).toHaveBeenCalledTimes(1);
  }finally{remove();}
});

it('选择文件期间切换到相同节点 ID 的副本，不会向新文档挂载旧导入',async()=>{
  let choose!:(value:string)=>void;vi.mocked(chooseAsset).mockReturnValue(new Promise(resolve=>choose=resolve));
  const source=getState().doc!,image=Object.values(source.nodes).find(n=>n.kind==='image')!;
  const pending=replaceMedia(image.id);const copy=structuredClone(source);copy.id=crypto.randomUUID();await activateDocument(copy);
  choose('E:\\test\\old.png');await pending;expect(getState().doc!.nodes[image.id].assetId).toBe(image.assetId);
  expect(vi.mocked(call).mock.calls.some(([name])=>name==='import_asset')).toBe(false);
});

it('原生复制已开始时切图，迟到结果不会覆盖新文档或清除其他任务提示',async()=>{
  let finish!:(value:unknown)=>void;vi.mocked(chooseAsset).mockResolvedValue('E:\\test\\pending.png');
  vi.mocked(call).mockImplementation(async(name,args)=>name==='import_asset'?await new Promise(resolve=>finish=resolve):name==='save_document'?{revision:(args?.patch as {baseRevision:number}).baseRevision+1}:undefined as never);
  const source=getState().doc!,image=Object.values(source.nodes).find(n=>n.kind==='image')!;const pending=replaceMedia(image.id);await Promise.resolve();await Promise.resolve();expect(finish).toBeTypeOf('function');
  const copy=structuredClone(source);copy.id=crypto.randomUUID();await activateDocument(copy);patchState({busy:'正在处理其他操作'});
  finish({id:'new-asset',name:'pending.png'});await pending;
  expect(getState().doc!.nodes[image.id].assetId).toBe(image.assetId);expect(getState().busy).toBe('正在处理其他操作');expect(getState().error).toBe('');patchState({busy:''});
});

it('嵌套正文修改可撤销，保存只提交变更节点且不改写旧快照',async()=>{
 const before=getState().doc!,original=normalized(before),card=Object.values(before.nodes).find(n=>n.kind==='card')!;
 const blocks=card.body.content!.length;vi.mocked(call).mockClear();
 editDocument(doc=>{doc.nodes[card.id].body.content!.push({type:'paragraph',content:[{type:'text',text:'嵌套正文更新'}]});});
 expect(getState().error).toBe('');expect(card.body.content).toHaveLength(blocks);expect(getState().doc!.nodes[card.id].body.content).toHaveLength(blocks+1);
 await flushSave();const patches=vi.mocked(call).mock.calls.filter(([name])=>name==='save_document');
 expect((patches[0][1]!.patch as {upserts:{id:string}[]}).upserts.map(n=>n.id)).toEqual([card.id]);
 undoCommand();expect(normalized(getState().doc!)).toEqual(original);redoCommand();expect(getState().doc!.nodes[card.id].body.content).toHaveLength(blocks+1);
});

it('无效的嵌套修改整笔撤回，不污染当前文档和撤销历史',()=>{
 const before=getState().doc!,original=normalized(before),card=Object.values(before.nodes).find(n=>n.kind==='card')!;
 editDocument(doc=>{doc.nodes[card.id].body.content!.push({type:'paragraph'});delete doc.nodes[doc.rootId];});
 expect(getState().error).not.toBe('');expect(getState().doc).toBe(before);expect(normalized(before)).toEqual(original);expect(getState().canUndo).toBe(false);
});

it('重复赋同值或相同视口不会增加撤销步骤和保存任务',()=>{
 const before=getState().doc!;vi.mocked(call).mockClear();
 editDocument(doc=>{doc.nodes[doc.rootId].title=before.nodes[before.rootId].title;});
 editDocument(doc=>{doc.viewport={...before.viewport};});
 expect(getState().doc).toBe(before);expect(getState().saving).toBe('saved');expect(getState().canUndo).toBe(false);expect(call).not.toHaveBeenCalled();
});
it('默认类型只作用于未指定类型的新增，支持同级节点且不改变旧节点',()=>{
 const before=getState().doc!,original=normalized(before);
 patchState({library:{initialized:true,storagePath:'test',configPath:'',recentId:before.id,documents:[],assets:[],defaultNodeKind:'card'}});
 addNode();const first=getState().doc!.nodes[getState().selectedId!];expect(first.kind).toBe('card');expect(first.parentId).toBe(before.rootId);
 addNode(undefined,undefined,true);const sibling=getState().doc!.nodes[getState().selectedId!];expect(sibling.kind).toBe('card');expect(sibling.parentId).toBe(first.parentId);
 addNode('text');expect(getState().doc!.nodes[getState().selectedId!].kind).toBe('text');expect(normalized(before)).toEqual(original);
 patchState({library:null});
});
it('默认偏好写入失败保留原选项，成功后更新且不产生文档撤销',async()=>{
 const doc=getState().doc!;patchState({library:{initialized:true,storagePath:'test',configPath:'',recentId:doc.id,documents:[],assets:[],defaultNodeKind:'text'}});
 vi.mocked(call).mockRejectedValueOnce(new Error('偏好无法保存'));await setDefaultNodeKind('card');
 expect(getState().library!.defaultNodeKind).toBe('text');expect(getState().preferenceSaving).toBe(false);expect(getState().error).toContain('偏好无法保存');
 vi.mocked(call).mockResolvedValueOnce({defaultNodeKind:'card'} as never);await setDefaultNodeKind('card');
 expect(getState().library!.defaultNodeKind).toBe('card');expect(getState().doc).toBe(doc);expect(getState().canUndo).toBe(false);
 vi.mocked(call).mockResolvedValueOnce({defaultNodeKind:null} as never);await setDefaultNodeKind(null);expect(getState().library!.defaultNodeKind).toBeNull();
 addNode();expect(getState().doc!.nodes[getState().selectedId!].kind).toBe('text');patchState({library:null});
});
