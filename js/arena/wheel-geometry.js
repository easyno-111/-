// Shared by rendering, moving collisions and booster landing checks.
// Four spokes and four short rim braces leave large openings into the wheel.
export function wheelSegments(wheel) {
  const angle = wheel.angle || 0;
  if (wheel._segmentsAngle === angle && wheel._segmentsRadius === wheel.r) return wheel._segments;
  const segments = [], hub = wheelHubRadius(wheel), width = 10;
  for (let i = 0; i < 4; i++) {
    const a = angle + i * Math.PI / 2;
    segments.push({ x1: wheel.x + Math.cos(a) * hub, y1: wheel.y + Math.sin(a) * hub,
      x2: wheel.x + Math.cos(a) * wheel.r, y2: wheel.y + Math.sin(a) * wheel.r, w: width });
    const halfArc = Math.PI / 10;
    for (let j = 0; j < 3; j++) {
      const p = a - halfArc + j * halfArc * 2 / 3, q = p + halfArc * 2 / 3;
      segments.push({ x1: wheel.x + Math.cos(p) * wheel.r, y1: wheel.y + Math.sin(p) * wheel.r,
        x2: wheel.x + Math.cos(q) * wheel.r, y2: wheel.y + Math.sin(q) * wheel.r, w: width });
    }
  }
  wheel._segmentsAngle = angle; wheel._segmentsRadius = wheel.r; wheel._segments = segments;
  return segments;
}
export function wheelHubRadius(wheel) { return Math.min(18, wheel.r * .16); }
export function closestOnSegment(x, y, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / length)) : 0;
  return { x: s.x1 + t * dx, y: s.y1 + t * dy };
}
