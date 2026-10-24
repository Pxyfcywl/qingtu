import crypto from 'node:crypto';
export function contentDocument(title,body){
 const node={id:'content-root',kind:'card',parentId:null,childIds:['health'],title,body,side:'right',color:'orange',position:{x:0,y:0},preferredWidth:640,contentCollapsed:false,childrenCollapsed:false};
 const child={...node,id:'health',kind:'text',parentId:node.id,childIds:[],title:'正常节点应保持可用',position:{x:700,y:0},body:{type:'doc',content:[{type:'paragraph'}]}};
 return {id:'content-'+crypto.randomUUID(),schemaVersion:1,title,rootId:node.id,revision:0,layoutMode:'free',viewport:{x:180,y:140,zoom:1},updatedAt:0,nodes:{[node.id]:node,health:child}};
}
export const paragraph=text=>({type:'paragraph',content:[{type:'text',text}]});
export const hashBytes=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
