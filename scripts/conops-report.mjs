// Runs the ConOps model (src/s3/conops/model.js) on the page data for the baseline design and the what-if
// variants, and prints the numbers used in docs/conops-model.md.   node scripts/conops-report.mjs
import fs from 'node:fs';
import { evaluate, sweetSpot, LEO_SIZES } from '../src/s3/conops/model.js';

const read = f => JSON.parse(fs.readFileSync(new URL(`../src/s3/v2/data/${f}`, import.meta.url), 'utf8'));
const D = read('core.json');
const years = [2026, 2031, 2036, 2041];
const Y = Object.fromEntries(years.map(y => [y, read(`stations-${y}.json`)]));

const base = {
  year: 2041, mode: 'mix', n: 78, dbNodes: D.db.recommended, sensors: {}, repeaters: 0,
  leoSats: 24, geo: true, starlink: true, hydro: false, fail: null,
};
const run = o => { const x = { ...base, ...o }; return evaluate(D, Y[x.year], x); };
const line = (label, r) => {
  const st = Object.fromEntries(r.checks.map(c => [c.id, c.state[0].toUpperCase()]));
  return `${label.padEnd(30)} cost $${Math.round(r.total.low)}-${Math.round(r.total.high)}M (base ${Math.round(r.total.base)})  pop ${r.popPct.toFixed(1)}%  S3-03 ${(r.within30 * 100).toFixed(0)}%  ` +
    Object.entries(st).map(([k, v]) => `${k.replace('S3-', '')}:${v}`).join(' ');
};

console.log('== Baseline (2041, mix, 78 stations, 4 nodes, 24 LEO, GEO, Starlink, no repeaters)');
const b = run({});
for (const l of b.lines) console.log(`  ${l.name.padEnd(40)} $${l.low.toFixed(1)} / ${l.base.toFixed(1)} / ${l.high.toFixed(1)}M`);
console.log(`  TOTAL ${b.total.low.toFixed(1)} / ${b.total.base.toFixed(1)} / ${b.total.high.toFixed(1)}M  (sensors, user agencies: $${b.sensorsUsd.toFixed(1)}M)`);
for (const c of b.checks) console.log(`  ${c.id.padEnd(6)} ${c.state.padEnd(5)} ${c.v}${c.obj === undefined ? '' : `  [objective: ${c.obj ? 'met' : 'not met'}]`}`);
console.log(`  terminals ${b.terminals} (priority-capable ${b.prioCount}), open-sky timing share ${(b.fastShare * 100).toFixed(1)}%, receivers ${b.receivers}`);

console.log('\n== Repeaters (canopy relays) vs S3-03');
for (const k of [0, 25, 50, 100, 150, 200, 300]) { const r = run({ repeaters: k }); console.log(line(`repeaters ${k}`, r)); }

console.log('\n== LEO constellation size');
for (const s of LEO_SIZES) console.log(line(`${s} satellites`, run({ leoSats: s, repeaters: 100 })));

console.log('\n== Database nodes');
for (let k = 1; k <= 4; k++) console.log(line(`${k} node(s): ${D.db.recommended.slice(0, k).join(', ')}`, run({ dbNodes: D.db.recommended.slice(0, k), repeaters: 100 })));

console.log('\n== Options');
console.log(line('no GEO payload', run({ geo: false, repeaters: 100 })));
console.log(line('no Starlink backhaul', run({ starlink: false, repeaters: 100 })));
console.log(line('hydro at river stations', run({ hydro: true, repeaters: 100 })));
console.log(line('raised antennas, 0 repeaters', run({ raised: true })));
console.log(line('raised antennas, 50 repeaters', run({ raised: true, repeaters: 50 })));
console.log(line('raised antennas, 100 repeaters', run({ raised: true, repeaters: 100 })));

console.log('\n== Failure cases (with 100 repeaters)');
for (const f of [null, 'hub', 'leo', 'geo', 'grid', 'station']) console.log(line(`fail: ${f || 'none'}`, run({ fail: f, repeaters: 100 })));
console.log(line('hub down, 1 node only', run({ fail: 'hub', dbNodes: D.db.recommended.slice(0, 1), repeaters: 100 })));

console.log('\n== Stations: sweet spot and cost by year (mix)');
for (const y of years) {
  const s = sweetSpot(Y[y].runs.mix);
  const lo = Y[y].runs.mix.stations[s.lo - 1], hi = Y[y].runs.mix.stations[s.hi - 1];
  console.log(`  ${y}: knee ${s.knee} (${s.kneePct}% people, $${s.kneeCost}M); range ${s.lo}-${s.hi} stations = ${lo.cum_pct}-${hi.cum_pct}% people, $${lo.cum_cost_musd}-${hi.cum_cost_musd}M`);
}
for (const n of [40, 60, 78, 100, 150, 200]) console.log(line(`${n} stations`, run({ n, repeaters: 100 })));

console.log('\n== Sensor objective (S3-02: 100,000 terminals x 50 kB)');
const big = Object.fromEntries(D.sn.types.map(t => [t.id, Math.round(t.baseline_count * 100000 / 12450)]));
console.log(line('100k terminals', run({ sensors: big, repeaters: 100 })));
console.log(line('100k terminals, 36 sats', run({ sensors: big, repeaters: 100, leoSats: 36 })));
