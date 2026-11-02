// Runs the SDR engine (src/sdr/engine.js) on the page data: the baseline design, each catalog option swapped in
// one at a time, and the optimizer's best designs.   node scripts/sdr-report.mjs [--opt]
import fs from 'node:fs';
import { evaluateDesign, DEFAULT_DESIGN } from '../src/sdr/engine.js';
import { ELEMENTS } from '../src/sdr/catalog.js';
import { optimize, OBJECTIVES } from '../src/sdr/optimize.js';
import { weightedScore } from '../src/sdr/decide.js';

const read = f => JSON.parse(fs.readFileSync(new URL(`../src/s3/v2/data/${f}`, import.meta.url), 'utf8'));
const ctx = { D: read('core.json'), Y: { 2041: read('stations-2041.json') } };
const st = r => r.checks.map(c => `${c.id.replace('S3-', '')}:${c.state[0].toUpperCase()}`).join(' ');
const line = (label, r) => `${label.padEnd(44)} $${Math.round(r.total.base)}M (${Math.round(r.total.low)}-${Math.round(r.total.high)})  IOC yr ${r.ioc}  p95 ${r.metrics.p95Fast.toFixed(1)}m  ${st(r)}`;

const base = DEFAULT_DESIGN();
const b = evaluateDesign(ctx, base, { withFails: true });
console.log('== Baseline');
for (const l of b.lines) console.log(`  ${l.name.padEnd(58)} capex ${l.capex.toFixed(1).padStart(6)}  recurring ${l.opex.toFixed(1).padStart(6)}  replace ${l.repl.toFixed(1).padStart(6)}  = $${l.base.toFixed(1)}M`);
console.log(`  TOTAL $${b.total.base.toFixed(1)}M (${b.total.low.toFixed(0)}-${b.total.high.toFixed(0)}), first service year ${b.ioc} (${b.driver})`);
console.log('  by year', b.perYear.map(p => p.total.toFixed(0)).join(' '));
for (const c of b.checks) console.log(`  ${c.id.padEnd(6)} ${c.state.padEnd(5)} margin ${(c.margin * 100).toFixed(0).padStart(4)}%  ${c.v}`);
console.log('  criteria', Object.entries(b.criteria).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  '), ' score', weightedScore(b).toFixed(3));
const X = b.phys;
console.log(`  physics: uplink margin ${X.uplink.margin.toFixed(1)} dB, canopy closes ${X.uplink.closeEl}° (${X.uplink.canopyClass}), ${X.kbps.toFixed(1)} kbps/sat; relay ${X.relay.km.toFixed(1)} km; GEO margin ${X.geo.margin.toFixed(1)} dB; feeder ${(X.rain.feederAvail * 100).toFixed(2)}%; power ${X.power.pvKwp.toFixed(2)} kWp ${X.power.battKwh.toFixed(1)} kWh $${Math.round(X.power.capexUsd)}`);
console.log('  fails', b.fails.map(f => `${f.f} ${(f.pass * 100).toFixed(0)}% ${f.failed?.join(',') || ''}`).join(' | '));

console.log('\n== One option at a time');
for (const e of ELEMENTS) for (const o of e.options) {
  if (o.id === base.pick[e.id]) continue;
  console.log(line(`${e.id}: ${o.id}`, evaluateDesign(ctx, { ...base, pick: { ...base.pick, [e.id]: o.id } })));
}

if (process.argv.includes('--opt')) {
  console.log('\n== Optimizer');
  const t = Date.now();
  const res = optimize(ctx, base, { samples: 1500, budget: 400 });
  console.log(`  ${res.evaluated} designs in ${((Date.now() - t) / 1000).toFixed(1)} s, frontier ${res.frontier.length}`);
  for (const o of OBJECTIVES) { const w = res.best[o.id]; console.log(line(`${o.id}`, w.r), JSON.stringify({ ...w.r.design.pick, n: w.r.design.n, rep: w.r.design.repeaters, sats: w.r.design.leoSats, db: w.r.design.dbNodes, raised: w.r.design.raised })); }
}
