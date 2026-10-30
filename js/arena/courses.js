// 코스 생성: 핀 숲, 갈림길, 타이밍 게이트, 범퍼, 회전봉, 혼합실, 결승 깔때기, 팀 통
import { clamp, makeRand } from "./util.js?v=8.1";
import { state } from "./state.js?v=8.1";
import { PAL, TEAM_COLORS } from "./palette.js?v=8.1";

export function raceWorldHeight() {
  // Dense bumper rooms take longer per metre than wheel/garden rooms.
  if (state.course === 'factory') return state.style === 'tension' ? 20000 : 10000;
  return state.style === 'tension' ? 30000 : 14000;
}
export function startColumns() { return Math.max(3, Math.min(10, Math.floor((state.W * .72) / 36))); }
export function startDepth() { return Math.max(260, Math.ceil((state.raceCount || 30) / startColumns()) * 38 + 100); }
export function teamWorldHeight() { return Math.max(state.H * 3.9, 2750); }
export function finishGeometry() {
  const half = clamp(state.W * 0.072, 40, 58);
  return { center: state.W / 2, half, gateY: state.worldH - 54, topY: state.worldH - 245 };
}

function clearCourse() {
  state.pegs = []; state.bumpers = []; state.rotors = []; state.wheels = []; state.gates = []; state.boosters = []; state.rails = []; state.sections = [];
}
export function buildCourse() {
  const rand = makeRand(state.courseSeed), W = state.W, worldH = state.worldH || state.H;
  clearCourse();
  buildArenaCourse(rand, W, worldH);
  if (state.comeback === "boost") addBoosters(W, worldH);
  buildFinishFunnel(W, worldH);
}

function rail(x1, y1, x2, y2, w, railType, extra = {}) { return { x1, y1, x2, y2, w, railType, ...extra }; }
function bumper(x, y, r, color) { return { x, y, r, pulse: 0, color }; }

export function addPegBand(rand, W, y1, y2, step = 88) {
  const cols = W < 520 ? 7 : 9, spacing = W / (cols + 1);
  let row = 0;
  for (let y = y1; y <= y2; y += step + (rand() - 0.5) * 18) {
    const offset = row % 2 ? spacing * 0.5 : 0, gap = 1 + Math.floor(rand() * cols), gap2 = row % 3 === 0 ? Math.ceil(cols / 2) : -1;
    for (let c = 1; c <= cols; c++) {
      if (c === gap || c === gap2) continue;
      const x = c * spacing + offset + (rand() - 0.5) * 8;
      if (x > 30 && x < W - 30) state.pegs.push({ x, y: y + (rand() - 0.5) * 7, r: 5.2, hit: 0 });
    }
    row++;
  }
}
export function addMixingChamber(W, y, scale = 1) {
  state.rails.push(rail(24, y, W * 0.38, y + 118 * scale, 7, "speed"), rail(W - 24, y, W * 0.62, y + 118 * scale, 7, "bounce"));
  state.bumpers.push(bumper(W * 0.24, y + 145 * scale, 25, PAL.cyan2), bumper(W * 0.76, y + 145 * scale, 25, PAL.pink1), bumper(W * 0.5, y + 240 * scale, 30, PAL.gold1));
  state.rotors.push({ x: W * 0.5, y: y + 340 * scale, len: Math.min(158, W * 0.37), angle: 0.3, speed: 1.65, hit: 0 });
  state.rails.push(rail(W * 0.5, y + 285 * scale, W * 0.31, y + 430 * scale, 6, "normal"), rail(W * 0.5, y + 285 * scale, W * 0.69, y + 430 * scale, 6, "normal"));
}
export function addSplitLane(W, y, flip = false) {
  const leftType = flip ? "bounce" : "speed", rightType = flip ? "speed" : "bounce";
  state.rails.push(rail(W * 0.5, y, W * 0.27, y + 235, 7, leftType), rail(W * 0.5, y, W * 0.73, y + 235, 7, rightType));
  state.bumpers.push(bumper(W * 0.18, y + 122, 22, PAL.pink1), bumper(W * 0.82, y + 122, 22, PAL.green1));
}
export function addTimedGate(W, y, phase = 0, speed = 1.1) {
  state.gates.push({ y, phase, speed, gapW: clamp(W * 0.22, 116, 187), gapX: W / 2, color: PAL.orange1, pulse: 0 });
}
export function addBoosters(W, worldH) {
  const ys = [worldH * 0.58, worldH * 0.67, worldH * 0.75];
  ys.forEach((y, row) => {
    const xs = row % 2 ? [W * 0.32, W * 0.68] : [W * 0.2, W * 0.5, W * 0.8];
    xs.forEach((x, i) => state.boosters.push({ x, y: y + (i % 2) * 58, r: 19, pulse: 0, color: PAL.green1 }));
  });
}
// Length creates additional obstacle rooms, rather than stretching a few objects apart.
function buildArenaCourse(rand, W, worldH) {
  const start = startDepth() + 60, end = finishGeometry().topY - 200;
  const names = { factory: '범퍼 공장', split: '갈림길 정원', tower: '회전 타워' };
  state.sections = [{ y: start - 35, label: names[state.course] || names.factory }];
  if (state.course === 'tower') buildWheelTower(rand, W, start, end);
  else if (state.course === 'split') buildSplitGarden(rand, W, start, end);
  else buildBumperFactory(rand, W, start, end);
  state.sections.push({ y: end + 100, label: '마지막 합류 · 결승 진입' });
}

function buildWheelTower(rand, W, start, end) {
  const ballR = W < 520 ? 12 : 16;
  const clearance = ballR * 2 + 22;
  // Both side passages fit a full ball plus clearance, even on narrow phones.
  const radius = Math.min(420, W * .36, (W - 40 - 2 * clearance) / 2);
  const pitch = radius * 2 + clearance + 220;
  const left = 20 + radius + clearance, right = W - 20 - radius - clearance;
  let index = 0;
  for (let y = start + radius + 30; y + radius < end; y += pitch, index++) {
    const x = index % 2 ? right : left;
    state.wheels.push({ x, y, r: radius, angle: rand() * Math.PI * 2,
      speed: (index % 2 ? -1 : 1) * (105 + rand() * 70) / radius, hit: 0,
      color: index % 2 ? PAL.pink1 : PAL.cyan2 });
    // Re-entry ramps sit wholly between the plates. They return balls from the
    // wall passages to the next wheel, avoiding a straight bypass down the edges.
    if (y + pitch + radius < end) {
      const rampY = y + radius + clearance;
      state.rails.push(rail(20, rampY, W * .36, rampY + 110, 7, 'speed'),
        rail(W - 20, rampY, W * .64, rampY + 110, 7, 'speed'));
    }
    if (index % 4 === 0) state.sections.push({ y: y - radius - 20, label: `${index + 1}번 대형 회전판 · ${index % 2 ? '반시계' : '시계'} 회전` });
  }
}

function buildBumperFactory(rand, W, start, end) {
  const ballR = W < 520 ? 12 : 16;
  const radius = clamp(W * .055, 19, 31);
  const clearance = ballR * 2 + 20;
  const left = 20 + radius + clearance + 9, right = W - left;
  const columns = clamp(Math.floor((right - left) / (radius * 2 + clearance)) + 1, 2, 9);
  const pitch = radius * 2 + clearance + 75;
  let row = 0;
  for (let y = start + 45; y < end - radius; row++) {
    // Alternating missing slots break straight chutes and preserve open routes.
    const count = row % 2 ? columns - 1 : columns;
    const gap = (row * 2 + Math.floor(row / 4)) % count;
    const offset = row % 2 ? .5 : 0;
    const drift = Math.sin(row * .93) * Math.min(9, (right - left) / columns * .08);
    for (let c = 0; c < count; c++) {
      if (count > 1 && c === gap) continue;
      const x = left + (c + offset) * (right - left) / (columns - 1) + drift;
      const r = radius * (.86 + rand() * .14);
      state.bumpers.push({ ...bumper(x, y + (c % 2 ? 16 : 0), r,
        [PAL.cyan2, PAL.pink1, PAL.gold1, PAL.green1, PAL.violet1][(row + c) % 5]),
        restitution: .96, kick: 100 + rand() * 30 });
    }
    if (row % 6 === 0) state.sections.push({ y: y - 30, label: `범퍼 연속 구간 ${Math.floor(row / 6) + 1}` });
    if (row % 6 === 5 && y + 450 < end) {
      // Route the wall passages back into the next bumper room. The ramps live
      // in their own clear band so they cannot form narrow pockets with circles.
      const rampY = y + radius + clearance + 45;
      state.rails.push(rail(20, rampY, W * .36, rampY + 110, 7, 'speed'),
        rail(W - 20, rampY, W * .64, rampY + 110, 7, 'speed'));
      y = rampY + 110 + radius + clearance + 40;
    } else y += pitch;
  }
}

function buildSplitGarden(rand, W, start, end) {
  let room = 0;
  for (let y = start + 30; y + 680 < end; y += 760, room++) {
    // One room at a time: rails, reunion bumpers, then a moving gate.
    const flip = room % 2;
    state.rails.push(rail(W * .5, y, W * .24, y + 220, 7, flip ? 'bounce' : 'speed'),
      rail(W * .5, y, W * .76, y + 220, 7, flip ? 'speed' : 'bounce'));
    state.bumpers.push(bumper(W * .3, y + 335, 24, PAL.green1), bumper(W * .7, y + 335, 24, PAL.pink1));
    if (room % 3 === 1) addTimedGate(W, y + 490, rand() * Math.PI * 2, room % 2 ? -.95 : 1.05);
    state.sections.push({ y: y - 25, label: `갈림길 ${room + 1} · 우회 후 합류` });
  }
}
export function buildFinishFunnel(W, worldH) {
  const f = finishGeometry();
  state.rails.push(
    rail(20, f.topY, f.center - f.half, f.gateY, 8, "finish", { finish: true }),
    rail(W - 20, f.topY, f.center + f.half, f.gateY, 8, "finish", { finish: true }),
    rail(19, f.gateY + 8, f.center - f.half, f.gateY + 8, 9, "finish", { finish: true, floor: true }),
    rail(f.center + f.half, f.gateY + 8, W - 19, f.gateY + 8, 9, "finish", { finish: true, floor: true })
  );
}

// ---- 팀 모드 ----
export function prepareTeamBins(total, shuffleFn) {
  const base = Math.floor(total / state.teamCount), extras = total % state.teamCount;
  const extraBins = new Set(shuffleFn(Array.from({ length: state.teamCount }, (_, i) => i)).slice(0, extras));
  state.teamBins = Array.from({ length: state.teamCount }, (_, i) => ({ index: i, capacity: base + (extraBins.has(i) ? 1 : 0), members: [], closed: false, closedAt: 0, pulse: 0, color: TEAM_COLORS[i].css, pal: TEAM_COLORS[i] }));
  layoutTeamBins();
}
export function layoutTeamBins() {
  if (!state.teamBins.length) return;
  const left = 20, right = state.W - 20, width = (right - left) / state.teamBins.length, gateY = state.worldH - 172;
  state.teamBins.forEach((bin, i) => { bin.x1 = left + i * width; bin.x2 = left + (i + 1) * width; bin.cx = (bin.x1 + bin.x2) / 2; bin.gateY = gateY; bin.bottomY = state.worldH - 30; });
}
export function buildTeamCourse() {
  const rand = makeRand(state.courseSeed), W = state.W, H = state.worldH;
  clearCourse();
  state.sections = [{ y: 95, label: "01 WAVE START" }, { y: H * 0.23, label: "02 MIX FOREST" }, { y: H * 0.45, label: "03 TEAM SHUFFLE" }, { y: H * 0.66, label: "04 CHOICE ZONE" }, { y: H - 430, label: "05 TEAM BINS" }];
  state.rails.push(rail(20, 110, W * 0.39, 270, 8, "speed"), rail(W - 20, 110, W * 0.61, 270, 8, "bounce"));
  addPegBand(rand, W, 300, H * 0.3, 82); addSplitLane(W, H * 0.29, false); addTimedGate(W, H * 0.39, 0.4, 1.18);
  state.rotors.push({ x: W * 0.3, y: H * 0.47, len: 96, angle: 0.2, speed: 1.6, hit: 0 }, { x: W * 0.7, y: H * 0.47, len: 96, angle: 2.7, speed: -1.55, hit: 0 });
  state.bumpers.push(bumper(W * 0.2, H * 0.54, 24, PAL.cyan2), bumper(W * 0.5, H * 0.57, 30, PAL.gold1), bumper(W * 0.8, H * 0.54, 24, PAL.pink1));
  addPegBand(rand, W, H * 0.61, H * 0.73, 88); addTimedGate(W, H * 0.755, 2.2, -1.08);
  layoutTeamBins();
  const gateY = state.teamBins[0].gateY, top = gateY - 250, binW = state.teamBins[0].x2 - state.teamBins[0].x1, lowerR = clamp(binW * 0.2, 9, 21);
  const lowerIndices = [...new Set([Math.floor((state.teamBins.length - 1) * 0.25), Math.ceil((state.teamBins.length - 1) * 0.75)])];
  state.rotors.push({ x: W * 0.5, y: gateY - 520, len: Math.min(156, W * 0.38), angle: 0.7, speed: 1.72, hit: 0 });
  lowerIndices.forEach((index, i) => state.bumpers.push(bumper(state.teamBins[index].cx, gateY - 365 + (i % 2 ? 24 : -24), lowerR, i ? PAL.violet1 : PAL.green1)));
  for (let i = 1; i < state.teamBins.length; i++) {
    const x = state.teamBins[i].x1, fan = clamp((x - W / 2) * 0.18, -34, 34);
    state.rails.push(
      rail(x + fan, top, x, gateY, 6, "speed", { baseY1: top, baseY2: gateY, teamDivider: true, dividerIndex: i, retract: 0, retractDistance: 285 }),
      rail(x, gateY, x, state.worldH - 28, 7, "normal", { baseY1: gateY, baseY2: state.worldH - 28, teamDivider: true, dividerIndex: i, retract: 0, retractDistance: 215 })
    );
  }
}
export function updateTeamDividers(dt) {
  for (const r of state.rails) {
    if (!r.teamDivider) continue;
    const left = state.teamBins[r.dividerIndex - 1], right = state.teamBins[r.dividerIndex], target = left?.closed || right?.closed ? 1 : 0;
    r.retract += (target - r.retract) * Math.min(1, dt * 5.5);
    r.y1 = r.baseY1 + r.retractDistance * r.retract; r.y2 = r.baseY2 + r.retractDistance * r.retract;
  }
}

