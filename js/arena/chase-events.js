import { clamp } from './util.js?v=8.7';
import { clearLanding } from './landing.js?v=8.7';
export { clearLanding } from './landing.js?v=8.7';

function landing(s, ball, nominal, maxY, reserved) {
  if(maxY<=ball.y+8)return{x:ball.x,y:ball.y};
  // Preserve the lane: never trade a blocked landing for a better horizontal route.
  const step=ball.r+4;
  for(let y=Math.min(maxY,Math.max(ball.y,nominal));y>=ball.y+4;y-=step) {
    if(clearLanding(s,ball,ball.x,y,reserved))return{x:ball.x,y};
  }
  return{x:ball.x,y:ball.y};
}
export class ChaseEvents {
  constructor(){this.reset();}
  reset(s){this.midDone=false;this.finalDone=false;this.event=null;if(s){s.chase=null;for(const b of s.balls){b.boostFlame=0;b.chaseBoostLeft=0;b.chaseBoostKind=null;}}}
  maybeStart(s) {
    if(this.event || s.ending || s.results.length || s.engine!=='race')return false;
    const ranked=s.balls.filter(b=>b.active).sort((a,b)=>b.y-a.y||a.num-b.num);
    if(ranked.length<2)return false;
    const leader=ranked[0], goal=s.worldH-54, gate=s.finalGate;
    const midGoal=gate?gate.mainHeight-54:goal,finalStart=gate?gate.startY-60:goal-420;
    let type=null;
    if(!this.midDone && s.boostMidEnabled!==false && leader.y>=midGoal*.48)type='mid';
    else if(!this.finalDone && s.boostFinalEnabled!==false && leader.y>=finalStart && leader.vy>0)type='final';
    if(!type)return false;
    if(type==='mid')this.midDone=true;else this.finalDone=true;
    const selected=type==='mid'?ranked.slice(-Math.floor(ranked.length/2)):[ranked[ranked.length-1]];
    const reserved=[],plans=[];
    selected.forEach((ball,index)=>{
      // Recover most of the gap to the leader, then earn overtakes in live physics.
      const gap=Math.max(0,leader.y-ball.y),fraction=type==='mid'?.75:.90;
      const guard=type==='mid'?110+index*(ball.r*2+10):140;
      const maxY=Math.min(leader.y-guard,type==='final'&&gate?gate.startY-80:goal-240);
      const nominal=Math.min(maxY,ball.y+gap*fraction);
      const to=landing(s,ball,nominal,maxY,reserved);reserved.push({...to,r:ball.r});
      plans.push({ball,num:ball.num,targetNum:leader.num,targetY:leader.y,fraction,from:{x:ball.x,y:ball.y},to,vx:ball.vx,vy:ball.vy});
    });
    this.event={type,phase:'freeze',age:0,plans,leaderNum:leader.num,leaderY:leader.y,
      startCamera:s.cameraY,startZoom:s.zoom,startFocus:s.zoomFocusX,cancelled:false};
    s.chase=this.event;s.physicsAccumulator=0;s.raceEvent=null;return true;
  }
  step(s,dt) {
    const e=this.event;if(!e)return null;
    if(e.cancelled){this.event=null;s.chase=null;return{ended:true,type:e.type,cancelled:true};}
    e.age+=dt;
    const a=e.age,panStart=.18,panEnd=.82,chargeEnd=1.24,launchEnd=2.34,total=2.88;
    e.phase=a<panStart?'freeze':a<panEnd?'pan':a<chargeEnd?'charge':a<launchEnd?'boost':'return';
    const progress=clamp((a-chargeEnd)/(launchEnd-chargeEnd),0,1),ease=1-Math.pow(1-progress,3);
    for(const p of e.plans){
      p.ball.x=p.from.x+(p.to.x-p.from.x)*ease;p.ball.y=p.from.y+(p.to.y-p.from.y)*ease;
      p.ball.boostFlame=a>=panEnd?1:0;p.ball.boostDx=p.to.x-p.from.x;p.ball.boostDy=Math.max(1,p.to.y-p.from.y);
    }
    const points=e.plans.map(p=>p.ball);
    // Visit the last ball first; include the leader once both fit the shot.
    if(e.type==='final'){const ahead=s.balls.find(b=>b.num===e.plans[0].targetNum);if(ahead&&Math.abs(ahead.y-points[0].y)<s.H*.65/.35-130)points.push(ahead);}
    const ys=points.map(b=>b.y);
    const middle=ys.reduce((a,b)=>a+b,0)/ys.length;
    const leader=s.balls.find(b=>b.num===e.leaderNum);
    const returnMix=clamp((a-launchEnd)/(total-launchEnd),0,1);
    const focus=middle+(Math.max(0,(leader?.y||e.leaderY))-middle)*returnMix;
    const groupZoom=clamp(s.H*.68/(Math.max(...ys)-Math.min(...ys)+130),.35,.95);
    const targetZoom=groupZoom+(1.18-groupZoom)*returnMix;
    const panMix=clamp((a-panStart)/(panEnd-panStart),0,1);
    const smooth=panMix*panMix*(3-2*panMix);
    const targetCamera=clamp(focus-s.H*.56,0,Math.max(0,s.worldH-s.H*.18));
    if(a<panEnd){s.cameraY=e.startCamera+(targetCamera-e.startCamera)*smooth;s.zoom=e.startZoom+(targetZoom-e.startZoom)*smooth;}
    else{s.cameraY+=(targetCamera-s.cameraY)*(1-Math.exp(-dt*10));s.zoom+=(targetZoom-s.zoom)*(1-Math.exp(-dt*8));}
    s.zoomFocusX+=(s.W/2-s.zoomFocusX)*(1-Math.exp(-dt*8));
    if(a>=total){
      // Stuck detection and temporary collision timers pause with the race too.
      for(const b of s.balls)for(const key of ['motionAt','lastProgressAt','lastSafeAt','lastBoostAt','ghostUntil','shrinkUntil'])if(Number.isFinite(b[key])&&b[key])b[key]+=e.age*1000;
      for(const p of e.plans){p.ball.x=p.to.x;p.ball.y=p.to.y;p.ball.vx=clamp(p.vx,-80,80);p.ball.vy=clamp(Math.max(p.vy,e.type==='mid'?250:300),0,437);p.ball.chaseBoostLeft=e.type==='mid'?1.6:(s.finalGate ? .9 : 1.4);p.ball.chaseBoostKind=e.type;p.ball.boostFlame=1;p.ball.boostDx=0;p.ball.boostDy=1;}
      this.event=null;s.chase=null;return{ended:true,type:e.type};
    }
    return{ended:false,phase:e.phase,type:e.type};
  }
}
// Global pace only changes how much real physics runs; it does not pick winners.
export function racePace(s) {
  const active=s.balls.filter(b=>b.active),leader=active.reduce((n,b)=>Math.max(n,b.y),0);
  const progress=clamp(leader/((s.finalGate?.mainHeight||s.worldH)-54),.03,1),target=s.style==='tension'?25:19;
  const scheduled=clamp((s.raceElapsed||0)/target,0,1);
  let pace=clamp((scheduled+.18)/(progress+.18),.6,3.4);
  if(s.results.length)pace=Math.max(1.15,pace);
  if((s.raceElapsed||0)>30)pace=Math.max(pace,2+((s.raceElapsed||0)-30)*.6);
  return Math.min(8,pace);
}
