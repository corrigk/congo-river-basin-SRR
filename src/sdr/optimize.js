// Design-space search: random sampling over every choice and slider, then hill climbing from the best designs for
// each objective. Returns the cloud (every design evaluated, for the Pareto plot) and the winner per objective.
// Runs in a Web Worker on the page (worker.js) and in node (scripts/sdr-report.mjs --opt).
import { evaluateDesign, DEFAULT_WEIGHTS, CAP_MUSD } from './engine.js';
import { ELEMENTS } from './catalog.js';
import { weightedScore } from './decide.js';

export const OBJECTIVES = [
  { id: 'cheapest', label: 'Lowest 15-year cost that meets every requirement', short: 'Cheapest compliant' },
  { id: 'coverage', label: 'Most coverage for the budget', short: 'Most coverage' },
  { id: 'resilient', label: 'Most resilient design within the budget', short: 'Most resilient' },
  { id: 'margin', label: 'Widest margin on the tightest requirement, within the budget', short: 'Widest margin' },
  { id: 'score', label: 'Best team-weighted score', short: 'Best score' },
];

const NUM = {
  n: { min: 20, max: 200, step: 2 }, repeaters: { min: 0, max: 300, step: 10 },
  dbNodes: { vals: [1, 2, 3, 4] }, leoSats: { vals: [12, 18, 24, 36] }, raised: { vals: [false, true] }, sparesPerPlane: { vals: [0, 1] },
};

// Objective value (higher is better). Designs that break the constraint sort below every design that keeps it.
export function objective(id, r, { budget = CAP_MUSD, weights = DEFAULT_WEIGHTS, penalty = 0.6 } = {}) {
  const over = Math.max(0, r.lcc - budget);
  switch (id) {
    case 'cheapest': return r.compliant ? -r.lcc : -1e4 - r.checks.filter(c => !c.ok).length * 1e3 - r.lcc;
    case 'coverage': return over ? -1e4 - over : r.R.popPct + 10 * r.R.fastShare + (r.compliant ? 20 : 0);
    case 'resilient': return over ? -1e4 - over : (r.criteria.resilience ?? 0) * 100 + (r.compliant ? 1000 : 0) - r.lcc / 1000;
    case 'margin': return over ? -1e4 - over : Math.min(0.5, r.tight.margin) * 100 + (r.compliant ? 1000 : 0) - r.lcc / 1000;
    default: return weightedScore(r, weights, penalty);
  }
}

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function randomDesign(base, rnd, nMax) {
  const d = structuredClone(base);
  d.n = Math.min(nMax, NUM.n.min + NUM.n.step * Math.floor(rnd() * ((NUM.n.max - NUM.n.min) / NUM.n.step + 1)));
  d.repeaters = NUM.repeaters.step * Math.floor(rnd() * (NUM.repeaters.max / NUM.repeaters.step + 1));
  for (const k of ['dbNodes', 'leoSats', 'raised', 'sparesPerPlane']) d[k] = NUM[k].vals[Math.floor(rnd() * NUM[k].vals.length)];
  for (const e of ELEMENTS) d.pick[e.id] = e.options[Math.floor(rnd() * e.options.length)].id;
  return d;
}
function neighbour(d0, rnd, nMax) {
  const d = structuredClone(d0), keys = ['n', 'repeaters', 'dbNodes', 'leoSats', 'raised', 'sparesPerPlane', ...ELEMENTS.map(e => `pick.${e.id}`)];
  const key = keys[Math.floor(rnd() * keys.length)];
  if (key.startsWith('pick.')) { const e = ELEMENTS.find(x => x.id === key.slice(5)); d.pick[e.id] = e.options[Math.floor(rnd() * e.options.length)].id; }
  else if (NUM[key].vals) d[key] = NUM[key].vals[Math.floor(rnd() * NUM[key].vals.length)];
  else { const s = NUM[key], jump = (1 + Math.floor(rnd() * 6)) * s.step * (rnd() < 0.5 ? -1 : 1); d[key] = Math.max(s.min, Math.min(key === 'n' ? nMax : s.max, d[key] + jump)); }
  return d;
}
const keyOf = d => JSON.stringify([d.n, d.repeaters, d.dbNodes, d.leoSats, d.raised, d.sparesPerPlane, d.pick]);

// A compact row for the cloud.
const point = (r, o) => ({
  d: r.design, lcc: r.lcc, low: r.total.low, high: r.total.high, pop: r.R.popPct, p95: r.metrics.p95Fast, w30: r.R.within30, util: r.metrics.util,
  compliant: r.compliant, fails: r.checks.filter(c => !c.ok).map(c => c.id), margin: r.tight.margin, tight: r.tight.id, crit: r.criteria,
  score: weightedScore(r, o.weights, o.penalty), ioc: r.ioc,
});

export function optimize(ctx, base, o = {}) {
  const opts = { samples: 1200, climbs: 4, steps: 90, budget: CAP_MUSD, weights: DEFAULT_WEIGHTS, penalty: 0.6, seed: 11, onProgress: null, ...o };
  const rnd = rng(opts.seed), nMax = Math.min(NUM.n.max, ctx.Y[base.year].runs[base.mode].stations.length);
  const seen = new Map(), cloud = [];
  const ev = (d, withFails = false) => {
    const key = keyOf(d) + (withFails ? 'F' : '');
    if (seen.has(key)) return seen.get(key);
    const r = evaluateDesign(ctx, d, { withFails });
    seen.set(key, r);
    if (!withFails) cloud.push(point(r, opts));
    return r;
  };
  const total = opts.samples + OBJECTIVES.length * opts.climbs * opts.steps;
  let done = 0;
  const tick = () => { done++; if (opts.onProgress && done % 50 === 0) opts.onProgress(done / total); };

  const starts = [base, ...Array.from({ length: opts.samples - 1 }, () => randomDesign(base, rnd, nMax))];
  const pool = starts.map(d => { tick(); return ev(d); });

  const best = {};
  for (const ob of OBJECTIVES) {
    const fails = ob.id === 'resilient';
    const f = r => objective(ob.id, r, opts);
    const seeds = [...pool].sort((a, b) => f(b) - f(a)).slice(0, opts.climbs).map(r => (fails ? ev(r.design, true) : r));
    let winner = seeds[0];
    for (let s of seeds) {
      for (let i = 0; i < opts.steps; i++) {
        tick();
        const c = ev(neighbour(s.design, rnd, nMax), fails);
        if (f(c) > f(s)) s = c;
      }
      if (f(s) > f(winner)) winner = s;
    }
    const full = ev(winner.design, true);
    best[ob.id] = { r: full, point: point(full, opts), value: f(full) };
  }
  return { cloud, best, evaluated: seen.size, frontier: frontier(cloud, p => p.lcc, p => p.pop) };
}

// Pareto frontier in two dimensions: lowest x for the highest y (designs no other design beats on both).
export function frontier(pts, x, y, filter = () => true) {
  const s = pts.filter(filter).sort((a, b) => x(a) - x(b) || y(b) - y(a));
  const out = []; let bestY = -Infinity;
  for (const p of s) if (y(p) > bestY + 1e-9) { out.push(p); bestY = y(p); }
  return out;
}
