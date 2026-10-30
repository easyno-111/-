// 소프트웨어 도트 래스터라이저.
// 저해상도 버퍼(Uint32, ABGR)에 정수 좌표로만 그린 뒤 정수 배율로 확대해 진짜 도트 질감을 만든다.
import { rgb } from "./palette.js?v=8.3";

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];
const spanCache = new Map();
function spans(r) {
  let s = spanCache.get(r);
  if (s) return s;
  s = new Int16Array(r * 2 + 1);
  for (let dy = -r; dy <= r; dy++) s[dy + r] = Math.floor(Math.sqrt(r * r - dy * dy + 0.25));
  spanCache.set(r, s);
  return s;
}

export class PixelSurface {
  constructor() {
    this.w = 0; this.h = 0;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.img = null; this.buf = null;
  }
  resize(w, h) {
    w = Math.max(8, w | 0); h = Math.max(8, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  clear(hex) { this.buf.fill(rgb(hex)); }
  copyFrom(src) { this.buf.set(src); }
  snapshot() { return this.buf.slice(); }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.buf[y * this.w + x] = c;
  }
  px(x, y, hex) { this.set(x | 0, y | 0, rgb(hex)); }
  rect(x, y, w, h, hex) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    const c = rgb(hex);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    const buf = this.buf, W = this.w;
    for (let yy = y0; yy < y1; yy++) buf.fill(c, yy * W + x0, yy * W + x1);
  }
  hline(x0, x1, y, hex) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    this.rect(x0, y, x1 - x0 + 1, 1, hex);
  }
  vline(x, y0, y1, hex) {
    if (y0 > y1) [y0, y1] = [y1, y0];
    this.rect(x, y0, 1, y1 - y0 + 1, hex);
  }
  box(x, y, w, h, hex) {
    this.hline(x, x + w - 1, y, hex); this.hline(x, x + w - 1, y + h - 1, hex);
    this.vline(x, y, y + h - 1, hex); this.vline(x + w - 1, y, y + h - 1, hex);
  }
  // 50% 체커 디더 사각형
  ditherRect(x, y, w, h, hex, level = 8) {
    x |= 0; y |= 0;
    const c = rgb(hex);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + (w | 0)), y1 = Math.min(this.h, y + (h | 0));
    const buf = this.buf, W = this.w;
    for (let yy = y0; yy < y1; yy++) {
      const row = BAYER4[yy & 3];
      for (let xx = x0; xx < x1; xx++) if (row[xx & 3] < level) buf[yy * W + xx] = c;
    }
  }
  // 위→아래 디더 그라데이션. stops: [{at:0..1, hex}]
  vGradient(x, y, w, h, stops) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    const cols = stops.map((s) => rgb(s.hex));
    const buf = this.buf, W = this.w;
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + w);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      const t = (yy - y) / Math.max(1, h - 1);
      let i = 0;
      while (i < stops.length - 2 && t > stops[i + 1].at) i++;
      const a = stops[i], b = stops[i + 1];
      const f = Math.max(0, Math.min(1, (t - a.at) / Math.max(1e-6, b.at - a.at)));
      const row = BAYER4[yy & 3];
      const lvl = Math.round(f * 16);
      for (let xx = x0; xx < x1; xx++) buf[yy * W + xx] = row[xx & 3] < lvl ? cols[i + 1] : cols[i];
    }
  }
  disc(cx, cy, r, hex) {
    cx |= 0; cy |= 0; r |= 0;
    if (r < 0) return;
    if (r === 0) { this.set(cx, cy, rgb(hex)); return; }
    const s = spans(r), c = rgb(hex), buf = this.buf, W = this.w;
    for (let dy = -r; dy <= r; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= this.h) continue;
      const half = s[dy + r];
      const x0 = Math.max(0, cx - half), x1 = Math.min(this.w, cx + half + 1);
      if (x1 > x0) buf.fill(c, yy * W + x0, yy * W + x1);
    }
  }
  ditherDisc(cx, cy, r, hex, level = 8) {
    cx |= 0; cy |= 0; r |= 0;
    if (r < 0) return;
    const s = spans(r), c = rgb(hex), buf = this.buf, W = this.w;
    for (let dy = -r; dy <= r; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= this.h) continue;
      const half = s[dy + r], row = BAYER4[yy & 3];
      for (let xx = Math.max(0, cx - half); xx < Math.min(this.w, cx + half + 1); xx++) if (row[xx & 3] < level) buf[yy * W + xx] = c;
    }
  }
  ring(cx, cy, r, hex) {
    cx |= 0; cy |= 0; r |= 0;
    if (r <= 0) { this.set(cx, cy, rgb(hex)); return; }
    const c = rgb(hex);
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      this.set(cx + x, cy + y, c); this.set(cx - x, cy + y, c); this.set(cx + x, cy - y, c); this.set(cx - x, cy - y, c);
      this.set(cx + y, cy + x, c); this.set(cx - y, cy + x, c); this.set(cx + y, cy - x, c); this.set(cx - y, cy - x, c);
      y++;
      if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
    }
  }
  // 외곽선 + 3단 명암 + 하이라이트 점이 있는 도트 공
  ball(cx, cy, r, [light, base, dark], outline = "#05070f") {
    cx |= 0; cy |= 0; r |= 0;
    if (r < 1) { this.set(cx, cy, rgb(base)); return; }
    this.disc(cx, cy, r + 1, outline);
    this.disc(cx, cy, r, dark);
    this.disc(cx - Math.max(1, r * 0.22) | 0, cy - Math.max(1, r * 0.22) | 0, Math.max(1, r - 1), base);
    if (r >= 3) this.disc(cx - Math.round(r * 0.38), cy - Math.round(r * 0.4), Math.max(1, Math.round(r * 0.36)), light);
    if (r >= 2) this.set(cx - Math.round(r * 0.45), cy - Math.round(r * 0.55), rgb("#ffffff"));
  }
  line(x0, y0, x1, y1, hex, thick = 1) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const c = rgb(hex);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    const half = (thick - 1) >> 1;
    for (let guard = 0; guard < 20000; guard++) {
      if (thick <= 1) this.set(x, y, c);
      else this.rect(x - half, y - half, thick, thick, hex);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // 점선 (패턴: on 픽셀, off 픽셀)
  dashedLine(x0, y0, x1, y1, hex, on = 2, off = 2) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const c = rgb(hex);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0, i = 0;
    for (let guard = 0; guard < 20000; guard++) {
      if (i % (on + off) < on) this.set(x, y, c);
      i++;
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // 화면 전체를 색 방향으로 섞기 (플래시). amount 0..1
  flash(amount, hex = "#ffffff") {
    if (amount <= 0.01) return;
    const a = Math.min(1, amount), buf = this.buf, n = buf.length;
    const c = rgb(hex), cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
    const ia = 1 - a;
    for (let i = 0; i < n; i++) {
      const p = buf[i];
      const r = (p & 255) * ia + cr * a, g = ((p >> 8) & 255) * ia + cg * a, b = ((p >> 16) & 255) * ia + cb * a;
      buf[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }
  // 어둡게 (0..1)
  darken(amount) {
    if (amount <= 0.01) return;
    const k = 1 - Math.min(1, amount), buf = this.buf, n = buf.length;
    for (let i = 0; i < n; i++) {
      const p = buf[i];
      buf[i] = (0xff000000 | (((((p >> 16) & 255) * k) | 0) << 16) | (((((p >> 8) & 255) * k) | 0) << 8) | (((p & 255) * k) | 0)) >>> 0;
    }
  }
  // 색수차: 빨강 채널을 왼쪽, 파랑 채널을 오른쪽으로 k픽셀 밀기
  aberrate(k) {
    k |= 0;
    if (k <= 0) return;
    const src = this.buf.slice(), buf = this.buf, W = this.w, H = this.h;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const p = src[row + x];
        const rx = Math.min(W - 1, x + k), bx = Math.max(0, x - k);
        buf[row + x] = ((p & 0xff00ff00) | (src[row + rx] & 255) | (src[row + bx] & 0xff0000)) >>> 0;
      }
    }
  }
  // 스포트라이트: 중심에서 반지름 r 밖을 디더로 어둡게
  spotlight(cx, cy, r, level = 10) {
    cx |= 0; cy |= 0; r |= 0;
    const buf = this.buf, W = this.w, H = this.h, dark = rgb("#05070f"), r2 = r * r, r2b = (r + 10) * (r + 10);
    for (let y = 0; y < H; y++) {
      const row = BAYER4[y & 3];
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy, d = dx * dx + dy * dy;
        if (d < r2) continue;
        const lvl = d > r2b ? level : (level * (d - r2)) / (r2b - r2);
        if (row[x & 3] < lvl) buf[y * W + x] = dark;
      }
    }
  }
  blitTo(ctx, dx, dy, scale) {
    this.ctx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, this.w, this.h, dx, dy, this.w * scale, this.h * scale);
  }
}

