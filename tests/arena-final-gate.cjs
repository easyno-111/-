const assert=require('node:assert/strict'),crypto=require('node:crypto');
global.document={createElement:()=>({getContext:()=>({})})};
(async()=>{
 const {state}=await import('../js/arena/state.js?v=8.7');
 const {audio,fx}=await import('../js/arena/core.js?v=8.7');audio.enabled=false;
 const {buildCourse,raceWorldHeight,raceMainHeight}=await import('../js/arena/courses.js?v=8.7');
 const {FINAL_GATE_HEIGHT}=await import('../js/arena/final-gate.js?v=8.7');
 const {makePhysicsBall,updateBall,collideWheel}=await import('../js/arena/physics.js?v=8.7');
 const {ChaseEvents}=await import('../js/arena/chase-events.js?v=8.7');
 const {makeRand}=await import('../js/arena/util.js?v=8.7');
 const frontHashes={"390/quick/factory":"bebf06735606cba9e292427c3bbf54c8da26818841d33a8c661d9e8915a66810","390/quick/split":"53b7940e9e7a1636b9413821a923f51298d2c1cf2856a5fc6a36b04a25d152c8","390/quick/tower":"f060b40118b5d6ede400a7bf92c961c2c1de81d5c24d0f10cf141278d8171542","390/tension/factory":"e5f746a077f0b30d5ae695f23fe9c1f149aa921c91649bee59421e18236191c4","390/tension/split":"89304e18af6d26f3e78f8d0c6b251512955641eb3b4e17dd2a7f2643ec5b51c8","390/tension/tower":"465d38147714f46ecc525b8d1145fe4da2d80b3210b199f240cd4db269b1d9cb","1366/quick/factory":"f013d3419bc4882e0c025f216838f6cfbd9ecd5d6a38b8127ab3c80fbebf8308","1366/quick/split":"de8c76fed9414f0916a64e9ca363e26f02a3ceca532b6fe1a101f109470ac74b","1366/quick/tower":"433572774453317db31913ef2788df09818598d73f90878b2acb7b8097f27ecd","1366/tension/factory":"9546c9a58cb625278b476a53b016d9954af0ea582b599f300a27df428c5bc5dd","1366/tension/split":"3d8e0983e0212a8376bd9983bc6d8ecf01f3dc4179ce18ea58d389e13b930855","1366/tension/tower":"a98a2ae495590c71fbcd9e5e2bc9baf337f9166a11c9c874ccd391a40f90cfb8"};
 function setup(W=390,style='quick',course='factory'){
  Object.assign(state,{W,H:700,style,course,courseSeed:431,raceCount:30,engine:'race',results:[],ending:false,comeback:'pure',balls:[],physicsStep:0,raceElapsed:20,boostMidEnabled:true,boostFinalEnabled:true,cameraY:0,zoom:1,zoomFocusX:W/2});
  state.worldH=raceWorldHeight();buildCourse();fx.reset();return state.finalGate;
 }
 for(const W of [300,390,768,1366])for(const style of ['quick','tension'])for(const course of ['factory','split','tower']){
  const g=setup(W,style,course),r=W<520?12:16;
  assert.equal(state.worldH,raceMainHeight()+FINAL_GATE_HEIGHT);assert.equal(g.lanes.length,W<360?2:W<760?3:5);assert.equal(g.portals,undefined,'No warps remain');
  assert.ok(g.lanes.every(l=>l.half*2>r*2+12));assert.ok(g.kicker.finalKicker);assert.ok(g.mergeY<g.kicker.y&&g.kicker.y<g.endY);
  const tipGap=g.throatHalf-g.kicker.r-3-5;assert.ok(tipGap>=3&&tipGap<=6,'Blade and wall surfaces nearly meet without touching');assert.ok(tipGap<r*2,'No full ball can bypass a horizontal blade at its tip');
  for(const l of g.lanes)assert.ok(g.rails.filter(r=>r.y1===g.startY+130&&r.y2===g.startY+720&&Math.abs(Math.abs(r.x1-l.x)-l.half)<.001).length>=1,'Corridor walls remain continuous');
  if(frontHashes[`${W}/${style}/${course}`]){
   const geometry={pegs:state.pegs,bumpers:state.bumpers,wheels:state.wheels.filter(w=>!w.finalGate),rotors:state.rotors,gates:state.gates,rails:state.rails.filter(r=>!r.finish&&!r.finalGate)};
   assert.equal(crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),frontHashes[`${W}/${style}/${course}`],'Front-course layout remains unchanged');
  }
 }
 let g=setup();state.boostMidEnabled=false;state.balls=[makePhysicsBall(1,100,g.startY-50,12,0,1),makePhysicsBall(2,250,500,12,1,1)];state.balls[0].vy=200;
 const c=new ChaseEvents();assert.ok(c.maybeStart(state));assert.equal(state.chase.type,'final');assert.ok(state.chase.plans[0].to.y<=g.startY-80);
 while(state.chase)c.step(state,1/60);assert.equal(state.balls[1].chaseBoostLeft,.9);
 g=setup();g.kicker.angle=0;const bounced=makePhysicsBall(1,g.kicker.x+22,g.kicker.y-10,12,0,1);bounced.vy=300;
 assert.ok(collideWheel(bounced,g.kicker,1/120));assert.ok(bounced.vy<0,'Final kicker can throw an approaching leader back');assert.ok(bounced.finalKickerHits>0);
 const old=Math.random,arrivals=[];
 try{for(const W of [300,390,768,1366])for(let lane=0;lane<(W<360?2:W<760?3:5);lane++)for(const seed of [17,431,902]){
  g=setup(W);Math.random=makeRand(seed);const b=makePhysicsBall(1,g.lanes[lane].x,g.startY-30,W<520?12:16,0,1);b.vy=180;b.vx=(Math.random()-.5)*70;state.balls=[b];let time=0,exitTime=0,goal=false;
  for(let step=0;step<120*40;step++){time=(step+1)/120;state.physicsStep++;for(const w of state.wheels)w.angle+=w.speed/120;
   const outcome=updateBall(b,1+step*1000/120,1/120);if(!exitTime&&b.y>=g.startY+720)exitTime=time;
   if(outcome==='goal'){goal=true;break;}
  }
  console.log('LANE',JSON.stringify({W,lane:lane+1,type:g.lanes[lane].type,seed,time:+time.toFixed(2),goal,hits:b.finalKickerHits||0,x:+b.x.toFixed(1),y:+(b.y-g.startY).toFixed(1),vx:+b.vx.toFixed(1),vy:+b.vy.toFixed(1)}));
  assert.ok(goal,`Lane ${lane+1} at ${W} seed ${seed} must finish`);assert.ok(Number.isFinite(b.x));arrivals.push({W,lane:lane+1,type:g.lanes[lane].type,time,exitTime});
 }}finally{Math.random=old;}
 // Dense groups must queue at the wide blades, then all finish naturally.
 for(const W of [390,1366])for(const phase of [0,Math.PI/6,Math.PI/3]){
  g=setup(W);g.kicker.angle=phase;state.drawCount=12;state.physicsStep=0;state.replayFrames=[];state.rescueCount=0;
  const {updateRace}=await import('../js/arena/engines/race.js?v=8.7');
  state.balls=Array.from({length:12},(_,i)=>{const b=makePhysicsBall(i+1,W/2+(i%3-1)*37,g.mergeY-35-Math.floor(i/3)*38,W<520?12:16,i,1);b.vy=220;return b;});
  let peak=0,steps=0;
  for(;steps<120*45&&!state.ending;steps++){
   updateRace(1+steps*1000/120,1/120);fx.update(1/120);
   peak=Math.max(peak,state.balls.filter(b=>b.active&&b.y>g.kicker.y-150&&b.y<g.kicker.y+15).length);
  }
  const hits=state.balls.reduce((n,b)=>n+(b.finalKickerHits||0),0);
  console.log('QUEUE',JSON.stringify({W,phase,seconds:+(steps/120).toFixed(2),peak,hits,finished:state.results.length}));
  assert.equal(state.results.length,12,'All queued balls must escape without forced winners');assert.ok(peak>=3,'The enlarged blades create a real queue');assert.ok(hits>0);
 }
 const fast=arrivals.filter(a=>a.type==='speed'),slow=arrivals.filter(a=>a.type!=='speed');
 const avg=a=>a.reduce((n,v)=>n+v.exitTime,0)/a.length;assert.ok(avg(fast)<avg(slow),'Fast corridors must reach the merger earlier on average, before the common kicker');
 console.log(`PASS unchanged front layout, enclosed corridors, common merger, final bounce and ${arrivals.length} lane completions; before merger fast ${avg(fast).toFixed(2)}s / slow ${avg(slow).toFixed(2)}s`);
})().catch(e=>{console.error(e);process.exitCode=1;});
