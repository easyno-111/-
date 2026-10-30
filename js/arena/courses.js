// 코스 생성: 핀 숲, 갈림길, 타이밍 게이트, 범퍼, 회전봉, 혼합실, 결승 깔때기, 팀 통
import { clamp, makeRand } from "./util.js";
import { state } from "./state.js";
import { PAL, TEAM_COLORS } from "./palette.js";

export function raceWorldHeight() { return state.style === 'tension' ? 3500 : 2450; }
export function startColumns() { return Math.max(3, Math.min(10, Math.floor((state.W * .72) / 36))); }
export function startDepth() { return Math.max(260, Math.ceil((state.raceCount || 30) / startColumns()) * 38 + 100); }
export function teamWorldHeight() { return Math.max(state.H * 3.9, 2750); }
export function finishGeometry() {
  const half = clamp(state.W * 0.072, 40, 58);
  return { center: state.W / 2, half, gateY: state.worldH - 54, topY: state.worldH - 245 };
}

function clearCourse() {
  state.pegs = []; state.bumpers = []; state.rotors = []; state.gates = []; state.boosters = []; state.rails = []; state.sections = [];
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
function buildArenaCourse(rand, W, worldH) {
  const start = startDepth(), end = finishGeometry().topY - 150, span = end - start;
  const at = t => start + span * t;
  const names = { factory: '범퍼 공장', split: '갈림길 정원', tower: '회전 타워' };
  state.sections = [{ y: start - 30, label: names[state.course] || names.factory }, { y: at(.4), label: '합류 구간' }, { y: at(.76), label: '마지막 역전 구간' }, { y: end + 85, label: '결승 진입' }];
  addPegBand(rand, W, start, at(.14), 90);
  if (state.course === 'split') {
    [.17, .46].forEach((t, i) => addSplitLane(W, at(t), !!i));
    [.37, .69].forEach((t, i) => addTimedGate(W, at(t), i * 2, i ? -.9 : 1.1));
    state.bumpers.push(bumper(W * .24, at(.39), 24, PAL.green1), bumper(W * .76, at(.39), 24, PAL.pink1), bumper(W * .5, at(.82), 27, PAL.gold1));
  } else if (state.course === 'tower') {
    [.2, .38, .56, .74].forEach((t, i) => {
      state.rotors.push({ x: W * (i % 2 ? .64 : .36), y: at(t), len: Math.min(140, W * .34), angle: rand() * Math.PI, speed: (i % 2 ? -1 : 1) * 1.6, hit: 0 });
    });
    addTimedGate(W, at(.46), .7, 1.15); addTimedGate(W, at(.86), 2.1, -.95);
  } else {
    [.24, .44, .64].forEach((t, i) => {
      state.bumpers.push(bumper(W * .25, at(t), 24, PAL.cyan2), bumper(W * .75, at(t), 24, PAL.pink1), bumper(W * .5, at(t + .075), 27, PAL.gold1));
    });
    addSplitLane(W, at(.18)); addTimedGate(W, at(.83), .6, 1.1);
  }
  addPegBand(rand, W, at(.9), end, 85);
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

