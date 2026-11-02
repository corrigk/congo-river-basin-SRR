// SDR engine: a Design (every choice and slider) + the equipment catalog -> what the system delivers, what it costs
// year by year for 15 years, how much margin each requirement has, and a 0-1 score on each decision criterion.
//
// Performance comes from the SRR ConOps model (src/s3/conops/model.js: coverage, revisit, congestion, latency,
// availability); this file feeds it the chosen equipment and replaces its cost lines with a catalog-driven
// life-cycle cost (capex, recurring, replacements by year). Pure functions: the page, the optimizer worker and
// scripts/sdr-report.mjs all run the same code.
import { evaluate, ASSUME, LEO_SIZES } from '../s3/conops/model.js';
import { ELEMENTS, opt } from './catalog.js';

export const LIFE = 15;              // years, RFP life-cycle cost horizon
export const START_YEAR = 2027;      // program year 1
export const CAP_MUSD = 400;         // RFP S-3 life-cycle cost cap

export const DEFAULT_DESIGN = () => ({
  name: 'Baseline (SRR design)', notes: 'The SRR concept with catalog equipment.',
  year: 2041, mode: 'mix', n: 78, repeaters: 0, dbNodes: 4, leoSats: 24, raised: true, sparesPerPlane: 0, sensorScale: 1,
  discountPct: 0,
  pick: { leo: 'own6u', launch: 'dedicated', geo: 'hosted', receiver: 'r25', power: 'lfp', backhaul: 'starlink', db: 'colo', tower: 'lattice30', ops: 'standard' },
});

// Uncertain inputs as multipliers (1 = catalog value). The tornado, elasticity and Monte Carlo views vary these.
export const KNOBS = [
  { id: 'satCost', label: 'Satellite unit cost', lo: 0.7, hi: 1.5 },
  { id: 'launchCost', label: 'Launch price', lo: 0.9, hi: 1.4 },
  { id: 'nre', label: 'Gateways and integration', lo: 0.7, hi: 1.6 },
  { id: 'satLife', label: 'Satellite life', lo: 0.7, hi: 1.3 },
  { id: 'geoCost', label: 'GEO broadcast cost', lo: 0.8, hi: 1.5 },
  { id: 'receiverCost', label: 'Receiver unit cost', lo: 0.8, hi: 1.6 },
  { id: 'stationCost', label: 'Station build cost', lo: 0.7, hi: 1.6 },
  { id: 'logistics', label: 'Remote-site logistics', lo: 0.6, hi: 1.8 },
  { id: 'maint', label: 'Maintenance (% of capex a year)', lo: 0.6, hi: 1.6 },
  { id: 'opsCost', label: 'Staff cost', lo: 0.7, hi: 1.5 },
  { id: 'airtime', label: 'Commercial airtime price', lo: 0.6, hi: 2.0 },
  { id: 'kbps', label: 'Uplink capacity per satellite', lo: 0.5, hi: 1.5 },
  { id: 'wait', label: 'Satellite wait times', lo: 0.8, hi: 1.3 },
  { id: 'relay', label: 'Station relay reach', lo: 0.75, hi: 1.25 },
  { id: 'traffic', label: 'Sensor data per day', lo: 0.7, hi: 2.0 },
];

export const CRITERIA = [
  { id: 'cost', label: 'Cost', help: '15-year cost: $150M scores 1, $500M scores 0' },
  { id: 'coverage', label: 'Coverage', help: 'People within a station\'s reach (60% = full marks) and sensors on a fast path' },
  { id: 'speed', label: 'Speed', help: 'Priority message p95 and the share within 30 min' },
  { id: 'resilience', label: 'Resilience', help: 'Share of requirement checks still passing across five failure cases' },
  { id: 'margin', label: 'Margin', help: 'Headroom on the tightest requirement' },
  { id: 'risk', label: 'Risk', help: 'Maturity of the chosen equipment (flown, off the shelf = low risk)' },
  { id: 'schedule', label: 'Schedule', help: 'Years to first service: 1 year scores 1, 6 years scores 0' },
  { id: 'maint', label: 'Maintainability', help: 'Recurring cost per year and number of field sites to keep running' },
];
export const DEFAULT_WEIGHTS = { cost: 3, coverage: 3, speed: 2, resilience: 2, margin: 2, risk: 1, schedule: 1, maint: 1 };

export const FAIL_CASES = [['hub', 'Hub down'], ['leo', 'A LEO plane lost'], ['geo', 'GEO lost'], ['station', 'A station flooded'], ['grid', 'Grid and cell down']];

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const BEST = (D, k) => (k === 1 ? [D.db.recommended[0]] : D.db.best_by_count[String(k)].nodes);

// The page data with the chosen orbit's revisit row (or a commercial service's) relabelled as the 15° table the
// ConOps model reads, sensor traffic scaled. Memoized: the optimizer reuses a handful of variants.
const dCache = new Map();
function dataFor(D, leoOpt, launchOpt, k) {
  const p = leoOpt.perf, inc = p.kind === 'own' ? launchOpt.perf.inclination : p.inclination ?? null;
  const key = `${leoOpt.id}|${inc}|${k('wait')}|${k('traffic')}`;
  if (dCache.has(key)) return dCache.get(key);
  const w = k('wait');
  const scale = r => ({ ...r, inclination_deg: 15,
    open_sky_20deg: { ...r.open_sky_20deg, mean_wait_min: r.open_sky_20deg.mean_wait_min * w, p95_wait_min: r.open_sky_20deg.p95_wait_min * w, max_wait_min: r.open_sky_20deg.max_wait_min * w },
    under_canopy_45deg: { ...r.under_canopy_45deg, mean_wait_min: r.under_canopy_45deg.mean_wait_min * w, p95_wait_min: r.under_canopy_45deg.p95_wait_min * w, max_wait_min: r.under_canopy_45deg.max_wait_min * w } });
  let rows;
  if (p.continuous) {
    const c = p.continuous;
    rows = LEO_SIZES.map(s => scale({ satellites: s, planes: 6, open_sky_20deg: { mean_wait_min: c.mean, p95_wait_min: c.p95, max_wait_min: c.max, pct_time_in_contact: 100 },
      under_canopy_45deg: { mean_wait_min: c.canopyMean, p95_wait_min: c.canopyP95, max_wait_min: c.canopyP95 * 2, pct_time_in_contact: 60 } }));
  } else rows = D.leo.results.filter(r => r.inclination_deg === inc).map(scale);
  const t = k('traffic');
  const D2 = { ...D, leo: { ...D.leo, results: rows }, sn: { ...D.sn, types: D.sn.types.map(x => ({ ...x, bytes_per_day: x.bytes_per_day * t })) } };
  if (dCache.size > 64) dCache.clear();
  dCache.set(key, D2);
  return D2;
}

// Run fn with some ASSUME values swapped in, then put them back (the ConOps model reads ASSUME directly).
function withAssume(patch, fn) {
  const saved = {};
  for (const [path, v] of Object.entries(patch)) {
    const [a, b] = path.split('.');
    if (b) { saved[path] = ASSUME[a][b]; ASSUME[a][b] = v; } else { saved[path] = ASSUME[a]; ASSUME[a] = v; }
  }
  try { return fn(); } finally {
    for (const [path, v] of Object.entries(saved)) { const [a, b] = path.split('.'); if (b) ASSUME[a][b] = v; else ASSUME[a] = v; }
  }
}

// ---------- life-cycle cost, by year ----------
// A line: what it is, which segment, and its money by program year (index 1..15): initial buy, recurring, replacements.
function ledger(ioc) {
  const lines = [];
  const add = (k, name, seg, basis, range) => {
    const L = { k, name, seg, basis, range, capex: new Float64Array(LIFE + 1), opex: new Float64Array(LIFE + 1), repl: new Float64Array(LIFE + 1) };
    lines.push(L);
    return {
      // initial purchase spread over the build years (1..buildYr), then replaced every `life` years after service starts
      buy(usd, life = LIFE, buildYr = ioc) {
        const by = Math.max(1, Math.min(LIFE, buildYr));
        for (let y = 1; y <= by; y++) L.capex[y] += usd / by;
        if (life > 0) for (let y = by + life; y <= LIFE; y += life) L.repl[y] += usd;
        return this;
      },
      yearly(usd, from = ioc) { for (let y = Math.max(1, from); y <= LIFE; y++) L.opex[y] += usd; return this; },
      at(y, usd) { if (y >= 1 && y <= LIFE) L.repl[y] += usd; return this; },
    };
  };
  return { lines, add };
}
const sum = a => a.reduce((x, y) => x + y, 0);

export function evaluateDesign(ctx, design, { knobs = {}, fail = null, withFails = false } = {}) {
  const D0 = ctx.D, Y = ctx.Y[design.year];
  const k = id => knobs[id] ?? 1;
  const pick = id => opt(id, design.pick[id]);
  const P = Object.fromEntries(ELEMENTS.map(e => [e.id, pick(e.id)]));
  const leoO = P.leo, own = leoO.perf.kind === 'own', launchO = P.launch, geoO = P.geo;
  const D = dataFor(D0, leoO, launchO, k);
  const sats = own ? design.leoSats : leoO.perf.sats ?? 24;
  const counts = Object.fromEntries(D0.sn.types.map(t => [t.id, Math.round(t.baseline_count * (design.sensorScale ?? 1))]));
  const nodes = BEST(D0, design.dbNodes);
  const moduleUsd = own ? ASSUME.terminalUsd : leoO.perf.moduleUsd;
  const moduleLife = own ? ASSUME.terminalLifeYr : leoO.perf.moduleLifeYr;
  const nodeAvail = Math.min(0.9999, P.db.perf.nodeAvail + (P.ops.perf.nodeAvailBonus || 0));
  const spaceAvail = Math.min(leoO.perf.availSpace, geoO.perf.ok ? geoO.perf.availSpace : 1);

  const R = withAssume({
    leoKbpsPerSat: leoO.perf.kbpsPerSat * k('kbps'), terminalUsd: moduleUsd, terminalLifeYr: moduleLife,
    'relayKm.station': P.tower.perf.relayKm * k('relay'), 'avail.node': nodeAvail, 'avail.space': spaceAvail,
  }, () => evaluate(D, Y, {
    year: design.year, mode: design.mode, n: design.n, dbNodes: nodes, sensors: counts, repeaters: design.repeaters,
    leoSats: sats, geo: !!geoO.perf.ok, starlink: P.backhaul.id !== 'none', hydro: !!P.power.perf.hydro, raised: design.raised, fail,
  }));

  // ----- schedule: first service when the slowest element is ready -----
  const lead = { leo: leoO.leadYr, launch: own ? launchO.leadYr : 0, geo: geoO.leadYr, receiver: P.receiver.leadYr, power: P.power.leadYr, backhaul: P.backhaul.leadYr, db: P.db.leadYr, tower: P.tower.leadYr };
  const ioc = Math.max(1, ...Object.values(lead));
  const driver = Object.entries(lead).sort((a, b) => b[1] - a[1])[0][0];

  // ----- cost ledger -----
  const { lines, add } = ledger(ioc);
  const nSt = R.stations.length, terminals = R.terminals;
  if (own) {
    const planes = R.leo.row.planes || Math.max(1, Math.round(sats / 8));
    const total = sats + (design.sparesPerPlane || 0) * planes;
    const life = Math.max(2, Math.round(leoO.lifeYr * k('satLife')));
    add('sats', `${total} satellites (${leoO.name.replace(/^Own /, '')})`, 'Space', leoO.basis, leoO.range).buy(total * leoO.capexUsd * k('satCost'), life);
    const massPlane = (total / planes) * leoO.massKg;
    const perLaunch = launchO.perKgUsd
      ? launchO.capexUsd + Math.max(0, massPlane - 50) * launchO.perKgUsd
      : launchO.capexUsd * Math.max(1, Math.ceil(massPlane / (launchO.perf.capKg || 250)));
    add('launch', `Launch: ${planes} plane${planes > 1 ? 's' : ''}, ${launchO.name.split(',')[0].toLowerCase()}`, 'Space', launchO.basis, launchO.range).buy(planes * perLaunch * k('launchCost'), life);
    const nre = add('gateways', 'Gateways, integration and test', 'Space', 'srr', [0.7, 1.6]).buy(25e6 * k('nre'), 0);
    for (let y = ioc + life; y <= LIFE; y += life) nre.at(y, 8e6 * k('nre')); // re-integration per replenishment (estimate)
    add('satops', 'Satellite operations', 'Operations', 'srr', [0.8, 1.4]).yearly(3e6);
  } else {
    add('svcint', `Integration with ${leoO.name.replace('Commercial service: ', '')}`, 'Space', 'estimate', [0.6, 2]).buy(2e6, 0);
    add('airtime', `Airtime: ${terminals.toLocaleString('en-US')} devices`, 'Space', leoO.basis, leoO.range).yearly(terminals * leoO.perf.airtimeUsdMo * 12 * k('airtime'));
  }
  add('modules', `Sensor radio modules (${terminals.toLocaleString('en-US')})`, 'User', own ? 'srr' : leoO.basis, [0.7, 1.5]).buy(terminals * moduleUsd, moduleLife);
  if (geoO.perf.ok) add('geo', `GEO: ${geoO.name.toLowerCase()}`, 'Space', geoO.basis, geoO.range).buy(geoO.capexUsd * k('geoCost'), geoO.lifeYr).yearly(geoO.opexUsdYr);

  // Ranger stations from the SRR station items, with the chosen tower, power and backhaul.
  const C = D0.cost.station, items = Object.fromEntries(C.capex_items.map(x => [x.id, x.usd]));
  const common = sum(Object.entries(items).filter(([id]) => !['tower', 'solar', 'starlink'].includes(id)).map(([, v]) => v)) + P.tower.capexUsd + P.power.capexUsd;
  let stCapex = 0;
  const lm = t => 1 + (C.logistics_multiplier[t] - 1) * k('logistics');
  for (const s of R.stations) {
    let c = common + C.access_kit[s.type].usd;
    if (P.power.perf.hydro && s.type === 'river') c += C.hydro_option.hydro_capex_usd - (P.power.capexUsd - C.hydro_option.reduced_solar_capex_usd);
    stCapex += c * lm(s.type) * k('stationCost');
  }
  const st = add('stations', `Ranger stations (${nSt})`, 'Ground', 'srr', P.power.range).buy(stCapex, P.tower.lifeYr);
  st.yearly(stCapex * C.opex.maintenance_pct_of_capex_per_year * k('maint'));
  const riverN = R.stations.filter(s => s.type === 'river').length;
  // battery swaps: hydro river stations keep a smaller bank
  const hydroN = P.power.perf.hydro ? riverN : 0;
  for (const [count, usd] of [[nSt - hydroN, P.power.battUsd], [hydroN, C.hydro_option.battery_replacement_usd]])
    for (let y = ioc + P.power.battLifeYr; y <= LIFE; y += P.power.battLifeYr) st.at(y, count * usd);
  if (P.power.perf.hydro) st.yearly(riverN * C.hydro_option.extra_opex_usd_per_year);

  if (design.repeaters) add('repeaters', `Canopy repeaters (${design.repeaters})`, 'Ground', 'srr', [0.55, 1.7]).buy(design.repeaters * 10000 * k('stationCost'), 0).yearly(design.repeaters * 300);
  const dbN = nodes.length;
  add('db', `Hub + ${dbN - 1} regional node${dbN === 2 ? '' : 's'} (${P.db.name.split(':')[0].toLowerCase()})`, 'Ground', P.db.basis, P.db.range)
    .buy(0.4 * (P.db.hubUsd + (dbN - 1) * P.db.nodeUsd), 0).yearly((0.6 * (P.db.hubUsd + (dbN - 1) * P.db.nodeUsd)) / (LIFE - ioc + 1) + P.db.opexUsdYr * dbN / 4);
  if (P.backhaul.id !== 'none') add('backhaul', `Backhaul: ${P.backhaul.name} at ${nSt + dbN} sites`, 'Ground', P.backhaul.basis, P.backhaul.range)
    .buy((nSt + dbN) * P.backhaul.capexUsd, P.backhaul.lifeYr).yearly((nSt + dbN) * P.backhaul.opexUsdYr);
  if (geoO.perf.ok) add('receivers', `Community receivers (${Math.round(R.receivers / 1000)}k)`, 'User', P.receiver.basis, P.receiver.range)
    .buy(R.receivers * P.receiver.capexUsd * k('receiverCost') * (1 + P.receiver.perf.distribution), P.receiver.lifeYr);
  if (design.raised) {
    const nr = ASSUME.raised.types.reduce((a, t) => a + (counts[t] || 0), 0);
    add('antennas', `Raised antennas on fixed sensors (${nr.toLocaleString('en-US')})`, 'User', 'estimate', [0.6, 2]).buy(nr * ASSUME.raised.usd, 5);
  }
  add('staff', `Operations staff (${P.ops.fte} people)`, 'Operations', P.ops.basis, P.ops.range).yearly(P.ops.fte * P.ops.usdPerFteYr * k('opsCost'), 1);

  // ----- totals, by year, $M -----
  const r = (design.discountPct || 0) / 100;
  const perYear = Array.from({ length: LIFE }, (_, i) => {
    const y = i + 1, capex = sum(lines.map(l => l.capex[y])) / 1e6, opex = sum(lines.map(l => l.opex[y])) / 1e6, repl = sum(lines.map(l => l.repl[y])) / 1e6;
    return { y, cal: START_YEAR + i, capex, opex, repl, total: capex + opex + repl };
  });
  let cum = 0; for (const p of perYear) { cum += p.total; p.cum = cum; }
  const lineOut = lines.map(l => {
    const capex = sum(l.capex) / 1e6, opex = sum(l.opex) / 1e6, repl = sum(l.repl) / 1e6, base = capex + opex + repl;
    return { k: l.k, name: l.name, seg: l.seg, basis: l.basis, capex, opex, repl, base, low: base * l.range[0], high: base * l.range[1], byYear: Array.from({ length: LIFE }, (_, i) => (l.capex[i + 1] + l.opex[i + 1] + l.repl[i + 1]) / 1e6) };
  }).filter(l => l.base > 0);
  const total = { low: sum(lineOut.map(l => l.low)), base: sum(lineOut.map(l => l.base)), high: sum(lineOut.map(l => l.high)) };
  const npv = perYear.reduce((a, p) => a + p.total / (1 + r) ** (p.y - 1), 0);
  const capexTotal = sum(perYear.map(p => p.capex)), opexYr = sum(perYear.map(p => p.opex)) / Math.max(1, LIFE - ioc + 1);
  const lcc = r > 0 ? npv : total.base;

  // ----- requirement checks with the chosen equipment, and a margin on each -----
  const m = R.metrics, need = R.responderMbps, have = P.backhaul.perf.mbps * (nSt + dbN);
  const geoOk = !!geoO.perf.ok && fail !== 'geo';
  const ck = Object.fromEntries(R.checks.map(c => [c.id, { ...c }]));
  ck['S3-04'] = { id: 'S3-04', ok: moduleUsd <= 150 && moduleLife >= 1, v: `$${moduleUsd} module, ${moduleLife}-yr life`, obj: moduleUsd <= 50 && moduleLife >= 3 };
  ck['S3-07'] = { id: 'S3-07', ok: geoOk && P.receiver.capexUsd <= 25, v: geoOk ? `$${P.receiver.capexUsd} receiver, ${P.receiver.lifeYr}-yr life` : 'No broadcast to receive', obj: P.receiver.capexUsd <= 10 };
  ck['S3-08'] = { id: 'S3-08', ok: have >= need, near: have >= need / 2, v: `${need.toFixed(1)} Mbps needed; ${have >= 100 ? Math.round(have).toLocaleString('en-US') : have.toFixed(1)} Mbps of ${P.backhaul.name}` };
  ck.LCC = { id: 'LCC', ok: lcc <= CAP_MUSD, near: total.low <= CAP_MUSD, v: `$${Math.round(total.low)}–${Math.round(total.high)}M (base $${Math.round(total.base)}M${r ? `, NPV $${Math.round(npv)}M at ${design.discountPct}%` : ''}) vs $${CAP_MUSD}M cap` };
  const margin = {
    'S3-02': 1 - m.util, 'S3-03': (R.within30 - 0.95) / 0.95, 'S3-04': (150 - moduleUsd) / 150, 'S3-05': geoOk ? (10 - m.alertMin) / 10 : -1,
    'S3-07': geoOk ? (25 - P.receiver.capexUsd) / 25 : -1, 'S3-08': clamp((have - need) / need, -1, 1), 'S3-09': (360 - m.cmdWorst) / 360,
    'S3-10': (R.avail - 0.995) / 0.005 * 0.2, LCC: (CAP_MUSD - lcc) / CAP_MUSD,
  };
  for (const [id, v] of Object.entries(margin)) if (!Number.isFinite(v)) margin[id] = -1;
  const checks = Object.values(ck).map(c => ({ ...c, state: c.ok ? 'pass' : c.near ? 'near' : 'fail', margin: margin[c.id] ?? (c.ok ? 1 : -1) }));
  const compliant = checks.every(c => c.ok);
  const tight = checks.filter(c => c.id in margin).sort((a, b) => a.margin - b.margin)[0];

  // ----- criteria, 0..1 -----
  const riskAvg = (leoO.risk + (own ? launchO.risk : 1) + geoO.risk + P.receiver.risk + P.power.risk + P.backhaul.risk + P.db.risk + P.tower.risk + P.ops.risk) / 9;
  const riskMax = Math.max(leoO.risk, own ? launchO.risk : 1, geoO.risk, P.receiver.risk);
  const sites = nSt + design.repeaters;
  const criteria = {
    cost: clamp((500 - lcc) / 350),
    coverage: clamp(0.6 * (R.popPct / 60) + 0.4 * R.fastShare),
    speed: Number.isFinite(m.p95Fast) ? clamp(0.5 * clamp((45 - m.p95Fast) / 43) + 0.5 * R.within30) : 0,
    resilience: null,
    margin: clamp((Math.min(0.5, tight.margin) + 0.5)),
    risk: clamp(1 - ((riskAvg * 2 + riskMax) / 3 - 1) / 4),
    schedule: clamp((6 - ioc) / 5),
    maint: clamp(0.6 * (25 - opexYr) / 22 + 0.4 * (1 - sites / 450)),
  };

  const out = {
    design, R, P, own, sats, lines: lineOut, total, perYear, npv, lcc, capexTotal, opexYr, ioc, driver, lead, checks, compliant, tight, criteria,
    metrics: { ...m, popPct: R.popPct, within30: R.within30, avail: R.avail, terminals, receivers: R.receivers, stations: nSt, repeaters: design.repeaters, dbNodes: dbN, sats, backhaulMbps: have },
  };
  if (withFails) {
    const cases = FAIL_CASES.map(([f, label]) => {
      if (f === 'grid') return { f, label, pass: (out.checks.filter(c => c.id !== 'LCC' && c.ok).length) / (out.checks.length - 1), note: 'Stations and receivers run on their own power' };
      const x = evaluateDesign(ctx, design, { knobs, fail: f });
      const cs = x.checks.filter(c => c.id !== 'LCC');
      return { f, label, pass: cs.filter(c => c.ok).length / cs.length, failed: cs.filter(c => !c.ok).map(c => c.id) };
    });
    out.fails = cases;
    out.criteria.resilience = cases.reduce((a, c) => a + c.pass, 0) / cases.length;
  } else out.criteria.resilience = clamp((R.avail - 0.99) / 0.0099); // quick proxy until the failure cases are run
  return out;
}

export function loadCtx(D, years) { return { D, Y: years }; }
