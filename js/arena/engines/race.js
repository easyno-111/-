import { ChaseEvents, racePace } from '../chase-events.js?v=8.4';
// 핀볼 물리 레이스 엔진: 시네마틱 카메라, 사진 판정, 히트스톱, 리플레이
import { clamp, secureShuffle } from "../util.js?v=8.4";
import { state, displayName } from "../state.js?v=8.4";
import { fx, audio, host } from "../core.js?v=8.4";
import { buildCourse, raceWorldHeight, finishGeometry, startColumns } from "../courses.js?v=8.4";
import { makePhysicsBall, updateBall, collideBalls } from "../physics.js?v=8.4";
import { resizeCanvas, drawScene, cinematicAnchorY } from "../render.js?v=8.4";
import { winnerSequence } from "../winner.js?v=8.4";

import { RaceHighlights } from "../highlights.js?v=8.4";
const highlights = new RaceHighlights();
const chase = new ChaseEvents();

const REPLAY_SECONDS = .9;
const REPLAY_SPEED = .65;

export async function runRaceMode(eligible, token) {
  state.engine = "race"; state.courseSeed = Math.max(1, state.courseSeed);
  Object.assign(state, { physicsAccumulator: 0, physicsTimeScale: 1, zoom: 1, zoomTarget: 1, cinematicCandidate: null, cinematicText: "", freezeUntil: 0, freezeFocus: null, winnerFx: null, chaseWind: 0, chaseWindTarget: 0, currentLeaderNum: null, previousLeaderNum: null, leaderChangedAt: 0, photoFinish: false, photoFinishAt: 0, replayState: null, replayFrames: [], physicsStep: 0 });
  fx.reset(); highlights.reset(); chase.reset(state); state.raceElapsed = 0; state.finalSlowUntil = 0; state.comeback = "pure"; state.raceCount = eligible.length;
  buildRace(eligible); drawScene();
  host.setStageLabel(state.style === "quick" ? "기본 코스 출발 게이트 준비 중" : "긴 코스 출발 게이트 준비 중");
  if (!(await host.countdown(token))) return;
  state.raceStart = performance.now(); state.lastFrame = state.raceStart;
  host.setStatus("질주"); host.setStageLabel("중앙 골을 향한 실제 물리 레이스 진행 중");
  state.balls.forEach((b) => { b.vx = (Math.random() - 0.5) * 155 + (state.W / 2 - b.x) * 0.39; b.vy = 55 + Math.random() * 71; });
  audio.playTrack("race", 0.1);
  cancelAnimationFrame(state.animationId); state.animationId = requestAnimationFrame(raceLoop);
}

function buildRace(eligible) {
  resizeCanvas(); state.worldH = raceWorldHeight(); state.cameraY = 0; buildCourse();
  const shuffled = secureShuffle(eligible), cols = startColumns(), left = state.W * 0.14, right = state.W * 0.86, gap = (right - left) / Math.max(1, cols - 1);
  state.balls = shuffled.map((num, i) => makePhysicsBall(num, left + (i % cols) * gap + (Math.random() - 0.5) * 5, 52 + Math.floor(i / cols) * 38, state.W < 520 ? 12 : 16, i));
}

function raceLoop(now) {
  if (!state.running || state.engine !== "race") return;
  const frameDt = Math.min((now - state.lastFrame) / 1000, 0.05); state.lastFrame = now;
  fx.update(frameDt);
  if (state.replayState) { updateReplay(now, frameDt); drawScene(); if (state.replayState?.done) { finalizeRace(); return; } state.animationId = requestAnimationFrame(raceLoop); return; }
  const beginChase = () => {
    state.physicsAccumulator = 0; state.cinematicText = ''; state.raceEvent = null;
    fx.shakeAmp = 0; fx.shakeX = 0; fx.shakeY = 0; audio.sfx('slowmo'); audio.duck(.35,.1); host.chaseNotice(state.chase);
  };
  if (chase.maybeStart(state)) beginChase();
  if (state.chase) {
    const phase = state.chase.phase, result = chase.step(state, frameDt);
    if (result?.ended) {
      highlights.reset(); state.replayFrames = []; audio.unduck();
      if (result.type === 'final') state.finalSlowUntil = now + 800;
      host.setStageLabel('역전 부스터 가동 · 선두 추격 중!');
    } else if (phase !== state.chase.phase) { host.chaseNotice(state.chase); if(state.chase.phase==='boost')audio.sfx('go'); }
    drawScene(); state.animationId = requestAnimationFrame(raceLoop); return;
  }
  updateCinematic(now, frameDt);
  state.raceElapsed += frameDt;
  for (const b of state.balls) b.boostFlame = Math.max(0, (b.boostFlame || 0) - frameDt * .8);
  const frozen = fx.isFrozen(now) || now < state.freezeUntil;
  const slow = now < state.finalSlowUntil ? .42 : state.physicsTimeScale;
  if (!frozen) state.physicsAccumulator += frameDt * slow * racePace(state) * state.spectatorSpeed; else state.physicsAccumulator = 0;
  const fixed = 1 / 120; let loops = 0;
  while (state.physicsAccumulator >= fixed && loops < 48) {
    if (chase.maybeStart(state)) { beginChase(); break; }
    updateRace(now, fixed); state.physicsAccumulator -= fixed; loops++;
  }
  if (state.chase) { drawScene(); state.animationId = requestAnimationFrame(raceLoop); return; }
  const event = highlights.observe(state.balls, now, { enabled: !state.ending && now - state.raceStart > 1200 });
  if (highlights.leader != null) state.currentLeaderNum = highlights.leader;
  if (event) {
    state.raceEvent = event; host.raceNotice(event);
    const ball = state.balls.find(b => b.num === event.num);
    if (ball) { ball.overtakeUntil = now + 2000; fx.ring(ball.x, ball.y, '#ffe27a', 90, .65, 2); fx.burst(ball.x, ball.y, ['#ffe27a','#5ed4ff','#fff'], 20, { speed: 160, life: .6 }); }
    audio.sfx('assign');
  }
  updateMusic();
  drawScene();
  if (state.ending && now - state.endingAt > 900) {
    if (state.replay && state.basis === "physics" && state.replayFrames.length > 30 && !state.replayState) startReplay(now);
    else if (!state.replayState) { finalizeRace(); return; }
  }
  state.animationId = requestAnimationFrame(raceLoop);
}

export function updateRace(now, dt) {
  if (state.chase) return;
  state.physicsStep++;
  for (const wheel of state.wheels) { wheel.angle += wheel.speed * dt; wheel.hit = Math.max(0, wheel.hit - dt); }
  for (const rotor of state.rotors) { rotor.angle += rotor.speed * dt; rotor.hit = Math.max(0, (rotor.hit || 0) - dt * 2); }
  for (const gate of state.gates) { gate.phase += gate.speed * dt; gate.gapX = state.W / 2 + Math.sin(gate.phase) * state.W * 0.24; gate.pulse = Math.max(0, gate.pulse - dt * 2.5); }
  for (const p of state.pegs) if (p.hit > 0) p.hit = Math.max(0, p.hit - dt * 2.2);
  for (const bp of state.bumpers) bp.pulse = Math.max(0, bp.pulse - dt * 2.2);
  const crossings = [];
  for (const b of state.balls) {
    if (!b.active) continue;
    const previousY = b.y;
    if (updateBall(b, now, dt) === 'goal') crossings.push({ ball: b, time: (finishGeometry().gateY - previousY) / (b.y - previousY) });
  }
  // Resolve same-step crossings by crossing time, never by the ball array order.
  crossings.sort((a, b) => a.time - b.time).forEach(c => finishBall(c.ball, now));
  collideBalls(now);
  recordReplayFrame(now);
}

function recordReplayFrame(now) {
  if (state.ending || (state.physicsStep & 1)) return; // 60Hz 기록
  const frame = { t: now, balls: state.balls.filter((b) => b.active || b.finished).map((b) => ({ num: b.num, x: b.x, y: b.y, r: b.r, color: b.color, active: b.active })) };
  state.replayFrames.push(frame);
  const limit = Math.ceil(REPLAY_SECONDS * 60) + 10;
  if (state.replayFrames.length > limit) state.replayFrames.splice(0, state.replayFrames.length - limit);
}

function updateCinematic(now, dt) {
  const active = state.balls.filter((b) => b.active), f = finishGeometry(), finalStart = f.topY - Math.max(250, state.H * 0.38);
  let candidate = null, deep = false, manual = false;
  if (now < state.freezeUntil && state.freezeFocus) { candidate = state.freezeFocus; deep = true; state.cinematicText = `${displayName(state.freezeFocus.num)} 골인!`; }
  else if (state.cameraMode === "track" && state.trackedNum != null) {
    candidate = active.find((b) => b.num === state.trackedNum) || null; manual = !!candidate;
    state.cinematicText = candidate ? `TRACKING · ${displayName(candidate.num)}` : `${state.trackedNum}번 · 대기 또는 골인 완료`;
  } else if (state.cameraMode === "overview") {
    state.cinematicCandidate = null; state.physicsTimeScale = 1; state.photoFinish = false;
    const ys = active.map((b) => b.y), minY = ys.length ? Math.min(...ys) : state.cameraY, maxY = ys.length ? Math.max(...ys) : minY + state.H, spread = Math.max(280, maxY - minY + 180);
    state.zoomTarget = clamp(state.H / spread, 0.7, 1); state.zoom += (state.zoomTarget - state.zoom) * (1 - Math.exp(-dt * 4));
    state.zoomFocusX += (state.W / 2 - state.zoomFocusX) * (1 - Math.exp(-dt * 5));
    const target = (minY + maxY) / 2 - state.H / (2 * state.zoom);
    state.cameraY += (clamp(target, 0, Math.max(0, state.worldH - state.H / state.zoom)) - state.cameraY) * (1 - Math.exp(-dt * 3.8));
    return;
  } else {
    const near = active.filter((b) => b.y > finalStart && b.vy > -90).sort((a, b) => (b.y - Math.abs(b.x - f.center) * 0.22) - (a.y - Math.abs(a.x - f.center) * 0.22));
    candidate = near[0] || null;
    if (candidate) {
      deep = candidate.y > f.gateY - 145 && Math.abs(candidate.x - f.center) < f.half * 1.9 && candidate.vy > 0;
      // 사진 판정: 결승 구간에 두 공이 아주 가까이 붙어 있을 때
      const rival = near[1];
      const photo = !!rival && deep && rival.y > f.gateY - 170 && Math.abs(rival.y - candidate.y) < 52 && Math.abs(rival.x - f.center) < f.half * 2.4;
      if (photo && !state.photoFinish) { state.photoFinish = true; state.photoFinishAt = now; audio.sfx("shutter"); fx.flash(0.35); }
      if (!photo && state.photoFinish && now - state.photoFinishAt > 900) state.photoFinish = false;
      state.cinematicText = state.photoFinish ? `PHOTO FINISH · ${candidate.num}번 vs ${rival ? rival.num : "?"}번` : deep ? `당첨 직전 · ${displayName(candidate.num)}` : `FINAL ZONE · ${displayName(candidate.num)}`;
    } else state.photoFinish = false;
  }
  const wasDeep = state.zoomTarget > 1.4;
  state.cinematicCandidate = candidate;
  const later = state.results.length > 0;
  state.zoomTarget = candidate ? (state.photoFinish ? 1.45 : deep ? 1.22 : manual ? 1.16 : 1.08) : 1;
  state.physicsTimeScale = candidate && !manual ? (state.photoFinish ? 0.45 : deep && state.photoFinish ? .42 : 1) : 1;
  if (deep && !wasDeep && !manual) audio.sfx("slowmo");
  state.zoom += (state.zoomTarget - state.zoom) * (1 - Math.exp(-dt * (deep ? 7 : 4.5)));
  const focusTarget = candidate ? candidate.x : state.W / 2;
  state.zoomFocusX += (focusTarget - state.zoomFocusX) * (1 - Math.exp(-dt * 5));
  const leader = [...active].sort((a, b) => b.y - a.y)[0], anchor = cinematicAnchorY();
  const target = candidate ? candidate.y - anchor : leader ? leader.y - state.H * 0.34 : state.cameraY, maxCamera = Math.max(0, state.worldH - (candidate ? state.H * 0.18 : state.H));
  state.cameraY += (clamp(target, 0, maxCamera) - state.cameraY) * (1 - Math.exp(-dt * (candidate ? 5.8 : 3.1)));
  if (now >= state.freezeUntil) state.freezeFocus = null;
  // 심장박동: 선두가 결승에 가까울수록 빨라짐
  if (candidate && !manual && !state.ending) {
    const prog = clamp((candidate.y - finalStart) / (f.gateY - finalStart), 0, 1);
    audio.heartbeat(now, 1050 - prog * 620, 0.16 + prog * 0.12);
  }
}


function updateMusic() {
  const active = state.balls.filter((b) => b.active);
  if (!active.length) return;
  const leader = active.reduce((best, b) => (b.y > best.y ? b : best), active[0]);
  const prog = clamp(leader.y / state.worldH, 0, 1);
  audio.setIntensity(0.15 + prog * 0.85);
}

function finishBall(ball, now) {
  if (!ball.active || state.ending) return;
  ball.active = false; ball.finished = true; ball.y = state.worldH - 44; ball.glow = 1;
  state.results.push(ball.num);
  const place = state.results.length, safeTarget = clamp(ball.y - cinematicAnchorY(), 0, state.worldH - state.H * 0.18);
  state.cameraY += (safeTarget - state.cameraY) * 0.48;
  state.freezeUntil = now + (place === 1 ? 260 : 190); state.freezeFocus = { x: ball.x, y: ball.y, num: ball.num };
  state.winnerFx = { x: ball.x, num: ball.num, place, start: now };
  state.photoFinish = false;
  fx.hitstop(place === 1 ? 150 : 110, now); fx.shake(place === 1 ? 4 : 2); fx.flash(0.75, "#fff6c4"); fx.aberration(1);
  fx.burst(ball.x, ball.y, ["#ffe27a", "#f2b61b", "#ffffff", "#ffc46b"], 44, { speed: 300, life: 0.8 });
  fx.ring(ball.x, ball.y, "#ffe27a", 170, 0.6, 2); fx.ring(ball.x, ball.y, "#ffffff", 110, 0.4);
  audio.sfx("goal", place); audio.duck(0.18, 0.1); setTimeout(() => audio.unduck(), 700);
  host.renderLiveRanks(); host.setResultCount(state.results.length);
  host.setStageLabel(`${place}등 ${displayName(ball.num)} 도착!${place < state.drawCount ? " 다음 순위를 기다리는 중" : ""}`);
  if (state.results.length >= state.drawCount) { state.ending = true; state.endingAt = now; host.setStatus("결승"); host.celebrate(100); audio.stopTrack(0.8); audio.victory(); }
}

function startReplay(now) {
  const frames = state.replayFrames;
  const endT = frames[frames.length - 1].t, startIndex = Math.max(0, frames.findIndex((f) => f.t >= endT - REPLAY_SECONDS * 1000));
  state.replayState = { index: startIndex, startIndex, startedAt: now, pos: startIndex, done: false, holdUntil: 0 };
  state.cinematicText = "REPLAY"; state.winnerFx = null; state.photoFinish = false; state.cinematicCandidate = null;
  fx.flash(0.5, "#05070f"); fx.aberration(0.6); audio.sfx("shutter");
  host.setStageLabel("결승 순간 리플레이");
}
function updateReplay(now, dt) {
  const rs = state.replayState, frames = state.replayFrames;
  if (rs.holdUntil) { if (now >= rs.holdUntil) rs.done = true; return; }
  rs.pos += dt * 60 * REPLAY_SPEED;
  const index = Math.min(frames.length - 1, Math.floor(rs.pos));
  const frame = frames[index];
  for (const b of state.balls) {
    const snap = frame.balls.find((s) => s.num === b.num);
    if (!snap) continue;
    b.rx = snap.x; b.ry = snap.y; b.rActive = snap.active;
  }
  const f = finishGeometry();
  state.zoomTarget = 1.5; state.zoom += (state.zoomTarget - state.zoom) * (1 - Math.exp(-dt * 5));
  state.zoomFocusX += (f.center - state.zoomFocusX) * (1 - Math.exp(-dt * 4));
  const target = f.gateY - 60 - cinematicAnchorY();
  state.cameraY += (clamp(target, 0, state.worldH - state.H * 0.18) - state.cameraY) * (1 - Math.exp(-dt * 4));
  if (index >= frames.length - 1) { rs.holdUntil = now + 300; fx.flash(0.4, "#fff6c4"); }
}

function finalizeRace() {
  cancelAnimationFrame(state.animationId);
  state.running = false; state.ending = false; state.replayState = null;
  for (const b of state.balls) { delete b.rx; delete b.ry; delete b.rActive; }
  state.photoFinish = false; state.cinematicCandidate = null; state.cinematicText = "";
  host.setStatus("완료");
  const results = [...state.results];
  host.setStageLabel(`${results.map((n, i) => `${i + 1}등 ${displayName(n)}`).join(" · ")}`);
  state.lastResult = { type: "race", mode: state.mode, results, participants: [...state.participants], names: { ...state.names }, basis: state.basis, course: state.course, style: state.style, comeback: state.comeback, createdAt: new Date() };
  const token = state.runToken;
  winnerSequence(results).then((ok) => { if (ok && token === state.runToken) { host.afterRun(results); host.showRaceResults(results); audio.sfx("done"); } });
}

