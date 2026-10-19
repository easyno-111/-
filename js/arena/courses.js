// 코스 생성: 핀 숲, 갈림길, 타이밍 게이트, 범퍼, 회전봉, 혼합실, 결승 깔때기, 팀 통
import { clamp, makeRand } from "./util.js";
import { state } from "./state.js";
import { PAL, TEAM_COLORS } from "./palette.js";

export function raceWorldHeight() { return state.style === "tension" ? Math.max(state.H * 7.2, 5000) : Math.max(state.H * 4.6, 3200); }
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
  if (state.style === "quick") buildQuickCourse(rand, W, worldH); else buildLongCourse(rand, W, worldH);
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
export function buildQuickCourse(rand, W, worldH) {
  const f = finishGeometry();
  state.sections = [
    { y: 95, label: "01 START MIX" }, { y: worldH * 0.17, label: "02 PEG FOREST" }, { y: worldH * 0.34, label: "03 ROTOR PASS" },
    { y: worldH * 0.5, label: "04 BUMPER ZONE" }, { y: worldH * 0.66, label: "05 CHASE LANE" }, { y: worldH * 0.79, label: "06 COMEBACK MIX" }, { y: f.topY - 120, label: "07 FINAL GATE" }
  ];
  state.rails.push(rail(20, 108, W * 0.39, 250, 8, "speed"), rail(W - 20, 108, W * 0.61, 250, 8, "bounce"));
  addPegBand(rand, W, 285, worldH * 0.28, 82);
  addSplitLane(W, worldH * 0.285, false);
  state.rotors.push({ x: W * 0.5, y: worldH * 0.31, len: Math.min(148, W * 0.35), angle: 0.45, speed: 1.9, hit: 0 }, { x: W * 0.29, y: worldH * 0.39, len: 82, angle: 0, speed: 1.45, hit: 0 }, { x: W * 0.71, y: worldH * 0.39, len: 82, angle: Math.PI, speed: -1.5, hit: 0 });
  state.rails.push(rail(26, worldH * 0.36, W * 0.58, worldH * 0.43, 7, "speed"), rail(W - 26, worldH * 0.44, W * 0.42, worldH * 0.51, 7, "bounce"));
  addTimedGate(W, worldH * 0.435, 0.5, 1.15);
  state.bumpers.push(bumper(W * 0.22, worldH * 0.47, 25, PAL.cyan2), bumper(W * 0.78, worldH * 0.47, 25, PAL.pink1), bumper(W * 0.5, worldH * 0.53, 31, PAL.gold1), bumper(W * 0.3, worldH * 0.59, 23, PAL.green1), bumper(W * 0.7, worldH * 0.59, 23, PAL.violet1));
  addPegBand(rand, W, worldH * 0.61, worldH * 0.72, 86);
  state.rotors.push({ x: W * 0.34, y: worldH * 0.7, len: 88, angle: 0.2, speed: 1.6, hit: 0 }, { x: W * 0.66, y: worldH * 0.7, len: 88, angle: 2.8, speed: -1.55, hit: 0 });
  addTimedGate(W, worldH * 0.715, 2.2, -1.05);
  addMixingChamber(W, worldH * 0.75, 0.82);
  state.bumpers.push(bumper(W * 0.28, f.topY - 155, 25, PAL.cyan2), bumper(W * 0.72, f.topY - 155, 25, PAL.pink1), bumper(W * 0.5, f.topY - 72, 28, PAL.violet1));
}
export function buildLongCourse(rand, W, worldH) {
  const f = finishGeometry(), colors = [PAL.cyan2, PAL.pink1, PAL.violet1, PAL.green1, PAL.gold1];
  state.sections = [
    { y: 95, label: "01 START MIX" }, { y: worldH * 0.14, label: "02 ZIGZAG RAIL" }, { y: worldH * 0.28, label: "03 ROTOR CANYON" }, { y: worldH * 0.42, label: "04 BUMPER STORM" },
    { y: worldH * 0.56, label: "05 PEG MARATHON" }, { y: worldH * 0.7, label: "06 CHASE LANE" }, { y: worldH * 0.82, label: "07 COMEBACK MIX" }, { y: f.topY - 120, label: "08 FINAL GATE" }
  ];
  state.rails.push(rail(20, 110, W * 0.39, 285, 8, "speed"), rail(W - 20, 110, W * 0.61, 285, 8, "bounce"));
  addPegBand(rand, W, 320, worldH * 0.18, 86);
  addSplitLane(W, worldH * 0.175, false);
  for (let y = worldH * 0.22, side = 0; y < worldH * 0.35; y += 330, side++) {
    const left = side % 2 === 0, type = left ? "speed" : "bounce";
    state.rails.push(rail(left ? 26 : W - 26, y, left ? W * 0.62 : W * 0.38, y + 112, 7, type));
    state.rotors.push({ x: left ? W * 0.68 : W * 0.32, y: y + 188, len: 88 + rand() * 34, angle: rand() * Math.PI, speed: (left ? 1 : -1) * (1.25 + rand() * 0.65), hit: 0 });
  }
  addTimedGate(W, worldH * 0.355, 0.9, 1.05);
  for (let y = worldH * 0.37; y < worldH * 0.53; y += 230) for (let i = 0; i < 3; i++) state.bumpers.push(bumper(W * (i + 1) / 4 + (rand() - 0.5) * W * 0.08, y + (i % 2) * 76, 22 + rand() * 7, colors[(i + Math.floor(y / 200)) % colors.length]));
  addSplitLane(W, worldH * 0.515, true);
  addPegBand(rand, W, worldH * 0.56, worldH * 0.68, 82);
  for (let y = worldH * 0.69, side = 0; y < worldH * 0.78; y += 255, side++) {
    state.rotors.push({ x: side % 2 ? W * 0.66 : W * 0.34, y, len: 90 + rand() * 28, angle: rand() * Math.PI * 2, speed: (side % 2 ? -1 : 1) * (1.4 + rand() * 0.45), hit: 0 });
    state.bumpers.push(bumper(side % 2 ? W * 0.3 : W * 0.7, y + 112, 25, colors[side % colors.length]));
  }
  addTimedGate(W, worldH * 0.69, 2.4, -1.12);
  addSplitLane(W, worldH * 0.755, false);
  addMixingChamber(W, worldH * 0.8, 1.05);
  addTimedGate(W, worldH * 0.875, 1.6, 0.92);
  addPegBand(rand, W, worldH * 0.89, f.topY - 230, 92);
  state.bumpers.push(bumper(W * 0.27, f.topY - 160, 27, PAL.cyan2), bumper(W * 0.73, f.topY - 160, 27, PAL.pink1), bumper(W * 0.5, f.topY - 66, 31, PAL.violet1));
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
