import { clamp } from './util.js?v=8.5';
import { clearLanding } from './landing.js?v=8.5';

export const FINAL_GATE_HEIGHT=1400;
export function buildFinalGate(W,mainHeight,rand){
  const startY=mainHeight-245,laneW=(W-40)/5;
  const lanes=Array.from({length:5},(_,i)=>({num:i+1,x:20+laneW*(i+.5),half:laneW/2-5}));
  const rails=[];
  for(let i=1;i<5;i++)rails.push({x1:20+laneW*i,y1:startY-24,x2:20+laneW*i,y2:startY+260,w:6,railType:'normal',finalGate:true});
  // A second fork between the two open-wheel rooms.
  rails.push({x1:W*.5,y1:startY+700,x2:W*.35,y2:startY+820,w:7,railType:'speed',finalGate:true},
    {x1:W*.5,y1:startY+700,x2:W*.65,y2:startY+820,w:7,railType:'bounce',finalGate:true});
  const radius=Math.min(105,(W-40)*.18),clearance=(W<520?12:16)*2+20;
  const wheelX=clamp(W*.3,20+radius+clearance+6,W-20-radius-clearance-6);
  const wheels=[{x:wheelX,y:startY+450,r:radius,speed:1.25,color:'#5ed4ff'},
    {x:W-wheelX,y:startY+1000,r:radius,speed:-1.55,color:'#ff75b5'}].map(w=>({...w,angle:rand()*Math.PI*2,hit:0,finalGate:true}));
  // Directed pairs: shortcut A and detour B. Each can be used once per ball.
  const portals=[{id:'A',from:1,to:5,color:'#5ed4ff',entry:{x:lanes[0].x,y:startY+220,half:lanes[0].half},exit:{x:lanes[4].x,y:startY+650}},
    {id:'B',from:5,to:2,color:'#d58aff',entry:{x:lanes[4].x,y:startY+820,half:lanes[4].half},exit:{x:lanes[1].x,y:startY+300}}];
  return{mainHeight,startY,endY:startY+FINAL_GATE_HEIGHT,lanes,rails,wheels,portals};
}
export function updateFinalGate(s,b,previous,dt){
  const g=s.finalGate;if(!g)return false;
  b.warpFlash=Math.max(0,(b.warpFlash||0)-dt*2);
  if(!b.finalGateEntry&&b.y>=g.startY){b.finalGateEntry=clamp(Math.floor((b.x-20)/((s.W-40)/5))+1,1,5);b.gateEnteredAt=s.raceElapsed||0;}
  if((b.warpCount||0)>=2)return false;
  for(const p of g.portals){
    if(b.usedWarps?.includes(p.id)||b.vy<=0||previous.y>=p.entry.y||b.y<p.entry.y)continue;
    const t=(p.entry.y-previous.y)/(b.y-previous.y),crossX=previous.x+(b.x-previous.x)*t;
    if(Math.abs(crossX-p.entry.x)>p.entry.half-b.r)continue;
    // Congested exits never create overlaps; a blocked portal leaves its physical path open.
    let destination=null;
    for(const dy of [0,36,72,108])if(clearLanding(s,b,p.exit.x,p.exit.y+dy)){destination={x:p.exit.x,y:p.exit.y+dy};break;}
    if(!destination)continue;
    b.x=destination.x;b.y=destination.y;b.vx=clamp(b.vx,-65,65);b.vy=clamp(Math.max(160,b.vy*.7),160,320);
    b.chaseBoostLeft=0;b.boostFlame=0;b.trail=[];b.warpFlash=1;b.warpColor=p.color;b.usedWarps=[...(b.usedWarps||[]),p.id];b.warpCount=(b.warpCount||0)+1;
    b.motionX=b.x;b.motionY=b.y;b.motionAt=b.lastProgressAt=b.lastSafeAt=s.physicsNow||0;b.lastSafeX=b.x;b.lastSafeY=b.y;b.rescueStage=0;
    s.warpEvent={num:b.num,id:p.id,from:p.from,to:p.to,color:p.color,entry:p.entry,exit:destination,age:0};
    return true;
  }
  return false;
}
