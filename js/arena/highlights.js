// Observes positions only. Highlight events never change velocity, ranking or results.
export class RaceHighlights {
  constructor() {
    this.reset();
  }
  reset() {
    this.baseline = null; this.sampleAt = 0; this.lastEvent = -Infinity;
    this.leader = null; this.candidate = null; this.candidateAt = 0;
    this.members = ''; this.event = null;
  }
  observe(balls, now, { enabled = true } = {}) {
    if (!enabled) return null;
    const ranked = balls.filter(b => b.active).sort((a, b) => b.y - a.y || a.num - b.num);
    const members = ranked.map(b => b.num).sort((a, b) => a - b).join(',');
    if (members !== this.members) {
      // A finisher leaving the field is not an overtake.
      this.members = members; this.baseline = new Map(ranked.map((b, i) => [b.num, i]));
      this.sampleAt = now; this.leader = ranked[0]?.num ?? null;
      this.candidate = this.leader; this.candidateAt = now;
      return null;
    }
    const first = ranked[0];
    if (!first) return null;
    if (this.candidate !== first.num) { this.candidate = first.num; this.candidateAt = now; }
    let event = null;
    if (first.num !== this.leader && now - this.candidateAt >= 300) {
      const previous = this.leader; this.leader = first.num;
      if (previous != null && now - this.lastEvent >= 2000 && !(first.rescueGlow > .1)) {
        event = { type: 'lead', num: first.num, previous, at: now, from: (this.baseline.get(first.num) ?? 0) + 1, to: 1 };
      }
    }
    if (!event && now - this.sampleAt >= 1600) {
      let best = null;
      ranked.forEach((b, i) => {
        const gain = (this.baseline.get(b.num) ?? i) - i;
        if (gain >= 3 && !(b.rescueGlow > .1) && (!best || gain > best.gain)) best = { type: 'climb', num: b.num, gain, from: i + gain + 1, to: i + 1, at: now };
      });
      if (now - this.lastEvent >= 2000) event = best;
    }
    if (now - this.sampleAt >= 1600) {
      this.baseline = new Map(ranked.map((b, i) => [b.num, i])); this.sampleAt = now;
    }
    if (event) { this.lastEvent = now; this.event = event; }
    return event;
  }
}
