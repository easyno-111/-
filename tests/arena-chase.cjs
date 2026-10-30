const assert=require('node:assert/strict');
global.document={createElement:()=>({getContext:()=>({})})};
(async()=>{
 const {ChaseEvents,clearLanding,racePace}=await import('../js/arena/chase-events.js?v=8.5');
 const {state}=await import('../js/arena/state.js?v=8.5');
 const {audio,fx}=await import('../js/arena/core.js?v=8.5');audio.enabled=false;
 const {buildCourse,raceWorldHeight,startColumns}=await import('../js/arena/courses.js?v=8.5');
 const {makePhysicsBall,updateBall}=await import('../js/arena/physics.js?v=8.5');
 const {updateRace}=await import('../js/arena/engines/race.js?v=8.5');
 const {makeRand}=await import('../js/arena/util.js?v=8.5');
 const fixture=()=>({W:600,H:700,worldH:4000,cameraY:1700,zoom:1,zoomFocusX:300,engine:'race',ending:false,results:[],raceElapsed:12,
  pegs:[],bumpers:[],wheels:[],rotors:[],rails:[],gates:[],balls:Array.from({length:10},(_,i)=>({num:i+1,x:70+i%5*100,y:2200-i*160,r:12,vx:0,vy:120,active:true,motionAt:500}))});
 let s=fixture(), c=new ChaseEvents();assert.ok(c.maybeStart(s));assert.equal(s.chase.type,'mid');assert.equal(s.chase.plans.length,5);
 const coordinates=s.balls.map(b=>[b.x,b.y,b.vx,b.vy]);c.step(s,.6);assert.deepEqual(s.balls.map(b=>[b.x,b.y,b.vx,b.vy]),coordinates,'Camera pan freezes every ball');assert.ok(s.cameraY<1700,'Camera moves upward to the trailing group');assert.equal(s.raceElapsed,12);
 c.step(s,.6);assert.deepEqual(s.balls.map(b=>[b.x,b.y]),coordinates.map(a=>a.slice(0,2)),'Ignition does not resume normal physics');
 const plans=s.chase.plans;while(s.chase)c.step(s,1/60);
 for(const p of plans){assert.ok(p.ball.y<2200);assert.ok(p.ball.y>=p.from.y);assert.equal(p.ball.x,p.from.x,'Boost preserves original lane');assert.ok(p.to.y-p.from.y<=(p.targetY-p.from.y)*.75+1e-6,'Mid boost recovers up to 75% of leader gap');assert.ok(p.to.y<p.targetY);assert.equal(p.ball.chaseBoostLeft,1.6,'Live thrust continues after the cinematic');if(p.to.y!==p.from.y)assert.ok(clearLanding(s,p.ball,p.ball.x,p.ball.y),'Landing must avoid solids/other balls');}
 assert.equal(s.balls[0].y,2200);assert.equal(s.results.length,0);assert.equal(c.maybeStart(s),false,'Middle event only once');
 s.balls[0].y=3855;s.balls[0].vy=100;s.balls.at(-1).y=300;
 assert.ok(c.maybeStart(s));assert.equal(s.chase.type,'final');assert.equal(s.chase.plans[0].num,10);
 const final=s.chase.plans[0];assert.equal(final.targetNum,1,'Last place challenges the leader');assert.ok(final.to.y-final.from.y<=(final.targetY-final.from.y)*.9+1e-6);assert.ok(final.to.y<final.targetY);assert.equal(final.to.x,final.from.x);
 while(s.chase)c.step(s,1/60);assert.equal(s.results.length,0,'Booster never awards a finish');assert.equal(c.maybeStart(s),false);
 s=fixture();s.boostMidEnabled=false;s.boostFinalEnabled=false;c=new ChaseEvents();const off=JSON.stringify(s.balls);assert.equal(c.maybeStart(s),false);assert.equal(JSON.stringify(s.balls),off);
 s=fixture();s.balls=s.balls.slice(0,1);assert.equal(new ChaseEvents().maybeStart(s),false);
 s=fixture();c=new ChaseEvents();c.maybeStart(s);s.chase.cancelled=true;const before=JSON.stringify(s.balls);assert.ok(c.step(s,.1).cancelled);assert.equal(s.chase,null);assert.equal(JSON.stringify(s.balls),before,'Resize cancellation does not snap to stale coordinates');
 // Both central and side lanes recover ground without being horizontally relocated.
 for(const x of [70,300,530]){
  s=fixture();s.boostMidEnabled=false;s.balls[0].y=3855;s.balls.at(-1).x=x;s.balls.at(-1).y=300;s.balls.at(-1).vy=430;c=new ChaseEvents();assert.ok(c.maybeStart(s));
  const p=s.chase.plans[0];assert.equal(p.to.x,x);assert.ok(p.to.y>3000,'Last place rejoins the leading field');
  while(s.chase)c.step(s,1/60);assert.equal(p.ball.chaseBoostLeft,1.4);assert.equal(p.ball.boostFlame,1);assert.equal(s.results.length,0);
 }
 s=fixture();s.boostMidEnabled=false;s.balls=s.balls.slice(0,2);s.balls[0].y=3855;s.balls[1].y=1000;c=new ChaseEvents();c.maybeStart(s);
 assert.equal(s.chase.plans[0].fraction,.9);assert.ok(s.chase.plans[0].to.y>3000,'Two-player race also allows a comeback');
 // A blocked original lane cannot be replaced by an open center/side lane.
 s=fixture();s.boostMidEnabled=false;s.balls[0].y=3855;s.balls.at(-1).y=300;
 const last=s.balls.at(-1);s.rails=[{x1:last.x,y1:300,x2:last.x,y2:3900,w:12}];c=new ChaseEvents();c.maybeStart(s);
 assert.deepEqual(s.chase.plans[0].to,{x:last.x,y:last.y},'No safe spot in original lane means no relocation');
 // Close/tied packs must never be moved backwards or passed by the cinematic.
 s=fixture();s.balls.forEach((b,i)=>b.y=2200-i);c=new ChaseEvents();c.maybeStart(s);for(const p of s.chase.plans)assert.deepEqual(p.to,p.from);
 // The same former-last ball can overtake and WIN via real goal crossing.
 // With live thrust removed at the same re-entry position, the former leader wins.
 const duel=boost=>{
  Object.assign(state,fixture(),{style:'quick',drawCount:1,boostMidEnabled:false,boostFinalEnabled:true,physicsStep:0,replayFrames:[],rescueCount:0,comeback:'pure'});
  state.balls=[makePhysicsBall(1,280,3530,12,0,1),makePhysicsBall(2,320,1000,12,1,1)];state.balls[0].vy=250;state.balls[1].vy=50;
  const event=new ChaseEvents();assert.ok(event.maybeStart(state));assert.equal(state.chase.type,'final');
  const landingY=state.chase.plans[0].to.y;while(state.chase)event.step(state,1/60);
  assert.ok(landingY<3530,'No leader pass during the frozen scene');assert.equal(state.results.length,0);
  if(!boost)state.balls[1].chaseBoostLeft=0;
  for(let i=0;i<600&&!state.ending;i++)updateRace(4000+i*1000/120,1/120);
  return state.results[0];
 };
 assert.equal(duel(true),2,'Former last must be able to win after live thrust');assert.equal(duel(false),1,'Same re-entry without thrust must retain the leader');
 // Boosting still collides with obstacles and stops when its option is off.
 Object.assign(state,fixture(),{style:'quick',boostFinalEnabled:true,comeback:'pure',physicsStep:0});
 const boosted=makePhysicsBall(2,300,1000,12,0,1);Object.assign(boosted,{vy:650,chaseBoostLeft:1.4,chaseBoostKind:'final'});state.balls=[boosted];state.pegs=[{x:300,y:1020,r:12,hit:0}];
 updateBall(boosted,10,1/120);assert.ok(boosted.vy<0,'Live boost must bounce off a peg');
 state.pegs=[];state.boostFinalEnabled=false;updateBall(boosted,20,1/120);assert.equal(boosted.chaseBoostLeft,0);
 Object.assign(boosted,{x:300,y:500,vy:500,chaseBoostLeft:.05,chaseBoostKind:'final'});state.boostFinalEnabled=true;
 for(let i=0;i<12;i++)updateBall(boosted,30+i*1000/120,1/120);
 assert.equal(boosted.chaseBoostLeft,0);assert.ok(boosted.vy<=437,'Live boost expires and returns to the normal speed limit');
 Object.assign(boosted,{chaseBoostLeft:1,chaseBoostKind:'mid'});state.boostMidEnabled=false;updateBall(boosted,200,1/120);assert.equal(boosted.chaseBoostLeft,0,'Middle toggle independently disables its thrust');
 console.log('PASS cinematic freeze, original lanes, strong leader-gap recovery, real last-place victory, collision and toggle enforcement');
 const old=Math.random,samples=[];
 try{
  for(const width of [390,1366])for(const style of ['quick','tension'])for(const course of ['factory','split','tower'])for(const enabled of [false,true])for(const count of [1,10])for(const seed of [17,431,902]){
   Math.random=makeRand(seed);Object.assign(state,{W:width,H:700,style,course,raceCount:30,courseSeed:seed,comeback:'pure',results:[],ending:false,engine:'race',physicsStep:0,replayFrames:[],rescueCount:0,drawCount:count,raceElapsed:0,boostMidEnabled:enabled,boostFinalEnabled:enabled,cameraY:0,zoom:1,zoomFocusX:width/2});
   state.worldH=raceWorldHeight();buildCourse();fx.reset();const chase=new ChaseEvents();chase.reset(state);
   const cols=startColumns(),gap=width*.72/(cols-1),r=width<520?12:16;
   state.balls=Array.from({length:30},(_,i)=>{const b=makePhysicsBall(i+1,width*.14+i%cols*gap,52+Math.floor(i/cols)*38,r,i,1);b.vx=(Math.random()-.5)*155+(width/2-b.x)*.39;b.vy=55+Math.random()*71;return b;});
   let wall=0,acc=0,events=0,slow=0,finalLast=null,finalLeader=null,gateFirst=null;
   for(let frame=0;frame<60*55&&!state.ending;frame++){
    wall+=1/60;fx.update(1/60);
    if(gateFirst===null){const first=state.balls.filter(b=>b.active&&b.y>=state.finalGate.startY).sort((a,b)=>b.y-a.y)[0];if(first)gateFirst=first.num;}
    if(chase.maybeStart(state)){events++;acc=0;if(state.chase.type==='final'){finalLast=state.chase.plans[0].num;finalLeader=state.chase.leaderNum;}}
    if(state.chase){const event=chase.step(state,1/60);if(event?.ended&&event.type==='final')slow=wall+.8;continue;}
    state.raceElapsed+=1/60;const scale=wall<slow?.42:1;acc+=1/60*racePace(state)*scale;
    let loops=0;while(acc>=1/120&&loops++<48){if(chase.maybeStart(state)){events++;acc=0;if(state.chase.type==='final'){finalLast=state.chase.plans[0].num;finalLeader=state.chase.leaderNum;}break;}updateRace(wall*1000+1,1/120);acc-=1/120;}
   }
   const total=wall+2.44+5.4;const result={width,style,course,enabled,count,seed,seconds:+total.toFixed(2),finished:state.results.length,events,winner:state.results[0],finalLast,finalLeader,gateFirst,warps:state.balls.reduce((n,b)=>n+(b.warpCount||0),0)};samples.push(result);console.log('ROUND',JSON.stringify(result));
   assert.equal(state.results.length,count,'Round must finish its requested count');assert.ok(total<60,`Round budget: ${JSON.stringify(result)}`);assert.equal(events,enabled?2:0);
  }
 }finally{Math.random=old;}
 const finals=samples.filter(r=>r.enabled&&r.count===1),lastWins=finals.filter(r=>r.winner===r.finalLast).length;
 assert.ok(lastWins>0,'Natural course samples must include a real last-place victory');assert.ok(lastWins<finals.length,'Booster must not guarantee a last-place win');
 const gateLosses=samples.filter(r=>r.count===1&&r.gateFirst!==null&&r.winner!==r.gateFirst).length;assert.ok(gateLosses>0,'The final gate must allow its first entrant to lose');
 console.log(`COMEBACK last-place wins ${lastWins}/${finals.length}; gate first-entrant losses ${gateLosses}`);
 console.log(`PASS ${samples.length} complete round budgets including countdown and result/replay allowance`);
})().catch(e=>{console.error(e);process.exitCode=1;});
