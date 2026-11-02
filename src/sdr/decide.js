// Decision layer: one team-weighted score per design, what each criterion contributes, and the two views that say
// how solid a choice is: the "winner map" (who wins as you turn each weight from 0 to 10, the others held) and
// "weight robustness" (share of thousands of random weightings each design wins).
import { CRITERIA, DEFAULT_WEIGHTS } from './engine.js';

// Designs that miss a requirement keep `penalty` of their score: visible in the ranking, but below compliant ones.
export function weightedScore(r, w = DEFAULT_WEIGHTS, penalty = 0.6) {
  let s = 0, t = 0;
  for (const c of CRITERIA) { const wi = w[c.id] ?? 0; s += wi * (r.criteria[c.id] ?? 0); t += wi; }
  return (t ? s / t : 0) * (r.compliant ? 1 : penalty);
}
export const contributions = (r, w = DEFAULT_WEIGHTS) => {
  const t = CRITERIA.reduce((a, c) => a + (w[c.id] ?? 0), 0) || 1;
  return CRITERIA.map(c => ({ id: c.id, label: c.label, v: ((w[c.id] ?? 0) * (r.criteria[c.id] ?? 0)) / t, raw: r.criteria[c.id] ?? 0 }));
};

export const rank = (results, w, penalty) => results.map((r, i) => ({ i, s: weightedScore(r, w, penalty) })).sort((a, b) => b.s - a.s);

// For each criterion: sweep its weight 0..10 with the others held and record the leader at each step. Segments of
// the same leader become one bar, so a row that is one colour means "this weight cannot change the answer".
export function winnerMap(results, w, penalty, steps = 50) {
  return CRITERIA.map(c => {
    const segs = [];
    for (let s = 0; s <= steps; s++) {
      const x = (10 * s) / steps, lead = rank(results, { ...w, [c.id]: x }, penalty)[0].i;
      if (segs.length && segs.at(-1).lead === lead) segs.at(-1).to = x; else segs.push({ lead, from: x, to: x });
    }
    return { id: c.id, label: c.label, w: w[c.id] ?? 0, segs };
  });
}

// Flip points between the leader and each rival: the weight on one criterion (others held) at which the rival takes
// over. Score difference is linear in each weight's numerator, so the crossing is exact.
export function flips(results, w, penalty) {
  const order = rank(results, w, penalty), A = results[order[0].i];
  const pen = r => (r.compliant ? 1 : penalty);
  const out = [];
  for (const { i } of order.slice(1)) {
    const B = results[i];
    const d = Object.fromEntries(CRITERIA.map(c => [c.id, pen(A) * A.criteria[c.id] - pen(B) * B.criteria[c.id]]));
    const N0 = CRITERIA.reduce((a, c) => a + (w[c.id] ?? 0) * d[c.id], 0);
    for (const c of CRITERIA) {
      if (Math.abs(d[c.id]) < 1e-9) continue;
      const x = (w[c.id] ?? 0) - N0 / d[c.id];
      if (x >= 0 && x <= 10) out.push({ rival: i, crit: c.id, label: c.label, at: x, dir: x > (w[c.id] ?? 0) ? 'above' : 'below', gap: N0 });
    }
  }
  return { leader: order[0].i, flips: out.sort((a, b) => Math.abs(a.at - (w[a.crit] ?? 0)) - Math.abs(b.at - (w[b.crit] ?? 0))) };
}

// Random weightings (each weight uniform 0..10): how often does each design come first? A design that wins 90% of
// weightings is a robust choice; 40/35/25 means the team's priorities decide it, so argue the weights first.
export function robustness(results, penalty, n = 3000, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const wins = new Array(results.length).fill(0);
  for (let k = 0; k < n; k++) {
    const w = Object.fromEntries(CRITERIA.map(c => [c.id, rnd() * 10]));
    wins[rank(results, w, penalty)[0].i]++;
  }
  return wins.map(x => x / n);
}
