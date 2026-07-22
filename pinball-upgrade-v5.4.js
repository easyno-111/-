/*
 * 핀볼 랜덤 레이스 V5.4 업그레이드 패치
 * 적용 대상: 듀얼 모드 V5.1 바깥 HTML
 * 기능:
 *  1) 모바일 좁은 화면 출발/결승 진입 안정화
 *  2) 선두 번호 변경 시 대형 HUD 표시
 *  3) 결승선 거리 연동형 클로즈업 + 가변 슬로모션
 *  4) 긴 레이스 전용 하위권 고스트 부스트
 *  5) 긴 레이스 전용 최종 관문(V자 유도벽 + 회전판)
 */
(() => {
  'use strict';

  const PATCH_VERSION = '5.4';

  function replaceOnce(source, pattern, replacement) {
    return pattern.test(source) ? source.replace(pattern, replacement) : source;
  }

  function patchMobilePhysics(source, mode) {
    let output = source;

    // 모바일 공 반지름 축소: 좁은 출발 구간에서 공끼리 서로 막는 현상을 줄입니다.
    output = output.replace(
      /r\s*:\s*W\s*<\s*520\s*\?\s*12\.5\s*:\s*14\s*,/g,
      'r:W<520?Math.max(9.6,Math.min(11.2,W/31)):14,'
    );

    // 모바일 출발 열 수 제한: 320~430px 화면에서도 공 사이에 실제 여유 공간을 확보합니다.
    output = output.replace(
      /const\s+cols\s*=\s*Math\.min\(10\s*,\s*Math\.max\(5\s*,\s*Math\.floor\(W\s*\/\s*48\)\)\)\s*;/g,
      'const cols = W < 520 ? Math.min(7,Math.max(5,Math.floor(W/46))) : Math.min(10,Math.max(5,Math.floor(W/48)));'
    );
    output = output.replace(
      /const\s+cols\s*=\s*Math\.min\(10\s*,\s*Math\.max\(5\s*,\s*Math\.floor\(W\s*\/\s*50\)\)\)\s*;/g,
      'const cols = W < 520 ? Math.min(7,Math.max(5,Math.floor(W/48))) : Math.min(10,Math.max(5,Math.floor(W/50)));'
    );

    // 빠른 모드 출발 폭을 모바일에서 조금 더 넓혀 첫 충돌 뭉침을 완화합니다.
    output = output.replace(
      /const\s+left\s*=\s*W\s*\*\s*\.14\s*,\s*right\s*=\s*W\s*\*\s*\.86\s*;/g,
      'const left=W*(W<520?.10:.14), right=W*(W<520?.90:.86);'
    );

    // 긴장감 모드 출발 폭도 모바일에서 확장합니다.
    output = output.replace(
      /const\s+left\s*=\s*W\s*\*\s*\.18\s*;\s*const\s+right\s*=\s*W\s*\*\s*\.82\s*;/g,
      'const left=W*(W<520?.12:.18); const right=W*(W<520?.88:.82);'
    );

    // 모바일 결승 홀 확대: 공이 깔때기 바닥에서 반복 반사되며 못 빠지는 현상을 방지합니다.
    if (mode === 'fast') {
      output = output.replace(
        /const\s+holeWidth\s*=\s*elapsed\s*>\s*raceDuration\s*\?\s*56\s*:\s*43\s*;/g,
        'const holeWidth = W < 520 ? Math.max(64,W*.205) : (elapsed > raceDuration ? 56 : 43);'
      );
    } else {
      output = output.replace(
        /const\s+holeWidth\s*=\s*elapsed\s*>\s*52000\s*\?\s*63\s*:\s*47\s*;/g,
        'const holeWidth = W < 520 ? Math.max(68,W*.215) : (elapsed > 52000 ? 63 : 47);'
      );
    }

    return output;
  }

  function patchSlowMotion(source, mode) {
    let output = source;

    // 결승선과의 거리를 0~1로 환산해 매 프레임 속도를 조절합니다.
    // 공이 결승선에서 다시 멀어지면 값도 즉시 낮아져 정상 속도로 복귀합니다.
    if (mode === 'fast') {
      output = replaceOnce(
        output,
        /const\s+dt\s*=\s*Math\.min\(\(now-lastTime\)\/1000\s*,\s*\.022\)\s*;/,
        `const __v53BaseDt = Math.min((now-lastTime)/1000,.022);
      const __v53Lead = (typeof balls!=="undefined" ? balls : []).reduce((a,b)=>b&&b.active&&(!a||b.y>a.y)?b:a,null);
      const __v53FinishY = (typeof H!=="undefined" ? H-31 : 0);
      const __v53SlowStartY = (typeof H!=="undefined" ? H-Math.max(340,H*.43) : 0);
      const __v53Raw = __v53Lead ? Math.max(0,Math.min(1,(__v53Lead.y-__v53SlowStartY)/Math.max(1,__v53FinishY-__v53SlowStartY))) : 0;
      const __v53Proximity = __v53Raw*__v53Raw*(3-2*__v53Raw);
      const dt = __v53BaseDt * (1-.66*__v53Proximity);`
      );
    } else {
      output = replaceOnce(
        output,
        /const\s+dt\s*=\s*Math\.min\(\(now-lastTime\)\/1000\s*,\s*\.032\)\s*;/,
        `const __v53BaseDt = Math.min((now-lastTime)/1000,.032);
      const __v53Lead = (typeof balls!=="undefined" ? balls : []).reduce((a,b)=>b&&(b.active||b.winner)&&(!a||b.y>a.y)?b:a,null);
      const __v53FinishY = (typeof WORLD_H!=="undefined" ? WORLD_H-31 : 0);
      const __v53SlowStartY = (typeof WORLD_H!=="undefined" ? WORLD_H-920 : 0);
      const __v53Raw = __v53Lead ? Math.max(0,Math.min(1,(__v53Lead.y-__v53SlowStartY)/Math.max(1,__v53FinishY-__v53SlowStartY))) : 0;
      const __v53Proximity = __v53Raw*__v53Raw*(3-2*__v53Raw);
      const dt = __v53BaseDt * (1-.64*__v53Proximity);`
      );
    }

    return output;
  }

  function buildInjectedUi(mode) {
    const modeClass = mode === 'fast' ? 'v52-fast' : 'v52-tension';
    const zoomScale = mode === 'fast' ? 1.34 : 1.22;

    return `
<style id="v52-upgrade-style">
  body.${modeClass} .canvas-wrap{--v52-focus-x:50%;--v52-focus-y:80%;--v53-final-scale:1}
  body.${modeClass} #game-canvas{
    transform-origin:var(--v52-focus-x) var(--v52-focus-y);
    transition:transform .16s linear,filter .2s ease;
    will-change:transform;
  }
  body.${modeClass} .canvas-wrap.v52-final-focus #game-canvas{
    transform:scale(var(--v53-final-scale));
    filter:saturate(1.12) contrast(1.04);
  }
  #v52-leader-hud{
    position:absolute;
    top:58px;
    left:50%;
    z-index:14;
    pointer-events:none;
    transform:translate(-50%,-14px) scale(.92);
    opacity:0;
    min-width:min(320px,72%);
    padding:10px 22px 12px;
    border:1px solid rgba(255,216,77,.72);
    border-radius:18px;
    text-align:center;
    color:white;
    background:linear-gradient(180deg,rgba(8,17,31,.88),rgba(4,10,20,.68));
    box-shadow:0 12px 35px rgba(0,0,0,.34),0 0 28px rgba(255,216,77,.16);
    backdrop-filter:blur(7px);
    transition:opacity .2s ease,transform .32s cubic-bezier(.2,1.25,.3,1);
  }
  #v52-leader-hud.show{opacity:1;transform:translate(-50%,0) scale(1)}
  #v52-leader-hud .v52-leader-label{
    display:block;
    color:#ffe98c;
    font-size:11px;
    font-weight:900;
    letter-spacing:2.8px;
    margin-bottom:1px;
  }
  #v52-leader-hud .v52-leader-number{
    display:block;
    font-family:Poppins,"Noto Sans KR",sans-serif;
    font-size:clamp(38px,7vw,66px);
    font-weight:900;
    line-height:1;
    letter-spacing:-2px;
    text-shadow:0 0 20px rgba(255,216,77,.28);
  }
  #v52-final-badge{
    position:absolute;
    left:50%;
    bottom:22px;
    z-index:14;
    pointer-events:none;
    transform:translate(-50%,18px) scale(.94);
    opacity:0;
    white-space:nowrap;
    padding:9px 16px;
    border-radius:999px;
    border:1px solid rgba(255,216,77,.48);
    color:#fff3ad;
    background:rgba(4,10,20,.76);
    box-shadow:0 8px 28px rgba(0,0,0,.35),0 0 22px rgba(255,216,77,.16);
    backdrop-filter:blur(7px);
    font-size:12px;
    font-weight:900;
    letter-spacing:.7px;
    transition:opacity .28s ease,transform .35s cubic-bezier(.2,1.1,.3,1);
  }
  #v52-final-badge.show{opacity:1;transform:translate(-50%,0) scale(1)}
  #v54-gate-canvas{
    position:absolute;
    inset:0;
    z-index:7;
    width:100%;
    height:100%;
    pointer-events:none;
    transform-origin:var(--v52-focus-x) var(--v52-focus-y);
    transition:transform .16s linear,filter .2s ease;
    will-change:transform;
  }
  body.${modeClass} .canvas-wrap.v52-final-focus #v54-gate-canvas{
    transform:scale(var(--v53-final-scale));
    filter:saturate(1.12) contrast(1.04);
  }
  #v54-boost-banner{
    position:absolute;
    top:128px;
    left:50%;
    z-index:15;
    pointer-events:none;
    transform:translate(-50%,-10px) scale(.94);
    opacity:0;
    white-space:nowrap;
    padding:10px 18px;
    border:1px solid rgba(86,238,255,.7);
    border-radius:999px;
    color:#c9fbff;
    background:rgba(3,18,31,.86);
    box-shadow:0 10px 30px rgba(0,0,0,.34),0 0 28px rgba(53,223,255,.2);
    backdrop-filter:blur(7px);
    font-size:12px;
    font-weight:900;
    letter-spacing:.4px;
    transition:opacity .2s ease,transform .3s cubic-bezier(.2,1.15,.3,1);
  }
  #v54-boost-banner.show{opacity:1;transform:translate(-50%,0) scale(1)}
  @media(max-width:620px){
    #v52-leader-hud{top:50px;min-width:min(250px,70%);padding:8px 15px 10px;border-radius:15px}
    #v52-leader-hud .v52-leader-label{font-size:9px;letter-spacing:2px}
    #v52-leader-hud .v52-leader-number{font-size:clamp(34px,12vw,52px)}
    #v52-final-badge{bottom:14px;font-size:10px;padding:8px 12px}
    #v54-boost-banner{top:112px;font-size:10px;padding:8px 12px}
  }
  @media(prefers-reduced-motion:reduce){
    body.${modeClass} #game-canvas,#v52-leader-hud,#v52-final-badge{transition:none!important}
  }
</style>
<script id="v52-upgrade-runtime">
(() => {
  'use strict';
  const MODE = ${JSON.stringify(mode)};
  document.body.classList.add(${JSON.stringify(modeClass)});
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;

  const leaderHud = document.createElement('div');
  leaderHud.id = 'v52-leader-hud';
  leaderHud.innerHTML = '<span class="v52-leader-label">CURRENT LEADER</span><span class="v52-leader-number">선두 -번</span>';
  wrap.appendChild(leaderHud);

  const finalBadge = document.createElement('div');
  finalBadge.id = 'v52-final-badge';
  finalBadge.textContent = '결승선 직전 · SLOW MOTION';
  wrap.appendChild(finalBadge);

  let gateCanvas = null;
  let gateCtx = null;
  let boostBanner = null;
  if (MODE === 'tension'){
    gateCanvas = document.createElement('canvas');
    gateCanvas.id = 'v54-gate-canvas';
    wrap.appendChild(gateCanvas);

    boostBanner = document.createElement('div');
    boostBanner.id = 'v54-boost-banner';
    boostBanner.textContent = 'GHOST BOOST';
    wrap.appendChild(boostBanner);
  }

  const numberEl = leaderHud.querySelector('.v52-leader-number');
  let shownLeader = null;
  let pendingLeader = null;
  let pendingSince = 0;
  let hideTimer = 0;
  let finalActive = false;

  function getLeader(){
    try{
      if (typeof balls === 'undefined' || !Array.isArray(balls)) return null;
      let lead = null;
      for (const ball of balls){
        if (!ball || (!ball.active && !ball.winner)) continue;
        if (!lead || ball.y > lead.y) lead = ball;
      }
      return lead;
    }catch(_){ return null; }
  }

  function isRacing(){
    try{ return typeof racing !== 'undefined' && !!racing; }
    catch(_){ return false; }
  }

  function showLeader(num){
    shownLeader = num;
    numberEl.textContent = '선두 ' + num + '번';
    leaderHud.classList.remove('show');
    void leaderHud.offsetWidth;
    leaderHud.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => leaderHud.classList.remove('show'), 1250);
  }

  function getFinishProgress(lead){
    if (!lead || !isRacing()) return 0;
    try{
      let finishY = 0;
      let slowStartY = 0;
      if (MODE === 'tension'){
        if (typeof WORLD_H === 'undefined') return 0;
        finishY = WORLD_H - 31;
        slowStartY = WORLD_H - 920;
      }else{
        if (typeof H === 'undefined') return 0;
        finishY = H - 31;
        slowStartY = H - Math.max(340,H*.43);
      }
      const raw = Math.max(0,Math.min(1,(lead.y-slowStartY)/Math.max(1,finishY-slowStartY)));
      return raw*raw*(3-2*raw);
    }catch(_){ return 0; }
  }

  function updateFocus(lead){
    if (!lead) return;
    try{
      const width = Math.max(1,typeof W !== 'undefined' ? W : wrap.clientWidth);
      const height = Math.max(1,typeof H !== 'undefined' ? H : wrap.clientHeight);
      const screenY = MODE === 'tension' && typeof cameraY !== 'undefined' ? lead.y-cameraY : lead.y;
      const fx = Math.max(18,Math.min(82,lead.x/width*100));
      const fy = Math.max(55,Math.min(92,screenY/height*100));
      wrap.style.setProperty('--v52-focus-x',fx.toFixed(1)+'%');
      wrap.style.setProperty('--v52-focus-y',fy.toFixed(1)+'%');
    }catch(_){ /* ignore */ }
  }

  const v54State = {
    wasRacing:false,
    raceStartedAt:0,
    nextBoostAt:0,
    lastNow:0,
    gateAngle:0,
    gateOmega:1.05,
    targetOmega:1.05,
    nextDirectionChange:0,
    boostHideTimer:0
  };

  function v54Balls(){
    try{ return typeof balls !== 'undefined' && Array.isArray(balls) ? balls : []; }
    catch(_){ return []; }
  }

  function v54World(){
    try{
      if (MODE !== 'tension' || typeof WORLD_H === 'undefined' || typeof W === 'undefined' || typeof H === 'undefined') return null;
      return {width:Math.max(1,W),height:Math.max(1,H),worldHeight:WORLD_H,finishY:WORLD_H-31};
    }catch(_){ return null; }
  }

  function v54ResizeCanvas(world){
    if (!gateCanvas || !gateCtx || !world) return;
    const dpr = Math.max(1,Math.min(2,window.devicePixelRatio || 1));
    const pw = Math.max(1,Math.round(world.width*dpr));
    const ph = Math.max(1,Math.round(world.height*dpr));
    if (gateCanvas.width !== pw || gateCanvas.height !== ph){
      gateCanvas.width = pw;
      gateCanvas.height = ph;
    }
    gateCtx.setTransform(dpr,0,0,dpr,0,0);
  }

  function v54Geometry(world){
    const finishY = world.finishY;
    const gateY = finishY - Math.max(142,Math.min(176,world.height*.19));
    const topY = gateY - Math.max(155,Math.min(230,world.height*.25));
    const gap = Math.max(70,Math.min(118,world.width*.205));
    const edge = Math.max(24,world.width*.085);
    const cx = world.width*.5;
    const barLength = Math.max(gap*1.22,Math.min(212,world.width*.38));
    return {
      finishY,gateY,topY,gap,cx,barLength,
      leftA:{x:edge,y:topY},
      leftB:{x:cx-gap*.56,y:gateY+22},
      rightA:{x:world.width-edge,y:topY},
      rightB:{x:cx+gap*.56,y:gateY+22}
    };
  }

  function v54ClosestPoint(px,py,ax,ay,bx,by){
    const abx = bx-ax;
    const aby = by-ay;
    const denom = abx*abx+aby*aby || 1;
    const t = Math.max(0,Math.min(1,((px-ax)*abx+(py-ay)*aby)/denom));
    return {x:ax+abx*t,y:ay+aby*t,t};
  }

  function v54ResolveSegment(ball,ax,ay,bx,by,thickness,restitution,tangentKick){
    const radius = Math.max(2,Number(ball.r)||10);
    const cp = v54ClosestPoint(ball.x,ball.y,ax,ay,bx,by);
    let nx = ball.x-cp.x;
    let ny = ball.y-cp.y;
    let dist = Math.hypot(nx,ny);
    const minDist = radius+thickness*.5;
    if (dist >= minDist) return false;
    if (dist < .001){
      const sx = bx-ax;
      const sy = by-ay;
      const sl = Math.hypot(sx,sy)||1;
      nx = -sy/sl;
      ny = sx/sl;
      dist = 1;
    }else{
      nx /= dist;
      ny /= dist;
    }
    const push = minDist-dist+.35;
    ball.x += nx*push;
    ball.y += ny*push;
    const vx = Number(ball.vx)||0;
    const vy = Number(ball.vy)||0;
    const vn = vx*nx+vy*ny;
    if (vn < 0){
      ball.vx = vx-(1+restitution)*vn*nx;
      ball.vy = vy-(1+restitution)*vn*ny;
    }
    if (tangentKick){
      const tx = -ny;
      const ty = nx;
      ball.vx = (Number(ball.vx)||0)+tx*tangentKick;
      ball.vy = (Number(ball.vy)||0)+ty*tangentKick;
    }
    return true;
  }

  function v54RestoreBall(ball,now,immediate){
    if (!ball || !ball.__v54BaseR) return;
    ball.__v54GhostUntil = 0;
    if (immediate){
      ball.r = ball.__v54BaseR;
      ball.__v54RestoreStart = 0;
      ball.__v54RestoreUntil = 0;
    }else if (!ball.__v54RestoreUntil){
      ball.__v54RestoreStart = now;
      ball.__v54RestoreUntil = now+280;
    }
  }

  function v54SetGhost(ball,now){
    if (!ball) return;
    if (!ball.__v54BaseR) ball.__v54BaseR = Math.max(7,Number(ball.r)||11);
    ball.__v54GhostUntil = now+1800;
    ball.__v54RestoreStart = 0;
    ball.__v54RestoreUntil = 0;
    ball.__v54GhostTargetVy = Math.max(225,(Number(ball.vy)||0)*1.18);
    ball.r = Math.max(1.8,ball.__v54BaseR*.17);
  }

  function v54ShowBoost(count){
    if (!boostBanner) return;
    boostBanner.textContent = 'GHOST BOOST · 뒤처진 공 '+count+'개 돌파';
    boostBanner.classList.remove('show');
    void boostBanner.offsetWidth;
    boostBanner.classList.add('show');
    clearTimeout(v54State.boostHideTimer);
    v54State.boostHideTimer = setTimeout(()=>boostBanner.classList.remove('show'),1500);
  }

  function v54TriggerBoost(now,world){
    const active = v54Balls().filter(ball=>ball&&ball.active&&!ball.winner);
    if (active.length < 4) return;
    const noGhostY = world.finishY-Math.max(650,world.worldHeight*.12);
    const eligible = active.filter(ball=>ball.y<noGhostY);
    if (eligible.length < 4) return;
    eligible.sort((a,b)=>a.y-b.y);
    const trailing = eligible.slice(0,Math.max(2,Math.ceil(eligible.length*.5)));
    for (let i=trailing.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      const tmp = trailing[i]; trailing[i] = trailing[j]; trailing[j] = tmp;
    }
    const count = Math.max(1,Math.floor(trailing.length*.5));
    const selected = trailing.slice(0,count);
    selected.forEach(ball=>v54SetGhost(ball,now));
    v54ShowBoost(selected.length);
  }

  function v54UpdateGhosts(now,dt,world,geo){
    const noGhostY = world.finishY-Math.max(650,world.worldHeight*.12);
    for (const ball of v54Balls()){
      if (!ball || (!ball.active&&!ball.winner)) continue;
      if (ball.__v54GhostUntil && now<ball.__v54GhostUntil){
        if (ball.y>=noGhostY){
          v54RestoreBall(ball,now,true);
          continue;
        }
        if (!ball.__v54BaseR) ball.__v54BaseR = Math.max(7,Number(ball.r)||11);
        ball.r = Math.max(1.8,ball.__v54BaseR*.17);
        const targetVy = ball.__v54GhostTargetVy || 225;
        ball.vy = (Number(ball.vy)||0)+(targetVy-(Number(ball.vy)||0))*Math.min(1,dt*7.5);
        ball.vy += 22*dt;
        const rr = ball.__v54BaseR;
        if (ball.x<rr){ ball.x=rr; ball.vx=Math.abs(Number(ball.vx)||0)*.78; }
        if (ball.x>world.width-rr){ ball.x=world.width-rr; ball.vx=-Math.abs(Number(ball.vx)||0)*.78; }
      }else if (ball.__v54GhostUntil){
        v54RestoreBall(ball,now,false);
      }
      if (ball.__v54RestoreUntil){
        const p = Math.max(0,Math.min(1,(now-ball.__v54RestoreStart)/Math.max(1,ball.__v54RestoreUntil-ball.__v54RestoreStart)));
        const smooth = p*p*(3-2*p);
        const smallR = Math.max(1.8,ball.__v54BaseR*.17);
        ball.r = smallR+(ball.__v54BaseR-smallR)*smooth;
        if (p>=1){
          ball.r = ball.__v54BaseR;
          ball.__v54RestoreStart = 0;
          ball.__v54RestoreUntil = 0;
        }
      }
    }
  }

  function v54UpdateGate(now,dt,world,geo){
    if (now>=v54State.nextDirectionChange){
      const sign = Math.random()<.5?-1:1;
      v54State.targetOmega = sign*(.9+Math.random()*.55);
      v54State.nextDirectionChange = now+2300+Math.random()*1900;
    }
    v54State.gateOmega += (v54State.targetOmega-v54State.gateOmega)*Math.min(1,dt*1.6);
    v54State.gateAngle += v54State.gateOmega*dt;

    const half = geo.barLength*.5;
    const c = Math.cos(v54State.gateAngle);
    const s = Math.sin(v54State.gateAngle);
    const barA = {x:geo.cx-c*half,y:geo.gateY-s*half};
    const barB = {x:geo.cx+c*half,y:geo.gateY+s*half};

    for (const ball of v54Balls()){
      if (!ball || !ball.active || ball.winner) continue;
      if (ball.y<geo.topY-60 || ball.y>geo.finishY+35) continue;
      if (ball.__v54GhostUntil && now<ball.__v54GhostUntil) continue;

      if (!ball.__v54GateEnteredAt) ball.__v54GateEnteredAt = now;
      if (ball.y<geo.topY-45){
        ball.__v54GateEnteredAt = 0;
        ball.__v54AssistUntil = 0;
        continue;
      }
      if (now-ball.__v54GateEnteredAt>4700 && (!ball.__v54AssistUntil || now>ball.__v54AssistUntil)){
        ball.__v54AssistUntil = now+900;
        ball.__v54GateEnteredAt = now+1600;
      }

      const assisting = ball.__v54AssistUntil && now<ball.__v54AssistUntil;
      v54ResolveSegment(ball,geo.leftA.x,geo.leftA.y,geo.leftB.x,geo.leftB.y,12,.66,0);
      v54ResolveSegment(ball,geo.rightA.x,geo.rightA.y,geo.rightB.x,geo.rightB.y,12,.66,0);

      if (assisting){
        ball.vx = (Number(ball.vx)||0)+(geo.cx-ball.x)*dt*2.1;
        ball.vy = Math.max(Number(ball.vy)||0,155)+42*dt;
      }else{
        const hit = v54ResolveSegment(ball,barA.x,barA.y,barB.x,barB.y,14,.78,v54State.gateOmega*10);
        if (hit){
          const bump = Math.max(-2.05,Math.min(2.05,v54State.gateOmega+(Math.random()-.5)*.28));
          v54State.gateOmega = bump;
        }
      }
    }
  }

  function v54Draw(now,world,geo){
    if (!gateCtx || !gateCanvas) return;
    v54ResizeCanvas(world);
    const ctx = gateCtx;
    const cam = typeof cameraY !== 'undefined' ? cameraY : 0;
    ctx.clearRect(0,0,world.width,world.height);

    function sy(y){ return y-cam; }
    const topScreen = sy(geo.topY);
    const finishScreen = sy(geo.finishY);
    if (finishScreen>-80 && topScreen<world.height+80){
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(255,206,70,.5)';
      ctx.strokeStyle = 'rgba(255,221,111,.93)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(geo.leftA.x,sy(geo.leftA.y));
      ctx.lineTo(geo.leftB.x,sy(geo.leftB.y));
      ctx.moveTo(geo.rightA.x,sy(geo.rightA.y));
      ctx.lineTo(geo.rightB.x,sy(geo.rightB.y));
      ctx.stroke();

      const half = geo.barLength*.5;
      const c = Math.cos(v54State.gateAngle);
      const s = Math.sin(v54State.gateAngle);
      ctx.shadowBlur = 22;
      ctx.shadowColor = 'rgba(255,84,84,.55)';
      ctx.strokeStyle = 'rgba(255,103,94,.98)';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(geo.cx-c*half,sy(geo.gateY-s*half));
      ctx.lineTo(geo.cx+c*half,sy(geo.gateY+s*half));
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,245,200,.95)';
      ctx.beginPath();
      ctx.arc(geo.cx,sy(geo.gateY),8,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    for (const ball of v54Balls()){
      if (!ball || !ball.__v54GhostUntil || now>=ball.__v54GhostUntil) continue;
      const y = sy(ball.y);
      if (y<-40 || y>world.height+40) continue;
      const rr = ball.__v54BaseR || 11;
      ctx.save();
      ctx.globalAlpha = .85;
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(66,232,255,.9)';
      ctx.strokeStyle = 'rgba(142,248,255,.95)';
      ctx.fillStyle = 'rgba(65,220,255,.18)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(ball.x,y,rr+2,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = .32;
      ctx.beginPath();
      ctx.arc(ball.x-(Number(ball.vx)||0)*.035,y-(Number(ball.vy)||0)*.035,rr*.72,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function v54ResetBalls(now){
    for (const ball of v54Balls()){
      if (!ball || !ball.__v54BaseR) continue;
      v54RestoreBall(ball,now,true);
      ball.__v54GateEnteredAt = 0;
      ball.__v54AssistUntil = 0;
    }
  }

  function v54UpdateLongMode(now){
    if (MODE !== 'tension') return;
    const world = v54World();
    if (!world) return;
    if (!gateCtx && gateCanvas) gateCtx = gateCanvas.getContext('2d');
    const active = isRacing();
    const dt = v54State.lastNow ? Math.min(.05,Math.max(0,(now-v54State.lastNow)/1000)) : 0;
    v54State.lastNow = now;
    const geo = v54Geometry(world);

    if (active && !v54State.wasRacing){
      v54State.raceStartedAt = now;
      v54State.nextBoostAt = now+10000;
      v54State.nextDirectionChange = now+2600;
      v54State.gateAngle = 0;
      v54State.gateOmega = 1.05;
      v54State.targetOmega = 1.05;
    }

    if (active){
      while (now>=v54State.nextBoostAt){
        v54TriggerBoost(now,world);
        v54State.nextBoostAt += 10000;
      }
      v54UpdateGhosts(now,dt,world,geo);
      v54UpdateGate(now,dt,world,geo);
    }else if (v54State.wasRacing){
      v54ResetBalls(now);
      if (boostBanner) boostBanner.classList.remove('show');
    }

    v54Draw(now,world,geo);
    v54State.wasRacing = active;
  }

  function frame(now){
    const lead = getLeader();
    const active = isRacing();

    if (active && lead){
      if (lead.num !== pendingLeader){
        pendingLeader = lead.num;
        pendingSince = now;
      }else if (lead.num !== shownLeader && now-pendingSince > 150){
        showLeader(lead.num);
      }
    }else{
      pendingLeader = null;
      leaderHud.classList.remove('show');
    }

    const finishProgress = getFinishProgress(lead);
    const maxScale = ${zoomScale};
    const currentScale = 1 + (maxScale-1)*finishProgress;
    wrap.style.setProperty('--v53-final-scale',currentScale.toFixed(4));

    if (finishProgress > .015){
      updateFocus(lead);
      if (!finalActive){
        finalActive = true;
        wrap.classList.add('v52-final-focus');
      }
    }else if (finalActive){
      finalActive = false;
      wrap.classList.remove('v52-final-focus');
    }

    // 안내 문구는 감속이 눈에 띄는 구간에서만 표시하며,
    // 공이 위로 튕겨 멀어지면 바로 사라집니다.
    if (finishProgress > .34){
      finalBadge.classList.add('show');
    }else if (finishProgress < .22){
      finalBadge.classList.remove('show');
    }

    v54UpdateLongMode(now);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
<\/script>`;
  }

  function upgradeGameSource(source, mode) {
    let upgraded = source;
    upgraded = patchMobilePhysics(upgraded, mode);
    upgraded = patchSlowMotion(upgraded, mode);

    const injection = buildInjectedUi(mode);
    if (/<\/body>/i.test(upgraded)) {
      upgraded = upgraded.replace(/<\/body>/i, `${injection}\n</body>`);
    } else {
      upgraded += injection;
    }

    return upgraded;
  }

  // 기존 openMode를 대체하지만, 원본 GAME_DATA와 메뉴 구조는 그대로 사용합니다.
  window.openMode = function openModeV54(mode) {
    if (typeof GAME_DATA === 'undefined' || !GAME_DATA[mode]) return;

    loading.style.display = 'grid';
    menu.style.display = 'none';
    frame.style.display = 'block';

    frame.onload = () => {
      loading.style.display = 'none';
      try {
        frame.contentDocument.documentElement.dataset.pinballPatch = PATCH_VERSION;
      } catch (_) {
        // srcdoc는 동일 출처이므로 일반적으로 접근 가능하지만, 실패해도 게임 실행에는 영향이 없습니다.
      }
    };

    try {
      const decoded = decodeUtf8Base64(GAME_DATA[mode]);
      frame.srcdoc = upgradeGameSource(decoded, mode);
      history.replaceState({ mode, patch: PATCH_VERSION }, '', location.pathname + location.search + '#' + mode);
    } catch (error) {
      console.error('[Pinball V5.4] 패치 적용 실패:', error);
      // 패치 실패 시에도 원본 게임은 열리도록 안전하게 폴백합니다.
      frame.srcdoc = decodeUtf8Base64(GAME_DATA[mode]);
    }
  };

  window.PINBALL_UPGRADE_V54 = {
    version: PATCH_VERSION,
    upgradeGameSource
  };
})();
