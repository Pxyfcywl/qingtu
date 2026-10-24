import {createRoot} from 'react-dom/client';
import {ImageAsset} from '../../src/components/Media';
import {Formula} from '../../src/components/RichContent';
import {addAsset} from '../../src/state';

export function mountImage(kind:'node'|'body',width:number,height:number){
 const id='builtin:reserved-'+kind;
 addAsset({id,mime:'image/png',byteSize:100,sha256:id,width,height,relativePath:'',name:'尺寸测试'});
 const host=document.createElement('div');host.id='reservation-fixture';host.className=kind==='node'?'node-image':'rich-doc';
 Object.assign(host.style,{position:'absolute',left:'100px',top:'100px',zIndex:'999',width:'280px'});document.body.append(host);
 const root=createRoot(host);root.render(<ImageAsset id={id} alt="延迟图片"/>);
}

export function mountFormula(){
 const host=document.createElement('div');host.id='formula-fixture';Object.assign(host.style,{position:'absolute',left:'100px',top:'100px',width:'432px',zIndex:'999'});document.body.append(host);
 const sizes:number[]=[];(window as unknown as {formulaSizes:number[]}).formulaSizes=sizes;
 new MutationObserver(()=>{const element=host.querySelector('.math-block');if(element)sizes.push(element.getBoundingClientRect().height);}).observe(host,{childList:true,subtree:true});
 createRoot(host).render(<Formula latex="a^2+b^2=c^2"/>);
}
