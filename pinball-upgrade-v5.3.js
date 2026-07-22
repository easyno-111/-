/*
 * 핀볼 랜덤 레이스 V5.3 업그레이드 패치
 * 적용 대상: 듀얼 모드 V5.1 바깥 HTML
 * 기능:
 *  1) 모바일 좁은 화면 출발/결승 진입 안정화
 *  2) 선두 번호 변경 시 대형 HUD 표시
 *  3) 결승선 거리 연동형 클로즈업 + 가변 슬로모션
 */
(() => {
  'use strict';

  const PATCH_VERSION = '5.3';

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
  @media(max-width:620px){
    #v52-leader-hud{top:50px;min-width:min(250px,70%);padding:8px 15px 10px;border-radius:15px}
    #v52-leader-hud .v52-leader-label{font-size:9px;letter-spacing:2px}
    #v52-leader-hud .v52-leader-number{font-size:clamp(34px,12vw,52px)}
    #v52-final-badge{bottom:14px;font-size:10px;padding:8px 12px}
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
  window.openMode = function openModeV53(mode) {
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
      console.error('[Pinball V5.3] 패치 적용 실패:', error);
      // 패치 실패 시에도 원본 게임은 열리도록 안전하게 폴백합니다.
      frame.srcdoc = decodeUtf8Base64(GAME_DATA[mode]);
    }
  };

  window.PINBALL_UPGRADE_V53 = {
    version: PATCH_VERSION,
    upgradeGameSource
  };
})();
