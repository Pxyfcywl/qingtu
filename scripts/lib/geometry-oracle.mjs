// Independent geometry checks for measured DOM rectangles and actual SVG
// cubic paths. This module does not import the application's layout code.
const EPS=1e-7;
const evaluate=(c,t)=>((c[0]*t+c[1])*t+c[2])*t+c[3];
const polynomial=points=>[-points[0]+3*points[1]-3*points[2]+points[3],3*points[0]-6*points[1]+3*points[2],-3*points[0]+3*points[1],points[0]];
function quadratic(a,b,c){
 if(Math.abs(a)<EPS)return Math.abs(b)<EPS?[]:[-c/b];
 const d=b*b-4*a*c;if(d<0)return[];return [(-b-Math.sqrt(d))/(2*a),(-b+Math.sqrt(d))/(2*a)];
}
function roots(c,value){
 const shifted=[...c];shifted[3]-=value;
 const cuts=[0,...quadratic(3*c[0],2*c[1],c[2]).filter(t=>t>0&&t<1),1].sort((a,b)=>a-b),result=[];
 for(const t of cuts)if(Math.abs(evaluate(shifted,t))<EPS)result.push(t);
 for(let index=1;index<cuts.length;index++){
  let lo=cuts[index-1],hi=cuts[index],a=evaluate(shifted,lo),b=evaluate(shifted,hi);
  if(a*b>=0)continue;
  for(let n=0;n<55;n++){const mid=(lo+hi)/2,v=evaluate(shifted,mid);if(a*v<=0){hi=mid;b=v;}else{lo=mid;a=v;}}
  result.push((lo+hi)/2);
 }return result;
}
export function parseCubic(d){
 const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)??[];
 if(tokens.length!==10||tokens[0]!=='M'||tokens[3]!=='C')throw Error('Expected one absolute M/C cubic SVG path: '+d);
 const numbers=[tokens[1],tokens[2],...tokens.slice(4)].map(Number);if(numbers.some(n=>!Number.isFinite(n)))throw Error('Invalid cubic coordinates');
 return {x:polynomial([numbers[0],numbers[2],numbers[4],numbers[6]]),y:polynomial([numbers[1],numbers[3],numbers[5],numbers[7]]),bounds:{x:Math.min(numbers[0],numbers[2],numbers[4],numbers[6]),right:Math.max(numbers[0],numbers[2],numbers[4],numbers[6]),y:Math.min(numbers[1],numbers[3],numbers[5],numbers[7]),bottom:Math.max(numbers[1],numbers[3],numbers[5],numbers[7])}};
}
export function crossesInterior(curve,rect){
 if(curve.bounds.right<=rect.x||curve.bounds.x>=rect.right||curve.bounds.bottom<=rect.y||curve.bounds.y>=rect.bottom)return false;
 const times=[0,1,...roots(curve.x,rect.x),...roots(curve.x,rect.right),...roots(curve.y,rect.y),...roots(curve.y,rect.bottom)].sort((a,b)=>a-b);
 const inside=t=>{const x=evaluate(curve.x,t),y=evaluate(curve.y,t);return x>rect.x+EPS&&x<rect.right-EPS&&y>rect.y+EPS&&y<rect.bottom-EPS;};
 for(let i=1;i<times.length;i++)if(times[i]-times[i-1]>EPS&&inside((times[i]+times[i-1])/2))return true;
 return false;
}
export function inspectGeometry(nodes,edges){
 const ids=new Set(),rects=nodes.map(node=>{
  if(ids.has(node.id))throw Error('Duplicate measured node '+node.id);ids.add(node.id);
  if(![node.x,node.y,node.width,node.height].every(Number.isFinite)||node.width<=0||node.height<=0)throw Error('Invalid measured rectangle '+node.id);
  return {...node,right:node.x+node.width,bottom:node.y+node.height};
 }).sort((a,b)=>a.x-b.x),overlaps=[],crossings=[];
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length&&rects[j].x<rects[i].right-EPS;j++){
  const a=rects[i],b=rects[j],w=Math.min(a.right,b.right)-Math.max(a.x,b.x),h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
  if(w>EPS&&h>EPS)overlaps.push({a:a.id,b:b.id,area:w*h});
 }
 for(const edge of edges){
  if(!ids.has(edge.source)||!ids.has(edge.target))throw Error('Edge endpoint has no measured rectangle: '+edge.id);
  const curve=parseCubic(edge.d);
  for(const rect of rects)if(rect.id!==edge.source&&rect.id!==edge.target&&crossesInterior(curve,rect))crossings.push({edge:edge.id,node:rect.id});
 }
 return {nodes:rects.length,edges:edges.length,overlaps,crossings,passed:overlaps.length===0&&crossings.length===0};
}
