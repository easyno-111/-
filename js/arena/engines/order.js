// 전체 순서 모드: 팝콘 상자에서 집게가 공을 하나씩 집어 순서판에 올리는 게임 연출.
// 순서 자체는 시작 시 암호학적 난수로 확정되며, 집게는 그 순서를 공개하는 연출만 담당한다.
import { clamp, secureShuffle, lerp } from "../util.js";
import { state, displayName } from "../state.js";
import { fx, audio, host } from "../core.js";
import { BALL_PALETTES } from "../palette.js";
import { resizeCanvas, drawOrderScene, orderGeometry } from "../render.js";

export async function runListMode(eligible, token) {
  state.engine = "list"; fx.reset(); resizeCanvas();
  const order = secureShuffle(eligible), g = orderGeometry(eligible.length);
  const spread = secureShuffle(eligible);
  const game = (state.orderGame = {
    order, total: eligible.length, pick: 0, placed: [], flying: [], fast: false, done: false, finishedAt: 0,
    blowUntil: 0, nextBlowAt: 0, lastPlaced: null, lastPlacedAt: 0,
    claw: { x: state.W / 2, y: g.boxTop + 26, open: true, holding: null, phase: "wait", phaseStart: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, target: null },
    balls: spread.map((num, i) => ({ num, x: g.boxLeft + g.ballR + 6 + Math.random() * (g.chuteX - 12 - g.boxLeft - g.ballR * 2 - 6), y: g.boxTop + 30 + Math.random() * (g.boxBottom - g.boxTop - 60), vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, r: g.ballR, color: BALL_PALETTES[i % BALL_PALETTES.length], held: false, gone: false, trail: [] }))
  });
  drawOrderScene(performance.now());
  host.setStageLabel("팝콘 상자에 번호 공을 넣었습니다 · 집게가 순서대로 집어 올립니다");
  if (!(await host.countdown(token))) return;
  state.raceStart = performance.now(); state.lastFrame = state.raceStart;
  game.claw.phaseStart = state.raceStart; game.nextBlowAt = state.raceStart + 300;
  host.setStatus("추첨"); audio.playTrack("lotto", 0.3);
  cancelAnimationFrame(state.animationId); state.animationId = requestAnimationFrame(orderLoop);
}

const BASE = { move: 0.26, down: 0.24, grab: 0.14, up: 0.2, carry: 0.28, drop: 0.1 };
// 처음 3개와 마지막 2개는 천천히, 중간은 자동으로 빨라진다. 빨리 감기는 그 위에 추가로 곱한다.
function speedFactor(game) {
  const k = game.pick, n = game.total, base = k < 3 || k >= n - 2 ? 1 : k < 6 ? 0.7 : 0.55;
  return base * (game.fast ? 0.35 : 1);
}
function dwellFor(game) {
  if (game.fast) return 0.02;
  const k = game.pick, n = game.total;
  if (k === 0) return 1.3;
  if (k === n - 1) return 1.1;
  if (k === 1) return 0.7;
  if (k === 2) return 0.45;
  return 0.1;
}

function orderLoop(now) {
  if (!state.running || state.engine !== "list") return;
  const game = state.orderGame, dt = Math.min((now - state.lastFrame) / 1000, 0.05); state.lastFrame = now;
  fx.update(dt);
  if (!fx.isFrozen(now)) updateOrder(game, now, dt);
  drawOrderScene(now);
  if (game.done && now - game.finishedAt > 1300) { finalizeOrder(); return; }
  state.animationId = requestAnimationFrame(orderLoop);
}

function updateOrder(game, now, dt) {
  const g = orderGeometry(game.total), c = game.claw;
  // 바람(팝콘): 집게가 내려가는 중이 아닐 때만
  const calm = c.phase === "down" || c.phase === "grab";
  if (!calm && now >= game.nextBlowAt && !game.done) {
    game.blowUntil = now + 260; game.nextBlowAt = now + (game.fast ? 900 : 1400) + Math.random() * 500;
    for (const b of game.balls) if (!b.held && !b.gone) { b.vy -= 220 + Math.random() * 260; b.vx += (Math.random() - 0.5) * 160; }
    for (let i = 0; i < g.vents; i++) fx.smoke(g.boxLeft + ((i + 0.5) * (g.boxRight - g.boxLeft)) / g.vents, g.boxBottom - 6, "#5e6c8f", 2, { vy: -120 });
    audio.sfx("gate");
  }
  updateBoxPhysics(game, g, dt);
  updateClaw(game, g, now, dt);
  updateFlying(game, g, now, dt);
  audio.setIntensity(0.3 + 0.6 * (game.placed.length / Math.max(1, game.total)));
}

function updateBoxPhysics(game, g, dt) {
  const balls = game.balls.filter((b) => !b.held && !b.gone);
  for (const b of balls) {
    b.vy += 520 * dt; b.vx *= Math.pow(0.992, dt * 60);
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < g.boxLeft + b.r + 2) { b.x = g.boxLeft + b.r + 2; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > g.chuteX - 12 - b.r) { b.x = g.chuteX - 12 - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
    if (b.y > g.boxBottom - b.r - 2) { b.y = g.boxBottom - b.r - 2; b.vy = -Math.abs(b.vy) * 0.35; if (Math.abs(b.vy) < 20) b.vy = 0; }
    if (b.y < g.boxTop + b.r + 2) { b.y = g.boxTop + b.r + 2; b.vy = Math.abs(b.vy) * 0.3; }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
    if (!d2 || d2 >= min * min) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, p = (min - d) / 2;
    a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) { const imp = -rel * 0.45; a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny; }
  }
}

function setPhase(c, phase, now) { c.phase = phase; c.phaseStart = now; c.fromX = c.x; c.fromY = c.y; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function updateClaw(game, g, now, dt) {
  const c = game.claw, elapsed = (now - c.phaseStart) / 1000, sf = speedFactor(game);
  if (game.done) return;
  if (c.phase === "wait") {
    // 상자 위에서 살짝 흔들리며 대기
    c.y = g.railY + 18 + Math.sin(now / 180) * 2;
    if (elapsed >= dwellFor(game)) {
      if (game.pick >= game.total) { game.done = true; game.finishedAt = now; return; }
      const num = game.order[game.pick]; c.target = game.balls.find((b) => b.num === num && !b.gone) || null;
      if (!c.target) { game.pick++; return; }
      c.open = true; setPhase(c, "move", now); c.toX = c.target.x; c.toY = g.railY + 18;
      if (game.pick === 0 || game.pick === game.total - 1) audio.sfx("suck");
    }
    return;
  }
  const dur = BASE[c.phase] * sf, t = clamp(elapsed / dur, 0, 1), e = easeInOut(t);
  if (c.phase === "move") {
    c.toX = c.target.x; c.x = lerp(c.fromX, c.toX, e); c.y = c.toY;
    if (t >= 1) { setPhase(c, "down", now); c.toY = c.target.y - c.target.r - 2; }
  } else if (c.phase === "down") {
    c.x += (c.target.x - c.x) * Math.min(1, dt * 10); c.y = lerp(c.fromY, c.target.y - c.target.r - 2, e);
    if (t >= 1) { setPhase(c, "grab", now); }
  } else if (c.phase === "grab") {
    c.open = t < 0.5;
    if (t >= 0.5 && !c.holding) { c.holding = c.target; c.target.held = true; audio.sfx("tick", game.pick % 8); fx.ring(c.x, c.y + c.holding.r, "#c9f3ff", 40, 0.3); }
    if (c.holding) { c.holding.x = c.x; c.holding.y = c.y + c.holding.r + 4; }
    if (t >= 1) { setPhase(c, "up", now); c.toY = g.railY + 18; }
  } else if (c.phase === "up") {
    c.y = lerp(c.fromY, c.toY, e); c.holding.x = c.x; c.holding.y = c.y + c.holding.r + 4;
    if (t >= 1) { setPhase(c, "carry", now); c.toX = g.chuteX; }
  } else if (c.phase === "carry") {
    c.x = lerp(c.fromX, c.toX, e); c.holding.x = c.x; c.holding.y = c.y + c.holding.r + 4;
    if (t >= 1) setPhase(c, "drop", now);
  } else if (c.phase === "drop") {
    c.open = true;
    if (c.holding) {
      const b = c.holding, idx = game.pick, cell = g.cell(idx);
      b.held = false; b.gone = true; c.holding = null;
      game.flying.push({ num: b.num, color: b.color, fromX: g.chuteX, fromY: g.boardTop - 10, toX: cell.cx, toY: cell.cy, start: now, dur: (game.fast ? 0.28 : 0.5) * 1000, index: idx });
      audio.sfx("eject");
    }
    if (t >= 1) { game.pick++; setPhase(c, "wait", now); }
  }
}

function updateFlying(game, g, now) {
  for (const f of game.flying) {
    if (f.landed) continue;
    const t = clamp((now - f.start) / f.dur, 0, 1);
    f.x = lerp(f.fromX, f.toX, t); f.y = lerp(f.fromY, f.toY, t) - Math.sin(t * Math.PI) * g.arcH;
    if (t >= 1) {
      f.landed = true; game.placed.push({ num: f.num, color: f.color, index: f.index });
      game.lastPlaced = f; game.lastPlacedAt = now; state.results.push(f.num);
      const first = f.index === 0, last = f.index === game.total - 1;
      fx.burst(f.toX, f.toY, first ? ["#ffe27a", "#f2b61b", "#fff"] : ["#c9f3ff", "#5ed4ff"], first || last ? 24 : 7, { speed: first || last ? 220 : 120, life: 0.45 });
      if (first || last) { fx.shake(first ? 5 : 4); fx.flash(0.35, "#fff6c4"); audio.sfx("stamp"); if (last) { fx.ring(f.toX, f.toY, "#ffe27a", 120, 0.6, 2); audio.victory(); } }
      else audio.sfx("assign");
      host.renderLiveRanks(); host.setResultCount(game.placed.length);
      host.setStageLabel(`${f.index + 1}번째 · ${displayName(f.num)}${last ? " · 마지막!" : first ? " · 첫 번째!" : ""}`);
    }
  }
}

function finalizeOrder() {
  cancelAnimationFrame(state.animationId);
  const game = state.orderGame, order = [...game.order];
  state.running = false; state.results = order;
  state.lastResult = { type: "order", order, participants: [...state.participants], names: { ...state.names }, createdAt: new Date() };
  audio.stopTrack(0.6);
  host.afterRun(null);
  host.showOrderResults(order);
  host.celebrate(90); audio.sfx("done");
}
