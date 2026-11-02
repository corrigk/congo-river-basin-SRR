// Sensitivity: which uncertain inputs move the answer, and how confident the design is.
//   tornado:     each knob to its low and high value, the others at 1: change in cost, p95 latency and score
//   elasticity:  % change in each outcome per % change in each lever (design levers and uncertain inputs)
//   monteCarlo:  every knob drawn from a triangular distribution (low, 1, high) together: the spread of cost,
//                the probability of staying under the cap and of passing each requirement, cost by year as a band
import { evaluateDesign, KNOBS, CAP_MUSD, LIFE } from './engine.js';
import { weightedScore } from './decide.js';
import { LEO_SIZES } from '../s3/conops/model.js';

export const OUTCOMES = [
  { id: 'lcc', label: '15-yr cost', get: r => r.lcc, unit: '$M', good: 'low' },
  { id: 'capex', label: 'Setup cost', get: r => r.capexTotal, unit: '$M', good: 'low' },
  { id: 'opex', label: 'Running cost / yr', get: r => r.opexYr, unit: '$M', good: 'low' },
  { id: 'p95', label: 'Priority p95', get: r => r.metrics.p95Fast, unit: 'min', good: 'low' },
  { id: 'w30', label: 'Within 30 min', get: r => r.R.within30 * 100, unit: '%', good: 'high' },
  { id: 'util', label: 'Uplink use', get: r => r.metrics.util * 100, unit: '%', good: 'low' },
  { id: 'pop', label: 'People in reach', get: r => r.R.popPct, unit: '%', good: 'high' },
  { id: 'avail', label: 'Availability', get: r => r.R.avail * 100, unit: '%', good: 'high' },
];

export function tornado(ctx, design, weights, penalty) {
  const base = evaluateDesign(ctx, design);
  const b = { lcc: base.lcc, p95: base.metrics.p95Fast, score: weightedScore(base, weights, penalty) };
  const rows = KNOBS.map(k => {
    const lo = evaluateDesign(ctx, design, { knobs: { [k.id]: k.lo } }), hi = evaluateDesign(ctx, design, { knobs: { [k.id]: k.hi } });
    const f = r => ({ lcc: r.lcc, p95: r.metrics.p95Fast, score: weightedScore(r, weights, penalty), compliant: r.compliant });
    return { k, lo: f(lo), hi: f(hi) };
  });
  return { base: b, rows };
}

const LEVERS = [
  { id: 'n', label: 'Stations', set: (d, f) => ({ ...d, n: Math.max(2, Math.round(d.n * f)) }), x: d => d.n },
  { id: 'repeaters', label: 'Repeaters', set: (d, f) => ({ ...d, repeaters: d.repeaters ? Math.round(d.repeaters * f) : 10 }), x: d => d.repeaters || 0.0001 },
  { id: 'leoSats', label: 'Satellites', set: d => ({ ...d, leoSats: LEO_SIZES[Math.min(LEO_SIZES.length - 1, LEO_SIZES.indexOf(d.leoSats) + 1)] }), x: d => d.leoSats },
  { id: 'dbNodes', label: 'Database nodes', set: d => ({ ...d, dbNodes: Math.min(4, d.dbNodes + 1) }), x: d => d.dbNodes },
  { id: 'sensorScale', label: 'Sensors', set: (d, f) => ({ ...d, sensorScale: (d.sensorScale ?? 1) * f }), x: d => d.sensorScale ?? 1 },
];

export function elasticity(ctx, design, step = 1.1) {
  const base = evaluateDesign(ctx, design);
  const rows = [];
  for (const L of LEVERS) {
    const d2 = L.set(design, step), dx = L.x(d2) / L.x(design) - 1;
    if (Math.abs(dx) < 1e-9) { rows.push({ id: L.id, label: L.label, kind: 'lever', e: OUTCOMES.map(() => null), dx }); continue; }
    const r = evaluateDesign(ctx, d2);
    rows.push({ id: L.id, label: L.label, kind: 'lever', dx, e: OUTCOMES.map(o => ratio(o.get(r), o.get(base), dx)) });
  }
  for (const k of KNOBS) {
    const r = evaluateDesign(ctx, design, { knobs: { [k.id]: step } });
    rows.push({ id: k.id, label: k.label, kind: 'input', dx: step - 1, e: OUTCOMES.map(o => ratio(o.get(r), o.get(base), step - 1)) });
  }
  return { rows, outcomes: OUTCOMES };
}
const ratio = (y, y0, dx) => (Number.isFinite(y) && Number.isFinite(y0) && Math.abs(y0) > 1e-9 ? (y / y0 - 1) / dx : null);

function tri(rnd, a, c, b) { const u = rnd(), f = (c - a) / (b - a); return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); }

export function monteCarlo(ctx, design, { n = 600, seed = 3, onProgress } = {}) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lcc = [], p95 = [], pass = {}, years = Array.from({ length: LIFE }, () => []);
  let compliant = 0, under = 0;
  for (let i = 0; i < n; i++) {
    const knobs = Object.fromEntries(KNOBS.map(k => [k.id, tri(rnd, k.lo, 1, k.hi)]));
    const r = evaluateDesign(ctx, design, { knobs });
    lcc.push(r.lcc); p95.push(r.metrics.p95Fast);
    if (r.compliant) compliant++;
    if (r.lcc <= CAP_MUSD) under++;
    for (const c of r.checks) pass[c.id] = (pass[c.id] || 0) + (c.ok ? 1 : 0);
    r.perYear.forEach((p, y) => years[y].push(p.cum));
    if (onProgress && i % 40 === 0) onProgress(i / n);
  }
  const q = (a, p) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]; };
  return {
    n, lcc, p95,
    pUnderCap: under / n, pCompliant: compliant / n,
    pass: Object.fromEntries(Object.entries(pass).map(([k, v]) => [k, v / n])),
    stats: { p10: q(lcc, 0.1), p50: q(lcc, 0.5), p90: q(lcc, 0.9), mean: lcc.reduce((a, b) => a + b, 0) / n },
    band: years.map(a => ({ p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9) })),
  };
}
