// 도트 렌더러: 저해상도 월드 버퍼 + 원본 해상도 HUD(네오둥근모) 2층 구조
import { clamp, makeRand, lerp } from "./util.js";
import { state, MODE_INFO, displayName, shortName } from "./state.js";
import { pix, fx } from "./core.js";
import { PAL, RAIL_COLORS, shades, BALL_PALETTES } from "./palette.js";
import { finishGeometry, buildCourse, raceWorldHeight, teamWorldHeight, prepareTeamBins, layoutTeamBins, buildTeamCourse } from "./courses.js";
import { secureShuffle } from "./util.js";

const FONT = "NeoDunggeunmo, 'Press Start 2P', monospace";
const els = { canvas: null, hud: null, stage: null };
let hud = null;
let bgCache = null, bgKey = "";
const STARS = (() => { const r = makeRand(777); return Array.from({ length: 90 }, (_, i) => ({ x: r(), y: r(), layer: i % 3 })); })();

export function initRenderer(canvas, hudCanvas, stage) {
  els.canvas = canvas; els.hud = hudCanvas; els.stage = stage;
  hud = hudCanvas.getContext("2d");
}
export function cinematicAnchorY() { return state.H * 0.56; }

// ---------- 좌표 변환 ----------
const S = () => state.scale;
const unit = () => state.zoom / state.scale;
function mapX(x) { return Math.round(((x - state.zoomFocusX) * state.zoom + state.zoomFocusX) / state.scale) + fx.shakeX; }
function mapY(y) { const a = cinematicAnchorY(); return Math.round(((y - state.cameraY - a) * state.zoom + a) / state.scale) + fx.shakeY; }
function hudX(x) { return (x - state.zoomFocusX) * state.zoom + state.zoomFocusX + fx.shakeX * state.scale; }
function hudY(y) { const a = cinematicAnchorY(); return (y - state.cameraY - a) * state.zoom + a + fx.shakeY * state.scale; }
const mapXY = (x, y) => [mapX(x), mapY(y)];
function visibleRange() { const a = cinematicAnchorY(), top = state.cameraY + a - a / state.zoom; return [top - 80, top + state.H / state.zoom + 80]; }

// ---------- 캔버스 크기 ----------
export function resizeCanvas() {
  const rect = els.stage.getBoundingClientRect();
  const oldW = state.W || rect.width, oldH = state.H || rect.height, oldWorld = state.worldH || rect.height;
  state.W = Math.max(300, Math.round(rect.width)); state.H = Math.max(400, Math.round(rect.height));
  state.dpr = Math.min(devicePixelRatio || 1, 2);
  state.scale = state.W >= 760 ? 3 : 2;
  pix.resize(Math.floor(state.W / state.scale), Math.floor(state.H / state.scale));
  els.canvas.width = pix.w * state.scale; els.canvas.height = pix.h * state.scale;
  els.canvas.style.width = `${pix.w * state.scale}px`; els.canvas.style.height = `${pix.h * state.scale}px`;
  els.hud.width = Math.round(state.W * state.dpr); els.hud.height = Math.round(state.H * state.dpr);
  els.hud.style.width = `${state.W}px`; els.hud.style.height = `${state.H}px`;
  hud.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  bgCache = null;
  if (!state.zoomFocusX) state.zoomFocusX = state.W / 2;
  if (state.running && state.engine === "race" && state.balls.length) {
    const nextWorld = raceWorldHeight(), sx = state.W / oldW, sy = nextWorld / oldWorld;
    state.worldH = nextWorld; state.balls.forEach((b) => { b.x *= sx; b.y *= sy; b.r = state.W < 520 ? 12 : 16; }); state.cameraY *= sy; buildCourse();
  } else if (state.running && state.engine === "teams") {
    const nextWorld = teamWorldHeight(), sx = state.W / oldW, sy = nextWorld / oldWorld;
    state.worldH = nextWorld; state.balls.forEach((b) => { b.x *= sx; b.y *= sy; b.motionX *= sx; b.motionY *= sy; b.lastSafeX *= sx; b.lastSafeY *= sy; }); state.cameraY *= sy; layoutTeamBins(); buildTeamCourse();
  } else if (state.running && state.engine === "lotto" && state.lottoBalls.length) {
    const sx = state.W / oldW, sy = state.H / oldH; state.worldH = state.H;
    state.lottoBalls.forEach((b) => { b.x *= sx; b.y *= sy; b.captureFromX *= sx; b.captureFromY *= sy; b.r = clamp(b.r * Math.min(sx, sy), 7, 12); });
  } else if (state.mode === "teams") { state.worldH = teamWorldHeight(); prepareTeamBins(Math.max(state.participants.length, state.teamCount), secureShuffle); buildTeamCourse(); }
  else { state.worldH = raceWorldHeight(); buildCourse(); }
}

// ---------- HUD 텍스트 ----------
function text(str, x, y, o = {}) {
  const size = o.size || 16;
  hud.save();
  hud.font = `${size}px ${FONT}`; hud.textAlign = o.align || "center"; hud.textBaseline = o.baseline || "middle";
  if (o.alpha != null) hud.globalAlpha = o.alpha;
  if (o.outline !== false) { hud.lineJoin = "round"; hud.lineWidth = o.outlineWidth || Math.max(2, size / 5); hud.strokeStyle = o.outlineColor || PAL.ink; hud.strokeText(str, x, y); }
  hud.fillStyle = o.color || "#ffffff"; hud.fillText(str, x, y);
  hud.restore();
}
function textWidth(str, size) { hud.font = `${size}px ${FONT}`; return hud.measureText(str).width; }
// 도트풍 패널 (HUD): 바깥 어두운 테두리 + 안쪽 밝은 선
function panel(x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  hud.save();
  if (o.alpha != null) hud.globalAlpha = o.alpha;
  hud.fillStyle = o.border || PAL.ink; hud.fillRect(x - 2, y - 2, w + 4, h + 4);
  hud.fillStyle = o.fill || "rgba(11,16,32,.92)"; hud.fillRect(x, y, w, h);
  hud.fillStyle = o.edge || PAL.steel1; hud.fillRect(x, y, w, 2); hud.fillRect(x, y, 2, h);
  hud.fillStyle = o.edgeDark || PAL.bg0; hud.fillRect(x, y + h - 2, w, 2); hud.fillRect(x + w - 2, y, 2, h);
  hud.restore();
}

// ---------- 배경 ----------
function drawBackground(camera, tone = "race") {
  const key = `${pix.w}x${pix.h}:${tone}`;
  if (!bgCache || bgKey !== key) {
    pix.vGradient(0, 0, pix.w, pix.h, tone === "lotto" ? [{ at: 0, hex: PAL.bg2 }, { at: 0.55, hex: PAL.bg1 }, { at: 1, hex: PAL.bg0 }] : [{ at: 0, hex: PAL.bg1 }, { at: 0.5, hex: PAL.bg0 }, { at: 1, hex: PAL.bg0 }]);
    bgCache = pix.snapshot(); bgKey = key;
  } else pix.copyFrom(bgCache);
  const cam = camera / state.scale;
  for (const s of STARS) {
    const par = [0.15, 0.3, 0.5][s.layer];
    const sy = (((s.y * pix.h * 2 - cam * par) % pix.h) + pix.h) % pix.h, sx = Math.round(s.x * pix.w);
    pix.px(sx, sy, [PAL.star0, PAL.star1, PAL.star2][s.layer]);
    if (s.layer === 2 && (sx + (sy | 0)) % 7 === 0) { pix.px(sx + 1, sy, PAL.star1); pix.px(sx - 1, sy, PAL.star1); pix.px(sx, sy + 1, PAL.star1); pix.px(sx, sy - 1, PAL.star1); }
  }
  if (tone === "race") {
    const grid = Math.max(8, Math.round(32 / state.scale)), off = ((-(cam % grid)) + grid) % grid;
    for (let y = off; y < pix.h; y += grid) for (let x = (y / grid | 0) % 2; x < pix.w; x += 3) pix.px(x, y, PAL.bg2);
  }
}

// ---------- 코스 ----------
function thickLine(x1, y1, x2, y2, w, colors) {
  const t = Math.max(2, Math.round(w * unit()));
  pix.line(x1, y1, x2, y2, colors.edge, t + 2);
  pix.line(x1, y1, x2, y2, colors.core, t);
  pix.line(x1, y1 - ((t >> 1) + 0), x2, y2 - ((t >> 1) + 0), colors.glow, 1);
}
function drawCourse() {
  const [top, bottom] = visibleRange(), u = unit();
  // 벽
  const wl = mapX(18), wr = mapX(state.W - 18), wy0 = mapY(25), wy1 = mapY(state.worldH - 32);
  pix.line(wl, wy0, wl, wy1, PAL.cyan0, 3); pix.line(wl + 1, wy0, wl + 1, wy1, PAL.cyan1, 1);
  pix.line(wr, wy0, wr, wy1, PAL.cyan0, 3); pix.line(wr - 1, wy0, wr - 1, wy1, PAL.cyan1, 1);
  for (const section of state.sections || []) {
    if (section.y < top || section.y > bottom) continue;
    const y = mapY(section.y) + 4; pix.dashedLine(mapX(30), y, mapX(state.W - 30), y, PAL.steel0, 3, 5);
  }
  for (const r of state.rails) {
    const cy = (r.y1 + r.y2) / 2; if (cy < top - 200 || cy > bottom + 200) continue;
    thickLine(mapX(r.x1), mapY(r.y1), mapX(r.x2), mapY(r.y2), r.w, RAIL_COLORS[r.finish ? "finish" : r.railType || "normal"]);
  }
  const pr = Math.max(1, Math.round(5.2 * u));
  for (const p of state.pegs) {
    if (p.y < top || p.y > bottom) continue;
    const x = mapX(p.x), y = mapY(p.y);
    if (pr <= 2) {
      // 작은 스터드: 외곽선 5x5 + 본체 3x3 + 하이라이트
      pix.rect(x - 2, y - 2, 5, 5, PAL.ink);
      pix.rect(x - 1, y - 1, 3, 3, p.hit > 0 ? PAL.cyan3 : PAL.steel2);
      pix.px(x - 1, y - 1, p.hit > 0 ? PAL.white : PAL.steel3);
      if (p.hit > 0.12) pix.ring(x, y, 4, PAL.cyan2);
    } else if (p.hit > 0) { pix.disc(x, y, pr + 1, PAL.cyan3); pix.ring(x, y, pr + 3, PAL.cyan2); }
    else { pix.disc(x, y, pr + 1, PAL.ink); pix.disc(x, y, pr, PAL.steel2); pix.px(x - 1, y - 1, PAL.steel3); }
  }
  for (const bp of state.bumpers) {
    if (bp.y < top - 60 || bp.y > bottom + 60) continue;
    const [light, base, dark] = shades(bp.color), rr = Math.round(bp.r * u * (1 + bp.pulse * 0.22)), x = mapX(bp.x), y = mapY(bp.y);
    if (bp.pulse > 0.05) pix.ditherDisc(x, y, rr + 3 + Math.round(bp.pulse * 4), light, Math.round(bp.pulse * 9));
    pix.disc(x, y, rr + 1, PAL.ink); pix.disc(x, y, rr, dark); pix.disc(x - 1, y - 1, Math.max(1, rr - 2), base);
    pix.ring(x, y, Math.max(1, rr - 1), light); pix.disc(x - Math.round(rr * 0.3), y - Math.round(rr * 0.3), Math.max(1, Math.round(rr * 0.25)), PAL.white);
  }
  for (const g of state.gates) {
    if (g.y < top - 40 || g.y > bottom + 40) continue;
    const left = g.gapX - g.gapW / 2, right = g.gapX + g.gapW / 2, y = mapY(g.y), c = RAIL_COLORS.gate, t = Math.max(2, Math.round(9 * u));
    pix.line(mapX(20), y, mapX(left), y, c.edge, t + 2); pix.line(mapX(20), y, mapX(left), y, g.pulse > 0.1 ? c.glow : c.core, t);
    pix.line(mapX(right), y, mapX(state.W - 20), y, c.edge, t + 2); pix.line(mapX(right), y, mapX(state.W - 20), y, g.pulse > 0.1 ? c.glow : c.core, t);
    // 줄무늬 (위험 표시)
    for (let x = mapX(20); x < mapX(left) - 2; x += 6) pix.rect(x, y - 1, 2, 2, PAL.ink);
    for (let x = mapX(right) + 2; x < mapX(state.W - 20) - 2; x += 6) pix.rect(x, y - 1, 2, 2, PAL.ink);
    const ax = mapX(left) + 1, bx = mapX(right) - 1;
    pix.rect(ax - 1, y - t - 2, 2, t * 2 + 4, c.glow); pix.rect(bx - 1, y - t - 2, 2, t * 2 + 4, c.glow);
  }
  if (state.comeback === "boost") for (const b of state.boosters) {
    if (b.y < top - 45 || b.y > bottom + 45) continue;
    const rr = Math.round(b.r * u * (1 + b.pulse * 0.25)), x = mapX(b.x), y = mapY(b.y);
    pix.disc(x, y, rr + 1, PAL.ink); pix.disc(x, y, rr, PAL.green0); pix.disc(x, y - 1, Math.max(1, rr - 2), PAL.green1); pix.ring(x, y, Math.max(1, rr - 1), PAL.green2);
    for (let i = 0; i < 3; i++) { pix.hline(x - 2 + i, x + 2 - i, y - 1 + i, PAL.ink); }
  }
  for (const r of state.rotors) {
    if (r.y < top - 80 || r.y > bottom + 80) continue;
    const len = r.len * u, cx = mapX(r.x), cy = mapY(r.y), t = Math.max(2, Math.round(10 * u));
    const cos = Math.cos(r.angle), sin = Math.sin(r.angle);
    const seg = (a, b, hex) => pix.line(Math.round(cx + cos * len * a), Math.round(cy + sin * len * a), Math.round(cx + cos * len * b), Math.round(cy + sin * len * b), hex, t);
    seg(-0.5, 0.5, PAL.ink); const tt = Math.max(1, t - 2);
    const seg2 = (a, b, hex) => pix.line(Math.round(cx + cos * len * a), Math.round(cy + sin * len * a), Math.round(cx + cos * len * b), Math.round(cy + sin * len * b), hex, tt);
    seg2(-0.5, -0.17, r.hit > 0 ? PAL.cyan3 : PAL.cyan2); seg2(-0.17, 0.17, PAL.steel3); seg2(0.17, 0.5, r.hit > 0 ? PAL.pink2 : PAL.pink1);
    pix.disc(cx, cy, Math.max(2, t), PAL.ink); pix.disc(cx, cy, Math.max(1, t - 1), PAL.violet1); pix.px(cx - 1, cy - 1, PAL.violet2);
  }
  if (state.engine === "teams" || (!state.running && state.mode === "teams")) drawTeamBins(); else drawFinish();
}
function drawFinish() {
  const f = finishGeometry(), [top, bottom] = visibleRange();
  if (f.topY > bottom + 100) return;
  const u = unit(), x0 = mapX(20), x1 = mapX(state.W - 20), yTop = mapY(f.topY), yGate = mapY(f.gateY);
  for (let y = yTop; y < yGate; y += 1) {
    const t = (y - yTop) / Math.max(1, yGate - yTop), lx = Math.round(x0 + (mapX(f.center - f.half) - x0) * t), rx = Math.round(x1 + (mapX(f.center + f.half) - x1) * t);
    if ((y & 1) === 0) pix.ditherRect(lx, y, rx - lx, 1, PAL.gold0, Math.round(t * 7));
  }
  const cx = mapX(f.center), cy = mapY(f.gateY + 15), hw = Math.round((f.half + 7) * u), hh = Math.max(3, Math.round(19 * u));
  for (let dy = -hh; dy <= hh; dy++) { const w = Math.round(hw * Math.sqrt(1 - (dy / hh) ** 2)); pix.hline(cx - w, cx + w, cy + dy, PAL.ink); }
  for (let dy = -hh + 1; dy <= hh - 1; dy++) { const w = Math.round((hw - 2) * Math.sqrt(1 - (dy / (hh - 1)) ** 2)); if (Math.abs(dy) === hh - 1 || Math.abs(w) === hw - 2) pix.hline(cx - w, cx + w, cy + dy, PAL.gold1); }
  const blink = Math.floor(performance.now() / 260) % 2 === 0;
  pix.rect(cx - hw - 3, cy - 1, 3, 2, blink ? PAL.gold2 : PAL.gold0); pix.rect(cx + hw + 1, cy - 1, 3, 2, blink ? PAL.gold0 : PAL.gold2);
}
function drawTeamBins() {
  const [top, bottom] = visibleRange();
  for (const bin of state.teamBins) {
    if (bin.gateY > bottom + 200) continue;
    const x1 = mapX(bin.x1 + 2), x2 = mapX(bin.x2 - 2), y1 = mapY(bin.gateY + 3), y2 = mapY(bin.bottomY), w = x2 - x1, h = y2 - y1;
    const fill = bin.capacity ? bin.members.length / bin.capacity : 1, p = bin.pal;
    pix.rect(x1, y1, w, h, PAL.bg1);
    const fh = Math.round((h - 4) * fill);
    if (fh > 0) { pix.ditherRect(x1 + 2, y2 - 2 - fh, w - 4, fh, p.dark, 10); pix.hline(x1 + 2, x2 - 3, y2 - 2 - fh, p.base); }
    pix.box(x1, y1, w, h, bin.closed ? PAL.gold1 : p.base); pix.box(x1 - 1, y1 - 1, w + 2, h + 2, PAL.ink);
    if (bin.pulse > 0.1) pix.box(x1 + 1, y1 + 1, w - 2, h - 2, p.light);
    if (bin.closed) { const close = clamp((performance.now() - bin.closedAt) / 260, 0, 1); pix.rect(x1, y1 - 2, Math.round(w * close), 3, PAL.gold2); }
  }
}

// ---------- 공 ----------
function drawBallSprite(b, x, y, rr, now) {
  const speed = Math.hypot(b.vx || 0, b.vy || 0);
  if (speed > 250 && b.trail?.length > 1) {
    for (let i = 1; i < Math.min(4, b.trail.length); i++) { const [tx, ty] = mapXY(b.trail[i].x, b.trail[i].y); pix.ditherDisc(tx, ty, Math.max(1, rr - i), b.color[2], 8 - i * 2); }
  }
  if (b.chaseGlow > 0.05) { const [, , dark] = [null, null, PAL.cyan1]; for (let i = 1; i <= 2; i++) pix.hline(x - rr + i, x + rr - i, y - rr - 2 - i * 2, dark); }
  if (b.rescueGlow > 0.02 && Math.floor(now / 120) % 2 === 0) pix.ring(x, y, rr + 3, PAL.teal2);
  if (b.glow > 0.05) pix.ring(x, y, rr + 3, PAL.gold2);
  if (state.cameraMode === "track" && state.trackedNum === b.num) { pix.ring(x, y, rr + 4 + (Math.floor(now / 150) % 2), PAL.green2); }
  pix.ball(x, y, rr, b.color);
}
function drawBallLabel(b, x, y, rr) {
  const d = rr * 2 * state.scale, digits = String(b.num).length;
  const size = d >= 44 ? (digits > 2 ? 16 : 20) : d >= 30 ? (digits > 2 ? 12 : 16) : d >= 22 ? 12 : 10;
  text(String(b.num), x, y + 0.5, { size, color: "#ffffff", outlineWidth: 2 });
}

// ---------- 레이스/팀 장면 ----------
export function drawScene() {
  const now = performance.now();
  drawBackground(state.cameraY, "race");
  drawCourse();
  const u = unit(), replay = !!state.replayState, labels = [];
  for (const b of state.balls) {
    const active = replay ? (b.rActive ?? b.active) : b.active;
    if (!active && !b.finished) continue;
    const wx = replay ? (b.rx ?? b.x) : b.x, wy = replay ? (b.ry ?? b.y) : b.y;
    if (wy < state.cameraY - 60 || wy > state.cameraY + state.H / state.zoom + 60 + cinematicAnchorY()) continue;
    const x = mapX(wx), y = mapY(wy), rr = Math.max(2, Math.round(b.r * u));
    if (x < -20 || y < -20 || x > pix.w + 20 || y > pix.h + 20) continue;
    drawBallSprite(b, x, y, rr, now);
    labels.push([b, x * state.scale + state.scale / 2, y * state.scale + state.scale / 2, rr]);
  }
  fx.drawWorld(pix, mapXY, u);
  fx.post(pix);
  pix.blitTo(els.canvas.getContext("2d"), 0, 0, state.scale);
  // HUD
  hud.clearRect(0, 0, state.W, state.H);
  for (const [b, x, y, rr] of labels) drawBallLabel(b, x, y, rr);
  drawSectionLabels();
  drawLetterbox();
  if (replay) { drawReplayTag(now); drawFloaters(); return; }
  if (state.engine === "teams") drawTeamHud(); else drawRaceHud();
  drawMinimap();
  drawLeaderBanner(now);
  drawTrackingIndicator();
  drawWinnerEffect(now);
  drawTeamAssignEffect(now);
  drawFloaters();
}
function drawSectionLabels() {
  const [top, bottom] = visibleRange();
  for (const s of state.sections || []) { if (s.y < top || s.y > bottom) continue; text(s.label, 30, hudY(s.y) - 8, { size: 12, color: PAL.steel1, align: "left", outline: false, alpha: 0.9 }); }
}
function drawLetterbox() {
  const z = clamp((state.zoom - 1.05) / 0.6, 0, 1); if (z <= 0) return;
  const h = Math.round(z * Math.min(48, state.H * 0.08));
  hud.fillStyle = PAL.ink; hud.fillRect(0, 0, state.W, h); hud.fillRect(0, state.H - h, state.W, h);
}
function drawRaceHud() {
  const ranked = state.balls.filter((b) => b.active).sort((a, b) => b.y - a.y).slice(0, 5), boxW = state.W < 520 ? 118 : 150, rowH = 20, boxH = 30 + ranked.length * rowH;
  panel(12, 56, boxW, boxH);
  text("LIVE TOP 5", 22, 72, { size: 12, color: PAL.cyan2, align: "left", outline: false });
  ranked.forEach((b, i) => {
    const y = 94 + i * rowH;
    text(`${i + 1}.${b.num}`, 22, y, { size: 12, color: i === 0 ? PAL.gold2 : "#e9f5ff", align: "left", outline: false });
    const progress = clamp(b.y / state.worldH, 0, 1);
    hud.fillStyle = "rgba(255,255,255,.1)"; hud.fillRect(12 + boxW - 42, y - 2, 32, 4); hud.fillStyle = i === 0 ? PAL.gold1 : PAL.cyan2; hud.fillRect(12 + boxW - 42, y - 2, Math.round(32 * progress), 4);
  });
  if (state.chaseWind > 0.04) {
    hud.save(); hud.globalAlpha = state.chaseWind;
    const label = state.comeback === "boost" ? "↯ 강화 추격 발동" : "↯ 추격 바람 발동", w = textWidth(label, 12) + 24;
    panel(state.W / 2 - w / 2, 58, w, 24, { fill: "rgba(13,92,122,.85)", edge: PAL.cyan2 });
    text(label, state.W / 2, 70, { size: 12, color: PAL.cyan3, outline: false }); hud.restore();
  }
  if (state.photoFinish) {
    const blink = Math.floor(performance.now() / 140) % 2 === 0;
    text("PHOTO FINISH!", state.W / 2, state.H * 0.2, { size: state.W < 520 ? 24 : 32, color: blink ? PAL.gold2 : "#ffffff", outlineWidth: 5 });
  }
  if (state.cinematicCandidate && state.cinematicText) {
    const deep = state.zoomTarget > 1.4;
    text(state.cinematicText, state.W / 2, state.H - 34, { size: deep ? 20 : 14, color: deep ? PAL.gold2 : PAL.cyan3, outlineWidth: deep ? 4 : 3 });
  }
}
function drawTeamHud() {
  const assigned = state.results.length, total = state.participants.length, boxW = state.W < 520 ? 160 : 196;
  panel(12, 56, boxW, 80, { edge: PAL.green1 });
  text(`TEAM WAVE ${state.teamWave}`, 22, 72, { size: 12, color: PAL.green2, align: "left", outline: false });
  text(`${assigned} / ${total}명 배치`, 22, 96, { size: 16, color: "#fff", align: "left", outline: false });
  hud.fillStyle = "rgba(255,255,255,.1)"; hud.fillRect(22, 108, boxW - 20, 6); hud.fillStyle = PAL.green1; hud.fillRect(22, 108, Math.round((boxW - 20) * (total ? assigned / total : 0)), 6);
  text(`구조 ${state.rescueCount}회 · 대기 ${state.teamQueue.length}명`, 22, 126, { size: 10, color: PAL.steel2, align: "left", outline: false });
  if (state.cinematicText) text(state.cinematicText, state.W / 2, state.H - 34, { size: 14, color: PAL.cyan3 });
  // 팀 라벨
  for (const bin of state.teamBins) {
    const y = hudY(bin.gateY); if (y < -40 || y > state.H + 40) continue;
    const x = hudX(bin.cx);
    text(`${bin.index + 1}조`, x, y + 26, { size: 16, color: "#fff" });
    text(`${bin.members.length}/${bin.capacity}`, x, y + 46, { size: 12, color: bin.closed ? PAL.gold2 : PAL.steel3 });
    if (bin.closed) text("FULL", x, y - 12, { size: 10, color: PAL.gold2 });
  }
}
function drawMinimap() {
  if (!state.worldH || state.engine === "lotto") return;
  const w = 58, h = Math.min(240, state.H - 120), x = state.W - w - 12, y = 58, sy = h / state.worldH;
  panel(x, y, w, h, { alpha: 0.9 });
  hud.fillStyle = "rgba(94,212,255,.08)"; hud.fillRect(x + 4, y + 4, w - 8, h - 8);
  for (const b of state.balls) { if (!b.active) continue; hud.fillStyle = "#fff"; hud.fillRect(Math.round(x + 4 + (b.x / state.W) * (w - 8)) - 1, Math.round(y + 4 + b.y * sy) - 1, 2, 2); }
  const viewTop = clamp(state.cameraY, 0, state.worldH), viewBottom = clamp(state.cameraY + state.H / state.zoom, 0, state.worldH);
  hud.strokeStyle = PAL.cyan2; hud.lineWidth = 2; hud.strokeRect(x + 3, Math.round(y + 4 + viewTop * sy), w - 6, Math.max(5, (viewBottom - viewTop) * sy));
  text("MAP", x + w / 2, y - 8, { size: 10, color: PAL.cyan3, outline: false });
}
function drawLeaderBanner(now) {
  if (!state.running || (state.engine !== "race" && state.engine !== "teams") || state.currentLeaderNum == null || state.replayState) return;
  const age = (now - state.leaderChangedAt) / 1000, fresh = age < 1.05, p = clamp(age / 0.32, 0, 1), pop = fresh ? 0.72 + p * 0.28 + Math.sin(p * Math.PI) * 0.1 : 1;
  const w = clamp(state.W * 0.42, 215, 360), h = state.W < 520 ? 50 : 58, y = state.W < 520 ? 150 : 72;
  hud.save(); hud.translate(state.W / 2, y); hud.scale(pop, pop);
  panel(-w / 2, -h / 2, w, h, { fill: fresh ? "rgba(60,44,8,.95)" : "rgba(11,16,32,.9)", edge: fresh ? PAL.gold2 : PAL.gold0, border: fresh ? PAL.gold1 : PAL.ink });
  text(fresh && state.previousLeaderNum != null ? "⚡ 선두 변경" : "LIVE LEADER", 0, -h * 0.22, { size: 12, color: PAL.gold2, outline: false });
  text(`현재 1등 · ${displayName(state.currentLeaderNum)}`, 0, h * 0.18, { size: state.W < 520 ? 16 : 20, color: "#fff", outline: false });
  hud.restore();
}
function drawTrackingIndicator() {
  if (state.cameraMode !== "track" || state.trackedNum == null) return;
  const b = state.balls.find((v) => v.active && v.num === state.trackedNum); if (!b) return;
  const sx = hudX(b.x), sy = hudY(b.y);
  if (sx > 18 && sx < state.W - 18 && sy > 45 && sy < state.H - 18) return;
  const x = clamp(sx, 38, state.W - 38), y = clamp(sy, 58, state.H - 38), a = Math.atan2(sy - y, sx - x);
  hud.save(); hud.translate(x, y); hud.rotate(a); hud.fillStyle = PAL.green2; hud.beginPath(); hud.moveTo(14, 0); hud.lineTo(-7, -7); hud.lineTo(-7, 7); hud.closePath(); hud.fill(); hud.restore();
  text(`${b.num}번`, x, y - 14, { size: 12, color: PAL.green2 });
}
function drawTeamAssignEffect(now) {
  const f = state.teamFx; if (!f || state.engine !== "teams") return;
  const t = (now - f.start) / 1000; if (t > 1.05) { state.teamFx = null; return; }
  const fade = clamp(1 - t, 0, 1), pop = 0.6 + clamp(t / 0.25, 0, 1) * 0.4;
  hud.save(); hud.globalAlpha = fade; hud.translate(clamp(hudX(f.x), 90, state.W - 90), state.H * 0.68); hud.scale(pop, pop);
  panel(-90, -28, 180, 56, { edge: PAL.green1 });
  text(`${displayName(f.num)} → ${f.team}조`, 0, 1, { size: 16, color: "#fff", outline: false });
  hud.restore();
}
export function drawWinnerEffect(now) {
  const f = state.winnerFx; if (!f) return;
  const t = (now - f.start) / 1000; if (t < 0) return;
  const life = f.life || 1.8;
  if (t > life) { state.winnerFx = null; return; }
  const cx = clamp(f.lottoX ?? hudX(f.x), state.W * 0.22, state.W * 0.78), cy = state.engine === "lotto" ? state.H * 0.42 : cinematicAnchorY();
  const fade = clamp(1 - (t - (life - 0.35)) / 0.35, 0, 1), p = clamp((t - 0.05) / 0.32, 0, 1), pop = 0.3 + p * 0.7 + Math.sin(p * Math.PI) * 0.2;
  const badgeW = clamp(state.W * 0.42, 220, 340), badgeH = state.W < 520 ? 96 : 118, name = shortName(f.num);
  hud.save(); hud.globalAlpha = fade; hud.translate(cx, cy - clamp(state.H * 0.2, 80, 130)); hud.scale(pop, pop);
  // 방사선
  hud.save(); hud.rotate(t * 0.9); hud.globalAlpha = fade * 0.5;
  for (let i = 0; i < 12; i++) { hud.rotate(Math.PI / 6); hud.fillStyle = i % 2 ? PAL.gold1 : PAL.gold2; hud.fillRect(badgeW * 0.3, -3, badgeW * 0.42 * clamp(t / 0.4, 0, 1), 6); }
  hud.restore();
  panel(-badgeW / 2, -badgeH / 2, badgeW, badgeH, { fill: "rgba(5,7,15,.94)", edge: PAL.gold2, border: PAL.gold0 });
  text(state.mode === "rank" ? `${f.place}등 당첨!` : `당첨 ${f.place}번째!`, 0, -badgeH * 0.3, { size: 16, color: PAL.gold2, outline: false });
  text(`${f.num}번`, 0, name ? badgeH * 0.02 : badgeH * 0.1, { size: state.W < 520 ? 36 : 48, color: "#fff", outlineColor: PAL.gold0, outlineWidth: 6 });
  if (name) text(name, 0, badgeH * 0.33, { size: 16, color: PAL.gold3, outline: false });
  hud.restore();
}
function drawFloaters() { for (const f of fx.floaters) text(f.text, hudX(f.x), hudY(f.y), { size: 12, color: f.color, alpha: clamp(f.life / f.max, 0, 1) }); }
function drawReplayTag(now) {
  if (Math.floor(now / 400) % 2 === 0) text("◀ REPLAY", 24, 76, { size: 16, color: PAL.red2, align: "left" });
  text("결승 순간 다시 보기 · 0.3배속", state.W / 2, state.H - 34, { size: 14, color: PAL.steel3 });
}

// ---------- 대기 화면 ----------
export function drawIdle() {
  if ((state.mode === "quick" || state.mode === "rank") && state.basis === "fair") { drawLottoIdle(); return; }
  if (state.mode === "order") { drawOrderIdle(); return; }
  if (!state.W || !state.H) resizeCanvas();
  state.zoom = 1; state.zoomFocusX = state.W / 2; state.cameraY = 0; fx.shakeX = 0; fx.shakeY = 0;
  drawBackground(0, "race"); drawCourse();
  // 출발선 샘플 공
  const nums = (state.participants.length ? state.participants : Array.from({ length: 30 }, (_, i) => i + 1)).slice(0, 48);
  const cols = Math.min(10, Math.max(5, Math.floor(state.W / 58))), left = state.W * 0.14, right = state.W * 0.86, gap = (right - left) / Math.max(1, cols - 1);
  const labels = [];
  nums.forEach((num, i) => {
    const x = left + (i % cols) * gap, y = 52 + Math.floor(i / cols) * 34, r = state.W < 520 ? 12 : 16;
    if (state.mode === "teams" && i >= 36) return;
    const sx = mapX(x), sy = mapY(y), rr = Math.max(2, Math.round(r * unit()));
    pix.ball(sx, sy, rr, BALL_PALETTES[i % BALL_PALETTES.length]);
    labels.push([{ num }, sx * state.scale + state.scale / 2, sy * state.scale + state.scale / 2, rr]);
  });
  pix.darken(0.25);
  pix.blitTo(els.canvas.getContext("2d"), 0, 0, state.scale);
  hud.clearRect(0, 0, state.W, state.H);
  for (const [b, x, y, rr] of labels) drawBallLabel(b, x, y, rr);
  drawSectionLabels();
  text(MODE_INFO[state.mode].name, state.W / 2, state.H * 0.44, { size: clamp(Math.round(state.W * 0.04), 24, 40), color: "#fff", outlineWidth: 5 });
  const sub = state.mode === "teams" ? "참가 번호를 팀별로 고르게 나눕니다" : state.mode === "order" ? "모든 번호의 발표 순서를 한 번에 정합니다" : "번호 공이 출발할 준비를 하고 있습니다";
  text(sub, state.W / 2, state.H * 0.44 + 34, { size: 14, color: PAL.steel3 });
  text("SPACE 키 또는 시작 버튼", state.W / 2, state.H * 0.44 + 58, { size: 12, color: PAL.steel1, outline: false });
}

// ---------- 로또 ----------
export function lottoGeometry() {
  const narrow = state.W < 560;
  const R = Math.min(state.W * (narrow ? 0.33 : 0.3), state.H * 0.3), cx = state.W * (narrow ? 0.4 : 0.42), cy = Math.min(state.H * 0.42, R + 80);
  const slotGap = Math.min(102, state.W / (Math.max(3, state.drawCount) + 1));
  const bendX = Math.min(state.W - 44, cx + R + 54), bendY = Math.max(64, cy - R * 0.72);
  return { cx, cy, R, entryX: cx + R * 0.8, entryY: cy - R * 0.16, bendX, bendY, capsuleX: bendX, capsuleY: cy + R * 0.12, slotY: state.H - 68, slotGap };
}
function drawLottoMachine(g) {
  const s = (v) => Math.round(v / state.scale), cx = s(g.cx), cy = s(g.cy), R = s(g.R);
  // 받침대
  pix.rect(cx - s(g.R * 0.5), cy + R + 2, s(g.R), s(26), PAL.steel0); pix.box(cx - s(g.R * 0.5), cy + R + 2, s(g.R), s(26), PAL.ink);
  pix.rect(cx - s(g.R * 0.36), cy + R + s(26), s(16), s(70), PAL.steel0); pix.rect(cx + s(g.R * 0.36) - s(16), cy + R + s(26), s(16), s(70), PAL.steel0);
  pix.hline(cx - s(g.R * 0.5), cx + s(g.R * 0.5), cy + R + 3, PAL.steel2);
  // 추출관
  const ex = s(g.entryX), ey = s(g.entryY), bx = s(g.bendX), by = s(g.bendY), capy = s(g.capsuleY), sy = s(g.slotY) - s(40), t = Math.max(4, s(18));
  const tube = (x0, y0, x1, y1) => { pix.line(x0, y0, x1, y1, PAL.ink, t + 2); pix.line(x0, y0, x1, y1, PAL.cyan0, t); pix.line(x0, y0, x1, y1, PAL.cyan1, Math.max(1, t - 4)); };
  tube(ex, ey, bx, by); tube(bx, by, bx, sy);
  // 캡슐 공개실
  const chW = Math.max(10, s(44)), chH = Math.max(10, s(44));
  pix.rect(bx - chW / 2 | 0, capy - chH / 2 | 0, chW, chH, PAL.bg1); pix.box(bx - chW / 2 | 0, capy - chH / 2 | 0, chW, chH, PAL.steel2); pix.box(bx - chW / 2 - 1 | 0, capy - chH / 2 - 1 | 0, chW + 2, chH + 2, PAL.ink);
  pix.ditherRect(bx - chW / 2 + 2 | 0, capy - chH / 2 + 2 | 0, chW - 4, 2, PAL.steel3, 6);
  // 드럼 본체
  pix.disc(cx, cy, R + 2, PAL.ink); pix.disc(cx, cy, R, PAL.bg3); pix.disc(cx, cy, R - 2, PAL.bg1);
  // 팬 날개
  for (let i = 0; i < 6; i++) {
    const a = state.lottoSpin + (i * Math.PI) / 3, len = R * 0.58;
    pix.line(cx, cy, Math.round(cx + Math.cos(a) * len), Math.round(cy + Math.sin(a) * len), PAL.cyan0, 3);
    pix.line(cx, cy, Math.round(cx + Math.cos(a) * len * 0.6), Math.round(cy + Math.sin(a) * len * 0.6), PAL.blue0, 1);
  }
  pix.disc(cx, cy, Math.max(2, s(10)), PAL.ink); pix.disc(cx, cy, Math.max(1, s(8)), PAL.steel1);
}
function drawLottoGlass(g) {
  const s = (v) => Math.round(v / state.scale), cx = s(g.cx), cy = s(g.cy), R = s(g.R);
  pix.ring(cx, cy, R, PAL.cyan2); pix.ring(cx, cy, R + 1, PAL.cyan1); pix.ring(cx, cy, R + 2, PAL.ink);
  // 유리 반사 (좌상단 호)
  for (let a = Math.PI * 1.08; a < Math.PI * 1.55; a += 0.02) { const rr = R * 0.78; pix.px(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), PAL.cyan3); }
  for (let a = Math.PI * 1.2; a < Math.PI * 1.4; a += 0.02) { const rr = R * 0.86; pix.px(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), PAL.white); }
}
function drawLottoSlots(g) {
  const s = (v) => Math.round(v / state.scale);
  for (let i = 0; i < state.drawCount; i++) {
    const x = s(state.W / 2 + (i - (state.drawCount - 1) / 2) * g.slotGap), y = s(g.slotY), w = Math.max(10, s(58)), h = Math.max(4, s(14));
    pix.rect(x - w / 2 | 0, y + s(6), w, h, PAL.gold0); pix.box(x - w / 2 | 0, y + s(6), w, h, PAL.gold1); pix.box(x - w / 2 - 1 | 0, y + s(6) - 1, w + 2, h + 2, PAL.ink);
  }
}
export function drawLottoScene() {
  const now = performance.now();
  state.zoom = 1; state.zoomFocusX = state.W / 2; state.cameraY = 0;
  drawBackground(0, "lotto");
  const g = lottoGeometry();
  drawLottoMachine(g); drawLottoSlots(g);
  const labels = [];
  for (const b of state.lottoBalls) {
    if (b.hidden) continue;
    if (b.inTray) { b.x = state.W / 2 + (b.trayIndex - (state.drawCount - 1) / 2) * g.slotGap; b.y = g.slotY; }
    const x = mapX(b.x), y = mapY(b.y), rr = Math.max(2, Math.round(b.r / state.scale));
    if (b.inTray) pix.ring(x, y, rr + 3, PAL.gold2);
    pix.ball(x, y, rr, b.color);
    labels.push([b, x * state.scale + state.scale / 2, y * state.scale + state.scale / 2, rr]);
  }
  drawLottoGlass(g);
  // 캡슐
  const c = state.capsule;
  if (c) {
    const sh = c.shake || 0, ox = Math.round((Math.random() - 0.5) * sh), oy = Math.round((Math.random() - 0.5) * sh);
    const x = mapX(c.x) + ox, y = mapY(c.y) + oy, rr = Math.max(3, Math.round(11 / state.scale));
    pix.disc(x, y, rr + 1, PAL.ink); pix.disc(x, y, rr, PAL.steel1); pix.disc(x - 1, y - 1, Math.max(1, rr - 1), PAL.steel2); pix.px(x - 1, y - 2, PAL.steel3);
    labels.push([{ num: "?" }, x * state.scale + state.scale / 2, y * state.scale + state.scale / 2, rr]);
  }
  fx.drawWorld(pix, mapXY, 1 / state.scale);
  if (state.lottoPhase === "shake" || state.lottoPhase === "travel") { const p = state.lottoPhase === "shake" ? 0.45 : 0.25; pix.spotlight(mapX(g.capsuleX), mapY(g.capsuleY), Math.round(90 / state.scale), Math.round(p * 16)); }
  fx.post(pix);
  pix.blitTo(els.canvas.getContext("2d"), 0, 0, state.scale);
  hud.clearRect(0, 0, state.W, state.H);
  for (const [b, x, y, rr] of labels) drawBallLabel(b, x, y, rr);
  for (let i = 0; i < state.drawCount; i++) {
    const x = state.W / 2 + (i - (state.drawCount - 1) / 2) * g.slotGap;
    text(state.mode === "rank" ? `${i + 1}등` : `당첨 ${i + 1}`, x, g.slotY + 36, { size: 12, color: PAL.gold2, outline: false });
  }
  text("CAPSULE", g.capsuleX, g.capsuleY - 34, { size: 10, color: PAL.steel2, outline: false });
  const phaseText = { mix: "MIXING", suck: "SUCTION", travel: "CAPSULE IN TUBE", shake: "OPENING...", reveal: "REVEAL!", pause: "NEXT", done: "COMPLETE", ready: "READY" }[state.lottoPhase] || "";
  if (phaseText) text(phaseText, state.W / 2, state.H - 30, { size: 14, color: state.lottoPhase === "shake" ? PAL.gold2 : PAL.cyan3 });
  if (state.lottoPhase === "shake") { const blink = Math.floor(now / 120) % 2 === 0; text("?", g.capsuleX, g.capsuleY - 56, { size: 32, color: blink ? PAL.gold2 : "#fff" }); }
  const f = state.winnerFx; if (f) { f.lottoX = g.capsuleX; }
  drawWinnerEffect(now);
  drawFloaters();
}
function drawLottoIdle() {
  if (!state.W || !state.H) resizeCanvas();
  state.zoom = 1; state.zoomFocusX = state.W / 2; state.cameraY = 0; fx.shakeX = 0; fx.shakeY = 0;
  drawBackground(0, "lotto");
  const g = lottoGeometry();
  drawLottoMachine(g); drawLottoSlots(g);
  const nums = (state.participants.length ? state.participants : Array.from({ length: 30 }, (_, i) => i + 1)).slice(0, 30), rand = makeRand(91421), r = clamp(Math.min(17 - nums.length * 0.1, g.R * 0.095), 7.5, 16);
  const labels = [];
  nums.forEach((num, i) => {
    // 해바라기 배치: 겹치지 않게 고르게 퍼뜨린다
    const a = i * 2.39996 + rand() * 0.3, rr = Math.sqrt((i + 0.5) / nums.length) * (g.R - r - 20), x = mapX(g.cx + Math.cos(a) * rr), y = mapY(g.cy + Math.sin(a) * rr), pr = Math.max(2, Math.round(r / state.scale));
    pix.ball(x, y, pr, BALL_PALETTES[i % BALL_PALETTES.length]);
    labels.push([{ num }, x * state.scale + state.scale / 2, y * state.scale + state.scale / 2, pr]);
  });
  drawLottoGlass(g);
  pix.darken(0.25);
  pix.blitTo(els.canvas.getContext("2d"), 0, 0, state.scale);
  hud.clearRect(0, 0, state.W, state.H);
  for (const [b, x, y, rr] of labels) drawBallLabel(b, x, y, rr);
  text("로또 공정 추첨", g.cx, g.cy - 6, { size: clamp(Math.round(state.W * 0.035), 22, 36), color: "#fff", outlineWidth: 5 });
  text("모든 번호를 같은 확률로 섞어 캡슐로 공개합니다", g.cx, g.cy + 26, { size: 12, color: PAL.steel3 });
  for (let i = 0; i < state.drawCount; i++) { const x = state.W / 2 + (i - (state.drawCount - 1) / 2) * g.slotGap; text(state.mode === "rank" ? `${i + 1}등` : `당첨 ${i + 1}`, x, g.slotY + 36, { size: 12, color: PAL.gold2, outline: false }); }
}

// ---------- 1등 발표 전광판 ----------
const glyphCache = new Map();
// 문자열을 네오둥근모 16px로 래스터라이즈해 비트 격자로 만든다
function rasterizeText(str) {
  let g = glyphCache.get(str);
  if (g) return g;
  const c = document.createElement("canvas"), x = c.getContext("2d");
  x.font = `16px ${FONT}`;
  const w = Math.ceil(x.measureText(str).width) + 4, h = 22;
  c.width = w; c.height = h;
  x.font = `16px ${FONT}`; x.textBaseline = "top"; x.fillStyle = "#fff"; x.fillText(str, 2, 2);
  const d = x.getImageData(0, 0, w, h).data;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  const bits = [];
  for (let yy = 0; yy < h; yy++) { const row = []; for (let xx = 0; xx < w; xx++) { const on = d[(yy * w + xx) * 4 + 3] > 110; row.push(on); if (on) { minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, yy); maxY = Math.max(maxY, yy); } } bits.push(row); }
  if (maxX < 0) { g = { w: 1, h: 1, bits: [[false]] }; }
  else g = { w: maxX - minX + 1, h: maxY - minY + 1, bits: bits.slice(minY, maxY + 1).map((r) => r.slice(minX, maxX + 1)) };
  glyphCache.set(str, g);
  return g;
}
// 도트 블록으로 큰 글자 찍기. revealRows: 위에서부터 켜진 행 수
function stampDots(grid, x0, y0, block, colors, revealRows, flickerRow) {
  const gap = block >= 4 ? 1 : 0;
  for (let y = 0; y < grid.h; y++) {
    if (y > revealRows) break;
    const partial = y === revealRows && flickerRow;
    for (let x = 0; x < grid.w; x++) {
      if (!grid.bits[y][x]) continue;
      if (partial && Math.random() < 0.5) continue;
      const px0 = x0 + x * block, py0 = y0 + y * block;
      pix.rect(px0 + 2, py0 + 2, block - gap, block - gap, colors.shadow);
      pix.rect(px0, py0, block - gap, block - gap, colors.base);
      if (block >= 5) pix.rect(px0, py0, Math.max(1, block - gap - 2), 1, colors.light);
      if (block >= 5) pix.rect(px0, py0, 1, Math.max(1, block - gap - 2), colors.light);
    }
  }
}
export function drawWinnerScreen(results, t) {
  const num = results[0], name = shortName(num), many = results.length > 1;
  state.zoom = 1; state.zoomFocusX = state.W / 2; state.cameraY = 0;
  drawBackground(0, "lotto"); pix.darken(0.3);
  // 방사형 빛줄기 (디더)
  const cx = pix.w >> 1, cy = Math.round(pix.h * (many ? 0.36 : 0.42));
  const spin = t * 0.6;
  for (let i = 0; i < 10; i++) {
    const a = spin + (i * Math.PI) / 5, len = Math.max(pix.w, pix.h);
    pix.dashedLine(cx, cy, Math.round(cx + Math.cos(a) * len), Math.round(cy + Math.sin(a) * len), PAL.gold0, 2, 3);
  }
  const grid = rasterizeText(String(num));
  const maxW = pix.w * (many ? 0.46 : 0.6), maxH = pix.h * (many ? 0.28 : 0.38);
  const block = Math.max(2, Math.floor(Math.min(maxW / grid.w, maxH / grid.h)));
  const totalW = grid.w * block, totalH = grid.h * block, x0 = cx - (totalW >> 1), y0 = cy - (totalH >> 1);
  const p = clamp((t - 0.3) / 0.8, 0, 1), revealRows = Math.floor(p * grid.h), done = t >= 1.1;
  // 전광판 프레임
  const pad = Math.max(6, block);
  pix.rect(x0 - pad - 3, y0 - pad - 3, totalW + pad * 2 + 6, totalH + pad * 2 + 6, PAL.ink);
  pix.ditherRect(x0 - pad, y0 - pad, totalW + pad * 2, totalH + pad * 2, PAL.bg3, 6);
  pix.box(x0 - pad - 1, y0 - pad - 1, totalW + pad * 2 + 2, totalH + pad * 2 + 2, done ? PAL.gold1 : PAL.steel1);
  // 꺼진 LED 자리
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.bits[y][x] && y > revealRows) pix.rect(x0 + x * block + (block >> 1), y0 + y * block + (block >> 1), 1, 1, PAL.steel0);
  stampDots(grid, x0, y0, block, { base: done && Math.floor(t * 6) % 2 === 0 ? PAL.gold3 : PAL.gold2, shadow: PAL.gold0, light: PAL.gold3 }, done ? grid.h : revealRows, !done);
  // 완성 후 반짝이
  if (done) for (let i = 0; i < 6; i++) { const sx = x0 - pad + Math.floor(Math.random() * (totalW + pad * 2)), sy = y0 - pad + Math.floor(Math.random() * (totalH + pad * 2)); pix.px(sx, sy, PAL.white); }
  fx.drawWorld(pix, mapXY, 1 / state.scale);
  fx.post(pix);
  pix.blitTo(els.canvas.getContext("2d"), 0, 0, state.scale);
  // HUD
  hud.clearRect(0, 0, state.W, state.H);
  const frameTop = (y0 - pad - 3) * state.scale, frameBottom = (y0 + totalH + pad + 3) * state.scale;
  const label = state.mode === "rank" ? "1등" : many ? "당첨" : "WINNER";
  text(label, state.W / 2, frameTop - 28, { size: state.W < 520 ? 20 : 28, color: PAL.gold2, outlineWidth: 4 });
  if (done || t > 0.9) {
    const a = clamp((t - 0.9) / 0.3, 0, 1);
    text(name ? `${num}번 ${name}` : `${num}번`, state.W / 2, frameBottom + 30, { size: state.W < 520 ? 22 : 32, color: "#fff", outlineWidth: 5, alpha: a });
    if (many) {
      const rest = results.slice(1).map((n, i) => `${i + 2}. ${displayName(n)}`).join("   ");
      text(rest, state.W / 2, frameBottom + 68, { size: state.W < 520 ? 12 : 16, color: PAL.steel3, alpha: a });
    }
  }
  if (t > 2.2 && Math.floor(t * 2) % 2 === 0) text("▼ 결과 보드", state.W / 2, state.H - 30, { size: 12, color: PAL.steel2, outline: false });
  return { row: revealRows, done };
}

// ---------- 전체 순서: 팝콘 상자 + 집게 ----------
export function orderGeometry(n) {
  const W = state.W, H = state.H;
  const boxTop = 56, boxBottom = Math.round(H * 0.5), boxLeft = 20, boxRight = W - 20;
  const cols = clamp(Math.ceil(Math.sqrt(n * 2.2)), 6, 16), rows = Math.max(1, Math.ceil(n / cols));
  const boardTop = boxBottom + 64, boardBottom = H - 22;
  const cellW = (W - 40) / cols, cellH = Math.min(46, (boardBottom - boardTop) / rows);
  const boardH = cellH * rows, bTop = boardTop + Math.max(0, (boardBottom - boardTop - boardH) / 2);
  return {
    boxTop, boxBottom, boxLeft, boxRight, railY: boxTop - 14, chuteX: boxRight - 30, vents: 5,
    ballR: clamp(16 - n * 0.06, 8, 15), boardTop: bTop, boardBottom: bTop + boardH, cols, rows, cellW, cellH,
    cellBallR: clamp(Math.min(cellH * 0.3, cellW * 0.26), 5, 12), arcH: Math.min(120, H * 0.16),
    cell(i) { const col = i % cols, row = Math.floor(i / cols); return { x: 20 + col * cellW, y: bTop + row * cellH, w: cellW, h: cellH, cx: 20 + col * cellW + cellW / 2, cy: bTop + row * cellH + cellH / 2 + 2 }; }
  };
}
function drawClaw(c, g) {
  const s = (v) => Math.round(v / state.scale), x = s(c.x), y = s(c.y), railY = s(g.railY);
  // 레일과 케이블
  pix.rect(s(g.boxLeft), railY - 1, s(g.boxRight) - s(g.boxLeft), 3, PAL.steel0); pix.hline(s(g.boxLeft), s(g.boxRight), railY, PAL.steel2);
  pix.rect(x - 3, railY - 3, 7, 6, PAL.ink); pix.rect(x - 2, railY - 2, 5, 4, PAL.steel2);
  pix.vline(x, railY + 2, y - 3, PAL.steel1); pix.vline(x + 1, railY + 2, y - 3, PAL.ink);
  // 몸통
  pix.rect(x - 4, y - 4, 9, 6, PAL.ink); pix.rect(x - 3, y - 3, 7, 4, PAL.steel2); pix.px(x - 2, y - 3, PAL.steel3);
  // 집게 발 (열림/닫힘)
  const spread = c.open ? 6 : 2, len = 7;
  const prong = (dx) => { pix.line(x, y + 1, x + dx, y + len, PAL.ink, 3); pix.line(x, y + 1, x + dx, y + len, PAL.steel2, 1); pix.rect(x + dx - 1, y + len, 3, 2, PAL.steel3); };
  prong(-spread); prong(spread); pix.rect(x - 1, y + 1, 3, len, PAL.ink); pix.vline(x, y + 1, y + len, PAL.steel2);
}
export function drawOrderScene(now) {
  const game = state.orderGame; if (!game) return;
  const g = orderGeometry(game.total), s = (v) => Math.round(v / state.scale);
  state.zoom = 1; state.zoomFocusX = state.W / 2; state.cameraY = 0;
  drawBackground(0, "lotto");
  // 상자
  const bx0 = s(g.boxLeft), bx1 = s(g.boxRight), by0 = s(g.boxTop), by1 = s(g.boxBottom);
  pix.rect(bx0, by0, bx1 - bx0, by1 - by0, PAL.bg1);
  pix.ditherRect(bx0, by0, bx1 - bx0, 8, PAL.bg3, 5);
  const blowing = now < game.blowUntil;
  for (let i = 0; i < g.vents; i++) {
    const vx = s(g.boxLeft + ((i + 0.5) * (g.boxRight - g.boxLeft)) / g.vents);
    pix.rect(vx - 5, by1 - 3, 11, 3, PAL.ink); pix.rect(vx - 4, by1 - 2, 9, 2, blowing ? PAL.cyan2 : PAL.steel0);
    if (blowing) for (let k = 1; k <= 3; k++) pix.ditherRect(vx - 3 - k, by1 - 4 - k * 5, 7 + k * 2, 4, PAL.cyan1, 4);
  }
  pix.hline(bx0, bx1, by1, PAL.steel2); pix.hline(bx0, bx1, by1 + 1, PAL.ink);
  // 상자 안 공
  const labels = [];
  const drawB = (b, x, y, rr) => { pix.ball(x, y, rr, b.color); labels.push([b, x * state.scale + state.scale / 2, y * state.scale + state.scale / 2, rr]); };
  for (const b of game.balls) { if (b.gone || b.held) continue; drawB(b, s(b.x), s(b.y), Math.max(2, s(b.r))); }
  // 유리 테두리
  pix.box(bx0 - 1, by0 - 1, bx1 - bx0 + 2, by1 - by0 + 2, PAL.cyan1); pix.box(bx0 - 2, by0 - 2, bx1 - bx0 + 4, by1 - by0 + 4, PAL.ink);
  pix.vline(bx0 + 2, by0 + 4, by1 - 6, PAL.cyan3); pix.hline(bx0 + 2, bx0 + 12, by0 + 2, PAL.cyan3);
  // 투입구(슈트)
  const cx = s(g.chuteX), chuteBottom = s(g.boardTop - 10);
  pix.rect(cx - 7, by0 - 6, 15, by1 - by0 + 12, PAL.ink); pix.rect(cx - 6, by0 - 5, 13, by1 - by0 + 10, PAL.bg3);
  pix.ditherRect(cx - 5, by0 - 4, 11, by1 - by0 + 8, PAL.cyan0, 5);
  pix.vline(cx - 6, by0 - 5, by1 + 5, PAL.cyan1); pix.vline(cx + 6, by0 - 5, by1 + 5, PAL.cyan1);
  pix.rect(cx - 7, by1 + 4, 15, chuteBottom - by1 - 4, PAL.ink); pix.rect(cx - 5, by1 + 4, 11, chuteBottom - by1 - 6, PAL.cyan0);
  pix.rect(cx - 9, chuteBottom - 2, 19, 3, PAL.steel2);
  // 집게와 들고 있는 공
  drawClaw(game.claw, g);
  if (game.claw.holding) { const b = game.claw.holding; drawB(b, s(b.x), s(b.y), Math.max(2, s(b.r))); }
  // 순서판
  for (let i = 0; i < game.total; i++) {
    const c = g.cell(i), x = s(c.x) + 1, y = s(c.y) + 1, w = s(c.w) - 2, h = s(c.h) - 2;
    const placed = game.placed.find((p) => p.index === i);
    pix.rect(x, y, w, h, placed ? PAL.bg3 : PAL.bg1);
    pix.box(x, y, w, h, placed ? (i === 0 ? PAL.gold1 : PAL.steel1) : PAL.steel0);
    if (placed) { const rr = Math.max(2, s(g.cellBallR)); drawB({ num: placed.num, color: placed.color }, s(c.cx), s(c.cy), rr); }
  }
  if (game.lastPlaced && now - game.lastPlacedAt < 500) { const c = g.cell(game.lastPlaced.index); pix.box(s(c.x) - 1, s(c.y) - 1, s(c.w) + 2, s(c.h) + 2, Math.floor(now / 80) % 2 ? PAL.gold2 : PAL.white); }
  // 날아가는 공
  for (const f of game.flying) { if (f.landed) continue; const x = s(f.x), y = s(f.y), rr = Math.max(2, s(g.cellBallR + 2)); pix.ditherDisc(x + 2, y + 3, rr, f.color[2], 6); drawB(f, x, y, rr); }
  fx.drawWorld(pix, mapXY, 1 / state.scale);
  fx.post(pix);
  pix.blitTo(els.canvas.getContext("2d"), 0, 0, state.scale);
  // HUD
  hud.clearRect(0, 0, state.W, state.H);
  for (const [b, x, y, rr] of labels) drawBallLabel(b, x, y, rr);
  for (let i = 0; i < game.total; i++) { const c = g.cell(i); text(String(i + 1), c.x + 4, c.y + 8, { size: 10, color: game.placed.some((p) => p.index === i) ? PAL.gold2 : PAL.steel1, align: "left", outline: false }); }
  panel(12, 60, state.W < 520 ? 150 : 180, 50, { edge: PAL.violet1 });
  text("ORDER DRAW", 22, 76, { size: 12, color: PAL.violet2, align: "left", outline: false });
  text(`${game.placed.length} / ${game.total}`, 22, 97, { size: 16, color: "#fff", align: "left", outline: false });
  const mid = (g.boxBottom + g.boardTop) / 2;
  if (game.idle) return;
  if (game.lastPlaced) {
    const f = game.lastPlaced, age = (now - game.lastPlacedAt) / 1000, pop = 1 + Math.max(0, 0.25 - age) * 1.2;
    hud.save(); hud.translate(state.W / 2, mid); hud.scale(pop, pop);
    text(`${f.index + 1}번째`, -4, 0, { size: 14, color: f.index === 0 ? PAL.gold2 : PAL.cyan3, align: "right" });
    text(displayName(f.num), 4, 0, { size: state.W < 520 ? 18 : 22, color: "#fff", align: "left", outlineWidth: 4 });
    hud.restore();
  } else text("집게가 첫 번째 공을 고르는 중...", state.W / 2, mid, { size: 14, color: PAL.steel3 });
  if (!game.done) text(game.fast ? "⏩ 빨리 감기 중" : "SPACE 또는 화면 터치 · 빨리 감기", state.W - 16, state.H - 10, { size: 10, color: game.fast ? PAL.gold2 : PAL.steel1, align: "right", outline: false });
}

function drawOrderIdle() {
  if (!state.W || !state.H) resizeCanvas();
  const nums = (state.participants.length ? state.participants : Array.from({ length: 30 }, (_, i) => i + 1)).slice(0, 120);
  const g = orderGeometry(nums.length), span = g.chuteX - 16 - g.boxLeft - 14, cols = Math.max(6, Math.floor(span / (g.ballR * 2.6)));
  const saved = state.orderGame;
  state.orderGame = {
    total: nums.length, placed: [], flying: [], fast: false, done: true, idle: true, blowUntil: 0, lastPlaced: null, lastPlacedAt: 0,
    claw: { x: state.W / 2, y: g.railY + 18, open: true, holding: null, phase: "wait" },
    balls: nums.map((num, i) => ({ num, x: g.boxLeft + 14 + g.ballR + (i % cols) * ((span - g.ballR * 2) / Math.max(1, cols - 1)), y: g.boxBottom - 4 - g.ballR - Math.floor(i / cols) * (g.ballR * 2 + 3), r: g.ballR, color: BALL_PALETTES[i % BALL_PALETTES.length] }))
  };
  drawOrderScene(performance.now());
  state.orderGame = saved;
  text("전체 순서", state.W / 2, (g.boxBottom + g.boardTop) / 2 - 2, { size: clamp(Math.round(state.W * 0.034), 22, 34), color: "#fff", outlineWidth: 5 });
  text("집게가 공을 하나씩 집어 순서판에 올립니다 · SPACE 시작", state.W / 2, (g.boxBottom + g.boardTop) / 2 + 26, { size: 12, color: PAL.steel3 });
}
