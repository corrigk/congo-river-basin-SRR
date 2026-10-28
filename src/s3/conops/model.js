// ConOps model: what a design delivers (coverage, latency, capacity, availability, cost) for the sliders on the
// ConOps tab, checked against the S-3 Level 0 requirements. Pure functions over the page data, so the page and
// scripts/conops-report.mjs (which writes the numbers in docs/conops-model.md) use the same formulas.
//
// Every constant in ASSUME is a planning assumption (labelled on the page); requirement values come from the RFP.

export const ASSUME = {
  relayKm: { station: 20, repeater: 10 },          // canopy-top relay reach to sensors (station_relay: "about 15-25 km")
  radioKm: 25,                                       // VHF from a 30 m tower to handhelds (cost_model.radio)
  // Share of each sensor type that sits under closed canopy (low-angle satellite paths blocked).
  canopy: { gauge: 0, water_q: 0, fire: 0.2, rain: 0.5, tag: 1, camera: 1, acoustic: 1, ranger: 0.5 },
  // S3-03 covers PRIORITY messages. Wildlife tags (<= 25 g) send routine position fixes, so they are left out.
  priority: ['gauge', 'rain', 'fire', 'acoustic', 'camera', 'water_q', 'ranger'],
  // Raised antenna (small mast or tree mount above the canopy) on fixed sensors: their link then sees open sky.
  // Antennas are in S-3's design scope (RFP constraint).
  raised: { types: ['rain', 'fire', 'acoustic', 'camera'], usd: 40 },
  // Function-block latencies for S3-03 outside the satellite wait (proposed allocation, TBR): sensor forms the
  // message (F1) and ground processing to the COP (F3).
  s303FixedMin: { threshold: 2 + 10, objective: 0.5 + 2 },
  // S3-05: authorize + GEO broadcast + receiver playback, minutes (L2-2.1.2 <= 5 min broadcast, L2-2.3.1 <= 60 s playback).
  s305GeoMin: 2 + 0.5 + 1,
  // IoT payload uplink, aggregate per satellite: low-power direct-to-satellite access (LoRa / Argos class) shares a
  // narrow channel among every terminal in the footprint.
  leoKbpsPerSat: 20,
  // Congestion (illustrative): queueing delay = average wait for a pass x u / (1 - u), u = daily traffic / capacity.
  // Priority messages jump the queue and see half of it. At u >= 1 the network is saturated.
  congestion: { priorityShare: 0.5 },
  starlinkMbpsPerSite: 50,
  responderKbps: 4.8,
  terminalUsd: 60, terminalLifeYr: 3,                // S-3 radio module in each sensor (S3-04: <= $150, >= 1 yr)
  // LEO: about $40M fixed per generation (gateways, integration) + $2.5M per satellite incl. launch share;
  // 15-year cost = 1 generation + 2 replenishments at 60% + $3M/yr operations. 24 sats -> $265M (comms_options).
  leo: { fixedMusd: 40, perSatMusd: 2.5, replenish: 1.2, opsMusdYr: 3, range: [0.8, 1.35] },
  geo: { musd: 80, range: [65, 120] },
  repeater: { musd15: 0.0145, range: [0.008, 0.025] }, // solar 15 m mast, relay radio, LEO uplink, battery swap
  // Database nodes are racks colocated in existing data centres (siting rules: cities with power and fibre), not new
  // buildings: hardware with two refreshes, colocation fees, links. Staff are set aside, as elsewhere.
  db: { hubMusd: 2.5, hubRange: [1.5, 4], nodeMusd: 1.0, nodeRange: [0.6, 2] },
  receiver: { high: 1.3 },                           // distribution and installation on top of the unit price
  // Availability building blocks (illustrative): space segment with spares, rain fade at L/UHF band, one ground node.
  avail: { space: 0.999, rain: 0.999, node: 0.99 },
  life: 15,
};

const R = 6371;
const rad = d => (d * Math.PI) / 180;
const kmBetween = (a, b) => { // equirectangular: plenty accurate at < 50 km
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2)), y = rad(b[1] - a[1]);
  return Math.hypot(x, y) * R;
};

// LEO revisit (analysis/leo_revisit.py) for the 15 deg constellations, by number of satellites.
export function leoRow(D, sats) {
  const rows = D.leo.results.filter(r => r.inclination_deg === 15);
  return rows.find(r => r.satellites === sats) || rows.reduce((a, b) => (Math.abs(b.satellites - sats) < Math.abs(a.satellites - sats) ? b : a));
}
export const LEO_SIZES = [12, 18, 24, 36];

// Weighted canopy sensor points (from each type's sample locations), with neighbour lists for repeater siting.
let canopyCache = null;
function canopyPoints(D, counts) {
  if (!canopyCache) {
    const pts = [];
    for (const t of D.sn.types) {
      const c = ASSUME.canopy[t.id] ?? 0.5, s = t.sample_points || [];
      if (!c || !s.length) continue;
      for (const [lat, lon] of s) pts.push({ t: t.id, ll: [lon, lat], c, per: 1 / s.length });
    }
    const cell = 0.1, buckets = new Map(), key = (x, y) => `${x},${y}`;
    pts.forEach((p, i) => { const k = key(Math.floor(p.ll[0] / cell), Math.floor(p.ll[1] / cell)); (buckets.get(k) || buckets.set(k, []).get(k)).push(i); });
    for (const p of pts) {
      const bx = Math.floor(p.ll[0] / cell), by = Math.floor(p.ll[1] / cell);
      p.nb = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        for (const j of buckets.get(key(bx + dx, by + dy)) || []) if (kmBetween(p.ll, pts[j].ll) <= ASSUME.relayKm.repeater) p.nb.push(j);
    }
    canopyCache = pts;
  }
  // Weight = how many real sensors this sample point stands for, times the share under canopy.
  return canopyCache.map(p => ({ ...p, w: (counts[p.t] ?? 0) * p.per * p.c }));
}

// Repeaters go where they reach the most canopy sensors not already within a station's relay reach (greedy).
export function siteRepeaters(D, stations, counts, k) {
  const pts = canopyPoints(D, counts);
  const covered = pts.map(p => stations.some(s => kmBetween(p.ll, [s.lon, s.lat]) <= ASSUME.relayKm.station));
  const out = [];
  for (let r = 0; r < k; r++) {
    let best = -1, gain = 0;
    for (let i = 0; i < pts.length; i++) {
      if (covered[i]) continue;
      let g = 0;
      for (const j of pts[i].nb) if (!covered[j]) g += pts[j].w;
      if (g > gain) { gain = g; best = i; }
    }
    if (best < 0) break;
    for (const j of pts[best].nb) covered[j] = true;
    out.push({ lon: pts[best].ll[0], lat: pts[best].ll[1], gain });
  }
  // Share of each type's canopy sensors within relay reach.
  const reach = {};
  for (const t of D.sn.types) {
    const mine = pts.map((p, i) => [p, covered[i]]).filter(([p]) => p.t === t.id);
    const tot = mine.reduce((a, [p]) => a + p.per, 0);
    reach[t.id] = tot ? mine.reduce((a, [p, c]) => a + (c ? p.per : 0), 0) / tot : 1;
  }
  // Per sample point: within a station's or repeater's relay reach (the map draws the ones that are not).
  const points = pts.map((p, i) => ({ t: p.t, ll: p.ll, covered: covered[i] }));
  return { repeaters: out, reach, points };
}

// What the basin has today, with no S-3. The first block is the RFP's own figures (content.js GAP, Central and West
// Africa); the town-reach layer is a MODELED PROXY (reach radius by town size) until real tower data is added.
export const TODAY = {
  gaugesLive: [13, 15], gaugesHistoric: 400,       // river stations still operating, of 400+ before 1960, few in real time
  syncDays: [3, 7],                                // sensors and ranger devices sync only after 3-7 days
  noWarningPct: 62,                                // of people in Central and West Africa who lived through a disaster
  internetPct: [27, 32],                           // people the internet reaches
  bulletinMin: 24 * 60,                            // flood bulletins go out by email once a day
};

// Which grid cells an existing town network reaches (proxy): flags per cell, and the shares of people and land.
export function todayReach(grid, cellLL, towns) {
  const flags = new Uint8Array(grid.i.length);
  for (let k = 0; k < flags.length; k++) {
    const [lon, lat] = cellLL[k], cosl = Math.cos((lat * Math.PI) / 180);
    for (const t of towns) {
      const dy = (lat - t.lat) * 110.57; if (Math.abs(dy) > t.r) continue;
      const dx = (lon - t.lon) * 111.32 * cosl; if (Math.hypot(dx, dy) <= t.r) { flags[k] = 1; break; }
    }
  }
  const share = (pop) => { let tot = 0, rea = 0, area = 0, atot = 0; for (let k = 0; k < flags.length; k++) { tot += pop[k]; atot += grid.km2[k]; if (flags[k]) { rea += pop[k]; area += grid.km2[k]; } } return { peoplePct: (100 * rea) / tot, areaPct: (100 * area) / atot, people: rea, total: tot }; };
  return { flags, share };
}

// Today vs the current design: each row has what the basin has today, what the design delivers, and by how much.
// kind: 'sourced' (RFP figure), 'proxy' (modeled proxy), 'model' (this model, an assumption set).
export function compareToday(R, today, gaugeCount) {
  const m = R.metrics, d = TODAY, sync = d.syncDays.map(x => x * 1440);
  const alert = R.geoUp ? 100 : today.peoplePct; // with the GEO payload every community has a receiver in reach
  return [
    { k: 'people', label: 'People who can be warned', today: `${today.peoplePct.toFixed(0)}%`, now: `${alert.toFixed(0)}%`, change: alert - today.peoplePct, unit: 'points', good: 'high',
      extra: `${((alert - today.peoplePct) / 100 * today.total / 1e6).toFixed(0)}M more people`, kind: 'proxy', note: 'Today: reach of the towns and cities we hold (modeled proxy). S-3: GEO broadcast to a $25 receiver in every community.' },
    { k: 'area', label: 'Land an alert can reach', today: `${today.areaPct.toFixed(1)}%`, now: `${alert.toFixed(0)}%`, factor: alert / today.areaPct, good: 'high', kind: 'proxy', note: 'Share of the basin\'s 3.7M km².' },
    { k: 'warned', label: 'Got a warning in a disaster', today: `${100 - d.noWarningPct}%`, now: R.geoUp && m.alertMin <= 10 ? '≥95% in ≤10 min' : 'no alert path', change: R.geoUp ? 95 - (100 - d.noWarningPct) : null, unit: 'points', good: 'high', kind: 'sourced', note: 'Today: 62% of people in Central and West Africa who lived through a disaster got none (RFP). S-3: requirement S3-05.' },
    { k: 'delay', label: 'Field data reaches decision makers', today: `${d.syncDays[0]}–${d.syncDays[1]} days`, now: `${m.p95Fast.toFixed(0)} min`, factorRange: [sync[0] / m.p95Fast, sync[1] / m.p95Fast], good: 'low', kind: 'sourced', note: 'Today: sensors and ranger devices sync only after 3–7 days (RFP). S-3: priority message, 95th percentile.' },
    { k: 'bulletin', label: 'Alert to audible', today: 'a daily email', now: `${m.alertMin.toFixed(1)} min`, factor: d.bulletinMin / m.alertMin, good: 'low', kind: 'sourced', note: 'Today: flood bulletins go out by email once a day (RFP). S-3: authorized alert to a spoken alert.' },
    { k: 'gauges', label: 'River gauges reporting', today: `${d.gaugesLive[0]}–${d.gaugesLive[1]} of ${d.gaugesHistoric}+`, now: `${gaugeCount}`, factor: gaugeCount / ((d.gaugesLive[0] + d.gaugesLive[1]) / 2), good: 'high', kind: 'sourced', note: 'Today: stations still operating, few in real time (RFP). S-3: gauges set on the Sensors slider (site count is a modeled proxy).' },
    { k: 'resilient', label: 'Works with towers and grid down', today: 'no', now: R.checks.find(c => c.id === 'S3-10').state === 'fail' ? 'no' : `yes, ${(R.avail * 100).toFixed(1)}%`, good: 'high', kind: 'model', note: 'Today: floods and conflict take down towers and the grid (RFP). S-3: stations on solar, receivers on solar or crank (availability is illustrative).' },
  ];
}

const lccLeo = sats => ASSUME.leo.fixedMusd + ASSUME.leo.perSatMusd * sats;
const range3 = (base, [lo, hi]) => ({ low: base * lo, base, high: base * hi });

// opts: { year, mode, n, dbNodes[], sensors{type: count}, repeaters, leoSats, geo, starlink, hydro, fail }
// yearData: stations-<year>.json (the station order for each coverage mode, and the hydro option's cost).
export function evaluate(D, yearData, opts) {
  const A = ASSUME, fail = opts.fail || null, run = yearData.runs[opts.mode];
  const stationsAll = run.stations.slice(0, opts.n);
  const stations = fail === 'station' ? stationsAll.filter((s, i) => i !== stationsAll.findIndex(x => x.type === 'river')) : stationsAll;
  const counts = Object.fromEntries(D.sn.types.map(t => [t.id, opts.sensors?.[t.id] ?? t.baseline_count]));
  const k = opts.dbNodes.length;
  const hubDown = fail === 'hub', nodesUp = k - (hubDown ? 1 : 0);
  const sats = fail === 'leo' ? LEO_SIZES[Math.max(0, LEO_SIZES.indexOf(opts.leoSats) - 1)] : opts.leoSats;
  const leo = leoRow(D, sats);
  const geoUp = opts.geo && fail !== 'geo';
  const needRelay = opts.raised ? Object.fromEntries(Object.entries(counts).map(([t, c]) => [t, A.raised.types.includes(t) ? 0 : c])) : counts;
  const { repeaters, reach, points } = siteRepeaters(D, stations, needRelay, opts.repeaters);

  // ----- coverage -----
  const n = stations.length, last = n ? run.stations[opts.n - 1] : null;
  const lost = fail === 'station' ? stationsAll.find(x => x.type === 'river') : null;
  const popPct = last ? last.cum_pct - (lost ? (lost.gain / run.basin_pop) * 100 : 0) : 0;
  const terminals = Object.values(counts).reduce((a, b) => a + b, 0);
  const canopyShare = t => (opts.raised && A.raised.types.includes(t) ? 0 : A.canopy[t] ?? 0.5);
  // Share of priority-capable terminals whose messages see open-sky timing: in the open, raised antenna, or within relay reach.
  const prio = D.sn.types.filter(t => A.priority.includes(t.id));
  const prioCount = prio.reduce((a, t) => a + counts[t.id], 0);
  const fastOf = t => (1 - canopyShare(t.id)) + canopyShare(t.id) * (t.id === 'ranger' ? (n ? 1 : 0) : reach[t.id]);
  const fastShare = prio.reduce((a, t) => a + counts[t.id] * fastOf(t), 0) / Math.max(1, prioCount);
  const fastShareAll = D.sn.types.reduce((a, t) => a + counts[t.id] * fastOf(t), 0) / Math.max(1, terminals);

  // ----- capacity and congestion -----
  const bytesDay = D.sn.types.reduce((a, t) => a + counts[t.id] * t.bytes_per_day, 0);
  const byType = D.sn.types.map(t => ({ id: t.id, name: t.name, count: counts[t.id], bytes: counts[t.id] * t.bytes_per_day }));
  const leoBytesDay = (A.leoKbpsPerSat * 1000 / 8) * 86400 * (leo.open_sky_20deg.pct_time_in_contact / 100); // about one satellite footprint spans the basin
  const util = bytesDay / Math.max(1, leoBytesDay);
  const saturated = util >= 1;
  const qFactor = saturated ? Infinity : util / (1 - util);
  const qRoutine = leo.open_sky_20deg.mean_wait_min * qFactor;
  const qPrio = qRoutine * A.congestion.priorityShare;

  // ----- latency -----
  const ground = nodesUp > 0; // with no database node up, nothing reaches the COP
  const p95 = (fixed, sky) => (ground ? fixed + leo[sky].p95_wait_min + qPrio : Infinity);
  const s303 = {
    open: p95(A.s303FixedMin.threshold, 'open_sky_20deg'), canopy: p95(A.s303FixedMin.threshold, 'under_canopy_45deg'),
    openObj: p95(A.s303FixedMin.objective, 'open_sky_20deg'),
  };
  // Share of priority messages within 30 min: open-sky-timed terminals pass if the open path does; the rest need the canopy path.
  const within30 = (s303.open <= 30 ? fastShare : 0) + (s303.canopy <= 30 ? 1 - fastShare : 0);
  const within5 = s303.openObj <= 5 ? fastShare : 0;
  const s305 = geoUp && ground ? A.s305GeoMin : Infinity;
  const s309 = ground ? leo.under_canopy_45deg.max_wait_min + A.s303FixedMin.threshold + qPrio : Infinity; // worst-case command to a canopy terminal
  // Average time for a routine message to reach the COP, all terminals: fast path (open sky or relayed) or canopy path.
  const avgCop = ground ? A.s303FixedMin.threshold + fastShareAll * leo.open_sky_20deg.mean_wait_min + (1 - fastShareAll) * leo.under_canopy_45deg.mean_wait_min + qRoutine : Infinity;
  // S-3's part of detection-to-warning: priority message to the COP (p95, fast path) plus authorized alert to audible.
  // The agencies' evaluation and alert generation (F4-F5) sit between the two and are not S-3 time.
  const s3Chain = s303.open + s305;

  const responderMbps = 500 * A.responderKbps / 1000;
  const backhaulMbps = (opts.starlink ? n * A.starlinkMbpsPerSite : 0) + (A.leoKbpsPerSat / 1000) * (leo.open_sky_20deg.pct_time_in_contact / 100);

  // ----- availability (illustrative): space x rain x ground, with N database nodes failing over -----
  const groundAvail = nodesUp > 0 ? 1 - (1 - A.avail.node) ** nodesUp : 0;
  const avail = A.avail.space * A.avail.rain * groundAvail;

  // ----- cost, 15 years, $M: low / base / high -----
  const sc = D.cost.station.capex_items;
  const stLo = sc.reduce((a, x) => a + (x.range?.[0] ?? x.usd), 0) / sc.reduce((a, x) => a + x.usd, 0);
  const stHi = sc.reduce((a, x) => a + (x.range?.[1] ?? x.usd), 0) / sc.reduce((a, x) => a + x.usd, 0);
  const rivers = stationsAll.filter(s => s.type === 'river').length;
  const hydroDelta = opts.hydro ? (-rivers * yearData.hydro_river_station_15yr.saving_vs_solar_per_station) / 1e6 : 0;
  const stationBase = (last ? last.cum_cost_musd : 0) + hydroDelta;
  const receivers = D.sn.community_receivers[String(opts.year)].receivers;
  const lines = [
    { k: 'leo', name: `LEO IoT constellation (${opts.leoSats} sats)`, ...range3(lccLeo(opts.leoSats) * (1 + A.leo.replenish) + A.leo.opsMusdYr * A.life, A.leo.range) },
    opts.geo ? { k: 'geo', name: 'GEO broadcast payload', low: A.geo.range[0], base: A.geo.musd, high: A.geo.range[1] } : null,
    { k: 'stations', name: `Ranger stations (${opts.n})`, ...range3(stationBase, [stLo, stHi]) },
    opts.repeaters ? { k: 'repeaters', name: `Canopy repeaters (${opts.repeaters})`, low: opts.repeaters * A.repeater.range[0], base: opts.repeaters * A.repeater.musd15, high: opts.repeaters * A.repeater.range[1] } : null,
    { k: 'db', name: `Hub + ${k - 1} regional database${k - 1 === 1 ? '' : 's'}`, low: A.db.hubRange[0] + (k - 1) * A.db.nodeRange[0], base: A.db.hubMusd + (k - 1) * A.db.nodeMusd, high: A.db.hubRange[1] + (k - 1) * A.db.nodeRange[1] },
    { k: 'receivers', name: `Community receivers (${Math.round(receivers / 1000)}k)`, low: receivers * 10 / 1e6, base: receivers * 25 / 1e6, high: receivers * 25 * A.receiver.high / 1e6 },
    opts.raised ? { k: 'antennas', name: 'Raised antennas on fixed sensors', ...range3(A.raised.types.reduce((a, t) => a + counts[t], 0) * A.raised.usd / 1e6, [0.6, 2]) } : null,
    opts.starlink ? { k: 'backhaul', name: 'Commercial backhaul (Starlink)', ...range3((n + k) * (389 + 50 * 12 * A.life) / 1e6, [0.8, 1.5]) } : null,
  ].filter(Boolean);
  const total = ['low', 'base', 'high'].reduce((o, b) => ({ ...o, [b]: lines.reduce((a, l) => a + l[b], 0) }), {});
  const sensorsUsd = D.sn.types.reduce((a, t) => a + counts[t.id] * t.unit_usd * Math.ceil(A.life / t.life_years), 0) / 1e6;

  // ----- requirement checks: pass / near / fail, with the number behind each -----
  const cap = D.cost.budget.lcc_cap_usd / 1e6;
  const checks = [
    { id: 'S3-01', ok: sats >= 12 && ground, v: `${sats} LEO satellites cover the whole basin, under canopy included` },
    { id: 'S3-02', ok: terminals >= 10000 && bytesDay >= 10000 * 2000 && !saturated, near: terminals >= 10000 && util < 1.2, v: `${fmtN(terminals)} terminals, ${mb(bytesDay)}/day of ${mb(leoBytesDay)}/day capacity (${pct(util)} used)`, obj: terminals >= 100000 && leoBytesDay >= 100000 * 50000 },
    { id: 'S3-03', ok: within30 >= 0.95, near: within30 >= 0.85, v: `${pct(within30)} of priority messages within 30 min (p95: open sky or relayed ${minutes(s303.open)}, under canopy ${minutes(s303.canopy)})`, obj: within5 >= 0.99 },
    { id: 'S3-04', ok: A.terminalUsd <= 150 && A.terminalLifeYr >= 1, v: `$${A.terminalUsd} radio, ${A.terminalLifeYr}-yr life (assumption)`, obj: A.terminalUsd <= 50 && A.terminalLifeYr >= 3 },
    { id: 'S3-05', ok: s305 <= 10, v: geoUp ? `≈${s305} min to audible via GEO for every receiver in the footprint` : 'No GEO broadcast: $25 receivers have no path', obj: s305 <= 3 },
    { id: 'S3-06', ok: geoUp, v: geoUp ? 'District group codes (≤50,000 km²)' : 'No broadcast path to target', obj: false },
    { id: 'S3-07', ok: true, v: '$25 solar/crank receiver, fixed antenna', obj: false },
    { id: 'S3-08', ok: backhaulMbps >= responderMbps, near: backhaulMbps >= responderMbps / 2, v: `${responderMbps.toFixed(1)} Mbps needed; ${backhaulMbps >= 100 ? fmtN(Math.round(backhaulMbps)) : backhaulMbps.toFixed(2)} Mbps available${opts.starlink ? '' : ' (no station backhaul)'}` },
    { id: 'S3-09', ok: s309 <= 360, v: `worst case ${minutes(s309)} to a canopy terminal`, obj: s309 <= 15 },
    { id: 'S3-10', ok: avail >= 0.995, near: avail >= 0.99, v: `${(avail * 100).toFixed(2)}% (illustrative: ${nodesUp} database node${nodesUp === 1 ? '' : 's'} up)`, obj: avail >= 0.999 },
    { id: 'LCC', ok: total.base <= cap, near: total.low <= cap, v: `$${Math.round(total.low)}–${Math.round(total.high)}M (base $${Math.round(total.base)}M) vs $${cap}M cap` },
  ].map(c => ({ ...c, state: c.ok ? 'pass' : c.near ? 'near' : 'fail' }));

  // ----- what the viewer weighs: time, data, reach, cost (the numbers on the map and in "How it adds up") -----
  const peopleReached = (popPct / 100) * run.basin_pop;
  const stationLine = lines.find(l => l.k === 'stations');
  const metrics = {
    p95Fast: s303.open, p95Canopy: s303.canopy, within30, avgCop, alertMin: s305, cmdWorst: s309, s3Chain, qPrio, qRoutine,
    bytesDay, capacity: leoBytesDay, util, saturated, byType,
    popPct, peopleReached, fastShare, fastShareAll,
    costBase: total.base, costLow: total.low, costHigh: total.high,
    costPerPerson: stationLine && peopleReached ? (stationLine.base * 1e6) / peopleReached : null,
    costPerTerminalYr: terminals ? (total.base * 1e6) / terminals / A.life : null,
  };

  return {
    metrics,
    allStations: stationsAll, lostStation: lost ? stationsAll.indexOf(lost) : -1, hubDown, geoUp, canopyShare, priority: A.priority,
    stations, repeaters, reach, canopyPoints: points, popPct, terminals, prioCount, fastShare, within30, s303, s305, s309, bytesDay, leoBytesDay,
    responderMbps, backhaulMbps, avail, lines, total, sensorsUsd, receivers, checks, leo: { sats, row: leo },
    counts: { stations: n, repeaters: repeaters.length, dbNodes: k, satellites: sats, geo: opts.geo ? 1 : 0, receivers, terminals },
  };
}

// Sweet spot of the station curve: the knee (where the curve bends) and the range around it: no less than 90% of
// the knee's coverage, and each extra station still buys at least two thirds of the coverage per dollar it buys at the knee.
export function sweetSpot(run, window = 10) {
  const s = run.stations, knee = run.sweet_spot_knee;
  const marginal = i => { // percentage points per $M over a +/- window
    const a = s[Math.max(0, i - window)], b = s[Math.min(s.length - 1, i + window)];
    return (b.cum_pct - a.cum_pct) / Math.max(1e-6, b.cum_cost_musd - a.cum_cost_musd);
  };
  const mk = marginal(knee - 1);
  let hi = knee; while (hi < s.length && marginal(hi) >= (2 * mk) / 3) hi++;
  let lo = knee; while (lo > 1 && s[lo - 2].cum_pct >= 0.9 * s[knee - 1].cum_pct) lo--;
  return { knee, lo, hi, kneePct: s[knee - 1].cum_pct, kneeCost: s[knee - 1].cum_cost_musd, marginalAtKnee: mk };
}

const pct = x => `${Math.round(x * 100)}%`;
const fmtN = x => Number(x).toLocaleString('en-US');
const mb = b => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const minutes = m => (Number.isFinite(m) ? (m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`) : 'no path');
