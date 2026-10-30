const assert=require('node:assert/strict');
global.document={createElement:()=>({getContext:()=>({})})};
(async()=>{
 const {ChaseEvents,clearLanding,racePace}=await import('../js/arena/chase-events.js?v=8.2');
 const {state}=await import('../js/arena/state.js?v=8.2');
 const {audio,fx}=await import('../js/arena/core.js?v=8.2');audio.enabled=false;
 const {buildCourse,raceWorldHeight,startColumns}=await import('../js/arena/courses.js?v=8.2');
 const {makePhysicsBall}=await import('../js/arena/physics.js?v=8.2');
 const {updateRace}=await import('../js/arena/engines/race.js?v=8.2');
 const {makeRand}=await import('../js/arena/util.js?v=8.2');
 const fixture=()=>({W:600,H:700,worldH:4000,cameraY:1700,zoom:1,zoomFocusX:300,engine:'race',ending:false,results:[],raceElapsed:12,
  pegs:[],bumpers:[],wheels:[],rotors:[],rails:[],gates:[],balls:Array.from({length:10},(_,i)=>({num:i+1,x:70+i%5*100,y:2200-i*160,r:12,vx:0,vy:120,active:true,motionAt:500}))});
 let s=fixture(), c=new ChaseEvents();assert.ok(c.maybeStart(s));assert.equal(s.chase.type,'mid');assert.equal(s.chase.plans.length,5);
 const coordinates=s.balls.map(b=>[b.x,b.y,b.vx,b.vy]);c.step(s,.6);assert.deepEqual(s.balls.map(b=>[b.x,b.y,b.vx,b.vy]),coordinates,'Camera pan freezes every ball');assert.ok(s.cameraY<1700,'Camera moves upward to the trailing group');assert.equal(s.raceElapsed,12);
 c.step(s,.6);assert.deepEqual(s.balls.map(b=>[b.x,b.y]),coordinates.map(a=>a.slice(0,2)),'Ignition does not resume normal physics');
 const plans=s.chase.plans;while(s.chase)c.step(s,1/60);
 for(const p of plans){assert.ok(p.ball.y<2200);assert.ok(p.ball.y>=p.from.y);if(p.to.y!==p.from.y)assert.ok(clearLanding(s,p.ball,p.ball.x,p.ball.y),'Landing must avoid solids/other balls');}
 assert.equal(s.balls[0].y,2200);assert.equal(s.results.length,0);assert.equal(c.maybeStart(s),false,'Middle event only once');
 s.balls[0].y=3855;s.balls[0].vy=100;s.balls.at(-1).y=300;
 assert.ok(c.maybeStart(s));assert.equal(s.chase.type,'final');assert.equal(s.chase.plans[0].num,10);
 const final=s.chase.plans[0];assert.ok(final.to.y>s.worldH-400,'Last place reaches the final zone');assert.ok(final.to.y<s.balls[0].y);
 while(s.chase)c.step(s,1/60);assert.equal(s.results.length,0,'Booster never awards a finish');assert.equal(c.maybeStart(s),false);
 s=fixture();s.boostMidEnabled=false;s.boostFinalEnabled=false;c=new ChaseEvents();const off=JSON.stringify(s.balls);assert.equal(c.maybeStart(s),false);assert.equal(JSON.stringify(s.balls),off);
 s=fixture();s.balls=s.balls.slice(0,1);assert.equal(new ChaseEvents().maybeStart(s),false);
 s=fixture();c=new ChaseEvents();c.maybeStart(s);s.chase.cancelled=true;const before=JSON.stringify(s.balls);assert.ok(c.step(s,.1).cancelled);assert.equal(s.chase,null);assert.equal(JSON.stringify(s.balls),before,'Resize cancellation does not snap to stale coordinates');
 console.log('PASS cinematic freeze, upward camera, lower-half selection, safe landing, lead bound, final chase, toggles, one-shot and resize cancellation');
 const old=Math.random,samples=[];
 try{
  for(const width of [390,1366])for(const style of ['quick','tension'])for(const course of ['factory','split','tower'])for(const enabled of [false,true])for(const count of [1,10])for(const seed of [17,431,902]){
   Math.random=makeRand(seed);Object.assign(state,{W:width,H:700,style,course,raceCount:30,courseSeed:seed,comeback:'pure',results:[],ending:false,engine:'race',physicsStep:0,replayFrames:[],rescueCount:0,drawCount:count,raceElapsed:0,boostMidEnabled:enabled,boostFinalEnabled:enabled,cameraY:0,zoom:1,zoomFocusX:width/2});
   state.worldH=raceWorldHeight();buildCourse();fx.reset();const chase=new ChaseEvents();chase.reset(state);
   const cols=startColumns(),gap=width*.72/(cols-1),r=width<520?12:16;
   state.balls=Array.from({length:30},(_,i)=>{const b=makePhysicsBall(i+1,width*.14+i%cols*gap,52+Math.floor(i/cols)*38,r,i,1);b.vx=(Math.random()-.5)*155+(width/2-b.x)*.39;b.vy=55+Math.random()*71;return b;});
   let wall=0,acc=0,events=0,slow=0;
   for(let frame=0;frame<60*55&&!state.ending;frame++){
    wall+=1/60;fx.update(1/60);
    if(chase.maybeStart(state)){events++;acc=0;}
    if(state.chase){const event=chase.step(state,1/60);if(event?.ended&&event.type==='final')slow=wall+.8;continue;}
    state.raceElapsed+=1/60;const scale=wall<slow?.42:1;acc+=1/60*racePace(state)*scale;
    let loops=0;while(acc>=1/120&&loops++<48){if(chase.maybeStart(state)){events++;acc=0;break;}updateRace(wall*1000+1,1/120);acc-=1/120;}
   }
   const total=wall+2.44+5.4;const result={width,style,course,enabled,count,seed,seconds:+total.toFixed(2),finished:state.results.length,events};samples.push(result);console.log('ROUND',JSON.stringify(result));
   assert.equal(state.results.length,count,'Round must finish its requested count');assert.ok(total<60,`Round budget: ${JSON.stringify(result)}`);assert.equal(events,enabled?2:0);
  }
 }finally{Math.random=old;}
 console.log(`PASS ${samples.length} complete round budgets including countdown and result/replay allowance`);
})().catch(e=>{console.error(e);process.exitCode=1;});
