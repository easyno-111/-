// 도트 이펙트: 파티클, 충격 링, 화면 흔들림, 히트스톱, 플래시, 색수차
import { clamp } from "./util.js?v=8.6";
import { PAL, rgb as pixColor } from "./palette.js?v=8.6";

export class Fx {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.floaters = [];
    this.shakeAmp = 0; this.shakeX = 0; this.shakeY = 0;
    this.hitstopUntil = 0;
    this.flashAmt = 0; this.flashColor = "#ffffff";
    this.chroma = 0;
    this.darkAmt = 0;
    this.spot = null;
  }
  reset() {
    this.particles.length = 0; this.rings.length = 0; this.floaters.length = 0;
    this.shakeAmp = 0; this.shakeX = 0; this.shakeY = 0; this.hitstopUntil = 0; this.flashAmt = 0; this.chroma = 0; this.darkAmt = 0; this.spot = null;
  }
  // 불꽃 파편 (월드 좌표, css px 단위)
  burst(x, y, colors, count = 12, opts = {}) {
    const speed = opts.speed ?? 220, grav = opts.gravity ?? 160, life = opts.life ?? 0.55, size = opts.size ?? 1;
    const list = Array.isArray(colors) ? colors : [colors];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.65), l = life * (0.5 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp + (opts.vy || 0), life: l, max: l, color: list[i % list.length], size: size + (Math.random() < 0.3 ? 1 : 0), grav, kind: "spark" });
    }
  }
  // 연기 뭉치: 커지면서 흐려짐
  smoke(x, y, color = PAL.steel1, count = 4, opts = {}) {
    for (let i = 0; i < count; i++) {
      const l = 0.5 + Math.random() * 0.5;
      this.particles.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 50 + (opts.vx || 0), vy: -20 - Math.random() * 40 + (opts.vy || 0), life: l, max: l, color, size: 2 + Math.random() * 3, grav: -30, kind: "smoke" });
    }
  }
  ring(x, y, color, maxR = 60, life = 0.5, thick = 1) { this.rings.push({ x, y, color, maxR, life, max: life, thick }); }
  // 떠오르는 작은 글자(HUD 레이어에서 그림)
  floater(x, y, text, color = "#ffffff", life = 0.9) { this.floaters.push({ x, y, text, color, life, max: life }); }
  shake(amp) { this.shakeAmp = Math.max(this.shakeAmp, amp); }
  hitstop(ms, now = performance.now()) { this.hitstopUntil = Math.max(this.hitstopUntil, now + ms); }
  isFrozen(now) { return now < this.hitstopUntil; }
  flash(amount, color = "#ffffff") { this.flashAmt = Math.max(this.flashAmt, amount); this.flashColor = color; }
  aberration(amount) { this.chroma = Math.max(this.chroma, amount); }
  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.life -= dt;
      if (p.kind === "smoke") { p.size += dt * 6; p.vx *= 0.96; }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= 28 * dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    if (this.shakeAmp > 0.2) {
      this.shakeX = Math.round((Math.random() - 0.5) * 2 * this.shakeAmp);
      this.shakeY = Math.round((Math.random() - 0.5) * 2 * this.shakeAmp);
      this.shakeAmp *= Math.pow(0.02, dt);
    } else { this.shakeAmp = 0; this.shakeX = 0; this.shakeY = 0; }
    this.flashAmt = Math.max(0, this.flashAmt - dt * 3.2);
    this.chroma = Math.max(0, this.chroma - dt * 2.6);
  }
  // 월드 좌표 → 저해상도 좌표 변환 함수(map)로 파티클 그리기
  drawWorld(pix, map, unit) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max, [sx, sy] = map(r.x, r.y);
      const rr = Math.round((r.maxR * (0.2 + 0.8 * t)) * unit);
      if (rr < 1) continue;
      const row = Math.floor(t * 4);
      if (row % 2 === 0 || t < 0.5) pix.ring(sx, sy, rr, r.color);
      if (r.thick > 1 && t < 0.6) pix.ring(sx, sy, rr - 1, r.color);
    }
    for (const p of this.particles) {
      const [sx, sy] = map(p.x, p.y);
      if (sx < -4 || sy < -4 || sx > pix.w + 4 || sy > pix.h + 4) continue;
      const t = p.life / p.max;
      if (p.kind === "smoke") {
        const r = Math.max(1, Math.round(p.size * unit * 0.5));
        pix.ditherDisc(sx, sy, r, p.color, clamp(Math.round(t * 10), 1, 10));
      } else {
        const s = t < 0.35 ? 1 : p.size;
        if (s <= 1) pix.set(sx, sy, pixColor(p.color));
        else pix.rect(sx - (s >> 1), sy - (s >> 1), s, s, p.color);
      }
    }
  }
  post(pix) {
    if (this.darkAmt > 0.01) pix.darken(this.darkAmt);
    if (this.spot) pix.spotlight(this.spot.x, this.spot.y, this.spot.r, this.spot.level ?? 12);
    if (this.chroma > 0.05) pix.aberrate(Math.round(this.chroma * 3));
    if (this.flashAmt > 0.01) pix.flash(this.flashAmt, this.flashColor);
  }
}

