// 핀볼 물리: 공, 핀, 범퍼, 회전봉, 타이밍 게이트, 레일, 공끼리 충돌, 끼임 구조
import { clamp } from "./util.js?v=8.1";
import { state } from "./state.js?v=8.1";
import { fx, audio } from "./core.js?v=8.1";
import { BALL_PALETTES } from "./palette.js?v=8.1";
import { finishGeometry } from "./courses.js?v=8.1";

export function makePhysicsBall(num, x, y, r, i, now = performance.now()) {
  return {
    num, x, y, vx: 0, vy: 0, r, baseR: r, color: BALL_PALETTES[i % BALL_PALETTES.length], active: true, finished: false,
    lastProgress: y, lastProgressAt: now, lastBoostAt: -9999, glow: 0, chaseGlow: 0, motionX: x, motionY: y, motionAt: now,
    lastSafeX: x, lastSafeY: y, lastSafeAt: now, rescueStage: 0, ghostUntil: 0, shrinkUntil: 0, rescueGlow: 0, trail: [], squash: 0, squashAngle: 0
  };
}

export function updateBall(b, now, dt, teamMode = false) {
  const prevY = b.y, f = finishGeometry();
  b.vy += (teamMode ? 294 : state.style === "quick" ? 277 : 254) * dt;
  b.vx *= Math.pow(0.9982, dt * 60); b.vy *= Math.pow(0.999, dt * 60);
  b.glow = Math.max(0, b.glow - dt * 0.7);
  b.squash = Math.max(0, b.squash - dt * 6);
  b.vx = clamp(b.vx, -465, 465); b.vy = clamp(b.vy, -340, teamMode ? 460 : state.style === "quick" ? 437 : 398);
  b.x += b.vx * dt; b.y += b.vy * dt;
  const wall = 20 + b.r;
  if (b.x < wall) { b.x = wall; b.vx = Math.abs(b.vx) * 0.76 + 22; hitSquash(b, 0.4, 0); }
  else if (b.x > state.W - wall) { b.x = state.W - wall; b.vx = -Math.abs(b.vx) * 0.76 - 22; hitSquash(b, 0.4, 0); }
  if (b.y < 25) { b.y = 25; b.vy = Math.abs(b.vy); }
  for (const p of state.pegs) {
    if (Math.abs(p.y - b.y) > b.r + 10) continue;
    if (collideCircle(b, p.x, p.y, p.r, 0.56)) { p.hit = 0.25; audio.sfx("peg"); if (Math.random() < 0.35) fx.burst(b.x, b.y, ["#e4ecfb", "#c9f3ff"], 1, { speed: 90, life: 0.25 }); }
  }
  for (const bp of state.bumpers) {
    if (Math.abs(bp.y - b.y) > bp.r + b.r + 4) continue;
    if (collideCircle(b, bp.x, bp.y, bp.r, bp.restitution ?? 0.92, bp.kick ?? 72)) {
      bp.pulse = 0.4; hitSquash(b, 0.8, Math.atan2(b.y - bp.y, b.x - bp.x));
      fx.burst(b.x, b.y, [bp.color, "#ffffff"], 5, { speed: 170, life: 0.4 }); fx.ring(bp.x, bp.y, bp.color, bp.r * 2.1, 0.32);
      audio.sfx("bumper");
    }
  }
  for (const wheel of state.wheels) {
    if (Math.abs(wheel.y - b.y) > wheel.r + b.r + 4) continue;
    collideWheel(b, wheel, dt);
  }
  for (const r of state.rotors) { if (Math.abs(r.y - b.y) > r.len * 0.55) continue; collideRotor(b, r); }
  for (const gate of state.gates) {
    if (Math.abs(gate.y - b.y) > b.r + 9) continue;
    collideGate(b, gate, dt);
    // 통과문 위에 얹힌 공은 컨베이어처럼 가운데 틈 쪽으로 계속 밀어 준다 (가장자리 끼임 방지)
    if (b.y < gate.y && Math.abs(b.x - gate.gapX) > gate.gapW / 2 - b.r) b.vx += Math.sign(gate.gapX - b.x) * 260 * dt;
  }
  if (state.comeback === "boost") for (const booster of state.boosters) { if (Math.abs(booster.y - b.y) <= booster.r + b.r + 4) collideBooster(b, booster, now); }
  for (const rail of state.rails) {
    if (teamMode && rail.teamDivider && now < (b.ghostUntil || 0)) continue;
    const minY = Math.min(rail.y1, rail.y2) - b.r - rail.w, maxY = Math.max(rail.y1, rail.y2) + b.r + rail.w;
    if (b.y < minY || b.y > maxY) continue;
    collideRail(b, rail, dt);
  }
  // 잔상 기록 (빠를 때만 그려짐)
  if ((state.physicsStep & 3) === 0) { b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 5) b.trail.pop(); }
  if (teamMode) {
    const bin = state.teamBins.find((v) => b.x >= v.x1 && b.x < v.x2) || state.teamBins[state.teamBins.length - 1], gateY = bin.gateY;
    b._prevY = prevY; b._teamGateY = gateY; b._crossT = b.y === prevY ? 1 : clamp((gateY - prevY) / (b.y - prevY), 0, 1);
    b._binHit = bin;
    handleStuck(b, now);
    return null;
  }
  if (isGoalCrossing(b, prevY)) return "goal";
  const insideMouth = Math.abs(b.x - f.center) <= Math.max(10, f.half - b.r - 6);
  if (!insideMouth && b.y > f.gateY - b.r) { b.y = f.gateY - b.r; b.vy = -Math.abs(b.vy) * 0.42 - 38; b.vx += (f.center - b.x) * 0.12; }
  handleStuck(b, now);
  return null;
}
function hitSquash(b, amount, angle) { b.squash = Math.max(b.squash, amount); b.squashAngle = angle; }

export function handleStuck(b, now) {
  if (!b.active) return;
  if (!b.baseR) b.baseR = b.r;
  if (b.shrinkUntil && now >= b.shrinkUntil) { b.r = b.baseR; b.shrinkUntil = 0; }
  b.rescueGlow = Math.max(0, (b.rescueGlow || 0) - 0.014);
  const moved = Math.hypot(b.x - b.motionX, b.y - b.motionY), forward = b.y - b.motionY;
  if (forward > 24 || moved > 42) {
    b.motionX = b.x; b.motionY = b.y; b.motionAt = now; b.rescueStage = 0;
    if (forward > 20) { b.lastSafeX = b.x; b.lastSafeY = b.y; b.lastSafeAt = now; }
    return;
  }
  const elapsed = now - (b.motionAt || now);
  if (b.rescueStage === 0 && elapsed > 2400) {
    b.vx += (Math.random() < 0.5 ? -1 : 1) * (68 + Math.random() * 34); b.vy = Math.max(b.vy, 92); b.rescueStage = 1; b.motionAt = now; b.rescueGlow = 1; state.rescueCount++; audio.sfx("rescue"); return;
  }
  if (b.rescueStage === 1 && elapsed > 2400) {
    b.ghostUntil = now + 820; b.shrinkUntil = now + 820; b.r = b.baseR * 0.92; b.vx += (Math.random() < 0.5 ? -1 : 1) * 112; b.vy = Math.max(b.vy, 132); b.rescueStage = 2; b.motionAt = now; b.rescueGlow = 1; state.rescueCount++; audio.sfx("rescue"); return;
  }
  if (b.rescueStage === 2 && elapsed > 2800) {
    b.x = clamp(b.lastSafeX || b.x, 24 + b.baseR, state.W - 24 - b.baseR); b.y = Math.max(28, Math.min(b.y - 34, (b.lastSafeY || b.y) - 12));
    b.vx = (Math.random() - 0.5) * 130; b.vy = 118; b.r = b.baseR; b.shrinkUntil = 0; b.ghostUntil = now + 520; b.rescueStage = 0; b.motionX = b.x; b.motionY = b.y; b.motionAt = now; b.rescueGlow = 1; state.rescueCount++;
    fx.smoke(b.x, b.y, "#9aa8c7", 4);
  }
}

export function isGoalCrossing(b, prevY) {
  const f = finishGeometry(), inside = Math.abs(b.x - f.center) <= Math.max(10, f.half - b.r - 6);
  return inside && b.vy > 0 && prevY < f.gateY && b.y >= f.gateY;
}

export function collideCircle(b, x, y, r, bounce, boost = 18) {
  const dx = b.x - x, dy = b.y - y, min = b.r + r, d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return false;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = min - d;
  b.x += nx * push; b.y += ny * push;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= dot * (1 + bounce) * nx; b.vy -= dot * (1 + bounce) * ny; }
  b.vx += nx * boost; b.vy += ny * boost;
  return true;
}

// Solid rotating plate: the visible rim is also the collision boundary.
// Tangential friction carries a ball off the top, instead of trapping it on a flat hub.
export function collideWheel(b, wheel, dt) {
  const dx = b.x - wheel.x, dy = b.y - wheel.y;
  const distance = Math.hypot(dx, dy), minDistance = wheel.r + b.r;
  if (distance >= minDistance) return false;
  const nx = distance > .0001 ? dx / distance : 1, ny = distance > .0001 ? dy / distance : 0;
  b.x = wheel.x + nx * (minDistance + .15); b.y = wheel.y + ny * (minDistance + .15);
  const normal = b.vx * nx + b.vy * ny;
  if (normal < 0) { b.vx -= normal * 1.42 * nx; b.vy -= normal * 1.42 * ny; }
  const tx = -ny, ty = nx;
  const target = Math.sign(wheel.speed) * clamp(Math.abs(wheel.speed * wheel.r), 65, 175);
  const tangent = b.vx * tx + b.vy * ty;
  const impulse = (target - tangent) * (1 - Math.exp(-dt * 14));
  b.vx += tx * impulse; b.vy += ty * impulse;
  wheel.hit = .22;
  return true;
}

export function collideRotor(b, r) {
  const ax = Math.cos(r.angle) * r.len / 2, ay = Math.sin(r.angle) * r.len / 2, x1 = r.x - ax, y1 = r.y - ay, x2 = r.x + ax, y2 = r.y + ay;
  const vx = x2 - x1, vy = y2 - y1, t = clamp(((b.x - x1) * vx + (b.y - y1) * vy) / (vx * vx + vy * vy), 0, 1), px = x1 + t * vx, py = y1 + t * vy;
  const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = b.r + 6;
  if (d >= min || d === 0) return;
  const nx = dx / d, ny = dy / d;
  b.x += nx * (min - d); b.y += ny * (min - d);
  const surfaceSpeed = r.speed * (t - 0.5) * r.len, svx = -Math.sin(r.angle) * surfaceSpeed, svy = Math.cos(r.angle) * surfaceSpeed;
  const rvx = b.vx - svx, rvy = b.vy - svy, dot = rvx * nx + rvy * ny;
  if (dot < 0) { b.vx -= dot * 1.72 * nx; b.vy -= dot * 1.72 * ny; r.hit = 0.2; }
  b.vx += svx * 0.28; b.vy += svy * 0.28;
}

export function collideGate(b, g, dt) {
  const leftEnd = g.gapX - g.gapW / 2, rightStart = g.gapX + g.gapW / 2;
  const base = { y1: g.y, y2: g.y, w: 8, color: g.color, railType: "bounce", gate: true };
  let hit = false;
  if (leftEnd > 22) hit = collideRail(b, { ...base, x1: 20, x2: leftEnd }, dt) || hit;
  if (rightStart < state.W - 22) hit = collideRail(b, { ...base, x1: rightStart, x2: state.W - 20 }, dt) || hit;
  if (hit) {
    g.pulse = 0.35; audio.sfx("gate");
  }
  return hit;
}

export function collideBooster(b, p, now) {
  const dx = b.x - p.x, dy = b.y - p.y, min = b.r + p.r;
  if (dx * dx + dy * dy >= min * min || now - (b.lastBoostAt || -9999) < 900) return false;
  b.lastBoostAt = now; b.vy = Math.min(440, b.vy + 145); b.vx += (state.W / 2 - b.x) * 0.055; p.pulse = 0.5; b.glow = Math.max(b.glow, 0.5);
  fx.burst(p.x, p.y, [p.color, "#dbff8a"], 7, { speed: 150, vy: 120 }); audio.sfx("booster");
  return true;
}

export function collideRail(b, r, dt = 1 / 120) {
  const vx = r.x2 - r.x1, vy = r.y2 - r.y1, len2 = vx * vx + vy * vy, len = Math.sqrt(len2), tx = vx / len, ty = vy / len;
  const t = clamp(((b.x - r.x1) * vx + (b.y - r.y1) * vy) / len2, 0, 1), px = r.x1 + t * vx, py = r.y1 + t * vy;
  const dx = b.x - px, dy = b.y - py, min = b.r + r.w / 2, d2 = dx * dx + dy * dy;
  if (!d2 || d2 >= min * min) return false;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, type = r.railType || "normal";
  b.x += nx * (min - d + 0.08); b.y += ny * (min - d + 0.08);
  const normalSpeed = b.vx * nx + b.vy * ny;
  if (normalSpeed < 0) {
    const restitution = r.finish ? 0.28 : type === "bounce" ? 0.68 : type === "speed" ? 0.18 : 0.25;
    b.vx -= normalSpeed * (1 + restitution) * nx; b.vy -= normalSpeed * (1 + restitution) * ny;
    if (normalSpeed < -160) hitSquash(b, 0.5, Math.atan2(ny, nx));
  }
  const keep = r.finish ? 0.997 : type === "speed" ? 0.99985 : type === "bounce" ? 0.9992 : 0.99955;
  const tangent = (b.vx * tx + b.vy * ty) * keep, normal = b.vx * nx + b.vy * ny;
  b.vx = tx * tangent + nx * normal; b.vy = ty * tangent + ny * normal;
  if (!r.finish && Math.abs(ty) > 0.12) {
    const sign = ty >= 0 ? 1 : -1, downX = tx * sign, downY = ty * sign, slide = type === "speed" ? 174 : type === "bounce" ? 64 : 110, downSpeed = b.vx * downX + b.vy * downY;
    b.vx += downX * slide * dt; b.vy += downY * slide * dt;
    if (type === "speed" && downSpeed < 50 && b.vy > -120) { const lift = (50 - downSpeed) * Math.min(1, dt * 5); b.vx += downX * lift; b.vy += downY * lift; }
  }
  return true;
}

export function collideBalls(now = state.lastFrame) {
  const active = state.balls.filter((b) => b.active);
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    if (now < (a.ghostUntil || 0) || now < (b.ghostUntil || 0)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) { const impulse = -rel * 0.82; a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny; }
  }
}

export function applyComebackAssist(dt) {
  const active = state.balls.filter((b) => b.active);
  for (const b of active) b.chaseGlow = Math.max(0, b.chaseGlow - dt * 1.8);
  if (state.comeback === "pure" || active.length < 2) { state.chaseWindTarget = 0; state.chaseWind += (state.chaseWindTarget - state.chaseWind) * Math.min(1, dt * 3); return; }
  const strong = state.comeback === "boost", leader = active.reduce((best, b) => (b.y > best.y ? b : best), active[0]);
  const threshold = state.H * (strong ? 0.72 : 1.02), assistLimit = state.worldH - Math.max(state.H * 0.72, 520), base = strong ? 92 : 54, extra = strong ? 108 : 70;
  let helped = 0;
  for (const b of active) {
    const gap = leader.y - b.y;
    if (gap > threshold && b.y < assistLimit) {
      const strength = clamp((gap - threshold) / (state.H * (strong ? 1.05 : 1.3)), 0, 1), next = b.vy + dt * (base + extra * strength), cap = Math.max(strong ? 260 : 225, leader.vy + (strong ? 165 : 115));
      b.vy = Math.min(next, cap); b.chaseGlow = Math.max(b.chaseGlow, (strong ? 0.52 : 0.34) + 0.45 * strength); helped++;
    }
  }
  state.chaseWindTarget = helped ? 1 : 0;
  state.chaseWind += (state.chaseWindTarget - state.chaseWind) * Math.min(1, dt * 2.8);
}

export function updateLeader(active, now) {
  if (!active.length) return;
  const leader = active.reduce((best, b) => (!best || b.y > best.y ? b : best), null);
  if (!leader || leader.num === state.currentLeaderNum) return;
  state.previousLeaderNum = state.currentLeaderNum; state.currentLeaderNum = leader.num; state.leaderChangedAt = now;
}
