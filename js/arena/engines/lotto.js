// 로또 공정 추첨 엔진: 혼합 → 흡입(캡슐에 가려짐) → 흔들림 → 크랙 공개 3단계 연출
import { clamp, secureShuffle, makeRand, easeInOutQuad } from "../util.js";
import { state, displayName } from "../state.js";
import { fx, audio, host } from "../core.js";
import { BALL_PALETTES } from "../palette.js";
import { resizeCanvas, drawLottoScene, lottoGeometry } from "../render.js";

export async function runLottoMode(eligible, token) {
  state.engine = "lotto";
  state.lottoWinners = secureShuffle(eligible).slice(0, state.drawCount);
  Object.assign(state, { lottoPhase: "ready", lottoCapture: null, lottoSpin: 0, winnerFx: null, capsule: null, revealFx: null, zoom: 1, zoomTarget: 1 });
  fx.reset();
  resizeCanvas(); prepareLottoBalls(eligible); drawLottoScene();
  host.setStageLabel("로또 기계에 모든 번호 공을 넣었습니다");
  if (!(await host.countdown(token))) return;
  state.raceStart = performance.now(); state.lastFrame = state.raceStart;
  startMix(state.raceStart);
  audio.playTrack("lotto", 0.05);
  cancelAnimationFrame(state.animationId); state.animationId = requestAnimationFrame(lottoLoop);
}

export function prepareLottoBalls(eligible) {
  const g = lottoGeometry(), rand = makeRand(state.courseSeed), r = clamp(Math.min(17 - eligible.length * 0.1, g.R * 0.095), 7.5, 16), numbers = secureShuffle(eligible);
  state.lottoBalls = numbers.map((num, i) => {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * (g.R - r - 18);
    return { num, x: g.cx + Math.cos(a) * rr, y: g.cy + Math.sin(a) * rr, vx: (rand() - 0.5) * 180, vy: (rand() - 0.5) * 180, r, baseR: r, color: BALL_PALETTES[i % BALL_PALETTES.length], active: true, capturing: false, inTray: false, trayIndex: -1, captureFromX: 0, captureFromY: 0, hidden: false, squash: 0, trail: [] };
  });
}

function startMix(now) {
  state.lottoPhase = "mix"; state.lottoPhaseStart = now; state.capsule = null;
  host.setStatus("혼합");
  host.setStageLabel(state.results.length ? "남은 번호 공을 다시 섞는 중" : "강한 바람으로 번호 공을 공정하게 섞는 중");
  audio.unduck();
}
function mixDuration() {
  const first = state.results.length === 0;
  return state.style === "quick" ? (first ? 2600 : 1600) : (first ? 5200 : 3200);
}

function lottoLoop(now) {
  if (!state.running || state.engine !== "lotto") return;
  const dt = Math.min((now - state.lastFrame) / 1000, 0.028); state.lastFrame = now;
  fx.update(dt);
  if (!fx.isFrozen(now)) updateLotto(now, dt);
  drawLottoScene();
  if (state.ending && now - state.endingAt > 1500) { finalizeLotto(); return; }
  state.animationId = requestAnimationFrame(lottoLoop);
}

function updateLotto(now, dt) {
  const g = lottoGeometry(), elapsed = now - state.lottoPhaseStart;
  const mixing = state.lottoPhase === "mix";
  state.lottoSpin += dt * (mixing ? 5.8 : state.lottoPhase === "done" ? 1.2 : 2.6);
  updateLottoAir(g, dt, mixing ? 1 : 0.5);
  if (mixing) {
    const dur = mixDuration(), p = clamp(elapsed / dur, 0, 1);
    audio.setIntensity(0.1 + p * 0.7);
    if (elapsed >= dur) startCapture(now);
  } else if (state.lottoPhase === "suck") {
    const dur = 900, p = clamp(elapsed / dur, 0, 1), b = state.lottoCapture;
    // 공이 흡입구로 빨려 들어감
    const e = p * p;
    b.x = b.captureFromX + (g.entryX - b.captureFromX) * e; b.y = b.captureFromY + (g.entryY - b.captureFromY) * e;
    if (p > 0.55 && Math.random() < 0.5) fx.burst(b.x, b.y, ["#c9f3ff", "#5ed4ff"], 1, { speed: 60, life: 0.3, gravity: 0 });
    if (p >= 1) { b.hidden = true; state.capsule = { t: 0, x: g.entryX, y: g.entryY, shake: 0 }; state.lottoPhase = "travel"; state.lottoPhaseStart = now; host.setStageLabel("캡슐이 추출관을 지나는 중 · 번호는 아직 비공개"); audio.heartNext = 0; }
  } else if (state.lottoPhase === "travel") {
    const tension = state.style === "tension", dur = tension ? 3400 : 1700, p = clamp(elapsed / dur, 0, 1), c = state.capsule;
    // 긴장 모드: 중간에 두 번 멈칫
    let q = p;
    if (tension) { const stalls = [[0.3, 0.42], [0.66, 0.8]]; let eff = p; for (const [a, b] of stalls) { if (p > a && p < b) eff = a; else if (p >= b) eff -= b - a; } q = eff / (1 - stalls.reduce((s, [a, b]) => s + (b - a), 0)); }
    const e = easeInOutQuad(clamp(q, 0, 1));
    const slotX = slotXFor(state.results.length, g);
    if (e < 0.5) { const k = e / 0.5; c.x = g.entryX + (g.bendX - g.entryX) * k; c.y = g.entryY + (g.bendY - g.entryY) * k; }
    else { const k = (e - 0.5) / 0.5; c.x = g.bendX + (g.capsuleX - g.bendX) * k; c.y = g.bendY + (g.capsuleY - g.bendY) * k; }
    c.t = p; c.slotX = slotX;
    audio.setIntensity(0.75 + p * 0.25);
    audio.heartbeat(now, 900 - p * 450, 0.18 + p * 0.1);
    if (p >= 1) { state.lottoPhase = "shake"; state.lottoPhaseStart = now; host.setStatus("공개 직전"); host.setStageLabel("캡슐이 흔들립니다..."); audio.duck(0.08, 0.2); }
  } else if (state.lottoPhase === "shake") {
    const tension = state.style === "tension", dur = tension ? 1700 : 1000, p = clamp(elapsed / dur, 0, 1), c = state.capsule;
    c.shake = 1 + p * 4;
    audio.heartbeat(now, 520 - p * 220, 0.3);
    if (Math.floor(elapsed / 90) !== Math.floor((elapsed - dt * 1000) / 90)) audio.sfx("capsuleShake", Math.floor(p * 12));
    fx.shake(1 + p * 2.5);
    if (p >= 1) revealCapsule(now, g);
  } else if (state.lottoPhase === "reveal") {
    const r = state.revealFx, t = (now - r.start) / 1000;
    if (t > 2.5 && state.results.length < state.drawCount) { state.lottoPhase = "pause"; state.lottoPhaseStart = now; }
  } else if (state.lottoPhase === "pause" && elapsed >= 700) startMix(now);
}

function slotXFor(index, g) { return state.W / 2 + (index - (state.drawCount - 1) / 2) * g.slotGap; }

function updateLottoAir(g, dt, power = 1) {
  const moving = state.lottoBalls.filter((b) => b.active && !b.capturing && !b.inTray);
  for (const b of moving) {
    const dx = b.x - g.cx, dy = b.y - g.cy, spin = (state.lottoPhase === "mix" ? 2.7 : 1.35) * power;
    b.vx += (-dy * spin + (Math.random() - 0.5) * 440 * power) * dt; b.vy += (dx * spin - 120 + (Math.random() - 0.5) * 440 * power) * dt;
    b.vx *= Math.pow(0.985, dt * 60); b.vy *= Math.pow(0.985, dt * 60);
    b.vx = clamp(b.vx, -390, 390); b.vy = clamp(b.vy, -390, 390);
    b.x += b.vx * dt; b.y += b.vy * dt;
    const ox = b.x - g.cx, oy = b.y - g.cy, d = Math.hypot(ox, oy), limit = g.R - b.r - 13;
    if (d > limit) { const nx = ox / d, ny = oy / d; b.x = g.cx + nx * limit; b.y = g.cy + ny * limit; const dot = b.vx * nx + b.vy * ny; if (dot > 0) { b.vx -= dot * 1.82 * nx; b.vy -= dot * 1.82 * ny; b.squash = 0.5; } b.vx += -ny * 24; b.vy += nx * 24; }
    b.squash = Math.max(0, (b.squash || 0) - dt * 5);
  }
  for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) {
    const a = moving[i], b = moving[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
    if (!d2 || d2 >= min * min) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, p = (min - d) / 2;
    a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) { const imp = -rel * 0.58; a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny; }
  }
}

function startCapture(now) {
  const target = state.lottoWinners[state.results.length], ball = state.lottoBalls.find((b) => b.num === target && b.active);
  if (!ball) return;
  state.lottoPhase = "suck"; state.lottoPhaseStart = now; state.lottoCapture = ball;
  ball.capturing = true; ball.captureFromX = ball.x; ball.captureFromY = ball.y;
  host.setStatus("추출"); host.setStageLabel(`${state.results.length + 1}번째 공이 흡입구로 빨려 들어갑니다`);
  audio.sfx("suck"); audio.setIntensity(0.8);
}

function revealCapsule(now, g) {
  const b = state.lottoCapture; if (!b) return;
  const place = state.results.length + 1;
  b.capturing = false; b.active = false; b.inTray = true; b.trayIndex = place - 1; b.hidden = false;
  b.x = slotXFor(place - 1, g); b.y = g.slotY;
  state.results.push(b.num); state.lottoCapture = null; state.capsule = null;
  state.lottoPhase = "reveal"; state.lottoPhaseStart = now;
  state.revealFx = { x: g.capsuleX, y: g.capsuleY, num: b.num, place, start: now, slotX: b.x, slotY: b.y };
  state.winnerFx = { x: g.capsuleX, num: b.num, place, start: now + 120, life: 2.6 };
  fx.hitstop(140, now); fx.shake(9); fx.flash(0.85, "#fff6c4"); fx.aberration(1);
  fx.burst(g.capsuleX, g.capsuleY, ["#ffe27a", "#f2b61b", "#ffffff", "#c9f3ff"], 46, { speed: 320, life: 0.9 });
  fx.ring(g.capsuleX, g.capsuleY, "#ffe27a", 150, 0.55, 2);
  audio.sfx("crack"); setTimeout(() => audio.sfx("reveal"), 160); setTimeout(() => audio.sfx("stamp"), 420);
  host.renderLiveRanks(); host.setResultCount(state.results.length);
  host.setStageLabel(`${place}${state.mode === "rank" ? "등" : "번째 당첨"} ${displayName(b.num)} 추첨 완료!`);
  if (state.results.length >= state.drawCount) { state.ending = true; state.endingAt = now + 1500; state.lottoPhase = "done"; host.setStatus("완료"); host.celebrate(100); audio.stopTrack(0.8); setTimeout(() => audio.victory(), 500); }
  else host.setStatus("확정");
}

function finalizeLotto() {
  cancelAnimationFrame(state.animationId);
  state.running = false; state.ending = false;
  const results = [...state.results];
  state.lastResult = { type: "race", mode: state.mode, results, participants: [...state.participants], names: { ...state.names }, basis: "fair", style: state.style, createdAt: new Date() };
  host.afterRun(results);
  host.showRaceResults(results);
  audio.sfx("done");
}
