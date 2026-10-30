import { clamp } from './util.js?v=8.7';

export const FINAL_GATE_HEIGHT=1400;
export function buildFinalGate(W,mainHeight,rand){
  const startY=mainHeight-245,count=W<360?2:W<760?3:5,cell=(W-40)/count;
  const width=Math.min(132,cell-12),rails=[],wheels=[];
  const makeRail=(x1,y1,x2,y2,type='normal',extra={})=>rails.push({x1,y1,x2,y2,w:6,railType:type,finalGate:true,...extra});
  const profiles=['speed','fork','wheel','speed','fork'];
  const lanes=Array.from({length:count},(_,i)=>({num:i+1,x:20+cell*(i+.5),half:width/2,type:profiles[i],color:profiles[i]==='speed'?'#5ed4ff':profiles[i]==='fork'?'#d58aff':'#ff75b5'}));
  for(const [i,lane] of lanes.entries()){
    const type=lane.type==='speed'?'speed':'normal';
    // Separate funnels feed continuous narrow walls, rather than an open room.
    makeRail(20+cell*i,startY-24,lane.x-lane.half,startY+130,'speed');
    makeRail(20+cell*(i+1),startY-24,lane.x+lane.half,startY+130,'speed');
    makeRail(lane.x-lane.half,startY+130,lane.x-lane.half,startY+720,type);
    makeRail(lane.x+lane.half,startY+130,lane.x+lane.half,startY+720,type);
    if(lane.type==='fork'){
      makeRail(lane.x,startY+240,lane.x-width*.08,startY+355,'bounce',{w:4});
      makeRail(lane.x,startY+240,lane.x+width*.08,startY+355,'bounce',{w:4});
    }
    if(lane.type!=='speed')wheels.push({x:lane.x,y:startY+(lane.type==='fork'?520:350),r:Math.max(12,Math.min(36,(width-2*((W<520?12:16)*2+8)-6)/2)),
      speed:i%2?-1.9:1.7,angle:rand()*Math.PI*2,hit:0,color:lane.color,spokesOnly:true,spokeCount:2,finalGate:true,laneNum:lane.num});
  }
  const throatHalf=92,mergeY=startY+1040,endY=startY+FINAL_GATE_HEIGHT;
  makeRail(20,startY+720,W/2-throatHalf,mergeY,'speed');
  makeRail(W-20,startY+720,W/2+throatHalf,mergeY,'speed');
  makeRail(W/2-throatHalf,mergeY,W/2-throatHalf,endY,'bounce');
  makeRail(W/2+throatHalf,mergeY,W/2+throatHalf,endY,'bounce');
  const kicker={x:W/2,y:startY+1220,r:throatHalf-12,speed:2.8,angle:rand()*Math.PI*2,hit:0,color:'#ffc94a',
    spokesOnly:true,spokeCount:3,restitution:.95,kick:90,finalGate:true,finalKicker:true};
  wheels.push(kicker);
  return{mainHeight,startY,endY,lanes,rails,wheels,mergeY,throatHalf,kicker};
}
export function updateFinalGate(s,b,dt){
  const g=s.finalGate;if(!g)return false;
  if(!b.finalGateEntry&&b.y>=g.startY){
    b.finalGateEntry=clamp(Math.floor((b.x-20)/((s.W-40)/g.lanes.length))+1,1,g.lanes.length);b.gateEnteredAt=s.raceElapsed||0;
  }
  if(b.y>g.startY+130&&b.y<g.startY+720){
    const lane=g.lanes.find(l=>Math.abs(b.x-l.x)<l.half);
    if(lane?.type==='speed')b.vy=Math.min(480,b.vy+180*dt);
    else if(lane&&b.vy>0)b.vy*=Math.exp(-dt*.65);
  }
  return false;
}
