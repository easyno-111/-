// 도트 무대 전용 고정 팔레트. 모든 월드 그래픽은 이 색만 사용한다.
export const PAL = {
  // 배경
  bg0: "#05070f", bg1: "#0b1020", bg2: "#131a30", bg3: "#1c2745",
  star0: "#2a3a63", star1: "#56709e", star2: "#a9c4ea",
  // 선/프레임
  ink: "#05070f", steel0: "#2f3a55", steel1: "#5e6c8f", steel2: "#9aa8c7", steel3: "#e4ecfb", white: "#ffffff",
  // 악센트
  cyan0: "#0d5c7a", cyan1: "#1e9ad1", cyan2: "#5ed4ff", cyan3: "#c9f3ff",
  blue0: "#1f3f9e", blue1: "#3b6cf0", blue2: "#7da1ff",
  violet0: "#4a2d8f", violet1: "#8a5cf6", violet2: "#c7b2ff",
  pink0: "#8b1f4f", pink1: "#f0477f", pink2: "#ffa0c0",
  red0: "#7a1a1f", red1: "#e8383d", red2: "#ff8a8f",
  orange0: "#8f4610", orange1: "#f28a1e", orange2: "#ffc46b",
  gold0: "#8c6410", gold1: "#f2b61b", gold2: "#ffe27a", gold3: "#fff6c4",
  green0: "#146643", green1: "#2fc278", green2: "#8df5b7",
  teal0: "#0f5f66", teal1: "#1fc3cf", teal2: "#9af4f8",
  lime0: "#4d7a12", lime1: "#9fd62d", lime2: "#dbff8a"
};

// 공 색상 세트: [하이라이트, 기본, 그림자]
export const BALL_PALETTES = [
  [PAL.cyan3, PAL.cyan2, PAL.cyan1],
  [PAL.pink2, PAL.pink1, PAL.pink0],
  [PAL.green2, PAL.green1, PAL.green0],
  [PAL.gold2, PAL.gold1, PAL.gold0],
  [PAL.violet2, PAL.violet1, PAL.violet0],
  [PAL.teal2, PAL.teal1, PAL.teal0],
  [PAL.orange2, PAL.orange1, PAL.orange0],
  [PAL.lime2, PAL.lime1, PAL.lime0]
];

// 팀 색 (최대 8팀)
export const TEAM_COLORS = [
  { light: PAL.cyan2, base: PAL.cyan1, dark: PAL.cyan0, css: "#5ed4ff" },
  { light: PAL.pink2, base: PAL.pink1, dark: PAL.pink0, css: "#f0477f" },
  { light: PAL.green2, base: PAL.green1, dark: PAL.green0, css: "#2fc278" },
  { light: PAL.gold2, base: PAL.gold1, dark: PAL.gold0, css: "#f2b61b" },
  { light: PAL.violet2, base: PAL.violet1, dark: PAL.violet0, css: "#8a5cf6" },
  { light: PAL.teal2, base: PAL.teal1, dark: PAL.teal0, css: "#1fc3cf" },
  { light: PAL.orange2, base: PAL.orange1, dark: PAL.orange0, css: "#f28a1e" },
  { light: PAL.lime2, base: PAL.lime1, dark: PAL.lime0, css: "#9fd62d" }
];

// 범퍼/레일 종류별 색
export const RAIL_COLORS = {
  speed: { core: PAL.cyan2, edge: PAL.cyan0, glow: PAL.cyan3 },
  bounce: { core: PAL.violet1, edge: PAL.violet0, glow: PAL.violet2 },
  normal: { core: PAL.steel2, edge: PAL.steel0, glow: PAL.steel3 },
  finish: { core: PAL.gold1, edge: PAL.gold0, glow: PAL.gold2 },
  gate: { core: PAL.orange1, edge: PAL.orange0, glow: PAL.orange2 }
};

const cache = new Map();
// "#rrggbb" → 소프트웨어 래스터용 32비트 (리틀 엔디언 ABGR)
export function rgb(hex) {
  let v = cache.get(hex);
  if (v !== undefined) return v;
  const n = parseInt(hex.slice(1), 16);
  v = (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
  cache.set(hex, v);
  return v;
}

// 기본색 → [하이라이트, 기본, 그림자] 세트 찾기 (팔레트 그룹 기준)
const GROUPS = ["cyan", "blue", "violet", "pink", "red", "orange", "gold", "green", "teal", "lime", "steel"];
const shadeCache = new Map();
export function shades(hex) {
  let v = shadeCache.get(hex);
  if (v) return v;
  v = [PAL.white, hex, PAL.ink];
  for (const g of GROUPS) {
    const keys = Object.keys(PAL).filter((k) => k.startsWith(g) && /\d$/.test(k)).sort();
    const idx = keys.findIndex((k) => PAL[k] === hex);
    if (idx >= 0) {
      const light = PAL[keys[Math.min(keys.length - 1, idx + 1)]], dark = PAL[keys[Math.max(0, idx - 1)]];
      v = [light === hex ? PAL.white : light, hex, dark === hex ? PAL.ink : dark];
      break;
    }
  }
  shadeCache.set(hex, v);
  return v;
}
