import { wheelSegments, wheelHubRadius, closestOnSegment } from './wheel-geometry.js?v=8.7';

function segmentBlocks(x, y, r, segment) {
  const p = closestOnSegment(x, y, segment);
  return Math.hypot(x - p.x, y - p.y) < r + (segment.w || 8) / 2 + 4;
}
export function clearLanding(s, ball, x, y, reserved = []) {
  const r = ball.r;
  if (x < 20 + r + 4 || x > s.W - 20 - r - 4 || y < 28 || y > s.worldH - 124) return false;
  for (const c of [...s.pegs, ...s.bumpers]) if (Math.hypot(x-c.x,y-c.y) < r+c.r+4) return false;
  for (const w of s.wheels) {
    if (Math.abs(y-w.y) > w.r+r+8) continue;
    if (Math.hypot(x-w.x,y-w.y) < wheelHubRadius(w)+r+4) return false;
    if (wheelSegments(w).some(seg => segmentBlocks(x,y,r,seg))) return false;
  }
  for (const rotor of s.rotors) {
    const dx=Math.cos(rotor.angle)*rotor.len/2,dy=Math.sin(rotor.angle)*rotor.len/2;
    if(segmentBlocks(x,y,r,{x1:rotor.x-dx,y1:rotor.y-dy,x2:rotor.x+dx,y2:rotor.y+dy,w:12}))return false;
  }
  for(const rail of s.rails) if(segmentBlocks(x,y,r,rail))return false;
  for(const g of s.gates) {
    if(segmentBlocks(x,y,r,{x1:20,y1:g.y,x2:g.gapX-g.gapW/2,y2:g.y,w:8}) || segmentBlocks(x,y,r,{x1:g.gapX+g.gapW/2,y1:g.y,x2:s.W-20,y2:g.y,w:8}))return false;
  }
  for(const b of s.balls) if(b.active && b!==ball && Math.hypot(x-b.x,y-b.y)<r+b.r+5)return false;
  return !reserved.some(p=>Math.hypot(x-p.x,y-p.y)<r+p.r+5);
}
