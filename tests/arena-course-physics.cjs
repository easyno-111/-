// Headless physics uses the production engine; only the unused canvas/audio surface is stubbed.
const assert = require('node:assert/strict');
global.document = { createElement: () => ({ getContext: () => ({}) }) };
(async () => {
 const { state } = await import('../js/arena/state.js?v=8.3');
 const { audio, fx } = await import('../js/arena/core.js?v=8.3'); audio.enabled = false;
 const { buildCourse, raceWorldHeight, startColumns } = await import('../js/arena/courses.js?v=8.3');
 const { makePhysicsBall, collideWheel } = await import('../js/arena/physics.js?v=8.3');
 const { updateRace } = await import('../js/arena/engines/race.js?v=8.3');
 const { makeRand } = await import('../js/arena/util.js?v=8.3');
 const originalRandom = Math.random;
 const samples=[];
 function build(width,style,course,seed=17) {
  Object.assign(state,{W:width,H:700,style,course,raceCount:30,courseSeed:seed,comeback:'pure',worldH:0,results:[],ending:false,physicsStep:0,replayFrames:[],rescueCount:0,drawCount:3});
  state.worldH=raceWorldHeight();buildCourse();
 }
 // Deterministic geometry checks across small phones, tablets and desktops.
 for (const width of [300,390,768,1366]) for (const style of ['quick','tension']) {
  build(width,style,'tower');
  const ballR=width<520?12:16, clearance=ballR*2+20;
  assert.ok(state.wheels.length>=2);
  function segmentDistance(w,r){const dx=r.x2-r.x1,dy=r.y2-r.y1,t=Math.max(0,Math.min(1,((w.x-r.x1)*dx+(w.y-r.y1)*dy)/(dx*dx+dy*dy)));return Math.hypot(w.x-r.x1-t*dx,w.y-r.y1-t*dy);}
  for(const w of state.wheels)for(const rail of state.rails)assert.ok(segmentDistance(w,rail)-w.r-rail.w/2>=ballR*2+10,'No pinches between wheels and re-entry ramps');
  for(const w of state.wheels){assert.ok(w.x-w.r-20>=clearance);assert.ok(width-20-w.x-w.r>=clearance);assert.ok(w.y-w.r>250);assert.ok(w.y+w.r<state.worldH-445);}
  for(let i=0;i<state.wheels.length;i++)for(let j=i+1;j<state.wheels.length;j++){
   const a=state.wheels[i],b=state.wheels[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r>=clearance,'Wheel envelopes must leave a ball passage');
  }
  build(width,style,'factory');assert.ok(state.bumpers.length>=8,'Factory must have many obstacles');
  for(const b of state.bumpers)for(const rail of state.rails)assert.ok(segmentDistance(b,rail)-b.r-rail.w/2>=ballR*2+10,'No pinches between bumpers and re-entry ramps');
  for(const b of state.bumpers){assert.ok(b.x-b.r-20>=clearance);assert.ok(width-20-b.x-b.r>=clearance);}
  for(let i=0;i<state.bumpers.length;i++)for(let j=i+1;j<state.bumpers.length;j++){
   const a=state.bumpers[i],b=state.bumpers[j];if(Math.abs(a.y-b.y)>150)continue;
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r>=clearance,'Bumper gaps fit a ball');
  }
 }
 const wheel={x:150,y:200,r:80,speed:.8,hit:0};
 const top={x:150,y:111,r:12,vx:0,vy:50};
 assert.ok(collideWheel(top,wheel,1/120));assert.ok(top.vx>0,'Rotating surface carries a ball off the top');
 assert.ok(Math.hypot(top.x-wheel.x,top.y-wheel.y)>=20);
 const inside={x:180,y:230,r:10,vx:0,vy:20};assert.equal(collideWheel(inside,wheel,1/120),false,'Open quadrant admits the ball inside the frame');
 const center={x:150,y:200,r:12,vx:0,vy:0};collideWheel(center,wheel,1/120);assert.ok(Number.isFinite(center.vx)&&Number.isFinite(center.x),'Exact center collision has a finite escape normal');
 const profiles=[390,1366];
 const seeds=process.env.ARENA_FULL_MATRIX ? [17,431,902] : [431];
 const target=process.env.ARENA_FULL_MATRIX ? 10 : 3;
 try {
  for(const width of profiles)for(const course of ['factory','split','tower'])for(const seed of seeds){
   Math.random=makeRand(seed);build(width,'tension',course,seed);state.drawCount=target;fx.reset();
   const cols=startColumns(),left=state.W*.14,gap=state.W*.72/(cols-1),r=width<520?12:16;
   state.balls=Array.from({length:30},(_,i)=>makePhysicsBall(i+1,left+i%cols*gap,52+Math.floor(i/cols)*38,r,i,1));
   let step=0,thirdAt=0;
   for(;step<120*540&&!state.ending;step++){
    updateRace(1+step*1000/120,1/120);fx.update(1/120);
    if(!thirdAt&&state.results.length>=3)thirdAt=(step+1)/120;
    if(step%120===0)for(const b of state.balls)assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y),'Physics must stay finite');
   }
   const sample={width,course,seed,height:state.worldH,seconds:+(step/120).toFixed(2),thirdAt:+thirdAt.toFixed(2),finished:state.results.length,rescues:state.rescueCount,wheels:state.wheels.length,bumpers:state.bumpers.length};samples.push(sample);console.log('SIMULATION',JSON.stringify(sample));
   assert.equal(state.results.length,target,`${width}/${course}/${seed} must finish without forced results`);
   assert.ok(thirdAt>0,'Physical course reaches the goal');
   assert.equal(new Set(state.results).size,target);
  }
 }finally{Math.random=originalRandom;}
 console.log(`PASS course clearance, rotating contact and ${samples.length} long-course completion samples`);
})().catch(e=>{console.error(e);process.exitCode=1;});
