import {createRoot,type Root} from 'react-dom/client';
import {VideoAsset} from '../../src/components/Media';
let root:Root,slow=false;
function Players({first=true}:{first?:boolean}){
 return <>{first&&<section id="player-a" style={{width:280}}><VideoAsset id={slow?'builtin:slow':'builtin:lesson'}/></section>}<section id="player-b" style={{width:280}}><VideoAsset id="builtin:lesson"/></section><section id="player-c" style={{width:280}}><VideoAsset id="builtin:lesson"/></section></>;
}
export function mountPlayers(slowFirst=false){
 slow=slowFirst;const host=document.createElement('div');host.id='playback-fixture';Object.assign(host.style,{position:'absolute',top:'100px',left:'100px',display:'flex',gap:'20px',zIndex:'999'});document.body.append(host);root=createRoot(host);root.render(<Players/>);
}
export function removeFirst(){root.render(<Players first={false}/>);}
