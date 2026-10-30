// 팀 나누기 엔진: 파도 출발, 정원이 차면 닫히는 팀 통, 튕겨 나오기
import { clamp, secureShuffle } from "../util.js?v=8.6";
import { state, displayName } from "../state.js?v=8.6";
import { fx, audio, host } from "../core.js?v=8.6";
import { teamWorldHeight, prepareTeamBins, buildTeamCourse, updateTeamDividers } from "../courses.js?v=8.6";
import { makePhysicsBall, updateBall, collideBalls, updateLeader } from "../physics.js?v=8.6";
import { resizeCanvas, drawScene } from "../render.js?v=8.6";

export async function runTeamMode(eligible, token) {
  state.engine = "teams";
  Object.assign(state, { teamAssignments: [], teamQueue: secureShuffle(eligible), teamWave: 0, teamWaveSize: eligible.length > 48 ? 36 : eligible.length, nextWaveAt: 0, teamFx: null, rescueCount: 0, currentLeaderNum: null, previousLeaderNum: null, leaderChangedAt: 0, physicsAccumulator: 0, physicsTimeScale: 1, zoom: 1, zoomTarget: 1, zoomFocusX: state.W / 2, freezeUntil: 0, winnerFx: null, photoFinish: false, replayState: null, physicsStep: 0 });
  fx.reset();
  resizeCanvas(); state.worldH = teamWorldHeight(); prepareTeamBins(eligible.length, secureShuffle); buildTeamCourse(); state.cameraY = 0; state.balls = [];
  drawScene();
  host.setStageLabel(`${state.teamCount}개 팀 통 준비 · 정원이 차면 입구가 닫힙니다`);
  if (!(await host.countdown(token))) return;
  state.raceStart = performance.now(); state.lastFrame = state.raceStart;
  spawnTeamWave(state.lastFrame); host.setStatus("배치");
  audio.playTrack("teams", 0.3);
  cancelAnimationFrame(state.animationId); state.animationId = requestAnimationFrame(teamLoop);
}

function spawnTeamWave(now) {
  if (!state.teamQueue.length) return;
  state.teamWave++;
  const wave = state.teamQueue.splice(0, state.teamWaveSize), cols = Math.min(9, Math.max(5, Math.floor(state.W / 58))), left = state.W * 0.14, right = state.W * 0.86, gap = (right - left) / Math.max(1, cols - 1);
  const binW = (state.W - 40) / state.teamCount, r = clamp(Math.min(state.W < 520 ? 11 : 14, binW * 0.3), 8, 14);
  state.balls = wave.map((num, i) => makePhysicsBall(num, left + (i % cols) * gap + (Math.random() - 0.5) * 5, 52 + Math.floor(i / cols) * 32, r, i, now));
  state.balls.forEach((b) => { b.vx = (Math.random() - 0.5) * 180 + (state.W / 2 - b.x) * 0.35; b.vy = 78 + Math.random() * 82; });
  state.nextWaveAt = 0;
  host.setStageLabel(`${state.teamWave}차 출발 · ${wave.length}명 배치 중${state.teamQueue.length ? ` · 대기 ${state.teamQueue.length}명` : ""}`);
  audio.sfx("go");
}

function teamLoop(now) {
  if (!state.running || state.engine !== "teams") return;
  const frameDt = Math.min((now - state.lastFrame) / 1000, 0.05); state.lastFrame = now;
  fx.update(frameDt);
  updateTeamCamera(now, frameDt);
  if (!fx.isFrozen(now)) state.physicsAccumulator += frameDt * state.spectatorSpeed; else state.physicsAccumulator = 0;
  const fixed = 1 / 120; let loops = 0;
  while (state.physicsAccumulator >= fixed && loops < 30) { updateTeam(now, fixed); state.physicsAccumulator -= fixed; loops++; }
  audio.setIntensity(0.3 + 0.6 * (state.participants.length ? state.results.length / state.participants.length : 0));
  drawScene();
  if (state.ending && now - state.endingAt > 1200) { finalizeTeams(); return; }
  state.animationId = requestAnimationFrame(teamLoop);
}

function updateTeam(now, dt) {
  state.physicsStep++;
  for (const rotor of state.rotors) { rotor.angle += rotor.speed * dt; rotor.hit = Math.max(0, (rotor.hit || 0) - dt * 2); }
  for (const gate of state.gates) { gate.phase += gate.speed * dt; gate.gapX = state.W / 2 + Math.sin(gate.phase) * state.W * 0.24; gate.pulse = Math.max(0, gate.pulse - dt * 2.5); }
  for (const p of state.pegs) if (p.hit > 0) p.hit = Math.max(0, p.hit - dt * 2.2);
  for (const bp of state.bumpers) bp.pulse = Math.max(0, bp.pulse - dt * 2.2);
  updateTeamDividers(dt);
  for (const b of state.balls) {
    if (!b.active) continue;
    updateBall(b, now, dt, true);
    const bin = b._binHit;
    if (bin && bin.closed && b.y > bin.gateY - b.r) ejectFromClosedBin(b, bin, now);
  }
  collideBalls(now);
  processTeamEntries(now);
  state.teamBins.forEach((bin) => (bin.pulse = Math.max(0, bin.pulse - dt * 1.8)));
  if (!state.balls.some((b) => b.active) && !state.ending) {
    if (state.teamQueue.length) { if (!state.nextWaveAt) state.nextWaveAt = now + 720; if (now >= state.nextWaveAt) spawnTeamWave(now); }
    else if (state.results.length === state.participants.length) { state.ending = true; state.endingAt = now; host.setStatus("완료"); host.setStageLabel("모든 번호의 팀 배치가 완료되었습니다"); host.celebrate(90); audio.stopTrack(0.6); audio.victory(); }
  }
}

function processTeamEntries(now) {
  const crossings = state.balls.filter((b) => b.active && b._prevY < b._teamGateY && b.y >= b._teamGateY).sort((a, b) => a._crossT - b._crossT || a.num - b.num);
  for (const b of crossings) {
    const bin = state.teamBins.find((v) => b.x >= v.x1 && b.x < v.x2) || state.teamBins[state.teamBins.length - 1];
    if (bin.closed || bin.members.length >= bin.capacity) { ejectFromClosedBin(b, bin, now); continue; }
    bin.members.push(b.num); state.results.push(b.num); state.teamAssignments.push({ num: b.num, team: bin.index + 1});
    b.active = false; bin.pulse = 1;
    if (bin.members.length >= bin.capacity) { bin.closed = true; bin.closedAt = now; audio.sfx("teamFull", bin.index); fx.shake(3); }
    state.teamFx = { num: b.num, team: bin.index + 1, x: bin.cx, start: now };
    fx.burst(bin.cx, bin.gateY + 18, [bin.pal.light, bin.pal.base, "#ffffff"], 18, { speed: 180 });
    fx.ring(bin.cx, bin.gateY + 10, bin.pal.light, 60, 0.35);
    audio.sfx("assign");
    host.renderLiveRanks(); host.setResultCount(state.results.length);
    host.setStageLabel(`${displayName(b.num)} → ${bin.index + 1}조 · ${bin.members.length}/${bin.capacity}${bin.closed ? " · 입구 닫힘" : ""}`);
  }
}

function ejectFromClosedBin(b, bin, now) {
  const open = state.teamBins.filter((v) => !v.closed && v.members.length < v.capacity);
  const target = open.sort((a, c) => Math.abs(a.cx - bin.cx) - Math.abs(c.cx - bin.cx))[0];
  const direction = target ? Math.sign(target.cx - bin.cx) || 1 : Math.sign(state.W / 2 - bin.cx) || 1;
  b.y = bin.gateY - b.baseR - 10; b.vy = -clamp(270 + Math.abs(b.vy) * 0.72, 285, 430);
  b.vx = clamp(b.vx * 0.28 + direction * (145 + Math.random() * 55) + (Math.random() - 0.5) * 34, -360, 360);
  b.ghostUntil = now + 720; b.shrinkUntil = now + 520; b.r = b.baseR * 0.94; b.motionX = b.x; b.motionY = b.y; b.motionAt = now; b.rescueGlow = 1; b.rescueLabel = "재도전";
  bin.pulse = 1;
  fx.burst(b.x, bin.gateY - 3, ["#9af4f8", "#1fc3cf"], 12, { speed: 160, vy: -120 }); fx.smoke(b.x, bin.gateY - 6, "#5e6c8f", 3);
  host.setStageLabel(`${displayName(b.num)} · 만원인 ${bin.index + 1}조 통에서 튕겨 나와 재도전!`);
  audio.sfx("eject");
}

function updateTeamCamera(now, dt) {
  const active = state.balls.filter((b) => b.active);
  updateLeader(active, now);
  let target = null;
  if (state.cameraMode === "track" && state.trackedNum != null) target = active.find((b) => b.num === state.trackedNum) || null;
  if (state.cameraMode === "overview" && active.length) {
    const ys = active.map((b) => b.y), minY = Math.min(...ys), maxY = Math.max(...ys), spread = Math.max(300, maxY - minY + 170);
    state.zoomTarget = clamp(state.H / spread, 0.7, 1); state.zoom += (state.zoomTarget - state.zoom) * (1 - Math.exp(-dt * 4));
    state.zoomFocusX += (state.W / 2 - state.zoomFocusX) * (1 - Math.exp(-dt * 5));
    const y = (minY + maxY) / 2 - state.H / (2 * state.zoom);
    state.cameraY += (clamp(y, 0, Math.max(0, state.worldH - state.H / state.zoom)) - state.cameraY) * (1 - Math.exp(-dt * 3.6));
    state.cinematicCandidate = null; return;
  }
  if (!target && state.cameraMode !== "track") target = active.reduce((best, b) => (!best || b.y > best.y ? b : best), null);
  state.cinematicCandidate = target;
  state.cinematicText = target ? `${state.cameraMode === "track" ? "TRACKING" : "TEAM LEADER"} · ${displayName(target.num)}` : state.cameraMode === "track" && state.trackedNum != null ? `${state.trackedNum}번 · 다음 출발 대기` : "다음 출발 준비";
  state.zoomTarget = target ? (state.cameraMode === "track" ? 1.32 : 1.08) : 1;
  state.zoom += (state.zoomTarget - state.zoom) * (1 - Math.exp(-dt * 4.8));
  state.zoomFocusX += ((target?.x || state.W / 2) - state.zoomFocusX) * (1 - Math.exp(-dt * 5));
  const y = target ? target.y - state.H * 0.5 : state.cameraY;
  state.cameraY += (clamp(y, 0, Math.max(0, state.worldH - state.H / state.zoom)) - state.cameraY) * (1 - Math.exp(-dt * 4));
}

function finalizeTeams() {
  cancelAnimationFrame(state.animationId);
  state.running = false; state.ending = false;
  const teams = state.teamBins.map((b) => [...b.members]);
  state.lastResult = { type: "teams", teams, participants: [...state.participants], names: { ...state.names }, assignments: [...state.teamAssignments], createdAt: new Date() };
  host.afterRun(null);
  host.showTeamResults(teams);
  audio.sfx("done");
}

