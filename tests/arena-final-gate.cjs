const assert=require('node:assert/strict'),crypto=require('node:crypto');
global.document={createElement:()=>({getContext:()=>({})})};
(async()=>{
 const {state}=await import('../js/arena/state.js?v=8.5');
 const {audio,fx}=await import('../js/arena/core.js?v=8.5');audio.enabled=false;
 const {buildCourse,raceWorldHeight,raceMainHeight}=await import('../js/arena/courses.js?v=8.5');
 const {updateFinalGate,FINAL_GATE_HEIGHT}=await import('../js/arena/final-gate.js?v=8.5');
 const {makePhysicsBall,updateBall}=await import('../js/arena/physics.js?v=8.5');
 const {ChaseEvents,clearLanding}=await import('../js/arena/chase-events.js?v=8.5');
 const {makeRand}=await import('../js/arena/util.js?v=8.5');
 const frontHashes={"390/quick/factory":"bebf06735606cba9e292427c3bbf54c8da26818841d33a8c661d9e8915a66810","390/quick/split":"53b7940e9e7a1636b9413821a923f51298d2c1cf2856a5fc6a36b04a25d152c8","390/quick/tower":"f060b40118b5d6ede400a7bf92c961c2c1de81d5c24d0f10cf141278d8171542","390/tension/factory":"e5f746a077f0b30d5ae695f23fe9c1f149aa921c91649bee59421e18236191c4","390/tension/split":"89304e18af6d26f3e78f8d0c6b251512955641eb3b4e17dd2a7f2643ec5b51c8","390/tension/tower":"465d38147714f46ecc525b8d1145fe4da2d80b3210b199f240cd4db269b1d9cb","1366/quick/factory":"f013d3419bc4882e0c025f216838f6cfbd9ecd5d6a38b8127ab3c80fbebf8308","1366/quick/split":"de8c76fed9414f0916a64e9ca363e26f02a3ceca532b6fe1a101f109470ac74b","1366/quick/tower":"433572774453317db31913ef2788df09818598d73f90878b2acb7b8097f27ecd","1366/tension/factory":"9546c9a58cb625278b476a53b016d9954af0ea582b599f300a27df428c5bc5dd","1366/tension/split":"3d8e0983e0212a8376bd9983bc6d8ecf01f3dc4179ce18ea58d389e13b930855","1366/tension/tower":"a98a2ae495590c71fbcd9e5e2bc9baf337f9166a11c9c874ccd391a40f90cfb8"};
 function setup(W=390,style='quick',course='factory'){
  Object.assign(state,{W,H:700,style,course,courseSeed:431,raceCount:30,engine:'race',results:[],ending:false,comeback:'pure',balls:[],physicsStep:0,physicsNow:100,raceElapsed:20,boostMidEnabled:true,boostFinalEnabled:true,cameraY:0,zoom:1,zoomFocusX:W/2});
  state.worldH=raceWorldHeight();buildCourse();fx.reset();return state.finalGate;
 }
 for(const W of [300,390,768,1366])for(const style of ['quick','tension'])for(const course of ['factory','split','tower']){
  const g=setup(W,style,course),r=W<520?12:16;
  assert.equal(state.worldH,raceMainHeight()+FINAL_GATE_HEIGHT);assert.equal(g.lanes.length,5);assert.equal(g.portals.length,2);assert.equal(g.wheels.length,2);
  assert.ok(g.lanes.every(l=>l.half*2>r*2+8),'All five mouths admit a full-size ball');
  for(const p of g.portals){assert.ok(p.exit.y<state.worldH-300);const b=makePhysicsBall(1,p.exit.x,p.exit.y,r,0,1);assert.ok(clearLanding(state,b,b.x,b.y),'Portal exits are clear of static obstacles');}
  if(frontHashes[`${W}/${style}/${course}`]){
   const geometry={pegs:state.pegs,bumpers:state.bumpers,wheels:state.wheels.filter(w=>!w.finalGate),rotors:state.rotors,gates:state.gates,rails:state.rails.filter(r=>!r.finish&&!r.finalGate)};
   assert.equal(crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),frontHashes[`${W}/${style}/${course}`],'Front-course obstacle positions and length match V8.4 exactly');
  }
 }
 let g=setup(),p=g.portals[0],b=makePhysicsBall(1,p.entry.x,p.entry.y+1,12,0,1);state.balls=[b];b.vy=300;
 assert.ok(updateFinalGate(state,b,{x:b.x,y:p.entry.y-4},1/120));assert.equal(b.usedWarps[0],'A');assert.equal(b.x,p.exit.x);assert.equal(state.results.length,0);assert.equal(b.chaseBoostLeft,0);
 assert.equal(state.warpEvent.to,5);b.x=p.entry.x;b.y=p.entry.y+1;b.vy=300;assert.equal(updateFinalGate(state,b,{x:b.x,y:p.entry.y-2},1/120),false,'Same warp cannot repeat');
 p=g.portals[1];b.x=p.entry.x;b.y=p.entry.y+1;b.vy=300;assert.ok(updateFinalGate(state,b,{x:b.x,y:p.entry.y-2},1/120));assert.equal(b.warpCount,2);assert.deepEqual(b.usedWarps,['A','B']);
 // A blocked exit never overlaps another ball or forces a teleport.
 g=setup();p=g.portals[0];b=makePhysicsBall(1,p.entry.x,p.entry.y+1,12,0,1);b.vy=300;
 state.balls=[b,...[0,36,72,108].map((dy,i)=>makePhysicsBall(i+2,p.exit.x,p.exit.y+dy,12,i+1,1))];
 assert.equal(updateFinalGate(state,b,{x:b.x,y:p.entry.y-2},1/120),false);assert.equal(b.warpCount,undefined);
 // The final comeback rejoins before the entrance, never beyond the new obstacles.
 g=setup();state.boostMidEnabled=false;state.balls=[makePhysicsBall(1,100,g.startY-50,12,0,1),makePhysicsBall(2,250,500,12,1,1)];state.balls[0].vy=200;
 const c=new ChaseEvents();assert.ok(c.maybeStart(state));assert.equal(state.chase.type,'final');assert.ok(state.chase.plans[0].to.y<=g.startY-80);
 while(state.chase)c.step(state,1/60);assert.equal(state.balls[1].chaseBoostLeft,.9);
 // All five entry lanes physically exit the chamber; no scripted winner is needed.
 const old=Math.random,arrivals=[];
 try{for(const W of [300,390,768,1366])for(let lane=0;lane<5;lane++)for(const seed of [17,431,902]){
  g=setup(W);Math.random=makeRand(seed);b=makePhysicsBall(1,g.lanes[lane].x,g.startY-30,W<520?12:16,0,1);b.vy=180;b.vx=(Math.random()-.5)*70;state.balls=[b];let time=0;
  for(let step=0;step<120*35;step++){time=(step+1)/120;state.physicsStep++;for(const w of state.wheels)w.angle+=w.speed/120;
   if(updateBall(b,1+step*1000/120,1/120)==='goal')break;
  }
  assert.ok(time<35,`Lane ${lane+1} at ${W} seed ${seed} must finish`);assert.ok((b.warpCount||0)<=2);assert.ok(Number.isFinite(b.x));arrivals.push(time);
 }}finally{Math.random=old;}
 console.log(`PASS unchanged front geometry, 5 mouths, safe directed warps, loop cap, no gate bypass and ${arrivals.length} lane completions (max ${Math.max(...arrivals).toFixed(2)}s)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
