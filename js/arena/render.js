import { wheelSegments, wheelHubRadius } from './wheel-geometry.js?v=8.7';
// 도트 렌더러: 저해상도 월드 버퍼 + 원본 해상도 HUD(네오둥근모) 2층 구조
import { clamp, makeRand, lerp } from "./util.js?v=8.7";
import { state, MODE_INFO, displayName, shortName } from "./state.js?v=8.7";
import { pix, fx } from "./core.js?v=8.7";
import { PAL, RAIL_COLORS, shades, BALL_PALETTES } from "./palette.js?v=8.7";
import { finishGeometry, buildCourse, raceWorldHeight, teamWorldHeight, prepareTeamBins, layoutTeamBins, buildTeamCourse } from "./courses.js?v=8.7";
import { secureShuffle } from "./util.js?v=8.7";

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
  if (state.chase && (Math.abs(state.W - oldW) > 1 || Math.abs(state.H - oldH) > 1)) state.chase.cancelled = true;
  if (!state.zoomFocusX) state.zoomFocusX = state.W / 2;
  if (state.running && state.engine === "race" && state.balls.length) {
    const nextWorld = raceWorldHeight(), sx = state.W / oldW, sy = nextWorld / oldWorld;
    state.worldH = nextWorld; state.balls.forEach(b => {
      b.x *= sx; b.y *= sy; b.vx *= sx; b.vy *= sy;
      b.motionX *= sx; b.motionY *= sy; b.lastSafeX *= sx; b.lastSafeY *= sy;
      b.baseR = state.W < 520 ? 12 : 16; b.r = b.baseR; b.trail = [];
    }); state.replayFrames = []; state.cameraY *= sy; buildCourse();
  } else if (state.running && state.engine === "teams") {
    const nextWorld = teamWorldHeight(), sx = state.W / oldW, sy = nextWorld / oldWorld;
    state.worldH = nextWorld; state.balls.forEach((b) => { b.x *= sx; b.y *= sy; b.motionX *= sx; b.motionY *= sy; b.lastSafeX *= sx; b.lastSafeY *= sy; }); state.cameraY *= sy; layoutTeamBins(); buildTeamCourse();
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
    pix.vGradient(0, 0, pix.w, pix.h, tone === "celebrate" ? [{ at: 0, hex: PAL.bg2 }, { at: 0.55, hex: PAL.bg1 }, { at: 1, hex: PAL.bg0 }] : [{ at: 0, hex: PAL.bg1 }, { at: 0.5, hex: PAL.bg0 }, { at: 1, hex: PAL.bg0 }]);
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
function drawFinalGateWorld(){
  const g=state.finalGate;if(!g)return;const [top,bottom]=visibleRange(),u=unit();
  for(const lane of g.lanes){
    if(g.startY+400<top||g.startY>bottom)continue;
    for(let y=g.startY+160;y<g.startY+680;y+=100){
      const x=mapX(lane.x),py=mapY(y);if(lane.type==='speed')for(let i=0;i<3;i++)pix.line(x-3+i,py+i,x+3-i,py+i,lane.color,1);
    }
  }
}
function drawFinalGateLabels(){
  const g=state.finalGate;if(!g)return;const [top,bottom]=visibleRange();
  if(g.startY+100>top&&g.startY+100<bottom)for(const lane of g.lanes){
    const label={speed:'고속',fork:'갈림길',wheel:'회전'}[lane.type];
    text(`${lane.num} ${label}`,hudX(lane.x),hudY(g.startY+70),{size:state.W<600?12:14,color:lane.color});
  }
  if(g.kicker.y>top&&g.kicker.y<bottom)text('FINAL BOUNCE',hudX(state.W/2),hudY(g.kicker.y)-72,{size:12,color:PAL.gold2});
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
    if (Math.max(r.y1,r.y2)<top || Math.min(r.y1,r.y2)>bottom) continue;
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
  for (const wheel of state.wheels) {
    if (wheel.y + wheel.r < top || wheel.y - wheel.r > bottom) continue;
    const x = mapX(wheel.x), y = mapY(wheel.y), [light, base] = shades(wheel.color);
    for (const segment of wheelSegments(wheel)) {
      thickLine(mapX(segment.x1), mapY(segment.y1), mapX(segment.x2), mapY(segment.y2), segment.w,
        { edge: PAL.ink, core: wheel.hit > 0 ? light : base, glow: light });
    }
    const hub = Math.max(3, Math.round(wheelHubRadius(wheel) * u));
    pix.disc(x, y, hub + 1, PAL.ink); pix.disc(x, y, hub, PAL.steel1);
    pix.ring(x, y, Math.max(2, hub - 1), PAL.steel3); pix.disc(x, y, Math.max(2, hub / 3 | 0), light);
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
  drawFinalGateWorld();
  if (state.engine === "teams" || (!state.running && state.mode === "teams")) drawTeamBins(); else drawFinish();
}
function drawFinish() {
  const f = finishGeometry(), [top, bottom] = visibleRange();
  if (f.topY > bottom + 100) return;
  const u = unit(), x0 = mapX(state.finalGate?f.center-state.finalGate.throatHalf:20), x1 = mapX(state.finalGate?f.center+state.finalGate.throatHalf:state.W - 20), yTop = mapY(f.topY), yGate = mapY(f.gateY);
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
  if (state.cheerNum === b.num || (state.cameraMode === "track" && state.trackedNum === b.num)) { pix.ring(x, y, rr + 4 + (Math.floor(now / 150) % 2), PAL.green2); }
  if (now < (b.overtakeUntil || 0)) { pix.ring(x, y, rr + 6, PAL.gold2); pix.hline(x - rr, x + rr, y - rr - 8, PAL.gold2); }
  if ((b.boostFlame || 0) > .02) {
    const dx = b.boostDx || 0, dy = b.boostDy || 1, length = Math.hypot(dx, dy), nx = -dx / length, ny = -dy / length;
    const power = b.boostFlame, flicker = 1 + Math.sin(now * .06 + b.num) * .15;
    const tail = rr * (2.6 + power) * flicker;
    const sx = x + nx * rr * .6, sy = y + ny * rr * .6;
    pix.line(Math.round(sx), Math.round(sy), Math.round(x + nx * tail), Math.round(y + ny * tail), PAL.orange1, Math.max(3, Math.round(rr * 1.1 * power)));
    pix.line(Math.round(sx), Math.round(sy), Math.round(x + nx * tail * .76), Math.round(y + ny * tail * .76), PAL.gold2, Math.max(2, Math.round(rr * .7 * power)));
    pix.line(Math.round(sx), Math.round(sy), Math.round(x + nx * tail * .4), Math.round(y + ny * tail * .4), PAL.white, Math.max(1, Math.round(rr * .35 * power)));
    for (let i = 0; i < 4; i++) { const t = ((now * .002 + i / 4) % 1), side = Math.sin(i * 7 + now * .01) * rr * .5; pix.rect(Math.round(x + nx * (rr + tail * t) - ny * side), Math.round(y + ny * (rr + tail * t) + nx * side), 2, 2, i % 2 ? PAL.gold2 : PAL.orange1); }
  }
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
  const [visibleTop, visibleBottom] = visibleRange();
  for (const b of state.balls) {
    const active = replay ? (b.rActive ?? b.active) : b.active;
    if (!active && !b.finished) continue;
    const wx = replay ? (b.rx ?? b.x) : b.x, wy = replay ? (b.ry ?? b.y) : b.y;
    if (wy < visibleTop || wy > visibleBottom) continue;
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
  drawFinalGateLabels();
  drawLetterbox();
  if (replay) { drawReplayTag(now); drawFloaters(); return; }
  if (state.engine === "teams") drawTeamHud(); else drawRaceHud();
  drawMinimap();
  if (state.chase) drawChaseBanner(); else if (state.engine === "race") drawComebackBanner(now);
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
  const ranked = state.balls.filter((b) => b.active).sort((a, b) => b.y - a.y).slice(0, 3), boxW = state.W < 520 ? 118 : 150, rowH = 20, boxH = 48 + ranked.length * rowH;
  panel(12, 56, boxW, boxH);
  text("주행 TOP 3", 22, 72, { size: 12, color: PAL.cyan2, align: "left", outline: false });
  ranked.forEach((b, i) => {
    const y = 94 + i * rowH;
    text(`${i + 1}.${b.num}`, 22, y, { size: 12, color: i === 0 ? PAL.gold2 : "#e9f5ff", align: "left", outline: false });
    const progress = clamp(b.y / state.worldH, 0, 1);
    hud.fillStyle = "rgba(255,255,255,.1)"; hud.fillRect(12 + boxW - 42, y - 2, 32, 4); hud.fillStyle = i === 0 ? PAL.gold1 : PAL.cyan2; hud.fillRect(12 + boxW - 42, y - 2, Math.round(32 * progress), 4);
  });
  text(`${Math.floor(state.raceElapsed || 0)}초${state.chase ? ' · 시간 정지' : ''}`, 22, 56 + boxH - 10, { size: 11, color: PAL.steel3, align: 'left', outline: false });
  if (state.photoFinish) {
    const blink = Math.floor(performance.now() / 140) % 2 === 0;
    text("PHOTO FINISH!", state.W / 2, state.H * 0.2, { size: state.W < 520 ? 24 : 32, color: blink ? PAL.gold2 : "#ffffff", outlineWidth: 5 });
  }
  if (state.cinematicCandidate && state.cinematicText) {
    const deep = state.zoomTarget > 1.4;
    text(state.cinematicText, state.W / 2, state.H - 88, { size: deep ? 20 : 14, color: deep ? PAL.gold2 : PAL.cyan3, outlineWidth: deep ? 4 : 3 });
  }
}
function drawTeamHud() {
  const assigned = state.results.length, total = state.participants.length, boxW = state.W < 520 ? 160 : 196;
  panel(12, 56, boxW, 80, { edge: PAL.green1 });
  text(`TEAM WAVE ${state.teamWave}`, 22, 72, { size: 12, color: PAL.green2, align: "left", outline: false });
  text(`${assigned} / ${total}명 배치`, 22, 96, { size: 16, color: "#fff", align: "left", outline: false });
  hud.fillStyle = "rgba(255,255,255,.1)"; hud.fillRect(22, 108, boxW - 20, 6); hud.fillStyle = PAL.green1; hud.fillRect(22, 108, Math.round((boxW - 20) * (total ? assigned / total : 0)), 6);
  text(`구조 ${state.rescueCount}회 · 대기 ${state.teamQueue.length}명`, 22, 126, { size: 10, color: PAL.steel2, align: "left", outline: false });
  if (state.cinematicText) text(state.cinematicText, state.W / 2, state.H - 88, { size: 14, color: PAL.cyan3 });
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
  if (!state.worldH) return;
  const w = 58, h = Math.min(240, state.H - 120), x = state.W - w - 12, y = 58, sy = h / state.worldH;
  panel(x, y, w, h, { alpha: 0.9 });
  hud.fillStyle = "rgba(94,212,255,.08)"; hud.fillRect(x + 4, y + 4, w - 8, h - 8);
  for (const b of state.balls) { if (!b.active) continue; hud.fillStyle = b.num === state.cheerNum ? "#8affbc" : "#fff"; hud.fillRect(Math.round(x + 4 + (b.x / state.W) * (w - 8)) - 1, Math.round(y + 4 + b.y * sy) - 1, 2, 2); }
  const viewTop = clamp(state.cameraY, 0, state.worldH), viewBottom = clamp(state.cameraY + state.H / state.zoom, 0, state.worldH);
  hud.strokeStyle = PAL.cyan2; hud.lineWidth = 2; hud.strokeRect(x + 3, Math.round(y + 4 + viewTop * sy), w - 6, Math.max(5, (viewBottom - viewTop) * sy));
  text("MAP", x + w / 2, y - 8, { size: 10, color: PAL.cyan3, outline: false });
}
function drawChaseBanner() {
  const e = state.chase, w = Math.min(state.W - 30, 390), y = state.W < 520 ? 195 : 80;
  panel((state.W - w) / 2, y, w, 72, { edge: PAL.orange1, fill: 'rgba(35,16,5,.96)' });
  const phase = { freeze: '시간 정지', pan: '추격 대상을 비춥니다', charge: '부스터 점화!', boost: '추격 발진!', return: '경기 재개 준비' }[e.phase];
  text(e.type === 'mid' ? `하위 50% · ${e.plans.length}명 부스터` : `최후의 역전 · ${e.plans[0].num}번`, state.W / 2, y + 23, { size: state.W < 520 ? 17 : 22, color: PAL.gold2 });
  text(e.type === 'final' && e.phase === 'boost' ? `${e.plans[0].targetNum}번 선두를 추격!` : phase, state.W / 2, y + 50, { size: 14 });
}
function drawComebackBanner(now) {
  const event = state.raceEvent;
  if (!event || now - event.at > 2400 || !state.running) return;
  const w = Math.min(state.W - 30, 350), y = state.W < 520 ? 195 : 115;
  panel((state.W - w) / 2, y, w, 68, { edge: PAL.gold2, fill: 'rgba(35,27,8,.96)' });
  text(event.type === 'lead' ? '선두 교체!' : `${event.gain}계단 상승!`, state.W / 2, y + 20, { size: 21, color: PAL.gold2 });
  text(event.type === 'lead' ? `${event.previous}번 → ${event.num}번` : `${event.num}번 · ${event.from}위 → ${event.to}위`, state.W / 2, y + 47, { size: 17 });
}
function drawTrackingIndicator() {
  const selected = state.cheerNum ?? (state.cameraMode === "track" ? state.trackedNum : null);
  if (selected == null) return;
  const b = state.balls.find((v) => v.active && v.num === selected); if (!b) return;
  const sx = hudX(b.x), sy = hudY(b.y);
  if (sx > 18 && sx < state.W - 18 && sy > 45 && sy < state.H - 80) return;
  const x = clamp(sx, 38, state.W - 38), y = clamp(sy, 58, state.H - 88), a = Math.atan2(sy - y, sx - x);
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
  const cx = clamp(hudX(f.x), state.W * 0.22, state.W * 0.78), cy = cinematicAnchorY();
  const fade = clamp(1 - (t - (life - 0.35)) / 0.35, 0, 1), p = clamp((t - 0.05) / 0.32, 0, 1), pop = 0.3 + p * 0.7 + Math.sin(p * Math.PI) * 0.2;
  const badgeW = clamp(state.W * 0.42, 220, 340), badgeH = state.W < 520 ? 96 : 118, name = shortName(f.num);
  hud.save(); hud.globalAlpha = fade; hud.translate(cx, cy - clamp(state.H * 0.2, 80, 130)); hud.scale(pop, pop);
  // 방사선
  hud.save(); hud.rotate(t * 0.9); hud.globalAlpha = fade * 0.5;
  for (let i = 0; i < 12; i++) { hud.rotate(Math.PI / 6); hud.fillStyle = i % 2 ? PAL.gold1 : PAL.gold2; hud.fillRect(badgeW * 0.3, -3, badgeW * 0.42 * clamp(t / 0.4, 0, 1), 6); }
  hud.restore();
  panel(-badgeW / 2, -badgeH / 2, badgeW, badgeH, { fill: "rgba(5,7,15,.94)", edge: PAL.gold2, border: PAL.gold0 });
  text(`${f.place}등 골인!`, 0, -badgeH * 0.3, { size: 16, color: PAL.gold2, outline: false });
  text(`${f.num}번`, 0, name ? badgeH * 0.02 : badgeH * 0.1, { size: state.W < 520 ? 36 : 48, color: "#fff", outlineColor: PAL.gold0, outlineWidth: 6 });
  if (name) text(name, 0, badgeH * 0.33, { size: 16, color: PAL.gold3, outline: false });
  hud.restore();
}
function drawFloaters() { for (const f of fx.floaters) text(f.text, hudX(f.x), hudY(f.y), { size: 12, color: f.color, alpha: clamp(f.life / f.max, 0, 1) }); }
function drawReplayTag(now) {
  if (Math.floor(now / 400) % 2 === 0) text("◀ REPLAY", 24, 76, { size: 16, color: PAL.red2, align: "left" });
  text("결승 순간 다시 보기 · 0.3배속", state.W / 2, state.H - 88, { size: 14, color: PAL.steel3 });
}

// ---------- 대기 화면 ----------
export function drawIdle() {
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
  drawFinalGateLabels();
  text(MODE_INFO[state.mode].name, state.W / 2, state.H * 0.44, { size: clamp(Math.round(state.W * 0.04), 24, 40), color: "#fff", outlineWidth: 5 });
  const sub = state.mode === "teams" ? "참가 번호를 팀별로 고르게 나눕니다" : state.mode === "order" ? "모든 번호의 발표 순서를 한 번에 정합니다" : "번호 공이 출발할 준비를 하고 있습니다";
  text(sub, state.W / 2, state.H * 0.44 + 34, { size: 14, color: PAL.steel3 });
  text("SPACE 키 또는 시작 버튼", state.W / 2, state.H * 0.44 + 58, { size: 12, color: PAL.steel1, outline: false });
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
  drawBackground(0, "celebrate"); pix.darken(0.3);
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

// ---------- 전체 순서: 한눈에 보이는 셔플 보드 ----------
export function drawOrderScene(now) {
  const game = state.orderGame; if (!game) return;
  state.zoom = 1; state.cameraY = 0; state.zoomFocusX = state.W / 2;
  drawBackground(0, 'celebrate'); pix.blitTo(els.canvas.getContext('2d'), 0, 0, state.scale);
  hud.clearRect(0, 0, state.W, state.H);
  const n = game.order.length, cols = Math.max(3, Math.min(10, Math.floor((state.W - 32) / 62))), rows = Math.ceil(n / cols);
  const cellW = (state.W - 32) / cols, cellH = Math.min(64, (state.H - 145) / rows), top = 90;
  text(game.idle ? '전체 순서' : '발표 순서 셔플', state.W / 2, 62, { size: 24, color: PAL.cyan3 });
  game.order.forEach((num, i) => {
    const x = 16 + (i % cols) * cellW, y = top + Math.floor(i / cols) * cellH, shown = i < game.revealed;
    panel(x + 2, y + 2, cellW - 6, cellH - 6, { edge: shown && i === 0 ? PAL.gold2 : PAL.steel0 });
    text(shown ? String(num) : game.idle ? '?' : String((i * 7 + Math.floor(now / 65)) % 99 + 1), x + cellW / 2, y + cellH * .58, { size: Math.max(10, Math.min(22, cellH * .44)), color: shown ? '#fff' : PAL.steel1 });
    if (cellH > 30) text(`${i + 1}번째`, x + cellW / 2, y + 12, { size: 10, color: shown && i === 0 ? PAL.gold2 : PAL.steel2 });
  });
  text(game.idle ? '시작하면 전체 순서가 빠르게 공개됩니다' : `${game.revealed} / ${n}명 공개`, state.W / 2, state.H - 30, { size: 13, color: PAL.steel3 });
}
function drawOrderIdle() {
  const saved = state.orderGame;
  state.orderGame = { order: state.participants.slice(0, 120), revealed: 0, idle: true };
  drawOrderScene(performance.now()); state.orderGame = saved;
}
