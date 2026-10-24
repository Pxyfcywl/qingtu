import type {NodeKind} from '../domain/types';

const choices:{kind:NodeKind;label:string}[]=[{kind:'text',label:'文字'},{kind:'card',label:'内容卡片（Markdown）'},{kind:'image',label:'图片'},{kind:'video',label:'视频'}];
export default function DefaultNodeKind({value,saving,onChange}:{value:NodeKind|null;saving:boolean;onChange:(kind:NodeKind|null)=>void}) {
  return <fieldset className="default-node-kind" disabled={saving}>
    <legend>优先新增的节点类型</legend>
    <div className="default-node-options">{choices.map(({kind,label})=><label key={kind}>
      <input type="checkbox" aria-label={`优先新增：${label}`} checked={value===kind} onChange={event=>onChange(event.target.checked?kind:null)}/><span>{label}</span>
    </label>)}</div>
    <p>{saving?'正在保存偏好…':'勾选一种类型，Tab、Enter 和＋优先使用。未勾选时新增文字节点。'}</p>
  </fieldset>;
}
