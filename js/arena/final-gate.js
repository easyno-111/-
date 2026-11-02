import { clamp } from './util.js?v=8.8';

export const FINAL_GATE_HEIGHT=1400;
export function pointInMazeIsland(x,y,island){
  let inside=false;const p=island.points;
  for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)inside=!inside;
  return inside;
}
export function buildFinalGate(W,mainHeight,rand){
  const startY=mainHeight-245,span=Math.min(660,W-40),left=(W-span)/2,right=left+span,cell=span/3;
  const rails=[],wheels=[],islands=[];
  const add=(a,b,type='normal',extra={})=>rails.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,w:6,railType:type,finalGate:true,...extra});
  const point=(u,y)=>({x:left+span*u,y:startY+y});
  const chain=(points,type='normal',extra={})=>{for(let i=1;i<points.length;i++)add(points[i-1],points[i],type,extra);};
  const bounds=[
    [point(0,100),point(0,460),point(.04,650),point(.14,760),point(.06,900)],
    [point(1/3,100),point(1/3+.04,260),point(1/3-.04,460)],
    [point(2/3,100),point(2/3+.04,260),point(2/3-.04,460)],
    [point(1,100),point(1,460),point(.86,650),point(.96,760),point(.88,900)]
  ];
  for(let i=0;i<4;i++){
    add({x:20+(W-40)*i/3,y:startY-24},bounds[i][0],'speed');
    chain(bounds[i],i===0||i===3?'speed':'normal',{mazeWall:true});
  }
  const at=(path,y)=>{const worldY=startY+y;for(let i=1;i<path.length;i++)if(worldY<=path[i].y){const a=path[i-1],b=path[i];return a.x+(b.x-a.x)*(worldY-a.y)/(b.y-a.y);}return path.at(-1).x;};
  const makeIsland=(id,points,splitY,centerX)=>{
    const island={id,points,splitY:startY+splitY,centerX};islands.push(island);
    chain([...points,points[0]],'speed',{mazeIsland:id});return island;
  };
  // Closed tapered islands split each side passage into two real routes.
  for(const lane of [0,2]){
    const top=lane===0?170:195,mid=lane===0?300:325,bottom=lane===0?425:445;
    const center=y=>(at(bounds[lane],y)+at(bounds[lane+1],y))/2;
    const minWidth=Math.min(...[top,mid,bottom].map(y=>at(bounds[lane+1],y)-at(bounds[lane],y)));
    const half=clamp(minWidth/2-(W<520?24:32)-8,6,32);
    makeIsland(lane===0?'left-fork':'right-fork',[
      {x:center(top),y:startY+top},{x:center(mid)+half,y:startY+mid},
      {x:center(bottom),y:startY+bottom},{x:center(mid)-half,y:startY+mid}
    ],mid,center(mid));
  }
  // Divider walls end at an open junction: balls can change routes here.
  const doors=[.27,.73].map((u,i)=>({x:left+span*u,y:startY+550,r:Math.min(43,span*.075),
    speed:i?-1.65:1.85,angle:rand()*Math.PI*2,hit:0,color:i?'#ff75b5':'#5ed4ff',
    spokesOnly:true,spokeCount:2,finalGate:true,mazeDoor:true}));
  wheels.push(...doors);
  makeIsland('last-fork',[point(.53,650),point(.48+Math.min(50/span,.12),760),point(.53,900),point(.48-Math.min(50/span,.12),760)],760,left+span*.48);
  const throatHalf=92,mergeY=startY+1040,endY=startY+FINAL_GATE_HEIGHT;
  add(bounds[0].at(-1),{x:W/2-throatHalf,y:mergeY},'speed');
  add(bounds[3].at(-1),{x:W/2+throatHalf,y:mergeY},'speed');
  add({x:W/2-throatHalf,y:mergeY},{x:W/2-throatHalf,y:endY},'bounce');
  add({x:W/2+throatHalf,y:mergeY},{x:W/2+throatHalf,y:endY},'bounce');
  const kicker={x:W/2,y:startY+1220,r:throatHalf-12,speed:2.8,angle:rand()*Math.PI*2,hit:0,color:'#ffc94a',
    spokesOnly:true,spokeCount:3,restitution:.95,kick:90,finalGate:true,finalKicker:true};
  wheels.push(kicker);
  const lanes=Array.from({length:3},(_,i)=>({num:i+1,x:left+cell*(i+.5),entryX:20+(W-40)*(i+.5)/3,half:cell/2-5,type:i===1?'zigzag':'fork',color:i===1?'#5ed4ff':'#d58aff'}));
  return{mainHeight,startY,endY,lanes,rails,wheels,mergeY,throatHalf,kicker,islands,doors,bounds,left,right,
    junctionY:startY+500,decisionExitY:startY+910};
}
export function updateFinalGate(s,b,dt){
  const g=s.finalGate;if(!g)return false;
  if(!b.finalGateEntry&&b.y>=g.startY){b.finalGateEntry=clamp(Math.floor((b.x-20)/((s.W-40)/3))+1,1,3);b.gateEnteredAt=s.raceElapsed||0;}
  // Observation only: route choices never steer a ball or choose a winner.
  if(!b.mazeExitSide&&b.y>=g.decisionExitY)b.mazeExitSide=b.x<s.W/2?'left':'right';
  return false;
}
