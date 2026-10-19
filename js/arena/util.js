// 공용 유틸리티: 수학, 난수, 입력 파싱, 이름 가리기
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// 암호학적 난수 기반 정수 (0 이상 max 미만). 추첨 공정성의 근간.
export function randomInt(max) {
  if (max <= 0) return 0;
  if (globalThis.crypto?.getRandomValues) {
    const limit = Math.floor(0x100000000 / max) * max;
    const a = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(a); v = a[0]; } while (v >= limit);
    return v % max;
  }
  return Math.floor(Math.random() * max);
}

export function secureShuffle(values) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 시드 기반 결정적 난수 (코스 생성, 배경 별 배치 등 연출 전용)
export function makeRand(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => randomInt(0x7ffffffe) + 1;

// "2, 5, 8, 11, 15-20" 같은 입력을 번호 배열로
export function parseSpec(text) {
  const clean = String(text || "").replace(/[，、]/g, ",").trim();
  if (!clean) return { numbers: [], invalid: [] };
  const tokens = clean.split(/[\s,]+/).filter(Boolean);
  const set = new Set();
  const invalid = [];
  for (const token of tokens) {
    const range = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]), b = Number(range[2]);
      if (a < 1 || b < 1 || a > b || b - a > 300) { invalid.push(token); continue; }
      for (let n = a; n <= b; n++) set.add(n);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n >= 1 && n <= 9999) set.add(n); else invalid.push(token);
    } else invalid.push(token);
  }
  return { numbers: [...set].sort((a, b) => a - b), invalid };
}

// 이름 가리기: 이지후 → 이O후, 김철 → 김O, 남궁민수 → 남OO수
export function maskName(raw) {
  const name = String(raw || "").replace(/\s+/g, "").trim();
  if (!name) return "";
  const chars = [...name];
  if (chars.length === 1) return chars[0];
  if (chars.length === 2) return chars[0] + "O";
  return chars[0] + "O".repeat(chars.length - 2) + chars[chars.length - 1];
}

export function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
